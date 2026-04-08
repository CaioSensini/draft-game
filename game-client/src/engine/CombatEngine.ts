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
}

/** Accumulated stats for one battle. */
export interface BattleStat {
  damageDealt:    number
  damageReceived: number
  healsGiven:     number
  kills:          number
}

// ── Role execution order ──────────────────────────────────────────────────────

const ROLE_ORDER: CharacterRole[] = ['king', 'warrior', 'executor', 'specialist']

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
    if (char.side !== this.battle.currentSide)
      return Err(`Not ${char.side} side's turn`)

    if (skill.category !== 'attack') return Err(`'${skill.name}' is not an attack skill`)

    const deck = this.battle.teamOf(char.side).attackDeck(characterId)
    if (deck && !deck.inHand(skill.id)) return Err(`'${skill.name}' is not in ${char.name}'s current hand`)

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
    if (char.side !== this.battle.currentSide)
      return Err(`Not ${char.side} side's turn`)

    if (skill.category !== 'defense') return Err(`'${skill.name}' is not a defense skill`)

    const deck = this.battle.teamOf(char.side).defenseDeck(characterId)
    if (deck && !deck.inHand(skill.id)) return Err(`'${skill.name}' is not in ${char.name}'s current hand`)

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

    const sel = this._getOrCreateSelection(characterId)
    sel.secondAttackSkill = skill
    sel.secondTarget      = target

    this.emit({ type: EventType.CARD_SELECTED, unitId: characterId, cardId: skill.id, category: 'attack' })
    return Ok(undefined)
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
   * True if every living character on the current side has a full selection.
   * The engine can auto-advance when this becomes true.
   */
  allCurrentSideReady(): boolean {
    return this.battle.currentTeam.living.every((c) => this.hasFullSelection(c.id))
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
    if (char.side !== this.battle.currentSide)
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
    const side    = this.battle.currentSide
    const ordered = this._orderedCharacters(side)
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
    const side = this.battle.currentSide

    const char = this.battle.getCharacter(characterId)
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

    // ── Double Attack: use 2 attacks, skip defense ──
    if (char.doubleAttackNextTurn) {
      char.setDoubleAttackNextTurn(false)
      // First attack
      if (!this.battle.isOver) {
        this._applyAttackSkill(char, sel.attackSkill, sel.target, char.side)
      }
      // Second attack (stored in secondAttackSkill, or falls back to defenseSkill slot
      // which the UI may have repurposed as a second attack when double_attack is active)
      if (!this.battle.isOver) {
        const secondSkill  = sel.secondAttackSkill ?? sel.defenseSkill
        const secondTarget = sel.secondTarget      ?? sel.target
        if (secondSkill && secondSkill.category === 'attack') {
          this._applyAttackSkill(char, secondSkill, secondTarget, char.side)
        }
      }
    } else {
      // ── Normal flow: 1 defense + 1 attack ──
      // Silence Defense: skip the defense skill when silenced
      if (char.isDefenseSilenced) {
        this.emit({ type: EventType.DEFENSE_SILENCED, unitId: char.id, sourceId: '' })
      } else {
        this._applyDefenseSkill(char, sel.defenseSkill)
      }
      if (!this.battle.isOver) {
        this._applyAttackSkill(char, sel.attackSkill, sel.target, char.side)
      }
    }
    if (!this.battle.isOver) {
      this._rotateUsedCards(char, sel)
    }
    this.selections.delete(char.id)

    this._turn.commit()
    this.emit({ type: EventType.TURN_COMMITTED, unitId: characterId, timeUsedMs: snap.timeUsedMs })

    if (this.battle.isOver) return   // king died mid-turn — stop sequencing
    this._emitPhaseAdvance(side)
  }

  /**
   * Explicitly skip the current actor (e.g. the player let the timer run out).
   * Emits `turn_skipped` and then `turn_started` / `actions_resolved`.
   */
  skipCurrentTurn(reason: SkipReason = 'no_selection'): void {
    const id   = this._turn.currentActorId
    const side = this.battle.currentSide
    if (!id) return
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
    const side = this.battle.currentSide
    const orderedChars = this._orderedCharacters(side)

    for (const char of orderedChars) {
      // Halt the entire resolution the moment a king falls —
      // remaining characters on this side do not get to act.
      if (this.battle.isOver) break

      if (!char.alive) continue

      // Stun: skip action, decrement tick
      if (char.isStunned) {
        char.tickEffects()   // decrements stun tick
        continue
      }

      const sel = this.selections.get(char.id)
      if (!sel) continue

      // ── Double Attack: use 2 attacks, skip defense ──
      if (char.doubleAttackNextTurn) {
        char.setDoubleAttackNextTurn(false)
        this._applyAttackSkill(char, sel.attackSkill, sel.target, side)
        if (this.battle.isOver) break
        const secondSkill  = sel.secondAttackSkill ?? sel.defenseSkill
        const secondTarget = sel.secondTarget      ?? sel.target
        if (secondSkill && secondSkill.category === 'attack') {
          this._applyAttackSkill(char, secondSkill, secondTarget, side)
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

        this._applyAttackSkill(char, sel.attackSkill, sel.target, side)
        if (this.battle.isOver) break
      }

      this._rotateUsedCards(char, sel)
    }

    this.selections.clear()
    this.emit({ type: EventType.ACTIONS_RESOLVED, side: side as TeamSide })
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

    for (const char of living) {
      if (this.battle.isOver) break

      const result = char.tickEffects()

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
  }

  // ── Damage formula ────────────────────────────────────────────────────────

  /**
   * Compute raw damage before Character.takeDamage() processes it.
   * Accounts for caster ATK, executor isolation, warrior guard, and wall bonus.
   */
  /**
   * Compute raw damage before Character.takeDamage() processes it.
   *
   * Formula layers (applied in order):
   *   gross  = power × (ATK / ATK_DIVISOR) × (1 + passiveAtkBonus + ruleAtkBonus)
   *   mit    = DEF/200 + passiveMitBonus + ruleMitBonus
   *   final  = max(1, round(gross × (1 − clamp(mit, 0, MAX_MITIGATION))))
   */
  computeRawDamage(caster: Character, target: Character, skill: Skill): number {
    // ATK multiplier — base + passive bonus + global rule bonus
    let atkMult = caster.attack / CombatEngine.ATK_DIVISOR
    atkMult *= (1 + this.passive.getAtkBonus(caster, this.battle)
                  + this.rules.getAtkBonus(caster, this.battle))
    const gross = Math.round(skill.power * atkMult)

    // Mitigation — base DEF + passive bonuses + global rule bonuses
    let mit = target.defense / 200
    mit += this.passive.getMitigationBonus(target, this.battle)
    mit += this.rules.getMitigationBonus(target, this.battle)
    mit  = Math.min(CombatEngine.MAX_MITIGATION, Math.max(0, mit))

    return Math.max(1, Math.round(gross * (1 - mit)))
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

      // Optional second effect (e.g. shield + regen, heal + shield)
      if (skill.secondaryEffect && target.alive) {
        const sec = skill.secondaryEffect
        const secCtx: EffectContext = { ...ctx, power: sec.power, ticks: sec.ticks }
        const secResult = this.resolver.resolve(sec.effectType, secCtx)
        this._processResult(char, target, secResult)
      }
    }
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

    switch (skill.targetType) {

      case 'single': {
        if (target.kind !== 'character') return
        const targetChar = this.battle.getCharacter(target.characterId)
        if (!targetChar?.alive) return
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
        const hits = this._targeting.resolveTargets(skill, caster, target, this.battle) as Character[]
        for (const hit of hits) {
          if (this.battle.isOver) break
          this._applyOffensiveSkill(caster, hit, skill)
        }
        // Always emit AREA_RESOLVED (even on 0 hits) so the renderer can show the blast
        this.emit({
          type: EventType.AREA_RESOLVED,
          centerCol: target.col, centerRow: target.row,
          hitIds: hits.map((c) => c.id),
        })
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
   */
  private _applyOffensiveSkill(caster: Character, target: Character, skill: Skill): void {
    if (!target.alive) return

    // Signal to Phaser: this attack is now executing against this target.
    // Suppressed for area skills — the top-level area announcement in
    // _applyAttackSkill already fired with areaCenter; per-hit events would duplicate it.
    if (skill.targetType !== 'area') {
      this.emit({
        type: EventType.SKILL_USED, unitId: caster.id, skillId: skill.id,
        skillName: skill.name, category: 'attack', targetId: target.id,
      })
    }

    // true_damage bypasses the ATK/DEF formula — use power directly
    const rawDamage = skill.effectType === 'true_damage'
      ? skill.power
      : _isDamageCarrying(skill.effectType)
        ? this.computeRawDamage(caster, target, skill)
        : 0

    const ctx: EffectContext = {
      caster, target, power: skill.power, rawDamage, round: this.battle.round,
    }
    const result = this.resolver.resolve(skill.effectType, ctx)
    this._processResult(caster, target, result)

    if (this.battle.isOver || result.killed) return

    // Post-damage passives (e.g. specialist heal-reduction, future on-hit effects)
    if (result.hpDamage > 0) {
      for (const e of this.passive.onDamageDealt(caster, target, this.battle.round)) {
        this.emit(e)
      }
    }

    // Secondary effect (only when the hit was not evaded, target still alive)
    if (skill.secondaryEffect && !result.evaded && target.alive) {
      const sec = skill.secondaryEffect
      const secCtx: EffectContext = {
        caster, target, power: sec.power, rawDamage: 0, ticks: sec.ticks, round: this.battle.round,
      }
      const secResult = this.resolver.resolve(sec.effectType, secCtx)
      this._processResult(caster, target, secResult)
    }
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

  /** Emit turn_started for the current slot, or actions_resolved if done. */
  private _emitPhaseAdvance(side: CharacterSide): void {
    if (this._turn.isPhaseComplete) {
      this.emit({ type: EventType.ACTIONS_RESOLVED, side: side as TeamSide })
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

  private _orderedCharacters(side: CharacterSide): Character[] {
    const team = this.battle.teamOf(side)
    return ROLE_ORDER
      .map((role) => team.getByRole(role))
      .filter((c): c is Character => c !== null && c.alive)
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
