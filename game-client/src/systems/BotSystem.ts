import type { CardData, UnitData, UnitRole } from '../types'
import type { RuntimeState } from '../entities/Unit'
import { MovementSystem } from './MovementSystem'
import { BOARD } from '../data/constants'

const { COLS, ROWS } = BOARD

/**
 * BotSystem — stateless bot AI: movement scoring and card selection.
 *
 * All methods are pure functions over the unit maps; no Phaser or
 * scene state is accessed, making the AI independently testable.
 */
export class BotSystem {
  // ── Movement ────────────────────────────────────────────────────────────

  /**
   * Score a candidate tile (col, row) for `unit`.
   * Higher scores are preferred by the bot.
   * Role-specific heuristics:
   *  - King:       approach wall from behind, stay centred
   *  - Warrior:    close in on enemies aggressively
   *  - Executor:   target the weakest enemy
   *  - Specialist: stay near wall, avoid front line
   */
  static scoreMoveTile(
    unit: UnitData,
    col: number,
    row: number,
    enemies: UnitData[],
    unitState: ReadonlyMap<string, RuntimeState>,
  ): number {
    if (enemies.length === 0) return 0

    const minEnemyDist = Math.min(
      ...enemies.map((e) => Math.abs(e.col - col) + Math.abs(e.row - row)),
    )

    switch (unit.role as UnitRole) {
      case 'king':
        return -Math.abs(col - 8) - Math.abs(row - 2) * 0.5

      case 'warrior':
        return -minEnemyDist * 2 + (col === 8 ? 1 : 0)

      case 'executor': {
        const weakest = enemies.reduce((a, b) =>
          (unitState.get(a.id)?.hp ?? 999) < (unitState.get(b.id)?.hp ?? 999) ? a : b,
        )
        return -(Math.abs(weakest.col - col) + Math.abs(weakest.row - row)) * 2
      }

      case 'specialist':
        return -Math.abs(col - 9) - Math.abs(row - 2) * 0.3 - minEnemyDist * 0.5
    }
  }

  /** Pick the highest-scoring valid destination for a bot unit. */
  static findBestMoveDest(
    unit: UnitData,
    unitsById: ReadonlyMap<string, UnitData>,
    unitState: ReadonlyMap<string, RuntimeState>,
  ): { col: number; row: number } | null {
    const enemies = [...unitsById.values()].filter(
      (u) => u.side !== unit.side && (unitState.get(u.id)?.alive ?? false),
    )

    let bestScore = -Infinity
    let bestDest:  { col: number; row: number } | null = null

    for (let col = 8; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        if (!MovementSystem.isMoveAllowed(unit, col, row, unitsById, unitState)) continue
        const score = BotSystem.scoreMoveTile(unit, col, row, enemies, unitState)
        if (score > bestScore) { bestScore = score; bestDest = { col, row } }
      }
    }
    return bestDest
  }

  // ── Action selection ─────────────────────────────────────────────────────

  /**
   * Pick the best attack card + target given the bot's difficulty.
   *
   * Hard mode: if a kill-shot on the enemy king is possible, take it.
   * Normal/Hard fallback: attempt to finish off the weakest enemy.
   * Easy: always use the first card in queue.
   */
  static pickAttack(
    unit: UnitData,
    enemies: UnitData[],
    atkCards: CardData[],
    unitState: ReadonlyMap<string, RuntimeState>,
    difficulty: 'easy' | 'normal' | 'hard',
  ): { card: CardData; target: UnitData } | null {
    if (atkCards.length === 0 || enemies.length === 0) return null
    const state = unitState.get(unit.id)
    if (!state) return null

    if (difficulty === 'easy') {
      const target = enemies[Math.floor(Math.random() * enemies.length)]
      return { card: atkCards[0], target }
    }

    const weakest   = enemies.reduce((a, b) =>
      (unitState.get(a.id)?.hp ?? 9999) <= (unitState.get(b.id)?.hp ?? 9999) ? a : b)
    const weakestHp = unitState.get(weakest.id)?.hp ?? 9999

    const enemyKing = enemies.find((e) => e.role === 'king')
    const kingHp    = enemyKing ? (unitState.get(enemyKing.id)?.hp ?? 9999) : 9999

    const estDmg = (c: CardData) => Math.round(c.power * (state.attack / 50))

    // Hard mode: kill-shot on king first
    const kingKill = difficulty === 'hard' && enemyKing
      ? atkCards.find((c) => estDmg(c) >= kingHp)
      : null
    const weakKill = atkCards.find((c) => estDmg(c) >= weakestHp)
    const best     = kingKill ?? weakKill ?? atkCards[0]

    const target = kingKill && enemyKing ? enemyKing : weakKill ? weakest
      : enemies.reduce((a, b) => {
          const da = Math.abs(a.col - unit.col) + Math.abs(a.row - unit.row)
          const db = Math.abs(b.col - unit.col) + Math.abs(b.row - unit.row)
          return da <= db ? a : b
        })

    return { card: best, target }
  }

  /**
   * Pick the best defense card given the unit's current situation.
   * Low HP → prefer regen/heal.
   * No shield → prefer shield/evade.
   * Otherwise → queue[0].
   */
  static pickDefense(
    defCards: CardData[],
    state: RuntimeState,
  ): CardData | null {
    if (defCards.length === 0) return null
    const hpRatio = state.hp / state.maxHp

    if (hpRatio < 0.35)
      return defCards.find((c) => c.effect === 'regen' || c.effect === 'heal') ?? defCards[0]
    if (state.shield === 0 && state.evadeCharges === 0)
      return defCards.find((c) => c.effect === 'shield' || c.effect === 'evade') ?? defCards[0]
    return defCards[0]
  }
}
