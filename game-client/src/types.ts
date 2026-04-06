export type TeamSide = 'left' | 'right'
export type UnitRole = 'tank' | 'king' | 'healer' | 'dps'
export type PhaseType = 'movement' | 'action'
export type CardCategory = 'attack' | 'defense'
export type CardGroup = 'attack1' | 'attack2' | 'defense1' | 'defense2'

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

export interface CardData {
  id: string
  name: string
  category: CardCategory
  group: CardGroup
  shortDescription: string
  power: number
  effect: 'damage' | 'heal' | 'shield' | 'bleed' | 'stun' | 'evade' | 'reflect' | 'regen' | 'area'
}

export interface UnitBaseStats {
  maxHp: number
  attack: number
  defense: number
  mobility: number
}
