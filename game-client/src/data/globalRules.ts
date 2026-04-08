/**
 * data/globalRules.ts — the canonical list of global combat rules.
 *
 * ── Rules ─────────────────────────────────────────────────────────────────────
 *
 *   rule_wall_defense      → +10% mitigação e +10% dano por aliado no muro
 *   rule_last_stand        → rei ganha +25% mitigação como último sobrevivente
 *   rule_underdog_assault  → +10% ATK quando em desvantagem numérica
 */

import type { CombatRuleDefinition } from '../domain/CombatRule'

export const GLOBAL_RULES: CombatRuleDefinition[] = [

  {
    id:    'rule_wall_defense',
    name:  'Buff do Muro',
    type:  'wall_mit_per_toucher',
    value: 0.10,
    description:
      'Cada personagem encostado no muro central concede +10% de mitigação de dano ' +
      'e +10% de dano para o time todo. Máximo de 4 aliados = +40%.',
  },

  {
    id:    'rule_last_stand',
    name:  'Último em Pé',
    type:  'last_stand_mit_bonus',
    value: 0.25,
    description:
      'Quando o rei é o último sobrevivente do time, ele luta com determinação — ' +
      '+25% de mitigação de dano pessoal.',
  },

  {
    id:    'rule_underdog_assault',
    name:  'Vantagem Numérica',
    type:  'outnumbered_atk_bonus',
    value: 0.10,
    description:
      'Quando um time tem menos membros vivos que o inimigo, todos seus ataques ' +
      'ganham +10% ATK.',
  },

]
