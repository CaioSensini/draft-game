/**
 * Tests for TurnManager — the per-phase turn sequencer.
 *
 * Covers the lifecycle transitions, snapshot invariants, and the guarantees
 * the engine relies on (one-at-a-time commit, forward-only cursor).
 *
 * Prompt §1.6 asks for interleaved role-order + phase transitions + events.
 * TurnManager itself is protocol-agnostic (operates on opaque id strings);
 * the interleaved role-order logic lives in CombatEngine's
 * `getInterleavedOrder` and the events fire from GameController /
 * CombatEngine. Those paths are covered by CombatEngine tests below.
 */

import { describe, it, expect } from 'vitest'
import { TurnManager } from '../TurnManager'

describe('TurnManager — state machine basics', () => {
  it('empty phase is immediately complete', () => {
    const tm = new TurnManager()
    tm.beginPhase([])
    expect(tm.isPhaseComplete).toBe(true)
    expect(tm.currentActorId).toBeNull()
  })

  it('begins phase with first actor active', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a', 'b', 'c'])
    expect(tm.currentActorId).toBe('a')
    expect(tm.isPhaseComplete).toBe(false)
  })

  it('commit advances to the next actor', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a', 'b', 'c'])
    tm.commit()
    expect(tm.currentActorId).toBe('b')
    tm.commit()
    expect(tm.currentActorId).toBe('c')
    tm.commit()
    expect(tm.currentActorId).toBeNull()
    expect(tm.isPhaseComplete).toBe(true)
  })

  it('skip also advances the cursor', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a', 'b'])
    tm.skip('dead')
    expect(tm.currentActorId).toBe('b')
    expect(tm.snapshot('a')?.status).toBe('skipped')
    expect(tm.snapshot('a')?.skipReason).toBe('dead')
  })

  it('commit after phase complete is a no-op', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a'])
    tm.commit()
    expect(tm.isPhaseComplete).toBe(true)
    tm.commit()   // no throw, no change
    expect(tm.isPhaseComplete).toBe(true)
  })

  it('upcomingActors excludes the current actor', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a', 'b', 'c'])
    expect([...tm.upcomingActors]).toEqual(['b', 'c'])
    tm.commit()
    expect([...tm.upcomingActors]).toEqual(['c'])
  })

  it('pendingCount tracks active + pending', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a', 'b', 'c'])
    expect(tm.pendingCount).toBe(3)   // all three unsettled
    tm.commit()
    expect(tm.pendingCount).toBe(2)
    tm.skip()
    expect(tm.pendingCount).toBe(1)
  })

  it('isRegistered reports membership regardless of status', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a'])
    expect(tm.isRegistered('a')).toBe(true)
    expect(tm.isRegistered('b')).toBe(false)
    tm.commit()
    expect(tm.isRegistered('a')).toBe(true)   // even after commit
  })

  it('beginPhase resets state', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a', 'b'])
    tm.commit()
    tm.beginPhase(['x', 'y', 'z'])
    expect(tm.currentActorId).toBe('x')
    expect(tm.pendingCount).toBe(3)
  })
})

describe('TurnManager — snapshots', () => {
  it('snapshot reports order, status, total', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a', 'b', 'c'])
    const snap = tm.snapshot('b')
    expect(snap).not.toBeNull()
    expect(snap?.characterId).toBe('b')
    expect(snap?.order).toBe(2)
    expect(snap?.total).toBe(3)
    expect(snap?.status).toBe('pending')
  })

  it('snapshot of unregistered id is null', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a'])
    expect(tm.snapshot('ghost')).toBeNull()
  })

  it('allSnapshots returns every actor in turn order', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a', 'b', 'c'])
    tm.commit()
    tm.skip('stunned')
    const all = tm.allSnapshots()
    expect(all.map((s) => s.characterId)).toEqual(['a', 'b', 'c'])
    expect(all.map((s) => s.status)).toEqual(['committed', 'skipped', 'active'])
  })

  it('currentSnapshot tracks the cursor', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a', 'b'])
    expect(tm.currentSnapshot?.characterId).toBe('a')
    tm.commit()
    expect(tm.currentSnapshot?.characterId).toBe('b')
    tm.commit()
    expect(tm.currentSnapshot).toBeNull()
  })
})

describe('TurnManager — time budget (future real-time integration)', () => {
  it('default budget is 0 (unlimited)', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a'])
    expect(tm.timeBudgetMs).toBe(0)
    expect(tm.currentTimedOut).toBe(false)
  })

  it('records time consumed on the current actor', () => {
    const tm = new TurnManager(1000)
    tm.beginPhase(['a'])
    tm.recordTimeUsed(400)
    expect(tm.snapshot('a')?.timeUsedMs).toBe(400)
  })

  it('currentTimedOut flips once budget is exceeded', () => {
    const tm = new TurnManager(500)
    tm.beginPhase(['a'])
    expect(tm.currentTimedOut).toBe(false)
    tm.recordTimeUsed(400)
    expect(tm.currentTimedOut).toBe(false)
    tm.recordTimeUsed(200)
    expect(tm.currentTimedOut).toBe(true)
  })

  it('recordTimeUsed is a no-op once phase is complete', () => {
    const tm = new TurnManager(500)
    tm.beginPhase(['a'])
    tm.commit()
    tm.recordTimeUsed(9999)   // ignored
    expect(tm.isPhaseComplete).toBe(true)
  })
})

describe('TurnManager — display', () => {
  it('toString is empty for an uninitialised manager', () => {
    const tm = new TurnManager()
    expect(tm.toString()).toBe('TurnManager[empty]')
  })

  it('toString marks the current actor with → and uses status glyphs', () => {
    const tm = new TurnManager()
    tm.beginPhase(['a', 'b'])
    tm.commit()
    const str = tm.toString()
    expect(str).toContain('✓')   // committed
    expect(str).toContain('→')   // cursor arrow on b
    expect(str).toContain('●')   // active marker
  })
})
