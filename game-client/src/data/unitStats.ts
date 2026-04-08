import type { UnitBaseStats, UnitRole } from '../types'

/**
 * Base stats per role.  These are applied when creating a unit's runtime state.
 *
 * Mobility values:
 *   - King & Executor: 3 sqm (highest mobility)
 *   - Warrior & Specialist: 2 sqm
 *
 * Design notes:
 *   - Rei: tanque sustain, mobilidade 3
 *   - Guerreiro: altíssimo HP e defesa, mobilidade baixa
 *   - Executor: dano mais alto, fragilíssimo, mobilidade boa
 *   - Especialista: controle e suporte, stats medianos
 */
export const unitStatsByRole: Record<UnitRole, UnitBaseStats> = {
  king: {
    maxHp: 150,
    attack: 15,
    defense: 12,
    mobility: 3,
  },
  warrior: {
    maxHp: 180,
    attack: 16,
    defense: 18,
    mobility: 2,
  },
  specialist: {
    maxHp: 130,
    attack: 18,
    defense: 10,
    mobility: 2,
  },
  executor: {
    maxHp: 120,
    attack: 22,
    defense: 8,
    mobility: 3,
  },
}
