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
 * Runtime state for a unit in the current battle
 * Tracks health, status effects, and special mechanics
 */
export interface RuntimeState {
  id: string
  hp: number
  maxHp: number
  alive: boolean
  shield: number
  bleedTicks: number
  bleedPower: number
  stunTicks: number
  healReduction: number
  evadePower: number
  reflectPower: number
  regenPower: number
}

/**
 * Unit progress tracking for turn phases
 */
export interface UnitProgress {
  unitId: string
  moved: boolean
  acted: boolean
  selectedCard: CardData | null
  selectedTarget: string | { col: number; row: number } | null
}

/**
 * Unit visual representation
 */
export interface UnitVisual {
  container: Phaser.GameObjects.Container
  healthBar: Phaser.GameObjects.Rectangle
  healthFill: Phaser.GameObjects.Rectangle
  statusText: Phaser.GameObjects.Text
  symbol: Phaser.GameObjects.Text
}

/**
 * Unit deck rotation for card cycling
 */
export interface UnitDeck {
  unitId: string
  allCards: CardData[]
  currentIndex: number
  availableCards: CardData[]
}

/**
 * Pending target selection state
 */
export interface PendingTargetSelection {
  unitId: string
  card: CardData
  mode: 'unit' | 'tile' | 'none'
}
