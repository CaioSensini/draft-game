/**
 * data/passiveCatalog.ts — the canonical list of all passive abilities.
 *
 * This file is PURE DATA — no imports from the engine, no logic.
 *
 * ── Role catalogue (matches the game design document) ──────────────────────
 *
 *   king       → Proteção Real      — shield renovado a cada turno
 *   warrior    → Protetor           — aliados adjacentes ganham 15% mitigação
 *   executor   → Isolado            — +15% dano quando sem aliados adjacentes
 *   specialist → Queimação          — inimigos atingidos perdem 20% de cura por 1 turno
 */

import type { PassiveDefinition } from '../domain/Passive'

export const PASSIVE_CATALOG: PassiveDefinition[] = [

  // ── King ────────────────────────────────────────────────────────────────────
  {
    id:          'passive_king_protecao_real',
    name:        'Proteção Real',
    forRole:     'king',
    type:        'incoming_damage_reduction',
    value:       0.15,
    description:
      'O rei sempre possui um pequeno escudo que é renovado no início de cada turno. ' +
      'Reduz 15% do dano recebido permanentemente.',
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
  {
    id:          'passive_executor_isolado',
    name:        'Isolado',
    forRole:     'executor',
    type:        'atk_bonus_when_isolated',
    value:       0.15,
    description:
      'Se não tiver ninguém (aliado ou inimigo) nos 8 tiles adjacentes, ' +
      'o executor ganha +15% de dano em todas as skills de ataque.',
  },

  // ── Specialist ───────────────────────────────────────────────────────────────
  {
    id:          'passive_specialist_queimacao',
    name:        'Queimação',
    forRole:     'specialist',
    type:        'heal_reduction_on_hit',
    value:       0.20,
    ticks:       1,
    description:
      'Inimigos atingidos pelas habilidades do especialista ficam com a cura ' +
      'recebida reduzida em 20% por 1 turno.',
  },

]
