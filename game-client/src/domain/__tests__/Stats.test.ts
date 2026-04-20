/**
 * Tests for level-scaled stats (SKILLS_CATALOG_v3_FINAL §3 + §8).
 *
 * Expected values at level 50 (from the v3 catalog prompt):
 *   King       HP 224 (180 × 1.245)
 *   Warrior    HP 249 (200 × 1.245)
 *   Executor   HP 149 (120 × 1.245)
 *   Specialist HP 162 (130 × 1.245)
 *
 * At level 100:
 *   HP multiplier 1.495, ATK/DEF multiplier 1.396.
 */

import { describe, it, expect } from 'vitest'
import {
  BASE_STATS,
  MIN_LEVEL,
  MAX_LEVEL,
  RANKED_LEVEL,
  getStatsForLevel,
  hpMultiplier,
  atkDefMultiplier,
  mobMultiplier,
  assertValidLevel,
} from '../Stats'

describe('Stats — constants', () => {
  it('MIN_LEVEL = 1, MAX_LEVEL = 100, RANKED_LEVEL = 50', () => {
    expect(MIN_LEVEL).toBe(1)
    expect(MAX_LEVEL).toBe(100)
    expect(RANKED_LEVEL).toBe(50)
  })

  it('BASE_STATS matches v3 §3 exactly', () => {
    expect(BASE_STATS.king).toEqual({ hp: 180, atk: 16, def: 14, mob: 4 })
    expect(BASE_STATS.warrior).toEqual({ hp: 200, atk: 18, def: 20, mob: 2 })
    expect(BASE_STATS.executor).toEqual({ hp: 120, atk: 24, def: 8, mob: 3 })
    expect(BASE_STATS.specialist).toEqual({ hp: 130, atk: 20, def: 10, mob: 2 })
  })
})

describe('Stats — multipliers', () => {
  it('hpMultiplier at level 1 = 1.000', () => {
    expect(hpMultiplier(1)).toBe(1)
  })

  it('hpMultiplier at level 50 = 1.245', () => {
    expect(hpMultiplier(50)).toBeCloseTo(1.245, 10)
  })

  it('hpMultiplier at level 100 = 1.495', () => {
    expect(hpMultiplier(100)).toBeCloseTo(1.495, 10)
  })

  it('atkDefMultiplier at level 1 = 1.000', () => {
    expect(atkDefMultiplier(1)).toBe(1)
  })

  it('atkDefMultiplier at level 50 = 1.196', () => {
    expect(atkDefMultiplier(50)).toBeCloseTo(1.196, 10)
  })

  it('atkDefMultiplier at level 100 = 1.396', () => {
    expect(atkDefMultiplier(100)).toBeCloseTo(1.396, 10)
  })

  it('mobMultiplier always returns 1 (no scaling)', () => {
    for (const lv of [1, 10, 25, 50, 75, 100]) {
      expect(mobMultiplier(lv)).toBe(1)
    }
  })

  it('multipliers are monotonic over level', () => {
    for (let lv = 1; lv < 100; lv++) {
      expect(hpMultiplier(lv + 1)).toBeGreaterThanOrEqual(hpMultiplier(lv))
      expect(atkDefMultiplier(lv + 1)).toBeGreaterThanOrEqual(atkDefMultiplier(lv))
    }
  })
})

describe('Stats — getStatsForLevel at level 1 (base values)', () => {
  it('king base stats exact', () => {
    expect(getStatsForLevel('king', 1)).toEqual({ hp: 180, atk: 16, def: 14, mob: 4 })
  })

  it('warrior base stats exact', () => {
    expect(getStatsForLevel('warrior', 1)).toEqual({ hp: 200, atk: 18, def: 20, mob: 2 })
  })

  it('executor base stats exact', () => {
    expect(getStatsForLevel('executor', 1)).toEqual({ hp: 120, atk: 24, def: 8, mob: 3 })
  })

  it('specialist base stats exact', () => {
    expect(getStatsForLevel('specialist', 1)).toEqual({ hp: 130, atk: 20, def: 10, mob: 2 })
  })
})

describe('Stats — getStatsForLevel at level 50 (ranked normalized)', () => {
  it('King HP at level 50 = 224 (v3 catalog prompt reference)', () => {
    expect(getStatsForLevel('king', 50).hp).toBe(224)
  })

  it('Warrior HP at level 50 = 249', () => {
    expect(getStatsForLevel('warrior', 50).hp).toBe(249)
  })

  it('Executor HP at level 50 = 149', () => {
    expect(getStatsForLevel('executor', 50).hp).toBe(149)
  })

  it('Specialist HP at level 50 = 162', () => {
    expect(getStatsForLevel('specialist', 50).hp).toBe(162)
  })

  it('ATK scales for all roles at level 50 (multiplier 1.196)', () => {
    // King: 16 × 1.196 = 19.136 → 19
    expect(getStatsForLevel('king', 50).atk).toBe(19)
    // Warrior: 18 × 1.196 = 21.528 → 22
    expect(getStatsForLevel('warrior', 50).atk).toBe(22)
    // Executor: 24 × 1.196 = 28.704 → 29
    expect(getStatsForLevel('executor', 50).atk).toBe(29)
    // Specialist: 20 × 1.196 = 23.92 → 24
    expect(getStatsForLevel('specialist', 50).atk).toBe(24)
  })

  it('DEF scales for all roles at level 50 (multiplier 1.196)', () => {
    // King: 14 × 1.196 = 16.744 → 17
    expect(getStatsForLevel('king', 50).def).toBe(17)
    // Warrior: 20 × 1.196 = 23.92 → 24
    expect(getStatsForLevel('warrior', 50).def).toBe(24)
    // Executor: 8 × 1.196 = 9.568 → 10
    expect(getStatsForLevel('executor', 50).def).toBe(10)
    // Specialist: 10 × 1.196 = 11.96 → 12
    expect(getStatsForLevel('specialist', 50).def).toBe(12)
  })

  it('MOB never scales (identical to level 1)', () => {
    expect(getStatsForLevel('king', 50).mob).toBe(BASE_STATS.king.mob)
    expect(getStatsForLevel('warrior', 50).mob).toBe(BASE_STATS.warrior.mob)
    expect(getStatsForLevel('executor', 50).mob).toBe(BASE_STATS.executor.mob)
    expect(getStatsForLevel('specialist', 50).mob).toBe(BASE_STATS.specialist.mob)
  })
})

describe('Stats — getStatsForLevel at level 100 (max)', () => {
  it('King HP at level 100 = 269 (180 × 1.495 = 269.1 → 269)', () => {
    expect(getStatsForLevel('king', 100).hp).toBe(269)
  })

  it('Executor ATK at level 100 (24 × 1.396 = 33.504 → 34)', () => {
    expect(getStatsForLevel('executor', 100).atk).toBe(34)
  })

  it('Warrior DEF at level 100 (20 × 1.396 = 27.92 → 28)', () => {
    expect(getStatsForLevel('warrior', 100).def).toBe(28)
  })

  it('All roles preserve MOB at level 100', () => {
    for (const r of ['king', 'warrior', 'executor', 'specialist'] as const) {
      expect(getStatsForLevel(r, 100).mob).toBe(BASE_STATS[r].mob)
    }
  })
})

describe('Stats — input validation (assertValidLevel)', () => {
  it('throws on level 0', () => {
    expect(() => getStatsForLevel('king', 0)).toThrow(RangeError)
  })

  it('throws on level -1', () => {
    expect(() => getStatsForLevel('king', -1)).toThrow(RangeError)
  })

  it('throws on level 101', () => {
    expect(() => getStatsForLevel('king', 101)).toThrow(RangeError)
  })

  it('throws on non-integer level', () => {
    expect(() => getStatsForLevel('king', 1.5)).toThrow(RangeError)
  })

  it('throws on NaN', () => {
    expect(() => getStatsForLevel('king', NaN)).toThrow(RangeError)
  })

  it('throws on Infinity', () => {
    expect(() => getStatsForLevel('king', Infinity)).toThrow(RangeError)
  })

  it('accepts the exact boundaries 1 and 100', () => {
    expect(() => getStatsForLevel('king', 1)).not.toThrow()
    expect(() => getStatsForLevel('king', 100)).not.toThrow()
  })

  it('assertValidLevel is idempotent (pure — no side effects)', () => {
    expect(() => {
      assertValidLevel(50)
      assertValidLevel(50)
    }).not.toThrow()
  })
})

describe('Stats — invariants across levels', () => {
  it('returned stats are always integers', () => {
    for (const role of ['king', 'warrior', 'executor', 'specialist'] as const) {
      for (let lv = 1; lv <= 100; lv++) {
        const s = getStatsForLevel(role, lv)
        expect(Number.isInteger(s.hp)).toBe(true)
        expect(Number.isInteger(s.atk)).toBe(true)
        expect(Number.isInteger(s.def)).toBe(true)
        expect(Number.isInteger(s.mob)).toBe(true)
      }
    }
  })

  it('HP never decreases as level increases', () => {
    for (const role of ['king', 'warrior', 'executor', 'specialist'] as const) {
      for (let lv = 1; lv < 100; lv++) {
        const a = getStatsForLevel(role, lv)
        const b = getStatsForLevel(role, lv + 1)
        expect(b.hp).toBeGreaterThanOrEqual(a.hp)
      }
    }
  })
})
