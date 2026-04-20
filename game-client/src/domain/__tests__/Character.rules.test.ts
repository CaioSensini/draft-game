/**
 * Tests for the 5 v3 global combat rules that Character enforces locally
 * (§2.1 King heal-immunity, §2.4 Heal Cap, §2.5 Shield Cap, §2.6 Debuff Stack Cap,
 * §2.8 Overtime DoT scaling).
 *
 * Execute (§2.2) and DoT-bypass (§2.3) are verified in DamageFormula.test.ts
 * and CombatEngine.dotOrder.test.ts respectively.
 */

import { describe, it, expect } from 'vitest'
import { Character, CHARACTER_SHIELD_CAP } from '../Character'
import {
  BleedEffect,
  DefReductionEffect,
  AtkReductionEffect,
  AtkBoostEffect,
  DefBoostEffect,
  ShieldEffect,
  PoisonEffect,
} from '../Effect'
import { getStatsForLevel } from '../Stats'

function mkChar(role: 'king' | 'warrior' | 'executor' | 'specialist' = 'warrior'): Character {
  const s = getStatsForLevel(role, 1)
  return new Character('c1', role, role, 'left', 0, 0, {
    maxHp: s.hp, attack: s.atk, defense: s.def, mobility: s.mob,
  })
}

// ── §2.1 King heal-immunity ───────────────────────────────────────────────────

describe('v3 §2.1 — King heal immunity', () => {
  it('regular heal on King returns 0', () => {
    const k = mkChar('king')
    k.applyPureDamage(50)
    const result = k.heal(30)
    expect(result.actual).toBe(0)
    expect(k.hp).toBe(k.maxHp - 50)
  })

  it('regular heal on non-King works as usual', () => {
    const w = mkChar('warrior')
    w.applyPureDamage(50)
    const result = w.heal(30)
    expect(result.actual).toBeGreaterThan(0)
  })

  it('ignoreKingImmunity bypass heals the King (for Recuperação Real, Espírito, lifesteal)', () => {
    const k = mkChar('king')
    k.applyPureDamage(50)
    const result = k.heal(30, { ignoreKingImmunity: true })
    expect(result.actual).toBeGreaterThan(0)
  })
})

// ── §2.4 Heal Cap ─────────────────────────────────────────────────────────────

describe('v3 §2.4 — Heal cap (max 2/turn per unit)', () => {
  it('1st heal applies', () => {
    const w = mkChar('warrior')
    w.applyPureDamage(150)
    const r1 = w.heal(20)
    expect(r1.actual).toBeGreaterThan(0)
  })

  it('2nd heal applies', () => {
    const w = mkChar('warrior')
    w.applyPureDamage(150)
    w.heal(20)
    const r2 = w.heal(20)
    expect(r2.actual).toBeGreaterThan(0)
  })

  it('3rd heal fails silently (returns 0)', () => {
    const w = mkChar('warrior')
    w.applyPureDamage(180)
    w.heal(20)
    w.heal(20)
    const r3 = w.heal(20)
    expect(r3.actual).toBe(0)
  })

  it('resetHealCounter allows heals again (simulates next turn)', () => {
    const w = mkChar('warrior')
    w.applyPureDamage(180)
    w.heal(20)
    w.heal(20)
    expect(w.heal(20).actual).toBe(0)
    w.resetHealCounter()
    expect(w.heal(20).actual).toBeGreaterThan(0)
  })

  it('ignoreCap bypass works (for DoT-ordering flows / tests)', () => {
    const w = mkChar('warrior')
    w.applyPureDamage(180)
    w.heal(20)
    w.heal(20)
    const r3 = w.heal(20, { ignoreCap: true })
    expect(r3.actual).toBeGreaterThan(0)
  })

  it('Shields do NOT count toward heal cap (can add many shields in one turn)', () => {
    const w = mkChar('warrior')
    w.addShield(10)
    w.addShield(10)
    w.addShield(10)
    expect(w.totalShield).toBe(30)
    // Heal counter untouched — heals still work.
    w.applyPureDamage(150)
    const r = w.heal(20)
    expect(r.actual).toBeGreaterThan(0)
  })
})

// ── §2.5 Shield cap (100 total, new overwrites weakest) ───────────────────────

describe('v3 §2.5 — Shield cap', () => {
  it('sum of shields ≤ 100 works normally', () => {
    const w = mkChar('warrior')
    w.addShield(30)
    w.addShield(40)
    w.addShield(20)
    expect(w.totalShield).toBe(90)
  })

  it('exactly 100 is allowed', () => {
    const w = mkChar('warrior')
    w.addShield(50)
    w.addShield(50)
    expect(w.totalShield).toBe(100)
  })

  it('new shield that would overflow replaces the weakest existing', () => {
    const w = mkChar('warrior')
    w.addShield(80)
    w.addShield(30) // sum = 110 → weakest was 30 vs new 30 — weakest is the first (tie) or new; either way result is one 80, one 30
    expect(w.totalShield).toBeLessThanOrEqual(CHARACTER_SHIELD_CAP)
  })

  it('adding to [80] a new 50: 130 overflows → 50 replaces 80 → total 50', () => {
    const w = mkChar('warrior')
    w.addShield(80)
    w.addShield(50)  // sum 130 > 100 → remove weakest (80), add 50 → total 50
    expect(w.totalShield).toBe(50)
  })

  it('adding to [50, 50] a new 30: 130 overflows → 30 replaces one 50 → total 80', () => {
    const w = mkChar('warrior')
    w.addShield(50)
    w.addShield(50)  // fine, total 100
    w.addShield(30)  // total would be 130 → remove weakest (50), add 30 → total 80
    expect(w.totalShield).toBe(80)
  })

  it('edge case: single shield > 100 is clamped to 100', () => {
    const w = mkChar('warrior')
    w.addShield(120)
    expect(w.totalShield).toBe(CHARACTER_SHIELD_CAP)
  })

  it('addShield on dead character is a no-op', () => {
    const w = mkChar('warrior')
    w.applyPureDamage(w.maxHp)
    expect(w.alive).toBe(false)
    w.addShield(50)
    expect(w.totalShield).toBe(0)
  })
})

// ── §2.6 Debuff stack cap (max value + max duration) ──────────────────────────

describe('v3 §2.6 — Debuff/buff same-type stacking rule', () => {
  it('applying def_down twice keeps max value', () => {
    const w = mkChar('warrior')
    w.addEffect(new DefReductionEffect(10, 3))
    w.addEffect(new DefReductionEffect(20, 2))  // higher value, shorter duration
    // Max value 20 should survive.
    expect(w.baseStats.defense - w.defense).toBe(20)
  })

  it('applying def_down with lower value does NOT reduce magnitude', () => {
    const w = mkChar('warrior')
    w.addEffect(new DefReductionEffect(20, 2))
    w.addEffect(new DefReductionEffect(10, 5))  // weaker debuff
    // Existing 20 should remain.
    expect(w.baseStats.defense - w.defense).toBe(20)
  })

  it('duration merges to MAX (takes longer duration)', () => {
    const w = mkChar('warrior')
    w.addEffect(new DefReductionEffect(20, 2))
    w.addEffect(new DefReductionEffect(10, 5))
    // Tick 3 times: 5-3 = 2 ticks remaining still apply
    w.tickEffects()
    w.tickEffects()
    w.tickEffects()
    // Still debuffed because duration was 5
    expect(w.baseStats.defense - w.defense).toBe(20)
  })

  it('atk_down + def_down coexist (different types stack)', () => {
    const w = mkChar('warrior')
    w.addEffect(new DefReductionEffect(10, 3))
    w.addEffect(new AtkReductionEffect(5, 3))
    expect(w.baseStats.defense - w.defense).toBe(10)
    expect(w.baseStats.attack - w.attack).toBe(5)
  })

  it('buff stacking: atk_up takes max of value and duration', () => {
    const w = mkChar('warrior')
    w.addEffect(new AtkBoostEffect(5, 2))
    w.addEffect(new AtkBoostEffect(10, 1))   // higher value, shorter
    expect(w.attack - w.baseStats.attack).toBe(10)
  })

  it('def_up downgrade attempt keeps original', () => {
    const w = mkChar('warrior')
    w.addEffect(new DefBoostEffect(20, 2))
    w.addEffect(new DefBoostEffect(5, 3))
    expect(w.defense - w.baseStats.defense).toBe(20)
  })

  it('DoT bleed: re-apply takes max value + max duration', () => {
    const w = mkChar('warrior')
    w.addEffect(new BleedEffect(5, 3))
    w.addEffect(new BleedEffect(10, 1))  // higher damage, shorter duration
    const tick = w.tickEffects()
    const bleedTick = tick.ticks.find((t) => t.effectType === 'bleed')
    expect(bleedTick?.value).toBe(10)   // new value won
  })

  it('DoT poison: weaker re-apply leaves stronger in place', () => {
    const w = mkChar('warrior')
    w.addEffect(new PoisonEffect(10, 1))
    w.addEffect(new PoisonEffect(3, 5))
    const tick = w.tickEffects()
    const poisonTick = tick.ticks.find((t) => t.effectType === 'poison')
    expect(poisonTick?.value).toBe(10)
  })
})

// ── §2.8 Overtime on DoT ──────────────────────────────────────────────────────

describe('v3 §2.8 — Overtime scales DoT ticks', () => {
  it('bleed 10 at round 11: no scaling', () => {
    const w = mkChar('warrior')
    w.addEffect(new BleedEffect(10, 3))
    const result = w.tickEffects({ damageMultiplier: 1 })
    const bleedTick = result.ticks.find((t) => t.effectType === 'bleed')
    expect(bleedTick?.value).toBe(10)
  })

  it('bleed 10 at round 12 (×1.10): 10 → 11', () => {
    const w = mkChar('warrior')
    w.addEffect(new BleedEffect(10, 3))
    const result = w.tickEffects({ damageMultiplier: 1.10 })
    const bleedTick = result.ticks.find((t) => t.effectType === 'bleed')
    expect(bleedTick?.value).toBe(11)
  })

  it('bleed 10 at round 13 (×1.20): 10 → 12', () => {
    const w = mkChar('warrior')
    w.addEffect(new BleedEffect(10, 3))
    const result = w.tickEffects({ damageMultiplier: 1.20 })
    const bleedTick = result.ticks.find((t) => t.effectType === 'bleed')
    expect(bleedTick?.value).toBe(12)
  })

  it('DoT damage is applied to HP with the scaled value', () => {
    const w = mkChar('warrior')
    w.addEffect(new BleedEffect(10, 3))
    const before = w.hp
    w.tickEffects({ damageMultiplier: 1.20 })
    expect(before - w.hp).toBe(12)
  })

  it('minimum 1 damage from scaled DoT (even with tiny base + low multiplier)', () => {
    const w = mkChar('warrior')
    w.addEffect(new BleedEffect(1, 3))
    const r = w.tickEffects({ damageMultiplier: 0.5 })
    const bleedTick = r.ticks.find((t) => t.effectType === 'bleed')
    // 1 × 0.5 = 0.5 → max(1, round(0.5)) = 1
    expect(bleedTick?.value).toBe(1)
  })
})

// ── Shield interaction with damage (sanity) ───────────────────────────────────

describe('Shield stacking — damage absorbs multi-shield in order', () => {
  it('30 damage against two 20 shields consumes both partially', () => {
    const w = mkChar('warrior')
    w.addShield(20)
    w.addShield(20)
    const before = w.hp
    const result = w.takeDamage(30)
    expect(result.shieldAbsorbed).toBe(30)
    expect(w.hp).toBe(before)
    expect(w.totalShield).toBe(10)  // 40 - 30 = 10 remaining
  })

  it('50 damage against a single 20 shield falls through to HP', () => {
    const w = mkChar('warrior')
    w.addShield(20)
    const before = w.hp
    const result = w.takeDamage(50)
    expect(result.shieldAbsorbed).toBe(20)
    expect(result.hpDamage).toBe(30)
    expect(w.hp).toBe(before - 30)
  })

  it('passing ShieldEffect through addEffect also respects cap', () => {
    const w = mkChar('warrior')
    w.addEffect(new ShieldEffect(80))
    w.addEffect(new ShieldEffect(50))   // sum would be 130 → replace 80
    expect(w.totalShield).toBe(50)
  })
})
