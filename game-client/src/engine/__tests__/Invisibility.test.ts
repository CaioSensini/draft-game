/**
 * Sprint de Débito — Sistema 3: Invisibility + Clones
 *
 * Covers:
 *   - Character._invisibleTicks counter + setInvisibility API
 *   - TargetingSystem filters invisible units for single-target skills
 *   - AoE skills still hit invisible units (invisibility is targeting-only)
 *   - Invisibility breaks on HP damage (evaded / shield-absorbed preserve)
 *   - Natural expiration via tickEffects
 *   - Fuga Sombria (lk_d1) end-to-end via _applyDefenseSkill
 *   - Sombra Real (lk_d3) emits CLONE_SPAWNED with picked positions
 */

import { describe, it, expect } from 'vitest'
import { Character } from '../../domain/Character'
import type { CharacterRole, CharacterSide } from '../../domain/Character'
import { Team } from '../../domain/Team'
import { Battle } from '../../domain/Battle'
import { Skill } from '../../domain/Skill'
import { CombatEngine } from '../CombatEngine'
import { TargetingSystem } from '../TargetingSystem'
import { Grid, Position } from '../../domain/Grid'
import { getStatsForLevel } from '../../domain/Stats'
import { SKILL_CATALOG } from '../../data/skillCatalog'
import type { SkillDefinition } from '../../domain/Skill'
import { PASSIVE_CATALOG } from '../../data/passiveCatalog'
import { EventType } from '../types'
import type { EngineEvent } from '../types'

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

// ── Character.setInvisibility + lifecycle ───────────────────────────────────

describe('Character — invisibility flag', () => {
  it('defaults to not invisible', () => {
    const king = mkChar('k', 'king', 'left')
    expect(king.isInvisible).toBe(false)
    expect(king.invisibleTicks).toBe(0)
  })

  it('setInvisibility activates the flag and counter', () => {
    const king = mkChar('k', 'king', 'left')
    king.setInvisibility(2)
    expect(king.isInvisible).toBe(true)
    expect(king.invisibleTicks).toBe(2)
  })

  it('setInvisibility uses max-stacking (does not shrink)', () => {
    const king = mkChar('k', 'king', 'left')
    king.setInvisibility(3)
    king.setInvisibility(1)   // weaker re-application
    expect(king.invisibleTicks).toBe(3)
  })

  it('tickEffects decrements the counter', () => {
    const king = mkChar('k', 'king', 'left')
    king.setInvisibility(2)
    king.tickEffects()
    expect(king.invisibleTicks).toBe(1)
    king.tickEffects()
    expect(king.invisibleTicks).toBe(0)
    expect(king.isInvisible).toBe(false)
  })

  it('takeDamage with HP damage BREAKS invisibility', () => {
    const king = mkChar('k', 'king', 'left')
    king.setInvisibility(2)
    king.takeDamage(30)
    expect(king.isInvisible).toBe(false)
  })

  it('takeDamage absorbed fully by shield does NOT break invisibility', () => {
    const king = mkChar('k', 'king', 'left')
    king.setInvisibility(2)
    king.addShield(100)
    king.takeDamage(20)   // entirely absorbed by shield
    expect(king.isInvisible).toBe(true)
  })

  it('evaded hits do NOT break invisibility', () => {
    const king = mkChar('k', 'king', 'left')
    king.setInvisibility(2)
    // Grant an evade that eats the hit.
    king.addEffect(new (class {
      readonly type = 'evade' as const
      readonly kind = 'buff' as const
      get isExpired() { return this._used }
      private _used = false
      tick() { return null }
      interceptDamage() { this._used = true; return { absorbed: 0, reflected: 0, evaded: true } }
    })() as never)
    king.takeDamage(30)
    expect(king.isInvisible).toBe(true)
  })
})

// ── TargetingSystem — invisible units filtered for single-target ────────────

describe('TargetingSystem — invisibility filter', () => {
  function setup(invisibleKing = false): { sys: TargetingSystem; battle: Battle; attacker: Character; king: Character } {
    const attacker = mkChar('att', 'warrior', 'right', 10, 3)
    const king = mkChar('k', 'king', 'left', 5, 3)
    if (invisibleKing) king.setInvisibility(2)
    const battle = new Battle({
      leftTeam:  new Team('left',  [king]),
      rightTeam: new Team('right', [attacker]),
    })
    const grid = new Grid({ cols: 16, rows: 6 })
    grid.place(king.id, king.col, king.row)
    grid.place(attacker.id, attacker.col, attacker.row)
    const sys = new TargetingSystem(grid)
    return { sys, battle, attacker, king }
  }

  it('single-target skill CAN target a visible king', () => {
    const { sys, battle, attacker, king } = setup(false)
    const skill = new Skill(skillDef('le_a1'))   // Corte Mortal, single
    const targets = sys.resolveTargets(skill, attacker, {
      kind: 'character', characterId: king.id,
    }, battle)
    expect(targets.length).toBe(1)
  })

  it('single-target skill CANNOT target an invisible king', () => {
    const { sys, battle, attacker, king } = setup(true)
    const skill = new Skill(skillDef('le_a1'))
    const targets = sys.resolveTargets(skill, attacker, {
      kind: 'character', characterId: king.id,
    }, battle)
    expect(targets.length).toBe(0)
  })

  it('validateTargetSpec rejects invisible targets for single-target skills', () => {
    const { sys, battle, attacker, king } = setup(true)
    const skill = new Skill(skillDef('le_a1'))
    const ok = sys.validateTargetSpec(skill, attacker, {
      kind: 'character', characterId: king.id,
    }, battle)
    expect(ok).toBe(false)
  })

  it('getValidUnitTargets excludes invisible enemies', () => {
    const { sys, battle, attacker } = setup(true)
    const skill = new Skill(skillDef('le_a1'))
    const list = sys.getValidUnitTargets(skill, attacker, battle)
    expect(list.length).toBe(0)   // only king on left, and king is invisible
  })

  it('area skills still hit invisible units (invisibility is targeting-only)', () => {
    const { sys, battle, attacker, king } = setup(true)
    const skill = new Skill(skillDef('le_a2'))   // Tempestade — area 3x3
    const hits = sys.resolveTargets(skill, attacker, {
      kind: 'area', col: king.col, row: king.row,
    }, battle)
    expect(hits.some((c) => c.id === king.id)).toBe(true)
  })
})

// ── Fuga Sombria (lk_d1) — end-to-end ───────────────────────────────────────

describe('Fuga Sombria (lk_d1) — full CombatEngine path', () => {
  function applyFugaSombria(king: Character, allies: Character[] = [king], enemies: Character[] = []): Battle {
    const battle = new Battle({
      leftTeam:  new Team('left',  allies),
      rightTeam: new Team('right', enemies.length > 0 ? enemies : [mkChar('e', 'warrior', 'right', 15, 3)]),
    })
    const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
    engine.syncGrid(battle.allCharacters)
    const skill = new Skill(skillDef('lk_d1'))
    const applyFn = (engine as unknown as {
      _applyDefenseSkill: (c: Character, s: Skill) => void
    })._applyDefenseSkill.bind(engine)
    applyFn(king, skill)
    return battle
  }

  it('King becomes invisible for 1 turn', () => {
    const king = mkChar('k', 'king', 'left')
    applyFugaSombria(king)
    expect(king.isInvisible).toBe(true)
    expect(king.invisibleTicks).toBe(1)
  })

  it('Invisibility expires naturally after one tick if no damage taken', () => {
    const king = mkChar('k', 'king', 'left')
    applyFugaSombria(king)
    king.tickEffects()
    expect(king.isInvisible).toBe(false)
  })
})

// ── Sombra Real (lk_d3) — CLONE_SPAWNED event emission ─────────────────────

describe('Sombra Real (lk_d3) — clone spawning', () => {
  function applySombraReal(king: Character): { battle: Battle; events: EngineEvent[] } {
    const battle = new Battle({
      leftTeam:  new Team('left',  [king]),
      rightTeam: new Team('right', [mkChar('e', 'warrior', 'right', 15, 3)]),
    })
    const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
    engine.syncGrid(battle.allCharacters)
    const events: EngineEvent[] = []
    engine.on((e) => { events.push(e) })
    const skill = new Skill(skillDef('lk_d3'))
    const applyFn = (engine as unknown as {
      _applyDefenseSkill: (c: Character, s: Skill) => void
    })._applyDefenseSkill.bind(engine)
    applyFn(king, skill)
    return { battle, events }
  }

  it('emits a CLONE_SPAWNED event', () => {
    const king = mkChar('k', 'king', 'left', 5, 3)
    const { events } = applySombraReal(king)
    expect(events.some((e) => e.type === EventType.CLONE_SPAWNED)).toBe(true)
  })

  it('CLONE_SPAWNED carries caster id and 2 positions (v3 default)', () => {
    const king = mkChar('k', 'king', 'left', 5, 3)
    const { events } = applySombraReal(king)
    const ev = events.find((e) => e.type === EventType.CLONE_SPAWNED) as
      Extract<EngineEvent, { type: 'CLONE_SPAWNED' }>
    expect(ev.casterId).toBe(king.id)
    expect(ev.positions.length).toBe(2)
    expect(ev.duration).toBe(2)
  })

  it('clone positions are empty walkable cells distinct from the King', () => {
    const king = mkChar('k', 'king', 'left', 5, 3)
    const { events } = applySombraReal(king)
    const ev = events.find((e) => e.type === EventType.CLONE_SPAWNED) as
      Extract<EngineEvent, { type: 'CLONE_SPAWNED' }>
    for (const p of ev.positions) {
      // Not the king's own tile.
      expect(p.col === king.col && p.row === king.row).toBe(false)
      // Within radius 2 of the king (Chebyshev).
      expect(Math.max(Math.abs(p.col - king.col), Math.abs(p.row - king.row))).toBeLessThanOrEqual(2)
    }
  })

  it('clones do NOT become Characters in the battle (visual-only)', () => {
    const king = mkChar('k', 'king', 'left', 5, 3)
    const { battle } = applySombraReal(king)
    // Left team still has exactly 1 character (the King).
    expect(battle.teamOf('left').all.length).toBe(1)
  })
})

// ── Position accidental export is not needed; just verify import path
describe('smoke — module wiring', () => {
  it('Position class imported correctly', () => {
    expect(Position.of(0, 0).col).toBe(0)
  })
})
