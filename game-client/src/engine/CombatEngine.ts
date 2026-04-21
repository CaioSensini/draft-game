/**
 * engine/CombatEngine.ts — combat orchestrator for the domain-entity system.
 *
 * CombatEngine drives the ACTION phase of a Battle:
 *   1. Players/bots register action selections (1 attack + 1 defense per character).
 *   2. `resolveActions()` executes all selections in canonical role order.
 *   3. `tickStatusEffects()` advances DoT/HoT effects at round end.
 *   4. Events are emitted to subscribers throughout so renderers stay in sync.
 *
 * Damage formula (identical to original game design):
 *   gross = power × (casterATK / 50) × isolationBonus?
 *   mit   = DEF/200 + warriorGuard? + wallTouchBonus  (capped at 90 %)
 *   final = max(1, round(gross × (1 − mit)))
 *
 * Works exclusively with domain entities (Character, Team, Skill, Battle).
 * No Phaser, no DOM, no BattleState maps.
 */

import { Battle } from '../domain/Battle'
import type { VictoryResult } from '../domain/Battle'
import { Character } from '../domain/Character'
import { Skill } from '../domain/Skill'
import type { CharacterRole, CharacterSide } from '../domain/Character'
import {
  ReflectPercentEffect, RegenEffect, PositionalDrEffect,
  DefReductionEffect, MovReductionEffect, DelayedDamageEffect,
  MarkEffect, DefBoostEffect, HealReductionEffect, GuardedByEffect,
} from '../domain/Effect'
import type { PositionalDrShape } from '../domain/Effect'
import { EventBus } from './EventBus'
import { TurnManager } from './TurnManager'
import type { SkipReason } from './TurnManager'
import { EffectResolver, createDefaultResolver } from './EffectResolver'
import type { EffectContext, EffectResult } from './EffectResolver'
import { TargetingSystem } from './TargetingSystem'
import { PassiveSystem, createDefaultPassiveSystem } from './PassiveSystem'
import type { PassiveDefinition } from '../domain/Passive'
import { CombatRuleSystem, createDefaultRuleSystem } from './CombatRuleSystem'
import type { CombatRuleDefinition } from '../domain/CombatRule'
import type { EngineEvent, TeamSide } from './types'
import { Ok, Err, EventType } from './types'
import type { Result } from './types'
import { Grid, Position } from '../domain/Grid'
import type { Direction, GridSide } from '../domain/Grid'
import { computeDamage } from '../domain/DamageFormula'

// ── Supporting types ──────────────────────────────────────────────────────────

/**
 * Where a skill's attack will land.
 * Filled in by the player or bot before resolution.
 */
export type TargetSpec =
  | { kind: 'character';  characterId: string }
  | { kind: 'area';       col: number; row: number }
  | { kind: 'self' }
  | { kind: 'lowest_ally' }
  | { kind: 'all_allies' }

/** A character's full selection for one action phase. */
export interface ActionSelection {
  attackSkill:  Skill | null
  defenseSkill: Skill | null
  target:       TargetSpec | null
  /** Second attack skill — only used when character has doubleAttackNextTurn active. */
  secondAttackSkill?: Skill | null
  /** Target for the second attack skill. */
  secondTarget?:      TargetSpec | null
  /**
   * v3 — destination tile for the attack skill's pre-activation movement,
   * if the skill declares `preMovement`. Executed before the skill effect
   * fires. Null when the skill has no preMovement spec or the caster chose
   * to skip relocating.
   */
  preMoveAttack?:  { col: number; row: number } | null
  /** Same as `preMoveAttack` but for the defense skill. */
  preMoveDefense?: { col: number; row: number } | null
}

/** Accumulated stats for one battle. */
export interface BattleStat {
  damageDealt:    number
  damageReceived: number
  healsGiven:     number
  kills:          number
}

// ── Interleaved role execution order ──────────────────────────────────────────

/**
 * Generate interleaved resolution order for one action phase.
 *
 * Even rounds (2, 4, ...): left starts first.
 * Odd rounds  (1, 3, ...): right starts first.
 *
 * The zigzag pattern alternates which team leads each role bracket:
 *   T1 King, T2 King, T2 Warrior, T1 Warrior,
 *   T1 Executor, T2 Executor, T2 Specialist, T1 Specialist
 *
 * Dead characters are omitted from the order.
 */
function getInterleavedOrder(
  round: number,
  leftChars: ReadonlyArray<Character>,
  rightChars: ReadonlyArray<Character>,
): Character[] {
  const findByRole = (chars: ReadonlyArray<Character>, role: CharacterRole) =>
    chars.find(c => c.role === role && c.alive)

  // Odd rounds: left starts (T1=left, T2=right). Even rounds: right starts.
  const t1 = round % 2 === 1 ? leftChars : rightChars
  const t2 = round % 2 === 1 ? rightChars : leftChars

  const order: (Character | undefined)[] = [
    findByRole(t1, 'king'),
    findByRole(t2, 'king'),
    findByRole(t2, 'warrior'),
    findByRole(t1, 'warrior'),
    findByRole(t1, 'executor'),
    findByRole(t2, 'executor'),
    findByRole(t2, 'specialist'),
    findByRole(t1, 'specialist'),
  ]

  return order.filter((c): c is Character => c !== undefined)
}

// ── CombatEngine ─────────────────────────────────────────────────────────────

export class CombatEngine {
  private readonly battle:      Battle
  private readonly bus:         EventBus
  private readonly selections:  Map<string, ActionSelection>
  private readonly battleStats: Map<string, BattleStat>

  /** Records every character death: characterId → { round, killedBy }. */
  private readonly deathLog: Map<string, { round: number; killedBy: string | null }> = new Map()

  /** Holds the VictoryResult once the battle ends. Null while still in progress. */
  private _victoryResult: VictoryResult | null = null

  /** Tracks per-character turn sequencing within an action phase. */
  private readonly _turn: TurnManager = new TurnManager()

  // ── Movement-phase state ──────────────────────────────────────────────────
  /**
   * Grid occupancy map — synced at battle start and at each movement phase.
   * Used to validate destination tiles (bounds, territory, occupancy, range).
   */
  private readonly _grid: Grid = new Grid()

  /**
   * Characters that have already moved during the current movement phase.
   * Cleared by resetMovementPhase() at the start of each new movement phase.
   */
  private readonly _movedThisPhase: Set<string> = new Set()

  /**
   * Dispatches effect-type strings to the appropriate handler.
   * Register new handlers here to extend the system without touching CombatEngine.
   */
  readonly resolver: EffectResolver

  /**
   * Resolves skill targeting: area hit computation, range validation,
   * valid-target queries, and push/collision simulation.
   */
  private readonly _targeting: TargetingSystem

  /**
   * Handles passive ability logic: ATK bonuses, mitigation bonuses,
   * and post-damage side effects. Loaded from passiveCatalog at startup.
   */
  readonly passive: PassiveSystem

  /**
   * Evaluates global battlefield rules (terrain, survival, asymmetric bonuses).
   * Loaded from globalRules at startup. Queried on every damage computation
   * and at the start of each round.
   */
  readonly rules: CombatRuleSystem

  // ── Tuning ─────────────────────────────────────────────────────────────────
  // ── Damage formula constants ──────────────────────────────────────────────
  static readonly ATK_DIVISOR    = 50
  static readonly MAX_MITIGATION = 0.90
  // Note: role-specific bonuses   → data/passiveCatalog.ts  (PassiveSystem)
  //       terrain / global bonuses → data/globalRules.ts     (CombatRuleSystem)

  constructor(
    battle:    Battle,
    resolver?: EffectResolver,
    passives?: ReadonlyArray<PassiveDefinition>,
    globalRules?: ReadonlyArray<CombatRuleDefinition>,
  ) {
    this.battle      = battle
    this.bus         = new EventBus()
    this.selections  = new Map()
    this.battleStats = new Map()
    this.resolver    = resolver ?? createDefaultResolver()
    this._targeting  = new TargetingSystem()
    this.passive     = createDefaultPassiveSystem(passives ?? [])
    this.rules       = createDefaultRuleSystem(globalRules ?? [])

    // Initialise stat counters for every character
    for (const char of battle.allCharacters) {
      this.battleStats.set(char.id, {
        damageDealt: 0, damageReceived: 0, healsGiven: 0, kills: 0,
      })
    }
  }

  // ── Event subscription ────────────────────────────────────────────────────

  on(handler: (event: EngineEvent) => void): () => void {
    return this.bus.on(handler)
  }

  onType<T extends EngineEvent['type']>(
    type: T,
    handler: (event: Extract<EngineEvent, { type: T }>) => void,
  ): () => void {
    return this.bus.onType(type, handler)
  }

  // ── Action selection ──────────────────────────────────────────────────────

  /**
   * Record an attack skill + optional target for `characterId`.
   *
   * Validates:
   *   - Character is alive and not stunned
   *   - Skill is an attack skill and is currently in the character's hand
   *   - If targetType = 'single', target must exist and be on the enemy side
   */
  selectAttack(
    characterId: string,
    skill: Skill,
    target: TargetSpec,
  ): Result<void> {
    const char = this.battle.getCharacter(characterId)
    if (!char)          return Err(`Character '${characterId}' not found`)
    if (!char.alive)    return Err(`${char.name} is dead`)
    if (char.isStunned) return Err(`${char.name} is stunned`)
    if (this.battle.phase !== 'action')
      return Err('Skill selection requires the action phase')
    // Interleaved turns: allow any character registered in the turn queue
    if (!this._turn.isRegistered(characterId) && char.side !== this.battle.currentSide)
      return Err(`Not ${char.side} side's turn`)

    if (skill.category !== 'attack') return Err(`'${skill.name}' is not an attack skill`)

    const deck = this.battle.teamOf(char.side).attackDeck(characterId)
    if (deck && !deck.inHand(skill.id)) return Err(`'${skill.name}' is not in ${char.name}'s current hand`)

    if (char.isSkillOnCooldown(skill.id, this.battle.round))
      return Err(`'${skill.name}' is on cooldown (${char.skillCooldownRemaining(skill.id, this.battle.round)} turn(s) remaining)`)

    // Validate single-target
    if (skill.targetType === 'single') {
      if (target.kind !== 'character') return Err('Single-target skill requires a character target')
      const targetChar = this.battle.getCharacter(target.characterId)
      if (!targetChar?.alive)           return Err('Target is not a living character')
      if (!skill.isValidTargetSide(char.side, targetChar.side))
        return Err('Invalid target: wrong side')
      if (!this._targeting.isInRange(char, Position.of(targetChar.col, targetChar.row), skill.range))
        return Err(`Target out of range (distance > ${skill.range})`)
    }

    // Validate area-target
    if (skill.targetType === 'area') {
      if (target.kind !== 'area') return Err('Area skill requires a tile target')
      if (!this._targeting.isInRange(char, Position.of(target.col, target.row), skill.range))
        return Err(`Target tile out of range (distance > ${skill.range})`)
    }

    const sel = this._getOrCreateSelection(characterId)
    sel.attackSkill = skill
    sel.target      = target

    this.emit({ type: EventType.CARD_SELECTED, unitId: characterId, cardId: skill.id, category: 'attack' })
    if (target.kind === 'character') {
      this.emit({ type: EventType.TARGET_SELECTED, unitId: characterId, targetId: target.characterId })
    } else if (target.kind === 'area') {
      this.emit({ type: EventType.AREA_TARGET_SET, unitId: characterId, col: target.col, row: target.row })
    }
    return Ok(undefined)
  }

  /**
   * Record a defense skill for `characterId`.
   *
   * Validates:
   *   - Character is alive
   *   - Skill is a defense skill and is in the character's hand
   */
  selectDefense(characterId: string, skill: Skill): Result<void> {
    const char = this.battle.getCharacter(characterId)
    if (!char)       return Err(`Character '${characterId}' not found`)
    if (!char.alive) return Err(`${char.name} is dead`)
    if (this.battle.phase !== 'action')
      return Err('Skill selection requires the action phase')
    // Interleaved turns: allow any character registered in the turn queue
    if (!this._turn.isRegistered(characterId) && char.side !== this.battle.currentSide)
      return Err(`Not ${char.side} side's turn`)

    if (skill.category !== 'defense') return Err(`'${skill.name}' is not a defense skill`)

    const deck = this.battle.teamOf(char.side).defenseDeck(characterId)
    if (deck && !deck.inHand(skill.id)) return Err(`'${skill.name}' is not in ${char.name}'s current hand`)

    if (char.isSkillOnCooldown(skill.id, this.battle.round))
      return Err(`'${skill.name}' is on cooldown (${char.skillCooldownRemaining(skill.id, this.battle.round)} turn(s) remaining)`)

    const sel = this._getOrCreateSelection(characterId)
    sel.defenseSkill = skill

    this.emit({ type: EventType.CARD_SELECTED, unitId: characterId, cardId: skill.id, category: 'defense' })
    return Ok(undefined)
  }

  /**
   * Record a second attack skill for `characterId` (double_attack mode).
   *
   * Only valid when the character has `doubleAttackNextTurn` active.
   * Validation mirrors `selectAttack`.
   */
  selectSecondAttack(
    characterId: string,
    skill: Skill,
    target: TargetSpec,
  ): Result<void> {
    const char = this.battle.getCharacter(characterId)
    if (!char)          return Err(`Character '${characterId}' not found`)
    if (!char.alive)    return Err(`${char.name} is dead`)
    if (!char.doubleAttackNextTurn)
      return Err(`${char.name} is not in double-attack mode`)
    if (this.battle.phase !== 'action')
      return Err('Skill selection requires the action phase')
    if (char.side !== this.battle.currentSide)
      return Err(`Not ${char.side} side's turn`)
    if (skill.category !== 'attack') return Err(`'${skill.name}' is not an attack skill`)

    const deck = this.battle.teamOf(char.side).attackDeck(characterId)
    if (deck && !deck.inHand(skill.id)) return Err(`'${skill.name}' is not in ${char.name}'s current hand`)

    if (char.isSkillOnCooldown(skill.id, this.battle.round))
      return Err(`'${skill.name}' is on cooldown (${char.skillCooldownRemaining(skill.id, this.battle.round)} turn(s) remaining)`)

    const sel = this._getOrCreateSelection(characterId)
    sel.secondAttackSkill = skill
    sel.secondTarget      = target

    this.emit({ type: EventType.CARD_SELECTED, unitId: characterId, cardId: skill.id, category: 'attack' })
    return Ok(undefined)
  }

  /**
   * Record a pre-activation movement destination for a character's attack
   * or defense skill. The skill must declare `preMovement` and the
   * destination must be a valid tile (in-bounds, walkable-if-required,
   * not occupied, within `maxTiles`). Honours `ignoresObstacles` and
   * `restrictToOwnSide` from the skill's `PreMovementSpec`.
   */
  selectPreMovement(
    characterId: string,
    category: 'attack' | 'defense',
    col: number, row: number,
  ): Result<void> {
    const char = this.battle.getCharacter(characterId)
    if (!char)       return Err(`Character '${characterId}' not found`)
    if (!char.alive) return Err(`${char.name} is dead`)

    const sel = this.selections.get(characterId)
    if (!sel) return Err('No action selected yet')

    const skill = category === 'attack' ? sel.attackSkill : sel.defenseSkill
    if (!skill) return Err(`No ${category} skill selected`)
    if (!skill.preMovement) return Err(`'${skill.name}' has no pre-movement`)

    const res = this._validatePreMovement(char, skill.preMovement, col, row)
    if (!res.ok) return res

    if (category === 'attack') sel.preMoveAttack  = { col, row }
    else                       sel.preMoveDefense = { col, row }

    this.emit({
      type: EventType.AREA_TARGET_SET, unitId: characterId, col, row,
    })
    return Ok(undefined)
  }

  /**
   * Validate a pre-movement request: within maxTiles (Chebyshev), not
   * out-of-bounds, tile not occupied, respects obstacles/side flags.
   */
  private _validatePreMovement(
    char: Character,
    spec: NonNullable<Skill['preMovement']>,
    col: number, row: number,
  ): Result<void> {
    if (!this._grid.isInBounds(col, row))        return Err('Destination OOB')
    const dc = Math.abs(col - char.col)
    const dr = Math.abs(row - char.row)
    const chebyshev = Math.max(dc, dr)
    if (chebyshev === 0)              return Err('Destination is current tile')
    if (chebyshev > spec.maxTiles)    return Err(`Destination exceeds maxTiles (${spec.maxTiles})`)

    // Obstacles: if not ignored, tile must be walkable (Grid.isWalkable already
    // covers walls + occupants + obstacles).
    if (!spec.ignoresObstacles) {
      if (!this._grid.isWalkable(col, row))      return Err('Destination blocked')
    } else {
      // Even with ignoresObstacles, the destination itself cannot be occupied
      // by a different character.
      const occ = this._grid.occupantAt(col, row)
      if (occ && occ !== char.id)                return Err('Destination occupied')
      // In-bounds already checked; walls considered OK for teleport.
    }

    if (spec.restrictToOwnSide) {
      const ownSide: GridSide = char.side
      const allowed = this._grid.sideOf(col)
      if (allowed !== ownSide)                   return Err('Destination outside own side')
    }
    return Ok(undefined)
  }

  /**
   * Execute the queued pre-movement for `char`/`category` if any. Applies
   * the consumesNextMovement side-effect. Returns true when the character
   * moved, false when no movement was queued. Never throws — validation
   * was performed at selection time.
   */
  private _applyPreMovement(char: Character, category: 'attack' | 'defense'): boolean {
    const sel = this.selections.get(char.id)
    if (!sel) return false
    const dest = category === 'attack' ? sel.preMoveAttack : sel.preMoveDefense
    if (!dest) return false
    const skill = category === 'attack' ? sel.attackSkill : sel.defenseSkill
    if (!skill?.preMovement) return false

    const fromCol = char.col
    const fromRow = char.row
    const res = this._grid.moveCharacter(char.id, dest.col, dest.row)
    if (!res.ok) return false
    char.moveTo(dest.col, dest.row)

    if (skill.preMovement.consumesNextMovement) {
      char.setMovementConsumedNextTurn(true)
    }

    this.emit({
      type:    EventType.UNIT_PUSHED,
      unitId:  char.id,
      fromCol, fromRow,
      toCol:   dest.col, toRow: dest.row,
      force:   Math.max(Math.abs(dest.col - fromCol), Math.abs(dest.row - fromRow)),
      distanceMoved: Math.max(Math.abs(dest.col - fromCol), Math.abs(dest.row - fromRow)),
      blocked: false,
      collidedWith: null,
    })

    // v3 §6.4 — pre-skill movement also triggers traps on arrival.
    this._checkTrapTrigger(char)
    return true
  }

  /** Remove all selections for a character (used on phase reset or cancel). */
  clearSelection(characterId: string): void {
    this.selections.delete(characterId)
  }

  /** Current selection for a character, or null. */
  getSelection(characterId: string): ActionSelection | null {
    return this.selections.get(characterId) ?? null
  }

  /**
   * True if character has selected all required skills for the turn.
   * In double_attack mode: requires two attack skills (no defense).
   * In normal mode: requires one attack + one defense.
   */
  hasFullSelection(characterId: string): boolean {
    const sel = this.selections.get(characterId)
    if (!sel || sel.attackSkill === null) return false

    const char = this.battle.getCharacter(characterId)
    if (char?.doubleAttackNextTurn) {
      // Double-attack mode: need 2 attack skills
      return sel.secondAttackSkill !== null && sel.secondAttackSkill !== undefined
    }
    return sel.defenseSkill !== null
  }

  /**
   * True if every living character registered in the current turn queue has
   * a full selection. In interleaved mode this covers both sides.
   */
  allCurrentSideReady(): boolean {
    return this.battle.livingCharacters.every((c) => this.hasFullSelection(c.id))
  }

  // ── Movement phase ────────────────────────────────────────────────────────

  /**
   * Synchronise the internal Grid with the current positions of all characters.
   * Must be called:
   *   1. Once by GameController.startBattle() before the first movement phase.
   *   2. Again at the start of each subsequent movement phase (positions may have
   *      changed due to pushes or other effects during the action phase).
   */
  syncGrid(characters: ReadonlyArray<Character>): void {
    for (const char of characters) {
      if (char.alive) this._grid.place(char.id, char.col, char.row)
      else            this._grid.remove(char.id)
    }
  }

  /**
   * Reset movement tracking for a new movement phase.
   * Call this at the beginning of every movement phase before players act.
   */
  resetMovementPhase(): void {
    this._movedThisPhase.clear()
  }

  /** True if `characterId` has already moved during the current movement phase. */
  hasMoved(characterId: string): boolean {
    return this._movedThisPhase.has(characterId)
  }

  /**
   * All tile positions the character can legally move to this phase.
   *   - Empty when dead, already moved, or not the movement phase.
   *   - All roles use BFS-based reachable tiles within their mobility range.
   */
  getValidMoves(characterId: string): Position[] {
    const char = this.battle.getCharacter(characterId)
    if (!char?.alive)                        return []
    if (char.isSnared)                       return []
    if (this._movedThisPhase.has(characterId)) return []

    const side = char.side as GridSide
    return this._grid.getReachableTiles(characterId, char.mobility, side)
  }

  /**
   * Move `characterId` to (toCol, toRow).
   *
   * Validates (in order):
   *   1. Character exists and is alive
   *   2. Current phase is 'movement'
   *   3. Character belongs to the active side
   *   4. Character has not already moved this phase
   *   5. Destination bounds, territory, occupancy, and range (via Grid)
   *
   * On success: updates the character's domain position, updates Grid occupancy,
   * records the move, and emits CHARACTER_MOVED.
   */
  moveCharacter(characterId: string, toCol: number, toRow: number): Result<void> {
    const char = this.battle.getCharacter(characterId)
    if (!char)       return Err(`Character '${characterId}' not found`)
    if (!char.alive) return Err(`${char.name} is dead`)
    if (char.isSnared) return Err(`${char.name} is snared and cannot move`)

    if (this.battle.phase !== 'movement')
      return Err('Not the movement phase')
    if (char.side !== this.battle.currentSide)
      return Err(`Not ${char.side} side's turn`)
    if (this._movedThisPhase.has(characterId))
      return Err(`${char.name} already moved this phase`)

    // Validate move against BFS-reachable tiles (respects walls and occupied tiles)
    const reachable = this._grid.getReachableTiles(characterId, char.mobility, char.side as GridSide)
    const isReachable = reachable.some((p) => p.col === toCol && p.row === toRow)
    if (!isReachable) return Err(`(${toCol},${toRow}) is not reachable within mobility ${char.mobility}`)

    const fromCol = char.col
    const fromRow = char.row
    char.moveTo(toCol, toRow)
    this._grid.moveCharacter(characterId, toCol, toRow)
    this._movedThisPhase.add(characterId)

    this.emit({ type: EventType.CHARACTER_MOVED, unitId: characterId, fromCol, fromRow, toCol, toRow })
    return Ok(undefined)
  }

  /**
   * Validate that `characterId` is allowed to act during the current action phase.
   * Used by GameController.selectCharacter() to gate the UI focus flow.
   *
   * Returns Err when:
   *   - Current phase is not 'action'
   *   - Character not found, is dead, or does not belong to the active side
   */
  canActThisTurn(characterId: string): Result<void> {
    if (this.battle.phase !== 'action')
      return Err('Not the action phase')
    const char = this.battle.getCharacter(characterId)
    if (!char)       return Err(`Character '${characterId}' not found`)
    if (!char.alive) return Err(`${char.name} is dead`)
    // Interleaved turns: allow any character registered in the turn queue
    if (!this._turn.isRegistered(characterId) && char.side !== this.battle.currentSide)
      return Err(`Not ${char.side} side's turn`)
    return Ok(undefined)
  }

  // ── Sequential turn control ───────────────────────────────────────────────

  /**
   * Start per-character sequencing for the current side's action phase.
   * Call this once before the per-actor selection + commit loop.
   * Emits `turn_started` for the first actor.
   */
  beginActionPhase(): void {
    // v3 §2.4: reset the per-turn heal counter on every living character so
    // the new phase can track "heals applied this turn" correctly.
    for (const char of this.battle.livingCharacters) {
      char.resetHealCounter()
    }

    // v3 §2.3 — DoT resolution order: DoTs resolve at the start of each
    // action phase, BEFORE any defense skill heals. This ensures a unit at
    // 5 HP with bleed 10 dies from the tick before a 20 HP heal can save it.
    // Previously tickStatusEffects was called at end of action phase, which
    // let this-turn heals undo last-turn's DoT pressure.
    this.tickStatusEffects()
    if (this.battle.isOver) return

    const leftChars  = this.battle.teamOf('left').all
    const rightChars = this.battle.teamOf('right').all
    const ordered    = getInterleavedOrder(this.battle.round, leftChars, rightChars)
    this._turn.beginPhase(ordered.map((c) => c.id))
    this._emitNextTurnStarted()
  }

  /** The character whose turn is currently active. Null when phase is complete. */
  getCurrentActor(): Character | null {
    const id = this._turn.currentActorId
    return id ? (this.battle.getCharacter(id) ?? null) : null
  }

  /** True when all actors in the current phase have committed or been skipped. */
  get isPhaseComplete(): boolean {
    return this._turn.isPhaseComplete
  }

  /**
   * Commit the current actor's turn: apply their selections (defense + attack),
   * rotate used cards, and advance the turn cursor.
   *
   * Auto-skips dead actors ('dead') or stunned actors ('stunned').
   * If no selection was registered, skips with 'no_selection'.
   *
   * Emits `turn_committed` or `turn_skipped`.
   * Emits `turn_started` for the next actor (or `actions_resolved` if done).
   * No-op when `isPhaseComplete`.
   */
  commitCurrentTurn(): void {
    const snap = this._turn.currentSnapshot
    if (!snap) return
    const { characterId } = snap

    const char = this.battle.getCharacter(characterId)
    // Use the character's own side — in interleaved mode actors from both sides
    // take turns within the same action phase.
    const side = char?.side ?? this.battle.currentSide

    if (!char || !char.alive) {
      this._turn.skip('dead')
      this.emit({ type: EventType.TURN_SKIPPED, unitId: characterId, reason: 'dead' })
      this._emitPhaseAdvance(side)
      return
    }

    if (char.isStunned) {
      char.tickEffects()
      this._turn.skip('stunned')
      this.emit({ type: EventType.TURN_SKIPPED, unitId: characterId, reason: 'stunned' })
      this._emitPhaseAdvance(side)
      return
    }

    const sel = this.selections.get(char.id)
    if (!sel || (!sel.attackSkill && !sel.defenseSkill)) {
      this._turn.skip('no_selection')
      this.emit({ type: EventType.TURN_SKIPPED, unitId: characterId, reason: 'no_selection' })
      this._emitPhaseAdvance(side)
      return
    }

    // ── DEFERRED: store selection, do NOT execute skills yet ──
    // Selection remains in this.selections map for batch resolution
    // after ALL characters have committed/skipped.

    this._turn.commit()
    this.emit({ type: EventType.TURN_COMMITTED, unitId: characterId, timeUsedMs: snap.timeUsedMs })
    this._emitPhaseAdvance(side)
  }

  /**
   * Explicitly skip the current actor (e.g. the player let the timer run out).
   * Emits `turn_skipped` and then `turn_started` / `actions_resolved`.
   */
  skipCurrentTurn(reason: SkipReason = 'no_selection'): void {
    const id = this._turn.currentActorId
    if (!id) return
    // Use the character's own side — in interleaved mode the current battle side
    // may not match the character being skipped.
    const char = this.battle.getCharacter(id)
    const side = char?.side ?? this.battle.currentSide
    this._turn.skip(reason)
    this.emit({ type: EventType.TURN_SKIPPED, unitId: id, reason })
    this._emitPhaseAdvance(side)
  }

  // ── Valid target queries ──────────────────────────────────────────────────

  /**
   * All valid unit targets for `characterId` using `skill`.
   * For area skills, returns an empty array — use `getValidAreaPositions` instead.
   * Respects skill.range (0 = unrestricted).
   */
  getValidTargets(characterId: string, skill: Skill): Character[] {
    const char = this.battle.getCharacter(characterId)
    if (!char?.alive || char.isStunned) return []

    switch (skill.targetType) {
      case 'single':
        return this._targeting.getValidUnitTargets(skill, char, this.battle)
      case 'lowest_ally':
        return [char, ...this.battle.alliesOf(char)] as Character[]
      case 'all_allies':
        return [char, ...this.battle.alliesOf(char)] as Character[]
      case 'self':
        return [char]
      case 'area':
        return []   // Area targets are tiles — use getValidAreaPositions()
    }
  }

  /**
   * All tiles that are valid aim-points for an area skill from `characterId`.
   * Returns an empty array for non-area skills.
   */
  getValidAreaPositions(characterId: string, skill: Skill): import('../domain/Grid').Position[] {
    if (skill.targetType !== 'area') return []
    const char = this.battle.getCharacter(characterId)
    if (!char?.alive || char.isStunned) return []
    return this._targeting.getValidAreaPositions(skill, char)
  }

  /**
   * All tiles that would be hit if `skill` is aimed at the given tile.
   * Useful for rendering the area-preview overlay.
   */
  previewArea(skill: Skill, centerCol: number, centerRow: number): import('../domain/Grid').Position[] {
    return this._targeting.previewArea(skill, Position.of(centerCol, centerRow))
  }

  // ── Resolution ────────────────────────────────────────────────────────────

  /**
   * Execute all pending action selections for the current side in role order.
   *
   * For each character (king → warrior → executor → specialist):
   *   1. Apply defense skill to self
   *   2. Apply attack skill to target(s)
   *   3. Rotate used cards to back of their queues
   *
   * Emits events for every combat outcome.
   * Clears selections after resolution.
   */
  resolveActions(): void {
    // Use interleaved order: both sides' characters resolve together
    const leftChars  = this.battle.teamOf('left').all
    const rightChars = this.battle.teamOf('right').all
    const orderedChars = getInterleavedOrder(this.battle.round, leftChars, rightChars)

    for (const char of orderedChars) {
      // Halt the entire resolution the moment a king falls —
      // remaining characters do not get to act.
      if (this.battle.isOver) break

      if (!char.alive) continue

      // Stun: skip action, decrement tick
      if (char.isStunned) {
        char.tickEffects()   // decrements stun tick
        continue
      }

      const sel = this.selections.get(char.id)
      if (!sel) continue

      // Use the character's own side for attack resolution
      const charSide = char.side

      // ── Double Attack: use 2 attacks, skip defense ──
      if (char.doubleAttackNextTurn) {
        char.setDoubleAttackNextTurn(false)
        this._applyAttackSkill(char, sel.attackSkill, sel.target, charSide)
        if (this.battle.isOver) break
        const secondSkill  = sel.secondAttackSkill ?? sel.defenseSkill
        const secondTarget = sel.secondTarget      ?? sel.target
        if (secondSkill && secondSkill.category === 'attack') {
          this._applyAttackSkill(char, secondSkill, secondTarget, charSide)
        }
        if (this.battle.isOver) break
      } else {
        // ── Normal flow: 1 defense + 1 attack ──
        if (char.isDefenseSilenced) {
          this.emit({ type: EventType.DEFENSE_SILENCED, unitId: char.id, sourceId: '' })
        } else {
          this._applyDefenseSkill(char, sel.defenseSkill)
        }
        if (this.battle.isOver) break

        this._applyAttackSkill(char, sel.attackSkill, sel.target, charSide)
        if (this.battle.isOver) break
      }

      this._rotateUsedCards(char, sel)
    }

    this.selections.clear()
    this.emit({ type: EventType.ACTIONS_RESOLVED, side: this.battle.currentSide as TeamSide })
  }

  // ── Deferred batch resolution ──────────────────────────────────────────────

  /**
   * Prepare batch resolution: emit RESOLUTION_STARTED and build the queue.
   * The scene calls `resolveNextDeferred()` with delays between each character.
   */
  private _resolutionQueue: Character[] = []
  private _resolutionSide: CharacterSide = 'left'

  private _resolveAllDeferred(side: CharacterSide): void {
    this._resolutionSide = side
    this.emit({ type: EventType.RESOLUTION_STARTED, side: side as TeamSide })

    const leftChars  = this.battle.teamOf('left').all
    const rightChars = this.battle.teamOf('right').all
    this._resolutionQueue = getInterleavedOrder(this.battle.round, leftChars, rightChars)
  }

  /** Tracks whether we're mid-character (attack done, defense pending). */
  private _resolvePendingDefense: { char: Character; sel: ActionSelection } | null = null

  /**
   * Resolve the next step in the deferred queue.
   * Returns: 'attack' = attack just resolved (call again for defense),
   *          'defense' = defense just resolved (character done),
   *          'done' = no more characters, ACTIONS_RESOLVED emitted.
   * The scene calls this with delays between each step to stagger animations.
   */
  resolveNextDeferred(): 'attack' | 'defense' | 'done' {
    // If there's a pending defense from the previous call, resolve it now
    if (this._resolvePendingDefense) {
      const { char, sel } = this._resolvePendingDefense
      this._resolvePendingDefense = null

      if (char.alive && !this.battle.isOver) {
        if (char.isDefenseSilenced) {
          this.emit({ type: EventType.DEFENSE_SILENCED, unitId: char.id, sourceId: '' })
        } else {
          this._applyDefenseSkill(char, sel.defenseSkill)
        }
      }
      if (!this.battle.isOver) {
        this._rotateUsedCards(char, sel)
      }

      // Check if more characters remain
      if (this._resolutionQueue.length > 0 && !this.battle.isOver) {
        return 'defense'
      }
      // Finalize
      this.selections.clear()
      this._resolutionQueue = []
      if (!this.battle.isOver) {
        this.emit({ type: EventType.ACTIONS_RESOLVED, side: this._resolutionSide as TeamSide })
      }
      return 'done'
    }

    // Process next character in the queue
    while (this._resolutionQueue.length > 0) {
      if (this.battle.isOver) break

      const char = this._resolutionQueue.shift()!
      if (!char.alive) continue

      if (char.isStunned) {
        char.tickEffects()
        continue
      }

      const sel = this.selections.get(char.id)
      if (!sel) continue

      const charSide = char.side

      if (char.doubleAttackNextTurn) {
        // Double attack: both attacks resolve together, no defense
        char.setDoubleAttackNextTurn(false)
        this._applyAttackSkill(char, sel.attackSkill, sel.target, charSide)
        if (!this.battle.isOver) {
          const secondSkill  = sel.secondAttackSkill ?? sel.defenseSkill
          const secondTarget = sel.secondTarget      ?? sel.target
          if (secondSkill && secondSkill.category === 'attack') {
            this._applyAttackSkill(char, secondSkill, secondTarget, charSide)
          }
        }
        if (!this.battle.isOver) this._rotateUsedCards(char, sel)
        return this._resolutionQueue.length > 0 && !this.battle.isOver ? 'attack' : 'done'
      }

      // Normal flow: resolve attack now, save defense for next call
      this._applyAttackSkill(char, sel.attackSkill, sel.target, charSide)

      if (!this.battle.isOver && sel.defenseSkill) {
        // Store defense for next call
        this._resolvePendingDefense = { char, sel }
        return 'attack'
      }

      // No defense skill — character done
      if (!this.battle.isOver) this._rotateUsedCards(char, sel)
      if (this._resolutionQueue.length > 0 && !this.battle.isOver) return 'attack'

      // Last character, no defense
      this.selections.clear()
      this._resolutionQueue = []
      if (!this.battle.isOver) {
        this.emit({ type: EventType.ACTIONS_RESOLVED, side: this._resolutionSide as TeamSide })
      }
      return 'done'
    }

    // Queue exhausted or battle over — finalize
    this.selections.clear()
    this._resolutionQueue = []
    if (!this.battle.isOver) {
      this.emit({ type: EventType.ACTIONS_RESOLVED, side: this._resolutionSide as TeamSide })
    }
    return 'done'
  }

  // ── Status effect ticks ───────────────────────────────────────────────────

  /**
   * Evaluate global combat rules at the start of a new round and emit
   * `combat_rule_active` events for each rule currently in effect.
   *
   * Call this once per round, just after `round_started` is emitted.
   * The renderer uses these events to update battlefield-condition indicators.
   */
  applyRoundStartRules(): void {
    for (const e of this.rules.onRoundStart(this.battle)) this.emit(e)
  }

  /**
   * Advance all ticking effects (bleed, regen, stun cooldown) for every
   * living character. Called by the turn manager at end of each round.
   */
  tickStatusEffects(): void {
    // Snapshot living characters before ticking — the list may change mid-loop
    const living = [...this.battle.livingCharacters]

    // v3 §2.8: Overtime applies to DoT too. Compute the same scaling factor
    // used by computeDamage and pass it to Character.tickEffects, which will
    // scale bleed/burn/poison per-tick damage by this multiplier.
    const round = this.battle.round
    const overtimeMult = round >= 12 ? 1 + 0.10 * (round - 11) : 1

    for (const char of living) {
      if (this.battle.isOver) break

      const result = char.tickEffects({ damageMultiplier: overtimeMult })

      for (const tick of result.ticks) {
        if (tick.effectType === 'bleed' && tick.value > 0) {
          this.emit({ type: EventType.BLEED_TICK,  unitId: char.id, damage: tick.value, newHp: char.hp })
        }
        if (tick.effectType === 'poison' && tick.value > 0) {
          this.emit({ type: EventType.POISON_TICK, unitId: char.id, damage: tick.value, newHp: char.hp })
        }
        if (tick.effectType === 'burn' && tick.value > 0) {
          this.emit({ type: EventType.BURN_TICK, unitId: char.id, damage: tick.value, newHp: char.hp })
        }
        if (tick.effectType === 'regen' && tick.value > 0) {
          this.emit({ type: EventType.REGEN_TICK,  unitId: char.id, heal: tick.value,   newHp: char.hp })
        }
        // Emit when a stat modifier expires so the renderer can clear its debuff icon
        if (tick.expired && _isStatModType(tick.effectType)) {
          this.emit({
            type:       EventType.STAT_MODIFIER_EXPIRED,
            unitId:     char.id,
            effectType: tick.effectType as 'def_down' | 'atk_down' | 'mov_down' | 'def_up' | 'atk_up',
          })
        }
      }

      if (result.killed) {
        // DoT kill — no explicit attacker
        this._recordDeath(char.id, null)
        this.emit({
          type:     EventType.CHARACTER_DIED,
          unitId:   char.id,
          killedBy: null,
          wasKing:  char.role === 'king',
          round:    this.battle.round,
        })
        this._checkAndEmitVictory()
        // If the king just died from a DoT, stop ticking — battle is over
        if (this.battle.isOver) break
      }
    }

    // v3 §6.3 Tile-obstacle lifecycle. Apply wall_viva adjacency effects
    // FIRST (while the obstacles are still active), then tick the counters
    // and remove anything that expired. Walls that broke earlier this round
    // (via atk1 hits) already don't show up in getObstacles().
    this._applyWallVivaAdjacency()
    this._grid.tickObstacles()
  }

  /**
   * v3 §6.3 Muralha Viva adjacency effects.
   *
   * For every active wall_viva obstacle, iterate the 8 surrounding cells.
   * Any enemy character (not same side as obstacle.side) standing there
   * takes 3 direct damage, refreshed 15% def_down + 1 mov_down for 1 turn.
   *
   * Runs once per round, before ticking the obstacle counter. Allies do
   * NOT suffer adjacency effects (v3 says "inimigos adjacentes").
   */
  private _applyWallVivaAdjacency(): void {
    const walls = this._grid.getObstacles().filter((o) => o.kind === 'wall_viva')
    if (walls.length === 0) return

    const offsets: Array<[number, number]> = [
      [-1,-1],[0,-1],[1,-1],
      [-1, 0],       [1, 0],
      [-1, 1],[0, 1],[1, 1],
    ]

    // First pass — collect all unique (victim, sourceSide) pairs so that a
    // unit adjacent to multiple Muralha Viva tiles only suffers the effect
    // ONCE per round (v3 intent: "3 dano/turno adjacente", per round).
    const hits = new Map<string, Character>()

    for (const wall of walls) {
      const enemySide = wall.side === 'left' ? 'right' : 'left'
      for (const [dc, dr] of offsets) {
        const col = wall.col + dc
        const row = wall.row + dr
        const victim = this.battle.teamOf(enemySide).living
          .find((c) => c.col === col && c.row === row)
        if (victim) hits.set(victim.id, victim)
      }
    }

    for (const victim of hits.values()) {
      victim.applyPureDamage(3)
      this.emit({
        type:     EventType.DAMAGE_APPLIED,
        unitId:   victim.id,
        amount:   3,
        newHp:    victim.hp,
        sourceId: null,
      })
      if (!victim.alive) {
        this._recordDeath(victim.id, null)
        this.emit({
          type:     EventType.CHARACTER_DIED,
          unitId:   victim.id,
          killedBy: null,
          wasKing:  victim.role === 'king',
          round:    this.battle.round,
        })
        this._checkAndEmitVictory()
        if (this.battle.isOver) return
        continue
      }
      victim.addEffect(new DefReductionEffect(15, 1))
      victim.addEffect(new MovReductionEffect(1, 1))
    }
  }

  // ── Damage formula ────────────────────────────────────────────────────────

  /**
   * Compute raw damage before Character.takeDamage() processes it.
   * Accounts for caster ATK, executor isolation, warrior guard, and wall bonus.
   */
  /**
   * Compute raw damage before Character.takeDamage() processes it.
   *
   * v3 formula (SKILLS_CATALOG_v3_FINAL.md §5):
   *   dano_final = dano_base × mitigação_DEF × modificadores × execute_multiplier
   *     mitigação_DEF = 100 / (100 + DEF_alvo)
   *     modificadores = produto de (passivas × buffs × debuffs)
   *     execute_multiplier = 1.25 se HP_alvo ≤ 30%, senão 1.0
   *   Cap mínimo: dano_final ≥ dano_base × 0.10
   *
   * Note: ATK does NOT directly scale damage in v3 — it is only used via
   * buffs/debuffs (atk_up, atk_down) that feed into `modificadores` below.
   */
  computeRawDamage(caster: Character, target: Character, skill: Skill): number {
    // Gather contextual bonuses from passives and rules — pure math is
    // delegated to domain/DamageFormula.ts so it stays testable without
    // Character/Battle. True damage bypasses DEF mitigation but still
    // receives passive/buff modifiers (v3 §4.1).
    const atkBonus = this.passive.getAtkBonus(caster, this.battle)
                   + this.rules.getAtkBonus(caster, this.battle)
    let mitBonus  = this.passive.getMitigationBonus(target, this.battle)
                  + this.rules.getMitigationBonus(target, this.battle)
    // v3 §6.3 Warrior positional DR — any active PositionalDrEffect on the
    // target whose zone contains the target's CURRENT position contributes
    // its fraction to mitBonus. Multiple stacks sum additively; the
    // formula's internal MAX_MITIGATION cap (0.90) prevents runaway.
    for (const e of target.effects) {
      if (e instanceof PositionalDrEffect && !e.isExpired &&
          e.isInZone({ col: target.col, row: target.row })) {
        mitBonus += e.fraction
      }
    }
    // Executor Isolado trade-off: +10% damage received when isolated (v3 §4.3)
    const targetIncomingDamageBonus = this.passive.getIncomingDamageBonus(target, this.battle)
    const hpRatio = target.hp / Math.max(1, target.maxHp)

    // v3 §6.2 Chuva de Mana (ls_a2 / rs_a2): 22 damage is split into two
    // 11-damage pulses. The primary pulse lands here at half power; the
    // second pulse is queued as a DelayedDamageEffect and fires on the
    // next tick.
    const basePower = (skill.id === 'ls_a2' || skill.id === 'rs_a2')
      ? Math.max(1, Math.round(skill.power / 2))
      : skill.power

    return computeDamage({
      basePower,
      targetDef:                 target.defense,
      targetHpRatio:             hpRatio,
      atkBonus,
      mitBonus,
      targetIncomingDamageBonus,
      round:                     this.battle.round,
      isTrueDamage:              skill.effectType === 'true_damage',
    })
  }

  // ── Win condition ─────────────────────────────────────────────────────────

  /**
   * Check if the battle should end after the latest action.
   * Emits `battle_ended` and calls `battle.end()` if a king has died.
   */
  checkVictory(): boolean {
    if (!this.battle.hasWinner) return false
    this._checkAndEmitVictory()
    return true
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  /** Accumulated combat stats for a character this battle. */
  getStats(characterId: string): BattleStat {
    return this.battleStats.get(characterId) ?? {
      damageDealt: 0, damageReceived: 0, healsGiven: 0, kills: 0,
    }
  }

  /** Stats for all characters (returns a snapshot copy). */
  getAllStats(): ReadonlyMap<string, BattleStat> {
    return new Map(this.battleStats)
  }

  /**
   * The final VictoryResult, available once the battle has ended.
   * Null while the battle is still in progress.
   */
  getVictoryResult(): VictoryResult | null {
    return this._victoryResult
  }

  /**
   * The round (and killer) recorded for a dead character.
   * Returns null if the character is still alive or not tracked.
   */
  getDeathRecord(characterId: string): { round: number; killedBy: string | null } | null {
    return this.deathLog.get(characterId) ?? null
  }

  /** All deaths this battle, in the order they occurred. */
  getAllDeaths(): ReadonlyMap<string, { round: number; killedBy: string | null }> {
    return this.deathLog
  }

  /**
   * Immediately end the battle as a forfeit for `side`.
   * Emits `battle_ended` with reason 'forfeit'.
   * No-op if the battle is already over.
   */
  forfeit(side: TeamSide): void {
    if (this.battle.isOver) return
    this.battle.forfeit(side)
    const result = this.battle.resolveVictory()
    this._victoryResult = result
    this.emit({
      type:   EventType.BATTLE_ENDED,
      winner: result.winner as TeamSide | null,
      reason: result.reason,
      round:  result.round,
    })
  }

  // ── Private — defense resolution ─────────────────────────────────────────

  /**
   * Apply a defensive skill from `char`.
   *
   * Supports all targetTypes:
   *   - 'self'        → apply to caster
   *   - 'lowest_ally' → apply to the ally with lowest HP
   *   - 'all_allies'  → apply to every living ally
   *   - 'area'        → apply to all allies within the skill's areaShape
   *                     centred on the caster's position
   *
   * Delegates entirely to the EffectResolver — no switch needed here.
   */
  private _applyDefenseSkill(char: Character, skill: Skill | null): void {
    if (!skill) return

    if (skill.cooldownTurns > 0) {
      char.noteSkillUsed(skill.id, this.battle.round, skill.cooldownTurns)
    }

    // v3 §6.3/§6.4 — execute the queued pre-movement before the skill's
    // effect fires, so positional DR / shields / teleports account for
    // the caster's post-move tile.
    if (skill.preMovement) {
      this._applyPreMovement(char, 'defense')
    }

    // v3 §6.5 — Espírito de Sobrevivência (lk_d4 / rk_d4): HP-conditional.
    // This skill has bespoke logic that the generic shield handler can't
    // express (conditional magnitude + shield sized from HP ratio).
    // We intercept before the targets loop and resolver dispatch.
    if (skill.id === 'lk_d4' || skill.id === 'rk_d4') {
      this.emit({
        type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
        skillName: skill.name, category: 'defense', targetId: char.id,
      })
      this._applyEspiritoSobrevivencia(char)
      return
    }

    // v3 §6.4 Refletir (le_d1 / re_d1). The generic 'reflect' handler
    // applies a flat ReflectEffect(power). v3 wants PERCENT reduction +
    // PERCENT reflect. We swap in ReflectPercentEffect here.
    if (skill.id === 'le_d1' || skill.id === 're_d1') {
      this.emit({
        type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
        skillName: skill.name, category: 'defense', targetId: char.id,
      })
      // power is expressed as "percentage points" (25 = 25%). Convert to fraction.
      const fraction = Math.max(0, Math.min(1, skill.power / 100))
      char.addEffect(new ReflectPercentEffect(fraction))
      this.emit({
        type:   EventType.STATUS_APPLIED,
        unitId: char.id,
        status: 'reflect' as const,
        value:  skill.power,
      })
      return
    }

    // v3 §6.4 Adrenalina (le_d2 / re_d2). Apply atk_up normally (via
    // resolver) AND queue the 15%-of-max-HP cost to fire when the buff
    // expires. We use the same duration as the atk_up (2 turns default),
    // so both counters run in lockstep.
    if (skill.id === 'le_d2' || skill.id === 're_d2') {
      this.emit({
        type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
        skillName: skill.name, category: 'defense', targetId: char.id,
      })
      const buffTicks = 2   // v3: "+25% ATK por 2t"
      // Apply atk_up via the resolver so the buff integrates with stat mods.
      const ctx: EffectContext = {
        caster: char, target: char,
        power: skill.power, rawDamage: 0, ticks: buffTicks,
        round: this.battle.round,
      }
      const res = this.resolver.resolve('atk_up', ctx)
      this._processResult(char, char, res)
      // Queue the post-expire HP cost: 15% of base max HP, rounded.
      const hpCost = Math.round(char.baseStats.maxHp * 0.15)
      char.setAdrenalinePenalty(hpCost, buffTicks)
      return
    }

    // v3 §6.5 Fuga Sombria (lk_d1 / rk_d1). Grant invisibility for 1t.
    // Breaks on HP damage (handled in Character.takeDamage) or naturally
    // expires via tickEffects.
    if (skill.id === 'lk_d1' || skill.id === 'rk_d1') {
      this.emit({
        type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
        skillName: skill.name, category: 'defense', targetId: char.id,
      })
      char.setInvisibility(1)
      this.emit({
        type:   EventType.STATUS_APPLIED,
        unitId: char.id,
        status: 'invisibility' as const,
        value:  1,
      })
      return
    }

    // v3 §6.5 Sombra Real (lk_d3 / rk_d3). Spawn 2 visual-only decoys
    // in empty cells near the King. The engine emits CLONE_SPAWNED with
    // the computed positions; the scene layer handles rendering. Clones
    // do NOT occupy tiles, block targeting, or take damage in the
    // engine — Option B (visual-only) per DECISIONS.md.
    if (skill.id === 'lk_d3' || skill.id === 'rk_d3') {
      this.emit({
        type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
        skillName: skill.name, category: 'defense', targetId: char.id,
      })
      const positions = this._pickCloneSpawnPositions(char, 2)
      this.emit({
        type:      EventType.CLONE_SPAWNED,
        casterId:  char.id,
        positions,
        duration:  2,   // v3: "Clones duram 2 turnos"
      })
      return
    }

    // v3 §6.3 Escudo do Protetor (lw_d1 / rw_d1). Apply a positional DR
    // zone: 3×2 rectangle BEHIND the Warrior (relative to their side).
    // Allies standing there take -50% damage for 1 turn.
    if (skill.id === 'lw_d1' || skill.id === 'rw_d1') {
      this.emit({
        type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
        skillName: skill.name, category: 'defense', targetId: char.id,
      })
      this._applyPositionalDr(char, 'rect_back_6', 0.50)

      // v3 §6.3 Escudo do Protetor — ALSO spawn a "parede de escudo" of 3
      // vertical tiles directly in front of the Warrior (toward the enemy
      // half). Uses the dedicated `wall_shield` kind so it blocks movement
      // and breaks on atk1 (generic obstacle-break logic), but does NOT
      // trigger the Muralha Viva adjacency damage. 1t duration matches
      // the DR zone behind.
      const forwardDc = char.side === 'left' ? 1 : -1
      const wallCol = char.col + forwardDc
      for (const dr of [-1, 0, 1]) {
        this._grid.placeObstacle({
          col: wallCol, row: char.row + dr,
          kind: 'wall_shield', side: char.side,
          ticksRemaining: 1, sourceId: char.id,
        })
      }
      return
    }

    // v3 §6.3 Resistência Absoluta (lw_d3 / rw_d3). Apply positional DR
    // for self + 1 ally directly behind: -65% damage for 1 turn. We
    // apply the DR zone to both the caster (self-cell) and the single
    // cell behind. Actually the mechanic is simpler: apply a
    // "behind_single" shape that covers one tile behind the Warrior,
    // plus a self-targeted DR on the caster himself. To keep the engine
    // uniform, we create one PositionalDrEffect with shape 'behind_single'
    // anchored at the caster's position and ALSO give the caster a
    // self-centered DR via a square-radius-0 equivalent — modeled here
    // as adding two effects: one for self (applied to the Warrior) and
    // one for the tile behind (applied via an area check). Since any
    // ally standing directly behind will see the DR from the effect
    // attached to THEM only if we apply it to them. Simpler: scan for
    // the ally behind at cast time and attach the effect to BOTH the
    // Warrior and that ally.
    if (skill.id === 'lw_d3' || skill.id === 'rw_d3') {
      this.emit({
        type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
        skillName: skill.name, category: 'defense', targetId: char.id,
      })
      // Self-DR: apply a square_3x3 zone centered on caster, but with
      // radius 0 semantics isn't one of our shapes. Instead: attach a
      // PositionalDrEffect with shape 'behind_single' anchored at the
      // caster's CURRENT position — that covers the cell behind. For the
      // Warrior himself, we attach a separate DR effect with origin
      // equal to self (square_3x3 containing the self cell).
      const behindDc = char.side === 'left' ? -1 : +1
      const behindPos = { col: char.col + behindDc, row: char.row }
      // Self gets the DR (anchored at the Warrior's tile, square_3x3
      // captures the self cell at origin).
      char.addEffect(new PositionalDrEffect(
        'square_3x3',
        { col: char.col, row: char.row },
        char.side,
        0.65,
        1,
      ))
      // Ally directly behind (if any) also gets the DR.
      const allyBehind = this.battle.teamOf(char.side).living
        .find((c) => c.col === behindPos.col && c.row === behindPos.row)
      if (allyBehind) {
        allyBehind.addEffect(new PositionalDrEffect(
          'square_3x3',
          { col: allyBehind.col, row: allyBehind.row },
          char.side,
          0.65,
          1,
        ))
      }
      return
    }

    // v3 §6.3 Postura Defensiva (lw_d6 / rw_d6). Apply 3×3 positional
    // DR around the Warrior: -25% damage for allies in the square.
    if (skill.id === 'lw_d6' || skill.id === 'rw_d6') {
      this.emit({
        type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
        skillName: skill.name, category: 'defense', targetId: char.id,
      })
      this._applyPositionalDr(char, 'square_3x3', 0.25)
      return
    }

    // v3 §6.2 Proteção (ls_d4 / rs_d4). Cleanse debuffs on allies in
    // area + grant 1-turn debuff immunity. The cleanse part fires
    // through the normal resolver path; we ADD the immunity flag to
    // every ally in the area.
    if (skill.id === 'ls_d4' || skill.id === 'rs_d4') {
      this.emit({
        type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
        skillName: skill.name, category: 'defense', targetId: char.id,
      })
      const targets = this._resolveDefenseTargets(char, skill)
      for (const t of targets) {
        const ctx: EffectContext = {
          caster: char, target: t, power: 0, rawDamage: 0, round: this.battle.round,
        }
        const res = this.resolver.resolve('cleanse', ctx)
        this._processResult(char, t, res)
        t.setDebuffImmunity(1)
        this.emit({
          type:   EventType.STATUS_APPLIED,
          unitId: t.id,
          status: 'debuff_immunity' as const,
          value:  1,
        })
      }
      return
    }

    // v3 §6.2 Campo de Cura Contínuo (ls_d5 / rs_d5). Regen 6/turno
    // por 2t em área 3x3, FLAG cancellable=true so incoming damage
    // strips the effect (handled inside Character.takeDamage).
    if (skill.id === 'ls_d5' || skill.id === 'rs_d5') {
      this.emit({
        type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
        skillName: skill.name, category: 'defense', targetId: char.id,
      })
      const targets = this._resolveDefenseTargets(char, skill)
      for (const t of targets) {
        // v3 says Rei does not receive regen. Skip king targets.
        if (t.role === 'king') continue
        t.addEffect(new RegenEffect(skill.power, 2, /* cancellable */ true))
        this.emit({
          type:   EventType.STATUS_APPLIED,
          unitId: t.id,
          status: 'regen' as const,
          value:  skill.power,
        })
      }
      return
    }

    // Collect the list of targets based on targetType
    const targets = this._resolveDefenseTargets(char, skill)

    // Signal to Phaser: this defense skill is now executing (start cast animation)
    this.emit({
      type: EventType.SKILL_USED, unitId: char.id, skillId: skill.id,
      skillName: skill.name, category: 'defense', targetId: targets[0]?.id ?? char.id,
    })

    for (const target of targets) {
      if (!target.alive) continue

      const ctx: EffectContext = {
        caster: char, target,
        power: skill.power, rawDamage: 0,
        round: this.battle.round,
      }
      const result = this.resolver.resolve(skill.effectType, ctx)
      this._processResult(char, target, result)

      // Follow-up effects applied in array order (e.g. shield + regen, heal + shield).
      // Each entry is dispatched independently. Stops if the target dies mid-sequence.
      for (const sec of skill.secondaryEffects) {
        if (!target.alive) break
        const secCtx: EffectContext = { ...ctx, power: sec.power, ticks: sec.ticks }
        const secResult = this.resolver.resolve(sec.effectType, secCtx)
        this._processResult(char, target, secResult)
      }
    }
  }

  /**
   * v3 §6.5 Espírito de Sobrevivência (lk_d4 / rk_d4).
   *
   * Conditional on current HP ratio at cast time:
   *   - HP ≤ 50%:  +15% base max HP (temporary, 1 turn) AND shield = 10% base max HP
   *   - HP > 50%:  +10% base max HP (temporary, 1 turn), NO shield
   *
   * Uses `baseStats.maxHp` as the scaling base — any active bonus at cast
   * time does not compound. This matches the player's mental model that
   * "+15% HP" means "+15% of my CLASS's HP", not "of whatever I'm buffed to".
   */
  /**
   * v3 §6.2 Explosão Central (ls_a4 / rs_a4) — two-use mark mechanic.
   *
   * 1st use: plant a non-removable mark on the target (no damage, no
   *          evasion check — the mark itself is the payload). Uses the
   *          skill's own power as the bonus-damage field so callers
   *          that inspect the mark see the intended detonation magnitude.
   * 2nd use: consume the mark. Deal 50 damage directly + 25 bonus if the
   *          target has any other active debuff. Bypasses evade, shields,
   *          and debuff-immunity via Character.applyPureDamage.
   */
  private _applyExplosaoCentral(caster: Character, target: Character, skill: Skill): void {
    this.emit({
      type: EventType.SKILL_USED, unitId: caster.id, skillId: skill.id,
      skillName: skill.name, category: 'attack', targetId: target.id,
    })

    const existing = target.effects.find(
      (e): e is MarkEffect => e instanceof MarkEffect && !e.isExpired,
    )

    if (!existing) {
      // 1st use — plant the non-removable mark.
      target.addEffect(new MarkEffect(caster.id, skill.power, true))
      this.emit({
        type: EventType.STATUS_APPLIED,
        unitId: target.id,
        status: 'mark' as const,
        value:  skill.power,
      })
      return
    }

    // 2nd use — detonation. Bonus when the target carries any other debuff
    // (non-removable marks themselves are debuff-kind; exclude those so a
    // bare Explosão chain without other debuffs gets the base 50, not 75).
    const hasOtherDebuff = target.effects.some(
      (e) => e.kind === 'debuff' && !e.isExpired && !(e instanceof MarkEffect),
    )
    const totalDamage = 50 + (hasOtherDebuff ? 25 : 0)

    existing.consume()
    const hpBefore = target.hp
    target.applyPureDamage(totalDamage)
    const dealt = hpBefore - target.hp

    this.emit({
      type:     EventType.MARK_CONSUMED,
      unitId:   target.id,
      bonusDamage: totalDamage,
      sourceId: caster.id,
    })
    if (dealt > 0) {
      this.emit({
        type: EventType.DAMAGE_APPLIED, unitId: target.id,
        amount: dealt, newHp: target.hp, sourceId: caster.id,
      })
      this._addStat(caster.id, 'damageDealt',    dealt)
      this._addStat(target.id, 'damageReceived', dealt)
    }
    if (!target.alive) {
      this._recordDeath(target.id, caster.id)
      this._addStat(caster.id, 'kills', 1)
      this.emit({
        type:    EventType.CHARACTER_DIED,
        unitId:  target.id,
        killedBy: caster.id,
        wasKing: target.role === 'king',
        round:   this.battle.round,
      })
      this._checkAndEmitVictory()
    }
  }

  private _applyEspiritoSobrevivencia(caster: Character): void {
    if (!caster.alive) return

    const baseMax = caster.baseStats.maxHp
    const hpRatio = caster.hp / caster.maxHp
    const critical = hpRatio <= 0.50

    const bonusPct = critical ? 0.15 : 0.10
    const bonus    = Math.round(baseMax * bonusPct)

    caster.addMaxHpBonus(bonus, 1)
    this.emit({
      type:   EventType.STATUS_APPLIED,
      unitId: caster.id,
      status: 'hp_up' as const,
      value:  bonus,
    })

    if (critical) {
      const shieldAmount = Math.round(baseMax * 0.10)
      if (shieldAmount > 0) {
        caster.addShield(shieldAmount)
        this.emit({
          type:   EventType.STATUS_APPLIED,
          unitId: caster.id,
          status: 'shield' as const,
          value:  shieldAmount,
        })
      }
    }
  }

  /**
   * v3 §6.3 Warrior positional DR — attach a PositionalDrEffect to every
   * ally whose current position falls inside the zone. The effect carries
   * the origin (caster's position at cast time), so if the caster moves
   * later the zone stays anchored. Re-evaluation happens inside
   * `computeRawDamage` via `isInZone(target.col, target.row)`.
   */
  private _applyPositionalDr(
    caster: Character,
    shape: PositionalDrShape,
    fraction: number,
  ): void {
    const origin = { col: caster.col, row: caster.row }
    const probe  = new PositionalDrEffect(shape, origin, caster.side, fraction, 1)
    for (const ally of this.battle.teamOf(caster.side).living) {
      if (probe.isInZone({ col: ally.col, row: ally.row })) {
        ally.addEffect(new PositionalDrEffect(shape, origin, caster.side, fraction, 1))
      }
    }
  }

  /**
   * v3 §6.5 Sombra Real — pick empty cells near the King for clone spawn.
   *
   * Greedy search of the 8-adjacent cells (and falling back to radius 2
   * if fewer than `count` open tiles are available). Returns at most
   * `count` positions. Empty array is valid if no open tiles around.
   *
   * "Open tile" means: in-bounds, not a wall, not occupied by any living
   * character. Ignores territory (clones can spawn on either side as
   * long as the cell is free).
   */
  private _pickCloneSpawnPositions(
    caster: Character,
    count: number,
  ): Array<{ col: number; row: number }> {
    const picked: Array<{ col: number; row: number }> = []
    // Ring of radius 1 first, then 2 if needed.
    const ring1: Array<[number, number]> = [
      [-1,-1],[0,-1],[1,-1],
      [-1, 0],       [1, 0],
      [-1, 1],[0, 1],[1, 1],
    ]
    const ring2: Array<[number, number]> = [
      [-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2],
      [-2,-1],                          [2,-1],
      [-2, 0],                          [2, 0],
      [-2, 1],                          [2, 1],
      [-2, 2],[-1, 2],[0, 2],[1, 2],[2, 2],
    ]
    for (const offsets of [ring1, ring2]) {
      for (const [dc, dr] of offsets) {
        if (picked.length >= count) return picked
        const c = caster.col + dc
        const r = caster.row + dr
        if (this._grid.isWalkable(c, r)) {
          picked.push({ col: c, row: r })
        }
      }
    }
    return picked
  }

  /**
   * Resolve the targets for a defensive skill based on its targetType.
   * Defensive area skills are centred on the caster's position and hit allies only.
   */
  private _resolveDefenseTargets(char: Character, skill: Skill): Character[] {
    switch (skill.targetType) {
      case 'self':
        return [char]

      case 'lowest_ally': {
        const ally = this.battle.teamOf(char.side).lowestHpCharacter()
        return ally ? [ally] : [char]
      }

      case 'all_allies':
        return [...this.battle.teamOf(char.side).living] as Character[]

      case 'area': {
        // Area defense: centred on caster, hits allies within shape
        const allySide = char.side
        const allies = this.battle.teamOf(allySide).living as Character[]
        if (!skill.areaShape) return [char]  // fallback to self if no shape
        const centerPos = Position.of(char.col, char.row)
        return allies.filter((a) =>
          a.alive && this._grid.isInArea(skill.areaShape!, centerPos, Position.of(a.col, a.row)),
        )
      }

      default:
        return [char]
    }
  }

  // ── Private — attack resolution ───────────────────────────────────────────

  private _applyAttackSkill(
    caster: Character,
    skill: Skill | null,
    target: TargetSpec | null,
    _side: CharacterSide,
  ): void {
    if (!skill || !target) return

    if (skill.cooldownTurns > 0) {
      caster.noteSkillUsed(skill.id, this.battle.round, skill.cooldownTurns)
    }

    if (skill.preMovement) {
      this._applyPreMovement(caster, 'attack')
    }

    switch (skill.targetType) {

      case 'single': {
        if (target.kind !== 'character') return
        const targetChar = this.battle.getCharacter(target.characterId)
        if (!targetChar?.alive) return
        // v3 §6.3 — atk1 single-target hits also break any obstacle on
        // the target's tile (obstacles block movement, not targeting).
        if (skill.group === 'attack1') {
          const broken = this._grid.breakObstacle(targetChar.col, targetChar.row)
          if (broken) {
            this.emit({
              type:   EventType.STATUS_APPLIED,
              unitId: broken.sourceId,
              status: 'summon_wall' as const,
              value:  0,
            })
          }
        }

        // v3 §6.2 Explosão Central (ls_a4 / rs_a4): bespoke mark mechanic.
        // 1st use: plant a non-removable mark on the target, no damage.
        // 2nd use (target already marked): consume mark; deal 50 damage
        // directly (+25 if target has any other debuff), bypassing
        // evade/shield/immunities. Per v3 "Não bypassa por Esquiva/imunidade."
        if (skill.id === 'ls_a4' || skill.id === 'rs_a4') {
          this._applyExplosaoCentral(caster, targetChar, skill)
          break
        }

        this._applyOffensiveSkill(caster, targetChar, skill)
        break
      }

      case 'area': {
        if (target.kind !== 'area') return
        // Top-level area announcement (lets Phaser show the blast overlay before per-hit damage)
        this.emit({
          type: EventType.SKILL_USED, unitId: caster.id, skillId: skill.id,
          skillName: skill.name, category: 'attack',
          areaCenter: { col: target.col, row: target.row },
        })

        // v3 §6.3 Muralha Viva (lw_a6 / rw_a6): spawn 2 vertical walls at
        // the aim center column. Adjacent effects fire each round via the
        // wall_viva hook in tickObstacles. Secondary def_down is still
        // applied to whatever targets the area resolves to (partial value
        // even without adjacency ticking yet).
        if (skill.id === 'lw_a6' || skill.id === 'rw_a6') {
          // Place 2 obstacles: one at the center tile, one directly above
          // (v3: "2 sqm vertical"). If either is blocked (OOB / wall /
          // occupied), skip that position silently.
          for (const dr of [0, -1]) {
            this._grid.placeObstacle({
              col: target.col, row: target.row + dr,
              kind: 'wall_viva', side: caster.side,
              ticksRemaining: 2, sourceId: caster.id,
            })
          }
        }

        // v3 §6.3 Prisão de Muralha Morta (lw_a8 / rw_a8): 8 walls in the
        // 3x3 ring around center (center itself is free), plus 12 damage
        // and snare to enemies in the center. The primary damage + snare
        // are handled by the standard resolver flow below — we only need
        // to spawn the wall ring here.
        if (skill.id === 'lw_a8' || skill.id === 'rw_a8') {
          for (const [dc, dr] of [
            [-1,-1],[0,-1],[1,-1],
            [-1, 0],       [1, 0],
            [-1, 1],[0, 1],[1, 1],
          ]) {
            this._grid.placeObstacle({
              col: target.col + dc, row: target.row + dr,
              kind: 'wall_ring', side: caster.side,
              ticksRemaining: 2, sourceId: caster.id,
            })
          }
        }

        // v3 §6.4 Armadilha Oculta (le_a8 / ra_a8): drop a single-tile
        // trap at the aim, provided the tile is empty (no occupant, no
        // existing obstacle). Triggers on-step via _checkTrapTrigger when
        // an enemy is pushed or pre-skill-moved onto the tile. No damage
        // is dealt at cast time.
        if (skill.id === 'le_a8' || skill.id === 'ra_a8') {
          this.emit({
            type: EventType.SKILL_USED, unitId: caster.id, skillId: skill.id,
            skillName: skill.name, category: 'attack',
            areaCenter: { col: target.col, row: target.row },
          })
          const occupant = this._grid.occupantAt(target.col, target.row)
          const existingObstacle = this._grid.obstacleAt(target.col, target.row)
          if (!occupant && !existingObstacle && this._grid.isInBounds(target.col, target.row)) {
            this._grid.placeObstacle({
              col: target.col, row: target.row,
              kind: 'trap', side: caster.side,
              ticksRemaining: 3, sourceId: caster.id,
            })
            this.emit({
              type: EventType.STATUS_APPLIED, unitId: caster.id,
              status: 'summon_wall' as const, value: 1,
            })
          }
          break
        }

        // v3 §6.2 Névoa (ls_a7 / rs_a7): arena-wide dual-side effect.
        // Allies (anywhere) gain def_up 15% (2t); enemies (anywhere) gain
        // def_down 15% + heal_reduction 30% (2t). Bypasses the normal
        // damage loop — no hits are resolved and no per-target damage.
        if (skill.id === 'ls_a7' || skill.id === 'rs_a7') {
          for (const unit of this.battle.allCharacters) {
            if (!unit.alive) continue
            if (unit.side === caster.side) {
              unit.addEffect(new DefBoostEffect(15, 2))
              this.emit({
                type: EventType.STATUS_APPLIED, unitId: unit.id,
                status: 'def_up' as const, value: 15,
              })
            } else {
              unit.addEffect(new DefReductionEffect(15, 2))
              unit.addEffect(new HealReductionEffect(30, 2))
              this.emit({
                type: EventType.STATUS_APPLIED, unitId: unit.id,
                status: 'def_down' as const, value: 15,
              })
              this.emit({
                type: EventType.STATUS_APPLIED, unitId: unit.id,
                status: 'heal_reduction' as const, value: 30,
              })
            }
          }
          this.emit({
            type: EventType.AREA_RESOLVED,
            centerCol: target.col, centerRow: target.row,
            hitIds: [],
          })
          break
        }

        const hits = this._targeting.resolveTargets(skill, caster, target, this.battle) as Character[]

        // v3 §6.3 — obstacles break on atk1 hits. After resolving targets,
        // but before applying damage, check the area's footprint and break
        // any obstacle standing there if this is an atk1 skill. The
        // `group` field on SkillDefinition is canonical.
        if (skill.group === 'attack1') {
          const footprint = this._targeting.previewArea(
            skill, Position.of(target.col, target.row),
          )
          for (const pos of footprint) {
            const broken = this._grid.breakObstacle(pos.col, pos.row)
            if (broken) {
              this.emit({
                type:   EventType.STATUS_APPLIED,
                unitId: broken.sourceId,
                status: 'summon_wall' as const,
                value:  0,   // 0 signals removal/break to the UI
              })
            }
          }
        }

        // v3 §6.4 Marca da Morte (le_a7 / ra_a7): strip every hit target's
        // shields BEFORE the damage loop so the 12 damage hits HP directly
        // (matches v3 "anti-shield assassin" identity), then heal the
        // Executor by 20% of the total shield HP stripped.
        let totalShieldStripped = 0
        if (skill.id === 'le_a7' || skill.id === 'ra_a7') {
          for (const hit of hits) {
            totalShieldStripped += hit.removeAllShields()
          }
        }

        // Aggregate damage dealt for skill-specific post-hooks (e.g. Domínio Real).
        // Also track blocked hits for v3 conditional follow-ups (lw_a1 snare).
        let totalDamageDealt = 0
        const blockedHits: Character[] = []
        for (const hit of hits) {
          if (this.battle.isOver) break
          const res = this._applyOffensiveSkill(caster, hit, skill)
          totalDamageDealt += res.hpDamage
          if (res.blocked) blockedHits.push(hit)
        }

        // v3 §6.3 Colisão Titânica (lw_a1 / rw_a1): if any target blocked
        // the damage (evade or full shield absorption), apply snare 1t to
        // that specific target. Non-blocked targets get only the primary
        // push from secondaryEffects.
        if (skill.id === 'lw_a1' || skill.id === 'rw_a1') {
          for (const blocked of blockedHits) {
            if (!blocked.alive) continue
            const snareCtx: EffectContext = {
              caster, target: blocked, power: 0, rawDamage: 0, ticks: 1, round: this.battle.round,
            }
            const snareRes = this.resolver.resolve('snare', snareCtx)
            this._processResult(caster, blocked, snareRes)
          }
        }

        // v3 §6.2 Chuva de Mana (ls_a2 / rs_a2): 22 damage split across 2
        // ticks (11 + 11). Primary hit lands now for half of the declared
        // power; the remaining half is queued as a DelayedDamageEffect that
        // fires next round via Character.tickEffects. Queimação heal-
        // reduction does NOT stack twice because the passive's onDamageDealt
        // hook fires per caster-target pair, not per damage pulse.
        if (skill.id === 'ls_a2' || skill.id === 'rs_a2') {
          const halfPower = Math.max(1, Math.round(skill.power / 2))
          for (const hit of hits) {
            if (!hit.alive) continue
            hit.addEffect(new DelayedDamageEffect(halfPower, 1))
          }
        }

        // v3 §6.2 Raio Purificador (ls_a3 / rs_a3): mixed-side area shield.
        // Enemies take damage + purge (handled by the normal resolver loop);
        // allies standing in the same line footprint gain shield 10.
        if (skill.id === 'ls_a3' || skill.id === 'rs_a3') {
          const footprint = this._targeting.previewArea(
            skill, Position.of(target.col, target.row),
          )
          const allies = this.battle.teamOf(caster.side).living as Character[]
          const inFootprint = (c: Character) => footprint.some(
            (p) => p.col === c.col && p.row === c.row,
          )
          for (const ally of allies) {
            if (!ally.alive) continue
            if (!inFootprint(ally)) continue
            ally.addShield(10)
            this.emit({
              type:   EventType.STATUS_APPLIED,
              unitId: ally.id,
              status: 'shield' as const,
              value:  10,
            })
          }
        }

        // v3 §6.3 Investida Brutal (lw_a4 / rw_a4): per-line push rules.
        // - Central row (hit.row === aim.row): push 1 along charge axis +
        //   snare 1t if the hit was blocked.
        // - Flank rows (hit.row ≠ aim.row): pushed 1 perpendicular to the
        //   charge axis (east if row above aim, west if below). Custom
        //   handling replaces the generic `push` secondary which cannot
        //   express direction-by-row.
        if (skill.id === 'lw_a4' || skill.id === 'rw_a4') {
          const axisDc = Math.sign(target.col - caster.col)
          const axisDr = Math.sign(target.row - caster.row)
          const chargeDir = _offsetToDir(axisDc, axisDr)

          for (const hit of hits) {
            if (!hit.alive) continue
            const isCentral = hit.row === target.row
            if (isCentral) {
              this._executePush(hit.id, chargeDir, 1)
              if (blockedHits.includes(hit)) {
                const snareCtx: EffectContext = {
                  caster, target: hit, power: 0, rawDamage: 0, ticks: 1, round: this.battle.round,
                }
                const snareRes = this.resolver.resolve('snare', snareCtx)
                this._processResult(caster, hit, snareRes)
              }
            } else {
              // Flank rows: perpendicular push (east/west for vertical charges)
              const flankDir: Direction = hit.row < target.row ? 'east' : 'west'
              this._executePush(hit.id, flankDir, 1)
            }
          }
        }

        // Marca da Morte — apply heal after damage phase.
        if ((skill.id === 'le_a7' || skill.id === 'ra_a7') && totalShieldStripped > 0 && caster.alive) {
          const healAmount = Math.round(totalShieldStripped * 0.20)
          if (healAmount > 0) {
            const res = caster.heal(healAmount)
            if (res.actual > 0) {
              this.emit({
                type:    EventType.HEAL_APPLIED,
                unitId:  caster.id,
                amount:  res.actual,
                newHp:   caster.hp,
                sourceId: caster.id,
              })
              this._addStat(caster.id, 'healsGiven', res.actual)
            }
          }
        }
        // Always emit AREA_RESOLVED (even on 0 hits) so the renderer can show the blast
        this.emit({
          type: EventType.AREA_RESOLVED,
          centerCol: target.col, centerRow: target.row,
          hitIds: hits.map((c) => c.id),
        })
        // v3 §6.5 Domínio Real (lk_a4 / rk_a4): self-shield = 25% of total damage
        // dealt, applied to the caster. If no damage landed (all evaded), no shield.
        if ((skill.id === 'lk_a4' || skill.id === 'rk_a4') && totalDamageDealt > 0 && caster.alive) {
          const shieldAmount = Math.round(totalDamageDealt * 0.25)
          if (shieldAmount > 0) {
            caster.addShield(shieldAmount)
            this.emit({
              type:   EventType.STATUS_APPLIED,
              unitId: caster.id,
              status: 'shield' as const,
              value:  shieldAmount,
            })
          }
        }
        break
      }

      case 'lowest_ally': {
        const lowestChar = this.battle.teamOf(caster.side).lowestHpCharacter()
        if (!lowestChar) return
        const ctx: EffectContext = {
          caster, target: lowestChar, power: skill.power, rawDamage: 0, round: this.battle.round,
        }
        const res = this.resolver.resolve(skill.effectType, ctx)
        this._processResult(caster, lowestChar, res)
        break
      }

      case 'all_allies': {
        for (const ally of this.battle.teamOf(caster.side).living) {
          const ctx: EffectContext = {
            caster, target: ally, power: skill.power, rawDamage: 0, round: this.battle.round,
          }
          const res = this.resolver.resolve(skill.effectType, ctx)
          this._processResult(caster, ally, res)
        }
        break
      }

      case 'self':
        break   // self-targeting attacks handled in defense path
    }
  }

  /**
   * Apply one offensive skill from `caster` to `target`.
   * Computes raw damage, calls the resolver, then delegates meta-logic to
   * `_processResult` (stats, reflect, kill/victory).
   *
   * @returns `{ hpDamage, blocked }` where `hpDamage` is the HP change
   *          actually dealt (0 if evaded, dead, or non-damage), and
   *          `blocked === true` when the attack was neutralised by an
   *          evade or fully absorbed by a shield — the distinguishing
   *          signal that v3 skills like Colisão Titânica (lw_a1) key
   *          off to apply conditional follow-ups (snare, retaliation).
   */
  private _applyOffensiveSkill(caster: Character, target: Character, skill: Skill): { hpDamage: number; blocked: boolean } {
    if (!target.alive) return { hpDamage: 0, blocked: false }

    // Signal to Phaser: this attack is now executing against this target.
    // Suppressed for area skills — the top-level area announcement in
    // _applyAttackSkill already fired with areaCenter; per-hit events would duplicate it.
    if (skill.targetType !== 'area') {
      this.emit({
        type: EventType.SKILL_USED, unitId: caster.id, skillId: skill.id,
        skillName: skill.name, category: 'attack', targetId: target.id,
      })
    }

    // v3 §6.4 — bleed-conditional bonuses (Executor signature trick):
    //   Corte Mortal (le_a1/ra1):     +50% damage if target had bleed pre-hit
    //   Tempestade de Lâminas (le_a2):+50% damage if target had bleed pre-hit
    //   Disparo Preciso (le_a3/ra3):  bypass shields if target had bleed pre-hit
    // The snapshot MUST be taken BEFORE any effect runs because the primary
    // hit / cleanse secondary may strip the bleed first.
    const targetHadBleed = _hadBleedEffect(target)
    const isLeA1 = skill.id === 'le_a1' || skill.id === 'ra_a1'
    const isLeA2 = skill.id === 'le_a2' || skill.id === 'ra_a2'
    const isLeA3 = skill.id === 'le_a3' || skill.id === 'ra_a3'
    const bleedAmplifies = (isLeA1 || isLeA2) && targetHadBleed
    const bleedBypassesShield = isLeA3 && targetHadBleed

    // true_damage bypasses the ATK/DEF formula — use power directly
    let rawDamage = skill.effectType === 'true_damage'
      ? skill.power
      : _isDamageCarrying(skill.effectType)
        ? this.computeRawDamage(caster, target, skill)
        : 0
    if (bleedAmplifies) {
      rawDamage = Math.round(rawDamage * 1.5)
    }

    // v3 §6.3 Guardião (lw_d2) — damage redirect. If the target carries
    // an active GuardedByEffect, split the computed rawDamage: a fraction
    // is routed to the protector (with the configured mitigation), the
    // remainder stays with the target. Runs AFTER DEF mitigation
    // (rawDamage is already post-formula) and BEFORE evade/shield on the
    // ally, so the protector absorbs the redirect regardless of the
    // ally's own defensive effects.
    if (rawDamage > 0 && _isDamageCarrying(skill.effectType)) {
      const guard = target.effects.find(
        (e): e is GuardedByEffect => e instanceof GuardedByEffect && !e.isExpired,
      )
      if (guard) {
        const protector = this.battle.getCharacter(guard.protectorId)
        if (protector?.alive && protector.id !== target.id) {
          const redirected = Math.round(rawDamage * guard.redirectFraction)
          const protectorTakes = Math.max(1, Math.round(redirected * (1 - guard.protectorMitFraction)))
          rawDamage = Math.max(0, rawDamage - redirected)
          this._applyRedirectedDamage(caster, protector, protectorTakes)
        }
      }
    }

    // Disparo Preciso bleed-bypass: apply true damage DIRECTLY via
    // applyPureDamage so shields are skipped. Still respects alive checks
    // and kill tracking via a minimal _processResult emit below.
    if (bleedBypassesShield) {
      const hpBefore = target.hp
      target.applyPureDamage(rawDamage)
      const dealt = hpBefore - target.hp
      this.emit({
        type: EventType.DAMAGE_APPLIED,
        unitId: target.id,
        amount: dealt,
        newHp: target.hp,
        sourceId: caster.id,
      })
      if (dealt > 0) {
        this._addStat(caster.id, 'damageDealt',    dealt)
        this._addStat(target.id, 'damageReceived', dealt)
      }
      if (!target.alive) {
        this._recordDeath(target.id, caster.id)
        this._addStat(caster.id, 'kills', 1)
        this.emit({
          type:    EventType.CHARACTER_DIED,
          unitId:  target.id,
          killedBy: caster.id,
          wasKing: target.role === 'king',
          round:   this.battle.round,
        })
        this._checkAndEmitVictory()
      }
      return { hpDamage: dealt, blocked: false }
    }

    const ctx: EffectContext = {
      caster, target, power: skill.power, rawDamage, round: this.battle.round,
    }
    const result = this.resolver.resolve(skill.effectType, ctx)
    this._processResult(caster, target, result)

    // v3 — "blocked" semantics for skills that react to neutralised hits
    // (e.g. lw_a1 Colisão Titânica's conditional snare): the hit landed
    // on a damage-carrying skill but dealt 0 HP either by evade or full
    // shield absorption.
    const wasDamageCarrying = _isDamageCarrying(skill.effectType) || skill.effectType === 'true_damage'
    const blocked = wasDamageCarrying && rawDamage > 0 && result.hpDamage === 0

    if (this.battle.isOver || result.killed) return { hpDamage: result.hpDamage, blocked }

    // Post-damage passives (e.g. specialist heal-reduction, future on-hit effects)
    if (result.hpDamage > 0) {
      for (const e of this.passive.onDamageDealt(caster, target, this.battle.round)) {
        this.emit(e)
      }
    }

    // Follow-up effects (skipped when hit was evaded). Each applies in
    // array order; stops if target dies before all resolve.
    if (!result.evaded) {
      for (const sec of skill.secondaryEffects) {
        if (!target.alive) break
        const secCtx: EffectContext = {
          caster, target, power: sec.power, rawDamage: 0, ticks: sec.ticks, round: this.battle.round,
        }
        const secResult = this.resolver.resolve(sec.effectType, secCtx)
        this._processResult(caster, target, secResult)
      }
    }

    return { hpDamage: result.hpDamage, blocked }
  }

  /**
   * Process an EffectResult after the resolver returns:
   *   - Emit all events
   *   - Track damage / heal stats
   *   - Record kills, trigger victory check
   *   - Apply reflect retaliation
   */
  private _processResult(caster: Character, target: Character, result: EffectResult): void {
    for (const e of result.events) this.emit(e)

    if (result.hpDamage > 0) {
      this._addStat(caster.id, 'damageDealt',    result.hpDamage)
      this._addStat(target.id, 'damageReceived', result.hpDamage)
    }
    if (result.healed > 0) {
      // Attribute heals-given to the caster (or self for defensive heals)
      this._addStat(caster.id, 'healsGiven', result.healed)
    }
    if (result.killed) {
      this._recordDeath(target.id, caster.id)
      this._addStat(caster.id, 'kills', 1)
      this._checkAndEmitVictory()
    }
    if (result.reflected > 0) {
      this._applyReflectDamage(target, caster, result.reflected)
    }

    // Push request — execute via Grid after all other effects resolve
    if (result.pushRequest && !result.killed) {
      this._executePush(result.pushRequest.targetId, result.pushRequest.direction, result.pushRequest.force)
    }
  }

  /** Apply reflect damage from `reflector` back to `caster`. */
  /**
   * v3 §6.3 Guardião — apply redirected damage to the protector. Uses
   * takeDamage so the protector's own shields/evade still apply (the
   * protector is a willing shield, not an environmental hazard). Emits
   * DAMAGE_APPLIED sourced from the original attacker and routes death
   * through CHARACTER_DIED + victory check.
   */
  private _applyRedirectedDamage(attacker: Character, protector: Character, amount: number): void {
    if (!protector.alive || amount <= 0) return
    const res = protector.takeDamage(amount)
    if (res.hpDamage > 0) {
      this.emit({
        type: EventType.DAMAGE_APPLIED, unitId: protector.id,
        amount: res.hpDamage, newHp: protector.hp, sourceId: attacker.id,
      })
      this._addStat(attacker.id,  'damageDealt',    res.hpDamage)
      this._addStat(protector.id, 'damageReceived', res.hpDamage)
    }
    if (res.killed) {
      this._recordDeath(protector.id, attacker.id)
      this._addStat(attacker.id, 'kills', 1)
      this.emit({
        type: EventType.CHARACTER_DIED, unitId: protector.id,
        killedBy: attacker.id, wasKing: protector.role === 'king',
        round: this.battle.round,
      })
      this._checkAndEmitVictory()
    }
  }

  private _applyReflectDamage(reflector: Character, caster: Character, amount: number): void {
    const result = caster.takeDamage(amount)
    if (result.hpDamage > 0) {
      this.emit({ type: EventType.DAMAGE_APPLIED, unitId: caster.id, amount: result.hpDamage, newHp: caster.hp, sourceId: reflector.id })
      this._addStat(reflector.id, 'damageDealt',   result.hpDamage)
      this._addStat(caster.id,   'damageReceived', result.hpDamage)
    }
    if (result.killed) {
      this._recordDeath(caster.id, reflector.id)
      this.emit({
        type:     EventType.CHARACTER_DIED,
        unitId:   caster.id,
        killedBy: reflector.id,
        wasKing:  caster.role === 'king',
        round:    this.battle.round,
      })
      this._addStat(reflector.id, 'kills', 1)
      this._checkAndEmitVictory()
    }
  }

  /**
   * v3 §6.4 Armadilha Oculta — if `char` has just moved onto a tile that
   * contains a trap placed by the opposing side, trigger the trap: apply
   * 15 damage + snare 1t + bleed 4/3t (bypass shields — matches v3 trap
   * semantics as an environmental hazard). Trap is consumed after trigger.
   *
   * Called from `_executePush` and `_applyPreMovement` (push + pre-skill
   * movement paths). Movement-phase voluntary movement is out of scope
   * for this sprint (documented as residual debt in DECISIONS.md).
   */
  private _checkTrapTrigger(char: Character): void {
    if (!char.alive) return
    const obstacle = this._grid.obstacleAt(char.col, char.row)
    if (!obstacle || obstacle.kind !== 'trap') return
    if (obstacle.side === char.side) return   // allies don't trigger own-side traps

    // Remove the trap FIRST so re-entrant state changes don't double-fire.
    this._grid.breakObstacle(char.col, char.row)

    // 15 damage — applied as pure damage (v3: environmental hazard bypasses
    // standard intercepts like evade). Still respects alive checks.
    const hpBefore = char.hp
    char.applyPureDamage(15)
    const dealt = hpBefore - char.hp
    if (dealt > 0) {
      this.emit({
        type: EventType.DAMAGE_APPLIED, unitId: char.id,
        amount: dealt, newHp: char.hp, sourceId: obstacle.sourceId,
      })
      this._addStat(obstacle.sourceId, 'damageDealt',    dealt)
      this._addStat(char.id,           'damageReceived', dealt)
    }
    if (!char.alive) {
      this._recordDeath(char.id, obstacle.sourceId)
      this._addStat(obstacle.sourceId, 'kills', 1)
      this.emit({
        type: EventType.CHARACTER_DIED, unitId: char.id,
        killedBy: obstacle.sourceId, wasKing: char.role === 'king',
        round: this.battle.round,
      })
      this._checkAndEmitVictory()
      return
    }

    // Snare 1t + Bleed 4/3t via resolver so the standard event/effect
    // path fires uniformly.
    const source = this.battle.getCharacter(obstacle.sourceId) ?? char
    const snareCtx: EffectContext = {
      caster: source, target: char, power: 0, rawDamage: 0, ticks: 1, round: this.battle.round,
    }
    this._processResult(source, char, this.resolver.resolve('snare', snareCtx))
    if (!char.alive) return
    const bleedCtx: EffectContext = {
      caster: source, target: char, power: 4, rawDamage: 0, ticks: 3, round: this.battle.round,
    }
    this._processResult(source, char, this.resolver.resolve('bleed', bleedCtx))
  }

  /** Execute a push on the grid and sync the Character's domain position. */
  private _executePush(targetId: string, direction: Direction, force: number): void {
    const target = this.battle.getCharacter(targetId)
    if (!target?.alive) return

    const pushResult = this._grid.applyPush(targetId, direction, force)
    if (pushResult.distanceMoved > 0) {
      // Sync domain position
      target.moveTo(pushResult.to.col, pushResult.to.row)

      this.emit({
        type:          EventType.UNIT_PUSHED,
        unitId:        targetId,
        fromCol:       pushResult.from.col,
        fromRow:       pushResult.from.row,
        toCol:         pushResult.to.col,
        toRow:         pushResult.to.row,
        force,
        distanceMoved: pushResult.distanceMoved,
        blocked:       pushResult.blocked,
        collidedWith:  pushResult.collidedWith,
      })

      // v3 §6.4 Armadilha Oculta — landing on a trap fires its payload.
      this._checkTrapTrigger(target)

      if (pushResult.collidedWith) {
        this.emit({
          type:      EventType.PUSH_COLLISION,
          pushedId:  targetId,
          blockerId: pushResult.collidedWith,
          col:       pushResult.to.col,
          row:       pushResult.to.row,
        })
      }
    }
  }

  // ── Private — deck rotation ───────────────────────────────────────────────

  private _rotateUsedCards(char: Character, sel: ActionSelection): void {
    const team = this.battle.teamOf(char.side)

    if (sel.attackSkill) {
      const deck = team.attackDeck(char.id)
      if (deck) {
        const result = deck.use(sel.attackSkill.id)
        if (result) {
          this.emit({ type: EventType.CARD_ROTATED, unitId: char.id, cardId: sel.attackSkill.id, category: 'attack', nextCardId: result.newHand[0]?.id ?? sel.attackSkill.id })
        }
      }
    }

    // Rotate second attack skill (used during double_attack turns)
    if (sel.secondAttackSkill) {
      const deck = team.attackDeck(char.id)
      if (deck) {
        const result = deck.use(sel.secondAttackSkill.id)
        if (result) {
          this.emit({ type: EventType.CARD_ROTATED, unitId: char.id, cardId: sel.secondAttackSkill.id, category: 'attack', nextCardId: result.newHand[0]?.id ?? sel.secondAttackSkill.id })
        }
      }
    }

    if (sel.defenseSkill) {
      const deck = team.defenseDeck(char.id)
      if (deck) {
        const result = deck.use(sel.defenseSkill.id)
        if (result) {
          this.emit({ type: EventType.CARD_ROTATED, unitId: char.id, cardId: sel.defenseSkill.id, category: 'defense', nextCardId: result.newHand[0]?.id ?? sel.defenseSkill.id })
        }
      }
    }
  }

  // ── Private — utilities ───────────────────────────────────────────────────

  /** Emit turn_started for the current slot, or trigger batch resolution if done. */
  private _emitPhaseAdvance(side: CharacterSide): void {
    if (this._turn.isPhaseComplete) {
      this._resolveAllDeferred(side)
    } else {
      this._emitNextTurnStarted()
    }
  }

  /** Emit turn_started for the currently active TurnManager slot (if any). */
  private _emitNextTurnStarted(): void {
    const snap = this._turn.currentSnapshot
    if (snap) {
      this.emit({
        type: EventType.TURN_STARTED,
        unitId:       snap.characterId,
        order:        snap.order,
        total:        snap.total,
        timeBudgetMs: snap.timeBudgetMs,
      })
    }
  }

  private _getOrCreateSelection(characterId: string): ActionSelection {
    let sel = this.selections.get(characterId)
    if (!sel) {
      sel = { attackSkill: null, defenseSkill: null, target: null, secondAttackSkill: null, secondTarget: null }
      this.selections.set(characterId, sel)
    }
    return sel
  }

  private _checkAndEmitVictory(): void {
    if (!this.battle.hasWinner || this.battle.isOver) return
    this.battle.end()
    const result = this.battle.resolveVictory()
    this._victoryResult = result
    this.emit({
      type:   EventType.BATTLE_ENDED,
      winner: result.winner as TeamSide | null,
      reason: result.reason,
      round:  result.round,
    })
  }

  private _addStat(characterId: string, key: keyof BattleStat, amount: number): void {
    const stat = this.battleStats.get(characterId)
    if (stat) stat[key] += amount
  }

  private _recordDeath(characterId: string, killedBy: string | null): void {
    if (!this.deathLog.has(characterId)) {
      this.deathLog.set(characterId, { round: this.battle.round, killedBy })
    }
  }

  private emit(event: EngineEvent): void {
    this.bus.emit(event)
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function _isStatModType(t: string): boolean {
  return t === 'def_down' || t === 'atk_down' || t === 'mov_down'
      || t === 'def_up'   || t === 'atk_up'
}

/**
 * True for effect types that carry a damage component (ATK-scaled hit).
 * Used to decide whether `computeRawDamage` should be called before the resolver.
 */
function _isDamageCarrying(type: string): boolean {
  return type === 'damage'  || type === 'area'
      || type === 'bleed'   || type === 'poison'  || type === 'burn'
      || type === 'stun'    || type === 'def_down' || type === 'atk_down'
      || type === 'snare'   || type === 'push'    || type === 'lifesteal'
}

/**
 * v3 §6.4 Executor bleed-conditional helper.
 *
 * Returns true if the character currently carries an un-expired bleed
 * effect. Poison and burn are NOT counted — v3 is specific about "bleed".
 * This snapshot MUST be taken before the primary hit so secondaries like
 * cleanse (which would strip the bleed) don't invalidate the condition.
 */
function _hadBleedEffect(target: Character): boolean {
  return target.effects.some((e) => e.type === 'bleed' && !e.isExpired)
}

/** Resolve a cardinal push direction from (Δcol, Δrow) signs. Falls back to 'east'. */
function _offsetToDir(dc: number, dr: number): Direction {
  if (dc > 0 && dr === 0) return 'east'
  if (dc < 0 && dr === 0) return 'west'
  if (dc === 0 && dr < 0) return 'north'
  if (dc === 0 && dr > 0) return 'south'
  if (dc > 0 && dr < 0)   return 'northeast'
  if (dc > 0 && dr > 0)   return 'southeast'
  if (dc < 0 && dr < 0)   return 'northwest'
  if (dc < 0 && dr > 0)   return 'southwest'
  return 'east'
}
