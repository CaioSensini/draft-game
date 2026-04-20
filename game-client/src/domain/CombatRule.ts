/**
 * domain/CombatRule.ts — data definition for global combat rules.
 *
 * A CombatRule is a battlefield-wide condition that modifies combat
 * independently of any specific character's abilities or skill cards.
 * It is evaluated dynamically each time it is queried — not stored on a unit.
 *
 * Difference from passives:
 *   Passive    → belongs to ONE role; triggers on that character's actions.
 *   CombatRule → belongs to the BATTLEFIELD; triggers on position, team state,
 *                or other global conditions; can affect any character.
 *
 * No Phaser, no UI, no engine dependencies.
 *
 * ── Adding a new combat rule ───────────────────────────────────────────────────
 *
 *   CASE A — New rule using an existing type (same logic, different values):
 *     1. Append an entry to data/globalRules.ts. Done — no engine changes.
 *
 *   CASE B — New rule with new logic:
 *     1. Add the new string to `CombatRuleType` below.
 *     2. In engine/CombatRuleSystem.ts, add a handler case to the appropriate
 *        method: getMitigationBonus, getAtkBonus, or onRoundStart.
 *        If the trigger does not fit any existing method, add a new injection
 *        point and wire it in CombatEngine.
 *     3. Append a CombatRuleDefinition entry to data/globalRules.ts.
 *
 * ── Rule catalogue ─────────────────────────────────────────────────────────────
 *
 *   wall_mit_per_toucher    → terrain defence: team members near the wall protect each other
 *   last_stand_mit_bonus    → lone survivor: king fights harder when alone
 *   outnumbered_atk_bonus   → underdog: team attacks harder when outnumbered
 */

// ── CombatRuleType ─────────────────────────────────────────────────────────────

/**
 * Every supported rule behaviour. Maps 1-to-1 with a handler case in
 * CombatRuleSystem — adding a type here REQUIRES a matching case there.
 *
 * ── Formula modifiers (injected into computeRawDamage) ─────────────────────
 *
 * `wall_mit_per_toucher`
 *   Each living member of the target's team that is standing on the wall column
 *   contributes `value` extra mitigation for ALL incoming attacks on that team.
 *   Scales: value × wallTouchCount.
 *   Example: value = 0.05 → two wall-touchers → +10 % mitigation team-wide.
 *
 * `last_stand_mit_bonus`
 *   When the target IS the king AND they are the last living member of their team,
 *   they gain `value` extra mitigation. Represents desperate resilience.
 *   Example: value = 0.25 → sole-survivor king takes 25 % less damage.
 *
 * `outnumbered_atk_bonus`
 *   When the caster's team has strictly fewer living members than the enemy,
 *   the caster gains `value` as an additive ATK multiplier bonus.
 *   Example: value = 0.10 → 3v4 team → all outnumbered attackers deal +10 % damage.
 *
 * ── Round-start triggers (injected into applyRoundStartRules) ───────────────
 *
 * (No round-start rules are defined yet — infrastructure is present.)
 */
export type CombatRuleType =
  | 'wall_mit_per_toucher'   // +value% mit × wall-touch count (target team)
  | 'last_stand_mit_bonus'   // +value% mit for king when sole survivor
  | 'outnumbered_atk_bonus'  // +value% atk when team is outnumbered
  | 'execute_threshold'      // v3: +value% damage when target HP ≤ EXECUTE_HP_THRESHOLD
  | 'overtime_scaling'       // v3: +value% damage per turn after OVERTIME_START_TURN

// ── CombatRuleDefinition ──────────────────────────────────────────────────────

/**
 * Pure-data description of one global combat rule.
 *
 * Rules are loaded at engine startup via data/globalRules.ts.
 * Multiple rules of the same type are allowed and stack additively.
 */
export interface CombatRuleDefinition {
  /** Unique identifier — used in `combat_rule_active` events. */
  readonly id:          string
  /** Short name for tooltips / UI. */
  readonly name:        string
  /** Player-facing description of the rule's effect. */
  readonly description: string
  /** Determines which handler in CombatRuleSystem is invoked. */
  readonly type:        CombatRuleType
  /**
   * Numeric parameter for the rule's handler.
   *   - wall_mit_per_toucher:  mitigation per wall-toucher (e.g. 0.05)
   *   - last_stand_mit_bonus:  flat mitigation bonus        (e.g. 0.25)
   *   - outnumbered_atk_bonus: ATK multiplier bonus         (e.g. 0.10)
   */
  readonly value:       number
}
