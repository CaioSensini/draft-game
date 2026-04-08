/**
 * engine/ActionEngine.ts — card selection, validation, and effect resolution.
 *
 * Two distinct responsibilities:
 *   1. Player commands: selectCard, selectTarget, selectArea — validate and
 *      record the player's intent in UnitTurn.
 *   2. Resolution: resolveUnitAction — execute the stored intent, apply
 *      effects via CombatEngine, and return events.
 *
 * No Phaser, no DOM, no external dependencies.
 */

import type { CardDef, CardTargetType, EngineEvent, TeamSide } from './types'
import type { BattleState } from './BattleState'
import { Ok, Err } from './types'
import type { Result } from './types'
import {
  computeDamage,
  computeHeal,
  applyDamage,
  applyReflect,
  applyHeal,
  applyShield,
  applyBleed,
  applyStun,
  applyEvade,
  applyReflectBuff,
  applyRegen,
  applyHealReduction,
  getUnitsInArea,
  findLowestHpAlly,
} from './CombatCalc'

// ── Card selection ────────────────────────────────────────────────────────────

/**
 * Record that `unitId` wants to use `cardId` this action phase.
 * Validates the card is in the unit's current hand and that it belongs
 * to the correct category (attack/defense).
 */
export function selectCard(
  state: BattleState,
  unitId: string,
  cardId: string,
  cardRegistry: ReadonlyMap<string, CardDef>,
): Result<EngineEvent[]> {
  const rt   = state.runtime.get(unitId)
  const turn = state.turns.get(unitId)
  const deck = state.decks.get(unitId)

  if (!rt?.alive)            return Err('Unit is not alive')
  if (!turn || !deck)        return Err('Unit has no turn/deck data')
  if (rt.stunTicks > 0)      return Err('Unit is stunned')
  if (turn.actedThisPhase)   return Err('Unit already acted this phase')

  const card = cardRegistry.get(cardId)
  if (!card)                 return Err(`Card '${cardId}' not found in registry`)

  // Verify card is in current hand
  const inHand =
    card.category === 'attack'
      ? deck.attackQueue.slice(0, 2).includes(cardId)
      : deck.defenseQueue.slice(0, 2).includes(cardId)

  if (!inHand) return Err(`Card '${cardId}' is not in the current hand`)

  if (card.category === 'attack') {
    turn.selectedAttackId = cardId
  } else {
    turn.selectedDefenseId = cardId
  }

  const events: EngineEvent[] = [
    { type: 'CARD_SELECTED', unitId, cardId, category: card.category },
  ]
  return Ok(events)
}

/**
 * Record a unit target for a 'single' or 'lowest_ally' card.
 * Validates the target exists and is on the correct side.
 */
export function selectTarget(
  state: BattleState,
  unitId: string,
  targetId: string,
  cardRegistry: ReadonlyMap<string, CardDef>,
): Result<EngineEvent[]> {
  const turn    = state.turns.get(unitId)
  const unitDef = state.defs.get(unitId)

  if (!turn || !unitDef) return Err('Unit not found')

  const cardId = turn.selectedAttackId
  if (!cardId)           return Err('No attack card selected')

  const card = cardRegistry.get(cardId)
  if (!card)             return Err('Selected card not found in registry')

  if (card.targetType !== 'single') return Err('Card does not target a single unit')

  const targetDef = state.defs.get(targetId)
  const targetRt  = state.runtime.get(targetId)

  if (!targetDef || !targetRt?.alive) return Err('Target is not a living unit')

  // Attack cards must target enemies; heal cards target allies
  const expectedSide: TeamSide =
    card.effect === 'heal' || card.effect === 'regen'
      ? unitDef.side
      : (unitDef.side === 'left' ? 'right' : 'left')

  if (targetDef.side !== expectedSide) return Err('Invalid target side')

  turn.selectedTargetId = targetId
  return Ok([{ type: 'TARGET_SELECTED', unitId, targetId }])
}

/**
 * Record an area target (tile position) for an 'area' card.
 */
export function selectArea(
  state: BattleState,
  unitId: string,
  col: number,
  row: number,
  cardRegistry: ReadonlyMap<string, CardDef>,
): Result<EngineEvent[]> {
  const turn    = state.turns.get(unitId)
  const unitDef = state.defs.get(unitId)

  if (!turn || !unitDef) return Err('Unit not found')

  const cardId = turn.selectedAttackId
  if (!cardId)           return Err('No attack card selected')

  const card = cardRegistry.get(cardId)
  if (!card)             return Err('Selected card not found in registry')

  if (card.targetType !== 'area') return Err('Card does not target an area')

  turn.selectedArea = { col, row }
  return Ok([{ type: 'AREA_TARGET_SET', unitId, col, row }])
}

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Execute the stored action for `unitId`:
 *   1. Apply the defense card effect to self.
 *   2. Apply the attack card effect to target(s).
 *   3. Rotate used cards to the back of their queues.
 *   4. Mark unit as having acted.
 *
 * Returns all events produced.
 */
export function resolveUnitAction(
  state: BattleState,
  unitId: string,
  cardRegistry: ReadonlyMap<string, CardDef>,
): EngineEvent[] {
  const rt      = state.runtime.get(unitId)
  const turn    = state.turns.get(unitId)
  const deck    = state.decks.get(unitId)
  const unitDef = state.defs.get(unitId)

  if (!rt?.alive || !turn || !deck || !unitDef) return []
  if (rt.stunTicks > 0) {
    // Stunned: consume stun tick, skip action
    rt.stunTicks = Math.max(0, rt.stunTicks - 1)
    turn.actedThisPhase = true
    return []
  }

  const events: EngineEvent[] = []

  // ── Defense card ──────────────────────────────────────────────────────────
  if (turn.selectedDefenseId) {
    const card = cardRegistry.get(turn.selectedDefenseId)
    if (card) {
      events.push(...resolveDefenseCard(state, unitId, card))
      events.push(...rotateCard(state, unitId, turn.selectedDefenseId, 'defense'))
    }
  }

  // ── Attack card ───────────────────────────────────────────────────────────
  if (turn.selectedAttackId) {
    const card = cardRegistry.get(turn.selectedAttackId)
    if (card) {
      events.push(...resolveAttackCard(state, unitId, card, turn, cardRegistry))
      events.push(...rotateCard(state, unitId, turn.selectedAttackId, 'attack'))
    }
  }

  turn.actedThisPhase = true
  return events
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function resolveDefenseCard(
  state: BattleState,
  unitId: string,
  card: CardDef,
): EngineEvent[] {
  switch (card.effect) {
    case 'shield':  return applyShield(state, unitId, card.power)
    case 'evade':   return applyEvade(state, unitId, 1)
    case 'reflect': return applyReflectBuff(state, unitId, card.power)
    case 'regen':   return applyRegen(state, unitId, card.power)
    case 'heal':    {
      const amount = computeHeal(state, unitId, card.power)
      return applyHeal(state, unitId, amount, null)
    }
    default:        return []
  }
}

function resolveAttackCard(
  state: BattleState,
  casterId: string,
  card: CardDef,
  turn: import('./BattleState').BattleState['turns'] extends Map<string, infer T> ? T : never,
  _cardRegistry: ReadonlyMap<string, CardDef>,
): EngineEvent[] {
  const casterDef = state.defs.get(casterId)
  if (!casterDef) return []

  const events: EngineEvent[] = []
  const enemySide: TeamSide = casterDef.side === 'left' ? 'right' : 'left'

  switch (card.targetType as CardTargetType) {

    case 'single': {
      const targetId = turn.selectedTargetId
      if (!targetId) return []
      events.push(...resolveSingleHit(state, casterId, targetId, card, enemySide))
      break
    }

    case 'area': {
      const area = turn.selectedArea
      if (!area) return []
      const hitIds = getUnitsInArea(state, area.col, area.row, enemySide, 1)
      for (const targetId of hitIds) {
        events.push(...resolveSingleHit(state, casterId, targetId, card, enemySide))
      }
      if (hitIds.length > 0) {
        events.push({ type: 'AREA_RESOLVED', centerCol: area.col, centerRow: area.row, hitIds })
      }
      break
    }

    case 'lowest_ally': {
      const targetId = findLowestHpAlly(state, casterDef.side)
      if (!targetId) return []
      const amount = computeHeal(state, targetId, card.power)
      events.push(...applyHeal(state, targetId, amount, casterId))
      break
    }

    case 'all_allies': {
      for (const [id, def] of state.defs) {
        if (def.side !== casterDef.side) continue
        const rt = state.runtime.get(id)
        if (!rt?.alive) continue
        const amount = computeHeal(state, id, card.power)
        events.push(...applyHeal(state, id, amount, casterId))
      }
      break
    }

    case 'self': {
      // Defense-as-attack (e.g. regen on self) — handled in defense card path
      break
    }
  }

  return events
}

function resolveSingleHit(
  state: BattleState,
  casterId: string,
  targetId: string,
  card: CardDef,
  _enemySide: TeamSide,
): EngineEvent[] {
  const events: EngineEvent[] = []

  const targetRt = state.runtime.get(targetId)
  if (!targetRt?.alive) return []

  switch (card.effect) {
    case 'damage':
    case 'area': {
      const dmg = computeDamage(state, casterId, targetId, card.power)
      events.push(...applyReflect(state, targetId, casterId))
      events.push(...applyDamage(state, targetId, dmg, casterId))

      // Specialist passive: hit applies heal reduction
      const casterDef = state.defs.get(casterId)
      if (casterDef?.role === 'specialist') {
        applyHealReduction(state, targetId)
      }

      // Track kill for stats
      if (!state.runtime.get(targetId)?.alive) {
        const casterStats = state.stats.get(casterId)
        if (casterStats) casterStats.kills++
      }

      // Track damage stats
      const casterStats = state.stats.get(casterId)
      if (casterStats) casterStats.damageDealt += dmg
      const targetStats = state.stats.get(targetId)
      if (targetStats) targetStats.damageReceived += dmg

      break
    }

    case 'bleed': {
      const dmg = computeDamage(state, casterId, targetId, card.power)
      events.push(...applyDamage(state, targetId, dmg, casterId))
      events.push(...applyBleed(state, targetId, Math.max(1, Math.round(card.power * 0.4))))
      break
    }

    case 'stun': {
      if (card.power > 0) {
        const dmg = computeDamage(state, casterId, targetId, card.power)
        events.push(...applyDamage(state, targetId, dmg, casterId))
      }
      events.push(...applyStun(state, targetId))
      break
    }

    case 'heal': {
      const amount = computeHeal(state, targetId, card.power)
      events.push(...applyHeal(state, targetId, amount, casterId))
      break
    }

    default:
      break
  }

  return events
}

/**
 * Rotate a used card to the back of its queue.
 * Returns a `card_rotated` event.
 */
export function rotateCard(
  state: BattleState,
  unitId: string,
  cardId: string,
  category: 'attack' | 'defense',
): EngineEvent[] {
  const deck = state.decks.get(unitId)
  if (!deck) return []

  const queue = category === 'attack' ? deck.attackQueue : deck.defenseQueue
  const idx   = queue.indexOf(cardId)
  if (idx === -1) return []

  queue.splice(idx, 1)
  queue.push(cardId)

  const nextCardId = queue[0] ?? cardId
  return [{ type: 'CARD_ROTATED', unitId, cardId, category, nextCardId }]
}

/** Returns the two card IDs currently at the head of the attack queue. */
export function currentAttackHand(state: BattleState, unitId: string): string[] {
  return state.decks.get(unitId)?.attackQueue.slice(0, 2) ?? []
}

/** Returns the two card IDs currently at the head of the defense queue. */
export function currentDefenseHand(state: BattleState, unitId: string): string[] {
  return state.decks.get(unitId)?.defenseQueue.slice(0, 2) ?? []
}
