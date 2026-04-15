/**
 * data/progression.ts — Level 1-100 progression, economy, and reward formulas.
 *
 * All game economy flows through these functions:
 *   - XP/leveling: formula-based, exponential curve to level 100
 *   - Battle rewards: scaled by level difference, mode, group size
 *   - Tax system: prevents gold inflation
 *   - Stat scaling: level multiplier applied to base stats
 */

// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_LEVEL = 100

export const TAX_RATES = {
  pvpGold:       0.10,  // 10% on PvP gold rewards
  pveGold:       0.00,  // No tax on PvE
  offlineAttack: 0.15,  // 15% on gold stolen from offline attacks
}

export const GROUP_BONUS = {
  duo:   0.10,  // +10% XP and gold for 2v2
  squad: 0.20,  // +20% XP and gold for 4v4
}

// ── XP / Level formulas ──────────────────────────────────────────────────────

/** XP needed to advance FROM this level to the next. */
export function getXPForLevel(level: number): number {
  if (level >= MAX_LEVEL) return Infinity
  return Math.round(50 * Math.pow(level + 1, 1.8))
}

/** Cumulative XP from level 1 to reach `targetLevel`. */
export function getTotalXPForLevel(targetLevel: number): number {
  let total = 0
  for (let i = 1; i < targetLevel; i++) total += getXPForLevel(i)
  return total
}

/**
 * Stat multiplier for a given player level.
 * Level 1 = 1.00x, Level 50 = 1.98x, Level 100 = 2.98x.
 * Applied to base HP, ATK, DEF (NOT mobility).
 */
export function getStatMultiplier(level: number): number {
  return 1.0 + (Math.min(level, MAX_LEVEL) - 1) * 0.02
}

/** Gold reward for leveling up. */
export function getLevelUpGold(level: number): number {
  return 50 + level * 10
}

/** DG reward for leveling up (milestone-based). */
export function getLevelUpDG(level: number): number {
  if (level % 25 === 0) return 20
  if (level % 10 === 0) return 5
  return 0
}

// ── Battle reward calculation ────────────────────────────────────────────────

export interface BattleRewardParams {
  playerLevel:  number
  enemyLevel:   number
  won:          boolean
  mode:         'pve' | 'pvp' | 'offline'
  groupSize:    1 | 2 | 4
  roundsPlayed: number
  kills:        number
  damageDealt:  number
  healingDone:  number
}

export interface BattleRewards {
  xp:              number
  gold:            number
  dg:              number
  taxPaid:         number
  skillDropChance: number  // 0-1 probability
}

export function calculateBattleRewards(p: BattleRewardParams): BattleRewards {
  // Losers get minimal participation XP
  if (!p.won) {
    return {
      xp: Math.round(p.roundsPlayed * 3 + p.damageDealt * 0.01),
      gold: 0, dg: 0, taxPaid: 0, skillDropChance: 0,
    }
  }

  // ── Base rewards ──
  let baseXP   = 50 + p.kills * 20 + Math.round(p.damageDealt * 0.05) + Math.round(p.healingDone * 0.03)
  let baseGold = 30 + p.kills * 15 + p.roundsPlayed * 5

  // ── Level difference scaling ──
  const diff = p.enemyLevel - p.playerLevel
  let scale = 1.0
  if      (diff < -10) scale = 0.1    // way too easy
  else if (diff < -5)  scale = 0.3    // too easy
  else if (diff < 0)   scale = 0.7    // slightly easier
  else if (diff <= 5)  scale = 1.0    // fair fight
  else if (diff <= 10) scale = 1.3    // harder
  else if (diff <= 20) scale = 1.6    // much harder
  else                 scale = 2.0    // way harder = big reward

  baseXP   = Math.round(baseXP * scale)
  baseGold = Math.round(baseGold * scale)

  // ── Group bonus ──
  const groupMult = p.groupSize === 4 ? (1 + GROUP_BONUS.squad)
                  : p.groupSize === 2 ? (1 + GROUP_BONUS.duo)
                  : 1.0
  baseXP   = Math.round(baseXP * groupMult)
  baseGold = Math.round(baseGold * groupMult)

  // ── Tax ──
  const taxRate = p.mode === 'pvp'     ? TAX_RATES.pvpGold
                : p.mode === 'offline' ? TAX_RATES.offlineAttack
                : TAX_RATES.pveGold
  const taxPaid   = Math.round(baseGold * taxRate)
  const finalGold = baseGold - taxPaid

  // ── DG (small chance on PvP wins) ──
  const dg = p.mode === 'pvp' && Math.random() < 0.1 ? 1 : 0

  // ── Skill drop chance (PvE only, scales with difficulty) ──
  const skillDropChance = p.mode === 'pve'
    ? Math.min(0.50, 0.15 + Math.max(0, diff) * 0.02)
    : 0

  return { xp: baseXP, gold: finalGold, dg, taxPaid, skillDropChance }
}

// ── Legacy compatibility (used by old imports) ────────────────────────────────

export const xpRewards = {
  killUnit: 50,
  damageDealt: 0.05,
  healAlly: 0.03,
  winRound: 25,
  winGame: 100,
  useCard: 2,
  surviveRound: 10,
}

export const goldRewards = {
  killUnit: 25,
  winRound: 50,
  winGame: 200,
  surviveRound: 10,
}

export const dgRewards = {
  winGame: 5,
  levelUp: 1,
  specialAchievement: 10,
}
