/**
 * data/deckAssignments.ts — maps every character to their starting deck.
 *
 * This file is PURE DATA: only string IDs, no imports from the engine.
 * All IDs must exist in data/skillCatalog.ts — the registry will throw at
 * startup if any ID is missing.
 *
 * Format:
 *   key        — character ID used when constructing a Character instance
 *   attackIds  — exactly 4 attack skill IDs (one per group slot)
 *   defenseIds — exactly 4 defense skill IDs
 *
 * To reassign a deck: change the IDs here.
 * To give a character a combo skill: add its id from skillCatalog.ts here.
 * No engine code changes needed.
 */

export interface DeckAssignment {
  /** Exactly 4 attack skill IDs. */
  readonly attackIds:  readonly string[]
  /** Exactly 4 defense skill IDs. */
  readonly defenseIds: readonly string[]
}

/**
 * Default starting deck for every character in the simulation.
 *
 * Key — character instance ID (set when creating `new Character(id, ...)`).
 * The same skill ID can appear in multiple characters' decks; the registry
 * resolves each to the same Skill value-object (skills are stateless).
 */
export const DECK_ASSIGNMENTS: Readonly<Record<string, DeckAssignment>> = {

  // ── Left team ────────────────────────────────────────────────────────────

  lking: {
    attackIds:  ['lk_a1', 'lk_a2', 'lk_a3', 'lk_a4'],
    defenseIds: ['lk_d1', 'lk_d2', 'lk_d3', 'lk_d4'],
  },

  lwarrior: {
    attackIds:  ['lw_a1', 'lw_a2', 'lw_a3', 'lw_a4'],
    defenseIds: ['lw_d1', 'lw_d2', 'lw_d3', 'lw_d4'],
  },

  lexecutor: {
    attackIds:  ['le_a1', 'le_a2', 'le_a3', 'le_a4'],
    defenseIds: ['le_d1', 'le_d2', 'le_d3', 'le_d4'],
  },

  lspecialist: {
    attackIds:  ['ls_a1', 'ls_a2', 'ls_a3', 'ls_a4'],
    defenseIds: ['ls_d1', 'ls_d2', 'ls_d3', 'ls_d4'],
  },

  // ── Right team ───────────────────────────────────────────────────────────

  rking: {
    attackIds:  ['rk_a1', 'rk_a2', 'rk_a3', 'rk_a4'],
    defenseIds: ['rk_d1', 'rk_d2', 'rk_d3', 'rk_d4'],
  },

  rwarrior: {
    attackIds:  ['rw_a1', 'rw_a2', 'rw_a3', 'rw_a4'],
    defenseIds: ['rw_d1', 'rw_d2', 'rw_d3', 'rw_d4'],
  },

  rexecutor: {
    attackIds:  ['re_a1', 're_a2', 're_a3', 're_a4'],
    defenseIds: ['re_d1', 're_d2', 're_d3', 're_d4'],
  },

  rspecialist: {
    attackIds:  ['rs_a1', 'rs_a2', 'rs_a3', 'rs_a4'],
    defenseIds: ['rs_d1', 'rs_d2', 'rs_d3', 'rs_d4'],
  },

  // ── Example: combo-skill deck (shows data-driven special rules) ───────────
  // Uncomment and wire into a character to see secondaryEffect in action:
  //
  // combo_demo: {
  //   attackIds:  ['sp_shatter_strike', 'sp_frenzied_slash', 'sp_thunder_strike', 'sp_venom_blade'],
  //   defenseIds: ['sp_fortified_barrier', 'sp_iron_will', 'le_d3', 'le_d4'],
  // },
}
