import type { UnitLevelData } from '../types'

// XP required for each level (cumulative)
export const levelProgression: UnitLevelData[] = [
  { level: 1, experienceRequired: 0, statMultiplier: 1.0, goldReward: 0, dgReward: 0 },
  { level: 2, experienceRequired: 100, statMultiplier: 1.1, goldReward: 50, dgReward: 0 },
  { level: 3, experienceRequired: 250, statMultiplier: 1.2, goldReward: 75, dgReward: 0 },
  { level: 4, experienceRequired: 450, statMultiplier: 1.3, goldReward: 100, dgReward: 1 },
  { level: 5, experienceRequired: 700, statMultiplier: 1.4, goldReward: 125, dgReward: 1 },
  { level: 6, experienceRequired: 1000, statMultiplier: 1.5, goldReward: 150, dgReward: 2 },
  { level: 7, experienceRequired: 1350, statMultiplier: 1.6, goldReward: 175, dgReward: 2 },
  { level: 8, experienceRequired: 1750, statMultiplier: 1.7, goldReward: 200, dgReward: 3 },
  { level: 9, experienceRequired: 2200, statMultiplier: 1.8, goldReward: 225, dgReward: 3 },
  { level: 10, experienceRequired: 2700, statMultiplier: 1.9, goldReward: 250, dgReward: 5 },
  { level: 11, experienceRequired: 3250, statMultiplier: 2.0, goldReward: 275, dgReward: 5 },
  { level: 12, experienceRequired: 3850, statMultiplier: 2.1, goldReward: 300, dgReward: 7 },
  { level: 13, experienceRequired: 4500, statMultiplier: 2.2, goldReward: 325, dgReward: 7 },
  { level: 14, experienceRequired: 5200, statMultiplier: 2.3, goldReward: 350, dgReward: 10 },
  { level: 15, experienceRequired: 5950, statMultiplier: 2.4, goldReward: 375, dgReward: 10 },
  { level: 16, experienceRequired: 6750, statMultiplier: 2.5, goldReward: 400, dgReward: 12 },
  { level: 17, experienceRequired: 7600, statMultiplier: 2.6, goldReward: 425, dgReward: 12 },
  { level: 18, experienceRequired: 8500, statMultiplier: 2.7, goldReward: 450, dgReward: 15 },
  { level: 19, experienceRequired: 9450, statMultiplier: 2.8, goldReward: 475, dgReward: 15 },
  { level: 20, experienceRequired: 10450, statMultiplier: 2.9, goldReward: 500, dgReward: 20 },
]

// XP rewards for different actions
export const xpRewards = {
  killUnit: 50,
  damageDealt: 0.1, // XP per damage point
  healAlly: 0.05,   // XP per heal point
  winRound: 25,
  winGame: 100,
  useCard: 2,       // XP per card used
  surviveRound: 10,
}

// Gold rewards for different actions
export const goldRewards = {
  killUnit: 25,
  winRound: 50,
  winGame: 200,
  surviveRound: 10,
}

// DG rewards for different actions
export const dgRewards = {
  winGame: 5,
  levelUp: 1,
  specialAchievement: 10,
}