/**
 * Executor skills — tests for the 16 entries in data/skillCatalog.ts
 * (SKILLS_CATALOG_v3_FINAL.md §6.4).
 *
 * Each skill gets ≥ 3 tests. Composite skills test all secondaries.
 * Bleed-conditional skills (le_a1, le_a2, le_a3) are tested both WITH
 * and WITHOUT a pre-existing bleed on the target, validating the v3
 * signature Executor mechanic: +50% damage / shield bypass.
 *
 * Skills requiring systems not implemented (tile-trap, pre-move, cooldown):
 *   le_a8 Armadilha Oculta — tile-trap PARTIAL
 *   le_d4 Teleport        — consume-movement PARTIAL
 *   le_d5 Recuo Rápido    — pre-move shield PARTIAL
 *   le_d3 Ataque em Dobro — cooldown PARTIAL
 * These are marked [PARTIAL] in-test and documented in BLOCO4_REPORT.md.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Character } from '../../domain/Character'
import type { CharacterRole, CharacterSide } from '../../domain/Character'
import { Team } from '../../domain/Team'
import { Battle } from '../../domain/Battle'
import { Skill } from '../../domain/Skill'
import { BleedEffect } from '../../domain/Effect'
import { CombatEngine } from '../CombatEngine'
import { createDefaultResolver } from '../EffectResolver'
import type { EffectContext, EffectResolver } from '../EffectResolver'
import { getStatsForLevel } from '../../domain/Stats'
import { SKILL_CATALOG } from '../../data/skillCatalog'
import type { SkillDefinition } from '../../domain/Skill'
import { PASSIVE_CATALOG } from '../../data/passiveCatalog'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkChar(id: string, role: CharacterRole, side: CharacterSide, col = 5, row = 3): Character {
  const s = getStatsForLevel(role, 1)
  return new Character(id, id, role, side, col, row, {
    maxHp: s.hp, attack: s.atk, defense: s.def, mobility: s.mob,
  })
}

function executorSkill(id: string): SkillDefinition {
  const def = SKILL_CATALOG.find((s) => s.id === id)
  if (!def) throw new Error(`Executor skill not found: ${id}`)
  return def
}

function ctx(
  caster: Character,
  target: Character,
  power: number,
  rawDamage = 0,
  ticks?: number,
): EffectContext {
  return { caster, target, power, rawDamage, round: 1, ticks }
}

/**
 * Apply an attack skill through the full CombatEngine path (including the
 * bleed-conditional hooks and skill-specific post-hooks). Used by tests
 * that need to exercise the integrated mechanic, not just the resolver.
 */
function applyAttack(
  caster: Character,
  target: Character,
  skillId: string,
  teamLeft?: Character[],
  teamRight?: Character[],
): { engine: CombatEngine; skill: Skill } {
  const battle = new Battle({
    leftTeam:  new Team('left',  teamLeft  ?? [caster]),
    rightTeam: new Team('right', teamRight ?? [target]),
  })
  const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
  engine.syncGrid(battle.allCharacters)
  const skill = new Skill(executorSkill(skillId))
  const applyFn = (engine as unknown as {
    _applyAttackSkill: (c: Character, s: Skill, t: { kind: string; col?: number; row?: number; characterId?: string }, side: string) => void
  })._applyAttackSkill.bind(engine)

  if (skill.targetType === 'single') {
    applyFn(caster, skill, { kind: 'character', characterId: target.id }, 'left')
  } else if (skill.targetType === 'area') {
    applyFn(caster, skill, { kind: 'area', col: target.col, row: target.row }, 'left')
  }
  return { engine, skill }
}

// ── Attack 1 ─────────────────────────────────────────────────────────────────

describe('Executor — Attack 1 (dano alto + bleed-conditional)', () => {
  let resolver: EffectResolver
  beforeEach(() => { resolver = createDefaultResolver() })

  // ── le_a1 Corte Mortal ─────────────────────────────────────────────────────
  describe('le_a1 — Corte Mortal (45 dmg single + cleanse + bleed bonus)', () => {
    it('catalog entry', () => {
      const s = executorSkill('le_a1')
      expect(s.name).toBe('Corte Mortal')
      expect(s.power).toBe(45)
      expect(s.effectType).toBe('damage')
      expect(s.targetType).toBe('single')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('cleanse')
    })

    it('normal hit (no bleed on target): base damage applies', () => {
      const exec   = mkChar('e', 'executor', 'left', 5, 3)
      const target = mkChar('t', 'warrior',  'right', 6, 3)   // DEF 20
      const hpBefore = target.hp
      applyAttack(exec, target, 'le_a1')
      // Base 45 × 100/120 × 1.20 Isolado = 45 × 1 = 45 exactly.
      // But target had no bleed → no +50%.
      // Actually: 45 × 100/120 × 1.20 = 45.0 → 45
      expect(hpBefore - target.hp).toBe(45)
    })

    it('+50% damage when target had bleed pre-hit (v3 §6.4 signature)', () => {
      const exec   = mkChar('e', 'executor', 'left', 5, 3)
      const target = mkChar('t', 'warrior',  'right', 6, 3)
      target.addEffect(new BleedEffect(4, 3))   // pre-apply bleed

      const hpBefore = target.hp
      applyAttack(exec, target, 'le_a1')
      // Same base 45, amplified ×1.5 pre-mitigation:
      // rawDamage = round(45 × 100/120 × 1.20 × 1.5) = round(67.5) = 68
      // But formula applies mitigation once, then amplifies. Let's check actual.
      // Our code: rawDamage computed with full formula, THEN × 1.5 rounded.
      // base 45 × 100/120 × 1.20 = 45.0 → round 45, then × 1.5 = 67.5 → 68
      expect(hpBefore - target.hp).toBe(68)
    })

    it('cleanse secondary removes target debuffs after hit', () => {
      const exec   = mkChar('e', 'executor', 'left', 5, 3)
      const target = mkChar('t', 'warrior',  'right', 6, 3)
      target.addEffect(new BleedEffect(4, 3))
      expect(target.effects.some((e) => e.type === 'bleed')).toBe(true)

      applyAttack(exec, target, 'le_a1')
      // Cleanse removes debuffs after the bleed-conditional snapshot captured
      // the amplification. Post-hit, bleed is gone.
      expect(target.effects.some((e) => e.type === 'bleed')).toBe(false)
    })
  })

  // ── le_a2 Tempestade de Lâminas ────────────────────────────────────────────
  describe('le_a2 — Tempestade de Lâminas (26 dmg 3x3 + bleed bonus per-target)', () => {
    it('catalog entry', () => {
      const s = executorSkill('le_a2')
      expect(s.name).toBe('Tempestade de Lâminas')
      expect(s.power).toBe(26)
      expect(s.effectType).toBe('area')
      expect(s.areaShape?.type).toBe('square')
    })

    it('normal hit: base damage in area, no bleed bonus', () => {
      // Two Warriors adjacent to each other → Warrior Protetor reduces each
      // other's damage taken by 15%. Executor is isolated (alone on left).
      // Math: 26 × 100/120 × 1.20 (Isolado) × 0.85 (Protetor) = 22.1 → 22
      const exec = mkChar('e', 'executor', 'left',  5, 3)
      const t1   = mkChar('t1', 'warrior', 'right', 7, 3)
      const t2   = mkChar('t2', 'warrior', 'right', 8, 3)
      const hp1Before = t1.hp
      const hp2Before = t2.hp
      applyAttack(exec, mkChar('center', 'warrior', 'right', 8, 3), 'le_a2', [exec], [t1, t2])
      expect(hp1Before - t1.hp).toBe(22)
      expect(hp2Before - t2.hp).toBe(22)
    })

    it('per-target bleed conditional: only bleeding targets get +50%', () => {
      const exec = mkChar('e', 'executor', 'left',  5, 3)
      const t1   = mkChar('t1', 'warrior', 'right', 7, 3)
      const t2   = mkChar('t2', 'warrior', 'right', 8, 3)
      t1.addEffect(new BleedEffect(4, 3))   // only t1 has bleed

      const hp1Before = t1.hp
      const hp2Before = t2.hp
      applyAttack(exec, mkChar('center', 'warrior', 'right', 8, 3), 'le_a2', [exec], [t1, t2])
      // Both take 22 base (Protetor active on both). t1 gets +50% → 22 × 1.5 = 33.
      expect(hp1Before - t1.hp).toBe(33)
      expect(hp2Before - t2.hp).toBe(22)
    })
  })

  // ── le_a3 Disparo Preciso ──────────────────────────────────────────────────
  describe('le_a3 — Disparo Preciso (30 true damage + shield bypass if bleed)', () => {
    it('catalog entry', () => {
      const s = executorSkill('le_a3')
      expect(s.name).toBe('Disparo Preciso')
      expect(s.power).toBe(30)
      expect(s.effectType).toBe('true_damage')
    })

    it('true damage ignores DEF (no bleed case)', () => {
      const exec   = mkChar('e', 'executor', 'left',  5, 3)
      const target = mkChar('t', 'warrior',  'right', 6, 3)   // DEF 20 — ignored
      const hpBefore = target.hp
      applyAttack(exec, target, 'le_a3')
      // True damage: 30 power. ATK/DEF formula bypassed.
      // NOTE: the current generic handler still goes through takeDamage →
      // no shield interception happens here because target has no shield.
      expect(hpBefore - target.hp).toBe(30)
    })

    it('shield absorbs true damage normally when target has NO bleed', () => {
      const exec   = mkChar('e', 'executor', 'left',  5, 3)
      const target = mkChar('t', 'warrior',  'right', 6, 3)
      target.addShield(20)
      const hpBefore = target.hp

      applyAttack(exec, target, 'le_a3')
      // Shield 20 absorbs, 10 hits HP.
      expect(target.totalShield).toBe(0)
      expect(hpBefore - target.hp).toBe(10)
    })

    it('BYPASSES shield when target had bleed pre-hit (v3 §6.4)', () => {
      const exec   = mkChar('e', 'executor', 'left',  5, 3)
      const target = mkChar('t', 'warrior',  'right', 6, 3)
      target.addShield(50)
      target.addEffect(new BleedEffect(4, 3))
      const hpBefore = target.hp
      const shieldBefore = target.totalShield

      applyAttack(exec, target, 'le_a3')
      // Shield remains intact (bypassed via applyPureDamage), 30 hits HP.
      expect(target.totalShield).toBe(shieldBefore)   // shield untouched
      expect(hpBefore - target.hp).toBe(30)
    })
  })

  // ── le_a4 Corte Preciso ────────────────────────────────────────────────────
  describe('le_a4 — Corte Preciso (22 dmg line + purge)', () => {
    it('catalog entry', () => {
      const s = executorSkill('le_a4')
      expect(s.name).toBe('Corte Preciso')
      expect(s.power).toBe(22)
      expect(s.effectType).toBe('damage')
      expect(s.areaShape?.type).toBe('line')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('purge')
    })

    it('primary damage applies', () => {
      const exec   = mkChar('e', 'executor', 'left')
      const target = mkChar('t', 'specialist', 'right')
      const hpBefore = target.hp
      resolver.resolve('damage', ctx(exec, target, 22, 22))
      expect(target.hp).toBe(hpBefore - 22)
    })

    it('purge removes buffs from target', () => {
      const exec   = mkChar('e', 'executor', 'left')
      const target = mkChar('t', 'specialist', 'right')
      target.addShield(20)   // shield is a buff
      expect(target.totalShield).toBe(20)
      resolver.resolve('purge', ctx(exec, target, 0, 0))
      expect(target.totalShield).toBe(0)
    })
  })
})

// ── Attack 2 (bleeds) ────────────────────────────────────────────────────────

describe('Executor — Attack 2 (bleeds)', () => {
  let resolver: EffectResolver
  beforeEach(() => { resolver = createDefaultResolver() })

  // ── le_a5 Corte Hemorragia ─────────────────────────────────────────────────
  describe('le_a5 — Corte Hemorragia (8 dmg + bleed 4/3t)', () => {
    it('catalog entry', () => {
      const s = executorSkill('le_a5')
      expect(s.name).toBe('Corte Hemorragia')
      expect(s.power).toBe(8)
      expect(s.effectType).toBe('bleed')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('bleed')
      expect(s.secondaryEffects?.[0]?.power).toBe(4)
      expect(s.secondaryEffects?.[0]?.ticks).toBe(3)
    })

    it('applies bleed effect to target', () => {
      const exec   = mkChar('e', 'executor', 'left')
      const target = mkChar('t', 'warrior', 'right')
      resolver.resolve('bleed', ctx(exec, target, 4, 0, 3))
      expect(target.effects.some((e) => e.type === 'bleed' && !e.isExpired)).toBe(true)
    })

    it('bleed ticks deal damage over rounds', () => {
      const target = mkChar('t', 'warrior', 'right')
      target.addEffect(new BleedEffect(4, 2))
      const hpBefore = target.hp
      target.tickEffects()
      expect(target.hp).toBe(hpBefore - 4)
    })
  })

  // ── le_a6 Bomba de Espinhos ────────────────────────────────────────────────
  describe('le_a6 — Bomba de Espinhos (10 dmg diamond r2 + bleed 5/2t)', () => {
    it('catalog entry', () => {
      const s = executorSkill('le_a6')
      expect(s.name).toBe('Bomba de Espinhos')
      expect(s.power).toBe(10)
      expect(s.effectType).toBe('bleed')
      // TS-narrow via discriminated union: check type first, then radius.
      expect(s.areaShape?.type).toBe('diamond')
      if (s.areaShape?.type === 'diamond') {
        expect(s.areaShape.radius).toBe(2)
      }
      expect(s.secondaryEffects?.[0]?.power).toBe(5)
      expect(s.secondaryEffects?.[0]?.ticks).toBe(2)
    })

    it('bleed secondary is stronger (5) and shorter (2t) than le_a5 (4/3t)', () => {
      const a6 = executorSkill('le_a6')
      const a5 = executorSkill('le_a5')
      expect(a6.secondaryEffects?.[0]?.power).toBeGreaterThan(a5.secondaryEffects?.[0]?.power ?? 0)
      expect(a6.secondaryEffects?.[0]?.ticks).toBeLessThan(a5.secondaryEffects?.[0]?.ticks ?? 999)
    })

    it('bleed ticks for 2 rounds then expires', () => {
      const target = mkChar('t', 'warrior', 'right')
      target.addEffect(new BleedEffect(5, 2))
      target.tickEffects()  // tick 1
      expect(target.effects.some((e) => e.type === 'bleed' && !e.isExpired)).toBe(true)
      target.tickEffects()  // tick 2 → expires
      expect(target.effects.some((e) => e.type === 'bleed' && !e.isExpired)).toBe(false)
    })
  })

  // ── le_a7 Marca da Morte ───────────────────────────────────────────────────
  describe('le_a7 — Marca da Morte (12 dmg area + bleed 8/2t)', () => {
    it('catalog entry', () => {
      const s = executorSkill('le_a7')
      expect(s.name).toBe('Marca da Morte')
      expect(s.power).toBe(12)
      expect(s.effectType).toBe('area')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('bleed')
    })

    it('bleed 8/2t is the strongest Executor bleed tick in the catalog', () => {
      const s = executorSkill('le_a7')
      expect(s.secondaryEffects?.[0]?.power).toBe(8)
    })

    it('strips every hit target shield BEFORE damage (v3 anti-shield identity)', () => {
      const exec   = mkChar('e', 'executor', 'left',  5, 3)
      const target = mkChar('t', 'warrior',  'right', 5, 5)  // within vertical line
      target.addShield(40)
      expect(target.totalShield).toBe(40)
      applyAttack(exec, target, 'le_a7')
      expect(target.totalShield).toBe(0)   // fully stripped
    })

    it('heals Executor for 20% of the total shield HP stripped', () => {
      const exec   = mkChar('e', 'executor', 'left',  5, 3)
      const target = mkChar('t', 'warrior',  'right', 5, 5)
      exec.applyPureDamage(50)               // give Executor headroom
      const hpBefore = exec.hp
      target.addShield(80)                    // 80 shield → heal 16

      applyAttack(exec, target, 'le_a7')

      // Executor gains 20% × 80 = 16 HP (if heal cap + heal reduction don't cut it).
      expect(exec.hp - hpBefore).toBe(16)
    })

    it('no heal when target has no shield', () => {
      const exec   = mkChar('e', 'executor', 'left',  5, 3)
      const target = mkChar('t', 'warrior',  'right', 5, 5)
      exec.applyPureDamage(30)
      const hpBefore = exec.hp
      applyAttack(exec, target, 'le_a7')
      expect(exec.hp).toBe(hpBefore)  // no heal — no shield to convert
    })

    it('multi-target area: sums shield from all targets for the heal', () => {
      const exec = mkChar('e', 'executor', 'left',  5, 3)
      const t1 = mkChar('t1', 'warrior', 'right', 5, 4)  // within vertical line 3
      const t2 = mkChar('t2', 'warrior', 'right', 5, 5)
      const t3 = mkChar('t3', 'warrior', 'right', 5, 6)  // out of bounds check
      t1.addShield(30)
      t2.addShield(50)
      exec.applyPureDamage(50)
      const hpBefore = exec.hp

      applyAttack(exec, mkChar('center', 'warrior', 'right', 5, 5), 'le_a7',
                  [exec], [t1, t2, t3])

      // Total shield stripped from hits in the line area: at least t1+t2 = 80.
      // Heal = round(80 × 0.20) = 16 minimum (could be more if t3 also in line).
      expect(exec.hp - hpBefore).toBeGreaterThanOrEqual(16)
    })
  })

  // ── le_a8 Armadilha Oculta ─────────────────────────────────────────────────
  describe('le_a8 — Armadilha Oculta', () => {
    it('catalog entry targets a tile (area w/ single shape) with bleed secondary', () => {
      const s = executorSkill('le_a8')
      expect(s.name).toBe('Armadilha Oculta')
      expect(s.power).toBe(15)
      expect(s.targetType).toBe('area')
      expect(s.areaShape?.type).toBe('single')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('bleed')
    })

    it('cast places a trap obstacle at the aim tile and deals no damage', () => {
      const exec = mkChar('e', 'executor', 'left', 3, 3)
      const enemy = mkChar('x', 'warrior', 'right', 15, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [enemy]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill = new Skill(executorSkill('le_a8'))
      const enemyHp = enemy.hp
      ;(engine as unknown as {
        _applyAttackSkill: (c: Character, s: Skill, t: unknown, side: string) => void
      })._applyAttackSkill.bind(engine)(
        exec, skill, { kind: 'area', col: 10, row: 3 }, 'left',
      )
      const grid = (engine as unknown as { _grid: { obstacleAt: (c: number, r: number) => { kind: string; sourceId: string } | null } })._grid
      const trap = grid.obstacleAt(10, 3)
      expect(trap?.kind).toBe('trap')
      expect(trap?.sourceId).toBe(exec.id)
      expect(enemy.hp).toBe(enemyHp)   // no direct damage at cast
    })

    it('trap does NOT spawn on an occupied tile', () => {
      const exec = mkChar('e', 'executor', 'left', 3, 3)
      const enemy = mkChar('x', 'warrior', 'right', 10, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [enemy]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill = new Skill(executorSkill('le_a8'))
      ;(engine as unknown as {
        _applyAttackSkill: (c: Character, s: Skill, t: unknown, side: string) => void
      })._applyAttackSkill.bind(engine)(
        exec, skill, { kind: 'area', col: 10, row: 3 }, 'left',
      )
      const grid = (engine as unknown as { _grid: { obstacleAt: (c: number, r: number) => { kind: string } | null } })._grid
      expect(grid.obstacleAt(10, 3)).toBeNull()
    })

    it('trap triggers on push — 15 damage + bleed + snare applied', () => {
      const exec = mkChar('e', 'executor', 'left', 3, 3)
      const warrior = mkChar('w', 'warrior', 'left', 5, 3)   // will push
      const enemy = mkChar('x', 'king', 'right', 10, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec, warrior]),
        rightTeam: new Team('right', [enemy]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)

      // Place trap at (11, 3) (one tile east of enemy).
      const trapSkill = new Skill(executorSkill('le_a8'))
      ;(engine as unknown as {
        _applyAttackSkill: (c: Character, s: Skill, t: unknown, side: string) => void
      })._applyAttackSkill.bind(engine)(
        exec, trapSkill, { kind: 'area', col: 11, row: 3 }, 'left',
      )

      const hpBefore = enemy.hp
      // Push the enemy east by 1 so they land on the trap tile.
      ;(engine as unknown as {
        _executePush: (id: string, dir: string, force: number) => void
      })._executePush.bind(engine)(enemy.id, 'east', 1)

      expect(enemy.hp).toBe(hpBefore - 15)
      expect(enemy.effects.some((e) => e.type === 'bleed'  && !e.isExpired)).toBe(true)
      expect(enemy.effects.some((e) => e.type === 'snare'  && !e.isExpired)).toBe(true)
      const grid = (engine as unknown as { _grid: { obstacleAt: (c: number, r: number) => unknown } })._grid
      expect(grid.obstacleAt(11, 3)).toBeNull()   // trap consumed
    })
  })
})

// ── Defense 1 ────────────────────────────────────────────────────────────────

describe('Executor — Defense 1 (self-buffs)', () => {
  let resolver: EffectResolver
  beforeEach(() => { resolver = createDefaultResolver() })

  // ── le_d1 Refletir ─────────────────────────────────────────────────────────
  describe('le_d1 — Refletir (reflect 25 + [PARTIAL] -25% DR)', () => {
    it('catalog entry', () => {
      const s = executorSkill('le_d1')
      expect(s.name).toBe('Refletir')
      expect(s.power).toBe(25)
      expect(s.effectType).toBe('reflect')
    })

    it('reflect effect is applied to caster (reflects future damage)', () => {
      const exec = mkChar('e', 'executor', 'left')
      resolver.resolve('reflect', ctx(exec, exec, 25))
      expect(exec.effects.some((e) => e.type === 'reflect' && !e.isExpired)).toBe(true)
    })

    // v3 §6.4 Refletir — implemented via skill-specific intercept in
    // CombatEngine._applyDefenseSkill that applies ReflectPercentEffect
    // (absorb 25% + reflect 25%) instead of the generic flat ReflectEffect.

    it('-25% DR: bearer takes 75 of a 100 damage hit (25 absorbed)', () => {
      const exec = mkChar('e', 'executor', 'left', 5, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [mkChar('enemy', 'warrior', 'right', 10, 3)]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill = new Skill(executorSkill('le_d1'))
      const applyFn = (engine as unknown as {
        _applyDefenseSkill: (c: Character, s: Skill) => void
      })._applyDefenseSkill.bind(engine)
      applyFn(exec, skill)

      // Reflect effect is active with 25% fraction.
      const hpBefore = exec.hp
      const result = exec.takeDamage(100)
      // Absorbed 25 (from reflect), 75 reaches HP.
      expect(exec.hp).toBe(hpBefore - 75)
      expect(result.shieldAbsorbed).toBe(25)
      expect(result.reflected).toBe(25)
    })

    it('reflects 25% back to attacker', () => {
      const exec = mkChar('e', 'executor', 'left', 5, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [mkChar('enemy', 'warrior', 'right', 10, 3)]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const applyFn = (engine as unknown as {
        _applyDefenseSkill: (c: Character, s: Skill) => void
      })._applyDefenseSkill.bind(engine)

      applyFn(exec, new Skill(executorSkill('le_d1')))
      // 80 damage hit: absorbed 20, reflected 20, HP takes 60.
      const result = exec.takeDamage(80)
      expect(result.reflected).toBe(20)
    })

    it('single-use: expires after one reflected hit', () => {
      const exec = mkChar('e', 'executor', 'left', 5, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [mkChar('enemy', 'warrior', 'right', 10, 3)]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const applyFn = (engine as unknown as {
        _applyDefenseSkill: (c: Character, s: Skill) => void
      })._applyDefenseSkill.bind(engine)
      applyFn(exec, new Skill(executorSkill('le_d1')))

      exec.takeDamage(100)   // first hit triggers
      // Reflect has expired. Second hit is not intercepted.
      const result = exec.takeDamage(40)
      expect(result.reflected).toBe(0)
    })
  })

  // ── le_d2 Adrenalina ───────────────────────────────────────────────────────
  describe('le_d2 — Adrenalina (atk_up 25 for 2t + HP cost on expire)', () => {
    it('catalog entry', () => {
      const s = executorSkill('le_d2')
      expect(s.name).toBe('Adrenalina')
      expect(s.power).toBe(25)
      expect(s.effectType).toBe('atk_up')
    })

    it('atk_up 25 buffs executor attack', () => {
      const exec = mkChar('e', 'executor', 'left')
      const atkBefore = exec.attack   // base 24
      resolver.resolve('atk_up', ctx(exec, exec, 25, 0, 2))
      expect(exec.attack).toBe(atkBefore + 25)
    })

    // v3 §6.4 Adrenalina post-expire HP cost — implemented via
    // Character.setAdrenalinePenalty + tickEffects decrement.

    function applyAdrenalina(exec: Character): CombatEngine {
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [mkChar('enemy', 'warrior', 'right', 10, 3)]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill = new Skill(executorSkill('le_d2'))
      const applyFn = (engine as unknown as {
        _applyDefenseSkill: (c: Character, s: Skill) => void
      })._applyDefenseSkill.bind(engine)
      applyFn(exec, skill)
      return engine
    }

    it('grants atk_up and queues the HP penalty', () => {
      const exec = mkChar('e', 'executor', 'left', 5, 3)
      const atkBefore = exec.attack
      applyAdrenalina(exec)
      expect(exec.attack).toBeGreaterThan(atkBefore)  // buff active
      // Executor base HP 120 → 15% = 18 HP cost queued.
      expect(exec.adrenalinePenaltyHp).toBe(18)
      expect(exec.adrenalinePenaltyTicks).toBe(2)
    })

    it('penalty fires when the buff expires (after 2 ticks)', () => {
      const exec = mkChar('e', 'executor', 'left', 5, 3)
      applyAdrenalina(exec)
      const hpBefore = exec.hp

      exec.tickEffects()   // tick 1: buff still active, penalty counter → 1
      expect(exec.adrenalinePenaltyTicks).toBe(1)
      expect(exec.hp).toBe(hpBefore)   // no damage yet

      exec.tickEffects()   // tick 2: buff expires, penalty fires
      // 15% of 120 = 18 HP damage (no shield to absorb in this test).
      expect(exec.hp).toBe(hpBefore - 18)
      expect(exec.adrenalinePenaltyHp).toBe(0)
    })

    it('shield absorbs the expiration cost (v3 "bloqueável por shield")', () => {
      const exec = mkChar('e', 'executor', 'left', 5, 3)
      applyAdrenalina(exec)
      exec.addShield(30)               // enough to absorb the full 18 cost
      const hpBefore = exec.hp

      exec.tickEffects()
      exec.tickEffects()               // penalty triggers

      // Shield absorbed 18, HP untouched.
      expect(exec.hp).toBe(hpBefore)
      expect(exec.totalShield).toBe(30 - 18)
    })

    it('lethal penalty can kill the Executor if HP ≤ cost and no shield', () => {
      const exec = mkChar('e', 'executor', 'left', 5, 3)
      exec.applyPureDamage(exec.hp - 10)  // leave 10 HP
      applyAdrenalina(exec)

      exec.tickEffects()
      exec.tickEffects()   // 18 damage > 10 HP → death

      expect(exec.alive).toBe(false)
    })
  })

  // ── le_d3 Ataque em Dobro ──────────────────────────────────────────────────
  describe('le_d3 — Ataque em Dobro', () => {
    it('catalog entry exposes cooldownTurns=2', () => {
      const s = executorSkill('le_d3')
      expect(s.name).toBe('Ataque em Dobro')
      expect(s.effectType).toBe('double_attack')
      expect(s.cooldownTurns).toBe(2)
    })

    it('double_attack sets the caster flag', () => {
      const exec = mkChar('e', 'executor', 'left')
      expect(exec.doubleAttackNextTurn).toBe(false)
      resolver.resolve('double_attack', ctx(exec, exec, 0))
      expect(exec.doubleAttackNextTurn).toBe(true)
    })

    it('cooldown blocks re-selection for 2 rounds after use', () => {
      const exec = mkChar('e', 'executor', 'left')
      const king = mkChar('k', 'king', 'right', 6, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [king]),
        startPhase: 'action',
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)

      const skill = new Skill(executorSkill('le_d3'))

      // Round 1 — selection allowed, use records cooldown at round 1+2=3.
      expect(engine.selectDefense(exec.id, skill).ok).toBe(true)
      ;(engine as unknown as {
        _applyDefenseSkill: (c: Character, s: Skill) => void
      })._applyDefenseSkill.bind(engine)(exec, skill)

      // Round 2 — still on cooldown (available at 3).
      ;(battle as unknown as { _round: number })._round = 2
      expect(exec.isSkillOnCooldown('le_d3', 2)).toBe(true)
      const r2 = engine.selectDefense(exec.id, skill)
      expect(r2.ok).toBe(false)

      // Round 3 — off cooldown.
      ;(battle as unknown as { _round: number })._round = 3
      expect(exec.isSkillOnCooldown('le_d3', 3)).toBe(false)
      expect(exec.skillCooldownRemaining('le_d3', 3)).toBe(0)
    })

    it('skills without cooldownTurns never enter cooldown', () => {
      const exec = mkChar('e', 'executor', 'left')
      expect(exec.isSkillOnCooldown('le_a1', 1)).toBe(false)
      exec.noteSkillUsed('le_a1', 1, 0)  // cooldown 0 → no-op
      expect(exec.isSkillOnCooldown('le_a1', 1)).toBe(false)
      expect(exec.isSkillOnCooldown('le_a1', 2)).toBe(false)
    })
  })

  // ── le_d4 Teleport ─────────────────────────────────────────────────────────
  describe('le_d4 — Teleport', () => {
    it('catalog entry declares preMovement (5 sqm, ignores obstacles, consumes next move)', () => {
      const s = executorSkill('le_d4')
      expect(s.name).toBe('Teleport')
      expect(s.effectType).toBe('teleport_self')
      expect(s.preMovement?.maxTiles).toBe(5)
      expect(s.preMovement?.ignoresObstacles).toBe(true)
      expect(s.preMovement?.consumesNextMovement).toBe(true)
    })

    it('pre-movement relocates the caster and flags next movement consumed', () => {
      const exec = mkChar('e', 'executor', 'left', 5, 3)
      const enemy = mkChar('x', 'king', 'right', 15, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [enemy]),
        startPhase: 'action',
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)

      const skill = new Skill(executorSkill('le_d4'))
      expect(engine.selectDefense(exec.id, skill).ok).toBe(true)
      expect(engine.selectPreMovement(exec.id, 'defense', 7, 3).ok).toBe(true)

      ;(engine as unknown as {
        _applyDefenseSkill: (c: Character, s: Skill) => void
      })._applyDefenseSkill.bind(engine)(exec, skill)

      expect(exec.col).toBe(7)
      expect(exec.movementConsumedNextTurn).toBe(true)
    })

    it('rejects pre-movement beyond maxTiles', () => {
      const exec = mkChar('e', 'executor', 'left', 5, 3)
      const enemy = mkChar('x', 'king', 'right', 15, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [enemy]),
        startPhase: 'action',
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)

      const skill = new Skill(executorSkill('le_d4'))
      engine.selectDefense(exec.id, skill)
      // 5 sqm max; (5,3) → (12,3) is 7 tiles
      expect(engine.selectPreMovement(exec.id, 'defense', 12, 3).ok).toBe(false)
    })
  })
})

// ── Defense 2 ────────────────────────────────────────────────────────────────

describe('Executor — Defense 2 (leves)', () => {
  let resolver: EffectResolver
  beforeEach(() => { resolver = createDefaultResolver() })

  // ── le_d5 Recuo Rápido ─────────────────────────────────────────────────────
  describe('le_d5 — Recuo Rápido', () => {
    it('catalog entry declares preMovement (2 sqm, restricted to own side)', () => {
      const s = executorSkill('le_d5')
      expect(s.name).toBe('Recuo Rápido')
      expect(s.effectType).toBe('shield')
      expect(s.power).toBe(20)
      expect(s.preMovement?.maxTiles).toBe(2)
      expect(s.preMovement?.restrictToOwnSide).toBe(true)
      // Does NOT consume next movement (unlike Teleport).
      expect(s.preMovement?.consumesNextMovement).toBeFalsy()
    })

    it('shield 20 applies to executor', () => {
      const exec = mkChar('e', 'executor', 'left')
      resolver.resolve('shield', ctx(exec, exec, 20, 0, 1))
      expect(exec.totalShield).toBe(20)
    })

    it('rejects pre-movement to the enemy half', () => {
      const exec = mkChar('e', 'executor', 'left', 7, 3)
      const enemy = mkChar('x', 'king', 'right', 15, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [enemy]),
        startPhase: 'action',
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill = new Skill(executorSkill('le_d5'))
      engine.selectDefense(exec.id, skill)
      // Trying to step into the right half of the arena should fail.
      const r = engine.selectPreMovement(exec.id, 'defense', 9, 3)
      expect(r.ok).toBe(false)
    })

    it('pre-movement within own side succeeds and shield still applies', () => {
      const exec = mkChar('e', 'executor', 'left', 7, 3)
      const enemy = mkChar('x', 'king', 'right', 15, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [exec]),
        rightTeam: new Team('right', [enemy]),
        startPhase: 'action',
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill = new Skill(executorSkill('le_d5'))
      engine.selectDefense(exec.id, skill)
      expect(engine.selectPreMovement(exec.id, 'defense', 6, 3).ok).toBe(true)

      ;(engine as unknown as {
        _applyDefenseSkill: (c: Character, s: Skill) => void
      })._applyDefenseSkill.bind(engine)(exec, skill)

      expect(exec.col).toBe(6)
      expect(exec.totalShield).toBeGreaterThanOrEqual(20)
    })
  })

  // ── le_d6 Esquiva (shared) ─────────────────────────────────────────────────
  describe('le_d6 — Esquiva (shared with King / Specialist)', () => {
    it('catalog entry identical to lk_d7 and ls_d6', () => {
      const le = executorSkill('le_d6')
      const lk = SKILL_CATALOG.find((s) => s.id === 'lk_d7')
      const ls = SKILL_CATALOG.find((s) => s.id === 'ls_d6')
      expect(lk).toBeDefined()
      expect(ls).toBeDefined()
      expect(le.name).toBe(lk!.name)
      expect(le.name).toBe(ls!.name)
      expect(le.effectType).toBe(lk!.effectType)
    })

    it('evade grants a charge to the caster', () => {
      const exec = mkChar('e', 'executor', 'left')
      resolver.resolve('evade', ctx(exec, exec, 0))
      expect(exec.effects.some((e) => e.type === 'evade' && !e.isExpired)).toBe(true)
    })
  })

  // ── le_d7 Bloqueio Total (shared) ──────────────────────────────────────────
  describe('le_d7 — Bloqueio Total (shared with Specialist)', () => {
    it('catalog entry identical to ls_d7', () => {
      const le = executorSkill('le_d7')
      const ls = SKILL_CATALOG.find((s) => s.id === 'ls_d7')
      expect(le.name).toBe(ls!.name)
      expect(le.power).toBe(ls!.power)
      expect(le.effectType).toBe(ls!.effectType)
    })

    it('shield 60 applies to executor', () => {
      const exec = mkChar('e', 'executor', 'left')
      resolver.resolve('shield', ctx(exec, exec, 60, 0, 2))
      expect(exec.totalShield).toBe(60)
    })
  })

  // ── le_d8 Shield ───────────────────────────────────────────────────────────
  describe('le_d8 — Shield (25 self)', () => {
    it('catalog entry', () => {
      const s = executorSkill('le_d8')
      expect(s.name).toBe('Shield')
      expect(s.effectType).toBe('shield')
      expect(s.power).toBe(25)
    })

    it('shield 25 applies to executor', () => {
      const exec = mkChar('e', 'executor', 'left')
      resolver.resolve('shield', ctx(exec, exec, 25, 0, 1))
      expect(exec.totalShield).toBe(25)
    })

    it('respects 100-cap when stacked with other shields', () => {
      const exec = mkChar('e', 'executor', 'left')
      // Pre-apply shield 85, then +25 → should stack to 100 (exactly at cap).
      exec.addShield(85)
      resolver.resolve('shield', ctx(exec, exec, 25, 0, 1))
      // 85 + 25 = 110 → clamped to 100 per §2.5 "novo sobrescreve o mais fraco"
      expect(exec.totalShield).toBeLessThanOrEqual(100)
    })
  })
})

// ── Catalog completeness ─────────────────────────────────────────────────────

describe('Executor — catalog completeness', () => {
  it('all 16 Executor slots present', () => {
    const ids = ['a1','a2','a3','a4','a5','a6','a7','a8','d1','d2','d3','d4','d5','d6','d7','d8']
      .map((suffix) => `le_${suffix}`)
    for (const id of ids) {
      expect(SKILL_CATALOG.find((s) => s.id === id), `missing ${id}`).toBeDefined()
    }
  })

  it('right-side mirrors exist for every left-side Executor skill', () => {
    const lefts = SKILL_CATALOG.filter((s) => s.id.startsWith('le_'))
    for (const s of lefts) {
      const rightId = s.id.replace(/^l/, 'r')
      expect(SKILL_CATALOG.find((x) => x.id === rightId), `missing ${rightId}`).toBeDefined()
    }
  })

  it('every Executor skill has non-empty description', () => {
    for (const s of SKILL_CATALOG) {
      if (!s.id.startsWith('le_') && !s.id.startsWith('re_')) continue
      expect(s.description, `empty: ${s.id}`).toBeTruthy()
    }
  })

  it('bleed-carrying Executor skills account for the class identity', () => {
    // Executor's attack2 is meant to apply bleeds. Verify that at least
    // 4 skills in the Executor kit use bleed (as primary or secondary).
    const execSkills = SKILL_CATALOG.filter((s) => s.id.startsWith('le_'))
    const bleedCount = execSkills.filter((s) =>
      s.effectType === 'bleed' ||
      s.secondaryEffects?.some((e) => e.effectType === 'bleed'),
    ).length
    expect(bleedCount).toBeGreaterThanOrEqual(4)
  })
})

// ── Integration: bleed-conditional mechanic stress tests ─────────────────────

describe('Executor — bleed-conditional mechanic (integration)', () => {
  it('Corte Mortal+bleed does exactly 1.5× the damage of Corte Mortal-no-bleed', () => {
    // Two identical scenarios, one with bleed, one without. Compare output.
    const mkScenario = (withBleed: boolean) => {
      const exec   = mkChar('e', 'executor', 'left', 5, 3)
      const target = mkChar('t', 'warrior',  'right', 6, 3)
      if (withBleed) target.addEffect(new BleedEffect(4, 3))
      const hpBefore = target.hp
      applyAttack(exec, target, 'le_a1')
      return hpBefore - target.hp
    }
    const dmgNo  = mkScenario(false)
    const dmgYes = mkScenario(true)
    // Allow ±1 for rounding; exact formula gives 45 → 68 (ratio 1.511)
    expect(dmgYes / dmgNo).toBeCloseTo(1.5, 1)
  })

  it('Disparo Preciso+bleed preserves shield, no-bleed consumes shield', () => {
    const mkShielded = (withBleed: boolean) => {
      const exec   = mkChar('e', 'executor', 'left', 5, 3)
      const target = mkChar('t', 'warrior',  'right', 6, 3)
      target.addShield(50)
      if (withBleed) target.addEffect(new BleedEffect(4, 3))
      applyAttack(exec, target, 'le_a3')
      return target.totalShield
    }
    expect(mkShielded(false)).toBeLessThan(50)   // shield was consumed
    expect(mkShielded(true)).toBe(50)            // shield untouched
  })

  it('bleed snapshot captured pre-hit: cleanse secondary cannot cheat the bonus', () => {
    // Corte Mortal has cleanse secondary that removes bleed. The +50%
    // bonus must be decided BEFORE secondaries run.
    const exec   = mkChar('e', 'executor', 'left', 5, 3)
    const target = mkChar('t', 'warrior',  'right', 6, 3)
    target.addEffect(new BleedEffect(4, 3))

    const hpBefore = target.hp
    applyAttack(exec, target, 'le_a1')
    // The bleed was stripped by cleanse, but the amplification already happened.
    expect(hpBefore - target.hp).toBeGreaterThan(50)   // well above non-bleed 45
    expect(target.effects.some((e) => e.type === 'bleed')).toBe(false)
  })
})
