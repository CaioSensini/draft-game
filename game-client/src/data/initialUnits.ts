import type { UnitData } from '../types'

export const initialUnits: UnitData[] = [
  { id: 'left-warrior', name: 'Guerreiro Azul', role: 'warrior', side: 'left', col: 1, row: 4, color: 0x4f7cff, symbol: 'G' },
  { id: 'left-king', name: 'Rei Azul', role: 'king', side: 'left', col: 1, row: 3, color: 0xf4d35e, symbol: 'R' },
  { id: 'left-specialist', name: 'Especialista Azul', role: 'specialist', side: 'left', col: 1, row: 2, color: 0x6ee7b7, symbol: 'E' },
  { id: 'left-executor', name: 'Executor Azul', role: 'executor', side: 'left', col: 1, row: 1, color: 0xff6b6b, symbol: 'X' },

  { id: 'right-warrior', name: 'Guerreiro Vermelho', role: 'warrior', side: 'right', col: 14, row: 1, color: 0x4f7cff, symbol: 'G' },
  { id: 'right-king', name: 'Rei Vermelho', role: 'king', side: 'right', col: 14, row: 2, color: 0xf4d35e, symbol: 'R' },
  { id: 'right-specialist', name: 'Especialista Vermelho', role: 'specialist', side: 'right', col: 14, row: 3, color: 0x6ee7b7, symbol: 'E' },
  { id: 'right-executor', name: 'Executor Vermelho', role: 'executor', side: 'right', col: 14, row: 4, color: 0xff6b6b, symbol: 'X' }
]
