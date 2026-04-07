/**
 * engine/TurnManager.ts — per-character turn sequencer for one action phase.
 *
 * Tracks which character is currently active, whether they have acted or been
 * skipped, and carries a time-budget field for future real-time integration.
 *
 * Design constraints:
 *   - Zero domain imports — operates purely on character ID strings.
 *   - Immutable order: the sequence is fixed when the phase begins.
 *   - Strict one-at-a-time enforcement via `currentActorId`.
 *   - Forward-only state machine: pending → active → committed | skipped.
 *
 * Turn lifecycle:
 *   1. `beginPhase(ids)` — set actor list, activate first slot.
 *   2. `currentActorId` — who must act now.
 *   3. `commit()` — actor finished acting; advance cursor.
 *      `skip(reason)` — actor bypassed (stunned / dead / timed out); advance.
 *   4. When `isPhaseComplete`, all slots are settled.
 *
 * Time budget (future timer integration):
 *   - `timeBudgetMs` — maximum ms allotted per turn (0 = unlimited).
 *   - `recordTimeUsed(ms)` — called by the timer subsystem.
 *   - `currentTimedOut` — true when the budget is exceeded.
 *
 * No Phaser, no UI, no engine dependencies.
 */

// ── Supporting types ──────────────────────────────────────────────────────────

/** Lifecycle state of one character's slot within a phase. */
export type TurnStatus =
  | 'pending'     // queued, hasn't acted yet
  | 'active'      // currently their turn
  | 'committed'   // acted successfully this phase
  | 'skipped'     // bypassed (stunned / dead / timed-out / no selection)

/** Why a character's turn was skipped. */
export type SkipReason =
  | 'stunned'
  | 'dead'
  | 'no_selection'  // no attack+defense registered before commit
  | 'timed_out'     // exceeded timeBudgetMs

/** Read-only snapshot of one actor's state. */
export interface TurnSnapshot {
  readonly characterId:  string
  readonly status:       TurnStatus
  readonly skipReason:   SkipReason | null
  /** 1-based position in the phase sequence. */
  readonly order:        number
  /** Total number of actors registered for this phase. */
  readonly total:        number
  /** Per-turn budget in ms. 0 = unlimited. */
  readonly timeBudgetMs: number
  /** Milliseconds consumed so far (updated by recordTimeUsed). */
  readonly timeUsedMs:   number
}

// ── Internal slot ─────────────────────────────────────────────────────────────

interface Slot {
  id:         string
  status:     TurnStatus
  skipReason: SkipReason | null
  timeUsedMs: number
}

// ── TurnManager ───────────────────────────────────────────────────────────────

export class TurnManager {
  private _slots:  Slot[]
  private _cursor: number

  /**
   * Per-turn time budget in milliseconds.
   * 0 means unlimited (the timer subsystem never fires).
   * The value is read-only after construction; change it by creating a new
   * TurnManager or calling `beginPhase()` with a new instance.
   */
  readonly timeBudgetMs: number

  constructor(timeBudgetMs = 0) {
    this.timeBudgetMs = timeBudgetMs
    this._slots  = []
    this._cursor = 0
  }

  // ── Phase initialisation ──────────────────────────────────────────────────

  /**
   * (Re-)initialise for a new action phase.
   * Call this once per phase before any selections or commits.
   */
  beginPhase(characterIds: string[]): void {
    this._cursor = 0
    this._slots  = characterIds.map((id) => ({
      id,
      status:     'pending' as TurnStatus,
      skipReason: null,
      timeUsedMs: 0,
    }))
    if (this._slots.length > 0) this._slots[0].status = 'active'
  }

  // ── State queries ─────────────────────────────────────────────────────────

  /** The ID of the character whose turn it currently is. Null when phase is done. */
  get currentActorId(): string | null {
    const slot = this._slots[this._cursor]
    return slot?.status === 'active' ? slot.id : null
  }

  /** True if all slots have been committed or skipped. */
  get isPhaseComplete(): boolean {
    return this._cursor >= this._slots.length
  }

  /** Number of slots not yet settled (pending + active). */
  get pendingCount(): number {
    return this._slots.filter((s) => s.status === 'pending' || s.status === 'active').length
  }

  /** Characters still waiting to act (excluding the current active actor). */
  get upcomingActors(): ReadonlyArray<string> {
    return this._slots
      .filter((s) => s.status === 'pending')
      .map((s) => s.id)
  }

  /** True if `characterId` is the currently active actor. */
  isCurrentActor(characterId: string): boolean {
    return this.currentActorId === characterId
  }

  /** True if `characterId` is registered in this phase (any status). */
  isRegistered(characterId: string): boolean {
    return this._slots.some((s) => s.id === characterId)
  }

  /** True if the current actor has exceeded their time budget (only when budget > 0). */
  get currentTimedOut(): boolean {
    if (this.isPhaseComplete || this.timeBudgetMs === 0) return false
    const slot = this._slots[this._cursor]
    return slot !== undefined && slot.timeUsedMs >= this.timeBudgetMs
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────

  /** Read-only view of a character's turn state. Null if not registered. */
  snapshot(characterId: string): TurnSnapshot | null {
    const idx  = this._slots.findIndex((s) => s.id === characterId)
    if (idx === -1) return null
    const slot = this._slots[idx]
    return {
      characterId:  slot.id,
      status:       slot.status,
      skipReason:   slot.skipReason,
      order:        idx + 1,
      total:        this._slots.length,
      timeBudgetMs: this.timeBudgetMs,
      timeUsedMs:   slot.timeUsedMs,
    }
  }

  /** Snapshot of the current actor, or null when phase is complete. */
  get currentSnapshot(): TurnSnapshot | null {
    return this._cursor < this._slots.length
      ? this.snapshot(this._slots[this._cursor].id)
      : null
  }

  /** Snapshots for every actor, in turn order. */
  allSnapshots(): ReadonlyArray<TurnSnapshot> {
    return this._slots.map((slot, i) => ({
      characterId:  slot.id,
      status:       slot.status,
      skipReason:   slot.skipReason,
      order:        i + 1,
      total:        this._slots.length,
      timeBudgetMs: this.timeBudgetMs,
      timeUsedMs:   slot.timeUsedMs,
    }))
  }

  // ── Advancement ───────────────────────────────────────────────────────────

  /**
   * Mark the current actor's turn as committed (they successfully acted).
   * Activates the next slot.
   */
  commit(): void {
    if (this.isPhaseComplete) return
    this._slots[this._cursor].status = 'committed'
    this._advance()
  }

  /**
   * Mark the current actor's turn as skipped (they cannot or did not act).
   * Activates the next slot.
   */
  skip(reason: SkipReason = 'stunned'): void {
    if (this.isPhaseComplete) return
    const slot   = this._slots[this._cursor]
    slot.status     = 'skipped'
    slot.skipReason = reason
    this._advance()
  }

  // ── Timer interface (future real-time integration) ────────────────────────

  /**
   * Record time consumed on the current actor's turn.
   * Called by the external timer subsystem; the game loop passes elapsed ms.
   * Has no effect once the phase is complete.
   */
  recordTimeUsed(ms: number): void {
    if (this.isPhaseComplete) return
    this._slots[this._cursor].timeUsedMs += ms
  }

  // ── Display ───────────────────────────────────────────────────────────────

  toString(): string {
    if (this._slots.length === 0) return 'TurnManager[empty]'
    const parts = this._slots.map((s, i) => {
      const arrow = i === this._cursor && !this.isPhaseComplete ? '→' : ' '
      const tag   = s.status === 'committed' ? '✓'
                  : s.status === 'skipped'   ? '✗'
                  : s.status === 'active'    ? '●'
                  :                            '○'
      return `${arrow}${tag}${s.id}`
    })
    return `TurnManager[ ${parts.join('  ')} ]`
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _advance(): void {
    this._cursor++
    if (this._cursor < this._slots.length) {
      this._slots[this._cursor].status = 'active'
    }
  }
}
