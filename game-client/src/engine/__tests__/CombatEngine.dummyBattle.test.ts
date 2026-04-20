/**
 * Dummy battle integration test (prompt §1.7).
 *
 * Setup (per prompt):
 *   Team A (left):  King at (2, 2), HP 180, Proteção Real ativa.
 *   Team B (right): Executor at (12, 2), HP 120, Isolado ativa (alone in team).
 *
 * Rule:
 *   Each round, Executor hits the King with a direct-damage skill of power 30.
 *
 * Expected behaviour:
 *   Per-hit damage without execute:
 *     30 × (100/114) × (1 + 0.20 Isolado) × (1 − 0.20 Proteção Real) × 1.0
 *     = 30 × 0.8772 × 1.20 × 0.80 = 25.26 → round(25) = 25
 *
 *   Per-hit damage with execute (King HP ≤ 30% = ≤ 54 HP):
 *     same × 1.25 = 31.58 → 32
 *
 *   Progression (HP measured BEFORE the hit each round):
 *     R1: 180 → 155
 *     R2: 155 → 130
 *     R3: 130 → 105
 *     R4: 105 →  80
 *     R5:  80 →  55
 *     R6:  55 →  30   (ratio 55/180 = 0.306, NO execute yet)
 *     R7:  30 →  dead (ratio 30/180 = 0.167 ≤ 0.30 → execute, 32 dmg)
 *
 *   Therefore the King dies on round 7 (within the 6-8 band the prompt allows).
 *   Overtime never activates (fight ends before round 12).
 *
 * If this test passes, every piece of Bloco 1 works together:
 *   - Base stats (Stats.ts)
 *   - Damage formula with all modifiers (DamageFormula.ts)
 *   - Proteção Real passive (PassiveSystem)
 *   - Isolado passive on dealt damage (PassiveSystem)
 *   - Execute trigger (DamageFormula + CombatEngine)
 *   - Character.takeDamage / death detection
 */

import { describe, it, expect } from 'vitest'
import { CombatEngine } from '../CombatEngine'
import { Character } from '../../domain/Character'
import { Team } from '../../domain/Team'
import { Battle } from '../../domain/Battle'
import { Skill } from '../../domain/Skill'
import { getStatsForLevel } from '../../domain/Stats'
import { PASSIVE_CATALOG } from '../../data/passiveCatalog'

function mkKing(): Character {
  const s = getStatsForLevel('king', 1)
  return new Character('king-a', 'King A', 'king', 'left', 2, 2, {
    maxHp: s.hp, attack: s.atk, defense: s.def, mobility: s.mob,
  })
}
function mkExecutor(): Character {
  const s = getStatsForLevel('executor', 1)
  return new Character('exec-b', 'Executor B', 'executor', 'right', 12, 2, {
    maxHp: s.hp, attack: s.atk, defense: s.def, mobility: s.mob,
  })
}

// A minimal 30-damage skill for the test. Using targetType:'single' and
// effectType:'damage' keeps us on the canonical damage path.
const BASIC_ATTACK = new Skill({
  id:         'test_basic_30',
  name:       'Basic Attack 30',
  category:   'attack',
  group:      'attack1',
  effectType: 'damage',
  targetType: 'single',
  power:      30,
})

describe('CombatEngine — dummy battle (prompt §1.7)', () => {
  it('per-hit damage matches spec: 25 (no execute), 32 (with execute)', () => {
    const king   = mkKing()
    const exec   = mkExecutor()
    const battle = new Battle({
      leftTeam:  new Team('left',  [king]),
      rightTeam: new Team('right', [exec]),
    })
    const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)

    // Before any damage, King at full HP → no execute.
    expect(engine.computeRawDamage(exec, king, BASIC_ATTACK)).toBe(25)

    // Move King's HP to exactly 30% (54 HP) → execute activates.
    king.applyPureDamage(king.maxHp - Math.round(king.maxHp * 0.30))
    expect(king.hp).toBe(54)
    expect(engine.computeRawDamage(exec, king, BASIC_ATTACK)).toBe(32)
  })

  it('simulated battle: King dies between round 6 and 8', () => {
    const king   = mkKing()
    const exec   = mkExecutor()
    const battle = new Battle({
      leftTeam:  new Team('left',  [king]),
      rightTeam: new Team('right', [exec]),
    })
    const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)

    let executeActivated = false
    let roundOfDeath     = -1

    // Drive the battle manually: each iteration represents one round where
    // the Executor hits the King once. We do NOT run the full action phase
    // (that would also involve the King attacking back, which the prompt
    // doesn't model). The prompt's dummy battle is a one-sided slugfest.
    // Round stays at 1 (Battle starts at round 1) — overtime would only fire
    // at round 12, but the fight ends long before that.
    for (let round = 1; round <= 20; round++) {
      // Compute and apply the hit (respects all passives and rules).
      // battle.round is 1 throughout, which is fine — the prompt's expected
      // turn-of-death math assumes no overtime.
      const raw  = engine.computeRawDamage(exec, king, BASIC_ATTACK)
      if (king.hp / king.maxHp <= 0.30) executeActivated = true

      const res = king.takeDamage(raw)
      if (res.killed) {
        roundOfDeath = round
        break
      }
    }

    expect(roundOfDeath).toBeGreaterThanOrEqual(6)
    expect(roundOfDeath).toBeLessThanOrEqual(8)
    expect(executeActivated).toBe(true)
    expect(king.alive).toBe(false)
  })

  it('winning side is right (Executor), reason is king_slain', () => {
    const king   = mkKing()
    const exec   = mkExecutor()
    const battle = new Battle({
      leftTeam:  new Team('left',  [king]),
      rightTeam: new Team('right', [exec]),
    })
    const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)

    // Run until the King dies.
    for (let round = 1; round <= 20 && !battle.isOver; round++) {
      const raw = engine.computeRawDamage(exec, king, BASIC_ATTACK)
      king.takeDamage(raw)
    }

    expect(battle.hasWinner).toBe(true)
    const result = battle.resolveVictory()
    expect(result.winner).toBe('right')
    expect(result.reason).toBe('king_slain')
  })

  it('Isolado +20% and Proteção Real -20% both triggered in the math', () => {
    const king   = mkKing()
    const exec   = mkExecutor()
    const battle = new Battle({
      leftTeam:  new Team('left',  [king]),
      rightTeam: new Team('right', [exec]),
    })
    const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)

    // Without both modifiers:
    //   30 × 100/114 × 1.00 × 1.00 = 26.32 → 26
    // With both:
    //   30 × 100/114 × 1.20 × 0.80 = 25.26 → 25
    // So the compound DROPS final damage from 26 to 25. This confirms
    // both are active (the Executor's +20% doesn't cancel Proteção Real).
    const dmg = engine.computeRawDamage(exec, king, BASIC_ATTACK)
    expect(dmg).toBe(25)

    // Sanity: a Warrior attacker (no Isolado) against non-King target
    // produces a strictly different number.
    const warrior = new Character('w', 'W', 'warrior', 'right', 10, 3, {
      maxHp: 200, attack: 18, defense: 20, mobility: 2,
    })
    // Use a fresh non-King target to isolate Proteção Real from Isolado
    const dummy = new Character('d', 'D', 'warrior', 'left', 5, 3, {
      maxHp: 200, attack: 18, defense: 0, mobility: 2,
    })
    const battle2 = new Battle({
      leftTeam:  new Team('left',  [dummy, mkKing()]),
      rightTeam: new Team('right', [warrior, mkKing()]),
    })
    const engine2 = new CombatEngine(battle2, undefined, PASSIVE_CATALOG)
    // Warrior has no Isolado; target is a Warrior (DEF 0 override) → no Proteção
    // Real, no Protetor (warrior is alone on left next to King far away at 0,0).
    // 30 × 1 × 1 × 1 = 30
    expect(engine2.computeRawDamage(warrior, dummy, BASIC_ATTACK)).toBe(30)
  })
})
