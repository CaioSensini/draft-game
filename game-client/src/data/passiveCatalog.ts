/**
 * data/passiveCatalog.ts — the canonical list of all passive abilities.
 *
 * Updated per SKILLS_CATALOG_v3_FINAL.md (2026-04-20).
 *
 * ── Role catalogue ──────────────────────────────────────────────────────────
 *
 *   king       → Proteção Real   — -20% dano (aplica a true damage)
 *   warrior    → Protetor        — aliados adjacentes -15% dano
 *   executor   → Isolado         — +20% dano / +10% dano recebido sem aliados adjacentes (trade-off)
 *   specialist → Queimação       — alvos atingidos -30% cura por 2 turnos
 */

import type { PassiveDefinition } from '../domain/Passive'

export const PASSIVE_CATALOG: PassiveDefinition[] = [

  // ── King ────────────────────────────────────────────────────────────────────
  {
    id:          'passive_king_protecao_real',
    name:        'Proteção Real',
    forRole:     'king',
    type:        'incoming_damage_reduction',
    value:       0.20,
    description:
      'Reduz 20% do dano recebido de todas as fontes (inclui true damage). Sempre ativo.',
  },

  // ── Warrior ─────────────────────────────────────────────────────────────────
  {
    id:          'passive_warrior_protetor',
    name:        'Protetor',
    forRole:     'warrior',
    type:        'guardian_mit_bonus',
    value:       0.15,
    description:
      'Aliados adjacentes ao guerreiro (8 tiles ao redor) ganham 15% de mitigação de dano. ' +
      'O próprio guerreiro NÃO recebe esse bônus.',
  },

  // ── Executor ─────────────────────────────────────────────────────────────────
  // v3 §4.3 — Isolado is a dual passive: +20% damage dealt AND +10% damage
  // received when no ally occupies any of the 8 surrounding cells. We register
  // two entries so each injection point (ATK outgoing, damage incoming) can
  // evaluate its own condition independently.
  {
    id:          'passive_executor_isolado',
    name:        'Isolado',
    forRole:     'executor',
    type:        'atk_bonus_when_isolated',
    value:       0.20,
    description:
      'Sem aliados nas 8 células ao redor: +20% dano causado, +10% dano recebido (trade-off).',
  },
  {
    id:          'passive_executor_isolado_trade_off',
    name:        'Isolado (trade-off)',
    forRole:     'executor',
    type:        'incoming_damage_bonus_when_isolated',
    value:       0.10,
    description:
      'Sem aliados nas 8 células ao redor: +10% dano recebido (custo do bônus ofensivo).',
  },

  // ── Specialist ───────────────────────────────────────────────────────────────
  {
    id:          'passive_specialist_queimacao',
    name:        'Queimação',
    forRole:     'specialist',
    type:        'heal_reduction_on_hit',
    value:       0.30,
    ticks:       2,
    description:
      'Alvos atingidos recebem Queimação: -30% cura recebida por 2 turnos. ' +
      'Renovável (não stackável): re-hit reseta timer.',
  },

]
