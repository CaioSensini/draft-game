import type { UnitData } from '../types'

export const initialUnits: UnitData[] = [
  { id: 'left-tank', name: 'Tank', role: 'tank', side: 'left', col: 1, row: 4, color: 0x4f7cff, symbol: 'T' },
  { id: 'left-king', name: 'Rei', role: 'king', side: 'left', col: 1, row: 3, color: 0xf4d35e, symbol: 'R' },
  { id: 'left-healer', name: 'Healer', role: 'healer', side: 'left', col: 1, row: 2, color: 0x6ee7b7, symbol: 'H' },
  { id: 'left-dps', name: 'DPS', role: 'dps', side: 'left', col: 1, row: 1, color: 0xff6b6b, symbol: 'D' },

  { id: 'right-tank', name: 'Tank', role: 'tank', side: 'right', col: 14, row: 1, color: 0x4f7cff, symbol: 'T' },
  { id: 'right-king', name: 'Rei', role: 'king', side: 'right', col: 14, row: 2, color: 0xf4d35e, symbol: 'R' },
  { id: 'right-healer', name: 'Healer', role: 'healer', side: 'right', col: 14, row: 3, color: 0x6ee7b7, symbol: 'H' },
  { id: 'right-dps', name: 'DPS', role: 'dps', side: 'right', col: 14, row: 4, color: 0xff6b6b, symbol: 'D' }
]
