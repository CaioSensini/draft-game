/**
 * data/passiveCatalog.ts — the canonical list of all passive abilities.
 *
 * This file is PURE DATA — no imports from the engine, no logic.
 * Every entry is a plain PassiveDefinition that can be loaded, serialised,
 * or sent over the network without any transformation.
 *
 * ── How to add a new passive ────────────────────────────────────────────────
 *
 *   CASE A — New passive for an existing type (same logic, different values):
 *     1. Append a new PassiveDefinition entry below.
 *     2. Done — no engine changes needed.
 *
 *   CASE B — New passive with new behaviour:
 *     1. Add the new string to `PassiveType` in domain/Passive.ts.
 *     2. Add a handler case in engine/PassiveSystem.ts (getAtkBonus,
 *        getMitigationBonus, or onDamageDealt — whichever fits, or a
 *        new injection point if the trigger doesn't exist yet).
 *     3. Append a PassiveDefinition entry here.
 *
 * ── Role catalogue ──────────────────────────────────────────────────────────
 *
 *   king       → Iron Crown          — personal damage reduction (+20 % mitigation)
 *   warrior    → Bulwark             — guards adjacent allies (+15 % mitigation)
 *   executor   → Isolation Fury      — gains attack when alone (+15 % ATK)
 *   specialist → Weakening Touch     — corrupts enemy heals after any damaging hit
 */

import type { PassiveDefinition } from '../domain/Passive'

export const PASSIVE_CATALOG: PassiveDefinition[] = [

  // ── King ────────────────────────────────────────────────────────────────────
  {
    id:          'passive_king_iron_crown',
    name:        'Iron Crown',
    forRole:     'king',
    type:        'incoming_damage_reduction',
    value:       0.20,
    description:
      "The king's resolve and royal guard reduce all incoming damage by 20 %. " +
      'Always active — no conditions required.',
  },

  // ── Warrior ─────────────────────────────────────────────────────────────────
  {
    id:          'passive_warrior_bulwark',
    name:        'Bulwark',
    forRole:     'warrior',
    type:        'guardian_mit_bonus',
    value:       0.15,
    description:
      'While adjacent to an ally, the warrior forms a living shield — ' +
      'any ally within 1 tile gains +15 % damage mitigation.',
  },

  // ── Executor ─────────────────────────────────────────────────────────────────
  {
    id:          'passive_executor_isolation_fury',
    name:        'Isolation Fury',
    forRole:     'executor',
    type:        'atk_bonus_when_isolated',
    value:       0.15,
    description:
      'When no ally stands adjacent, the executor fights with desperate precision — ' +
      '+15 % ATK. Deactivates as soon as any ally moves next to them.',
  },

  // ── Specialist ───────────────────────────────────────────────────────────────
  {
    id:          'passive_specialist_weakening_touch',
    name:        'Weakening Touch',
    forRole:     'specialist',
    type:        'heal_reduction_on_hit',
    value:       0.50,
    ticks:       2,
    description:
      "Every damaging hit from the specialist corrupts the target's recovery — " +
      'all heals received by the target are reduced by 50 % for 2 rounds.',
  },

]
