/**
 * data/globalRules.ts — Global combat rules (v3 — SKILLS_CATALOG_v3_FINAL.md §2).
 *
 * Central source of truth for engine-wide combat constants and rule registrations.
 */

import type { CombatRuleDefinition } from '../domain/CombatRule'

// ── v3 GLOBAL COMBAT CONSTANTS ────────────────────────────────────────────────

/** Execute threshold — targets at or below this HP ratio receive +25% damage. */
export const EXECUTE_HP_THRESHOLD = 0.30

/** Execute damage multiplier applied when target HP ≤ threshold. */
export const EXECUTE_DAMAGE_MULT = 1.25

/** Max heals per ally per turn (shields do NOT count). */
export const HEAL_CAP_PER_TURN = 2

/** Max total shield HP per unit. Above this, new shields overwrite the weakest. */
export const SHIELD_CAP_PER_UNIT = 100

/** Minimum damage floor — final damage cannot drop below base_damage × 0.10. */
export const MIN_DAMAGE_FLOOR_RATIO = 0.10

/** Turn when overtime scaling begins. */
export const OVERTIME_START_TURN = 12

/** Per-turn damage bonus during overtime (cumulative). Applies to DoT as well. */
export const OVERTIME_DAMAGE_BONUS_PER_TURN = 0.10

/** Wall-touch bonus per non-king ally touching the central wall. */
export const WALL_TOUCH_BONUS_PER_UNIT = 0.25

/** Max cumulative wall-touch bonus (at 4 allies). */
export const WALL_TOUCH_MAX_BONUS = 1.00

/** King is immune to direct heals, regen, and targeted lifesteal. */
export const KING_HEAL_IMMUNE = true

/** Turn timeout count that triggers auto-pilot on a unit. */
export const AUTOPILOT_TIMEOUT_THRESHOLD = 3

// ── Rule definitions (registered with CombatRuleSystem) ───────────────────────

export const GLOBAL_RULES: CombatRuleDefinition[] = [

  {
    id:    'rule_wall_defense',
    name:  'Postura de Muralha',
    type:  'wall_mit_per_toucher',
    value: WALL_TOUCH_BONUS_PER_UNIT,
    description:
      `Cada aliado não-rei tocando o muro central concede ` +
      `+${Math.round(WALL_TOUCH_BONUS_PER_UNIT * 100)}% de dano e defesa ao time ` +
      `(máx +${Math.round(WALL_TOUCH_MAX_BONUS * 100)}%). ` +
      `O rei só conta se os 3 outros já estiverem posicionados.`,
  },

  {
    id:    'rule_execute',
    name:  'Execução',
    type:  'execute_threshold',
    value: EXECUTE_DAMAGE_MULT - 1,
    description:
      `Alvos com HP ≤ ${Math.round(EXECUTE_HP_THRESHOLD * 100)}% recebem ` +
      `+${Math.round((EXECUTE_DAMAGE_MULT - 1) * 100)}% de dano de todas as fontes ` +
      `(inclui DoT).`,
  },

  {
    id:    'rule_overtime',
    name:  'Tempo Extra',
    type:  'overtime_scaling',
    value: OVERTIME_DAMAGE_BONUS_PER_TURN,
    description:
      `A partir do turno ${OVERTIME_START_TURN}, todos os danos ` +
      `(inclusive DoT) ganham +${Math.round(OVERTIME_DAMAGE_BONUS_PER_TURN * 100)}% ` +
      `por turno (acumulativo).`,
  },

  {
    id:    'rule_last_stand',
    name:  'Último em Pé',
    type:  'last_stand_mit_bonus',
    value: 0.25,
    description:
      'Quando o rei é o último sobrevivente do time, ganha +25% de mitigação pessoal.',
  },

  {
    id:    'rule_underdog_assault',
    name:  'Vantagem Numérica',
    type:  'outnumbered_atk_bonus',
    value: 0.10,
    description:
      'Quando o time tem menos membros vivos que o inimigo, todos os ataques ganham +10% ATK.',
  },

]
