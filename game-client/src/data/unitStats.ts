import type { UnitBaseStats, UnitRole } from '../types'

export const unitStatsByRole: Record<UnitRole, UnitBaseStats> = {
  king: {
    maxHp: 112,
    attack: 18,
    defense: 10,
    mobility: 99
  },
  warrior: {
    maxHp: 138,
    attack: 17,
    defense: 16,
    mobility: 2
  },
  specialist: {
    maxHp: 94,
    attack: 20,
    defense: 8,
    mobility: 2
  },
  executor: {
    maxHp: 90,
    attack: 27,
    defense: 7,
    mobility: 3
  }
}
