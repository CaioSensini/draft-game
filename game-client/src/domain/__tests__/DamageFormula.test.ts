/**
 * Tests for the v3 damage formula (SKILLS_CATALOG_v3_FINAL.md §5).
 *
 * Cross-referenced against the worked examples in the catalog:
 *   §5 example: Executor Corte Mortal (45) on King (DEF 14, Proteção Real -20%)
 *     = 45 × (100/114) × 0.80 × 1.0 → round(31.58) = 32
 *   §5 with execute: target at <30% HP
 *     = 45 × (100/114) × 0.80 × 1.25 → round(39.47) = 39
 *
 * All rounding uses Math.round (half-up) per the policy documented in
 * docs/DECISIONS.md 2026-04-21.
 */

import { describe, it, expect } from 'vitest'
import {
  computeDamage,
  computeDamageBreakdown,
  EXECUTE_HP_THRESHOLD,
  EXECUTE_DAMAGE_MULT,
  OVERTIME_START_ROUND,
  OVERTIME_BONUS_PER_ROUND,
  MIN_DAMAGE_FLOOR_RATIO,
  MAX_MITIGATION,
} from '../DamageFormula'

// Helper: compact way to express the common test shape.
function baseInputs(over: Partial<Parameters<typeof computeDamage>[0]> = {}) {
  return {
    basePower: 60,
    targetDef: 0,
    targetHpRatio: 1,    // full HP → no execute
    atkBonus: 0,
    mitBonus: 0,
    round: 1,            // no overtime
    isTrueDamage: false,
    ...over,
  }
}

describe('DamageFormula — constants', () => {
  it('constants match v3 §2 / §5 documentation', () => {
    expect(EXECUTE_HP_THRESHOLD).toBe(0.30)
    expect(EXECUTE_DAMAGE_MULT).toBe(1.25)
    expect(OVERTIME_START_ROUND).toBe(12)
    expect(OVERTIME_BONUS_PER_ROUND).toBe(0.10)
    expect(MIN_DAMAGE_FLOOR_RATIO).toBe(0.10)
    expect(MAX_MITIGATION).toBe(0.90)
  })
})

describe('DamageFormula — base cases', () => {
  it('base damage with no modifiers (60 vs DEF 0 = 60)', () => {
    expect(computeDamage(baseInputs({ basePower: 60, targetDef: 0 }))).toBe(60)
  })

  it('base damage vs DEF 20 (60 × 100/120 = 50)', () => {
    expect(computeDamage(baseInputs({ basePower: 60, targetDef: 20 }))).toBe(50)
  })

  it('base damage vs DEF 100 (60 × 100/200 = 30)', () => {
    expect(computeDamage(baseInputs({ basePower: 60, targetDef: 100 }))).toBe(30)
  })

  it('damage on King with Proteção Real (-20%) from v3 §5 example', () => {
    // Corte Mortal (45) on King (DEF 14, Proteção Real -20%), full HP:
    //   45 × 100/114 × 0.80 = 31.578... → round = 32
    const result = computeDamage({
      basePower: 45,
      targetDef: 14,
      targetHpRatio: 1,
      atkBonus: 0,
      mitBonus: 0.20,
      round: 1,
    })
    expect(result).toBe(32)
  })

  it('damage on King with execute at 30% HP (v3 §5)', () => {
    // Same attack as above, but target at ≤ 30% HP:
    //   45 × 100/114 × 0.80 × 1.25 = 39.473 → round = 39
    const result = computeDamage({
      basePower: 45,
      targetDef: 14,
      targetHpRatio: 0.30,
      atkBonus: 0,
      mitBonus: 0.20,
      round: 1,
    })
    expect(result).toBe(39)
  })

  it('final damage is always a non-negative integer', () => {
    for (let dmg = 1; dmg <= 100; dmg += 7) {
      for (let def = 0; def <= 100; def += 13) {
        const d = computeDamage(baseInputs({ basePower: dmg, targetDef: def }))
        expect(Number.isInteger(d)).toBe(true)
        expect(d).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('DamageFormula — minimum damage floor', () => {
  it('damage cannot drop below base × 0.10 (60 × 0.10 = 6)', () => {
    // Extreme DEF + mitigation → formula would give less than 6, but floor kicks in.
    const r = computeDamage({
      basePower: 60,
      targetDef: 1_000_000,  // essentially full block
      targetHpRatio: 1,
      atkBonus: 0,
      mitBonus: 0.90,        // max allowed
      round: 1,
    })
    expect(r).toBe(6)         // round(60 × 0.10) = 6
  })

  it('floor is base × 0.10 rounded, matches small base case', () => {
    // Base = 25, floor = round(2.5) = 3
    const r = computeDamage({
      basePower: 25,
      targetDef: 1_000_000,
      targetHpRatio: 1,
      atkBonus: 0,
      mitBonus: 0.90,
      round: 1,
    })
    expect(r).toBe(3)
  })

  it('mitBonus clamps to MAX_MITIGATION (0.90) — input 2.0 same as 0.90', () => {
    const extreme = computeDamage(baseInputs({ mitBonus: 2.0, targetDef: 0 }))
    const capped  = computeDamage(baseInputs({ mitBonus: 0.90, targetDef: 0 }))
    expect(extreme).toBe(capped)
  })
})

describe('DamageFormula — true damage', () => {
  it('true damage ignores DEF (60 base vs DEF 100 still deals 60)', () => {
    const r = computeDamage({
      basePower: 60,
      targetDef: 100,
      targetHpRatio: 1,
      atkBonus: 0,
      mitBonus: 0,
      round: 1,
      isTrueDamage: true,
    })
    expect(r).toBe(60)
  })

  it('true damage STILL respects Proteção Real (-20%)', () => {
    // v3 §4.1 is explicit: "Proteção Real aplica a true damage".
    // 60 × 1 (no DEF) × 0.80 = 48
    const r = computeDamage({
      basePower: 60,
      targetDef: 100,          // ignored
      targetHpRatio: 1,
      atkBonus: 0,
      mitBonus: 0.20,
      round: 1,
      isTrueDamage: true,
    })
    expect(r).toBe(48)
  })

  it('true damage + execute (60 × 0.80 × 1.25 = 60)', () => {
    // Target at execute threshold.
    // 60 × 1 × 0.80 × 1.25 = 60
    const r = computeDamage({
      basePower: 60,
      targetDef: 100,
      targetHpRatio: EXECUTE_HP_THRESHOLD,
      atkBonus: 0,
      mitBonus: 0.20,
      round: 1,
      isTrueDamage: true,
    })
    expect(r).toBe(60)
  })

  it('breakdown.defFactor is 1 when true damage (marker)', () => {
    const bd = computeDamageBreakdown({
      basePower: 10,
      targetDef: 100,
      targetHpRatio: 1,
      atkBonus: 0,
      mitBonus: 0,
      round: 1,
      isTrueDamage: true,
    })
    expect(bd.defFactor).toBe(1)
    expect(bd.trueDamage).toBe(true)
  })
})

describe('DamageFormula — execute threshold', () => {
  it('executes EXACTLY at HP 30% (inclusive)', () => {
    const bd = computeDamageBreakdown(baseInputs({ targetHpRatio: 0.30 }))
    expect(bd.executed).toBe(true)
    expect(bd.execMult).toBe(1.25)
  })

  it('does NOT execute at HP 30.0001% (strict inclusive at 0.30)', () => {
    const bd = computeDamageBreakdown(baseInputs({ targetHpRatio: 0.3001 }))
    expect(bd.executed).toBe(false)
    expect(bd.execMult).toBe(1.0)
  })

  it('does NOT execute at HP 31%', () => {
    const bd = computeDamageBreakdown(baseInputs({ targetHpRatio: 0.31 }))
    expect(bd.executed).toBe(false)
  })

  it('executes at HP 1% (well below threshold)', () => {
    const bd = computeDamageBreakdown(baseInputs({ targetHpRatio: 0.01 }))
    expect(bd.executed).toBe(true)
  })

  it('execute multiplies damage by 1.25 (60 → 75 with no mit)', () => {
    const r = computeDamage(baseInputs({ basePower: 60, targetHpRatio: 0.30 }))
    expect(r).toBe(75)
  })
})

describe('DamageFormula — overtime', () => {
  it('no overtime before round 12', () => {
    for (const r of [1, 5, 10, 11]) {
      const bd = computeDamageBreakdown(baseInputs({ round: r }))
      expect(bd.overtimed).toBe(false)
      expect(bd.overtimeMult).toBe(1)
    }
  })

  it('round 12: multiplier × 1.10', () => {
    const bd = computeDamageBreakdown(baseInputs({ round: 12 }))
    expect(bd.overtimed).toBe(true)
    expect(bd.overtimeMult).toBeCloseTo(1.10, 10)
  })

  it('round 13: multiplier × 1.20', () => {
    const bd = computeDamageBreakdown(baseInputs({ round: 13 }))
    expect(bd.overtimeMult).toBeCloseTo(1.20, 10)
  })

  it('round 14: multiplier × 1.30', () => {
    const bd = computeDamageBreakdown(baseInputs({ round: 14 }))
    expect(bd.overtimeMult).toBeCloseTo(1.30, 10)
  })

  it('round 12 damage: 60 → 66', () => {
    const r = computeDamage(baseInputs({ basePower: 60, round: 12 }))
    expect(r).toBe(66)
  })

  it('overtime compounds with execute (60 × 1.25 × 1.10 = 82.5 → 83)', () => {
    const r = computeDamage(baseInputs({
      basePower: 60, targetHpRatio: 0.30, round: 12,
    }))
    expect(r).toBe(83)
  })
})

describe('DamageFormula — modifiers (atk/mit bonuses)', () => {
  it('atk_up 20% → damage × 1.20 (60 → 72)', () => {
    const r = computeDamage(baseInputs({ basePower: 60, atkBonus: 0.20 }))
    expect(r).toBe(72)
  })

  it('multiple atk buffs: caller sums before calling (atk_up 20 + isolado 20 = 0.40 → ×1.40)', () => {
    const r = computeDamage(baseInputs({ basePower: 60, atkBonus: 0.40 }))
    expect(r).toBe(84)
  })

  it('mitigation stacks but clamps to 90% max', () => {
    // 50% passive + 50% rule = 100% → clamps to 90% → damage = base × 0.10
    const r = computeDamage(baseInputs({ basePower: 60, mitBonus: 1.00 }))
    expect(r).toBe(6)       // 60 × 0.10 = 6 (the floor, which equals 1-0.90 here)
  })

  it('Isolado attacker (+20%) + Proteção Real target (-20%) multiplies correctly', () => {
    // 30 × 100/114 × (1+0.20) × (1-0.20) = 30 × 0.8772 × 1.20 × 0.80 = 25.26... → 25
    const r = computeDamage({
      basePower: 30,
      targetDef: 14,
      targetHpRatio: 1,
      atkBonus: 0.20,
      mitBonus: 0.20,
      round: 1,
    })
    expect(r).toBe(25)
  })

  it('atk_down -10% (atkBonus = -0.10) reduces damage', () => {
    // 60 × (1 - 0.10) = 54
    const r = computeDamage(baseInputs({ basePower: 60, atkBonus: -0.10 }))
    expect(r).toBe(54)
  })

  it('order check: mitigation applied BEFORE execute (both multiplicative)', () => {
    // 60 × 0.80 (mit) × 1.25 (execute) = 60 → 60
    const r = computeDamage({
      basePower: 60,
      targetDef: 0,
      targetHpRatio: 0.30,
      atkBonus: 0,
      mitBonus: 0.20,
      round: 1,
    })
    expect(r).toBe(60)
  })
})

describe('DamageFormula — breakdown inspection', () => {
  it('breakdown includes every intermediate multiplier', () => {
    const bd = computeDamageBreakdown({
      basePower: 100,
      targetDef: 100,             // defFactor = 0.50
      targetHpRatio: 0.30,        // execute ON
      atkBonus: 0.20,
      mitBonus: 0.10,
      round: 12,                  // overtime ON (×1.10)
      isTrueDamage: false,
    })
    expect(bd.basePower).toBe(100)
    expect(bd.defFactor).toBe(0.50)
    expect(bd.atkBonus).toBe(0.20)
    expect(bd.mitBonus).toBe(0.10)
    expect(bd.mitFactor).toBeCloseTo(0.90, 10)
    expect(bd.modifiers).toBeCloseTo((1 + 0.20) * 0.90, 10)
    expect(bd.execMult).toBe(1.25)
    expect(bd.overtimeMult).toBeCloseTo(1.10, 10)
    expect(bd.executed).toBe(true)
    expect(bd.overtimed).toBe(true)
    expect(bd.trueDamage).toBe(false)
  })

  it('preFloor is the un-rounded result (for debugging)', () => {
    const bd = computeDamageBreakdown({
      basePower: 45,
      targetDef: 14,
      targetHpRatio: 1,
      atkBonus: 0,
      mitBonus: 0.20,
      round: 1,
    })
    // 45 × 100/114 × 0.80 = 31.578947...
    expect(bd.preFloor).toBeCloseTo(31.578947, 4)
    expect(bd.final).toBe(32)   // round-up
  })
})

describe('DamageFormula — rounding policy (Math.round half-up)', () => {
  it('rounds half up (1.5 → 2)', () => {
    // Construct inputs that produce 1.5 raw damage:
    // base=3, defFactor=1, atkBonus=0, mitFactor=0.5 (mitBonus=0.5) → 3 × 0.5 = 1.5
    const r = computeDamage({
      basePower: 3,
      targetDef: 0,
      targetHpRatio: 1,
      atkBonus: 0,
      mitBonus: 0.50,
      round: 1,
    })
    // Floor = round(0.3) = 0, preFloor = 1.5 → round = 2. Final = max(0, 2) = 2
    expect(r).toBe(2)
  })

  it('rounds half-up at .5 boundary (2.5 → 3)', () => {
    // base=5, mitBonus=0.5 → 5 × 0.5 = 2.5 → round = 3
    const r = computeDamage({
      basePower: 5,
      targetDef: 0,
      targetHpRatio: 1,
      atkBonus: 0,
      mitBonus: 0.50,
      round: 1,
    })
    expect(r).toBe(3)
  })
})

describe('DamageFormula — defensive edge cases', () => {
  it('zero base power always yields 0', () => {
    const r = computeDamage(baseInputs({ basePower: 0 }))
    expect(r).toBe(0)
  })

  it('negative DEF is treated as 0 (no "negative" boost)', () => {
    // Caller may pass a debuffed DEF that went negative. We clamp at 0.
    const r = computeDamage(baseInputs({ basePower: 60, targetDef: -50 }))
    expect(r).toBe(60)
  })

  it('very high round number keeps scaling linearly (round 20 → × 1.90)', () => {
    const bd = computeDamageBreakdown(baseInputs({ round: 20 }))
    expect(bd.overtimeMult).toBeCloseTo(1 + 0.10 * (20 - 11), 10)
  })
})
