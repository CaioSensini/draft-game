/**
 * engine/GameController.ts — the public facade of the game engine.
 *
 * GameController is the single entry-point through which the outside world
 * (Phaser scenes, UI, network clients, automated tests) interacts with the
 * game engine. It is a CONTROL LAYER ONLY — no combat math lives here.
 *
 * ── What it does ────────────────────────────────────────────────────────────
 *   - Accepts typed commands (selectAttack, moveCharacter, commitTurn…)
 *   - Validates preconditions and delegates to CombatEngine / domain
 *   - Manages movement-phase tracking (which units moved)
 *   - Manages phase lifecycle (when to advance, tick effects, apply round rules)
 *   - Merges engine events + movement events into one subscribable bus
 *   - Provides read-only queries for rendering (valid moves, targets, area preview)
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 *   - No damage formulas                 → CombatEngine / EffectResolver
 *   - No skill effect logic              → CombatEngine / EffectResolver
 *   - No passive / rule evaluation       → PassiveSystem / CombatRuleSystem
 *   - No domain mutation outside moves   → Character / Skill / Team
 *   - No rendering                       → Phaser scenes
 *
 * ── Phaser integration ──────────────────────────────────────────────────────
 *   Phaser scenes should:
 *     1. Call GameController.create(config) once per battle.
 *     2. Subscribe to events with controller.on() / controller.onType().
 *     3. Issue commands via the typed command methods (selectAttack, etc.).
 *     4. Read display state via the query properties (phase, round, etc.).
 *   Phaser should NOT import CombatEngine or Battle directly.
 */

import { Battle }             from '../domain/Battle'
import type { VictoryResult } from '../domain/Battle'
import { Character }          from '../domain/Character'
import { Skill }              from '../domain/Skill'
import { SkillRegistry }      from '../domain/SkillRegistry'
import type { Position }      from '../domain/Grid'
import { CombatEngine }       from './CombatEngine'
import type { TargetSpec, ActionSelection } from './CombatEngine'
import type { PassiveDefinition } from '../domain/Passive'
import type { CombatRuleDefinition } from '../domain/CombatRule'
import { EventBus }           from './EventBus'
import type { EngineEvent, TeamSide, PhaseType } from './types'
import { Ok, Err, EventType } from './types'
import type { Result }        from './types'
import type { SkipReason }    from './TurnManager'

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Low-level config: pass pre-built domain objects.
 * Use when you need full control over how Battle and CombatEngine are created.
 */
export interface GameControllerConfig {
  battle:   Battle
  engine:   CombatEngine
  registry: SkillRegistry
  /** Phase time limits in seconds (used in phase_started events). */
  phaseDurations?: { movement: number; action: number }
}

/**
 * High-level config: GameController.create() builds everything internally.
 * Preferred for Phaser scenes — just fill in the teams and registry.
 */
export interface GameSetupConfig {
  battle:       Battle
  registry:     SkillRegistry
  passives?:    ReadonlyArray<PassiveDefinition>
  globalRules?: ReadonlyArray<CombatRuleDefinition>
  phaseDurations?: { movement: number; action: number }
}

// ── Default phase durations ───────────────────────────────────────────────────

const DEFAULT_DURATIONS = { movement: 12, action: 15 }

// ── GameController ────────────────────────────────────────────────────────────

export class GameController {
  private readonly _battle:   Battle
  private readonly _engine:   CombatEngine
  private readonly _registry: SkillRegistry
  private readonly _bus:      EventBus
  private readonly _durations: { movement: number; action: number }

  // ── Action-selection state (controller-level UX flow) ───────────────────────

  /** The character the player has currently focused for action selection. */
  private _focusedCharacterId: string | null = null

  /**
   * Set when the player selected an attack skill that requires an explicit
   * target but has not yet provided one. Cleared once chooseTarget() succeeds
   * or cancelAction() is called.
   */
  private _awaitingTarget: { skill: Skill; characterId: string } | null = null

  // ── Movement-selection state ─────────────────────────────────────────────────

  /** The character the player has selected to move during the movement phase. */
  private _selectedForMove: string | null = null

  // ── Constructor ─────────────────────────────────────────────────────────────

  constructor(config: GameControllerConfig) {
    this._battle    = config.battle
    this._engine    = config.engine
    this._registry  = config.registry
    this._bus       = new EventBus()
    this._durations = config.phaseDurations ?? DEFAULT_DURATIONS

    // Forward every engine event to the controller bus so consumers only need
    // to subscribe here — they never need a direct reference to CombatEngine.
    this._engine.on((event) => this._bus.emit(event))

    // Auto-reset action state whenever a turn completes, is skipped, or battle ends
    this._bus.onType(EventType.TURN_COMMITTED,  () => this._resetActionState())
    this._bus.onType(EventType.TURN_SKIPPED,    () => this._resetActionState())
    this._bus.onType(EventType.BATTLE_ENDED,    () => this._resetActionState())

    // Auto-reset move selection after the character moves or the phase ends
    this._bus.onType(EventType.CHARACTER_MOVED, (e) => {
      if (e.unitId === this._selectedForMove) this._clearMoveSelectionInternal()
    })
    this._bus.onType(EventType.PHASE_ENDED, () => this._clearMoveSelectionInternal())
  }

  // ── Static factory ──────────────────────────────────────────────────────────

  /**
   * Preferred way to create a GameController for a battle.
   * Builds CombatEngine internally with the supplied catalogs.
   *
   * Phaser usage:
   *   const ctrl = GameController.create({
   *     battle,
   *     registry,
   *     passives:    PASSIVE_CATALOG,
   *     globalRules: GLOBAL_RULES,
   *   })
   */
  static create(config: GameSetupConfig): GameController {
    const engine = new CombatEngine(
      config.battle,
      undefined,
      config.passives,
      config.globalRules,
    )
    return new GameController({
      battle:         config.battle,
      engine,
      registry:       config.registry,
      phaseDurations: config.phaseDurations,
    })
  }

  // ── Event subscription ──────────────────────────────────────────────────────

  /**
   * Subscribe to ALL engine + movement events on the unified bus.
   * Returns an unsubscribe function — store it and call it on scene shutdown.
   *
   * Phaser usage:
   *   this._unsub = controller.on((event) => this._handleEvent(event))
   *   // In scene shutdown:
   *   this._unsub()
   */
  on(handler: (event: EngineEvent) => void): () => void {
    return this._bus.on(handler)
  }

  /**
   * Subscribe to a specific event type only.
   * Fully typed — the handler receives the narrowed event object.
   *
   * Phaser usage:
   *   controller.onType('unit_died', ({ unitId, wasKing }) => { … })
   */
  onType<T extends EngineEvent['type']>(
    type: T,
    handler: (event: Extract<EngineEvent, { type: T }>) => void,
  ): () => void {
    return this._bus.onType(type, handler)
  }

  // ── Lifecycle commands ──────────────────────────────────────────────────────

  /**
   * Start the battle: mark as active, sync the grid, emit battle_started and
   * the first phase_started event, evaluate opening round rules.
   *
   * Call once after creating the controller, before any player input.
   */
  startBattle(): void {
    this._battle.start()
    this._engine.syncGrid(this._battle.allCharacters)
    this._bus.emit({ type: EventType.BATTLE_STARTED })
    this._bus.emit({ type: EventType.ROUND_STARTED, round: this._battle.round })
    this._engine.applyRoundStartRules()
    this._bus.emit({
      type:     EventType.PHASE_STARTED,
      phase:    this._battle.phase,
      side:     this._battle.currentSide as TeamSide,
      duration: this._durations[this._battle.phase],
    })
  }

  /**
   * One side surrenders. Ends the battle immediately.
   * Emits `battle_ended` with reason 'forfeit'.
   */
  forfeit(side: TeamSide): void {
    this._engine.forfeit(side)
  }

  // ── Movement phase commands ─────────────────────────────────────────────────

  /**
   * Select a character for movement during the movement phase.
   *
   * Validates:
   *   - Current phase is 'movement'
   *   - Character exists, is alive, and belongs to the active side
   *   - Character has not already moved this phase
   *
   * Emits `MOVE_CHARACTER_SELECTED`. The UI should then call
   * `getValidMoves(characterId)` to show destination tiles.
   * Clears any previous move selection first.
   */
  selectForMove(characterId: string): Result<void> {
    const char = this._battle.getCharacter(characterId)
    if (!char)       return Err(`Character '${characterId}' not found`)
    if (!char.alive) return Err(`${char.name} is dead`)
    if (this._battle.phase !== 'movement')
      return Err('Character movement selection requires the movement phase')
    if (char.side !== this._battle.currentSide)
      return Err(`Not ${char.side} side's turn`)
    if (this._engine.hasMoved(characterId))
      return Err(`${char.name} already moved this phase`)

    // Clear previous selection silently, then announce new one
    this._selectedForMove = characterId
    this._bus.emit({ type: EventType.MOVE_CHARACTER_SELECTED, unitId: characterId })
    return Ok(undefined)
  }

  /**
   * Clear the current move selection without advancing the phase.
   * Emits `MOVE_SELECTION_CLEARED`.
   */
  clearMoveSelection(): void {
    this._clearMoveSelectionInternal()
  }

  /** The character currently selected for movement, or null. */
  get selectedForMoveId(): string | null {
    return this._selectedForMove
  }

  /**
   * Move `characterId` to tile (toCol, toRow).
   *
   * Validates:
   *   - Current phase is 'movement'
   *   - Character belongs to the active side
   *   - Character has not already moved this phase
   *   - Destination is in bounds and within territory
   *   - Destination is not occupied by another character
   *   - Manhattan distance ≤ character's mobility (king: unlimited in territory)
   *
   * On success: updates domain position, emits `unit_moved`.
   */
  /**
   * Move `characterId` to (toCol, toRow).
   * All validation is performed by CombatEngine (phase, side, alive, range, occupancy).
   * CHARACTER_MOVED is emitted by CombatEngine and forwarded to this bus automatically.
   */
  moveCharacter(characterId: string, toCol: number, toRow: number): Result<void> {
    return this._engine.moveCharacter(characterId, toCol, toRow)
  }

  /** True if `characterId` has already moved during the current movement phase. */
  hasMoved(characterId: string): boolean {
    return this._engine.hasMoved(characterId)
  }

  // ── Action phase commands ───────────────────────────────────────────────────

  /**
   * Register an attack skill + target for `characterId`.
   * Delegates to CombatEngine.selectAttack after resolving the skill by ID.
   *
   * Returns Err if the skill ID is unknown, the character is invalid / stunned,
   * or the target is out of range / wrong side.
   */
  selectAttack(
    characterId: string,
    skillId:     string,
    target:      TargetSpec,
  ): Result<void> {
    const skill = this._registry.find(skillId)
    if (!skill) return Err(`Unknown skill '${skillId}'`)
    return this._engine.selectAttack(characterId, skill, target)
  }

  /**
   * Register a defense skill for `characterId`.
   * Delegates to CombatEngine.selectDefense after resolving the skill by ID.
   */
  selectDefense(characterId: string, skillId: string): Result<void> {
    const skill = this._registry.find(skillId)
    if (!skill) return Err(`Unknown skill '${skillId}'`)
    return this._engine.selectDefense(characterId, skill)
  }

  /**
   * Clear a character's current selections (attack + defense + target).
   * Useful when the player changes their mind before committing.
   */
  clearSelection(characterId: string): void {
    this._engine.clearSelection(characterId)
  }

  /**
   * Begin the sequential per-actor turn loop for the current side.
   * Must be called once at the start of each action phase before commitTurn().
   * Emits `turn_started` for the first actor.
   */
  beginActionPhase(): void {
    this._engine.beginActionPhase()
  }

  /**
   * Commit the current actor's turn: apply defense + attack selections and
   * advance the turn cursor to the next actor.
   *
   * Emits `turn_committed` or `turn_skipped` (for dead/stunned actors).
   * Emits `turn_started` for the next actor, or `actions_resolved` if done.
   *
   * Returns Err when there is no active actor (phase already complete).
   */
  commitTurn(): Result<void> {
    if (!this._engine.getCurrentActor()) return Err('No active actor — phase may be complete')
    this._engine.commitCurrentTurn()
    return Ok(undefined)
  }

  /**
   * Resolve the next step in the deferred resolution queue.
   * Returns 'attack' (attack resolved, defense pending), 'defense' (defense resolved),
   * or 'done' (all characters resolved, ACTIONS_RESOLVED emitted).
   */
  resolveNextDeferred(): 'attack' | 'defense' | 'done' {
    return this._engine.resolveNextDeferred()
  }

  /**
   * Explicitly skip the current actor's turn (e.g. player timer ran out).
   * Emits `turn_skipped` with the provided reason.
   */
  skipTurn(reason: SkipReason = 'no_selection'): void {
    this._engine.skipCurrentTurn(reason)
  }

  // ── Phase lifecycle ─────────────────────────────────────────────────────────

  /**
   * Advance to the next phase in the turn sequence.
   *
   * Sequence (interleaved):
   *   movement (left)  → movement (right)
   *   movement (right) → action (left — interleaved, both sides resolve)
   *   action   (left)  → movement (left) + new round
   *
   * Side effects at round boundary:
   *   - tickStatusEffects() — advances DoT/HoT/stun on all living characters
   *   - round_started event emitted
   *   - applyRoundStartRules() — re-evaluates global combat rules
   *   - movement tracking cleared for the new phase
   *   - grid re-synced with current positions
   *
   * Emits `phase_ended` before advancing and `phase_started` after.
   * No-op when the battle is already over.
   */
  advancePhase(): void {
    if (this._battle.isOver) return

    const endedPhase = this._battle.phase
    const endedSide  = this._battle.currentSide as TeamSide

    this._bus.emit({ type: EventType.PHASE_ENDED, phase: endedPhase, side: endedSide })

    const wasActionPhase = endedPhase === 'action'

    this._battle.advancePhase()

    if (this._battle.isOver) return

    // Round boundary: the interleaved action phase has resolved (both sides
    // act within a single action phase now, so the boundary is simply after
    // any action phase ends — no need to check which side it was).
    //
    // v3 §2.3 — DoT ticking moved to beginActionPhase (start of next action
    // phase) so DoTs resolve BEFORE heals that turn. We no longer call
    // tickStatusEffects here; CombatEngine handles it at the right moment.
    if (wasActionPhase) {
      if (!this._battle.isOver) {
        this._bus.emit({ type: EventType.ROUND_STARTED, round: this._battle.round })
        this._engine.applyRoundStartRules()

        // ── Overtime: % max HP damage to ALL characters from round 12 ──
        // Bypasses shield, evade, immunity — pure HP burn
        // Scales: R12=5%, R13=8%, R14=11%, R15=14%... (+3% per round)
        // Uses % of maxHp so no class has advantage (tank vs squishy fair)
        const round = this._battle.round
        if (round >= 12 && !this._battle.isOver) {
          const pct = (5 + (round - 12) * 3) / 100
          for (const char of [...this._battle.livingCharacters]) {
            if (this._battle.isOver) break
            const dmg = Math.max(1, Math.round(char.maxHp * pct))
            const killed = char.applyPureDamage(dmg)
            this._bus.emit({
              type: EventType.DAMAGE_APPLIED,
              unitId: char.id,
              amount: dmg,
              newHp: char.hp,
              sourceId: null,
            })
            if (killed) {
              this._bus.emit({
                type: EventType.CHARACTER_DIED,
                unitId: char.id,
                killedBy: null,
                wasKing: char.role === 'king',
                round,
              })
            }
          }
        }
      }
    }

    if (!this._battle.isOver) {
      // Reset movement tracking and re-sync grid for the new movement phase
      if (this._battle.phase === 'movement') {
        this._engine.resetMovementPhase()
        this._engine.syncGrid(this._battle.allCharacters)
      }

      this._bus.emit({
        type:     EventType.PHASE_STARTED,
        phase:    this._battle.phase,
        side:     this._battle.currentSide as TeamSide,
        duration: this._durations[this._battle.phase],
      })
    }
  }

  // ── Read-only queries ───────────────────────────────────────────────────────

  /** Current phase: 'movement' or 'action'. */
  get phase(): PhaseType { return this._battle.phase }

  /** Current round number (1-based). */
  get round(): number { return this._battle.round }

  /** The side whose turn it currently is. */
  get currentSide(): TeamSide { return this._battle.currentSide as TeamSide }

  /** True once the battle ends (king slain, timeout, forfeit). */
  get isBattleOver(): boolean { return this._battle.isOver }

  /**
   * True when all actors in the current action phase have committed or been
   * skipped. The caller should then call advancePhase().
   */
  get isPhaseComplete(): boolean { return this._engine.isPhaseComplete }

  /** The character whose action turn is currently active. Null outside action phase. */
  get currentActor(): Character | null { return this._engine.getCurrentActor() }

  /** The final battle outcome. Null while the battle is still in progress. */
  get victoryResult(): VictoryResult | null { return this._engine.getVictoryResult() }

  /** Look up any character by ID. */
  getCharacter(id: string): Character | null {
    return this._battle.getCharacter(id)
  }

  /** Look up a skill by ID from the registry. */
  getSkill(id: string): Skill | null {
    return this._registry.find(id)
  }

  /**
   * The current attack and defense hand for `characterId`.
   * Returns null if the character is not found.
   * Useful for auto-players and AI systems that need to know what's available.
   */
  getHand(characterId: string): { attack: ReadonlyArray<Skill>; defense: ReadonlyArray<Skill> } | null {
    const char = this._battle.getCharacter(characterId)
    if (!char) return null
    const team = this._battle.teamOf(char.side)
    return {
      attack:  team.attackDeck(characterId)?.hand  ?? [],
      defense: team.defenseDeck(characterId)?.hand ?? [],
    }
  }

  /** The current attack + defense selections for a character. */
  getSelection(characterId: string): ActionSelection | null {
    return this._engine.getSelection(characterId)
  }

  /** True if every living character on the current side has a full selection. */
  allCurrentSideReady(): boolean {
    return this._engine.allCurrentSideReady()
  }

  /** Combat stats accumulated by a character this battle. */
  getStats(characterId: string) {
    return this._engine.getStats(characterId)
  }

  /**
   * All tile positions the character can legally move to this phase.
   * Empty when: dead, already moved, or not the movement phase.
   * King: full territory (no range limit).
   * Others: Manhattan distance ≤ character.mobility.
   */
  /** All tile positions the character can legally move to. Delegates to CombatEngine. */
  getValidMoves(characterId: string): Position[] {
    return this._engine.getValidMoves(characterId)
  }

  /**
   * All valid unit targets for `skillId` from `characterId`.
   * Respects skill range (0 = unrestricted). Empty for area skills.
   */
  getValidTargets(characterId: string, skillId: string): Character[] {
    const skill = this._registry.find(skillId)
    if (!skill) return []
    return this._engine.getValidTargets(characterId, skill)
  }

  /**
   * All valid aim-point tiles for an area skill.
   * Empty for non-area skills.
   */
  getValidAreaPositions(characterId: string, skillId: string): Position[] {
    const skill = this._registry.find(skillId)
    if (!skill) return []
    return this._engine.getValidAreaPositions(characterId, skill)
  }

  /**
   * All tiles that would be hit if `skillId` is aimed at the given centre tile.
   * Useful for rendering the area-preview highlight overlay.
   */
  previewArea(skillId: string, centerCol: number, centerRow: number): Position[] {
    const skill = this._registry.find(skillId)
    if (!skill) return []
    return this._engine.previewArea(skill, centerCol, centerRow)
  }

  /**
   * Snapshot of all active global rule bonuses for every living character.
   * Useful for the HUD and AI decision-making.
   */
  getRuleSnapshot(): Map<string, { atkBonus: number; mitBonus: number }> {
    return this._engine.rules.snapshot(this._battle)
  }

  /**
   * Per-side breakdown of the wall-touch buff currently in effect.
   *
   * Each entry contains:
   *   - `count`    — living allies touching the central wall column
   *   - `atkBonus` — extra outgoing ATK multiplier (e.g. 0.20 = +20%)
   *   - `mitBonus` — extra incoming mitigation     (e.g. 0.20 = +20%)
   *   - `ruleId`   — id of the rule that produced the bonus
   *
   * Empty map if no `wall_mit_per_toucher` rule is registered.
   * The BattleScene status panels poll this snapshot whenever stats refresh
   * so players can see the team-wide buff that would otherwise be invisible
   * (it's not stored on individual characters).
   */
  getWallBuffSnapshot(): Map<TeamSide, {
    count:    number
    atkBonus: number
    mitBonus: number
    ruleId:   string
  }> {
    return this._engine.rules.getWallBuffSnapshot(this._battle)
  }

  // ── High-level action flow (select → use → target) ──────────────────────────

  /**
   * Focus a character for action selection during the action phase.
   *
   * Validates:
   *   - Current phase is 'action'
   *   - Character exists, is alive, and belongs to the active side
   *
   * Emits `character_focused`. Cancels any previous focus (emits
   * `selection_cancelled` for the previously focused character first).
   */
  /**
   * Focus a character for action selection.
   * All invariant validation (phase, alive, correct side) is performed by
   * CombatEngine.canActThisTurn(). GameController only manages the UX focus state.
   */
  selectCharacter(characterId: string): Result<void> {
    const validation = this._engine.canActThisTurn(characterId)
    if (!validation.ok) return validation

    // Cancel any previous focus before switching to a new character
    if (this._focusedCharacterId && this._focusedCharacterId !== characterId) {
      this._resetActionState()
    }

    this._focusedCharacterId = characterId
    this._bus.emit({ type: EventType.CHARACTER_FOCUSED, unitId: characterId })
    return Ok(undefined)
  }

  /**
   * Use a skill for the currently focused character.
   *
   * Behaviour depends on skill category and target type:
   *   - **Defense skill**: registered immediately; no target needed.
   *   - **Attack, self / lowest_ally / all_allies**: registered immediately
   *     with the inferred target spec.
   *   - **Attack, single**: sets awaiting-target state; emits `awaiting_target`
   *     with targetMode 'unit'.
   *   - **Attack, area**: sets awaiting-target state; emits `awaiting_target`
   *     with targetMode 'tile'.
   *
   * Emits `selection_ready` when both attack and defense are now registered.
   *
   * Returns Err when:
   *   - No character is focused
   *   - The skill is not in the focused character's current hand
   *   - The engine rejects the selection (e.g. wrong phase, stunned, etc.)
   */
  useSkill(skillId: string): Result<void> {
    if (!this._focusedCharacterId)
      return Err('No character focused — call selectCharacter first')

    const characterId = this._focusedCharacterId

    const skill = this._registry.find(skillId)
    if (!skill) return Err(`Unknown skill '${skillId}'`)

    if (skill.category === 'defense') {
      const result = this._engine.selectDefense(characterId, skill)
      if (!result.ok) return result
    } else {
      // Attack skill — determine if we can resolve the target immediately
      const auto = this._autoTargetSpec(skill)
      if (auto !== null) {
        const result = this._engine.selectAttack(characterId, skill, auto)
        if (!result.ok) return result
      } else {
        // Needs explicit target — enter awaiting-target mode
        this._awaitingTarget = { skill, characterId }
        const targetMode: 'unit' | 'tile' =
          skill.targetType === 'area' ? 'tile' : 'unit'
        this._bus.emit({ type: EventType.AWAITING_TARGET, unitId: characterId, skillId, targetMode })
        return Ok(undefined)
      }
    }

    this._maybeEmitSelectionReady(characterId)
    return Ok(undefined)
  }

  /**
   * Provide the explicit target requested by a previous `useSkill` call.
   *
   * Accepts either:
   *   - `{ kind: 'character'; characterId: string }` for single-target attacks
   *   - `{ kind: 'area'; col: number; row: number }` for area attacks
   *
   * On success, delegates to `engine.selectAttack()` and clears awaiting state.
   * Emits `selection_ready` when both attack and defense are now registered.
   *
   * Returns Err when no skill is awaiting a target, or the engine rejects it.
   */
  chooseTarget(spec: Extract<TargetSpec, { kind: 'character' } | { kind: 'area' }>): Result<void> {
    if (!this._awaitingTarget)
      return Err('No skill is awaiting a target — call useSkill first')

    const { skill, characterId } = this._awaitingTarget

    const result = this._engine.selectAttack(characterId, skill, spec)
    if (!result.ok) return result

    this._awaitingTarget = null
    this._maybeEmitSelectionReady(characterId)
    return Ok(undefined)
  }

  /**
   * Cancel the current action selection state.
   * Clears focus and any awaiting-target state.
   * Emits `selection_cancelled`.
   */
  cancelAction(): void {
    const prev = this._focusedCharacterId
    this._resetActionState()
    this._bus.emit({ type: EventType.SELECTION_CANCELLED, unitId: prev })
  }

  // ── Action-state queries ────────────────────────────────────────────────────

  /** The character currently focused for action selection, or null. */
  get focusedCharacterId(): string | null {
    return this._focusedCharacterId
  }

  /** True when `useSkill` has been called and is waiting for a target. */
  get isAwaitingTarget(): boolean {
    return this._awaitingTarget !== null
  }

  /** The skill ID waiting for a target, or null. */
  get awaitingTargetSkillId(): string | null {
    return this._awaitingTarget?.skill.id ?? null
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Reset all action-selection state without emitting any event.
   * Used internally by auto-reset listeners and cancelAction().
   */
  private _resetActionState(): void {
    this._focusedCharacterId = null
    this._awaitingTarget     = null
  }

  /**
   * Clear move selection state and emit MOVE_SELECTION_CLEARED.
   * No-op if nothing is selected.
   */
  private _clearMoveSelectionInternal(): void {
    if (this._selectedForMove === null) return
    this._selectedForMove = null
    this._bus.emit({ type: EventType.MOVE_SELECTION_CLEARED })
  }

  /**
   * If the focused character now has both attack and defense selected,
   * emit `selection_ready`.
   */
  private _maybeEmitSelectionReady(characterId: string): void {
    const sel = this._engine.getSelection(characterId)
    if (sel?.attackSkill && sel.defenseSkill) {
      this._bus.emit({ type: EventType.SELECTION_READY, unitId: characterId })
    }
  }

  /**
   * Returns a TargetSpec that can be inferred from skill metadata alone,
   * or null when the player must provide an explicit target.
   */
  private _autoTargetSpec(skill: Skill): TargetSpec | null {
    switch (skill.targetType) {
      case 'self':        return { kind: 'self' }
      case 'lowest_ally': return { kind: 'lowest_ally' }
      case 'all_allies':  return { kind: 'all_allies' }
      default:            return null   // 'single' and 'area' need explicit input
    }
  }

}
