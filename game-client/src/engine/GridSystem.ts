/**
 * engine/GridSystem.ts — grid geometry and movement validation.
 *
 * Thin facade over MovementSystem and CombatSystem.
 * No Phaser, no side effects — all methods are pure queries.
 */

import type { UnitData, TeamSide } from '../types'
import type { RuntimeState } from '../entities/Unit'
import { MovementSystem } from '../systems/MovementSystem'
import { CombatSystem }   from '../systems/CombatSystem'

export type Position = { col: number; row: number }

export class GridSystem {
  /** All valid destination tiles for a unit this turn. */
  static getValidMoves(
    unit:     UnitData,
    units:    ReadonlyMap<string, UnitData>,
    states:   ReadonlyMap<string, RuntimeState>,
  ): Position[] {
    return MovementSystem.getValidMoves(unit, units, states)
  }

  /** True when a move to (targetCol, targetRow) is legal for the unit. */
  static isMoveAllowed(
    unit:      UnitData,
    targetCol: number,
    targetRow: number,
    units:     ReadonlyMap<string, UnitData>,
    states:    ReadonlyMap<string, RuntimeState>,
  ): boolean {
    return MovementSystem.isMoveAllowed(unit, targetCol, targetRow, units, states)
  }

  /** The first living unit occupying (col, row), or null. */
  static findUnitAt(
    col:    number,
    row:    number,
    units:  ReadonlyMap<string, UnitData>,
    states: ReadonlyMap<string, RuntimeState>,
  ): UnitData | null {
    for (const unit of units.values()) {
      const st = states.get(unit.id)
      if (st?.alive && unit.col === col && unit.row === row) return unit
    }
    return null
  }

  /** Living units on `side` within Manhattan distance 1 of (centerCol, centerRow). */
  static getUnitsInArea(
    centerCol: number,
    centerRow: number,
    side:      TeamSide,
    units:     ReadonlyMap<string, UnitData>,
    states:    ReadonlyMap<string, RuntimeState>,
  ): UnitData[] {
    return CombatSystem.getUnitsInArea(centerCol, centerRow, side, units, states)
  }

  /** True if `unit` has no living ally adjacent to it. */
  static isIsolated(
    unitId: string,
    units:  ReadonlyMap<string, UnitData>,
    states: ReadonlyMap<string, RuntimeState>,
  ): boolean {
    return MovementSystem.isIsolated(unitId, units, states)
  }

  /** True if `unit` is touching the central wall column. */
  static isTouchingWall(unit: UnitData): boolean {
    return MovementSystem.isTouchingWall(unit)
  }
}
