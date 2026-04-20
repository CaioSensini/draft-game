/**
 * domain/Passive.ts — data definition for character passive abilities.
 *
 * A passive is a persistent ability that activates automatically based on
 * combat conditions (formula, trigger, side-effect). It is NOT a card —
 * the player cannot use or rotate it.
 *
 * Responsibility boundary:
 *   Passive describes WHAT the passive does and to WHOM it applies.
 *   It does NOT perform the logic — that belongs to engine/PassiveSystem.ts,
 *   which maps PassiveType strings to handler functions.
 *
 * No Phaser, no UI, no engine dependencies.
 *
 * ── Adding a new passive type ──────────────────────────────────────────────────
 *
 *   1. Add a new string literal to `PassiveType` below.
 *   2. In engine/PassiveSystem.ts:
 *        - Add a handler in the appropriate injection method
 *          (getAtkBonus / getMitigationBonus / onDamageDealt).
 *        - The handler receives (def, char, battle, …) and returns a number or events.
 *   3. In data/passiveCatalog.ts: add a PassiveDefinition entry with the new type.
 *
 *   No changes to CombatEngine are required unless you need a NEW injection point
 *   that doesn't exist yet (e.g. "on kill", "on round start").
 */

import type { CharacterRole } from './Character'

// ── PassiveType ───────────────────────────────────────────────────────────────

/**
 * All supported passive behaviour patterns.
 *
 * ── Formula modifiers (silent — no event emitted) ──────────────────────────
 *
 * `atk_bonus_when_isolated`
 *   Caster gains `value` as an additive multiplier on ATK when no ally is
 *   adjacent to them. Injected into computeRawDamage on the outgoing side.
 *   Example: value = 0.15 → +15 % ATK when alone.
 *
 * `guardian_mit_bonus`
 *   When this unit is adjacent to an ally that is being attacked, that ally
 *   gains `value` added to their mitigation. Injected in computeRawDamage on
 *   the incoming side.
 *   Example: value = 0.15 → +15 % mitigation for adjacent allies.
 *
 * `incoming_damage_reduction`
 *   This unit always reduces incoming damage by `value` (added to mitigation).
 *   Self-only; applies whenever this unit is the attack target.
 *   Example: value = 0.20 → +20 % personal mitigation at all times.
 *
 * ── Triggered side-effects (emit passive_triggered event) ──────────────────
 *
 * `heal_reduction_on_hit`
 *   After this unit deals any HP damage, the target receives a HealReduction
 *   debuff (factor = value, duration = ticks rounds).
 *   Example: value = 0.50, ticks = 2 → heals on target reduced by 50 % for 2 rounds.
 */
export type PassiveType =
  | 'atk_bonus_when_isolated'       // caster: +value% ATK when isolated
  | 'incoming_damage_bonus_when_isolated' // self: +value% damage RECEIVED when isolated (v3 trade-off)
  | 'guardian_mit_bonus'            // protector: adjacent allies get +value mitigation
  | 'incoming_damage_reduction'     // self: personal +value mitigation, always active
  | 'heal_reduction_on_hit'         // attacker: after dealing damage, debuff target's heals

// ── PassiveDefinition ─────────────────────────────────────────────────────────

/**
 * Pure-data description of a passive ability.
 *
 * One passive per role is the expected default, but the registry allows
 * multiple passives per role if needed.
 */
export interface PassiveDefinition {
  /** Unique identifier — used in `passive_triggered` events. */
  readonly id:          string
  /** Short display name for tooltips / UI. */
  readonly name:        string
  /** Player-facing description. */
  readonly description: string
  /** Which character role this passive belongs to. */
  readonly forRole:     CharacterRole
  /** Determines which handler in PassiveSystem is invoked. */
  readonly type:        PassiveType
  /**
   * Primary numeric parameter:
   *   - atk_bonus_when_isolated:   fractional bonus  (0.15 = +15 %)
   *   - guardian_mit_bonus:        mitigation added  (0.15 = +15 %)
   *   - incoming_damage_reduction: mitigation added  (0.20 = +20 %)
   *   - heal_reduction_on_hit:     heal factor       (0.50 = 50 % penalty)
   */
  readonly value:       number
  /**
   * Duration in rounds for timed side-effect passives.
   * Ignored by formula-modifier passives.
   * Default used by PassiveSystem when omitted.
   */
  readonly ticks?:      number
}
