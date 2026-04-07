export type TeamSide = 'left' | 'right'
export type UnitRole = 'warrior' | 'king' | 'specialist' | 'executor'
export type PhaseType = 'movement' | 'action'
export type CardCategory = 'attack' | 'defense'
export type CardGroup = 'attack1' | 'attack2' | 'defense1' | 'defense2'
export type CardTargetType = 'single' | 'self' | 'lowest_ally' | 'all_allies' | 'area'
export type CardEffect = 'damage' | 'heal' | 'shield' | 'bleed' | 'stun' | 'evade' | 'reflect' | 'regen' | 'area'
export type GamePhase = 'movement' | 'action'
export type BattleStatus = 'active' | 'ended'

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
  effect: CardEffect
  targetType: CardTargetType
}

export interface UnitBaseStats {
  maxHp: number
  attack: number
  defense: number
  mobility: number
}

export interface UnitLevelData {
  level: number
  experienceRequired: number
  statMultiplier: number
  goldReward: number
  dgReward: number
}

/**
 * Selected deck for a single unit:
 *   attackCards  — 4 IDs (exactly 2 from attack1 + 2 from attack2)
 *   defenseCards — 4 IDs (exactly 2 from defense1 + 2 from defense2)
 */
export interface UnitDeckConfig {
  attackCards: string[]
  defenseCards: string[]
}

/** Full team deck config, one entry per role. */
export type TeamDeckConfig = Record<UnitRole, UnitDeckConfig>

