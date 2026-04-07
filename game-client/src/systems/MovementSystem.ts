import type { UnitData } from '../types'
import type { RuntimeState } from '../entities/Unit'
import { BOARD } from '../data/constants'

const { COLS, ROWS } = BOARD

/**
 * MovementSystem — pure movement rules with no Phaser dependency.
 *
 * All methods are static and accept the unit maps as parameters so that
 * this module is fully testable without a running Phaser scene.
 */
export class MovementSystem {
  /** True if the unit is standing on the wall column that faces the centre. */
  static isTouchingWall(unit: UnitData): boolean {
    return unit.side === 'left' ? unit.col === 7 : unit.col === 8
  }

  /** True if `col` is within the team's half of the board. */
  static isInOwnTerritory(unit: UnitData, col: number): boolean {
    return unit.side === 'left' ? col <= 7 : col >= 8
  }

  /** Returns all living allies adjacent (Manhattan distance = 1) to `unitId`. */
  static getAdjacentAllies(
    unitId: string,
    unitsById: ReadonlyMap<string, UnitData>,
    unitState: ReadonlyMap<string, RuntimeState>,
  ): UnitData[] {
    const unit = unitsById.get(unitId)
    if (!unit) return []

    const result: UnitData[] = []
    for (const ally of unitsById.values()) {
      if (ally.id === unitId || ally.side !== unit.side) continue
      const state = unitState.get(ally.id)
      if (!state?.alive) continue
      const dist = Math.abs(ally.col - unit.col) + Math.abs(ally.row - unit.row)
      if (dist === 1) result.push(ally)
    }
    return result
  }

  /** True if the unit has no living allies adjacent to it. */
  static isIsolated(
    unitId: string,
    unitsById: ReadonlyMap<string, UnitData>,
    unitState: ReadonlyMap<string, RuntimeState>,
  ): boolean {
    return MovementSystem.getAdjacentAllies(unitId, unitsById, unitState).length === 0
  }

  /**
   * True when a unit is allowed to move to (targetCol, targetRow).
   * Checks: own territory, range, and tile occupancy.
   */
  static isMoveAllowed(
    unit: UnitData,
    targetCol: number,
    targetRow: number,
    unitsById: ReadonlyMap<string, UnitData>,
    unitState: ReadonlyMap<string, RuntimeState>,
  ): boolean {
    const runtime = unitState.get(unit.id)
    if (!runtime?.alive) return false
    if (!MovementSystem.isInOwnTerritory(unit, targetCol)) return false

    const distance = Math.abs(unit.col - targetCol) + Math.abs(unit.row - targetRow)
    if (distance === 0 || distance > runtime.mobility) return false

    for (const other of unitsById.values()) {
      if (other.id === unit.id) continue
      const otherState = unitState.get(other.id)
      if (otherState?.alive && other.col === targetCol && other.row === targetRow) return false
    }
    return true
  }

  /** Returns all valid destination tiles for `unit` this turn. */
  static getValidMoves(
    unit: UnitData,
    unitsById: ReadonlyMap<string, UnitData>,
    unitState: ReadonlyMap<string, RuntimeState>,
  ): Array<{ col: number; row: number }> {
    const result: Array<{ col: number; row: number }> = []
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (MovementSystem.isMoveAllowed(unit, col, row, unitsById, unitState)) {
          result.push({ col, row })
        }
      }
    }
    return result
  }
}
