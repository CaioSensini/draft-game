/**
 * engine/CombatCalc.ts — low-level pure helpers for the BattleState pipeline.
 *
 * These functions operate on the plain-data BattleState maps (not on domain
 * entities). They support ActionEngine and TurnEngine from the original
 * engine layer. Renamed from CombatEngine.ts to free that name for the
 * domain-based combat orchestrator.
 *
 * No Phaser, no DOM, no external dependencies.
 */

import type { TeamSide, EngineEvent } from './types'
import type { BattleState } from './BattleState'
import {
  isIsolated,
  hasWarriorGuard,
  countWallTouching,
  manhattan,
} from './MovementEngine'

const WARRIOR_GUARD_REDUCTION   = 0.15
const EXECUTOR_ISOLATION_BONUS  = 0.15
const WALL_TOUCH_BONUS_PER_UNIT = 0.05
const MAX_MITIGATION            = 0.90

export const BLEED_TICKS             = 3
export const REGEN_TICKS             = 3
export const STUN_TICKS              = 1
export const HEAL_REDUCTION_TICKS    = 2
export const HEAL_REDUCTION_FACTOR   = 0.50

export function computeDamage(
  state: BattleState, casterId: string, targetId: string, basePower: number,
): number {
  const caster = state.runtime.get(casterId)
  const target = state.runtime.get(targetId)
  if (!caster || !target) return basePower

  let atkMult = caster.attack / 50
  const casterDef = state.defs.get(casterId)
  if (casterDef?.role === 'executor' && isIsolated(state, casterId)) atkMult *= 1 + EXECUTOR_ISOLATION_BONUS
  const gross = Math.round(basePower * atkMult)

  let mit = target.defense / 200
  if (hasWarriorGuard(state, targetId)) mit += WARRIOR_GUARD_REDUCTION
  const targetDef = state.defs.get(targetId)
  if (targetDef) mit += countWallTouching(state, targetDef.side) * WALL_TOUCH_BONUS_PER_UNIT
  mit = Math.min(MAX_MITIGATION, Math.max(0, mit))
  return Math.max(1, Math.round(gross * (1 - mit)))
}

export function computeHeal(state: BattleState, targetId: string, basePower: number): number {
  const target = state.runtime.get(targetId)
  if (!target) return basePower
  let amount = basePower
  if (target.healReductionTicks > 0) amount = Math.round(amount * (1 - target.healReductionFactor))
  return Math.max(0, amount)
}

export function applyDamage(
  state: BattleState, targetId: string, rawDamage: number, sourceId: string | null,
): EngineEvent[] {
  const target = state.runtime.get(targetId)
  if (!target || !target.alive) return []
  const events: EngineEvent[] = []
  if (target.evadeCharges > 0) { target.evadeCharges--; events.push({ type: 'EVADE_TRIGGERED', unitId: targetId }); return events }
  let remaining = rawDamage
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining)
    target.shield -= absorbed; remaining -= absorbed
    events.push({ type: 'SHIELD_ABSORBED', unitId: targetId, shieldDamage: absorbed, newShield: target.shield })
    if (remaining <= 0) return events
  }
  target.hp = Math.max(0, target.hp - remaining)
  events.push({ type: 'DAMAGE_APPLIED', unitId: targetId, amount: remaining, newHp: target.hp, sourceId })
  if (target.hp === 0) {
    target.alive = false
    events.push({
      type:     'CHARACTER_DIED',
      unitId:   targetId,
      killedBy: sourceId,
      wasKing:  state.defs.get(targetId)?.role === 'king',
      round:    state.roundNumber,
    })
  }
  return events
}

export function applyReflect(state: BattleState, targetId: string, sourceId: string): EngineEvent[] {
  const target = state.runtime.get(targetId)
  if (!target?.alive || target.reflectPower <= 0) return []
  const events: EngineEvent[] = []
  events.push({ type: 'REFLECT_TRIGGERED', unitId: targetId, amount: target.reflectPower, sourceId })
  events.push(...applyDamage(state, sourceId, target.reflectPower, targetId))
  return events
}

export function applyHeal(state: BattleState, targetId: string, amount: number, sourceId: string | null): EngineEvent[] {
  const target = state.runtime.get(targetId)
  if (!target?.alive) return []
  const actual = Math.min(amount, target.maxHp - target.hp)
  target.hp += actual
  return actual > 0 ? [{ type: 'HEAL_APPLIED', unitId: targetId, amount: actual, newHp: target.hp, sourceId }] : []
}

export function applyShield(state: BattleState, targetId: string, amount: number): EngineEvent[] {
  const target = state.runtime.get(targetId)
  if (!target?.alive) return []
  target.shield += amount
  return [{ type: 'SHIELD_APPLIED', unitId: targetId, amount }]
}

export function applyBleed(state: BattleState, targetId: string, damagePerTick: number): EngineEvent[] {
  const target = state.runtime.get(targetId)
  if (!target?.alive) return []
  target.bleedTicks = BLEED_TICKS; target.bleedPower = damagePerTick
  return [{ type: 'STATUS_APPLIED', unitId: targetId, status: 'bleed', value: damagePerTick }]
}

export function applyStun(state: BattleState, targetId: string): EngineEvent[] {
  const target = state.runtime.get(targetId)
  if (!target?.alive) return []
  target.stunTicks = STUN_TICKS
  return [{ type: 'STATUS_APPLIED', unitId: targetId, status: 'stun', value: STUN_TICKS }]
}

export function applyEvade(state: BattleState, targetId: string, charges = 1): EngineEvent[] {
  const target = state.runtime.get(targetId)
  if (!target?.alive) return []
  target.evadeCharges += charges
  return [{ type: 'STATUS_APPLIED', unitId: targetId, status: 'evade', value: charges }]
}

export function applyReflectBuff(state: BattleState, targetId: string, power: number): EngineEvent[] {
  const target = state.runtime.get(targetId)
  if (!target?.alive) return []
  target.reflectPower = power
  return [{ type: 'STATUS_APPLIED', unitId: targetId, status: 'reflect', value: power }]
}

export function applyRegen(state: BattleState, targetId: string, healPerTick: number): EngineEvent[] {
  const target = state.runtime.get(targetId)
  if (!target?.alive) return []
  target.regenTicks = REGEN_TICKS; target.regenPower = healPerTick
  return [{ type: 'STATUS_APPLIED', unitId: targetId, status: 'regen', value: healPerTick }]
}

export function applyHealReduction(state: BattleState, targetId: string): void {
  const target = state.runtime.get(targetId)
  if (!target?.alive) return
  target.healReductionTicks = HEAL_REDUCTION_TICKS; target.healReductionFactor = HEAL_REDUCTION_FACTOR
}

export function tickStatusEffects(state: BattleState, unitId: string): EngineEvent[] {
  const target = state.runtime.get(unitId)
  if (!target?.alive) return []
  const events: EngineEvent[] = []
  if (target.bleedTicks > 0) {
    const dmg = target.bleedPower; target.hp = Math.max(0, target.hp - dmg); target.bleedTicks--
    events.push({ type: 'BLEED_TICK', unitId, damage: dmg, newHp: target.hp })
    if (target.hp === 0) {
      target.alive = false
      events.push({
        type:     'CHARACTER_DIED',
        unitId,
        killedBy: null,
        wasKing:  state.defs.get(unitId)?.role === 'king',
        round:    state.roundNumber,
      })
    }
  }
  if (target.regenTicks > 0 && target.alive) {
    const heal = target.regenPower; const actual = Math.min(heal, target.maxHp - target.hp)
    target.hp += actual; target.regenTicks--
    if (actual > 0) events.push({ type: 'REGEN_TICK', unitId, heal: actual, newHp: target.hp })
  }
  if (target.stunTicks > 0)          target.stunTicks--
  if (target.healReductionTicks > 0) target.healReductionTicks--
  target.reflectPower = 0
  return events
}

export function findLowestHpAlly(state: BattleState, side: TeamSide): string | null {
  let best: string | null = null; let bestRatio = Infinity
  for (const [id, def] of state.defs) {
    if (def.side !== side) continue
    const rt = state.runtime.get(id)
    if (!rt?.alive) continue
    const ratio = rt.hp / rt.maxHp
    if (ratio < bestRatio) { bestRatio = ratio; best = id }
  }
  return best
}

export function getUnitsInArea(
  state: BattleState, centerCol: number, centerRow: number, side: TeamSide, radius = 1,
): string[] {
  const result: string[] = []
  for (const [id, def] of state.defs) {
    if (def.side !== side) continue
    const rt = state.runtime.get(id)
    if (!rt?.alive) continue
    if (manhattan(rt, { col: centerCol, row: centerRow }) <= radius) result.push(id)
  }
  return result
}
