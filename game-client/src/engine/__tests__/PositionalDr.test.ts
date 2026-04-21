/**
 * Sprint de Débito — Sistema 2: Positional Damage Reduction
 *
 * Covers:
 *   - PositionalDrEffect.isInZone() geometry (all 3 shapes)
 *   - computeRawDamage sums DR fraction into mitBonus when target is in zone
 *   - Caster-side direction ("behind" flips left vs right)
 *   - Origin is frozen at cast time (caster movement doesn't shift the zone)
 *   - Natural expiration via tickEffects (1-turn duration)
 *   - Three Warrior skills end-to-end:
 *       lw_d1 Escudo do Protetor — rect_back_6 × 0.50 on allies behind
 *       lw_d3 Resistência Absoluta — self + behind_single × 0.65
 *       lw_d6 Postura Defensiva — square_3x3 × 0.25 on allies around
 *   - Stack with existing passives (Protetor) applies additively, clamped
 *     to 0.90 max by DamageFormula
 */

import { describe, it, expect } from 'vitest'
import { Character } from '../../domain/Character'
import type { CharacterRole, CharacterSide } from '../../domain/Character'
import { Team } from '../../domain/Team'
import { Battle } from '../../domain/Battle'
import { Skill } from '../../domain/Skill'
import { PositionalDrEffect } from '../../domain/Effect'
import { CombatEngine } from '../CombatEngine'
import { getStatsForLevel } from '../../domain/Stats'
import { SKILL_CATALOG } from '../../data/skillCatalog'
import type { SkillDefinition } from '../../domain/Skill'
import { PASSIVE_CATALOG } from '../../data/passiveCatalog'

function mkChar(id: string, role: CharacterRole, side: CharacterSide, col = 5, row = 3): Character {
  const s = getStatsForLevel(role, 1)
  return new Character(id, id, role, side, col, row, {
    maxHp: s.hp, attack: s.atk, defense: s.def, mobility: s.mob,
  })
}

function skillDef(id: string): SkillDefinition {
  const s = SKILL_CATALOG.find((x) => x.id === id)
  if (!s) throw new Error(`skill not found: ${id}`)
  return s
}

// ── Pure geometry of PositionalDrEffect.isInZone ─────────────────────────────

describe('PositionalDrEffect — geometry (pure predicate)', () => {
  describe('square_3x3 (9 cells, Chebyshev 1)', () => {
    const effect = new PositionalDrEffect('square_3x3', { col: 5, row: 3 }, 'left', 0.25, 1)

    it('covers origin itself', () => {
      expect(effect.isInZone({ col: 5, row: 3 })).toBe(true)
    })

    it('covers all 8 neighbours', () => {
      const positions = [
        [4, 2], [5, 2], [6, 2],
        [4, 3],         [6, 3],
        [4, 4], [5, 4], [6, 4],
      ]
      for (const [c, r] of positions) {
        expect(effect.isInZone({ col: c, row: r }), `(${c},${r})`).toBe(true)
      }
    })

    it('rejects Chebyshev 2+ tiles', () => {
      expect(effect.isInZone({ col: 3, row: 3 })).toBe(false)
      expect(effect.isInZone({ col: 7, row: 3 })).toBe(false)
      expect(effect.isInZone({ col: 5, row: 1 })).toBe(false)
      expect(effect.isInZone({ col: 5, row: 5 })).toBe(false)
    })
  })

  describe('behind_single', () => {
    it('left-side caster: "behind" is west (col − 1, same row)', () => {
      const e = new PositionalDrEffect('behind_single', { col: 5, row: 3 }, 'left', 0.65, 1)
      expect(e.isInZone({ col: 4, row: 3 })).toBe(true)
      expect(e.isInZone({ col: 6, row: 3 })).toBe(false)   // east not behind for left
      expect(e.isInZone({ col: 5, row: 3 })).toBe(false)   // origin itself not behind
    })

    it('right-side caster: "behind" is east (col + 1, same row)', () => {
      const e = new PositionalDrEffect('behind_single', { col: 10, row: 3 }, 'right', 0.65, 1)
      expect(e.isInZone({ col: 11, row: 3 })).toBe(true)
      expect(e.isInZone({ col: 9,  row: 3 })).toBe(false)
    })

    it('rejects different rows', () => {
      const e = new PositionalDrEffect('behind_single', { col: 5, row: 3 }, 'left', 0.65, 1)
      expect(e.isInZone({ col: 4, row: 2 })).toBe(false)
      expect(e.isInZone({ col: 4, row: 4 })).toBe(false)
    })
  })

  describe('rect_back_6 (3 deep × 2 rows wide behind caster)', () => {
    it('left-side: rectangle extends west of the caster', () => {
      const e = new PositionalDrEffect('rect_back_6', { col: 5, row: 3 }, 'left', 0.50, 1)
      // offCol = (targetCol - originCol) * behindDc where behindDc = -1 for left
      // valid offCol: 1, 2, 3 → targetCol = 4, 3, 2
      // valid row: 2, 3, 4
      const inside = [
        [4, 2], [4, 3], [4, 4],
        [3, 2], [3, 3], [3, 4],
        [2, 2], [2, 3], [2, 4],
      ]
      for (const [c, r] of inside) {
        expect(e.isInZone({ col: c, row: r }), `should include (${c},${r})`).toBe(true)
      }
      // Outside: ahead of caster
      expect(e.isInZone({ col: 6, row: 3 })).toBe(false)
      // Outside: same col as caster
      expect(e.isInZone({ col: 5, row: 3 })).toBe(false)
      // Outside: too far behind (col 1, offCol = 4)
      expect(e.isInZone({ col: 1, row: 3 })).toBe(false)
      // Outside: wrong row
      expect(e.isInZone({ col: 4, row: 5 })).toBe(false)
    })

    it('right-side: rectangle extends east of the caster', () => {
      const e = new PositionalDrEffect('rect_back_6', { col: 10, row: 3 }, 'right', 0.50, 1)
      expect(e.isInZone({ col: 11, row: 3 })).toBe(true)
      expect(e.isInZone({ col: 13, row: 4 })).toBe(true)
      expect(e.isInZone({ col: 9,  row: 3 })).toBe(false)   // ahead
      expect(e.isInZone({ col: 14, row: 3 })).toBe(false)   // too far
    })
  })

  describe('lifecycle', () => {
    it('tick decrements and expires at zero', () => {
      const e = new PositionalDrEffect('square_3x3', { col: 0, row: 0 }, 'left', 0.5, 1)
      expect(e.isExpired).toBe(false)
      e.tick()
      expect(e.isExpired).toBe(true)
    })

    it('integrates with Character.tickEffects (naturally removed)', () => {
      const char = mkChar('c', 'warrior', 'left')
      char.addEffect(new PositionalDrEffect('square_3x3', { col: 5, row: 3 }, 'left', 0.5, 1))
      expect(char.effects.some((e) => e.type === 'positional_dr')).toBe(true)
      char.tickEffects()
      expect(char.effects.some((e) => e.type === 'positional_dr' && !e.isExpired)).toBe(false)
    })
  })
})

// ── computeRawDamage integration ────────────────────────────────────────────

describe('computeRawDamage — positional DR applied when target in zone', () => {
  function setup(): { engine: CombatEngine; attacker: Character; target: Character } {
    const attacker = mkChar('att', 'warrior', 'right', 10, 3)   // DEF 20 ATK 18
    const target   = mkChar('t',   'warrior', 'left',  5, 3)    // DEF 20
    const battle = new Battle({
      leftTeam:  new Team('left',  [target, mkChar('k', 'king', 'left', 0, 0)]),
      rightTeam: new Team('right', [attacker]),
    })
    const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
    return { engine, attacker, target }
  }

  it('baseline damage without DR: 30 × 100/120 = 25', () => {
    const { engine, attacker, target } = setup()
    const skill = new Skill(skillDef('lk_a1'))   // damage power 25 (primary only)
    // Use a custom skill with power 30 for cleaner math:
    const custom = new Skill({
      id: 'test', name: 'Test', category: 'attack', group: 'attack1',
      effectType: 'damage', targetType: 'single', power: 30,
    })
    void skill
    const dmg = engine.computeRawDamage(attacker, target, custom)
    expect(dmg).toBe(25)   // 30 × 0.833 = 25
  })

  it('-25% DR (Postura Defensiva): damage drops by ~25%', () => {
    const { engine, attacker, target } = setup()
    target.addEffect(new PositionalDrEffect(
      'square_3x3',
      { col: target.col, row: target.row },
      'left',
      0.25,
      1,
    ))
    const custom = new Skill({
      id: 'test', name: 'Test', category: 'attack', group: 'attack1',
      effectType: 'damage', targetType: 'single', power: 30,
    })
    // Baseline 25, with -25% DR: 30 × 100/120 × 0.75 = 18.75 → 19
    const dmg = engine.computeRawDamage(attacker, target, custom)
    expect(dmg).toBe(19)
  })

  it('-50% DR (Escudo do Protetor rect_back_6): damage halved', () => {
    const { engine, attacker, target } = setup()
    // Warrior at (6, 3) casts Escudo do Protetor — rect extends west:
    // target (5, 3) is ONE tile west of origin (6,3), offCol = 1, inside rect.
    target.addEffect(new PositionalDrEffect(
      'rect_back_6',
      { col: 6, row: 3 },
      'left',
      0.50,
      1,
    ))
    const custom = new Skill({
      id: 'test', name: 'Test', category: 'attack', group: 'attack1',
      effectType: 'damage', targetType: 'single', power: 30,
    })
    // 30 × 100/120 × 0.50 = 12.5 → 13
    const dmg = engine.computeRawDamage(attacker, target, custom)
    expect(dmg).toBe(13)
  })

  it('DR only applies when target IS in the zone', () => {
    const { engine, attacker, target } = setup()
    // Effect anchored far from target (origin at 0,0, rect_back_6 extends west
    // from col 0 — target at (5,3) NOT in zone).
    target.addEffect(new PositionalDrEffect(
      'rect_back_6',
      { col: 0, row: 0 },
      'left',
      0.50,
      1,
    ))
    const custom = new Skill({
      id: 'test', name: 'Test', category: 'attack', group: 'attack1',
      effectType: 'damage', targetType: 'single', power: 30,
    })
    // No DR applied → baseline 25
    const dmg = engine.computeRawDamage(attacker, target, custom)
    expect(dmg).toBe(25)
  })

  it('stacks additively with Warrior Protetor passive', () => {
    const { engine, attacker, target } = setup()
    // Add a Warrior adjacent to target for Protetor +15% mitigation.
    const protetor = mkChar('p', 'warrior', 'left', 4, 3)   // west neighbor
    const battle = new Battle({
      leftTeam:  new Team('left',  [target, protetor, mkChar('k','king','left',0,0)]),
      rightTeam: new Team('right', [attacker]),
    })
    const engine2 = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
    target.addEffect(new PositionalDrEffect(
      'square_3x3', { col: target.col, row: target.row }, 'left', 0.25, 1,
    ))
    const custom = new Skill({
      id: 'test', name: 'Test', category: 'attack', group: 'attack1',
      effectType: 'damage', targetType: 'single', power: 30,
    })
    // Protetor 0.15 + DR 0.25 = 0.40 mitigation. DEF 20 factor 0.833.
    // 30 × 0.833 × (1 - 0.40) = 15.0 → 15
    const dmg = engine2.computeRawDamage(attacker, target, custom)
    expect(dmg).toBe(15)
    void engine
  })
})

// ── Full skill path via _applyDefenseSkill ──────────────────────────────────

describe('Warrior positional skills — end-to-end', () => {
  function applyDef(caster: Character, skillId: string, team: Character[]): void {
    const battle = new Battle({
      leftTeam:  new Team('left',  team),
      rightTeam: new Team('right', [mkChar('e', 'warrior', 'right', 15, 3)]),
    })
    const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
    engine.syncGrid(battle.allCharacters)
    const skill = new Skill(skillDef(skillId))
    const applyFn = (engine as unknown as {
      _applyDefenseSkill: (c: Character, s: Skill) => void
    })._applyDefenseSkill.bind(engine)
    applyFn(caster, skill)
  }

  it('lw_d1 Escudo do Protetor — ally in rect behind gets DR effect', () => {
    const warrior = mkChar('w', 'warrior', 'left', 10, 3)     // left side, "behind" = west
    const ally    = mkChar('a', 'king',    'left', 9,  3)     // one tile west of warrior
    const faraway = mkChar('k', 'warrior', 'left', 1,  5)     // outside the rect
    applyDef(warrior, 'lw_d1', [warrior, ally, faraway])

    expect(ally.effects.some((e) => e.type === 'positional_dr')).toBe(true)
    expect(faraway.effects.some((e) => e.type === 'positional_dr')).toBe(false)
  })

  it('lw_d3 Resistência Absoluta — self gets DR, ally directly behind also gets it', () => {
    const warrior = mkChar('w', 'warrior', 'left', 10, 3)
    const behind  = mkChar('a', 'king',    'left', 9,  3)
    applyDef(warrior, 'lw_d3', [warrior, behind])

    expect(warrior.effects.some((e) => e.type === 'positional_dr')).toBe(true)
    expect(behind.effects.some((e) => e.type === 'positional_dr')).toBe(true)
  })

  it('lw_d6 Postura Defensiva — all allies in 3x3 get the DR', () => {
    const warrior = mkChar('w', 'warrior', 'left', 10, 3)
    const close   = mkChar('a', 'king',    'left', 11, 3)     // adjacent
    const diag    = mkChar('e', 'executor','left', 9,  4)     // diagonal
    const far     = mkChar('s', 'specialist','left', 1, 1)    // far away
    applyDef(warrior, 'lw_d6', [warrior, close, diag, far])

    expect(warrior.effects.some((e) => e.type === 'positional_dr')).toBe(true)
    expect(close.effects.some((e) => e.type === 'positional_dr')).toBe(true)
    expect(diag.effects.some((e) => e.type === 'positional_dr')).toBe(true)
    expect(far.effects.some((e) => e.type === 'positional_dr')).toBe(false)
  })
})
