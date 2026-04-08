/**
 * engine/GameEngine.ts — the public API for one battle session.
 *
 * This is the single entry point that external code (renderer, tests,
 * CLI harness) interacts with. Internal engine modules are never
 * imported directly by callers.
 *
 * Usage:
 *   const engine = new GameEngine(config)
 *   engine.on(event => renderer.handle(event))
 *   engine.start()
 *
 *   // Player commands return Result — check .ok before using .value
 *   const r = engine.moveUnit('left-warrior', 5, 3)
 *   if (!r.ok) console.warn(r.error)
 *
 * No Phaser, no DOM, no external dependencies.
 */

import type {
  GameConfig, EngineEvent, Position,
  Result, TeamSide, PhaseType,
  UnitRuntime, UnitDef,
} from './types'
import { Ok, Err, EventType } from './types'
import {
  type BattleState,
  makeRuntime, makeTurn, makeDeck, makeStats,
  currentSide, livingUnitsBySide, PHASE_DURATION,
} from './BattleState'
import { EventBus } from './EventBus'
import { validateMove, applyMove, getAllValidMoves } from './MovementEngine'
import { selectCard, selectTarget, selectArea, currentAttackHand, currentDefenseHand } from './ActionEngine'
import { endPhase, startPhase, isCurrentSideDone } from './TurnEngine'
import { decideMoves, decideActions } from './BotEngine'

export class GameEngine {
  private readonly state:    BattleState
  private readonly bus:      EventBus
  private readonly config:   GameConfig

  constructor(config: GameConfig) {
    this.config = config
    this.bus    = new EventBus()
    this.state  = this._buildState(config)
  }

  // ── Subscription ──────────────────────────────────────────────────────────

  /**
   * Subscribe to all engine events.
   * Returns an unsubscribe function.
   */
  on(handler: (event: EngineEvent) => void): () => void {
    return this.bus.on(handler)
  }

  onType<T extends EngineEvent['type']>(
    type: T,
    handler: (event: Extract<EngineEvent, { type: T }>) => void,
  ): () => void {
    return this.bus.onType(type, handler)
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Begin the battle. Emits `battle_started` and `phase_started`. */
  start(): void {
    if (this.state.battleOver) return
    this.bus.emit({ type: EventType.BATTLE_STARTED })
    this._emit(startPhase(this.state, 'movement', this._phaseDurations()))
    this._maybeRunBot()
  }

  // ── Read-only state queries ───────────────────────────────────────────────

  /** Snapshot of the current phase and side. */
  getTurnInfo(): { phase: PhaseType; side: TeamSide; round: number } {
    return {
      phase: this.state.phase,
      side:  currentSide(this.state),
      round: this.state.roundNumber,
    }
  }

  /** Deep-cloned runtime state for `unitId` (safe to hand to renderer). */
  getUnitRuntime(unitId: string): Readonly<UnitRuntime> | null {
    const rt = this.state.runtime.get(unitId)
    return rt ? { ...rt } : null
  }

  /** Immutable unit definition for `unitId`. */
  getUnitDef(unitId: string): Readonly<UnitDef> | null {
    return this.state.defs.get(unitId) ?? null
  }

  /** All unit IDs (both sides). */
  getAllUnitIds(): string[] {
    return [...this.state.defs.keys()]
  }

  /** All living unit IDs for a given side. */
  getLivingUnits(side: TeamSide): string[] {
    return livingUnitsBySide(this.state, side)
  }

  /** Valid move tiles for `unitId`. All roles use same movement rules. */
  getValidMoves(unitId: string): Position[] {
    return getAllValidMoves(this.state, unitId)
  }

  /** Current attack hand (up to 2 card IDs). */
  getAttackHand(unitId: string): string[] {
    return currentAttackHand(this.state, unitId)
  }

  /** Current defense hand (up to 2 card IDs). */
  getDefenseHand(unitId: string): string[] {
    return currentDefenseHand(this.state, unitId)
  }

  /** True if the battle is over. */
  isBattleOver(): boolean {
    return this.state.battleOver
  }

  /** Winner side, or null if battle is still running. */
  getWinner(): TeamSide | null {
    return this.state.winner
  }

  // ── Player commands ───────────────────────────────────────────────────────

  /**
   * Move `unitId` to (col, row).
   * Only valid during the movement phase for the human player's side.
   */
  moveUnit(unitId: string, col: number, row: number): Result<void> {
    if (this.state.battleOver)       return Err('Battle is over')
    if (this.state.phase !== 'movement') return Err('Not the movement phase')
    if (!this._isHumanUnit(unitId))  return Err('Not your unit')

    const validation = validateMove(this.state, unitId, col, row)
    if (!validation.ok) return validation

    this._emit(applyMove(this.state, unitId, col, row))
    this._autoAdvanceIfDone()
    return Ok(undefined)
  }

  /**
   * Select a card for `unitId` (attack or defense).
   * Only valid during the action phase for the human player's side.
   */
  selectCard(unitId: string, cardId: string): Result<void> {
    if (this.state.battleOver)      return Err('Battle is over')
    if (this.state.phase !== 'action') return Err('Not the action phase')
    if (!this._isHumanUnit(unitId)) return Err('Not your unit')

    const result = selectCard(this.state, unitId, cardId, this.config.cardRegistry)
    if (!result.ok) return result
    this._emit(result.value)
    return Ok(undefined)
  }

  /**
   * Set a unit target for the currently selected attack card.
   */
  selectTarget(unitId: string, targetId: string): Result<void> {
    if (this.state.battleOver)      return Err('Battle is over')
    if (!this._isHumanUnit(unitId)) return Err('Not your unit')

    const result = selectTarget(this.state, unitId, targetId, this.config.cardRegistry)
    if (!result.ok) return result
    this._emit(result.value)
    return Ok(undefined)
  }

  /**
   * Set an area target tile for the currently selected attack card.
   */
  selectAreaTarget(unitId: string, col: number, row: number): Result<void> {
    if (this.state.battleOver)      return Err('Battle is over')
    if (!this._isHumanUnit(unitId)) return Err('Not your unit')

    const result = selectArea(this.state, unitId, col, row, this.config.cardRegistry)
    if (!result.ok) return result
    this._emit(result.value)
    return Ok(undefined)
  }

  /**
   * Force end the current phase (player pressed "End Phase" or timer expired).
   * Advances to the next phase; if it becomes the bot's phase, bot acts automatically.
   */
  endPhase(): Result<void> {
    if (this.state.battleOver) return Err('Battle is over')

    this._emit(endPhase(this.state, this.config.cardRegistry, this._phaseDurations()))

    if (!this.state.battleOver) {
      this._maybeRunBot()
    }
    return Ok(undefined)
  }

  // ── Bot execution ─────────────────────────────────────────────────────────

  /**
   * Run the bot's full turn for the current phase (if it's the bot's turn).
   * Called automatically after phase transitions that land on the bot's side.
   * Can also be called manually by tests or a game harness.
   */
  runBotPhase(): void {
    if (this.state.battleOver) return
    const side = currentSide(this.state)
    if (side !== this.config.botSide) return

    if (this.state.phase === 'movement') {
      this._runBotMovement(side)
    } else {
      this._runBotActions(side)
    }

    // Advance past the bot's phase
    this._emit(endPhase(this.state, this.config.cardRegistry, this._phaseDurations()))

    if (!this.state.battleOver) {
      this._maybeRunBot()
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _isHumanUnit(unitId: string): boolean {
    const def = this.state.defs.get(unitId)
    return def !== undefined && def.side !== this.config.botSide
  }

  /** If it's currently the bot's phase, schedule its execution. */
  private _maybeRunBot(): void {
    const side = currentSide(this.state)
    if (side === this.config.botSide) {
      // Run synchronously (callers that want async can wrap this in a setTimeout)
      this.runBotPhase()
    }
  }

  private _runBotMovement(side: TeamSide): void {
    const decisions = decideMoves(this.state, side)
    for (const { unitId, col, row } of decisions) {
      const v = validateMove(this.state, unitId, col, row)
      if (v.ok) this._emit(applyMove(this.state, unitId, col, row))
    }
  }

  private _runBotActions(side: TeamSide): void {
    const decisions = decideActions(
      this.state, side, this.config.botDifficulty, this.config.cardRegistry,
    )

    for (const d of decisions) {
      // Select defense card
      if (d.defenseId) {
        const r = selectCard(this.state, d.unitId, d.defenseId, this.config.cardRegistry)
        if (r.ok) this._emit(r.value)
      }
      // Select attack card
      if (d.attackId) {
        const r = selectCard(this.state, d.unitId, d.attackId, this.config.cardRegistry)
        if (r.ok) this._emit(r.value)
      }
      // Set target
      if (d.attackId) {
        switch (d.target.kind) {
          case 'unit': {
            const r = selectTarget(this.state, d.unitId, d.target.targetId, this.config.cardRegistry)
            if (r.ok) this._emit(r.value)
            break
          }
          case 'area': {
            const r = selectArea(this.state, d.unitId, d.target.col, d.target.row, this.config.cardRegistry)
            if (r.ok) this._emit(r.value)
            break
          }
          default:
            break
        }
      }
    }
  }

  /**
   * After every player command, check whether the whole side is done.
   * If so, auto-advance to keep the flow going without requiring an
   * explicit "End Phase" press when all units have acted.
   */
  private _autoAdvanceIfDone(): void {
    if (isCurrentSideDone(this.state)) {
      this._emit(endPhase(this.state, this.config.cardRegistry, this._phaseDurations()))
      if (!this.state.battleOver) this._maybeRunBot()
    }
  }

  private _emit(events: EngineEvent[]): void {
    this.bus.emitAll(events)
  }

  private _phaseDurations() {
    return this.config.phaseDurations ?? PHASE_DURATION
  }

  // ── State construction ────────────────────────────────────────────────────

  private _buildState(config: GameConfig): BattleState {
    const state: BattleState = {
      defs:        new Map(),
      runtime:     new Map(),
      turns:       new Map(),
      decks:       new Map(),
      stats:       new Map(),
      phase:       'movement',
      sideIndex:    0,
      roundNumber:  1,
      battleOver:  false,
      winner:      null,
    }

    for (const unit of config.units) {
      const roleStats = config.roleStats[unit.role]
      state.defs.set(unit.id,    unit)
      state.runtime.set(unit.id, makeRuntime(unit, roleStats))
      state.turns.set(unit.id,   makeTurn())
      state.stats.set(unit.id,   makeStats())

      // Build deck from provided config or use first 4 cards as default
      const deckConfig = config.deckConfig[unit.role]
      if (deckConfig) {
        state.decks.set(unit.id, makeDeck(deckConfig))
      } else {
        // Fallback: take all cards of each category as the queue
        const allCards = [...config.cardRegistry.values()].filter(
          (c) => c.id.startsWith(unit.role),
        )
        const attacks  = allCards.filter((c) => c.category === 'attack').map((c) => c.id)
        const defenses = allCards.filter((c) => c.category === 'defense').map((c) => c.id)
        state.decks.set(unit.id, makeDeck({ attackCards: attacks, defenseCards: defenses }))
      }
    }

    return state
  }
}
