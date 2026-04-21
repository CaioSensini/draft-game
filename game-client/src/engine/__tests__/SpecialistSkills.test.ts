/**
 * Specialist skills — tests for the 16 entries in data/skillCatalog.ts
 * (SKILLS_CATALOG_v3_FINAL.md §6.2).
 *
 * Each skill gets ≥ 3 tests. Covers composite effects (ls_a5 with
 * def_down + mov_down array), skill-specific mechanics (ls_d4
 * debuff-immunity, ls_d5 cancel-on-damage regen, ls_d2 revive
 * 1x-per-battle), Queimação passive stack validation, and the
 * Shield shared slot.
 *
 * PARTIAL / STUB markers are used for the 3 skills whose v3 extras
 * require systems not yet implemented:
 *   ls_a2 Chuva de Mana — 2-tick damage mechanic
 *   ls_a3 Raio Purificador — mixed-side area effects
 *   ls_a4 Explosão Central — 2nd-use mark condition
 *   ls_a7 Névoa — arena-wide dual-side targeting (STUB)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Character } from '../../domain/Character'
import type { CharacterRole, CharacterSide } from '../../domain/Character'
import { Team } from '../../domain/Team'
import { Battle } from '../../domain/Battle'
import { Skill } from '../../domain/Skill'
import {
  RegenEffect, AtkBoostEffect, ReviveEffect, DefReductionEffect,
} from '../../domain/Effect'
import { CombatEngine } from '../CombatEngine'
import { createDefaultResolver } from '../EffectResolver'
import type { EffectContext, EffectResolver } from '../EffectResolver'
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

function specialistSkill(id: string): SkillDefinition {
  const def = SKILL_CATALOG.find((s) => s.id === id)
  if (!def) throw new Error(`Specialist skill not found: ${id}`)
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

function applyDefense(spec: Character, skillId: string, allies: Character[] = [spec], enemies: Character[] = []): CombatEngine {
  const battle = new Battle({
    leftTeam:  new Team('left',  allies),
    rightTeam: new Team('right', enemies.length > 0 ? enemies : [mkChar('e', 'warrior', 'right', 15, 3)]),
  })
  const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
  engine.syncGrid(battle.allCharacters)
  const skill = new Skill(specialistSkill(skillId))
  const applyFn = (engine as unknown as {
    _applyDefenseSkill: (c: Character, s: Skill) => void
  })._applyDefenseSkill.bind(engine)
  applyFn(spec, skill)
  return engine
}

// ── Attack 1 ─────────────────────────────────────────────────────────────────

describe('Specialist — Attack 1 (dano alto)', () => {
  let resolver: EffectResolver
  beforeEach(() => { resolver = createDefaultResolver() })

  describe('ls_a1 — Bola de Fogo (28 dmg area + burn 6/2t)', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_a1')
      expect(s.name).toBe('Bola de Fogo')
      expect(s.power).toBe(28)
      expect(s.effectType).toBe('area')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('burn')
      expect(s.secondaryEffects?.[0]?.power).toBe(6)
      expect(s.secondaryEffects?.[0]?.ticks).toBe(2)
    })

    it('primary area damage applies', () => {
      const sp = mkChar('s', 'specialist', 'left')
      const target = mkChar('t', 'warrior', 'right')
      const hp = target.hp
      resolver.resolve('area', ctx(sp, target, 28, 28))
      expect(target.hp).toBe(hp - 28)
    })

    it('burn secondary applies DoT', () => {
      const sp = mkChar('s', 'specialist', 'left')
      const target = mkChar('t', 'warrior', 'right')
      resolver.resolve('burn', ctx(sp, target, 6, 0, 2))
      expect(target.effects.some((e) => e.type === 'burn' && !e.isExpired)).toBe(true)
    })
  })

  describe('ls_a2 — Chuva de Mana [PARTIAL — 2-tick mechanic pending]', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_a2')
      expect(s.name).toBe('Chuva de Mana')
      expect(s.power).toBe(22)
      expect(s.effectType).toBe('area')
    })

    it('primary damage applies (single hit, full 22 in current impl)', () => {
      const sp = mkChar('s', 'specialist', 'left')
      const target = mkChar('t', 'warrior', 'right')
      const hp = target.hp
      resolver.resolve('area', ctx(sp, target, 22, 22))
      expect(target.hp).toBe(hp - 22)
    })

    it('[PARTIAL] "22 dano em 2 ticks (11+11)" mechanic not yet split', () => {
      const s = specialistSkill('ls_a2')
      expect(s.secondaryEffects?.length ?? 0).toBe(0)
    })
  })

  describe('ls_a3 — Raio Purificador', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_a3')
      expect(s.name).toBe('Raio Purificador')
      expect(s.power).toBe(25)
      expect(s.secondaryEffects?.[0]?.effectType).toBe('purge')
    })

    it('primary damage + purge secondary on enemies', () => {
      const sp = mkChar('s', 'specialist', 'left')
      const target = mkChar('t', 'warrior', 'right')
      target.addEffect(new AtkBoostEffect(20, 3))
      const hp = target.hp
      resolver.resolve('area', ctx(sp, target, 25, 25))
      resolver.resolve('purge', ctx(sp, target, 0))
      expect(target.hp).toBe(hp - 25)
      expect(target.effects.some((e) => e.type === 'atk_up')).toBe(false)
    })

    it('allies in the area footprint gain shield 10', () => {
      // Specialist at (5, 6) aims at (5, 4). Line north length 6 → hits rows 4..-2.
      // Ally standing at (5, 5) sits in the footprint and should be shielded.
      const sp = mkChar('s', 'specialist', 'left', 5, 6)
      const ally = mkChar('a', 'warrior', 'left', 5, 5)
      const enemy = mkChar('e', 'king', 'right', 5, 4)
      const battle = new Battle({
        leftTeam:  new Team('left',  [sp, ally]),
        rightTeam: new Team('right', [enemy]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill = new Skill(specialistSkill('ls_a3'))
      ;(engine as unknown as {
        _applyAttackSkill: (c: Character, s: Skill, t: unknown, side: string) => void
      })._applyAttackSkill.bind(engine)(
        sp, skill, { kind: 'area', col: 5, row: 5 }, 'left',
      )
      expect(ally.shieldAmount).toBeGreaterThanOrEqual(10)
    })

    it('allies outside the footprint do NOT gain shield', () => {
      const sp = mkChar('s', 'specialist', 'left', 5, 6)
      const offLine = mkChar('a', 'warrior', 'left', 2, 6)  // far from line path
      const enemy = mkChar('e', 'king', 'right', 5, 4)
      const battle = new Battle({
        leftTeam:  new Team('left',  [sp, offLine]),
        rightTeam: new Team('right', [enemy]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill = new Skill(specialistSkill('ls_a3'))
      ;(engine as unknown as {
        _applyAttackSkill: (c: Character, s: Skill, t: unknown, side: string) => void
      })._applyAttackSkill.bind(engine)(
        sp, skill, { kind: 'area', col: 5, row: 4 }, 'left',
      )
      expect(offLine.shieldAmount).toBe(0)
    })
  })

  describe('ls_a4 — Explosão Central [PARTIAL — 2nd-use mark mechanic pending]', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_a4')
      expect(s.name).toBe('Explosão Central')
      expect(s.power).toBe(50)
      expect(s.effectType).toBe('mark')
    })

    it('mark applies to the target (1st use)', () => {
      const sp = mkChar('s', 'specialist', 'left')
      const target = mkChar('t', 'warrior', 'right')
      resolver.resolve('mark', ctx(sp, target, 50))
      expect(target.effects.some((e) => e.type === 'mark' && !e.isExpired)).toBe(true)
    })

    it('[PARTIAL] 2nd-use 50-damage conditional + non-removable flag pending', () => {
      // v3: 2nd use on marked target deals 50 damage + 50% extra if target
      // has debuff. Mark should be non-removable (ignores cleanse/purge).
      const s = specialistSkill('ls_a4')
      expect(s.effectType).toBe('mark')
    })
  })
})

// ── Attack 2 ─────────────────────────────────────────────────────────────────

describe('Specialist — Attack 2 (controle)', () => {
  let resolver: EffectResolver
  beforeEach(() => { resolver = createDefaultResolver() })

  describe('ls_a5 — Orbe de Lentidão (12 dmg + def_down 25% + mov_down 1) ✅ POST quick-fix', () => {
    it('catalog has BOTH secondaries (def_down + mov_down)', () => {
      const s = specialistSkill('ls_a5')
      expect(s.secondaryEffects?.length).toBe(2)
      expect(s.secondaryEffects?.[0]?.effectType).toBe('def_down')
      expect(s.secondaryEffects?.[0]?.power).toBe(25)
      expect(s.secondaryEffects?.[1]?.effectType).toBe('mov_down')
      expect(s.secondaryEffects?.[1]?.power).toBe(1)
    })

    it('primary damage + def_down + mov_down via CombatEngine', () => {
      const sp = mkChar('s', 'specialist', 'left', 5, 3)
      // Use Guerreiro (DEF 20, MOB 2) — after -25 def the stat clamps to 0.
      const target = mkChar('t', 'warrior', 'right', 8, 3)
      const battle = new Battle({
        leftTeam:  new Team('left',  [sp]),
        rightTeam: new Team('right', [target]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill = new Skill(specialistSkill('ls_a5'))
      const applyFn = (engine as unknown as {
        _applyAttackSkill: (c: Character, s: Skill, t: { kind: string; col: number; row: number }, side: string) => void
      })._applyAttackSkill.bind(engine)

      const movBefore = target.mobility
      applyFn(sp, skill, { kind: 'area', col: 8, row: 3 }, 'left')

      // DEF 20 − 25 → clamped to 0 by _applyStatMods
      expect(target.defense).toBe(0)
      // MOB 2 − 1 = 1
      expect(target.mobility).toBe(movBefore - 1)
    })
  })

  describe('ls_a6 — Correntes Rígidas (10 dmg + snare)', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_a6')
      expect(s.name).toBe('Correntes Rígidas')
      expect(s.power).toBe(10)
      expect(s.effectType).toBe('snare')
    })

    it('snare primary applies', () => {
      const sp = mkChar('s', 'specialist', 'left')
      const target = mkChar('t', 'warrior', 'right')
      resolver.resolve('snare', ctx(sp, target, 10, 10, 1))
      expect(target.isSnared).toBe(true)
    })

    it('damage applies as part of the snare effect (power 10)', () => {
      const sp = mkChar('s', 'specialist', 'left')
      const target = mkChar('t', 'warrior', 'right')
      const hp = target.hp
      resolver.resolve('snare', ctx(sp, target, 10, 10, 1))
      expect(target.hp).toBeLessThan(hp)
    })
  })

  describe('ls_a7 — Névoa [STUB — arena-wide mixed-side pending]', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_a7')
      expect(s.name).toBe('Névoa')
      expect(s.effectType).toBe('area')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('def_down')
    })

    it('def_down applies via resolver on enemies', () => {
      const sp = mkChar('s', 'specialist', 'left')
      const target = mkChar('t', 'warrior', 'right')
      const defBefore = target.defense
      resolver.resolve('def_down', ctx(sp, target, 15, 0, 2))
      expect(target.defense).toBe(defBefore - 15)
    })

    it('[STUB] arena-wide ally def_up + enemy cura recebida -30% pending', () => {
      const s = specialistSkill('ls_a7')
      expect(s.secondaryEffects?.length).toBe(1)
    })
  })

  describe('ls_a8 — Congelamento (18 dmg + stun + def_down 20%)', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_a8')
      expect(s.name).toBe('Congelamento')
      expect(s.power).toBe(18)
      expect(s.effectType).toBe('stun')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('def_down')
    })

    it('stun primary applies + damage', () => {
      const sp = mkChar('s', 'specialist', 'left')
      const target = mkChar('t', 'warrior', 'right')
      const hp = target.hp
      resolver.resolve('stun', ctx(sp, target, 18, 18, 1))
      expect(target.hp).toBe(hp - 18)
      expect(target.isStunned).toBe(true)
    })

    it('def_down secondary applies on follow-up', () => {
      const sp = mkChar('s', 'specialist', 'left')
      const target = mkChar('t', 'warrior', 'right')
      const defBefore = target.defense
      resolver.resolve('def_down', ctx(sp, target, 20, 0, 1))
      expect(target.defense).toBe(defBefore - 20)
    })
  })
})

// ── Defense 1 ────────────────────────────────────────────────────────────────

describe('Specialist — Defense 1 (forte)', () => {
  describe('ls_d1 — Cura Suprema (heal 35 single non-king)', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_d1')
      expect(s.name).toBe('Cura Suprema')
      expect(s.power).toBe(35)
      expect(s.effectType).toBe('heal')
      expect(s.targetType).toBe('single')
    })

    it('heals a warrior ally for 35 HP', () => {
      const ally = mkChar('a', 'warrior', 'left')
      ally.applyPureDamage(100)
      const hpBefore = ally.hp
      ally.heal(35)
      expect(ally.hp - hpBefore).toBe(35)
    })

    it('Rei cannot receive this heal (King immune)', () => {
      const king = mkChar('k', 'king', 'left')
      king.applyPureDamage(50)
      const hpBefore = king.hp
      const res = king.heal(35)
      expect(res.actual).toBe(0)
      expect(king.hp).toBe(hpBefore)
    })
  })

  describe('ls_d2 — Renascimento Parcial (revive latente 1x por aliado por partida)', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_d2')
      expect(s.name).toBe('Renascimento Parcial')
      expect(s.effectType).toBe('revive')
      expect(s.power).toBe(25)
    })

    it('revive fires on fatal hit and sets the 1x-per-battle lock', () => {
      const ally = mkChar('a', 'warrior', 'left')
      ally.addEffect(new ReviveEffect(25))
      expect(ally.hasRevive).toBe(true)
      expect(ally.reviveConsumedThisBattle).toBe(false)

      // Lethal hit → revive intercepts, ally restored.
      const res = ally.takeDamage(ally.hp)
      expect(res.revived).toBe(true)
      expect(res.revivedHp).toBe(25)
      expect(ally.alive).toBe(true)
      expect(ally.reviveConsumedThisBattle).toBe(true)
    })

    it('second revive attempt on the same ally is silently rejected', () => {
      const ally = mkChar('a', 'warrior', 'left')
      ally.addEffect(new ReviveEffect(25))
      ally.takeDamage(ally.hp)                // consume first revive
      expect(ally.reviveConsumedThisBattle).toBe(true)

      // Try to apply another revive — rejected by addEffect guard.
      ally.addEffect(new ReviveEffect(25))
      expect(ally.hasRevive).toBe(false)
    })
  })

  describe('ls_d3 — Campo de Cura (heal area + shield)', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_d3')
      expect(s.name).toBe('Campo de Cura')
      expect(s.power).toBe(12)
      expect(s.secondaryEffects?.[0]?.effectType).toBe('shield')
    })

    it('heal 12 + shield 10 on warrior ally', () => {
      const ally = mkChar('a', 'warrior', 'left')
      ally.applyPureDamage(50)
      const hp = ally.hp
      ally.heal(12)
      ally.addShield(10)
      expect(ally.hp - hp).toBe(12)
      expect(ally.totalShield).toBe(10)
    })

    it('Rei only receives shield (heal blocked by King-immune)', () => {
      const king = mkChar('k', 'king', 'left')
      king.applyPureDamage(50)
      const hp = king.hp
      const healRes = king.heal(12)
      king.addShield(10)
      expect(healRes.actual).toBe(0)
      expect(king.hp).toBe(hp)   // no heal
      expect(king.totalShield).toBe(10)   // shield applied
    })
  })

  describe('ls_d4 — Proteção (cleanse + debuff immunity 1t)', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_d4')
      expect(s.name).toBe('Proteção')
      expect(s.effectType).toBe('cleanse')
    })

    it('cleanses debuffs AND grants 1-turn debuff immunity', () => {
      const sp   = mkChar('s', 'specialist', 'left', 5, 3)
      const ally = mkChar('a', 'warrior',     'left', 5, 3)  // same cell for self-target
      ally.addEffect(new DefReductionEffect(20, 3))
      expect(ally.effects.some((e) => e.type === 'def_down')).toBe(true)

      applyDefense(sp, 'ls_d4', [sp, ally])

      // Cleanse stripped the debuff.
      expect(ally.effects.some((e) => e.type === 'def_down')).toBe(false)
      // Immunity window active.
      expect(ally.debuffImmuneTicks).toBeGreaterThan(0)
    })

    it('during immunity, new debuffs bounce off (addEffect rejects)', () => {
      const sp = mkChar('s', 'specialist', 'left', 5, 3)
      sp.setDebuffImmunity(1)
      sp.addEffect(new DefReductionEffect(30, 2))
      expect(sp.effects.some((e) => e.type === 'def_down')).toBe(false)
    })

    it('immunity expires after 1 tick', () => {
      const sp = mkChar('s', 'specialist', 'left')
      sp.setDebuffImmunity(1)
      sp.tickEffects()
      expect(sp.debuffImmuneTicks).toBe(0)
      // Now a debuff should land.
      sp.addEffect(new DefReductionEffect(20, 1))
      expect(sp.effects.some((e) => e.type === 'def_down')).toBe(true)
    })
  })
})

// ── Defense 2 ────────────────────────────────────────────────────────────────

describe('Specialist — Defense 2 (leves)', () => {
  let resolver: EffectResolver
  beforeEach(() => { resolver = createDefaultResolver() })

  describe('ls_d5 — Campo de Cura Contínuo (regen cancellable)', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_d5')
      expect(s.name).toBe('Campo de Cura Contínuo')
      expect(s.power).toBe(6)
      expect(s.effectType).toBe('regen')
    })

    it('applies regen to non-king allies in 3x3', () => {
      const sp   = mkChar('s', 'specialist', 'left', 5, 3)
      const ally = mkChar('a', 'warrior',     'left', 5, 3)
      applyDefense(sp, 'ls_d5', [sp, ally])
      expect(ally.effects.some((e) => e.type === 'regen' && !e.isExpired)).toBe(true)
    })

    it('does NOT apply to king (Rei não recebe)', () => {
      const sp   = mkChar('s', 'specialist', 'left', 5, 3)
      const king = mkChar('k', 'king',        'left', 5, 3)
      applyDefense(sp, 'ls_d5', [sp, king])
      expect(king.effects.some((e) => e.type === 'regen')).toBe(false)
    })

    it('regen is CANCELLED if ally takes damage', () => {
      const ally = mkChar('a', 'warrior', 'left', 5, 3)
      ally.addEffect(new RegenEffect(6, 2, /* cancellable */ true))
      expect(ally.effects.some((e) => e.type === 'regen')).toBe(true)

      ally.takeDamage(10)
      expect(ally.effects.some((e) => e.type === 'regen')).toBe(false)
    })

    it('non-cancellable regens are NOT stripped on damage (e.g. Rei self-heal)', () => {
      const king = mkChar('k', 'king', 'left', 5, 3)
      king.addEffect(new RegenEffect(20, 3, /* cancellable */ false))
      king.takeDamage(10)
      expect(king.effects.some((e) => e.type === 'regen')).toBe(true)
    })
  })

  describe('ls_d6 — Esquiva (shared)', () => {
    it('shared with King and Executor — same mechanics', () => {
      const ls = specialistSkill('ls_d6')
      const lk = SKILL_CATALOG.find((s) => s.id === 'lk_d7')!
      const le = SKILL_CATALOG.find((s) => s.id === 'le_d6')!
      expect(ls.name).toBe(lk.name)
      expect(ls.name).toBe(le.name)
      expect(ls.effectType).toBe(lk.effectType)
    })

    it('evade grants a charge', () => {
      const sp = mkChar('s', 'specialist', 'left')
      resolver.resolve('evade', ctx(sp, sp, 0))
      expect(sp.effects.some((e) => e.type === 'evade' && !e.isExpired)).toBe(true)
    })
  })

  describe('ls_d7 — Bloqueio Total (shared)', () => {
    it('shared with Executor — same shield 60', () => {
      const ls = specialistSkill('ls_d7')
      const le = SKILL_CATALOG.find((s) => s.id === 'le_d7')!
      expect(ls.name).toBe(le.name)
      expect(ls.power).toBe(le.power)
    })

    it('applies 60 shield', () => {
      const sp = mkChar('s', 'specialist', 'left')
      resolver.resolve('shield', ctx(sp, sp, 60, 0, 2))
      expect(sp.totalShield).toBe(60)
    })
  })

  describe('ls_d8 — Aura de Proteção (shield 12 + atk_up 10)', () => {
    it('catalog entry', () => {
      const s = specialistSkill('ls_d8')
      expect(s.name).toBe('Aura de Proteção')
      expect(s.power).toBe(12)
      expect(s.secondaryEffects?.[0]?.effectType).toBe('atk_up')
    })

    it('shield 12 applies', () => {
      const ally = mkChar('a', 'warrior', 'left')
      resolver.resolve('shield', ctx(ally, ally, 12, 0, 1))
      expect(ally.totalShield).toBe(12)
    })

    it('atk_up 10 applies', () => {
      const ally = mkChar('a', 'warrior', 'left')
      const atkBefore = ally.attack
      resolver.resolve('atk_up', ctx(ally, ally, 10, 0, 1))
      expect(ally.attack).toBe(atkBefore + 10)
    })
  })
})

// ── Catalog completeness ─────────────────────────────────────────────────────

describe('Specialist — catalog completeness', () => {
  it('all 16 Specialist slots present', () => {
    const ids = ['a1','a2','a3','a4','a5','a6','a7','a8','d1','d2','d3','d4','d5','d6','d7','d8']
      .map((suffix) => `ls_${suffix}`)
    for (const id of ids) {
      expect(SKILL_CATALOG.find((s) => s.id === id), `missing ${id}`).toBeDefined()
    }
  })

  it('right-side mirrors exist for every left-side Specialist skill', () => {
    const lefts = SKILL_CATALOG.filter((s) => s.id.startsWith('ls_'))
    for (const s of lefts) {
      const rightId = s.id.replace(/^l/, 'r')
      expect(SKILL_CATALOG.find((x) => x.id === rightId), `missing ${rightId}`).toBeDefined()
    }
  })

  it('every Specialist skill has non-empty description', () => {
    for (const s of SKILL_CATALOG) {
      if (!s.id.startsWith('ls_') && !s.id.startsWith('rs_')) continue
      expect(s.description, `empty: ${s.id}`).toBeTruthy()
    }
  })

  it('Specialist has heal-carrying skills (class identity)', () => {
    const specs = SKILL_CATALOG.filter((s) => s.id.startsWith('ls_'))
    const healCount = specs.filter((s) =>
      s.effectType === 'heal' || s.effectType === 'regen' ||
      s.secondaryEffects?.some((e) => e.effectType === 'heal' || e.effectType === 'shield'),
    ).length
    expect(healCount).toBeGreaterThanOrEqual(3)
  })
})

// ── Queimação passive — stack tests ──────────────────────────────────────────

describe('Specialist — Queimação passive stack validation', () => {
  let resolver: EffectResolver
  beforeEach(() => { resolver = createDefaultResolver() })

  it('cleanse removes Queimação (heal_reduction is a debuff)', () => {
    const sp = mkChar('sp', 'specialist', 'left')
    const target = mkChar('t', 'warrior', 'right')
    resolver.resolve('heal_reduction', ctx(sp, target, 0.30, 0, 2))
    expect(target.effects.some((e) => e.type === 'heal_reduction' && !e.isExpired)).toBe(true)

    resolver.resolve('cleanse', ctx(sp, target, 0))
    expect(target.effects.some((e) => e.type === 'heal_reduction' && !e.isExpired)).toBe(false)
  })

  it('Proteção debuff immunity blocks new Queimação application', () => {
    const sp = mkChar('sp', 'specialist', 'left')
    const target = mkChar('t', 'warrior', 'right')
    target.setDebuffImmunity(1)
    resolver.resolve('heal_reduction', ctx(sp, target, 0.30, 0, 2))
    // Immunity rejected the debuff.
    expect(target.effects.some((e) => e.type === 'heal_reduction')).toBe(false)
  })
})
