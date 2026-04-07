import type { TeamSide, UnitRole } from '../types'

/**
 * Pure grid utility functions.
 * No Phaser or game-state dependencies — safe to use anywhere, including tests.
 */

/** Manhattan distance between two grid positions. */
export function calculateDistance(col1: number, row1: number, col2: number, row2: number): number {
  return Math.abs(col1 - col2) + Math.abs(row1 - row2)
}

/** HP bar colour based on current/max ratio. */
export function getHpBarColor(ratio: number): number {
  if (ratio > 0.55) return 0x22c55e  // green
  if (ratio > 0.25) return 0xf59e0b  // amber
  return 0xef4444                     // red
}

/** Opposite team side. */
export function getOppositeSide(side: TeamSide): TeamSide {
  return side === 'left' ? 'right' : 'left'
}

/** Convert team side to numeric index (0 = left, 1 = right). */
export function sideToIndex(side: TeamSide): 0 | 1 {
  return side === 'left' ? 0 : 1
}

/** Convert numeric index back to team side. */
export function indexToSide(index: 0 | 1): TeamSide {
  return index === 0 ? 'left' : 'right'
}

/** True if `col` falls within the given team's territory. */
export function isInTerritory(col: number, side: TeamSide, wallCol = 8): boolean {
  return side === 'left' ? col < wallCol : col >= wallCol
}

/** Clamp a number between min and max (inclusive). */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Pick a random element from an array. */
export function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

/** Shuffle array (Fisher-Yates, returns new array). */
export function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Deep clone a plain object (no circular references). */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Canonical execution order for action resolution.
 * King → Warrior → Executor → Specialist.
 * Note: display order in the deck builder may differ — this is combat-only.
 */
export function getRoleOrder(): UnitRole[] {
  return ['king', 'warrior', 'executor', 'specialist']
}
