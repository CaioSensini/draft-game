/**
 * Entity types for runtime unit state.
 *
 * These types represent the mutable game state of each unit during a battle.
 * They are separate from the static UnitData definition (in types.ts) which
 * describes identity and board position.
 */

/** Full combat stats and status effects for a unit during a battle. */
export type RuntimeState = {
  hp: number
  maxHp: number
  attack: number
  defense: number
  mobility: number
  shield: number
  evadeCharges: number
  reflectPower: number
  bleedTicks: number
  bleedPower: number
  regenTicks: number
  regenPower: number
  stunTicks: number
  healReductionTicks: number
  healReductionFactor: number
  alive: boolean
}

/** Phase-level tracking for a single unit's actions in the current turn. */
export type UnitProgress = {
  movedThisPhase: boolean
  actedThisPhase: boolean
  selectedAttackId: string | null
  selectedDefenseId: string | null
  selectedTargetUnitId: string | null
  selectedArea: { col: number; row: number } | null
}

/** Rotating card queues for attack and defense. */
export type UnitDeck = {
  attackQueue: string[]
  defenseQueue: string[]
}

/** Accumulated statistics for a unit over the course of a battle. */
export type CombatStats = {
  damageDealt: number
  damageReceived: number
  healsGiven: number
  kills: number
}

/** Construct a default (zero) CombatStats object. */
export function createCombatStats(): CombatStats {
  return { damageDealt: 0, damageReceived: 0, healsGiven: 0, kills: 0 }
}
