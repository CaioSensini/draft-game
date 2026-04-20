/**
 * domain/DamageFormula.ts — pure v3 damage calculation.
 *
 * Reference: SKILLS_CATALOG_v3_FINAL.md §5.
 *
 * Purpose:
 *   Isolate the damage math from CombatEngine so it can be unit-tested with
 *   primitive inputs (no Character, Battle, or PassiveSystem required).
 *   CombatEngine collects the contextual numbers (atk/mit bonuses, target HP,
 *   current round) and calls this function. The function returns a plain number.
 *
 * Formula (canonical v3):
 *
 *   final = base × defFactor × modifiers × execMult × overtimeMult
 *     defFactor     = 1                         if isTrueDamage
 *                   = 100 / (100 + max(0, DEF)) otherwise
 *     modifiers     = (1 + atkBonus) × mitFactor
 *     mitFactor     = max(0.10, 1 - min(0.90, mitBonus))
 *     execMult      = 1.25 if hpRatio ≤ 0.30, else 1.00
 *     overtimeMult  = 1 + 0.10 × (round - 11)   if round ≥ 12, else 1.00
 *     floor         = base × 0.10
 *   return max(round(floor), round(final))
 *
 * Key v3 behaviors encoded below:
 *   - True damage bypasses DEF mitigation but STILL receives passive/buff
 *     modifiers (e.g. Proteção Real reduces true damage too — v3 §4.1).
 *   - Execute uses hpRatio as reported by the caller; the caller measures
 *     BEFORE applying the damage being computed (per v3 §2.2: "testa HP antes").
 *   - Overtime applies to DoT ticks too (v3 §2.8) — callers route tick damage
 *     through this same function with the relevant round.
 *   - Minimum floor of 10% of base protects against infinite DEF stalls.
 *
 * Rounding policy (decision registered in docs/DECISIONS.md, 2026-04-21):
 *   Final damage uses Math.round (half-up).
 *   Rationale: in a turn-based grid game, a computed 1.5 should hurt for 2,
 *   not 1; Math.floor would systematically bias damage downward for tank
 *   builds and make DEF stacking disproportionately strong. Math.round
 *   matches what players mentally expect ("about 25") and keeps execute
 *   multipliers meaningful even at low raw damage.
 *
 * No Phaser, no Character, no dependencies — pure math.
 */

// ── Canonical v3 constants (duplicated from data/globalRules to keep this
// file dependency-free; runtime imports the catalog values, tests can use
// either). If the constants in data/globalRules.ts change, update here too. ──

/** Target HP ratio at or below which Execute activates (+25% damage). */
export const EXECUTE_HP_THRESHOLD = 0.30

/** Multiplier applied when Execute triggers. */
export const EXECUTE_DAMAGE_MULT = 1.25

/** Round number at which Overtime scaling begins (damage ×1.10 on turn 12). */
export const OVERTIME_START_ROUND = 12

/** Per-round cumulative damage bonus during Overtime (applies to DoT too). */
export const OVERTIME_BONUS_PER_ROUND = 0.10

/** Minimum damage floor — no hit ever deals less than base × this ratio. */
export const MIN_DAMAGE_FLOOR_RATIO = 0.10

/** Hard cap on combined mitigation (passive + rule) — prevents zero damage. */
export const MAX_MITIGATION = 0.90

// ── Inputs ────────────────────────────────────────────────────────────────────

/**
 * Everything a damage roll needs, already collected by the caller.
 * Using primitives (not domain objects) makes unit tests trivial.
 */
export interface DamageInputs {
  /** Base power of the skill (e.g. 30 for a "deal 30 damage" card). */
  readonly basePower: number
  /** Target's current DEF stat (already including equipment/level scaling). */
  readonly targetDef: number
  /**
   * Target's HP ratio at the moment damage is computed (hp/maxHp).
   * Caller is responsible for measuring BEFORE applying the current hit,
   * per v3 §2.2 ("execute testa HP antes").
   */
  readonly targetHpRatio: number
  /**
   * Sum of the caster's ATK-side multiplicative bonuses, expressed as a
   * fraction (0.20 = +20%). Includes passive (Isolado, etc.) + rule
   * (outnumbered, wall) + skill-level ATK buffs.
   */
  readonly atkBonus: number
  /**
   * Sum of the target's mitigation bonuses, expressed as a fraction
   * (0.20 = 20% reduction). Includes passive (Proteção Real, Protetor)
   * + rule (wall, last stand) + stat (def_up beyond base).
   * Total clamped to [0, MAX_MITIGATION] internally.
   */
  readonly mitBonus: number
  /**
   * Extra damage the target INCURS on top of everything else (v3 §4.3 Isolado
   * trade-off — Executor takes +10% damage when isolated). Expressed as a
   * fraction (0.10 = +10% damage received). Clamped to [0, 2.0] to guard
   * against runaway stacking.
   * @default 0
   */
  readonly targetIncomingDamageBonus?: number
  /** Current combat round (1-based). Used for overtime scaling. */
  readonly round: number
  /** True damage skips DEF mitigation but keeps every other modifier. */
  readonly isTrueDamage?: boolean
}

// ── Output ────────────────────────────────────────────────────────────────────

/**
 * Detailed breakdown of how the final number was produced.
 * Lets callers log/inspect/visualize damage sources (e.g. "execute +25%").
 */
export interface DamageBreakdown {
  readonly basePower:                 number
  readonly defFactor:                 number
  readonly atkBonus:                  number
  readonly mitBonus:                  number      // clamped
  readonly mitFactor:                 number
  readonly targetIncomingDamageBonus: number      // clamped
  readonly modifiers:                 number      // (1 + atkBonus) × (1 + incoming) × mitFactor
  readonly execMult:                  number
  readonly overtimeMult:              number
  readonly floor:                     number
  readonly preFloor:                  number
  readonly final:                     number      // integer, post-rounding, post-floor
  readonly executed:                  boolean
  readonly overtimed:                 boolean
  readonly trueDamage:                boolean
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Run the canonical v3 damage formula.
 *
 * @param inputs — context collected by the engine (see DamageInputs).
 * @returns integer final damage — guaranteed ≥ floor and ≥ 0.
 *
 * @example
 *   // Executor Corte Mortal (45) on King (DEF 14, Proteção Real -20%), HP 50%:
 *   computeDamage({
 *     basePower: 45, targetDef: 14, targetHpRatio: 0.5,
 *     atkBonus: 0, mitBonus: 0.20, round: 1,
 *   }) // → 32 (= round(45 × 100/114 × 0.80))
 */
export function computeDamage(inputs: DamageInputs): number {
  return computeDamageBreakdown(inputs).final
}

/**
 * Same as computeDamage but also returns the full breakdown. Use when you
 * need to log/inspect each multiplier (UI tooltip "How was this calculated?").
 */
export function computeDamageBreakdown(inputs: DamageInputs): DamageBreakdown {
  const {
    basePower,
    targetDef,
    targetHpRatio,
    atkBonus,
    mitBonus,
    targetIncomingDamageBonus = 0,
    round,
    isTrueDamage = false,
  } = inputs

  // DEF mitigation: true damage bypasses, otherwise 100 / (100 + DEF).
  const defFactor = isTrueDamage
    ? 1
    : 100 / (100 + Math.max(0, targetDef))

  // Mitigation bonus is clamped to MAX_MITIGATION to keep damage floor meaningful.
  const clampedMit = Math.max(0, Math.min(MAX_MITIGATION, mitBonus))
  const mitFactor  = Math.max(MIN_DAMAGE_FLOOR_RATIO, 1 - clampedMit)

  // Target's incoming-damage surcharge (e.g. Executor trade-off). Clamped
  // to [0, 2.0] — 200% extra damage is already an extreme upper bound.
  const clampedIncoming = Math.max(0, Math.min(2, targetIncomingDamageBonus))

  // Attacker ATK buffs multiply damage. Negative values (debuffs) are allowed —
  // the caller can pass -0.10 for a 10% ATK-down. Final modifier is
  // (1 + atkBonus) × (1 + targetIncomingDamageBonus) × mitFactor.
  const modifiers = (1 + atkBonus) * (1 + clampedIncoming) * mitFactor

  // Execute: +25% damage if target is at or below 30% HP at calculation time.
  const executed = targetHpRatio <= EXECUTE_HP_THRESHOLD
  const execMult = executed ? EXECUTE_DAMAGE_MULT : 1

  // Overtime: starts at round 12. Turn 12 = 1.10, turn 13 = 1.20, etc.
  // v3 §2.8 says "+10% dano por turno (acumulativo)" — we interpret this as
  // the multiplier grows by 0.10 per round past the start (not compounded).
  const overtimed = round >= OVERTIME_START_ROUND
  const overtimeMult = overtimed
    ? 1 + OVERTIME_BONUS_PER_ROUND * (round - OVERTIME_START_ROUND + 1)
    : 1

  const preFloor = basePower * defFactor * modifiers * execMult * overtimeMult
  const floor    = basePower * MIN_DAMAGE_FLOOR_RATIO

  // Rounding policy (see docs/DECISIONS.md 2026-04-21):
  // Math.round for final damage — half-up, matches player expectations.
  // The floor is also rounded so comparisons stay in integer space.
  const final = Math.max(Math.round(floor), Math.round(preFloor))

  return {
    basePower,
    defFactor,
    atkBonus,
    mitBonus:                 clampedMit,
    mitFactor,
    targetIncomingDamageBonus: clampedIncoming,
    modifiers,
    execMult,
    overtimeMult,
    floor,
    preFloor,
    final,
    executed,
    overtimed,
    trueDamage:               isTrueDamage,
  }
}
