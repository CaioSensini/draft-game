/**
 * Tests for SkillEffectType — enum completeness, type guards, and exhaustive
 * switch behavior.
 *
 * v3 reference: SKILLS_CATALOG_v3_FINAL.md §13 (enum of 31 canonical types).
 * This project extends the canonical set with 5 v3 §6-specific types
 * (area, advance_allies, retreat_allies, clone, damage_redirect) — total 38.
 */

import { describe, it, expect } from 'vitest'
import {
  ALL_EFFECT_TYPES,
  DAMAGE_EFFECTS,
  DOT_EFFECTS,
  HEAL_EFFECTS,
  BUFF_EFFECTS,
  CROWD_CONTROL_EFFECTS,
  DEBUFF_STAT_EFFECTS,
  MOVEMENT_EFFECTS,
  isDamageEffect,
  isDoTEffect,
  isHealEffect,
  isBuffEffect,
  isCrowdControlEffect,
  isDebuffStatEffect,
  isMovementEffect,
  Skill,
  type SkillEffectType,
  type SkillDefinition,
} from '../Skill'

// ── The 31 canonical v3 §13 types (kept as an explicit snapshot for regression) ─
const CANONICAL_V3 = [
  'damage', 'true_damage',
  'heal', 'regen', 'shield', 'bleed', 'burn', 'poison',
  'stun', 'snare', 'silence_attack', 'silence_defense',
  'evade', 'reflect',
  'push', 'pull', 'teleport_self', 'teleport_target',
  'def_up', 'def_down', 'atk_up', 'atk_down', 'mov_up', 'mov_down',
  'mark', 'revive', 'lifesteal', 'purge', 'cleanse',
  'double_attack', 'area_field', 'summon_wall', 'invisibility',
] as const satisfies readonly SkillEffectType[]

describe('SkillEffectType — catalog coverage', () => {
  it('includes every canonical v3 §13 type', () => {
    for (const t of CANONICAL_V3) {
      expect(ALL_EFFECT_TYPES).toContain(t)
    }
  })

  it('v3 canonical list has exactly 33 types (31 §13 + 2 we split teleport into)', () => {
    // The v3 §13 enum says "31 types" but bundles teleport as one; we split it
    // into teleport_self + teleport_target. Revive also appears twice in the
    // §13 list comments but only once in the enum, so the split gives us 33.
    expect(CANONICAL_V3.length).toBe(33)
  })

  it('ALL_EFFECT_TYPES has no duplicates', () => {
    const set = new Set(ALL_EFFECT_TYPES)
    expect(set.size).toBe(ALL_EFFECT_TYPES.length)
  })

  it('ALL_EFFECT_TYPES contains the v3 §6 extensions too', () => {
    expect(ALL_EFFECT_TYPES).toContain('area')
    expect(ALL_EFFECT_TYPES).toContain('advance_allies')
    expect(ALL_EFFECT_TYPES).toContain('retreat_allies')
    expect(ALL_EFFECT_TYPES).toContain('clone')
    expect(ALL_EFFECT_TYPES).toContain('damage_redirect')
  })
})

describe('SkillEffectType — type guards', () => {
  it('isDamageEffect: damage + true_damage + area yes, others no', () => {
    expect(isDamageEffect('damage')).toBe(true)
    expect(isDamageEffect('true_damage')).toBe(true)
    expect(isDamageEffect('area')).toBe(true)
    expect(isDamageEffect('heal')).toBe(false)
    expect(isDamageEffect('bleed')).toBe(false) // DoT is handled separately
    expect(isDamageEffect('shield')).toBe(false)
  })

  it('isDoTEffect: bleed + burn + poison yes, direct damage no', () => {
    expect(isDoTEffect('bleed')).toBe(true)
    expect(isDoTEffect('burn')).toBe(true)
    expect(isDoTEffect('poison')).toBe(true)
    expect(isDoTEffect('damage')).toBe(false)
    expect(isDoTEffect('regen')).toBe(false) // regen is HoT, not DoT
  })

  it('isHealEffect: heal/regen/lifesteal yes, shield no', () => {
    expect(isHealEffect('heal')).toBe(true)
    expect(isHealEffect('regen')).toBe(true)
    expect(isHealEffect('lifesteal')).toBe(true)
    expect(isHealEffect('shield')).toBe(false)
    expect(isHealEffect('revive')).toBe(false) // revive is not a heal on trigger
  })

  it('isBuffEffect: shields/stat-ups/defensive buffers yes', () => {
    expect(isBuffEffect('shield')).toBe(true)
    expect(isBuffEffect('evade')).toBe(true)
    expect(isBuffEffect('reflect')).toBe(true)
    expect(isBuffEffect('revive')).toBe(true)
    expect(isBuffEffect('def_up')).toBe(true)
    expect(isBuffEffect('atk_up')).toBe(true)
    expect(isBuffEffect('mov_up')).toBe(true)
    expect(isBuffEffect('double_attack')).toBe(true)
    expect(isBuffEffect('invisibility')).toBe(true)
    expect(isBuffEffect('def_down')).toBe(false)
    expect(isBuffEffect('stun')).toBe(false)
  })

  it('isCrowdControlEffect: stun/snare/silences yes', () => {
    expect(isCrowdControlEffect('stun')).toBe(true)
    expect(isCrowdControlEffect('snare')).toBe(true)
    expect(isCrowdControlEffect('silence_attack')).toBe(true)
    expect(isCrowdControlEffect('silence_defense')).toBe(true)
    expect(isCrowdControlEffect('def_down')).toBe(false)
    expect(isCrowdControlEffect('push')).toBe(false)
  })

  it('isDebuffStatEffect: def_down/atk_down/mov_down yes', () => {
    expect(isDebuffStatEffect('def_down')).toBe(true)
    expect(isDebuffStatEffect('atk_down')).toBe(true)
    expect(isDebuffStatEffect('mov_down')).toBe(true)
    expect(isDebuffStatEffect('stun')).toBe(false)
    expect(isDebuffStatEffect('def_up')).toBe(false)
  })

  it('isMovementEffect: push/pull/teleports/ally-moves yes', () => {
    expect(isMovementEffect('push')).toBe(true)
    expect(isMovementEffect('pull')).toBe(true)
    expect(isMovementEffect('teleport_self')).toBe(true)
    expect(isMovementEffect('teleport_target')).toBe(true)
    expect(isMovementEffect('advance_allies')).toBe(true)
    expect(isMovementEffect('retreat_allies')).toBe(true)
    expect(isMovementEffect('damage')).toBe(false)
    expect(isMovementEffect('mov_down')).toBe(false) // stat debuff, not a movement
  })
})

describe('SkillEffectType — category arrays', () => {
  it('each category array is non-empty and contains only strings', () => {
    expect(DAMAGE_EFFECTS.length).toBeGreaterThan(0)
    expect(DOT_EFFECTS.length).toBeGreaterThan(0)
    expect(HEAL_EFFECTS.length).toBeGreaterThan(0)
    expect(BUFF_EFFECTS.length).toBeGreaterThan(0)
    expect(CROWD_CONTROL_EFFECTS.length).toBeGreaterThan(0)
    expect(DEBUFF_STAT_EFFECTS.length).toBeGreaterThan(0)
    expect(MOVEMENT_EFFECTS.length).toBeGreaterThan(0)
  })

  it('categories do not overlap (except by design)', () => {
    // A damage effect should never also be a heal effect.
    for (const t of DAMAGE_EFFECTS) {
      expect(HEAL_EFFECTS).not.toContain(t)
    }
    // DoT is exclusive from direct-damage.
    for (const t of DOT_EFFECTS) {
      expect(DAMAGE_EFFECTS).not.toContain(t)
    }
    // CC and stat-debuff are disjoint.
    for (const t of CROWD_CONTROL_EFFECTS) {
      expect(DEBUFF_STAT_EFFECTS).not.toContain(t)
    }
  })
})

// ── Effect fixture validation ─────────────────────────────────────────────────

function mkSkill(effectType: SkillEffectType, overrides: Partial<SkillDefinition> = {}): Skill {
  return new Skill({
    id: 'test_skill',
    name: 'Test',
    category: 'attack',
    group: 'attack1',
    effectType,
    targetType: 'single',
    power: 10,
    ...overrides,
  })
}

describe('Skill — construction and basic invariants', () => {
  it('every canonical type can construct a Skill without throwing', () => {
    for (const t of ALL_EFFECT_TYPES) {
      // Some types expect defense category (e.g. heal, shield) — use appropriate
      // category so Skill invariants match. For the smoke test we accept either.
      const isDefensive = isBuffEffect(t) || isHealEffect(t) || t === 'cleanse'
      const skill = mkSkill(t, {
        category: isDefensive ? 'defense' : 'attack',
        group: isDefensive ? 'defense1' : 'attack1',
        targetType: t === 'summon_wall' || t === 'area_field' ? 'area' : 'single',
      })
      expect(skill.effectType).toBe(t)
      expect(skill.power).toBe(10)
    }
  })

  it('area-style skills default areaRadius to 0 when not provided', () => {
    const s = mkSkill('damage', { targetType: 'area' })
    expect(s.areaRadius).toBe(0)
    expect(s.areaShape).toBeNull()
  })

  it('secondaryEffect defaults to null when not provided', () => {
    const s = mkSkill('damage')
    expect(s.secondaryEffect).toBeNull()
  })

  it('secondaryEffect is attached when provided', () => {
    const s = mkSkill('damage', {
      secondaryEffect: { effectType: 'bleed', power: 4, ticks: 3 },
    })
    expect(s.secondaryEffect).not.toBeNull()
    expect(s.secondaryEffect?.effectType).toBe('bleed')
    expect(s.secondaryEffect?.ticks).toBe(3)
  })
})

// ── Target-side validation for each effect type ───────────────────────────────

describe('Skill.isValidTargetSide', () => {
  it('heal/regen/lifesteal: target own side', () => {
    const heal = mkSkill('heal', { category: 'defense', group: 'defense1', targetType: 'single' })
    expect(heal.isValidTargetSide('left', 'left')).toBe(true)
    expect(heal.isValidTargetSide('left', 'right')).toBe(false)
  })

  it('damage/bleed: target enemy side', () => {
    const dmg = mkSkill('damage')
    expect(dmg.isValidTargetSide('left', 'left')).toBe(false)
    expect(dmg.isValidTargetSide('left', 'right')).toBe(true)
  })

  it('teleport_self: own side only', () => {
    const tp = mkSkill('teleport_self', { category: 'defense', group: 'defense1', targetType: 'self' })
    expect(tp.isValidTargetSide('left', 'left')).toBe(true)
    expect(tp.isValidTargetSide('left', 'right')).toBe(false)
  })

  it('teleport_target: enemy side', () => {
    const tp = mkSkill('teleport_target')
    expect(tp.isValidTargetSide('left', 'right')).toBe(true)
    expect(tp.isValidTargetSide('left', 'left')).toBe(false)
  })

  it('invisibility: own side only', () => {
    const inv = mkSkill('invisibility', { category: 'defense', group: 'defense1', targetType: 'self' })
    expect(inv.isValidTargetSide('left', 'left')).toBe(true)
    expect(inv.isValidTargetSide('left', 'right')).toBe(false)
  })

  it('summon_wall/area_field: board-level, valid for any side', () => {
    const wall = mkSkill('summon_wall', { targetType: 'area' })
    expect(wall.isValidTargetSide('left', 'left')).toBe(true)
    expect(wall.isValidTargetSide('left', 'right')).toBe(true)
    const zone = mkSkill('area_field', { targetType: 'area' })
    expect(zone.isValidTargetSide('left', 'left')).toBe(true)
    expect(zone.isValidTargetSide('left', 'right')).toBe(true)
  })
})

// ── Serialization round-trip (for future save/network) ────────────────────────

describe('Skill — serialization round-trip', () => {
  it('Skill properties survive JSON round-trip via SkillDefinition', () => {
    const def: SkillDefinition = {
      id: 'king_soco_real',
      name: 'Soco Real',
      description: '25 dano em 2 sqm horizontal + shield self 15 por 2 turnos.',
      category: 'attack',
      group: 'attack1',
      effectType: 'damage',
      targetType: 'area',
      power: 25,
      range: 0,
      areaShape: { type: 'line', direction: 'east', length: 1 },
      secondaryEffect: { effectType: 'shield', power: 15, ticks: 2 },
    }
    const json = JSON.stringify(def)
    const parsed = JSON.parse(json) as SkillDefinition
    const restored = new Skill(parsed)
    expect(restored.id).toBe(def.id)
    expect(restored.name).toBe(def.name)
    expect(restored.effectType).toBe(def.effectType)
    expect(restored.power).toBe(def.power)
    expect(restored.secondaryEffect?.effectType).toBe('shield')
    expect(restored.secondaryEffect?.power).toBe(15)
    expect(restored.secondaryEffect?.ticks).toBe(2)
  })
})
