/**
 * data/battlePass.ts — Battle Pass season data, rewards, and missions.
 *
 * Each season lasts 90 days (3 months) with 20 tiers. Players progress by
 * completing SEASON missions (single pool, all expire with the season —
 * no daily/weekly resets). XP per tier: 100 (fixed).
 *
 * Premium pass is unlocked via REAL-MONEY purchase. The client stores a
 * placeholder label (`PASS_PREMIUM_PRICE_LABEL`) until an IAP flow lands.
 *
 * Reward distribution per the design spec:
 *
 *   Free track                              Premium track
 *   ─────────────────────────────────────   ──────────────────────────────────────
 *   T1  — 1 random skill                    T1  — 2 random skills
 *   T2  — 200 gold                          T2  — 500 gold + 10 DG
 *   T3  — 20 DG                             T3  — 40 DG
 *   T4  — 200 gold                          T4  — 500 gold + 10 DG
 *   T5  — Warrior common skin               T5  — Warrior epic skin
 *   T6  — 1 random skill                    T6  — 2 random skills
 *   T7  — 200 gold                          T7  — 500 gold + 10 DG
 *   T8  — 20 DG                             T8  — 40 DG
 *   T9  — 200 gold                          T9  — 500 gold + 10 DG
 *   T10 — Specialist common skin            T10 — Specialist epic skin
 *   T11 — 1 random skill                    T11 — 2 random skills
 *   T12 — 200 gold                          T12 — 500 gold + 10 DG
 *   T13 — 20 DG                             T13 — 40 DG
 *   T14 — 200 gold                          T14 — 500 gold + 10 DG
 *   T15 — Executor common skin              T15 — Executor epic skin
 *   T16 — 1 random skill                    T16 — 2 random skills
 *   T17 — 200 gold                          T17 — 500 gold + 10 DG
 *   T18 — 20 DG                             T18 — 40 DG
 *   T19 — 200 gold                          T19 — 500 gold + 10 DG
 *   T20 — King common skin + 1 skill        T20 — King epic skin + 2 skills
 *
 * LEGENDARY skins remain shop-exclusive.
 */

import type { CharClass } from '../utils/AssetPaths'

// ── Types ────────────────────────────────────────────────────────────────────

export type RewardType = 'gold' | 'dg' | 'skill_pack' | 'skin'

/**
 * A single atomic reward. Multiple rewards can be bundled into one tier
 * slot — see `SeasonTier.freeReward` / `premiumReward` which are arrays.
 */
export interface TierReward {
  type: RewardType
  amount: number            // gold amount, dg amount, skill count, or 1 for skin
  label: string             // short display text
  /** For skins: the class the skin belongs to. */
  skinClass?: CharClass
  /** For skins: the skin id inside SKIN_CATALOG[skinClass]. */
  skinId?: string
}

export interface SeasonTier {
  tier: number              // 1-20
  /** Free-track rewards (1 or more). Always at least one entry. */
  freeReward: TierReward[]
  /** Premium-track rewards (1 or more). Always at least one entry. */
  premiumReward: TierReward[]
}

/**
 * Track keys understood by the battle pass progress pipeline. Each chain
 * subscribes to exactly one track and game systems fire matching events
 * via `playerData.progressMissions(trackKey, amount)`.
 */
export type MissionTrackKey =
  | 'win_pve'
  | 'win_pvp'
  | 'play_battle'
  | 'win_streak'
  | 'tournament_rank'
  | 'enemy_kill'
  | 'flawless_win'
  | 'offline_attack_win'

/**
 * `cumulative` chains add `amount` to `progress` on every event (e.g. wins
 * counted across the whole season). `max` chains store the BEST value seen
 * so far (e.g. longest win streak, highest tournament rank) — incoming
 * events overwrite the stored value only if larger.
 */
export type MissionProgressMode = 'cumulative' | 'max'

/** A single rung on a mission chain. */
export interface MissionStage {
  /** Threshold the player must reach (cumulative count or peak value). */
  target: number
  /** XP awarded when this stage is claimed. */
  xpReward: number
  /** Player-facing description for THIS stage. Stages can use different
   *  wordings (e.g. "Vença sua primeira" → "Vença 5"). */
  description: string
}

/**
 * A chain is a series of progressively harder mission stages all tracking
 * the same gameplay metric. When the player completes and claims one
 * stage, the next one immediately replaces it in the same UI slot — no
 * extra mission grid spawns. Once every stage in the chain is cleared the
 * mission becomes "fully done" and stops contributing XP.
 */
export interface MissionChain {
  id: string
  trackKey: MissionTrackKey
  progressMode: MissionProgressMode
  /** Compact label used by the card UI (e.g. "PVE", "TORNEIO"). */
  category: string
  stages: MissionStage[]
}

// ── Constants ────────────────────────────────────────────────────────────────

export const PASS_XP_PER_TIER = 100
export const PASS_MAX_TIER = 20
export const PASS_SEASON_DAYS = 90
/** Display label for the premium pass purchase button (real money, IAP). */
export const PASS_PREMIUM_PRICE_LABEL = 'R$ 19,90'

// ── Current Season ───────────────────────────────────────────────────────────

export const CURRENT_SEASON = {
  id: 1,
  name: 'Temporada 1 — Aurora da Guerra',
  startDate: '2026-04-01',
  /** End date = start + 90 days. Kept as a string for human readability. */
  endDate: '2026-06-30',
}

// ── Reward builders ──────────────────────────────────────────────────────────

/** Levels that grant a skill pack (free=1, premium=2). */
const SKILL_PACK_TIERS = new Set<number>([1, 6, 11, 16, 20])

/** Levels that grant DG (free=20, premium=40). */
const DG_TIERS = new Set<number>([3, 8, 13, 18])

/**
 * Premium "gold + DG" tiers — these get 500g AND a 10 DG bonus on the
 * premium track. The OTHER pure-gold premium tiers (2, 7, 12, 17) get
 * only 500g, no DG bonus.
 */
const PREMIUM_GOLD_DG_TIERS = new Set<number>([4, 9, 14, 19])

/** Skin slots: tier → { class, free skin id, free label, epic skin id, epic label }. */
const SKIN_SLOTS: Record<number, {
  cls: CharClass
  freeId: string
  freeLabel: string
  epicId: string
  epicLabel: string
}> = {
  5:  {
    cls: 'warrior',
    freeId: 'warrior_of_the_kingdom_idle',
    freeLabel: 'Guerreiro do Reino',
    epicId: 'ashes_idle',
    epicLabel: 'Guerreiro da Montanha',
  },
  10: {
    cls: 'specialist',
    freeId: 'specialist_of_the_kingdom_idle',
    freeLabel: 'Especialista do Reino',
    epicId: 'arcane_idle',
    epicLabel: 'Especialista Rubi',
  },
  15: {
    cls: 'executor',
    freeId: 'executor_of_the_kingdom_idle',
    freeLabel: 'Executor do Reino',
    epicId: 'spectral_idle',
    epicLabel: 'Executor da Brisa',
  },
  20: {
    cls: 'king',
    freeId: 'king_of_the_kingdom_idle',
    freeLabel: 'Rei do Reino',
    epicId: 'crimson_idle',
    epicLabel: 'Rei da Tempestade',
  },
}

// ── Season Tiers (20 levels) ─────────────────────────────────────────────────

function buildTiers(): SeasonTier[] {
  const tiers: SeasonTier[] = []

  for (let t = 1; t <= PASS_MAX_TIER; t++) {
    const freeReward: TierReward[] = []
    const premiumReward: TierReward[] = []

    const skinSlot = SKIN_SLOTS[t]
    const isSkillPackTier = SKILL_PACK_TIERS.has(t)
    const isDgTier = DG_TIERS.has(t)

    // ── Skin (if this tier has one) ──
    if (skinSlot) {
      freeReward.push({
        type: 'skin',
        amount: 1,
        label: skinSlot.freeLabel,
        skinClass: skinSlot.cls,
        skinId: skinSlot.freeId,
      })
      premiumReward.push({
        type: 'skin',
        amount: 1,
        label: skinSlot.epicLabel,
        skinClass: skinSlot.cls,
        skinId: skinSlot.epicId,
      })
    }

    // ── Skill pack (may stack on top of a skin at tier 20) ──
    if (isSkillPackTier) {
      freeReward.push({ type: 'skill_pack', amount: 1, label: '1 Skill' })
      premiumReward.push({ type: 'skill_pack', amount: 2, label: '2 Skills' })
    }

    // ── DG tier (standalone) ──
    if (isDgTier) {
      freeReward.push({ type: 'dg', amount: 20, label: '20 DG' })
      premiumReward.push({ type: 'dg', amount: 40, label: '40 DG' })
    }

    // ── Fallback: gold tier (no skin / skill pack / dg on this level) ──
    if (freeReward.length === 0) {
      freeReward.push({ type: 'gold', amount: 200, label: '200g' })
    }
    if (premiumReward.length === 0) {
      // All premium gold tiers grant 500g; only the "bonus DG" subset
      // (tiers 4/9/14/19) also tacks on +10 DG.
      premiumReward.push({ type: 'gold', amount: 500, label: '500g' })
      if (PREMIUM_GOLD_DG_TIERS.has(t)) {
        premiumReward.push({ type: 'dg', amount: 10, label: '+10 DG' })
      }
    }

    tiers.push({ tier: t, freeReward, premiumReward })
  }

  return tiers
}

export const SEASON_TIERS = buildTiers()

// ── Mission Chains ───────────────────────────────────────────────────────────
//
// All chains are SEASON-SCOPED: they unlock when the pass starts and expire
// when the season ends (90 days). No daily/weekly resets.
//
// Each chain has 5 evolving stages — when the player claims one stage the
// NEXT stage replaces it in the same UI slot, with a higher target and
// bigger XP reward. Once every stage in a chain is cleared the mission is
// "fully done" and rests on the grid as a checkmark.
//
// XP budget (across all 8 chains × 5 stages each):
//   ≈ 12,800 XP available vs. 2,000 XP needed for tier 20.
// That's a generous oversupply on purpose — the player can pick which
// chains to push and still max the pass without grinding every category.

export const SEASON_MISSION_CHAINS: MissionChain[] = [
  // 1. PvE wins — the bread-and-butter chain. Highest content density.
  {
    id: 'chain_win_pve',
    trackKey: 'win_pve',
    progressMode: 'cumulative',
    category: 'PVE',
    stages: [
      { target: 1,  xpReward: 100, description: 'Vença sua primeira batalha PvE' },
      { target: 5,  xpReward: 200, description: 'Vença 5 batalhas PvE' },
      { target: 15, xpReward: 300, description: 'Vença 15 batalhas PvE' },
      { target: 30, xpReward: 400, description: 'Vença 30 batalhas PvE' },
      { target: 50, xpReward: 500, description: 'Vença 50 batalhas PvE' },
    ],
  },
  // 2. PvP wins — same shape as PvE but tougher targets.
  {
    id: 'chain_win_pvp',
    trackKey: 'win_pvp',
    progressMode: 'cumulative',
    category: 'PVP',
    stages: [
      { target: 1,  xpReward: 100, description: 'Vença sua primeira batalha PvP' },
      { target: 5,  xpReward: 200, description: 'Vença 5 batalhas PvP' },
      { target: 10, xpReward: 300, description: 'Vença 10 batalhas PvP' },
      { target: 20, xpReward: 400, description: 'Vença 20 batalhas PvP' },
      { target: 35, xpReward: 500, description: 'Vença 35 batalhas PvP' },
    ],
  },
  // 3. Play any battle — high-volume "show up" chain. Rewards consistency
  //    over win rate so even losing sessions still feed the pass.
  {
    id: 'chain_play_battle',
    trackKey: 'play_battle',
    progressMode: 'cumulative',
    category: 'PARTIDAS',
    stages: [
      { target: 5,   xpReward: 100, description: 'Jogue 5 partidas' },
      { target: 25,  xpReward: 200, description: 'Jogue 25 partidas' },
      { target: 50,  xpReward: 300, description: 'Jogue 50 partidas' },
      { target: 100, xpReward: 400, description: 'Jogue 100 partidas' },
      { target: 200, xpReward: 500, description: 'Jogue 200 partidas' },
    ],
  },
  // 4. Win streak — small numbers, BIG XP. Rewards skill over volume.
  //    `max` mode: progress = best streak seen this season.
  {
    id: 'chain_win_streak',
    trackKey: 'win_streak',
    progressMode: 'max',
    category: 'SEQUENCIA',
    stages: [
      { target: 3,  xpReward: 150, description: 'Vença 3 batalhas seguidas' },
      { target: 5,  xpReward: 300, description: 'Vença 5 batalhas seguidas' },
      { target: 7,  xpReward: 400, description: 'Vença 7 batalhas seguidas' },
      { target: 10, xpReward: 500, description: 'Vença 10 batalhas seguidas' },
      { target: 15, xpReward: 700, description: 'Vença 15 batalhas seguidas' },
    ],
  },
  // 5. PvP tournament rank — `max` mode: progress = highest tournament
  //    level reached this season. Targets follow user spec (1 → 5 → 10 → 15 → 20).
  {
    id: 'chain_tournament_rank',
    trackKey: 'tournament_rank',
    progressMode: 'max',
    category: 'TORNEIO',
    stages: [
      { target: 1,  xpReward: 100, description: 'Alcance o nível 1 no torneio PvP' },
      { target: 5,  xpReward: 200, description: 'Alcance o nível 5 no torneio PvP' },
      { target: 10, xpReward: 300, description: 'Alcance o nível 10 no torneio PvP' },
      { target: 15, xpReward: 400, description: 'Alcance o nível 15 no torneio PvP' },
      { target: 20, xpReward: 500, description: 'Alcance o nível 20 no torneio PvP' },
    ],
  },
  // 6. Enemy kills — counts every enemy character KO across all modes.
  {
    id: 'chain_enemy_kill',
    trackKey: 'enemy_kill',
    progressMode: 'cumulative',
    category: 'ELIMINAR',
    stages: [
      { target: 5,   xpReward: 100, description: 'Elimine 5 personagens inimigos' },
      { target: 25,  xpReward: 200, description: 'Elimine 25 personagens inimigos' },
      { target: 50,  xpReward: 300, description: 'Elimine 50 personagens inimigos' },
      { target: 100, xpReward: 400, description: 'Elimine 100 personagens inimigos' },
      { target: 200, xpReward: 500, description: 'Elimine 200 personagens inimigos' },
    ],
  },
  // 7. Flawless wins — finish a battle without losing a single ally.
  //    Slightly higher XP per stage to reward the difficulty.
  {
    id: 'chain_flawless_win',
    trackKey: 'flawless_win',
    progressMode: 'cumulative',
    category: 'IMPECAVEL',
    stages: [
      { target: 1,  xpReward: 150, description: 'Vença sem perder nenhum personagem' },
      { target: 3,  xpReward: 250, description: 'Vença 3 batalhas impecáveis' },
      { target: 7,  xpReward: 350, description: 'Vença 7 batalhas impecáveis' },
      { target: 12, xpReward: 450, description: 'Vença 12 batalhas impecáveis' },
      { target: 20, xpReward: 600, description: 'Vença 20 batalhas impecáveis' },
    ],
  },
  // 8. Offline attack wins — raids on other players' bases (the async
  //    "ataque a inimigos offline" mode).
  {
    id: 'chain_offline_attack_win',
    trackKey: 'offline_attack_win',
    progressMode: 'cumulative',
    category: 'OFENSIVA',
    stages: [
      { target: 1,  xpReward: 100, description: 'Vença 1 ataque offline' },
      { target: 5,  xpReward: 200, description: 'Vença 5 ataques offline' },
      { target: 10, xpReward: 300, description: 'Vença 10 ataques offline' },
      { target: 20, xpReward: 400, description: 'Vença 20 ataques offline' },
      { target: 35, xpReward: 500, description: 'Vença 35 ataques offline' },
    ],
  },
]

/** Lookup helper: find a chain by its id. Returns undefined if the id is
 *  stale (e.g. an old save references a chain that was removed). */
export function findMissionChain(id: string): MissionChain | undefined {
  return SEASON_MISSION_CHAINS.find((c) => c.id === id)
}

/** Pick N random unique items from a pool */
export function pickRandom<T>(pool: T[], count: number): T[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
