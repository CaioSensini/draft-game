/**
 * engine/EffectSystem.ts — pure effect application for the Arena game.
 *
 * All methods mutate the provided RuntimeState maps and return structured
 * result objects that ArenaScene uses for animations.
 * No Phaser, no side effects outside the state maps.
 */

import type { UnitData, TeamSide } from '../types'
import type { RuntimeState, CombatStats } from '../entities/Unit'
import { CombatSystem } from '../systems/CombatSystem'

// ── Result types (returned to renderer) ─────────────────────────────────────

export type DamageResult = {
  unitId:        string
  evaded:        boolean
  shieldAbsorbed: number
  hpLost:        number
  newHp:         number
  killed:        boolean
  reflected?:    { targetId: string; damage: number }
}

export type HealResult = {
  unitId:    string
  healed:    number
  newHp:     number
  reduced:   boolean
}

export type EffectTickResult =
  | { kind: 'bleed'; unitId: string; damage: number; newHp: number; killed: boolean }
  | { kind: 'regen'; unitId: string; healed: number; newHp: number }

// ── Constants ────────────────────────────────────────────────────────────────

const HEAL_REDUCTION_TICKS  = 2
const HEAL_REDUCTION_FACTOR = 0.5

// ── EffectSystem ─────────────────────────────────────────────────────────────

export class EffectSystem {
  /**
   * Apply `rawAmount` damage to `unitId`.
   * Handles: evade, shield absorption, HP reduction, reflect, death.
   * Mutates `states` and `stats`. Returns a structured result.
   */
  static damage(
    unitId:   string,
    rawAmount: number,
    sourceId: string | null,
    _units:   ReadonlyMap<string, UnitData>,
    states:   Map<string, RuntimeState>,
    stats:    Map<string, CombatStats>,
  ): DamageResult {
    const state = states.get(unitId)
    if (!state || !state.alive) {
      return { unitId, evaded: false, shieldAbsorbed: 0, hpLost: 0, newHp: 0, killed: false }
    }

    // Evade
    if (state.evadeCharges > 0) {
      state.evadeCharges -= 1
      return { unitId, evaded: true, shieldAbsorbed: 0, hpLost: 0, newHp: state.hp, killed: false }
    }

    let remaining     = rawAmount
    let shieldAbsorbed = 0

    // Shield absorption
    if (state.shield > 0) {
      const absorbed = Math.min(state.shield, remaining)
      state.shield  -= absorbed
      remaining     -= absorbed
      shieldAbsorbed = absorbed
    }

    const hpLost = remaining
    if (hpLost > 0) {
      state.hp = Math.max(0, state.hp - hpLost)
      const receiverStats = stats.get(unitId)
      if (receiverStats) receiverStats.damageReceived += hpLost
      if (sourceId) {
        const srcStats = stats.get(sourceId)
        if (srcStats) srcStats.damageDealt += hpLost
      }
    }

    const killed = hpLost > 0 && state.hp <= 0 && state.alive
    if (killed) {
      state.alive = false
      if (sourceId) {
        const srcStats = stats.get(sourceId)
        if (srcStats) srcStats.kills += 1
      }
    }

    // Reflect: compute before returning, but let caller apply it
    let reflected: DamageResult['reflected'] | undefined
    if (state.reflectPower > 0 && sourceId && hpLost > 0) {
      const reflectDmg = state.reflectPower
      state.reflectPower = 0
      reflected = { targetId: sourceId, damage: reflectDmg }
    }

    return { unitId, evaded: false, shieldAbsorbed, hpLost, newHp: state.hp, killed, reflected }
  }

  /**
   * Apply `amount` healing to `unitId`.
   * Respects heal reduction. Mutates `states` and `stats`.
   */
  static heal(
    unitId:   string,
    amount:   number,
    sourceId: string | null,
    _units:   ReadonlyMap<string, UnitData>,
    states:   Map<string, RuntimeState>,
    stats:    Map<string, CombatStats>,
  ): HealResult {
    const state = states.get(unitId)
    if (!state || !state.alive) {
      return { unitId, healed: 0, newHp: 0, reduced: false }
    }

    const reduced = state.healReductionTicks > 0
    const effective = reduced
      ? Math.max(1, Math.floor(amount * (1 - state.healReductionFactor)))
      : amount

    state.hp = Math.min(state.maxHp, state.hp + effective)

    if (sourceId) {
      const srcStats = stats.get(sourceId)
      if (srcStats) srcStats.healsGiven += effective
    }

    return { unitId, healed: effective, newHp: state.hp, reduced }
  }

  /** Compute direct damage using ATK scaling and passive bonuses. */
  static computeDamage(
    caster:    UnitData,
    target:    UnitData,
    basePower: number,
    units:     ReadonlyMap<string, UnitData>,
    states:    ReadonlyMap<string, RuntimeState>,
  ): number {
    return CombatSystem.computeDirectDamage(caster, target, basePower, states, units)
  }

  // ── Status effect application ─────────────────────────────────────────────

  static applyBleed(unitId: string, ticks: number, power: number, states: Map<string, RuntimeState>): void {
    const s = states.get(unitId)
    if (!s?.alive) return
    s.bleedTicks = Math.max(s.bleedTicks, ticks)
    s.bleedPower = Math.max(s.bleedPower, power)
  }

  static applyStun(unitId: string, ticks: number, states: Map<string, RuntimeState>): void {
    const s = states.get(unitId)
    if (!s?.alive) return
    s.stunTicks = Math.max(s.stunTicks, ticks)
  }

  static applyHealReduction(unitId: string, states: Map<string, RuntimeState>): void {
    const s = states.get(unitId)
    if (!s?.alive) return
    s.healReductionTicks  = Math.max(s.healReductionTicks, HEAL_REDUCTION_TICKS)
    s.healReductionFactor = Math.max(s.healReductionFactor, HEAL_REDUCTION_FACTOR)
  }

  static applyShield(unitId: string, amount: number, states: Map<string, RuntimeState>): void {
    const s = states.get(unitId)
    if (!s?.alive) return
    s.shield += amount
  }

  static applyEvade(unitId: string, states: Map<string, RuntimeState>): void {
    const s = states.get(unitId)
    if (!s?.alive) return
    s.evadeCharges = 1
  }

  static applyRegen(unitId: string, ticks: number, power: number, states: Map<string, RuntimeState>): void {
    const s = states.get(unitId)
    if (!s?.alive) return
    s.regenTicks = ticks
    s.regenPower = power
  }

  static applyReflect(unitId: string, power: number, states: Map<string, RuntimeState>): void {
    const s = states.get(unitId)
    if (!s?.alive) return
    s.reflectPower = power
  }

  // ── Per-round effect ticking ─────────────────────────────────────────────

  /**
   * Tick ongoing effects (bleed, regen, heal-reduction) for all living units
   * on `side`. Returns a list of tick results for visual feedback.
   */
  static tickEffects(
    side:   TeamSide,
    units:  ReadonlyMap<string, UnitData>,
    states: Map<string, RuntimeState>,
    _stats: Map<string, CombatStats>,
  ): EffectTickResult[] {
    const results: EffectTickResult[] = []

    for (const unit of units.values()) {
      if (unit.side !== side) continue
      const s = states.get(unit.id)
      if (!s?.alive) continue

      if (s.bleedTicks > 0) {
        s.bleedTicks -= 1
        const dmg = s.bleedPower
        s.hp = Math.max(0, s.hp - dmg)
        const killed = s.hp <= 0
        if (killed) s.alive = false
        results.push({ kind: 'bleed', unitId: unit.id, damage: dmg, newHp: s.hp, killed })
      }

      if (s.regenTicks > 0 && s.alive) {
        s.regenTicks -= 1
        const heal = s.regenPower
        s.hp = Math.min(s.maxHp, s.hp + heal)
        results.push({ kind: 'regen', unitId: unit.id, healed: heal, newHp: s.hp })
      }

      if (s.healReductionTicks > 0) {
        s.healReductionTicks -= 1
        if (s.healReductionTicks === 0) s.healReductionFactor = 0
      }
    }

    return results
  }
}
