export type TeamSide = 'left' | 'right'
export type UnitRole = 'warrior' | 'king' | 'specialist' | 'executor'
export type PhaseType = 'movement' | 'action'
export type CardCategory = 'attack' | 'defense'
export type CardGroup = 'attack1' | 'attack2' | 'defense1' | 'defense2'
export type CardTargetType = 'single' | 'self' | 'lowest_ally' | 'all_allies' | 'area'

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
  targetType: CardTargetType
}

export interface UnitBaseStats {
  maxHp: number
  attack: number
  defense: number
  mobility: number
}
