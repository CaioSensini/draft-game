/**
 * domain/Stats.ts — level-scaled stat calculation (v3 §8).
 *
 * Source of truth for stat scaling:
 *   HP(level)  = HP_base  × (1 + 0.005 × (level - 1))
 *   ATK(level) = ATK_base × (1 + 0.004 × (level - 1))
 *   DEF(level) = DEF_base × (1 + 0.004 × (level - 1))
 *   MOB(level) = MOB_base (does not scale)
 *
 * Base stats (v3 §3, level 1):
 *   King        HP 180 · ATK 16 · DEF 14 · MOB 4
 *   Warrior     HP 200 · ATK 18 · DEF 20 · MOB 2
 *   Executor    HP 120 · ATK 24 · DEF  8 · MOB 3
 *   Specialist  HP 130 · ATK 20 · DEF 10 · MOB 2
 *
 * Ranked normalization (v3 §11): all ranked players play as level 50.
 * The caller is responsible for passing the correct effective level.
 *
 * No Phaser, no Character — pure functions.
 */

import type { CharacterRole } from './Character'

// ── Base stats (level 1) — v3 §3 ──────────────────────────────────────────────

export interface BaseStats {
  readonly hp:  number
  readonly atk: number
  readonly def: number
  readonly mob: number
}

export const BASE_STATS: Record<CharacterRole, BaseStats> = {
  king:       { hp: 180, atk: 16, def: 14, mob: 4 },
  warrior:    { hp: 200, atk: 18, def: 20, mob: 2 },
  executor:   { hp: 120, atk: 24, def:  8, mob: 3 },
  specialist: { hp: 130, atk: 20, def: 10, mob: 2 },
}

// ── Scaling limits ────────────────────────────────────────────────────────────

export const MIN_LEVEL = 1
export const MAX_LEVEL = 100

/** Level used for ranked normalization (v3 §11.1). */
export const RANKED_LEVEL = 50

// ── Multipliers ───────────────────────────────────────────────────────────────

/**
 * HP scaling multiplier for a level.
 * Level 1 = 1.000; Level 50 = 1.245; Level 100 = 1.495.
 *
 * @throws {RangeError} if level is outside [MIN_LEVEL, MAX_LEVEL].
 */
export function hpMultiplier(level: number): number {
  assertValidLevel(level)
  return 1 + 0.005 * (level - 1)
}

/**
 * ATK and DEF share the same scaling multiplier (v3 §8.1).
 * Level 1 = 1.000; Level 50 = 1.196; Level 100 = 1.396.
 *
 * @throws {RangeError} if level is outside [MIN_LEVEL, MAX_LEVEL].
 */
export function atkDefMultiplier(level: number): number {
  assertValidLevel(level)
  return 1 + 0.004 * (level - 1)
}

/** Mobility does NOT scale with level (v3 §3 note). Always returns 1. */
export function mobMultiplier(level: number): number {
  assertValidLevel(level)
  return 1
}

// ── Scaled stats ──────────────────────────────────────────────────────────────

/**
 * Return the scaled stat block for a role at a given level.
 *
 * Rounding policy: integer stats via `Math.round` (same half-up policy as
 * damage — see docs/DECISIONS.md 2026-04-21).
 *
 * @param role — one of 'king' | 'warrior' | 'executor' | 'specialist'
 * @param level — integer in [MIN_LEVEL, MAX_LEVEL]
 * @returns integer stat block
 * @throws {RangeError} if level is outside the valid range or not an integer.
 *
 * @example
 *   getStatsForLevel('king', 1)
 *   // → { hp: 180, atk: 16, def: 14, mob: 4 }
 *
 *   getStatsForLevel('king', 50)
 *   // → { hp: 224, atk: 19, def: 17, mob: 4 }
 *
 *   getStatsForLevel('king', 100)
 *   // → { hp: 269, atk: 22, def: 20, mob: 4 }
 */
export function getStatsForLevel(
  role:  CharacterRole,
  level: number,
): BaseStats {
  assertValidLevel(level)
  const base = BASE_STATS[role]
  const hMult = hpMultiplier(level)
  const sMult = atkDefMultiplier(level)
  return {
    hp:  Math.round(base.hp  * hMult),
    atk: Math.round(base.atk * sMult),
    def: Math.round(base.def * sMult),
    mob: base.mob,
  }
}

// ── Guards ────────────────────────────────────────────────────────────────────

/**
 * Throw if `level` is not an integer in [MIN_LEVEL, MAX_LEVEL].
 * Keeps the rest of the API clean by validating input up-front.
 */
export function assertValidLevel(level: number): void {
  if (!Number.isFinite(level)) {
    throw new RangeError(`level must be a finite number, got ${level}`)
  }
  if (!Number.isInteger(level)) {
    throw new RangeError(`level must be an integer, got ${level}`)
  }
  if (level < MIN_LEVEL || level > MAX_LEVEL) {
    throw new RangeError(
      `level must be in [${MIN_LEVEL}, ${MAX_LEVEL}], got ${level}`,
    )
  }
}
