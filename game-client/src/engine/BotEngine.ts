/**
 * engine/BotEngine.ts — deterministic AI decisions over pure BattleState.
 *
 * All functions are side-effect free: they receive state and return
 * decisions (move targets, card IDs, target IDs). Applying those
 * decisions is GameEngine's responsibility.
 *
 * No Phaser, no DOM, no external dependencies.
 */

import type { BotDifficulty, CardDef, Position, TeamSide } from './types'
import type { BattleState } from './BattleState'
import { livingUnitsBySide, ROLE_ORDER } from './BattleState'
import { getAllValidMoves, scoreTile } from './MovementEngine'
import { currentAttackHand, currentDefenseHand } from './ActionEngine'
import { getUnitsInArea } from './CombatCalc'

// ── Move decisions ────────────────────────────────────────────────────────────

export interface MoveDecision {
  unitId: string
  col:    number
  row:    number
}

/**
 * Decide the best move for every unit on the bot's side.
 * Returns one MoveDecision per unit that has a valid destination.
 */
export function decideMoves(
  state: BattleState,
  side: TeamSide,
): MoveDecision[] {
  const decisions: MoveDecision[] = []

  for (const id of livingUnitsBySide(state, side)) {
    const valid = getAllValidMoves(state, id)
    if (valid.length === 0) continue

    let bestScore = -Infinity
    let bestPos: Position = valid[0]

    for (const pos of valid) {
      const score = scoreTile(state, id, pos.col, pos.row)
      if (score > bestScore) { bestScore = score; bestPos = pos }
    }

    decisions.push({ unitId: id, col: bestPos.col, row: bestPos.row })
  }

  return decisions
}

// ── Action decisions ──────────────────────────────────────────────────────────

export type TargetKind =
  | { kind: 'unit';  targetId: string }
  | { kind: 'area';  col: number; row: number }
  | { kind: 'self' }
  | { kind: 'lowest_ally' }
  | { kind: 'none' }

export interface ActionDecision {
  unitId:    string
  attackId:  string | null
  defenseId: string | null
  target:    TargetKind
}

/**
 * Decide attack + defense cards and targeting for every unit on `side`.
 * Difficulty affects the heuristic used to pick targets.
 */
export function decideActions(
  state: BattleState,
  side: TeamSide,
  difficulty: BotDifficulty,
  cardRegistry: ReadonlyMap<string, CardDef>,
): ActionDecision[] {
  const decisions: ActionDecision[] = []
  const enemySide: TeamSide = side === 'left' ? 'right' : 'left'
  const enemies = livingUnitsBySide(state, enemySide)

  // Process in role order for consistency
  const ordered = ROLE_ORDER
    .map((role) =>
      livingUnitsBySide(state, side).find((id) => state.defs.get(id)?.role === role),
    )
    .filter((id): id is string => id !== undefined)

  for (const unitId of ordered) {
    const rt = state.runtime.get(unitId)
    if (!rt?.alive) continue

    const atkHand = currentAttackHand(state, unitId)
      .map((id) => cardRegistry.get(id))
      .filter((c): c is CardDef => c !== undefined)

    const defHand = currentDefenseHand(state, unitId)
      .map((id) => cardRegistry.get(id))
      .filter((c): c is CardDef => c !== undefined)

    const attackCard  = pickAttackCard(state, unitId, atkHand, enemies, difficulty, cardRegistry)
    const defenseCard = pickDefenseCard(defHand, rt.hp / rt.maxHp, rt.shield, rt.evadeCharges)
    const target      = attackCard
      ? pickTarget(state, unitId, attackCard, enemies, difficulty)
      : { kind: 'none' as const }

    decisions.push({
      unitId,
      attackId:  attackCard?.id  ?? null,
      defenseId: defenseCard?.id ?? null,
      target,
    })
  }

  return decisions
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function pickAttackCard(
  state: BattleState,
  unitId: string,
  hand: CardDef[],
  enemies: string[],
  difficulty: BotDifficulty,
  _registry: ReadonlyMap<string, CardDef>,
): CardDef | null {
  if (hand.length === 0 || enemies.length === 0) return null
  if (difficulty === 'easy') return hand[0]

  const rt       = state.runtime.get(unitId)
  if (!rt) return hand[0]

  const estDmg = (c: CardDef) => Math.round(c.power * (rt.attack / 50))

  // Hard: try for a king kill first
  if (difficulty === 'hard') {
    const kingId = enemies.find((id) => state.defs.get(id)?.role === 'king')
    if (kingId) {
      const kingHp = state.runtime.get(kingId)?.hp ?? Infinity
      const killer = hand.find((c) => estDmg(c) >= kingHp)
      if (killer) return killer
    }
  }

  // Normal + Hard: try to finish off the weakest enemy
  const weakestId = enemies.reduce((a, b) =>
    (state.runtime.get(a)?.hp ?? Infinity) <= (state.runtime.get(b)?.hp ?? Infinity) ? a : b,
  )
  const weakestHp = state.runtime.get(weakestId)?.hp ?? Infinity
  const finisher  = hand.find((c) => estDmg(c) >= weakestHp)

  return finisher ?? hand[0]
}

function pickDefenseCard(
  hand: CardDef[],
  hpRatio: number,
  shield: number,
  evadeCharges: number,
): CardDef | null {
  if (hand.length === 0) return null

  if (hpRatio < 0.35) {
    return hand.find((c) => c.effect === 'regen' || c.effect === 'heal') ?? hand[0]
  }
  if (shield === 0 && evadeCharges === 0) {
    return hand.find((c) => c.effect === 'shield' || c.effect === 'evade') ?? hand[0]
  }
  return hand[0]
}

function pickTarget(
  state: BattleState,
  _unitId: string,
  card: CardDef,
  enemies: string[],
  difficulty: BotDifficulty,
): TargetKind {

  switch (card.targetType) {
    case 'self':        return { kind: 'self' }
    case 'lowest_ally': return { kind: 'lowest_ally' }
    case 'all_allies':  return { kind: 'lowest_ally' } // treated as all_allies in ActionEngine

    case 'area': {
      // Pick the tile that hits the most enemies
      const bestTile = pickBestAreaTile(state, enemies)
      return bestTile
        ? { kind: 'area', col: bestTile.col, row: bestTile.row }
        : { kind: 'none' }
    }

    case 'single': {
      if (enemies.length === 0) return { kind: 'none' }

      if (difficulty === 'easy') {
        const randomId = enemies[Math.floor(Math.random() * enemies.length)]
        return { kind: 'unit', targetId: randomId }
      }

      // Hard: target king if possible
      if (difficulty === 'hard') {
        const kingId = enemies.find((id) => state.defs.get(id)?.role === 'king')
        if (kingId) return { kind: 'unit', targetId: kingId }
      }

      // Normal + Hard fallback: weakest enemy
      const weakestId = enemies.reduce((a, b) =>
        (state.runtime.get(a)?.hp ?? Infinity) <= (state.runtime.get(b)?.hp ?? Infinity) ? a : b,
      )
      return { kind: 'unit', targetId: weakestId }
    }

    default:
      return { kind: 'none' }
  }
}

/**
 * Find the tile position that maximises the number of enemies hit in area=1.
 */
function pickBestAreaTile(
  state: BattleState,
  enemyIds: string[],
): Position | null {
  if (enemyIds.length === 0) return null

  // Candidates: positions of enemies themselves (center on each enemy)
  let best: Position | null = null
  let bestCount = 0

  for (const id of enemyIds) {
    const rt = state.runtime.get(id)
    if (!rt) continue

    const enemySide = state.defs.get(id)?.side
    if (!enemySide) continue

    const hitCount = getUnitsInArea(state, rt.col, rt.row, enemySide, 1).length
    if (hitCount > bestCount) { bestCount = hitCount; best = { col: rt.col, row: rt.row } }
  }

  return best
}
