import type { UnitBaseStats, UnitRole } from '../types'

/**
 * Base stats per role — balanced via simulation (1000+ battles).
 *
 * Design targets:
 *   - Battles should last 10-15 rounds
 *   - Win rate ~50/50 between sides
 *   - Each class has a clear role without being OP
 */
export const unitStatsByRole: Record<UnitRole, UnitBaseStats> = {
  king: {
    maxHp: 180,
    attack: 15,
    defense: 15,
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
    attack: 20,
    defense: 10,
    mobility: 2,
  },
  executor: {
    maxHp: 120,
    attack: 18,
    defense: 8,
    mobility: 3,
  },
}
