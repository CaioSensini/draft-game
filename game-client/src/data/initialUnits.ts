import type { UnitData } from '../types'

export const initialUnits: UnitData[] = [
  // Left (Blue) — spread across cols 0-3 for positional depth
  { id: 'left-king',       name: 'Rei Azul',           role: 'king',       side: 'left',  col: 1, row: 2, color: 0xf4d35e, symbol: 'R' },
  { id: 'left-warrior',    name: 'Guerreiro Azul',      role: 'warrior',    side: 'left',  col: 2, row: 4, color: 0x4f7cff, symbol: 'G' },
  { id: 'left-specialist', name: 'Especialista Azul',   role: 'specialist', side: 'left',  col: 0, row: 5, color: 0x6ee7b7, symbol: 'E' },
  { id: 'left-executor',   name: 'Executor Azul',       role: 'executor',   side: 'left',  col: 3, row: 1, color: 0xff6b6b, symbol: 'X' },

  // Right (Red) — mirrored formation
  { id: 'right-king',       name: 'Rei Vermelho',         role: 'king',       side: 'right', col: 14, row: 3, color: 0xf4d35e, symbol: 'R' },
  { id: 'right-warrior',    name: 'Guerreiro Vermelho',    role: 'warrior',    side: 'right', col: 13, row: 1, color: 0x4f7cff, symbol: 'G' },
  { id: 'right-specialist', name: 'Especialista Vermelho', role: 'specialist', side: 'right', col: 15, row: 0, color: 0x6ee7b7, symbol: 'E' },
  { id: 'right-executor',   name: 'Executor Vermelho',     role: 'executor',   side: 'right', col: 12, row: 4, color: 0xff6b6b, symbol: 'X' },
]
