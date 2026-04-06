export type TeamSide = 'left' | 'right'
export type UnitRole = 'tank' | 'king' | 'healer' | 'dps'

export interface UnitData {
  id: string
  name: string
  role: UnitRole
  side: TeamSide
  col: number
  row: number
  color: number
  symbol: string
}
