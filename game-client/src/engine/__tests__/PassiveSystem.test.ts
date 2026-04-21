/**
 * Tests for the 4 class passives (SKILLS_CATALOG_v3_FINAL §4).
 *
 *   King       — Proteção Real: -20% damage received (INCLUDES true damage)
 *   Warrior    — Protetor: adjacent allies (8 cells) receive -15% damage
 *   Executor   — Isolado: +20% damage dealt / +10% damage received when alone
 *   Specialist — Queimação: hits debuff target's heals -30% for 2 rounds
 *
 * Uses the PassiveSystem directly with minimal Battle/Team fixtures.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PassiveSystem, createDefaultPassiveSystem } from '../PassiveSystem'
import { PASSIVE_CATALOG } from '../../data/passiveCatalog'
import { Character } from '../../domain/Character'
import type { CharacterRole, CharacterSide } from '../../domain/Character'
import { Team } from '../../domain/Team'
import { Battle } from '../../domain/Battle'
import { computeDamage } from '../../domain/DamageFormula'
import { getStatsForLevel } from '../../domain/Stats'

// ── Test fixtures ─────────────────────────────────────────────────────────────

function mkChar(
  id: string,
  role: CharacterRole,
  side: CharacterSide,
  col: number,
  row: number,
): Character {
  const stats = getStatsForLevel(role, 1)
  return new Character(id, `${role}-${id}`, role, side, col, row, {
    maxHp:    stats.hp,
    attack:   stats.atk,
    defense:  stats.def,
    mobility: stats.mob,
  })
}

function mkBattle(left: Character[], right: Character[]): Battle {
  const leftTeam  = new Team('left',  left)
  const rightTeam = new Team('right', right)
  return new Battle({ leftTeam, rightTeam })
}

// Helper to measure what damage Character Y deals to Character X through the
// formula, using the bonuses the PassiveSystem declares. Mirrors
// CombatEngine.computeRawDamage but with no Skill / no effect type.
function dealDamage(
  ps: PassiveSystem,
  caster: Character,
  target: Character,
  battle: Battle,
  basePower: number,
  isTrueDamage = false,
): number {
  const atkBonus = ps.getAtkBonus(caster, battle)
  const mitBonus = ps.getMitigationBonus(target, battle)
  const incoming = ps.getIncomingDamageBonus(target, battle)
  const hpRatio  = target.hp / Math.max(1, target.maxHp)
  return computeDamage({
    basePower,
    targetDef: target.defense,
    targetHpRatio: hpRatio,
    atkBonus,
    mitBonus,
    targetIncomingDamageBonus: incoming,
    round: 1,
    isTrueDamage,
  })
}

// ── Proteção Real (King) ──────────────────────────────────────────────────────

describe('Passive — Proteção Real (King)', () => {
  let ps: PassiveSystem
  beforeEach(() => {
    ps = createDefaultPassiveSystem(PASSIVE_CATALOG)
  })

  it('reduces normal damage by 20% on the King', () => {
    // Attacker is a non-Executor (warrior), no Isolado to muddy the math.
    const attacker = mkChar('att', 'warrior', 'right', 8, 3)
    const king     = mkChar('k',   'king',    'left',  7, 3)
    const battle   = mkBattle([king], [attacker])
    // Base 60 on King (DEF 14):
    //   60 × 100/114 × 0.80 = 42.10 → 42
    const result = dealDamage(ps, attacker, king, battle, 60)
    expect(result).toBe(42)
  })

  it('reduces TRUE damage by 20% on the King (v3 §4.1 explicit)', () => {
    const attacker = mkChar('att', 'warrior', 'right', 8, 3)
    const king     = mkChar('k',   'king',    'left',  7, 3)
    const battle   = mkBattle([king], [attacker])
    // True damage: 60 × 1 × 0.80 = 48
    const result = dealDamage(ps, attacker, king, battle, 60, true)
    expect(result).toBe(48)
  })

  it('does NOT reduce damage on the Warrior (passive is self-only)', () => {
    const attacker = mkChar('att', 'warrior', 'right', 8, 3)
    const warrior  = mkChar('w',   'warrior', 'left',  7, 3)
    const king     = mkChar('k',   'king',    'left',  1, 1)   // faraway
    const battle   = mkBattle([king, warrior], [attacker])
    // Warrior DEF 20 → 60 × 100/120 = 50 (no Proteção Real here)
    const result = dealDamage(ps, attacker, warrior, battle, 60)
    expect(result).toBe(50)
  })
})

// ── Protetor (Warrior) ────────────────────────────────────────────────────────

describe('Passive — Protetor (Warrior, 8-cell adjacency)', () => {
  let ps: PassiveSystem
  beforeEach(() => {
    ps = createDefaultPassiveSystem(PASSIVE_CATALOG)
  })

  // Helper: calculate Specialist damage with/without Warrior adjacency.
  // Use a Warrior attacker (not Executor) so Isolado doesn't pollute the math.
  function specialistDamage(withWarriorAt?: { col: number; row: number }): number {
    const attacker   = mkChar('att', 'warrior',   'right', 8, 3)
    const specialist = mkChar('sp',  'specialist', 'left', 5, 3)
    const allies: Character[] = [specialist]
    if (withWarriorAt) {
      allies.push(mkChar('w', 'warrior', 'left', withWarriorAt.col, withWarriorAt.row))
    }
    // Faraway king so it doesn't count as adjacent.
    allies.push(mkChar('k', 'king', 'left', 0, 0))
    const battle = mkBattle(allies, [attacker])
    return dealDamage(ps, attacker, specialist, battle, 60)
  }

  it('reduces damage on adjacent ally (cardinal direction)', () => {
    const base       = specialistDamage()                          // no warrior
    const protected_ = specialistDamage({ col: 4, row: 3 })         // west neighbor
    expect(protected_).toBeLessThan(base)
  })

  it('reduces damage on adjacent ally (N direction)', () => {
    const protected_ = specialistDamage({ col: 5, row: 2 })
    const base       = specialistDamage()
    expect(protected_).toBeLessThan(base)
  })

  it('reduces damage on DIAGONAL ally (NE, 8-adjacency per v3 §4.2)', () => {
    // Warrior at (6, 2) — diagonal NE of specialist at (5, 3)
    const protected_ = specialistDamage({ col: 6, row: 2 })
    const base       = specialistDamage()
    expect(protected_).toBeLessThan(base)
  })

  it('reduces damage on DIAGONAL ally (SW)', () => {
    const protected_ = specialistDamage({ col: 4, row: 4 })
    const base       = specialistDamage()
    expect(protected_).toBeLessThan(base)
  })

  it('does NOT reduce damage when ally is 2+ cells away', () => {
    const farAway  = specialistDamage({ col: 2, row: 1 }) // Chebyshev distance 3
    const noGuard  = specialistDamage()
    expect(farAway).toBe(noGuard)
  })

  it('does NOT reduce damage on the Warrior itself (self is excluded)', () => {
    const warrior  = mkChar('w',   'warrior', 'left',  5, 3)
    const king     = mkChar('k',   'king',    'left',  0, 0)
    const attacker = mkChar('att', 'warrior', 'right', 8, 3)
    const battle   = mkBattle([king, warrior], [attacker])
    // Warrior DEF 20 → 60 × 100/120 = 50. No Protetor bonus applies to self.
    const result = dealDamage(ps, attacker, warrior, battle, 60)
    expect(result).toBe(50)
  })

  it('stacks multiplicatively with Proteção Real when King is adjacent to Warrior', () => {
    // Attacker targets the King. Warrior adjacent to King → Protetor adds.
    // Use a Warrior attacker to isolate the test from Isolado bonuses.
    const king     = mkChar('k',   'king',    'left',  7, 3)
    const warrior  = mkChar('w',   'warrior', 'left',  7, 2) // above King
    const attacker = mkChar('att', 'warrior', 'right', 8, 3)
    const battle   = mkBattle([king, warrior], [attacker])
    // Mitigation: Proteção Real 0.20 + Protetor 0.15 = 0.35
    // Damage: 60 × 100/114 × (1 - 0.35) = 60 × 0.8772 × 0.65 = 34.21 → 34
    const r = dealDamage(ps, attacker, king, battle, 60)
    expect(r).toBe(34)
  })
})

// ── Isolado (Executor) ────────────────────────────────────────────────────────

describe('Passive — Isolado (Executor, dual +20%/+10%)', () => {
  let ps: PassiveSystem
  beforeEach(() => {
    ps = createDefaultPassiveSystem(PASSIVE_CATALOG)
  })

  it('+20% damage DEALT when caster has no adjacent ally', () => {
    const exec     = mkChar('e',   'executor', 'left',  5, 3)
    const ally     = mkChar('k',   'king',     'left',  0, 0)  // faraway
    const target   = mkChar('t',   'warrior',  'right', 10, 3)
    const battle   = mkBattle([exec, ally], [target])
    // Warrior DEF 20 → 60 × 100/120 × 1.20 = 60
    const r = dealDamage(ps, exec, target, battle, 60)
    expect(r).toBe(60)
  })

  it('+10% damage RECEIVED when target is an isolated Executor', () => {
    const attacker = mkChar('att', 'warrior',  'right', 10, 3)
    const exec     = mkChar('e',   'executor', 'left',  5, 3)
    const ally     = mkChar('k',   'king',     'left',  0, 0)
    const battle   = mkBattle([exec, ally], [attacker])
    // Executor DEF 8 → 60 × 100/108 × 1 × 1.10 = 61.11 → 61
    const r = dealDamage(ps, attacker, exec, battle, 60)
    expect(r).toBe(61)
  })

  it('does NOT activate with ally adjacent (cardinal)', () => {
    const exec   = mkChar('e',   'executor', 'left',  5, 3)
    const ally   = mkChar('a',   'king',     'left',  4, 3) // west neighbor
    const target = mkChar('t',   'warrior',  'right', 10, 3)
    const battle = mkBattle([exec, ally], [target])
    // No +20% on atk (ally adjacent)
    // Warrior DEF 20 → 60 × 100/120 × 1.00 = 50
    const r = dealDamage(ps, exec, target, battle, 60)
    expect(r).toBe(50)
  })

  it('does NOT activate with ally DIAGONAL (NE) — 8-adjacency', () => {
    const exec   = mkChar('e',   'executor', 'left',  5, 3)
    const ally   = mkChar('a',   'king',     'left',  6, 2) // NE diagonal
    const target = mkChar('t',   'warrior',  'right', 10, 3)
    const battle = mkBattle([exec, ally], [target])
    const r = dealDamage(ps, exec, target, battle, 60)
    expect(r).toBe(50)   // not isolated, no bonus
  })

  it('isolated Executor attacking King: Isolado +20% + Proteção Real -20% compound correctly', () => {
    // 30 base × 100/114 × (1 + 0.20) × (1 - 0.20) = 30 × 0.8772 × 1.20 × 0.80 = 25.26 → 25
    const exec   = mkChar('e',   'executor', 'left',  5, 3)
    const king   = mkChar('k',   'king',     'right', 10, 3)
    const battle = mkBattle([exec], [king])
    const r = dealDamage(ps, exec, king, battle, 30)
    expect(r).toBe(25)
  })

  // ── Stack tests (Bloco 4 additions) ──────────────────────────────────────

  it('Isolado +20% stacks with Execute +25% at ≤30% HP (1.20 × 1.25 = 1.50)', () => {
    // Isolated Executor attacks a Warrior at ≤ 30% HP.
    // Base 60 × 100/120 × 1.20 (Isolado) × 1.25 (Execute) = 74.99... → 75
    const exec     = mkChar('e',   'executor', 'left',  5, 3)
    const target   = mkChar('t',   'warrior',  'right', 10, 3)
    const battle   = mkBattle([exec], [target])

    // Push target HP to exactly 30% (Warrior maxHp 200 → 60 HP).
    target.applyPureDamage(140)
    expect(target.hp).toBe(60)

    const r = dealDamage(ps, exec, target, battle, 60)
    expect(r).toBe(75)
  })

  it('Isolado +20% combines with Isolado trade-off when Executor attacks Executor', () => {
    // Both Executors isolated — attacker +20% out, defender +10% in.
    // Base 60 × 100/108 × 1.20 × 1.10 = 73.33 → 73
    const execA    = mkChar('a', 'executor', 'left',  5, 3)
    const allyA    = mkChar('f', 'king',     'left',  0, 0)  // faraway (executor A isolated)
    const execB    = mkChar('b', 'executor', 'right', 10, 3)
    const allyB    = mkChar('g', 'king',     'right', 15, 5) // faraway (executor B isolated)
    const battle   = mkBattle([execA, allyA], [execB, allyB])

    const r = dealDamage(ps, execA, execB, battle, 60)
    expect(r).toBe(73)
  })

  it('Warrior Protetor adjacent to Executor DISABLES trade-off (not isolated anymore)', () => {
    // When Warrior stands next to Executor:
    //   - Executor is NO LONGER isolated → +10% dmg-received trade-off INACTIVE
    //   - Warrior's Protetor passive ACTIVATES → -15% dmg on adjacent allies
    // Net: target Executor receives LESS damage, not more.
    const attacker = mkChar('att', 'warrior',  'right', 10, 3)
    const exec     = mkChar('e',   'executor', 'left',  5, 3)
    const warrior  = mkChar('w',   'warrior',  'left',  4, 3)  // adjacent to executor
    const battle   = mkBattle([exec, warrior], [attacker])

    // No trade-off (not isolated). Protetor applies -15% mit.
    // Executor DEF 8 → 60 × 100/108 × (1 - 0.15) = 47.22 → 47
    const r = dealDamage(ps, attacker, exec, battle, 60)
    expect(r).toBe(47)
  })

  it('8-adjacency completeness: all 8 directions prevent Isolado activation', () => {
    // Sweep every cardinal + diagonal neighbor; verify none of them leave
    // the Executor "isolated" (in the 8-cell sense).
    const positions = [
      { col: 4, row: 3, dir: 'W' },
      { col: 6, row: 3, dir: 'E' },
      { col: 5, row: 2, dir: 'N' },
      { col: 5, row: 4, dir: 'S' },
      { col: 4, row: 2, dir: 'NW' },
      { col: 6, row: 2, dir: 'NE' },
      { col: 4, row: 4, dir: 'SW' },
      { col: 6, row: 4, dir: 'SE' },
    ]
    for (const p of positions) {
      const exec   = mkChar('e', 'executor', 'left', 5, 3)
      const ally   = mkChar('a', 'king',     'left', p.col, p.row)
      const target = mkChar('t', 'warrior',  'right', 10, 3)
      const battle = mkBattle([exec, ally], [target])
      // Without Isolado: Warrior DEF 20 → 60 × 100/120 = 50 (not 60).
      const r = dealDamage(ps, exec, target, battle, 60)
      expect(r, `failed at dir ${p.dir}`).toBe(50)
    }
  })
})

// ── Queimação (Specialist) ────────────────────────────────────────────────────

describe('Passive — Queimação (Specialist)', () => {
  let ps: PassiveSystem

  beforeEach(() => {
    ps = createDefaultPassiveSystem(PASSIVE_CATALOG)
  })

  it('emits a PASSIVE_TRIGGERED event on Specialist damage', () => {
    const specialist = mkChar('sp', 'specialist', 'left', 5, 3)
    const target     = mkChar('t',  'warrior',    'right', 10, 3)
    void mkBattle([specialist], [target])

    const events = ps.onDamageDealt(specialist, target, 1)
    expect(events.some((e) => e.type === 'PASSIVE_TRIGGERED')).toBe(true)
  })

  it('applies HealReduction effect to the target (30%, 2 turns)', () => {
    const specialist = mkChar('sp', 'specialist', 'left', 5, 3)
    const target     = mkChar('t',  'warrior',    'right', 10, 3)
    void mkBattle([specialist], [target])

    ps.onDamageDealt(specialist, target, 1)

    // Target now has a HealReduction effect.
    const hasReduction = target.effects.some((e) => e.type === 'heal_reduction')
    expect(hasReduction).toBe(true)
  })

  it('re-hit renews duration (does not stack)', () => {
    const specialist = mkChar('sp', 'specialist', 'left', 5, 3)
    const target     = mkChar('t',  'warrior',    'right', 10, 3)
    void mkBattle([specialist], [target])

    ps.onDamageDealt(specialist, target, 1)
    const countAfterFirst = target.effects.filter((e) => e.type === 'heal_reduction').length
    ps.onDamageDealt(specialist, target, 2)
    const countAfterSecond = target.effects.filter((e) => e.type === 'heal_reduction').length

    // Character.addEffect replaces same-type; total count stays at 1.
    expect(countAfterFirst).toBe(1)
    expect(countAfterSecond).toBe(1)
  })

  it('does NOT fire on non-Specialist casters', () => {
    const warrior = mkChar('w', 'warrior', 'left', 5, 3)
    const target  = mkChar('t', 'warrior', 'right', 10, 3)
    void mkBattle([warrior], [target])

    const events = ps.onDamageDealt(warrior, target, 1)
    expect(events.some((e) => e.type === 'PASSIVE_TRIGGERED')).toBe(false)
    expect(target.effects.some((e) => e.type === 'heal_reduction')).toBe(false)
  })

  it('affects HEAL amount but not direct damage (verified via Character.heal)', () => {
    const specialist = mkChar('sp', 'specialist', 'left', 5, 3)
    const target     = mkChar('t',  'warrior',    'right', 10, 3)
    void mkBattle([specialist], [target])

    // Apply Queimação to target.
    ps.onDamageDealt(specialist, target, 1)

    // Damage target to create heal headroom (100 out of 200).
    target.applyPureDamage(100)
    expect(target.hp).toBe(100)

    // Now request a 50 HP heal. With -30% reduction, actual heal = 35.
    const result = target.heal(50)
    expect(result.actual).toBe(35)
  })
})

// ── Integration: 4 passives coexist in the same battle ───────────────────────

describe('PassiveSystem — integration across roles', () => {
  it('registers all 4 role passives from PASSIVE_CATALOG', () => {
    const ps = createDefaultPassiveSystem(PASSIVE_CATALOG)
    expect(ps.forRole('king').length).toBeGreaterThanOrEqual(1)
    expect(ps.forRole('warrior').length).toBeGreaterThanOrEqual(1)
    expect(ps.forRole('executor').length).toBeGreaterThanOrEqual(2)  // atk + incoming trade-off
    expect(ps.forRole('specialist').length).toBeGreaterThanOrEqual(1)
  })

  it('full scenario: isolated Executor hits allied-supported King', () => {
    const ps = createDefaultPassiveSystem(PASSIVE_CATALOG)
    // Left team: King + Warrior adjacent to King.
    // Right team: Executor isolated (sem aliados).
    const king     = mkChar('k',   'king',     'left', 7, 3)
    const warrior  = mkChar('w',   'warrior',  'left', 7, 2)
    const exec     = mkChar('e',   'executor', 'right', 12, 3)
    const battle   = mkBattle([king, warrior], [exec])

    // Damage math for 30 base:
    //   atkBonus = 0.20 (Isolado)
    //   mitBonus = 0.20 (Proteção Real) + 0.15 (Protetor) = 0.35
    //   defFactor = 100/114
    //   30 × 0.8772 × (1.20) × (1 - 0.35) = 30 × 0.8772 × 1.20 × 0.65 = 20.53 → 21
    const r = dealDamage(ps, exec, king, battle, 30)
    expect(r).toBe(21)
  })
})
