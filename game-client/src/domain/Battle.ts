/**
 * domain/Battle.ts — the root aggregate of a single combat session.
 *
 * Battle owns the two Teams and tracks the macro-level state:
 *   - Current round and phase
 *   - Which side is active
 *   - Win/loss condition
 *
 * Responsibility boundary:
 *   Battle provides queries that span both teams (enemies, area searches,
 *   character lookup) and controls phase/round transitions.
 *   It does NOT resolve skill effects or calculate damage — that belongs
 *   to the engine layer, which calls Battle's mutation methods after
 *   computing all the numbers.
 *
 * No Phaser, no UI, no engine dependencies.
 */

import { Team } from './Team'
import { Character } from './Character'
import type { CharacterSide } from './Character'

// ── Supporting types ──────────────────────────────────────────────────────────

export type PhaseType    = 'movement' | 'action'
export type BattleStatus = 'waiting' | 'active' | 'ended'

/**
 * Why a battle ended.
 *   king_slain         — an enemy killed the opposing king.
 *   simultaneous_kings — both kings died in the same resolution step (draw).
 *   timeout            — the round limit was reached (draw).
 *   forfeit            — one side surrendered voluntarily.
 */
export type VictoryReason =
  | 'king_slain'
  | 'simultaneous_kings'
  | 'timeout'
  | 'forfeit'

/**
 * Structured outcome of a finished battle.
 * `winner` is null on draw (simultaneous kings / timeout).
 */
export interface VictoryResult {
  readonly winner: CharacterSide | null
  readonly reason: VictoryReason
  readonly round:  number
}

export interface BattleConfig {
  leftTeam:  Team
  rightTeam: Team
  /** Initial phase (defaults to 'movement'). */
  startPhase?: PhaseType
  /** Which side moves first (defaults to 'left'). */
  firstSide?: CharacterSide
}

// ── Battle ────────────────────────────────────────────────────────────────────

export class Battle {
  // ── Teams ─────────────────────────────────────────────────────────────────
  readonly leftTeam:  Team
  readonly rightTeam: Team

  // ── Phase / round state ───────────────────────────────────────────────────
  private _phase:       PhaseType
  private _sideIndex:   0 | 1        // 0 = left, 1 = right
  private _round:       number
  private _status:      BattleStatus
  private _forfeitedBy: CharacterSide | null = null

  constructor(config: BattleConfig) {
    this.leftTeam  = config.leftTeam
    this.rightTeam = config.rightTeam
    this._phase     = config.startPhase  ?? 'movement'
    this._sideIndex = config.firstSide === 'right' ? 1 : 0
    this._round     = 1
    this._status    = 'waiting'
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Mark the battle as started. */
  start(): void {
    if (this._status === 'waiting') this._status = 'active'
  }

  /** Mark the battle as ended (called by engine after win-condition check). */
  end(): void {
    this._status = 'ended'
  }

  /**
   * One side surrenders. Ends the battle immediately with a forfeit win
   * for the opposite side. No-op if the battle is already over.
   */
  forfeit(side: CharacterSide): void {
    if (this._status === 'ended') return
    this._status = 'ended'
    this._forfeitedBy = side
  }

  /** The side that forfeited, or null if the battle ended normally. */
  get forfeitedBy(): CharacterSide | null {
    return this._forfeitedBy
  }

  get status(): BattleStatus { return this._status }
  get isActive(): boolean    { return this._status === 'active' }
  get isOver(): boolean      { return this._status === 'ended' }

  // ── Phase / round ─────────────────────────────────────────────────────────

  get phase(): PhaseType   { return this._phase }
  get round(): number      { return this._round }
  get sideIndex(): 0 | 1   { return this._sideIndex }
  get currentSide(): CharacterSide { return this._sideIndex === 0 ? 'left' : 'right' }

  /**
   * Advance to the next phase following the interleaved turn structure:
   *
   *   movement (left)  → movement (right)
   *   movement (right) → action (left — interleaved resolution for both sides)
   *   action   (left)  → movement (left) + round++
   *
   * The action phase is always entered from the left side. Both teams' characters
   * resolve in interleaved order within that single action phase, so there is no
   * separate "action (right)" phase.
   */
  advancePhase(): void {
    if (this._phase === 'movement') {
      if (this._sideIndex === 0) {
        // Left movement done → right side's movement
        this._sideIndex = 1
        return
      }
      // Right movement done → interleaved action phase (always entered as left)
      this._sideIndex = 0
      this._phase     = 'action'
      return
    }

    // End of action phase → new round, back to left movement
    this._sideIndex = 0
    this._phase     = 'movement'
    this._round++
  }

  // ── Win condition ─────────────────────────────────────────────────────────

  /** True if the battle has a winner (one king is dead). */
  get hasWinner(): boolean {
    return this.leftTeam.isDefeated || this.rightTeam.isDefeated
  }

  /**
   * The winning team, or null if the battle is still running.
   * If both kings die simultaneously, neither wins (returns null).
   */
  get winner(): Team | null {
    const leftDefeated  = this.leftTeam.isDefeated
    const rightDefeated = this.rightTeam.isDefeated

    if (leftDefeated && !rightDefeated)  return this.rightTeam
    if (rightDefeated && !leftDefeated)  return this.leftTeam
    return null   // both alive, or simultaneous death (draw edge case)
  }

  /**
   * Build a `VictoryResult` that describes how and why the battle ended.
   *
   * Call this only after `hasWinner` is true or `isOver` is true (timeout/forfeit).
   * For a battle still in progress, returns a timeout result at the current round
   * — useful for forced-end scenarios.
   */
  resolveVictory(reason?: VictoryReason): VictoryResult {
    // Explicit forfeit
    if (this._forfeitedBy !== null) {
      const winner: CharacterSide = this._forfeitedBy === 'left' ? 'right' : 'left'
      return { winner, reason: 'forfeit', round: this._round }
    }

    // Explicit reason override (e.g. timeout passed in by simulation)
    if (reason === 'timeout') {
      return { winner: null, reason: 'timeout', round: this._round }
    }

    const leftDefeated  = this.leftTeam.isDefeated
    const rightDefeated = this.rightTeam.isDefeated

    if (leftDefeated && rightDefeated) {
      return { winner: null, reason: 'simultaneous_kings', round: this._round }
    }
    if (leftDefeated)  return { winner: 'right', reason: 'king_slain', round: this._round }
    if (rightDefeated) return { winner: 'left',  reason: 'king_slain', round: this._round }

    // No winner yet — treat as draw (caller's responsibility to pass 'timeout')
    return { winner: null, reason: 'timeout', round: this._round }
  }

  // ── Team access ───────────────────────────────────────────────────────────

  /** The team whose turn it currently is. */
  get currentTeam(): Team {
    return this._sideIndex === 0 ? this.leftTeam : this.rightTeam
  }

  /** The team that is waiting for the current team to finish its turn. */
  get opposingTeam(): Team {
    return this._sideIndex === 0 ? this.rightTeam : this.leftTeam
  }

  /** The team for the given side. */
  teamOf(side: CharacterSide): Team {
    return side === 'left' ? this.leftTeam : this.rightTeam
  }

  // ── Character lookup ──────────────────────────────────────────────────────

  /**
   * Find a character by ID across both teams.
   * Returns null if not found.
   */
  getCharacter(id: string): Character | null {
    return this.leftTeam.getById(id) ?? this.rightTeam.getById(id) ?? null
  }

  /** All characters from both teams (living and dead). */
  get allCharacters(): ReadonlyArray<Character> {
    return [...this.leftTeam.all, ...this.rightTeam.all]
  }

  /** All living characters from both teams. */
  get livingCharacters(): ReadonlyArray<Character> {
    return [...this.leftTeam.living, ...this.rightTeam.living]
  }

  // ── Cross-team queries ────────────────────────────────────────────────────

  /**
   * All living enemies of `character` (opposite side, alive).
   */
  enemiesOf(character: Character): Character[] {
    return this.teamOf(character.side === 'left' ? 'right' : 'left').living as Character[]
  }

  /**
   * All living allies of `character` (same side, excluding self).
   */
  alliesOf(character: Character): Character[] {
    return this.teamOf(character.side).living.filter((c) => c.id !== character.id) as Character[]
  }

  /**
   * All living characters on `targetSide` within Manhattan distance `radius`
   * of tile (col, row). Used for area-of-effect skill resolution.
   */
  charactersInArea(
    col: number,
    row: number,
    targetSide: CharacterSide,
    radius = 1,
  ): Character[] {
    return this.teamOf(targetSide).living.filter(
      (c) => Math.abs(c.col - col) + Math.abs(c.row - row) <= radius,
    ) as Character[]
  }

  /**
   * All living characters on `targetSide` at exact Manhattan distance 1 from
   * (col, row). Convenience wrapper around `charactersInArea`.
   */
  adjacentEnemies(col: number, row: number, fromSide: CharacterSide): Character[] {
    const enemySide: CharacterSide = fromSide === 'left' ? 'right' : 'left'
    return this.teamOf(enemySide).living.filter(
      (c) => Math.abs(c.col - col) + Math.abs(c.row - row) === 1,
    ) as Character[]
  }

  // ── Display ───────────────────────────────────────────────────────────────

  toString(): string {
    const status = this.isOver
      ? `ENDED — winner: ${this.winner?.side ?? 'draw'}`
      : `Round ${this._round} | ${this.currentSide} | ${this._phase}`
    return `Battle[${status}]`
  }
}
