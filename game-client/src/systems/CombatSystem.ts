import type { UnitData, TeamSide } from '../types'
import type { RuntimeState } from '../entities/Unit'
import { MovementSystem } from './MovementSystem'

// ── Combat tuning constants ────────────────────────────────────────────────
const WARRIOR_GUARD_REDUCTION   = 15  // % mitigation for allies adjacent to a warrior
const EXECUTOR_ISOLATION_BONUS  = 15  // % ATK bonus when executor has no adjacent allies
const WALL_TOUCH_BONUS_PER_UNIT =  5  // % mitigation bonus per ally touching the wall

/**
 * CombatSystem — pure damage, healing, and targeting calculations.
 *
 * All methods are static and side-effect free: they read the unit maps
 * and return numbers/arrays, never modifying state or calling Phaser.
 */
export class CombatSystem {
  // ── Defence bonuses ────────────────────────────────────────────────────

  /** True if any living warrior ally is adjacent to `target`. */
  static hasWarriorGuard(
    target: UnitData,
    unitsById: ReadonlyMap<string, UnitData>,
    unitState: ReadonlyMap<string, RuntimeState>,
  ): boolean {
    for (const ally of unitsById.values()) {
      if (ally.id === target.id || ally.side !== target.side || ally.role !== 'warrior') continue
      const state = unitState.get(ally.id)
      if (!state?.alive) continue
      if (Math.abs(ally.col - target.col) + Math.abs(ally.row - target.row) === 1) return true
    }
    return false
  }

  /** Number of living allies on `side` that are touching the wall. */
  static countWallTouchingAllies(
    side: TeamSide,
    unitsById: ReadonlyMap<string, UnitData>,
    unitState: ReadonlyMap<string, RuntimeState>,
  ): number {
    let count = 0
    for (const unit of unitsById.values()) {
      if (unit.side !== side) continue
      const state = unitState.get(unit.id)
      if (state?.alive && MovementSystem.isTouchingWall(unit)) count++
    }
    return count
  }

  // ── Damage formula ────────────────────────────────────────────────────

  /**
   * Final damage after ATK scaling and mitigation.
   *
   * Formula:
   *   gross = basePower × (casterATK / 50) × isolationBonus?
   *   mit   = DEF/200 + warriorGuard% + wallTouch%  (capped at 90 %)
   *   final = max(1, gross × (1 − mit))
   */
  static computeDirectDamage(
    caster: UnitData,
    target: UnitData,
    basePower: number,
    unitState: ReadonlyMap<string, RuntimeState>,
    unitsById: ReadonlyMap<string, UnitData>,
  ): number {
    const casterState = unitState.get(caster.id)
    const targetState = unitState.get(target.id)
    if (!casterState || !targetState) return basePower

    let atkMult = casterState.attack / 50
    if (caster.role === 'executor' && MovementSystem.isIsolated(caster.id, unitsById, unitState)) {
      atkMult *= 1 + EXECUTOR_ISOLATION_BONUS / 100
    }
    const gross = Math.round(basePower * atkMult)

    let mit = targetState.defense / 200
    if (CombatSystem.hasWarriorGuard(target, unitsById, unitState)) mit += WARRIOR_GUARD_REDUCTION / 100
    mit += (CombatSystem.countWallTouchingAllies(target.side, unitsById, unitState) * WALL_TOUCH_BONUS_PER_UNIT) / 100
    mit = Math.min(0.9, Math.max(0, mit))

    return Math.max(1, Math.round(gross * (1 - mit)))
  }

  // ── Targeting queries ─────────────────────────────────────────────────

  /** The living ally on `side` with the lowest HP ratio (for heal targeting). */
  static findLowestHpAlly(
    side: TeamSide,
    unitsById: ReadonlyMap<string, UnitData>,
    unitState: ReadonlyMap<string, RuntimeState>,
  ): UnitData | null {
    let best: UnitData | null = null
    let bestRatio = Number.MAX_SAFE_INTEGER

    for (const unit of unitsById.values()) {
      if (unit.side !== side) continue
      const state = unitState.get(unit.id)
      if (!state?.alive) continue
      const ratio = state.hp / state.maxHp
      if (ratio < bestRatio) { bestRatio = ratio; best = unit }
    }
    return best
  }

  /**
   * All living units on `side` within Manhattan distance 1 of the centre tile.
   * Used for area-of-effect attacks.
   */
  static getUnitsInArea(
    centerCol: number,
    centerRow: number,
    side: TeamSide,
    unitsById: ReadonlyMap<string, UnitData>,
    unitState: ReadonlyMap<string, RuntimeState>,
  ): UnitData[] {
    const result: UnitData[] = []
    for (const unit of unitsById.values()) {
      if (unit.side !== side) continue
      const state = unitState.get(unit.id)
      if (!state?.alive) continue
      if (Math.abs(unit.col - centerCol) + Math.abs(unit.row - centerRow) <= 1) result.push(unit)
    }
    return result
  }
}
