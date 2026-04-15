/**
 * engine/BattleState.ts — the complete mutable state of one battle.
 *
 * This is the single source of truth. The engine reads and writes it;
 * the renderer only reads snapshots emitted via events.
 *
 * No Phaser, no DOM, no external dependencies.
 */

import type {
  UnitDef, UnitRuntime, UnitTurn, UnitDeck, CombatStats,
  PhaseType, TeamSide, RoleStats, UnitDeckConfig, UnitRole,
} from './types'

// ── Board geometry (engine-internal, no UI) ───────────────────────────────────

export const BOARD = {
  COLS:     16,
  ROWS:      6,
  WALL_COL:  8,   // cols 0-7 = left team, cols 8-15 = right team
} as const

export const PHASE_DURATION = {
  movement: 12,    // 3 seconds × 4 characters for solo movement phase
  action:   15,    // 15 seconds per character during action selection (timer per turn)
} as const

// ── State ─────────────────────────────────────────────────────────────────────

export interface BattleState {
  // Unit position is kept inside UnitRuntime (col/row) so a single map
  // holds all mutable unit data. The UnitDef map holds immutable identity.
  defs:    Map<string, UnitDef>
  runtime: Map<string, UnitRuntime>
  turns:   Map<string, UnitTurn>
  decks:   Map<string, UnitDeck>
  stats:   Map<string, CombatStats>

  phase:      PhaseType
  sideIndex:  0 | 1    // 0 = left, 1 = right
  roundNumber: number

  battleOver: boolean
  winner:     TeamSide | null
}

// ── Factory helpers ───────────────────────────────────────────────────────────

export function makeRuntime(def: UnitDef, roleStats: RoleStats): UnitRuntime {
  return {
    col:                 def.col,
    row:                 def.row,
    hp:                  roleStats.maxHp,
    maxHp:               roleStats.maxHp,
    attack:              roleStats.attack,
    defense:             roleStats.defense,
    mobility:            roleStats.mobility,
    shield:              0,
    evadeCharges:        0,
    reflectPower:        0,
    bleedTicks:          0,
    bleedPower:          0,
    regenTicks:          0,
    regenPower:          0,
    stunTicks:           0,
    healReductionTicks:  0,
    healReductionFactor: 0,
    alive:               true,
  }
}

export function makeTurn(): UnitTurn {
  return {
    movedThisPhase:   false,
    actedThisPhase:   false,
    selectedAttackId:  null,
    selectedDefenseId: null,
    selectedTargetId:  null,
    selectedArea:      null,
  }
}

export function makeDeck(config: UnitDeckConfig): UnitDeck {
  return {
    attackQueue:  [...config.attackCards],
    defenseQueue: [...config.defenseCards],
  }
}

export function makeStats(): CombatStats {
  return { damageDealt: 0, damageReceived: 0, healsGiven: 0, kills: 0 }
}

// ── State-level query helpers (pure — no mutation) ────────────────────────────

/** All unit IDs on a given side. */
export function unitsBySide(state: BattleState, side: TeamSide): string[] {
  const ids: string[] = []
  for (const [id, def] of state.defs) {
    if (def.side === side) ids.push(id)
  }
  return ids
}

/** All living unit IDs on a given side. */
export function livingUnitsBySide(state: BattleState, side: TeamSide): string[] {
  return unitsBySide(state, side).filter((id) => state.runtime.get(id)?.alive)
}

/** Opposite side. */
export function oppositeSide(side: TeamSide): TeamSide {
  return side === 'left' ? 'right' : 'left'
}

/** Current side as TeamSide. */
export function currentSide(state: BattleState): TeamSide {
  return state.sideIndex === 0 ? 'left' : 'right'
}

/** True if all living units on the current side have completed their turn. */
export function allUnitsActed(state: BattleState): boolean {
  const side = currentSide(state)
  for (const id of livingUnitsBySide(state, side)) {
    const turn = state.turns.get(id)
    if (state.phase === 'movement' && !turn?.movedThisPhase) return false
    if (state.phase === 'action'   && !turn?.actedThisPhase)  return false
  }
  return true
}

/** Reset turn flags for all units on a given side (called at phase start). */
export function resetTurns(state: BattleState, side: TeamSide): void {
  for (const id of unitsBySide(state, side)) {
    const turn = state.turns.get(id)
    if (!turn) continue
    turn.movedThisPhase    = false
    turn.actedThisPhase    = false
    turn.selectedAttackId  = null
    turn.selectedDefenseId = null
    turn.selectedTargetId  = null
    turn.selectedArea      = null
  }
}

/** Role execution order for combat resolution. */
export const ROLE_ORDER: UnitRole[] = ['king', 'warrior', 'executor', 'specialist']

/** Units on `side` sorted by ROLE_ORDER, living only. */
export function unitsInRoleOrder(state: BattleState, side: TeamSide): UnitDef[] {
  const living = livingUnitsBySide(state, side)
  return ROLE_ORDER
    .map((role) => living.find((id) => state.defs.get(id)?.role === role))
    .filter((id): id is string => id !== undefined)
    .map((id) => state.defs.get(id)!)
}
