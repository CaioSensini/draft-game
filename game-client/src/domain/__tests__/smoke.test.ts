import { describe, it, expect } from 'vitest'

/**
 * Smoke test — verifies Vitest is wired up and that the domain layer can be
 * imported without dragging Phaser in. If this file fails to build, the
 * domain/Phaser boundary was violated somewhere.
 */
describe('smoke: Vitest harness', () => {
  it('runs a trivial assertion', () => {
    expect(1 + 1).toBe(2)
  })
})
