/**
 * Arena Utility Functions
 * Helper functions for common calculations and operations in ArenaScene
 */

import type { TeamSide, UnitRole } from '../types'

/**
 * Calculate Manhattan distance between two grid points
 * @param col1 Column of first point
 * @param row1 Row of first point
 * @param col2 Column of second point
 * @param row2 Row of second point
 * @returns Manhattan distance
 */
export function calculateDistance(
  col1: number,
  row1: number,
  col2: number,
  row2: number
): number {
  return Math.abs(col1 - col2) + Math.abs(row1 - row2)
}

/**
 * Get HP bar color based on current HP ratio
 * @param ratio Current HP as fraction of max HP (0-1)
 * @returns Hex color code
 */
export function getHpBarColor(ratio: number): number {
  const CRITICAL = 0.25
  const DANGER = 0.55
  const HEALTHY = 0x22c55e  // Green
  const DANGER_COLOR = 0xef4444  // Red
  const CRITICAL_COLOR = 0xf59e0b  // Amber

  if (ratio > DANGER) return HEALTHY
  if (ratio > CRITICAL) return DANGER_COLOR
  return CRITICAL_COLOR
}

/**
 * Get team side opposite to the given side
 * @param side The current team side
 * @returns The opposite team side
 */
export function getOppositeSide(side: TeamSide): TeamSide {
  return side === 'left' ? 'right' : 'left'
}

/**
 * Convert team side to numeric index (0 = left, 1 = right)
 * @param side The team side
 * @returns Numeric index
 */
export function sideToIndex(side: TeamSide): 0 | 1 {
  return side === 'left' ? 0 : 1
}

/**
 * Convert numeric index to team side
 * @param index The numeric index (0 or 1)
 * @returns The team side
 */
export function indexToSide(index: 0 | 1): TeamSide {
  return index === 0 ? 'left' : 'right'
}

/**
 * Check if a position is in a specific column range (for team territories)
 * @param col Column position
 * @param side Team side
 * @returns true if position is in that team's territory
 */
export function isInTerritory(col: number, side: TeamSide, wallCol: number = 8): boolean {
  return side === 'left' ? col < wallCol : col >= wallCol
}

/**
 * Clamp a value between min and max
 * @param value The value to clamp
 * @param min Minimum value
 * @param max Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Get a random element from an array
 * @param array Array to pick from
 * @returns Random element
 */
export function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

/**
 * Shuffle array in place (Fisher-Yates)
 * @param array Array to shuffle
 * @returns Shuffled array
 */
export function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Deeply clone an object (for simple objects, not circular references)
 * @param obj Object to clone
 * @returns Cloned object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Debounce a function
 * @param func Function to debounce
 * @param delay Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

/**
 * Get all unit roles in order (for consistent processing)
 * @returns Array of unit roles
 */
export function getRoleOrder(): UnitRole[] {
  return ['king', 'warrior', 'specialist', 'executor']
}
