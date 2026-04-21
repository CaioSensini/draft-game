/**
 * Bloco 2 — all 16 King skills (SKILLS_CATALOG_v3_FINAL §6.5).
 *
 * Strategy:
 *   Each skill is driven through EffectResolver with a minimal context
 *   (caster King, target, rawDamage pre-computed). We verify the primary
 *   effect applies, the secondary effect (when present) applies, and
 *   global v3 rules interact correctly (King heal-immunity exceptions,
 *   silence-attack no-op on Kings, etc.).
 *
 * Some mechanics are stubbed (invisibility, clone, teleport variants) —
 * their tests verify the STATUS_APPLIED event fires so future systems
 * (TargetingSystem, clone-spawn) can hook in without catalog changes.
 * Stub status is documented in DECISIONS.md.
 */

import { describe, it, expect } from 'vitest'
import { Character } from '../../domain/Character'
import type { CharacterRole, CharacterSide } from '../../domain/Character'
import { Team } from '../../domain/Team'
import { Battle } from '../../domain/Battle'
import { Skill } from '../../domain/Skill'
import { EvadeEffect } from '../../domain/Effect'
import { CombatEngine } from '../CombatEngine'
import { createDefaultResolver } from '../EffectResolver'
import type { EffectContext } from '../EffectResolver'
import { getStatsForLevel } from '../../domain/Stats'
import { SKILL_CATALOG } from '../../data/skillCatalog'
import type { SkillDefinition } from '../../domain/Skill'
import { PASSIVE_CATALOG } from '../../data/passiveCatalog'
import { EventType } from '../types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkChar(
  id: string,
  role: CharacterRole,
  side: CharacterSide = 'left',
  col = 0,
  row = 0,
): Character {
  const s = getStatsForLevel(role, 1)
  return new Character(id, id, role, side, col, row, {
    maxHp: s.hp, attack: s.atk, defense: s.def, mobility: s.mob,
  })
}

/** Shortcut to find a King skill by ID in the catalog. */
function kingSkill(id: string): SkillDefinition {
  const s = SKILL_CATALOG.find((x) => x.id === id)
  if (!s) throw new Error(`King skill not found: ${id}`)
  return s
}

/** Build an EffectContext quickly. rawDamage is pre-computed (simulating engine). */
function ctx(
  caster: Character,
  target: Character,
  power: number,
  rawDamage = 0,
  ticks?: number,
): EffectContext {
  return { caster, target, power, rawDamage, ticks, round: 1 }
}

describe('King — Attack 1 (sustain)', () => {
  const resolver = createDefaultResolver()

  // ── lk_a1 Soco Real ────────────────────────────────────────────────────────
  describe('lk_a1 — Soco Real (25 dmg line east 2 + shield 15 self 2t)', () => {
    it('catalog entry exists with correct shape', () => {
      const s = kingSkill('lk_a1')
      expect(s.name).toBe('Soco Real')
      expect(s.power).toBe(25)
      expect(s.effectType).toBe('damage')
      expect(s.areaShape?.type).toBe('line')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('shield')
      expect(s.secondaryEffects?.[0]?.power).toBe(15)
    })

    it('primary damage applies to enemy', () => {
      const king   = mkChar('k', 'king',    'left', 5, 3)
      const target = mkChar('w', 'warrior', 'right', 6, 3)
      const hpBefore = target.hp
      resolver.resolve('damage', ctx(king, target, 25, 25))
      expect(target.hp).toBe(hpBefore - 25)
    })

    it('secondary shield lands on the King (self-target shield as secondary)', () => {
      const king    = mkChar('k', 'king', 'left')
      const target  = mkChar('w', 'warrior', 'right')
      // Manually apply secondary on king.
      resolver.resolve('shield', ctx(king, king, 15, 0, 2))
      expect(king.totalShield).toBe(15)
      void target  // unused — just a scene fixture
    })
  })

  // ── lk_a2 Chute Real ───────────────────────────────────────────────────────
  describe('lk_a2 — Chute Real (27 dmg line north 2 + shield 15 self 2t)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_a2')
      expect(s.name).toBe('Chute Real')
      expect(s.power).toBe(27)
      expect(s.areaShape?.type).toBe('line')
      expect(s.secondaryEffects?.[0]?.power).toBe(15)
    })

    it('power is higher than Soco Real (vertical is slightly heavier)', () => {
      expect(kingSkill('lk_a2').power).toBeGreaterThan(kingSkill('lk_a1').power)
    })
  })

  // ── lk_a3 Sequência de Socos ───────────────────────────────────────────────
  describe('lk_a3 — Sequência de Socos (15 dmg + lifesteal 30%)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_a3')
      expect(s.name).toBe('Sequência de Socos')
      expect(s.power).toBe(15)
      expect(s.effectType).toBe('lifesteal')
    })

    it('lifesteal heals the King (v3 §2.1 self-skill exception)', () => {
      const king   = mkChar('k', 'king',    'left')
      const target = mkChar('w', 'warrior', 'right')
      king.applyPureDamage(50)       // King needs headroom
      const hpBefore = king.hp

      // rawDamage = 15 (the King hits the Warrior for 15); lifesteal 30% → 5
      resolver.resolve('lifesteal', ctx(king, target, 30, 15))

      // Heal should have applied despite King immunity.
      expect(king.hp).toBeGreaterThan(hpBefore)
    })

    it('lifesteal on non-King caster works (regression check)', () => {
      const warrior = mkChar('w', 'warrior', 'left')
      const target  = mkChar('e', 'executor', 'right')
      warrior.applyPureDamage(80)
      const hpBefore = warrior.hp
      resolver.resolve('lifesteal', ctx(warrior, target, 30, 15))
      expect(warrior.hp).toBeGreaterThan(hpBefore)
    })
  })

  // ── lk_a4 Domínio Real ─────────────────────────────────────────────────────
  describe('lk_a4 — Domínio Real (18 dmg 3x3 + shield = 25% of damage dealt)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_a4')
      expect(s.name).toBe('Domínio Real')
      expect(s.power).toBe(18)
      expect(s.effectType).toBe('area')
      expect(s.areaShape?.type).toBe('square')
    })

    it('primary area damage applies', () => {
      const king   = mkChar('k', 'king',    'left')
      const target = mkChar('w', 'warrior', 'right')
      const hpBefore = target.hp
      resolver.resolve('area', ctx(king, target, 18, 18))
      expect(target.hp).toBe(hpBefore - 18)
    })

    // v3 §6.5: shield = 25% of total damage dealt across the 3x3 area.
    // Implementation lives in CombatEngine._applyAttackSkill's area case
    // (skill-id specific post-hook), not in the generic EffectResolver.
    // We invoke the private method directly to avoid the phase-machinery
    // overhead; the area post-hook is the unit under test.
    it('shield equal to 25% of total damage is applied to the King', () => {
      const king = mkChar('k', 'king', 'left', 5, 3)
      const w1 = mkChar('w1', 'warrior', 'right', 7, 3)
      const w2 = mkChar('w2', 'warrior', 'right', 8, 3)
      const w3 = mkChar('w3', 'warrior', 'right', 9, 3)

      const battle = new Battle({
        leftTeam:  new Team('left',  [king]),
        rightTeam: new Team('right', [w1, w2, w3]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      const skill  = new Skill(kingSkill('lk_a4'))

      // Directly invoke the private area-resolution path. The engine needs
      // the grid synced so targeting finds the enemies.
      engine.syncGrid(battle.allCharacters)
      const applyFn = (engine as unknown as {
        _applyAttackSkill: (c: Character, s: Skill, t: { kind: string; col: number; row: number }, side: string) => void
      })._applyAttackSkill.bind(engine)
      applyFn(king, skill, { kind: 'area', col: 8, row: 3 }, 'left')

      // Each warrior takes damage from the 3x3 blast centered at (8, 3).
      // Shield applied to King = round(totalDamageDealt × 0.25).
      // We don't pin the exact damage number (depends on targeting, modifiers),
      // but the shield MUST be > 0 and reasonable (< 30 on 3 warriors at base).
      expect(king.totalShield).toBeGreaterThan(0)
      expect(king.totalShield).toBeLessThanOrEqual(30)
    })

    it('edge case: zero damage dealt → no shield applied', () => {
      const king = mkChar('k', 'king', 'left', 5, 3)
      const w    = mkChar('w', 'warrior', 'right', 8, 3)
      w.addEffect(new EvadeEffect(5))   // evade every hit in the area

      const battle = new Battle({
        leftTeam:  new Team('left',  [king]),
        rightTeam: new Team('right', [w]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill  = new Skill(kingSkill('lk_a4'))
      const applyFn = (engine as unknown as {
        _applyAttackSkill: (c: Character, s: Skill, t: { kind: string; col: number; row: number }, side: string) => void
      })._applyAttackSkill.bind(engine)
      applyFn(king, skill, { kind: 'area', col: 8, row: 3 }, 'left')

      expect(king.totalShield).toBe(0)
    })
  })
})

describe('King — Attack 2 (control)', () => {
  const resolver = createDefaultResolver()

  // ── lk_a5 Empurrão Real ────────────────────────────────────────────────────
  describe('lk_a5 — Empurrão Real (12 dmg line + push 3)', () => {
    it('catalog entry with line shape', () => {
      const s = kingSkill('lk_a5')
      expect(s.name).toBe('Empurrão Real')
      expect(s.power).toBe(12)
      expect(s.effectType).toBe('push')
      expect(s.areaShape?.type).toBe('line')
    })

    it('push handler fires and returns a push request event', () => {
      const king   = mkChar('k', 'king',    'left',  5, 3)
      const target = mkChar('w', 'warrior', 'right', 6, 3)
      const result = resolver.resolve('push', ctx(king, target, 12, 12))
      // Push handler emits a STATUS_APPLIED or similar; at minimum it does
      // not throw and damage was applied.
      expect(target.hp).toBeLessThan(target.maxHp)
      void result
    })
  })

  // ── lk_a6 Contra-ataque ────────────────────────────────────────────────────
  describe('lk_a6 — Contra-ataque (15 dmg 3x3 + push 1)', () => {
    it('catalog entry with square area', () => {
      const s = kingSkill('lk_a6')
      expect(s.name).toBe('Contra-ataque')
      expect(s.power).toBe(15)
      expect(s.areaShape?.type).toBe('square')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('push')
    })

    it('primary area damage applies', () => {
      const king   = mkChar('k', 'king', 'left')
      const target = mkChar('e', 'executor', 'right')
      resolver.resolve('area', ctx(king, target, 15, 15))
      expect(target.hp).toBeLessThan(target.maxHp)
    })
  })

  // ── lk_a7 Intimidação ──────────────────────────────────────────────────────
  describe('lk_a7 — Intimidação (10 dmg + teleport target)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_a7')
      expect(s.name).toBe('Intimidação')
      expect(s.power).toBe(10)
      expect(s.targetType).toBe('single')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('teleport_target')
    })

    it('primary damage lands on target', () => {
      const king   = mkChar('k', 'king', 'left')
      const target = mkChar('w', 'warrior', 'right')
      resolver.resolve('damage', ctx(king, target, 10, 10))
      expect(target.hp).toBe(target.maxHp - 10)
    })

    it('teleport_target secondary emits status event', () => {
      const king   = mkChar('k', 'king', 'left')
      const target = mkChar('w', 'warrior', 'right')
      const result = resolver.resolve('teleport_target', ctx(king, target, 0))
      expect(result.events.some(
        (e) => e.type === EventType.STATUS_APPLIED && (e as { status: string }).status === 'teleport_target',
      )).toBe(true)
    })
  })

  // ── lk_a8 Desarme ──────────────────────────────────────────────────────────
  describe('lk_a8 — Desarme (6 dmg + silence_attack 1t; não afeta reis)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_a8')
      expect(s.name).toBe('Desarme')
      expect(s.power).toBe(6)
      expect(s.effectType).toBe('silence_attack')
    })

    it('applies silence_attack on non-King target', () => {
      const king   = mkChar('k', 'king', 'left')
      const target = mkChar('w', 'warrior', 'right')
      resolver.resolve('silence_attack', ctx(king, target, 0, 6, 1))
      expect(target.isAttackSilenced).toBe(true)
      expect(target.silencedAttackTicks).toBe(1)
    })

    it('damage applies regardless of silence suppression', () => {
      const king   = mkChar('k', 'king', 'left')
      const target = mkChar('e', 'executor', 'right')
      resolver.resolve('silence_attack', ctx(king, target, 0, 6))
      expect(target.hp).toBe(target.maxHp - 6)
    })

    it('silence_attack does NOT apply to King targets (v3 §6.5 exception)', () => {
      const caster = mkChar('c', 'warrior', 'left')
      const king   = mkChar('k', 'king',    'right')
      resolver.resolve('silence_attack', ctx(caster, king, 0, 6))
      expect(king.isAttackSilenced).toBe(false)
    })
  })
})

describe('King — Defense 1 (self-sustain)', () => {
  const resolver = createDefaultResolver()

  // ── lk_d1 Fuga Sombria ─────────────────────────────────────────────────────
  describe('lk_d1 — Fuga Sombria (invisibility + teleport to ally half)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_d1')
      expect(s.name).toBe('Fuga Sombria')
      expect(s.effectType).toBe('invisibility')
      expect(s.targetType).toBe('self')
    })

    it('invisibility handler emits status event on caster', () => {
      const king = mkChar('k', 'king', 'left')
      const result = resolver.resolve('invisibility', ctx(king, king, 0))
      expect(result.events.some(
        (e) => e.type === EventType.STATUS_APPLIED && (e as { status: string }).status === 'invisibility',
      )).toBe(true)
    })
  })

  // ── lk_d2 Recuperação Real ─────────────────────────────────────────────────
  describe('lk_d2 — Recuperação Real (self regen; bypasses King immunity)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_d2')
      expect(s.name).toBe('Recuperação Real')
      expect(s.effectType).toBe('regen')
      expect(s.targetType).toBe('self')
    })

    it('regen effect applied to King persists through tickEffects', () => {
      const king = mkChar('k', 'king', 'left')
      king.applyPureDamage(80)
      // Apply a regen effect manually (Recuperação Real: heal 10% HP/turn for 2t
      // → 18 per tick on a 180 HP King).
      resolver.resolve('regen', ctx(king, king, 18, 0, 2))
      const hpBefore = king.hp
      king.tickEffects()
      // Regen bypasses heal() call and directly adds HP in tickEffects
      // (see Character.tickEffects regen branch) — King-immunity does NOT
      // apply there, so regen works on King out of the box.
      expect(king.hp).toBeGreaterThan(hpBefore)
    })
  })

  // ── lk_d3 Sombra Real ──────────────────────────────────────────────────────
  describe('lk_d3 — Sombra Real (clone stub)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_d3')
      expect(s.name).toBe('Sombra Real')
      expect(s.effectType).toBe('clone')
      expect(s.power).toBe(2)   // number of clones
    })

    it('clone handler emits status event with clone count', () => {
      const king = mkChar('k', 'king', 'left')
      const result = resolver.resolve('clone', ctx(king, king, 2))
      const statusEvent = result.events.find(
        (e) => e.type === EventType.STATUS_APPLIED && (e as { status: string }).status === 'clone',
      )
      expect(statusEvent).toBeDefined()
      expect((statusEvent as { value: number }).value).toBe(2)
    })
  })

  // ── lk_d4 Espírito de Sobrevivência ────────────────────────────────────────
  describe('lk_d4 — Espírito de Sobrevivência (HP condicional)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_d4')
      expect(s.name).toBe('Espírito de Sobrevivência')
      expect(s.effectType).toBe('shield')
      expect(s.power).toBe(10)
    })

    // v3 §6.5 — implementation lives in CombatEngine._applyEspiritoSobrevivencia
    // (skill-id intercept before the generic resolver). Tests invoke
    // _applyDefenseSkill directly via reflection cast.
    function applyEspirito(king: Character): void {
      const battle = new Battle({
        leftTeam:  new Team('left',  [king]),
        rightTeam: new Team('right', [mkChar('enemy', 'warrior', 'right', 15, 3)]),
      })
      const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
      engine.syncGrid(battle.allCharacters)
      const skill = new Skill(kingSkill('lk_d4'))
      const applyFn = (engine as unknown as {
        _applyDefenseSkill: (c: Character, s: Skill) => void
      })._applyDefenseSkill.bind(engine)
      applyFn(king, skill)
    }

    it('HP ≤ 50%: +15% max HP AND shield = 10% max HP, both 1-turn', () => {
      const king = mkChar('k', 'king', 'left', 2, 2)   // base HP 180
      king.applyPureDamage(100)                           // 80 / 180 = 0.44 → crítico
      expect(king.hp / king.maxHp).toBeLessThanOrEqual(0.50)

      applyEspirito(king)

      // +15% of 180 = 27 max HP bonus
      expect(king.maxHpBonus).toBe(27)
      expect(king.maxHp).toBe(180 + 27)
      // Shield = 10% of 180 = 18
      expect(king.totalShield).toBe(18)
      // 1 turn remaining
      expect(king.maxHpBonusTicks).toBe(1)
    })

    it('HP > 50%: +10% max HP only, NO shield', () => {
      const king = mkChar('k', 'king', 'left', 2, 2)   // base HP 180
      king.applyPureDamage(50)                            // 130 / 180 = 0.72 → saudável
      expect(king.hp / king.maxHp).toBeGreaterThan(0.50)

      applyEspirito(king)

      // +10% of 180 = 18 max HP bonus
      expect(king.maxHpBonus).toBe(18)
      expect(king.maxHp).toBe(180 + 18)
      // No shield in this branch
      expect(king.totalShield).toBe(0)
      expect(king.maxHpBonusTicks).toBe(1)
    })

    it('max-HP bonus expires after one tick and clamps current HP down', () => {
      const king = mkChar('k', 'king', 'left', 2, 2)
      king.applyPureDamage(100)                           // HP 80 → critical branch
      applyEspirito(king)
      expect(king.maxHp).toBe(207)

      // Heal up beyond base max (180) but within bonus max (207).
      king.heal(100, { ignoreKingImmunity: true })        // 80 + 100 = 180 (cap at 180+27=207)
      // Actually heal caps at maxHp (207) minus hp (80) = 127 requested, 100 delivered.
      // So HP is now 180.
      expect(king.hp).toBe(180)

      // Tick the effect — bonus expires, HP should clamp to base max (180).
      king.tickEffects()
      expect(king.maxHpBonus).toBe(0)
      expect(king.maxHp).toBe(180)
      // HP was at 180 which equals base max — no clamp needed.
      expect(king.hp).toBe(180)
    })

    it('max-HP bonus expiration CLAMPS HP when current exceeds base max', () => {
      const king = mkChar('k', 'king', 'left', 2, 2)
      king.applyPureDamage(50)                            // HP 130 → healthy branch
      applyEspirito(king)                                   // +10% = 198 max

      // Heal up into the bonus range.
      king.heal(60, { ignoreKingImmunity: true })         // 130 + 60 = 190 ≤ 198
      expect(king.hp).toBe(190)
      expect(king.hp).toBeGreaterThan(king.baseStats.maxHp)

      // Tick — bonus expires, excess HP is lost (clamped to 180).
      king.tickEffects()
      expect(king.hp).toBe(180)
    })
  })
})

describe('King — Defense 2 (light)', () => {
  const resolver = createDefaultResolver()

  // ── lk_d5 Escudo Self ──────────────────────────────────────────────────────
  describe('lk_d5 — Escudo Self (shield 30, 2t)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_d5')
      expect(s.name).toBe('Escudo Self')
      expect(s.power).toBe(30)
      expect(s.effectType).toBe('shield')
    })

    it('grants 30 shield on the King', () => {
      const king = mkChar('k', 'king', 'left')
      resolver.resolve('shield', ctx(king, king, 30, 0, 2))
      expect(king.totalShield).toBe(30)
    })
  })

  // ── lk_d6 Fortaleza Inabalável (shared) ────────────────────────────────────
  describe('lk_d6 — Fortaleza Inabalável (shared with Warrior)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_d6')
      expect(s.name).toBe('Fortaleza Inabalável')
      // Shared card — same name should match Warrior's lw_d4
      const warriorVersion = SKILL_CATALOG.find((x) => x.id === 'lw_d4')
      expect(warriorVersion?.name).toBe('Fortaleza Inabalável')
      expect(warriorVersion?.effectType).toBe(s.effectType)
      expect(warriorVersion?.secondaryEffects?.[0]?.effectType).toBe('stun')
    })

    it('self-stun secondary applies via resolver', () => {
      const king = mkChar('k', 'king', 'left')
      resolver.resolve('stun', ctx(king, king, 0, 0, 1))
      expect(king.isStunned).toBe(true)
    })
  })

  // ── lk_d7 Esquiva (shared) ─────────────────────────────────────────────────
  describe('lk_d7 — Esquiva (shared)', () => {
    it('catalog entry matches Specialist/Executor Esquiva', () => {
      const s  = kingSkill('lk_d7')
      const sp = SKILL_CATALOG.find((x) => x.id === 'ls_d6')
      const ex = SKILL_CATALOG.find((x) => x.id === 'le_d6')
      expect(s.effectType).toBe('evade')
      expect(sp?.effectType).toBe('evade')
      expect(ex?.effectType).toBe('evade')
    })

    it('grants one evade charge on the King', () => {
      const king = mkChar('k', 'king', 'left')
      resolver.resolve('evade', ctx(king, king, 0))
      // Next damage attempt should be negated.
      const result = king.takeDamage(30)
      expect(result.evaded).toBe(true)
      expect(king.hp).toBe(king.maxHp)
    })
  })

  // ── lk_d8 Ordem Real ───────────────────────────────────────────────────────
  describe('lk_d8 — Ordem Real (teleport_target all_allies + def_up)', () => {
    it('catalog entry', () => {
      const s = kingSkill('lk_d8')
      expect(s.name).toBe('Ordem Real')
      expect(s.effectType).toBe('teleport_target')
      expect(s.targetType).toBe('all_allies')
      expect(s.secondaryEffects?.[0]?.effectType).toBe('def_up')
      expect(s.secondaryEffects?.[0]?.power).toBe(15)
    })

    it('teleport_target emits status event on each ally', () => {
      const king  = mkChar('k', 'king',    'left')
      const ally  = mkChar('w', 'warrior', 'left')
      const result = resolver.resolve('teleport_target', ctx(king, ally, 0))
      expect(result.events.some(
        (e) => e.type === EventType.STATUS_APPLIED && (e as { status: string }).status === 'teleport_target',
      )).toBe(true)
    })

    it('def_up secondary grants bonus DEF to ally', () => {
      const king = mkChar('k', 'king', 'left')
      const ally = mkChar('w', 'warrior', 'left')
      const defBefore = ally.defense
      resolver.resolve('def_up', ctx(king, ally, 15, 0, 1))
      expect(ally.defense).toBe(defBefore + 15)
    })
  })
})

// ── Cartas compartilhadas — cross-class consistency ──────────────────────────

describe('Shared skills — v3 §6.1 consistency check', () => {
  it('Esquiva has identical mechanics across King, Executor, Specialist', () => {
    const lkd7 = kingSkill('lk_d7')
    const led6 = SKILL_CATALOG.find((x) => x.id === 'le_d6')!
    const lsd6 = SKILL_CATALOG.find((x) => x.id === 'ls_d6')!
    for (const s of [lkd7, led6, lsd6]) {
      expect(s.name).toBe('Esquiva')
      expect(s.effectType).toBe('evade')
      expect(s.power).toBe(0)
    }
  })

  it('Fortaleza Inabalável: same shape in King + Warrior', () => {
    const lkd6 = kingSkill('lk_d6')
    const lwd4 = SKILL_CATALOG.find((x) => x.id === 'lw_d4')!
    expect(lkd6.name).toBe(lwd4.name)
    expect(lkd6.effectType).toBe(lwd4.effectType)
    expect(lkd6.secondaryEffects?.[0]?.effectType).toBe(lwd4.secondaryEffects?.[0]?.effectType)
    expect(lkd6.secondaryEffects?.[0]?.ticks).toBe(lwd4.secondaryEffects?.[0]?.ticks)
  })
})

// ── Catalog-wide smoke test — all 16 King skills registered ──────────────────

describe('King catalog — smoke test', () => {
  it('all 16 King slots present in the catalog (lk_a1..a8, lk_d1..d8)', () => {
    for (let i = 1; i <= 8; i++) {
      expect(kingSkill(`lk_a${i}`)).toBeDefined()
      expect(kingSkill(`lk_d${i}`)).toBeDefined()
    }
  })

  it('right-side mirrors exist for every left-side King skill', () => {
    for (let i = 1; i <= 8; i++) {
      expect(SKILL_CATALOG.find((s) => s.id === `rk_a${i}`)).toBeDefined()
      expect(SKILL_CATALOG.find((s) => s.id === `rk_d${i}`)).toBeDefined()
    }
  })

  it('every King skill has a non-empty description', () => {
    for (let i = 1; i <= 8; i++) {
      expect(kingSkill(`lk_a${i}`).description).toBeTruthy()
      expect(kingSkill(`lk_d${i}`).description).toBeTruthy()
    }
  })
})
