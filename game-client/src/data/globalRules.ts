/**
 * data/globalRules.ts — the canonical list of global combat rules.
 *
 * This file is PURE DATA — no imports from the engine, no logic.
 * Each entry is a plain CombatRuleDefinition that can be loaded, serialised,
 * or sent over the network without any transformation.
 *
 * ── How to add a new rule ─────────────────────────────────────────────────────
 *
 *   CASE A — New rule for an existing type (same logic, different map/value):
 *     1. Append a CombatRuleDefinition entry below.
 *     2. Done — no engine changes needed.
 *
 *   CASE B — New rule with new logic:
 *     1. Add the new string to `CombatRuleType` in domain/CombatRule.ts.
 *     2. Add a handler case in engine/CombatRuleSystem.ts.
 *     3. Append a CombatRuleDefinition entry here.
 *
 * ── Rules in this file ────────────────────────────────────────────────────────
 *
 *   rule_wall_defense      → +5 % mitigation per team member touching the wall
 *   rule_last_stand        → king gains +25 % mitigation as sole survivor
 *   rule_underdog_assault  → +10 % ATK when team is outnumbered
 */

import type { CombatRuleDefinition } from '../domain/CombatRule'

export const GLOBAL_RULES: CombatRuleDefinition[] = [

  // ── Terrain rules ─────────────────────────────────────────────────────────

  {
    id:    'rule_wall_defense',
    name:  'Wall Defense',
    type:  'wall_mit_per_toucher',
    value: 0.05,
    description:
      'Each team member standing on the wall column grants +5 % damage mitigation ' +
      'to the whole team when under attack. A tightly packed formation resists better.',
  },

  // ── Survival rules ────────────────────────────────────────────────────────

  {
    id:    'rule_last_stand',
    name:  'Last Stand',
    type:  'last_stand_mit_bonus',
    value: 0.25,
    description:
      "When the king is the last surviving member of their team, they fight with " +
      "desperate resolve — gaining +25 % personal damage mitigation. " +
      "A cornered king is twice as dangerous.",
  },

  // ── Asymmetric rules ──────────────────────────────────────────────────────

  {
    id:    'rule_underdog_assault',
    name:  'Underdog Assault',
    type:  'outnumbered_atk_bonus',
    value: 0.10,
    description:
      'When a team has strictly fewer living members than the enemy, all their ' +
      'attacks gain +10 % ATK. Outnumbered fighters compensate with aggression.',
  },

]
