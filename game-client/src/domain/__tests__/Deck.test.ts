/**
 * Tests for domain/Deck.ts — SkillQueue rotation semantics, CharacterDeck
 * dual-category behavior, builder validation, and TeamDecks CRUD.
 *
 * Rotation contract (v3 §2.9):
 *   - hand = slice(0, handSize); bench = slice(handSize)
 *   - use(id) of a hand card: splice + push to back; next-in-line enters hand
 *   - use(id) of a bench card: null, no mutation
 */

import { describe, it, expect } from 'vitest'
import { Skill, type SkillDefinition } from '../Skill'
import {
  SkillQueue, CharacterDeck, TeamDecks,
  buildCharacterDeck,
  DECK_SIZE, HAND_SIZE,
} from '../Deck'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSkill(id: string, category: 'attack' | 'defense' = 'attack'): Skill {
  const def: SkillDefinition = {
    id,
    name: `Skill ${id}`,
    category,
    group: category === 'attack' ? 'attack1' : 'defense1',
    effectType: 'damage',
    targetType: 'single',
    power: 10,
    range: 1,
  }
  return new Skill(def)
}

function makeDeckSkills(ids: string[], category: 'attack' | 'defense' = 'attack'): Skill[] {
  return ids.map((id) => makeSkill(id, category))
}

// ── SkillQueue ───────────────────────────────────────────────────────────────

describe('SkillQueue — construction', () => {
  it('rejects empty skill list', () => {
    expect(() => new SkillQueue([], 'attack')).toThrow(/at least one skill/)
  })

  it('rejects handSize < 1', () => {
    expect(() => new SkillQueue(makeDeckSkills(['a1']), 'attack', 0)).toThrow(/handSize must be ≥ 1/)
  })

  it('rejects handSize > skill count', () => {
    expect(() => new SkillQueue(makeDeckSkills(['a1', 'a2']), 'attack', 3)).toThrow(/cannot exceed/)
  })

  it('constructs with default HAND_SIZE=2', () => {
    const q = new SkillQueue(makeDeckSkills(['a1', 'a2', 'a3', 'a4']), 'attack')
    expect(q.handSize).toBe(HAND_SIZE)
    expect(HAND_SIZE).toBe(2)
  })
})

describe('SkillQueue — hand/bench snapshots', () => {
  const skills = makeDeckSkills(['a1', 'a2', 'a3', 'a4'])
  const q = new SkillQueue(skills, 'attack')

  it('hand = first handSize entries', () => {
    expect(q.hand.map((s) => s.id)).toEqual(['a1', 'a2'])
  })

  it('bench = remaining entries', () => {
    expect(q.bench.map((s) => s.id)).toEqual(['a3', 'a4'])
  })

  it('all = full queue in order', () => {
    expect(q.all.map((s) => s.id)).toEqual(['a1', 'a2', 'a3', 'a4'])
  })

  it('size returns queue length', () => {
    expect(q.size).toBe(4)
  })

  it('nextInLine returns queue[handSize]', () => {
    expect(q.nextInLine?.id).toBe('a3')
  })

  it('peek returns skill by position or null out of bounds', () => {
    expect(q.peek(0)?.id).toBe('a1')
    expect(q.peek(3)?.id).toBe('a4')
    expect(q.peek(4)).toBeNull()
    expect(q.peek(-1)).toBeNull()
  })
})

describe('SkillQueue — queries', () => {
  const q = new SkillQueue(makeDeckSkills(['a1', 'a2', 'a3', 'a4']), 'attack')

  it('inHand is true for front cards', () => {
    expect(q.inHand('a1')).toBe(true)
    expect(q.inHand('a2')).toBe(true)
  })

  it('inHand is false for bench cards', () => {
    expect(q.inHand('a3')).toBe(false)
    expect(q.inHand('a4')).toBe(false)
  })

  it('inHand is false for unknown skill', () => {
    expect(q.inHand('nope')).toBe(false)
  })

  it('find returns skill regardless of position', () => {
    expect(q.find('a1')?.id).toBe('a1')
    expect(q.find('a4')?.id).toBe('a4')
    expect(q.find('nope')).toBeNull()
  })
})

describe('SkillQueue — rotation on use()', () => {
  function freshQueue() {
    return new SkillQueue(makeDeckSkills(['a1', 'a2', 'a3', 'a4']), 'attack')
  }

  it('use(hand front) moves used to back; next-in-line enters hand', () => {
    const q = freshQueue()
    const r = q.use('a1')
    expect(r).not.toBeNull()
    expect(r!.used.id).toBe('a1')
    expect(r!.enteredHand?.id).toBe('a3')
    expect(r!.newHand.map((s) => s.id)).toEqual(['a2', 'a3'])
    expect(q.all.map((s) => s.id)).toEqual(['a2', 'a3', 'a4', 'a1'])
  })

  it('use(hand mid) works identically — splice + push', () => {
    const q = freshQueue()
    const r = q.use('a2')
    expect(r!.used.id).toBe('a2')
    expect(r!.enteredHand?.id).toBe('a3')
    expect(r!.newHand.map((s) => s.id)).toEqual(['a1', 'a3'])
    expect(q.all.map((s) => s.id)).toEqual(['a1', 'a3', 'a4', 'a2'])
  })

  it('use(bench) returns null and does not mutate', () => {
    const q = freshQueue()
    const before = q.all.map((s) => s.id)
    const r = q.use('a3')
    expect(r).toBeNull()
    expect(q.all.map((s) => s.id)).toEqual(before)
  })

  it('use(unknown) returns null and does not mutate', () => {
    const q = freshQueue()
    const before = q.all.map((s) => s.id)
    expect(q.use('nope')).toBeNull()
    expect(q.all.map((s) => s.id)).toEqual(before)
  })

  it('useSkill(skill) is equivalent to use(id)', () => {
    const q = freshQueue()
    const r = q.useSkill(makeSkill('a1'))
    expect(r?.newHand.map((s) => s.id)).toEqual(['a2', 'a3'])
  })

  it('multiple use() calls cycle through all skills', () => {
    const q = freshQueue()
    q.use('a1') // [a2, a3, a4, a1]
    q.use('a2') // [a3, a4, a1, a2]
    q.use('a3') // [a4, a1, a2, a3]
    q.use('a4') // [a1, a2, a3, a4] — back to original
    expect(q.all.map((s) => s.id)).toEqual(['a1', 'a2', 'a3', 'a4'])
    expect(q.hand.map((s) => s.id)).toEqual(['a1', 'a2'])
  })

  it('rotate(skill) is alias for use() returning void', () => {
    const q = freshQueue()
    q.rotate(makeSkill('a1'))
    expect(q.all.map((s) => s.id)).toEqual(['a2', 'a3', 'a4', 'a1'])
  })

  it('hand size stays constant across rotations', () => {
    const q = freshQueue()
    for (let i = 0; i < 8; i++) {
      q.use(q.hand[0]!.id)
      expect(q.hand.length).toBe(HAND_SIZE)
    }
  })
})

describe('SkillQueue — reset()', () => {
  it('restores original order after mutation', () => {
    const q = new SkillQueue(makeDeckSkills(['a1', 'a2', 'a3', 'a4']), 'attack')
    q.use('a1')
    q.use('a2')
    expect(q.all.map((s) => s.id)).not.toEqual(['a1', 'a2', 'a3', 'a4'])
    q.reset()
    expect(q.all.map((s) => s.id)).toEqual(['a1', 'a2', 'a3', 'a4'])
    expect(q.hand.map((s) => s.id)).toEqual(['a1', 'a2'])
  })
})

// ── CharacterDeck ────────────────────────────────────────────────────────────

describe('CharacterDeck — dual-category independence', () => {
  function buildDeck() {
    return new CharacterDeck('hero', {
      attackSkills:  makeDeckSkills(['a1', 'a2', 'a3', 'a4'], 'attack'),
      defenseSkills: makeDeckSkills(['d1', 'd2', 'd3', 'd4'], 'defense'),
    })
  }

  it('exposes independent attack/defense hands', () => {
    const d = buildDeck()
    expect(d.attackHand.map((s) => s.id)).toEqual(['a1', 'a2'])
    expect(d.defenseHand.map((s) => s.id)).toEqual(['d1', 'd2'])
  })

  it('currentHand returns both hand snapshots', () => {
    const d = buildDeck()
    expect(d.currentHand.attack.map((s) => s.id)).toEqual(['a1', 'a2'])
    expect(d.currentHand.defense.map((s) => s.id)).toEqual(['d1', 'd2'])
  })

  it('canUseAttack validates against attack hand only', () => {
    const d = buildDeck()
    expect(d.canUseAttack('a1')).toBe(true)
    expect(d.canUseAttack('a3')).toBe(false) // bench
    expect(d.canUseAttack('d1')).toBe(false) // defense, not attack
  })

  it('canUseDefense validates against defense hand only', () => {
    const d = buildDeck()
    expect(d.canUseDefense('d1')).toBe(true)
    expect(d.canUseDefense('d3')).toBe(false) // bench
    expect(d.canUseDefense('a1')).toBe(false) // attack, not defense
  })

  it('useAttack rotates only the attack queue', () => {
    const d = buildDeck()
    const r = d.useAttack('a1')
    expect(r).not.toBeNull()
    expect(d.attackHand.map((s) => s.id)).toEqual(['a2', 'a3'])
    expect(d.defenseHand.map((s) => s.id)).toEqual(['d1', 'd2']) // unchanged
  })

  it('useDefense rotates only the defense queue', () => {
    const d = buildDeck()
    d.useDefense('d2')
    expect(d.defenseHand.map((s) => s.id)).toEqual(['d1', 'd3'])
    expect(d.attackHand.map((s) => s.id)).toEqual(['a1', 'a2']) // unchanged
  })

  it('useAttack on invalid card returns null, no mutation', () => {
    const d = buildDeck()
    expect(d.useAttack('a3')).toBeNull() // bench
    expect(d.attackHand.map((s) => s.id)).toEqual(['a1', 'a2'])
  })

  it('useBoth rotates each category independently', () => {
    const d = buildDeck()
    const out = d.useBoth('a1', 'd2')
    expect(out.attack?.used.id).toBe('a1')
    expect(out.defense?.used.id).toBe('d2')
    expect(d.attackHand.map((s) => s.id)).toEqual(['a2', 'a3'])
    expect(d.defenseHand.map((s) => s.id)).toEqual(['d1', 'd3'])
  })

  it('useBoth with null skips that rotation', () => {
    const d = buildDeck()
    const out = d.useBoth('a1', null)
    expect(out.attack?.used.id).toBe('a1')
    expect(out.defense).toBeNull()
    expect(d.defenseHand.map((s) => s.id)).toEqual(['d1', 'd2']) // unchanged
  })

  it('reset restores both queues independently', () => {
    const d = buildDeck()
    d.useAttack('a1')
    d.useDefense('d1')
    d.reset()
    expect(d.attackHand.map((s) => s.id)).toEqual(['a1', 'a2'])
    expect(d.defenseHand.map((s) => s.id)).toEqual(['d1', 'd2'])
  })
})

// ── buildCharacterDeck validator ─────────────────────────────────────────────

describe('buildCharacterDeck — validation', () => {
  it('accepts exactly DECK_SIZE attack and defense skills', () => {
    expect(() => buildCharacterDeck('hero', {
      attackSkills:  makeDeckSkills(['a1', 'a2', 'a3', 'a4'], 'attack'),
      defenseSkills: makeDeckSkills(['d1', 'd2', 'd3', 'd4'], 'defense'),
    })).not.toThrow()
    expect(DECK_SIZE).toBe(4)
  })

  it('rejects wrong attack deck size', () => {
    expect(() => buildCharacterDeck('hero', {
      attackSkills:  makeDeckSkills(['a1', 'a2', 'a3'], 'attack'), // only 3
      defenseSkills: makeDeckSkills(['d1', 'd2', 'd3', 'd4'], 'defense'),
    })).toThrow(/expected 4 attack skills, got 3/)
  })

  it('rejects wrong defense deck size', () => {
    expect(() => buildCharacterDeck('hero', {
      attackSkills:  makeDeckSkills(['a1', 'a2', 'a3', 'a4'], 'attack'),
      defenseSkills: makeDeckSkills(['d1', 'd2', 'd3', 'd4', 'd5'], 'defense'), // 5
    })).toThrow(/expected 4 defense skills, got 5/)
  })

  it('rejects duplicate IDs within attack deck', () => {
    expect(() => buildCharacterDeck('hero', {
      attackSkills:  makeDeckSkills(['a1', 'a1', 'a3', 'a4'], 'attack'),
      defenseSkills: makeDeckSkills(['d1', 'd2', 'd3', 'd4'], 'defense'),
    })).toThrow(/duplicate skill IDs in attack/)
  })

  it('rejects duplicate IDs within defense deck', () => {
    expect(() => buildCharacterDeck('hero', {
      attackSkills:  makeDeckSkills(['a1', 'a2', 'a3', 'a4'], 'attack'),
      defenseSkills: makeDeckSkills(['d1', 'd1', 'd3', 'd4'], 'defense'),
    })).toThrow(/duplicate skill IDs in defense/)
  })
})

// ── TeamDecks ────────────────────────────────────────────────────────────────

describe('TeamDecks — registry CRUD', () => {
  function buildValid(id: string) {
    return buildCharacterDeck(id, {
      attackSkills:  makeDeckSkills([`${id}_a1`, `${id}_a2`, `${id}_a3`, `${id}_a4`], 'attack'),
      defenseSkills: makeDeckSkills([`${id}_d1`, `${id}_d2`, `${id}_d3`, `${id}_d4`], 'defense'),
    })
  }

  it('set + get round-trips a deck', () => {
    const t = new TeamDecks()
    const d = buildValid('hero')
    t.set(d)
    expect(t.get('hero')).toBe(d)
    expect(t.has('hero')).toBe(true)
  })

  it('get returns null for unregistered character', () => {
    const t = new TeamDecks()
    expect(t.get('ghost')).toBeNull()
    expect(t.has('ghost')).toBe(false)
  })

  it('build() constructs and registers atomically', () => {
    const t = new TeamDecks()
    t.build('hero', {
      attackSkills:  makeDeckSkills(['a1', 'a2', 'a3', 'a4'], 'attack'),
      defenseSkills: makeDeckSkills(['d1', 'd2', 'd3', 'd4'], 'defense'),
    })
    expect(t.get('hero')).not.toBeNull()
  })

  it('resetAll resets every registered deck', () => {
    const t = new TeamDecks()
    const d1 = buildValid('hero')
    const d2 = buildValid('sage')
    t.set(d1); t.set(d2)
    d1.useAttack('hero_a1')
    d2.useDefense('sage_d1')
    t.resetAll()
    expect(d1.attackHand.map((s) => s.id)).toEqual(['hero_a1', 'hero_a2'])
    expect(d2.defenseHand.map((s) => s.id)).toEqual(['sage_d1', 'sage_d2'])
  })

  it('characterIds lists every registered character', () => {
    const t = new TeamDecks()
    t.set(buildValid('hero'))
    t.set(buildValid('sage'))
    expect(t.characterIds.sort()).toEqual(['hero', 'sage'])
  })
})
