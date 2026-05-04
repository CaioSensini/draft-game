/**
 * data/tournaments.ts — PvE tournament system + Ranked system.
 *
 * PvE Tournaments: 6 tiers (Bronze → Master), bracket elimination vs NPCs.
 * DG drop is a % CHANCE, not guaranteed — incentivizes premium purchase.
 *
 * Ranked: 7 tiers with 4 divisions each, separate elos for 1v1/2v2/4v4.
 * All ranked matches are tournament-format between REAL players only.
 */

import { t } from '../i18n'

// ═══════════════════════════════════════════════════════════════════════════════
// PVE TOURNAMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export interface Tournament {
  id: string
  name: string
  description: string
  levelMin: number
  levelMax: number
  rounds: number
  entryFee: number
  /** DG drop: { amount, chance } — rolled on 1st place win only */
  dgDrop: { amount: number; chance: number }
  rewards: {
    first:         { gold: number; xp: number; skills: number }
    second:        { gold: number; xp: number }
    third:         { gold: number; xp: number }
    participation: { gold: number; xp: number }
  }
  npcTeams: Array<{ name: string; level: number; difficulty: 'easy' | 'normal' | 'hard' }>
}

export const TOURNAMENTS: Tournament[] = [
  {
    id: 'tourney_bronze', name: 'Torneio Bronze',
    description: 'Torneio para iniciantes. Chaveamento eliminatorio de 8 equipes.',
    levelMin: 1, levelMax: 15, rounds: 3, entryFee: 50,
    dgDrop: { amount: 0, chance: 0 },  // Bronze: sem DG
    rewards: {
      first:  { gold: 500, xp: 300, skills: 2 },
      second: { gold: 250, xp: 150 },
      third:  { gold: 100, xp: 75 },
      participation: { gold: 25, xp: 30 },
    },
    npcTeams: [
      { name: 'Recrutas da Vila', level: 3, difficulty: 'easy' },
      { name: 'Patrulha da Floresta', level: 6, difficulty: 'easy' },
      { name: 'Mercenarios', level: 9, difficulty: 'normal' },
      { name: 'Guarda Real Novata', level: 12, difficulty: 'normal' },
      { name: 'Esquadrao Iniciante', level: 14, difficulty: 'normal' },
      { name: 'Defensores do Forte', level: 15, difficulty: 'hard' },
      { name: 'Cavaleiros Juniores', level: 15, difficulty: 'hard' },
    ],
  },
  {
    id: 'tourney_silver', name: 'Torneio Prata',
    description: 'Para guerreiros experientes.',
    levelMin: 16, levelMax: 35, rounds: 3, entryFee: 200,
    dgDrop: { amount: 1, chance: 0.05 },  // 5% chance de 1 DG
    rewards: {
      first:  { gold: 1500, xp: 800, skills: 3 },
      second: { gold: 750, xp: 400 },
      third:  { gold: 300, xp: 200 },
      participation: { gold: 75, xp: 80 },
    },
    npcTeams: [
      { name: 'Bandidos Veteranos', level: 18, difficulty: 'easy' },
      { name: 'Milicia do Deserto', level: 22, difficulty: 'normal' },
      { name: 'Ordem dos Escudos', level: 26, difficulty: 'normal' },
      { name: 'Assassinos de Sombra', level: 30, difficulty: 'hard' },
      { name: 'Paladinos do Sul', level: 33, difficulty: 'hard' },
      { name: 'Mestres de Armas', level: 35, difficulty: 'hard' },
      { name: 'Guardia de Elite', level: 35, difficulty: 'hard' },
    ],
  },
  {
    id: 'tourney_gold', name: 'Torneio Ouro',
    description: 'Apenas os mais fortes.',
    levelMin: 36, levelMax: 55, rounds: 3, entryFee: 500,
    dgDrop: { amount: 2, chance: 0.05 },  // 5% chance de 2 DG
    rewards: {
      first:  { gold: 3000, xp: 1500, skills: 4 },
      second: { gold: 1500, xp: 750 },
      third:  { gold: 600, xp: 400 },
      participation: { gold: 150, xp: 150 },
    },
    npcTeams: [
      { name: 'Legiao de Ferro', level: 38, difficulty: 'normal' },
      { name: 'Cacadores de Dragao', level: 42, difficulty: 'normal' },
      { name: 'Exercito do Norte', level: 46, difficulty: 'hard' },
      { name: 'Magos da Torre', level: 50, difficulty: 'hard' },
      { name: 'Cavaleiros Negros', level: 53, difficulty: 'hard' },
      { name: 'Generais do Imperio', level: 55, difficulty: 'hard' },
      { name: 'Conselho de Guerra', level: 55, difficulty: 'hard' },
    ],
  },
  {
    id: 'tourney_platinum', name: 'Torneio Platina',
    description: 'Elite dos campos de batalha.',
    levelMin: 56, levelMax: 75, rounds: 3, entryFee: 1000,
    dgDrop: { amount: 3, chance: 0.05 },  // 5% chance de 3 DG
    rewards: {
      first:  { gold: 6000, xp: 3000, skills: 5 },
      second: { gold: 3000, xp: 1500 },
      third:  { gold: 1200, xp: 750 },
      participation: { gold: 300, xp: 300 },
    },
    npcTeams: [
      { name: 'Senhores da Guerra', level: 58, difficulty: 'normal' },
      { name: 'Ordem Sombria', level: 62, difficulty: 'hard' },
      { name: 'Guardioes Ancioes', level: 66, difficulty: 'hard' },
      { name: 'Exercito das Trevas', level: 70, difficulty: 'hard' },
      { name: 'Reis Caidos', level: 73, difficulty: 'hard' },
      { name: 'Imortais do Abismo', level: 75, difficulty: 'hard' },
      { name: 'Campeoes de Platina', level: 75, difficulty: 'hard' },
    ],
  },
  {
    id: 'tourney_diamond', name: 'Torneio Diamante',
    description: 'Os mais poderosos do reino.',
    levelMin: 76, levelMax: 90, rounds: 3, entryFee: 2500,
    dgDrop: { amount: 5, chance: 0.05 },  // 5% chance de 5 DG
    rewards: {
      first:  { gold: 12000, xp: 6000, skills: 6 },
      second: { gold: 6000, xp: 3000 },
      third:  { gold: 2500, xp: 1500 },
      participation: { gold: 600, xp: 500 },
    },
    npcTeams: [
      { name: 'Dragoes do Inferno', level: 78, difficulty: 'hard' },
      { name: 'Necromantes Reais', level: 82, difficulty: 'hard' },
      { name: 'Exercito Celestial', level: 85, difficulty: 'hard' },
      { name: 'Devoradores de Almas', level: 87, difficulty: 'hard' },
      { name: 'Guardioes do Destino', level: 89, difficulty: 'hard' },
      { name: 'Lordes da Destruicao', level: 90, difficulty: 'hard' },
      { name: 'Campeoes de Diamante', level: 90, difficulty: 'hard' },
    ],
  },
  {
    id: 'tourney_master', name: 'Torneio Mestre',
    description: 'Lendas vivas. Os mais fortes de todos.',
    levelMin: 91, levelMax: 100, rounds: 3, entryFee: 5000,
    dgDrop: { amount: 10, chance: 0.05 },  // 5% chance de 10 DG
    rewards: {
      first:  { gold: 25000, xp: 12000, skills: 8 },
      second: { gold: 12000, xp: 6000 },
      third:  { gold: 5000, xp: 3000 },
      participation: { gold: 1000, xp: 1000 },
    },
    npcTeams: [
      { name: 'Exercito dos Deuses', level: 93, difficulty: 'hard' },
      { name: 'Arautos do Caos', level: 95, difficulty: 'hard' },
      { name: 'Cavaleiros do Fim', level: 97, difficulty: 'hard' },
      { name: 'Imperador das Sombras', level: 99, difficulty: 'hard' },
      { name: 'Deuses da Guerra', level: 100, difficulty: 'hard' },
      { name: 'Mestres Supremos', level: 100, difficulty: 'hard' },
      { name: 'Campeoes Imortais', level: 100, difficulty: 'hard' },
    ],
  },
]

export function getAvailableTournaments(playerLevel: number): Tournament[] {
  return TOURNAMENTS.filter(t => playerLevel >= t.levelMin && playerLevel <= t.levelMax + 5)
}

export const TIER_COLORS: Record<string, number> = {
  tourney_bronze:   0xcd7f32,
  tourney_silver:   0xc0c0c0,
  tourney_gold:     0xf0c850,
  tourney_platinum: 0x4fc3f7,
  tourney_diamond:  0xb388ff,
  tourney_master:   0xff4444,
}

/** Roll DG drop for a tournament win. Returns 0 if no drop. */
export function rollDGDrop(tournament: Tournament): number {
  if (tournament.dgDrop.chance <= 0 || tournament.dgDrop.amount <= 0) return 0
  return Math.random() < tournament.dgDrop.chance ? tournament.dgDrop.amount : 0
}

// ═══════════════════════════════════════════════════════════════════════════════
// RANKED SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Ranked System — Tournament-based competitive play.
 *
 * Structure:
 *   7 Elos: Desconhecido → Recruta → Aprendiz → Soldado → Veterano → Comandante → Rei
 *   Each elo (except Desconhecido and Rei) has 3 divisions: 1, 2, 3
 *   100 LP to promote to next division/elo
 *
 * Format:
 *   - 1v1 and 2v2: Tournament of 8 teams, double elimination (losers play losers)
 *   - 4v4: Tournament of 4 teams (fewer players needed)
 *   - Position determines LP gained (1st most, 8th/4th least)
 *   - All ranked matches are REAL PLAYERS ONLY (no bots)
 *
 * Special rules:
 *   - Comandante has 3 divisions, but Comandante 3 has NO LP cap
 *   - Rei = Top 100 players with highest LP in Comandante 3
 *   - Separate elo for each queue (1v1, 2v2, 4v4)
 *   - NPC tournaments: 8 teams, single elimination (NPCs, only player wins matter)
 */

export type RankedTier =
  | 'rei'
  | 'comandante'
  | 'veterano'
  | 'soldado'
  | 'aprendiz'
  | 'recruta'
  | 'desconhecido'

export type RankedDivision = 1 | 2 | 3
export type RankedQueue = '1v1' | '2v2' | '4v4'

export interface RankedInfo {
  tier: RankedTier
  division: RankedDivision | null  // null for Desconhecido and Rei
  lp: number                       // 0-100 (except Comandante 3 = unlimited)
  wins: number
  losses: number
  totalTournaments: number
}

export interface RankedProfile {
  '1v1': RankedInfo
  '2v2': RankedInfo
  '4v4': RankedInfo
}

/** Tier display data */
export interface TierData {
  name: string
  color: number
  colorHex: string
  icon: string
  /** LP reward per tournament placement for this tier */
  lpRewards: {
    '1st': number
    '2nd': number
    '3rd': number
    '4th': number
    '5th': number
    '6th': number
    '7th': number
    '8th': number
  }
  /** LP lost for bad placement (applies to 5th-8th) */
  lpPenalty: number
}

export function getRankedTierName(tier: RankedTier): string {
  return t(`common.ranked-tiers.${tier}`)
}

export const RANKED_TIERS: Record<RankedTier, TierData> = {
  desconhecido: {
    name: 'Desconhecido', color: 0x666666, colorHex: '#666666', icon: '❓',
    lpRewards: { '1st': 30, '2nd': 25, '3rd': 20, '4th': 15, '5th': 10, '6th': 5, '7th': 2, '8th': 0 },
    lpPenalty: 0,
  },
  recruta: {
    name: 'Recruta', color: 0x8b6914, colorHex: '#8b6914', icon: '🗡️',
    lpRewards: { '1st': 28, '2nd': 22, '3rd': 16, '4th': 12, '5th': 5, '6th': 2, '7th': 0, '8th': 0 },
    lpPenalty: 5,
  },
  aprendiz: {
    name: 'Aprendiz', color: 0xcd7f32, colorHex: '#cd7f32', icon: '⚔️',
    lpRewards: { '1st': 25, '2nd': 20, '3rd': 15, '4th': 10, '5th': 3, '6th': 0, '7th': 0, '8th': 0 },
    lpPenalty: 8,
  },
  soldado: {
    name: 'Soldado', color: 0xc0c0c0, colorHex: '#c0c0c0', icon: '🛡️',
    lpRewards: { '1st': 22, '2nd': 17, '3rd': 12, '4th': 8, '5th': 2, '6th': 0, '7th': 0, '8th': 0 },
    lpPenalty: 10,
  },
  veterano: {
    name: 'Veterano', color: 0xf0c850, colorHex: '#f0c850', icon: '⭐',
    lpRewards: { '1st': 20, '2nd': 15, '3rd': 10, '4th': 6, '5th': 0, '6th': 0, '7th': 0, '8th': 0 },
    lpPenalty: 12,
  },
  comandante: {
    name: 'Comandante', color: 0x4fc3f7, colorHex: '#4fc3f7', icon: '💎',
    lpRewards: { '1st': 18, '2nd': 13, '3rd': 8, '4th': 4, '5th': 0, '6th': 0, '7th': 0, '8th': 0 },
    lpPenalty: 15,
  },
  rei: {
    name: 'Rei', color: 0xff4444, colorHex: '#ff4444', icon: '👑',
    lpRewards: { '1st': 18, '2nd': 13, '3rd': 8, '4th': 4, '5th': 0, '6th': 0, '7th': 0, '8th': 0 },
    lpPenalty: 15,
  },
}

/** Tier order from lowest to highest */
const TIER_ORDER: RankedTier[] = [
  'desconhecido', 'recruta', 'aprendiz', 'soldado', 'veterano', 'comandante', 'rei',
]

/** Create a fresh unranked profile */
export function createDefaultRankedProfile(): RankedProfile {
  const fresh = (): RankedInfo => ({
    tier: 'desconhecido', division: null, lp: 0, wins: 0, losses: 0, totalTournaments: 0,
  })
  return { '1v1': fresh(), '2v2': fresh(), '4v4': fresh() }
}

/** Number of teams in a ranked tournament for each queue */
export function getTournamentSize(queue: RankedQueue): number {
  return queue === '4v4' ? 4 : 8
}

/** Position labels */
export function getPositionLabel(position: number): string {
  const labels: Record<number, string> = {
    1: '1o Lugar', 2: '2o Lugar', 3: '3o Lugar', 4: '4o Lugar',
    5: '5o Lugar', 6: '6o Lugar', 7: '7o Lugar', 8: '8o Lugar',
  }
  return labels[position] ?? `${position}o Lugar`
}

/**
 * Process a ranked tournament result based on final placement.
 *
 * @param info Current ranked info
 * @param position Final placement (1-8 for 1v1/2v2, 1-4 for 4v4)
 * @param queue Which queue this was for
 * @returns Updated info + whether promotion/demotion happened
 */
export function processRankedTournament(
  info: RankedInfo,
  position: number,
  queue: RankedQueue,
): { newInfo: RankedInfo; promoted: boolean; demoted: boolean; tierChange: string | null; lpGained: number } {
  const updated = { ...info }
  updated.totalTournaments++
  let promoted = false
  let demoted = false
  let tierChange: string | null = null

  const tierData = RANKED_TIERS[updated.tier]
  const tourneySize = getTournamentSize(queue)

  // Count wins/losses based on position
  // In an 8-team double elim: 1st = ~3 wins, 8th = 0 wins
  const positionWins = Math.max(0, tourneySize - position)
  const positionLosses = Math.max(0, position - 1)
  updated.wins += positionWins
  updated.losses += positionLosses

  // ── Placement phase (Desconhecido) ──
  if (updated.tier === 'desconhecido') {
    // Gain LP regardless in placement
    const posKey = `${position}${position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}` as keyof TierData['lpRewards']
    const lpGain = tierData.lpRewards[posKey] ?? 0
    updated.lp += lpGain

    if (updated.totalTournaments >= 3) {
      // After 3 tournaments, place into Recruta
      updated.tier = 'recruta'
      updated.division = 1
      updated.lp = Math.min(updated.lp, 50)
      promoted = true
      tierChange = `${getRankedTierName('recruta')} 1`
    }
    return { newInfo: updated, promoted, demoted, tierChange, lpGained: lpGain }
  }

  // ── LP calculation based on position ──
  const posKey = `${position}${position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}` as keyof TierData['lpRewards']
  let lpGain = tierData.lpRewards[posKey] ?? 0

  // Bad placement penalty (bottom half)
  const bottomHalf = position > Math.ceil(tourneySize / 2)
  if (bottomHalf && lpGain === 0) {
    lpGain = -tierData.lpPenalty
  }

  updated.lp += lpGain

  // ── Promotion check (LP >= 100) ──
  if (updated.lp >= 100) {
    // Comandante 3 special rule: NO CAP, accumulates infinitely
    if (updated.tier === 'comandante' && updated.division === 3) {
      // Stay in Comandante 3 — Rei is determined by top 100 server-wide
      // LP keeps accumulating past 100
    } else if (updated.tier === 'rei') {
      // Rei: LP accumulates (leaderboard ranking)
    } else if (updated.division === 3) {
      // Promote to next tier, division 1
      const tierIdx = TIER_ORDER.indexOf(updated.tier)
      if (tierIdx < TIER_ORDER.length - 1) {
        const nextTier = TIER_ORDER[tierIdx + 1]
        updated.lp -= 100
        updated.tier = nextTier
        updated.division = nextTier === 'rei' ? null : 1
        promoted = true
      tierChange = `${getRankedTierName(updated.tier)}${updated.division ? ' ' + updated.division : ''}`
      }
    } else {
      // Promote to next division within tier
      updated.lp -= 100
      updated.division = (updated.division! + 1) as RankedDivision
      promoted = true
      tierChange = `${getRankedTierName(updated.tier)} ${updated.division}`
    }
  }

  // ── Demotion check (LP < 0) ──
  if (updated.lp < 0) {
    if (updated.tier === 'recruta' && updated.division === 1) {
      // Can't go below Recruta 1
      updated.lp = 0
    } else if (updated.division === 1 || updated.division === null) {
      // Demote to previous tier, division 3
      const tierIdx = TIER_ORDER.indexOf(updated.tier)
      if (tierIdx > 1) {
        updated.tier = TIER_ORDER[tierIdx - 1]
        updated.division = 3
        updated.lp = 75 // Buffer so you don't instantly demote again
        demoted = true
        tierChange = `${getRankedTierName(updated.tier)} ${updated.division}`
      } else {
        updated.lp = 0
      }
    } else {
      // Demote to previous division
      updated.division = (updated.division! - 1) as RankedDivision
      updated.lp = 75
      demoted = true
      tierChange = `${getRankedTierName(updated.tier)} ${updated.division}`
    }
  }

  return { newInfo: updated, promoted, demoted, tierChange, lpGained: lpGain }
}

/**
 * Display string for ranked info.
 */
export function getRankedDisplayString(info: RankedInfo): string {
  const td = RANKED_TIERS[info.tier]
  if (info.tier === 'desconhecido') {
    return t('common.ranked-display.placement', { count: info.totalTournaments })
  }
  if (info.tier === 'rei') {
    return `${td.icon} ${getRankedTierName('rei')} — ${info.lp} LP`
  }
  if (info.tier === 'comandante' && info.division === 3) {
    return `${td.icon} ${getRankedTierName('comandante')} 3 — ${info.lp} LP`
  }
  return `${td.icon} ${getRankedTierName(info.tier)} ${info.division} — ${info.lp} LP`
}

/**
 * MMR for matchmaking.
 */
export function getRankedMMR(info: RankedInfo): number {
  const tierIdx = TIER_ORDER.indexOf(info.tier)
  const divValue = info.division ? info.division * 33 : 0
  return tierIdx * 100 + divValue + info.lp * 0.3
}

/**
 * Season rewards.
 */
export const SEASON_REWARDS: Record<RankedTier, { gold: number; dg: number; skills: number; title: string }> = {
  desconhecido: { gold: 0,     dg: 0,   skills: 0, title: '' },
  recruta:      { gold: 200,   dg: 0,   skills: 1, title: 'Recruta' },
  aprendiz:     { gold: 500,   dg: 2,   skills: 2, title: 'Aprendiz' },
  soldado:      { gold: 1000,  dg: 5,   skills: 3, title: 'Soldado' },
  veterano:     { gold: 2500,  dg: 10,  skills: 4, title: 'Veterano' },
  comandante:   { gold: 5000,  dg: 25,  skills: 6, title: 'Comandante' },
  rei:          { gold: 15000, dg: 100, skills: 10, title: 'Rei dos Reis' },
}
