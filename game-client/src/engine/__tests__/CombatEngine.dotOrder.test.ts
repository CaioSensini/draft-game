/**
 * Integration tests for v3 §2.3 — DoT bypasses heal within the same turn.
 *
 * Scenario:
 *   A unit at 5 HP carrying bleed 10 should die from the DoT tick BEFORE
 *   a heal of 20 in the same action phase can save it.
 *
 * Mechanism:
 *   CombatEngine.beginActionPhase ticks status effects BEFORE any skill
 *   resolves. Heals that arrive later in the same action phase see a dead
 *   character and do nothing.
 */

import { describe, it, expect } from 'vitest'
import { Character } from '../../domain/Character'
import type { CharacterRole, CharacterSide } from '../../domain/Character'
import { Team } from '../../domain/Team'
import { Battle } from '../../domain/Battle'
import { CombatEngine } from '../CombatEngine'
import { BleedEffect } from '../../domain/Effect'
import { getStatsForLevel } from '../../domain/Stats'

function mkChar(
  id: string,
  role: CharacterRole,
  side: CharacterSide,
  col = 0,
  row = 0,
): Character {
  const s = getStatsForLevel(role, 1)
  return new Character(id, id, role, side, col, row, {
    maxHp: s.hp, attack: s.atk, defense: s.def, mobility: s.mob,
  })
}

describe('CombatEngine — v3 §2.3 DoT bypass order', () => {
  it('a bleeding character with 5 HP dies on beginActionPhase even if a heal is queued', () => {
    // Setup: left team has a warrior with 5 HP and bleed 10.
    // Right team has a warrior (attacker, irrelevant here).
    const bleeding = mkChar('w', 'warrior', 'left')
    bleeding.applyPureDamage(bleeding.maxHp - 5)
    expect(bleeding.hp).toBe(5)

    bleeding.addEffect(new BleedEffect(10, 3))

    const enemy  = mkChar('e', 'warrior', 'right')
    const king   = mkChar('k', 'king',    'left')  // so team doesn't instantly lose
    const kingR  = mkChar('kr', 'king',   'right')

    const battle = new Battle({
      leftTeam:  new Team('left',  [bleeding, king]),
      rightTeam: new Team('right', [enemy, kingR]),
    })
    // Force round 2 so the bleed applied in turn 1 can tick now.
    while (battle.round < 2) {
      // Cycle through phases manually until round 2.
      battle.advancePhase()
    }

    const engine = new CombatEngine(battle)
    // beginActionPhase should tick DoTs first.
    engine.beginActionPhase()

    // The bleeding warrior dies from the 10 HP DoT before any heal resolves.
    expect(bleeding.alive).toBe(false)
    expect(bleeding.hp).toBe(0)
  })

  it('after DoT kills, a subsequent heal in the action phase is a no-op on the dead target', () => {
    const bleeding = mkChar('w', 'warrior', 'left')
    bleeding.applyPureDamage(bleeding.maxHp - 5)
    bleeding.addEffect(new BleedEffect(10, 3))

    const king  = mkChar('k',  'king',    'left')
    const enemy = mkChar('e',  'warrior', 'right')
    const kingR = mkChar('kr', 'king',    'right')

    const battle = new Battle({
      leftTeam:  new Team('left',  [bleeding, king]),
      rightTeam: new Team('right', [enemy, kingR]),
    })
    while (battle.round < 2) battle.advancePhase()

    const engine = new CombatEngine(battle)
    engine.beginActionPhase()

    // Character is dead — heal has no effect on dead units.
    expect(bleeding.heal(20).actual).toBe(0)
    expect(bleeding.alive).toBe(false)
  })

  it('heal cap is reset at the start of each action phase', () => {
    const w = mkChar('w', 'warrior', 'left')
    w.applyPureDamage(150)

    // Exhaust heal cap BEFORE entering action phase.
    w.heal(10)
    w.heal(10)
    expect(w.heal(10).actual).toBe(0)

    const kingL  = mkChar('kl', 'king',    'left')
    const enemy  = mkChar('e',  'warrior', 'right')
    const kingR  = mkChar('kr', 'king',    'right')
    const battle = new Battle({
      leftTeam:  new Team('left',  [w, kingL]),
      rightTeam: new Team('right', [enemy, kingR]),
    })
    const engine = new CombatEngine(battle)
    engine.beginActionPhase()

    // After beginActionPhase, heal counter should be reset.
    expect(w.heal(10).actual).toBeGreaterThan(0)
  })

  it('at round 12+, DoT damage is scaled by overtime multiplier', () => {
    const w = mkChar('w', 'warrior', 'left')
    w.applyPureDamage(100)
    w.addEffect(new BleedEffect(10, 5))

    const kingL  = mkChar('kl', 'king',    'left')
    const enemy  = mkChar('e',  'warrior', 'right')
    const kingR  = mkChar('kr', 'king',    'right')
    const battle = new Battle({
      leftTeam:  new Team('left',  [w, kingL]),
      rightTeam: new Team('right', [enemy, kingR]),
    })
    // Force round 12.
    while (battle.round < 12) battle.advancePhase()
    expect(battle.round).toBeGreaterThanOrEqual(12)

    const engine = new CombatEngine(battle)
    const hpBefore = w.hp
    engine.beginActionPhase()
    // Round 12 → multiplier 1.10 → 10 × 1.10 = 11
    expect(hpBefore - w.hp).toBe(11)
  })
})
