/**
 * Integration: CombatEngine hand-validation + rotation-after-use wiring.
 *
 * Covers what the Deck unit tests can't: that selectAttack/selectDefense
 * actually reject bench cards end-to-end (with Battle + Team + decks
 * wired together) and that _rotateUsedCards fires after a skill resolves,
 * mutating the deck state and emitting CARD_ROTATED.
 *
 * These invariants are load-bearing for v3 §2.9 ("fila rotativa") and were
 * wired implicitly during Sprint Alfa — this file locks them in.
 */

import { describe, it, expect } from 'vitest'
import { Character } from '../../domain/Character'
import { Team } from '../../domain/Team'
import type { TeamDeckConfig } from '../../domain/Team'
import { Battle } from '../../domain/Battle'
import { Skill } from '../../domain/Skill'
import type { SkillDefinition } from '../../domain/Skill'
import { CombatEngine } from '../CombatEngine'
import { EventType } from '../types'
import { getStatsForLevel } from '../../domain/Stats'
import { PASSIVE_CATALOG } from '../../data/passiveCatalog'

// ── Fixture: small deterministic skills + characters ─────────────────────────

function mkSkillDef(id: string, category: 'attack' | 'defense'): SkillDefinition {
  return {
    id,
    name: `Skill ${id}`,
    category,
    group: category === 'attack' ? 'attack1' : 'defense1',
    effectType: category === 'attack' ? 'damage' : 'shield',
    targetType: category === 'attack' ? 'single' : 'self',
    power: 10,
    // Range 0 = unrestricted (targeting check bypassed); keeps tests focused on
    // deck wiring instead of tile-distance math.
    range: 0,
  }
}

function mkExecutor(id = 'exec-l', side: 'left' | 'right' = 'left', col = 2): Character {
  const s = getStatsForLevel('executor', 1)
  return new Character(id, id, 'executor', side, col, 3, {
    maxHp: s.hp, attack: s.atk, defense: s.def, mobility: s.mob,
  })
}

function mkKing(id = 'king-r', side: 'left' | 'right' = 'right', col = 12): Character {
  const s = getStatsForLevel('king', 1)
  return new Character(id, id, 'king', side, col, 3, {
    maxHp: s.hp, attack: s.atk, defense: s.def, mobility: s.mob,
  })
}

/**
 * Build an executor deck: 4 attacks named ea1..ea4, 4 defenses ed1..ed4.
 * Hand (HAND_SIZE=2) starts as [ea1, ea2] / [ed1, ed2]; bench is ea3/ea4/ed3/ed4.
 */
function executorDeckConfig(): TeamDeckConfig {
  return {
    executor: {
      attackSkills:  ['ea1', 'ea2', 'ea3', 'ea4'].map((id) => new Skill(mkSkillDef(id, 'attack'))),
      defenseSkills: ['ed1', 'ed2', 'ed3', 'ed4'].map((id) => new Skill(mkSkillDef(id, 'defense'))),
    },
  }
}

function buildActionBattle() {
  const exec = mkExecutor()
  const king = mkKing()
  const battle = new Battle({
    leftTeam:  new Team('left',  [exec], executorDeckConfig()),
    rightTeam: new Team('right', [king]),
    startPhase: 'action',
  })
  const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
  engine.syncGrid(battle.allCharacters)
  return { exec, king, battle, engine }
}

// ── selectAttack gate ────────────────────────────────────────────────────────

describe('CombatEngine.selectAttack — hand gate', () => {
  it('accepts an attack skill currently in the hand', () => {
    const { exec, king, engine } = buildActionBattle()
    const ea1 = new Skill(mkSkillDef('ea1', 'attack')) // front of hand
    const result = engine.selectAttack(
      exec.id, ea1,
      { kind: 'character', characterId: king.id },
    )
    expect(result.ok).toBe(true)
  })

  it('rejects an attack skill that is on the bench (exists in deck, outside hand)', () => {
    const { exec, king, engine } = buildActionBattle()
    const ea3 = new Skill(mkSkillDef('ea3', 'attack')) // bench[0]
    const result = engine.selectAttack(
      exec.id, ea3,
      { kind: 'character', characterId: king.id },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not in .*current hand/i)
  })

  it('rejects an attack skill not in the deck at all', () => {
    const { exec, king, engine } = buildActionBattle()
    const rogue = new Skill(mkSkillDef('ea99', 'attack'))
    const result = engine.selectAttack(
      exec.id, rogue,
      { kind: 'character', characterId: king.id },
    )
    expect(result.ok).toBe(false)
  })

  it('when a character has NO deck registered, hand gate is bypassed (backward compat)', () => {
    // Team without deckConfig → no deck for executor; selectAttack should
    // fall through without complaining about hand membership.
    const exec = mkExecutor()
    const king = mkKing()
    const battle = new Battle({
      leftTeam:  new Team('left',  [exec]),  // no deckConfig
      rightTeam: new Team('right', [king]),
      startPhase: 'action',
    })
    const engine = new CombatEngine(battle, undefined, PASSIVE_CATALOG)
    engine.syncGrid(battle.allCharacters)

    const anySkill = new Skill(mkSkillDef('ea99', 'attack'))
    const result = engine.selectAttack(
      exec.id, anySkill,
      { kind: 'character', characterId: king.id },
    )
    expect(result.ok).toBe(true)
  })
})

// ── selectDefense gate ───────────────────────────────────────────────────────

describe('CombatEngine.selectDefense — hand gate', () => {
  it('accepts a defense skill currently in the hand', () => {
    const { exec, engine } = buildActionBattle()
    const ed1 = new Skill(mkSkillDef('ed1', 'defense'))
    expect(engine.selectDefense(exec.id, ed1).ok).toBe(true)
  })

  it('rejects a defense skill on the bench', () => {
    const { exec, engine } = buildActionBattle()
    const ed4 = new Skill(mkSkillDef('ed4', 'defense')) // bench tail
    const result = engine.selectDefense(exec.id, ed4)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not in .*current hand/i)
  })
})

// ── Rotation on resolution ──────────────────────────────────────────────────

describe('CombatEngine — rotation after skill resolves', () => {
  // Helper: run the full "resolve + rotate" sequence that the engine's
  // interleaved resolver runs (_applyAttackSkill / _applyDefenseSkill
  // followed by _rotateUsedCards — see CombatEngine lines 800-931).
  function resolveAndRotate(
    engine: CombatEngine, exec: Character, king: Character,
    attackSkill: Skill | null, defenseSkill: Skill | null,
  ) {
    const priv = engine as unknown as {
      _applyAttackSkill: (
        c: Character, s: Skill,
        t: { kind: string; characterId?: string },
        side: string,
      ) => void
      _applyDefenseSkill: (c: Character, s: Skill) => void
      _rotateUsedCards: (c: Character, sel: { attackSkill: Skill | null; defenseSkill: Skill | null; secondAttackSkill?: Skill | null; target: { kind: string; characterId?: string } | null }) => void
    }
    if (attackSkill) {
      priv._applyAttackSkill.bind(engine)(
        exec, attackSkill,
        { kind: 'character', characterId: king.id },
        'left',
      )
    }
    if (defenseSkill) priv._applyDefenseSkill.bind(engine)(exec, defenseSkill)
    priv._rotateUsedCards.bind(engine)(exec, {
      attackSkill, defenseSkill,
      secondAttackSkill: null,
      target: attackSkill ? { kind: 'character', characterId: king.id } : null,
    })
  }

  it('attack skill rotates the used card to the back of its queue', () => {
    const { exec, king, battle, engine } = buildActionBattle()
    const ea1 = new Skill(mkSkillDef('ea1', 'attack'))
    engine.selectAttack(exec.id, ea1, { kind: 'character', characterId: king.id })
    resolveAndRotate(engine, exec, king, ea1, null)

    const deck = battle.teamOf('left').attackDeck(exec.id)
    expect(deck).not.toBeNull()
    expect(deck!.hand.map((s) => s.id)).toEqual(['ea2', 'ea3'])
    expect(deck!.all.map((s) => s.id)).toEqual(['ea2', 'ea3', 'ea4', 'ea1'])
  })

  it('defense skill rotates the used card to the back of its queue', () => {
    const { exec, king, engine, battle } = buildActionBattle()
    const ed2 = new Skill(mkSkillDef('ed2', 'defense'))
    engine.selectDefense(exec.id, ed2)
    resolveAndRotate(engine, exec, king, null, ed2)

    const deck = battle.teamOf('left').defenseDeck(exec.id)
    expect(deck!.hand.map((s) => s.id)).toEqual(['ed1', 'ed3'])
    expect(deck!.all.map((s) => s.id)).toEqual(['ed1', 'ed3', 'ed4', 'ed2'])
  })

  it('attack + defense rotate independently in the same turn', () => {
    const { exec, king, engine, battle } = buildActionBattle()
    const ea1 = new Skill(mkSkillDef('ea1', 'attack'))
    const ed1 = new Skill(mkSkillDef('ed1', 'defense'))
    engine.selectAttack(exec.id, ea1, { kind: 'character', characterId: king.id })
    engine.selectDefense(exec.id, ed1)
    resolveAndRotate(engine, exec, king, ea1, ed1)

    expect(battle.teamOf('left').attackDeck(exec.id)!.hand.map((s) => s.id)).toEqual(['ea2', 'ea3'])
    expect(battle.teamOf('left').defenseDeck(exec.id)!.hand.map((s) => s.id)).toEqual(['ed2', 'ed3'])
  })

  it('after rotation, the bench card previously out of hand is now selectable', () => {
    const { exec, king, engine } = buildActionBattle()
    const ea1 = new Skill(mkSkillDef('ea1', 'attack'))
    engine.selectAttack(exec.id, ea1, { kind: 'character', characterId: king.id })
    resolveAndRotate(engine, exec, king, ea1, null)

    // ea3 was on the bench before rotation; after it, it should be in hand.
    const ea3 = new Skill(mkSkillDef('ea3', 'attack'))
    const result = engine.selectAttack(
      exec.id, ea3,
      { kind: 'character', characterId: king.id },
    )
    expect(result.ok).toBe(true)
  })
})

// ── CARD_ROTATED event ──────────────────────────────────────────────────────

describe('CombatEngine — CARD_ROTATED event emission', () => {
  // Rotation is emitted by _rotateUsedCards, which the resolver calls after
  // _applyAttackSkill/_applyDefenseSkill finish.
  function rotate(engine: CombatEngine, exec: Character, sel: { attackSkill: Skill | null; defenseSkill: Skill | null }) {
    ;(engine as unknown as {
      _rotateUsedCards: (c: Character, sel: { attackSkill: Skill | null; defenseSkill: Skill | null; secondAttackSkill?: Skill | null; target: null }) => void
    })._rotateUsedCards.bind(engine)(exec, {
      attackSkill:  sel.attackSkill,
      defenseSkill: sel.defenseSkill,
      secondAttackSkill: null,
      target: null,
    })
  }

  it('emits CARD_ROTATED with the used card + the new front card as nextCardId (attack)', () => {
    const { exec, engine } = buildActionBattle()
    const ea1 = new Skill(mkSkillDef('ea1', 'attack'))

    const events: Array<{ unitId: string; cardId: string; category: string; nextCardId: string }> = []
    engine.onType(EventType.CARD_ROTATED, (e) => {
      events.push({
        unitId: e.unitId,
        cardId: e.cardId,
        category: e.category,
        nextCardId: e.nextCardId,
      })
    })

    rotate(engine, exec, { attackSkill: ea1, defenseSkill: null })

    expect(events.length).toBe(1)
    expect(events[0]).toMatchObject({
      unitId: exec.id,
      cardId: 'ea1',
      category: 'attack',
      nextCardId: 'ea2',
    })
  })

  it('emits CARD_ROTATED for defense category when defense skill resolves', () => {
    const { exec, engine } = buildActionBattle()
    const ed1 = new Skill(mkSkillDef('ed1', 'defense'))

    let captured: { category?: string; cardId?: string } = {}
    engine.onType(EventType.CARD_ROTATED, (e) => {
      captured = { category: e.category, cardId: e.cardId }
    })

    rotate(engine, exec, { attackSkill: null, defenseSkill: ed1 })

    expect(captured.category).toBe('defense')
    expect(captured.cardId).toBe('ed1')
  })
})

// ── GameController integration surface (getHand shape) ──────────────────────

describe('Deck → GameController.getHand shape', () => {
  it('attackDeck(id).hand and defenseDeck(id).hand reflect current hand snapshots', () => {
    const { exec, battle } = buildActionBattle()
    const attackDeck  = battle.teamOf('left').attackDeck(exec.id)
    const defenseDeck = battle.teamOf('left').defenseDeck(exec.id)
    expect(attackDeck!.hand.map((s) => s.id)).toEqual(['ea1', 'ea2'])
    expect(defenseDeck!.hand.map((s) => s.id)).toEqual(['ed1', 'ed2'])
  })
})
