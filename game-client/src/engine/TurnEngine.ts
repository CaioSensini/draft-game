/**
 * engine/TurnEngine.ts — phase and round lifecycle management.
 *
 * Responsible for:
 *   - Starting / ending the movement and action phases.
 *   - Triggering action resolution in role order.
 *   - Ticking status effects at end of each action phase.
 *   - Advancing the round and checking for battle-end conditions.
 *
 * No Phaser, no DOM, no external dependencies.
 */

import type { CardDef, EngineEvent, PhaseType, TeamSide } from './types'
import { EventType } from './types'
import type { BattleState } from './BattleState'
import {
  currentSide,
  livingUnitsBySide,
  resetTurns,
  unitsInRoleOrder,
  PHASE_DURATION,
} from './BattleState'
import { resolveUnitAction } from './ActionEngine'
import { tickStatusEffects } from './CombatCalc'

// ── Phase start ───────────────────────────────────────────────────────────────

/**
 * Begin a phase for the current side.
 * Resets turn flags and emits `phase_started`.
 */
export function startPhase(
  state: BattleState,
  phase: PhaseType,
  phaseDurations: { movement: number; action: number } = PHASE_DURATION,
): EngineEvent[] {
  state.phase = phase
  const side     = currentSide(state)
  const duration = phaseDurations[phase]

  resetTurns(state, side)

  return [{ type: EventType.PHASE_STARTED, phase, side, duration }]
}

// ── Phase end / advancement ───────────────────────────────────────────────────

/**
 * End the current phase and advance to the next state:
 *
 *   movement (left)  → action (left)
 *   action   (left)  → [resolve left] → movement (right)
 *   movement (right) → action (right)
 *   action   (right) → [resolve right] → tick statuses → new round → movement (left)
 *
 * Returns all events produced (phase transitions + combat resolution).
 */
export function endPhase(
  state: BattleState,
  cardRegistry: ReadonlyMap<string, CardDef>,
  phaseDurations: { movement: number; action: number } = PHASE_DURATION,
): EngineEvent[] {
  const events: EngineEvent[] = []
  const side = currentSide(state)

  events.push({ type: EventType.PHASE_ENDED, phase: state.phase, side })

  if (state.phase === 'movement') {
    // Movement → action (same side)
    events.push(...startPhase(state, 'action', phaseDurations))

  } else {
    // Action phase ends → resolve actions for this side
    events.push(...resolveAllActions(state, side, cardRegistry))
    events.push({ type: EventType.ACTIONS_RESOLVED, side })

    // Check win condition after resolution
    const battleEndEvents = checkBattleEnd(state)
    if (battleEndEvents.length > 0) {
      events.push(...battleEndEvents)
      return events
    }

    if (state.sideIndex === 0) {
      // Left side done → switch to right
      state.sideIndex = 1
      events.push(...startPhase(state, 'movement', phaseDurations))
    } else {
      // Right side done → tick statuses → new round → back to left
      events.push(...tickAllStatuses(state))

      // Another win check after DoT ticks
      const afterTickEnd = checkBattleEnd(state)
      if (afterTickEnd.length > 0) {
        events.push(...afterTickEnd)
        return events
      }

      state.sideIndex  = 0
      state.roundNumber++
      events.push({ type: EventType.ROUND_STARTED, round: state.roundNumber })
      events.push(...startPhase(state, 'movement', phaseDurations))
    }
  }

  return events
}

// ── Action resolution ─────────────────────────────────────────────────────────

/**
 * Resolve every living unit on `side` in role order.
 * Returns all combat events produced.
 */
export function resolveAllActions(
  state: BattleState,
  side: TeamSide,
  cardRegistry: ReadonlyMap<string, CardDef>,
): EngineEvent[] {
  const events: EngineEvent[] = []
  for (const def of unitsInRoleOrder(state, side)) {
    events.push(...resolveUnitAction(state, def.id, cardRegistry))
  }
  return events
}

// ── Status tick ───────────────────────────────────────────────────────────────

/** Tick bleed, regen, stun, and heal-reduction for all living units. */
function tickAllStatuses(state: BattleState): EngineEvent[] {
  const events: EngineEvent[] = []
  for (const [id] of state.runtime) {
    events.push(...tickStatusEffects(state, id))
  }
  return events
}

// ── Win condition ─────────────────────────────────────────────────────────────

/**
 * Check if either king is dead.
 * If so, mark battle as over and return `battle_ended` event.
 */
export function checkBattleEnd(state: BattleState): EngineEvent[] {
  const leftKingAlive  = isKingAlive(state, 'left')
  const rightKingAlive = isKingAlive(state, 'right')

  if (leftKingAlive && rightKingAlive) return []

  // At least one king is dead
  let winner: TeamSide
  if (leftKingAlive && !rightKingAlive)       winner = 'left'
  else if (!leftKingAlive && rightKingAlive)  winner = 'right'
  else {
    // Both kings dead simultaneously — side that caused last damage wins
    // Default to left (rare edge case)
    winner = 'left'
  }

  state.battleOver = true
  state.winner     = winner

  const bothDead = !leftKingAlive && !rightKingAlive
  return [{
    type:   'BATTLE_ENDED',
    winner: bothDead ? null : winner,
    reason: bothDead ? 'simultaneous_kings' : 'king_slain',
    round:  state.roundNumber,
  }]
}

function isKingAlive(state: BattleState, side: TeamSide): boolean {
  for (const [id, def] of state.defs) {
    if (def.side === side && def.role === 'king') {
      return state.runtime.get(id)?.alive ?? false
    }
  }
  return false
}

/** True if all living units on the current side have completed the current phase. */
export function isCurrentSideDone(state: BattleState): boolean {
  const side = currentSide(state)
  const living = livingUnitsBySide(state, side)
  if (living.length === 0) return true

  for (const id of living) {
    const turn = state.turns.get(id)
    if (!turn) continue
    if (state.phase === 'movement' && !turn.movedThisPhase) return false
    if (state.phase === 'action'   && !turn.actedThisPhase)  return false
  }
  return true
}
