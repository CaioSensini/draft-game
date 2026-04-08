/**
 * data/deckAssignments.ts — maps every character to their starting deck.
 *
 * This file is PURE DATA: only string IDs, no imports from the engine.
 * All IDs must exist in data/skillCatalog.ts — the registry will throw at
 * startup if any ID is missing.
 *
 * Format:
 *   key        — character ID used when constructing a Character instance
 *   attackIds  — exactly 4 attack skill IDs (2 from attack1 + 2 from attack2)
 *   defenseIds — exactly 4 defense skill IDs (2 from defense1 + 2 from defense2)
 *
 * Deck rotation rule:
 *   Player sees the first 2 of each queue (1 attack + 1 defense visible).
 *   After use, a skill rotates to the back of its queue.
 *   If the player skips/times out, the queue does NOT rotate.
 */

export interface DeckAssignment {
  /** Exactly 4 attack skill IDs. */
  readonly attackIds:  readonly string[]
  /** Exactly 4 defense skill IDs. */
  readonly defenseIds: readonly string[]
}

export const DECK_ASSIGNMENTS: Readonly<Record<string, DeckAssignment>> = {

  // ── Left team ────────────────────────────────────────────────────────────

  lking: {
    attackIds:  ['lk_a1', 'lk_a3', 'lk_a6', 'lk_a7'],
    defenseIds: ['lk_d2', 'lk_d3', 'lk_d5', 'lk_d6'],
  },

  lwarrior: {
    attackIds:  ['lw_a1', 'lw_a2', 'lw_a6', 'lw_a7'],
    defenseIds: ['lw_d1', 'lw_d8', 'lw_d4', 'lw_d5'],
  },

  lexecutor: {
    attackIds:  ['le_a1', 'le_a2', 'le_a5', 'le_a6'],
    defenseIds: ['le_d1', 'le_d2', 'le_d7', 'le_d8'],
  },

  lspecialist: {
    attackIds:  ['ls_a1', 'ls_a2', 'ls_a5', 'ls_a6'],
    defenseIds: ['ls_d1', 'ls_d4', 'ls_d5', 'ls_d7'],
  },

  // ── Right team ───────────────────────────────────────────────────────────

  rking: {
    attackIds:  ['rk_a1', 'rk_a3', 'rk_a6', 'rk_a7'],
    defenseIds: ['rk_d2', 'rk_d3', 'rk_d5', 'rk_d6'],
  },

  rwarrior: {
    attackIds:  ['rw_a1', 'rw_a2', 'rw_a6', 'rw_a7'],
    defenseIds: ['rw_d1', 'rw_d8', 'rw_d4', 'rw_d5'],
  },

  rexecutor: {
    attackIds:  ['re_a1', 're_a2', 're_a5', 're_a6'],
    defenseIds: ['re_d1', 're_d2', 're_d7', 're_d8'],
  },

  rspecialist: {
    attackIds:  ['rs_a1', 'rs_a2', 'rs_a5', 'rs_a6'],
    defenseIds: ['rs_d1', 'rs_d4', 'rs_d5', 'rs_d7'],
  },
}
