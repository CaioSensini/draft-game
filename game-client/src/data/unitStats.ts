import type { UnitBaseStats, UnitRole } from '../types'

export const unitStatsByRole: Record<UnitRole, UnitBaseStats> = {
  king: {
    maxHp: 110,
    attack: 18,
    defense: 10,
    mobility: 99
  },
  tank: {
    maxHp: 135,
    attack: 16,
    defense: 16,
    mobility: 2
  },
  healer: {
    maxHp: 92,
    attack: 20,
    defense: 8,
    mobility: 2
  },
  dps: {
    maxHp: 88,
    attack: 26,
    defense: 7,
    mobility: 3
  }
}
