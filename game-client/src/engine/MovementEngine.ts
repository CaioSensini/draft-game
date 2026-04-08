/**
 * engine/MovementEngine.ts — pure movement validation and application.
 *
 * All functions are stateless helpers that read BattleState and either
 * return calculated results or mutate state and return events.
 *
 * No Phaser, no DOM, no external dependencies.
 */

import type { Position, TeamSide, UnitRole, EngineEvent } from './types'
import { EventType } from './types'
import type { BattleState } from './BattleState'
import { BOARD } from './BattleState'
import { Ok, Err } from './types'
import type { Result } from './types'

// ── Pure queries ──────────────────────────────────────────────────────────────

/** True if `col` is within the team's half of the board. */
export function isInOwnTerritory(side: TeamSide, col: number): boolean {
  return side === 'left' ? col < BOARD.WALL_COL : col >= BOARD.WALL_COL
}

/** True if the unit is standing on the column immediately facing the wall. */
export function isTouchingWall(side: TeamSide, col: number): boolean {
  return side === 'left' ? col === BOARD.WALL_COL - 1 : col === BOARD.WALL_COL
}

/** Manhattan distance between two positions. */
export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row)
}

/**
 * True if `unitId` has no living allies adjacent (Manhattan distance = 1).
 * Used for the Executor's isolation bonus.
 */
export function isIsolated(state: BattleState, unitId: string): boolean {
  return getAdjacentAllies(state, unitId).length === 0
}

/** Returns all living allies at Manhattan distance exactly 1 from `unitId`. */
export function getAdjacentAllies(state: BattleState, unitId: string): string[] {
  const def = state.defs.get(unitId)
  const rt  = state.runtime.get(unitId)
  if (!def || !rt?.alive) return []

  const result: string[] = []
  for (const [id, other] of state.defs) {
    if (id === unitId || other.side !== def.side) continue
    const otherRt = state.runtime.get(id)
    if (!otherRt?.alive) continue
    if (manhattan(rt, otherRt) === 1) result.push(id)
  }
  return result
}

/**
 * Validate whether `unitId` can move to (col, row) this turn.
 * Returns Ok or Err with a human-readable reason.
 */
export function validateMove(
  state: BattleState,
  unitId: string,
  col: number,
  row: number,
): Result<void> {
  const def  = state.defs.get(unitId)
  const rt   = state.runtime.get(unitId)
  const turn = state.turns.get(unitId)

  if (!def || !rt)           return Err('Unit not found')
  if (!rt.alive)             return Err('Unit is dead')
  if (rt.stunTicks > 0)      return Err('Unit is stunned')
  if (turn?.movedThisPhase)  return Err('Unit already moved this phase')

  if (col < 0 || col >= BOARD.COLS || row < 0 || row >= BOARD.ROWS)
    return Err('Position out of bounds')

  if (!isInOwnTerritory(def.side, col))
    return Err('Cannot move into enemy territory')

  const dist = manhattan(rt, { col, row })
  if (dist === 0)            return Err('Already at target position')
  if (dist > rt.mobility)    return Err(`Out of range (mobility: ${rt.mobility})`)

  // Tile occupied check
  for (const [id, otherRt] of state.runtime) {
    if (id === unitId) continue
    if (otherRt.alive && otherRt.col === col && otherRt.row === row)
      return Err('Tile is occupied')
  }

  return Ok(undefined)
}

/**
 * Apply a validated move: update runtime position, mark moved, emit event.
 * Caller must have validated the move first.
 */
export function applyMove(
  state: BattleState,
  unitId: string,
  col: number,
  row: number,
): EngineEvent[] {
  const rt   = state.runtime.get(unitId)!
  const turn = state.turns.get(unitId)!

  const fromCol = rt.col
  const fromRow = rt.row

  rt.col   = col
  rt.row   = row
  turn.movedThisPhase = true

  return [{ type: EventType.CHARACTER_MOVED, unitId, fromCol, fromRow, toCol: col, toRow: row }]
}

/** Return all valid destination tiles for `unitId` in the current state. */
export function getValidMoves(state: BattleState, unitId: string): Position[] {
  const rt = state.runtime.get(unitId)
  if (!rt?.alive) return []

  const result: Position[] = []
  for (let col = 0; col < BOARD.COLS; col++) {
    for (let row = 0; row < BOARD.ROWS; row++) {
      if (validateMove(state, unitId, col, row).ok) result.push({ col, row })
    }
  }
  return result
}

/** Special king teleport: can jump anywhere in own territory (ignores mobility). */
export function getKingValidMoves(state: BattleState, unitId: string): Position[] {
  const def  = state.defs.get(unitId)
  const rt   = state.runtime.get(unitId)
  const turn = state.turns.get(unitId)

  if (!def || !rt?.alive || turn?.movedThisPhase) return []

  const result: Position[] = []
  for (let col = 0; col < BOARD.COLS; col++) {
    for (let row = 0; row < BOARD.ROWS; row++) {
      if (!isInOwnTerritory(def.side, col)) continue
      if (col === rt.col && row === rt.row) continue
      // Check not occupied
      let occupied = false
      for (const [id, otherRt] of state.runtime) {
        if (id === unitId) continue
        if (otherRt.alive && otherRt.col === col && otherRt.row === row) { occupied = true; break }
      }
      if (!occupied) result.push({ col, row })
    }
  }
  return result
}

/** Unified: returns valid moves for any role (king uses teleport rules). */
export function getAllValidMoves(state: BattleState, unitId: string): Position[] {
  const def = state.defs.get(unitId)
  if (!def) return []
  return def.role === 'king'
    ? getKingValidMoves(state, unitId)
    : getValidMoves(state, unitId)
}

/** Number of living allies touching the wall for `side`. */
export function countWallTouching(state: BattleState, side: TeamSide): number {
  let count = 0
  for (const [id, def] of state.defs) {
    if (def.side !== side) continue
    const rt = state.runtime.get(id)
    if (rt?.alive && isTouchingWall(side, rt.col)) count++
  }
  return count
}

/** True if any living warrior ally is adjacent to the unit with `targetId`. */
export function hasWarriorGuard(state: BattleState, targetId: string): boolean {
  const targetDef = state.defs.get(targetId)
  const targetRt  = state.runtime.get(targetId)
  if (!targetDef || !targetRt?.alive) return false

  for (const [id, def] of state.defs) {
    if (id === targetId || def.side !== targetDef.side || def.role !== 'warrior') continue
    const rt = state.runtime.get(id)
    if (!rt?.alive) continue
    if (manhattan(rt, targetRt) === 1) return true
  }
  return false
}

/** Find bot's best move destination based on role heuristics. */
export function scoreTile(
  state: BattleState,
  unitId: string,
  col: number,
  row: number,
): number {
  const def     = state.defs.get(unitId)!
  const enemies = getEnemyIds(state, def.side)

  if (enemies.length === 0) return 0

  const minEnemyDist = Math.min(
    ...enemies.map((eid) => {
      const ert = state.runtime.get(eid)!
      return Math.abs(ert.col - col) + Math.abs(ert.row - row)
    }),
  )

  switch (def.role as UnitRole) {
    case 'king':
      return -Math.abs(col - BOARD.WALL_COL) - Math.abs(row - 2) * 0.5

    case 'warrior':
      return -minEnemyDist * 2 + (col === BOARD.WALL_COL ? 1 : 0)

    case 'executor': {
      const weakestId = enemies.reduce((a, b) =>
        (state.runtime.get(a)?.hp ?? 999) < (state.runtime.get(b)?.hp ?? 999) ? a : b,
      )
      const wrt = state.runtime.get(weakestId)!
      return -(Math.abs(wrt.col - col) + Math.abs(wrt.row - row)) * 2
    }

    case 'specialist':
      return -Math.abs(col - BOARD.WALL_COL) - Math.abs(row - 2) * 0.3 - minEnemyDist * 0.5
  }
}

function getEnemyIds(state: BattleState, side: TeamSide): string[] {
  const result: string[] = []
  for (const [id, def] of state.defs) {
    if (def.side !== side && state.runtime.get(id)?.alive) result.push(id)
  }
  return result
}
