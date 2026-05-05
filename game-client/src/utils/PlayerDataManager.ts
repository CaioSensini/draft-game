import type { RankedProfile } from '../data/tournaments'
import { SKILL_CATALOG } from '../data/skillCatalog'
import type { CharClass } from './AssetPaths'
import { SKIN_CATALOG, findSkin } from '../data/skinCatalog'

/**
 * Runtime view of a single mission slot. Internally only `id`, `stageIndex`,
 * and `progress` are persisted — every other field is derived at read time
 * from the chain definition in `battlePass.ts`. Keeping the derived fields
 * on the object lets the UI consume missions exactly like before, and keeps
 * the migration path simple if we change stage targets between releases.
 */
export interface BattlePassMission {
  /** Stable chain id (matches `MissionChain.id`). Kept as `id` so the
   *  battle pass UI can keep using `mission.id` as a lookup key. */
  id: string
  /** Index of the CURRENTLY active stage (0 = first). When this equals
   *  `totalStages` the chain is fully cleared. */
  stageIndex: number
  /** Raw progress value: cumulative count for `cumulative` chains, peak
   *  value seen so far for `max` chains. */
  progress: number
  /** Total stages in the chain (denormalized from chain definition). */
  totalStages: number
  /** True once every stage of the chain has been claimed. */
  fullyDone: boolean
  /** Compact category label, e.g. "PVE", "TORNEIO". Drives card styling. */
  category: string
  /** Description of the active stage (or the LAST stage if fullyDone). */
  description: string
  /** Target threshold for the active stage. */
  target: number
  /** XP awarded when the active stage is claimed. */
  xpReward: number
  /** True when `progress >= target` for the active stage. */
  completed: boolean
  /** True when the chain is fully done (kept for UI compat — old code
   *  branched on `claimed` to draw the green checkmark). */
  claimed: boolean
}

export interface BattlePassData {
  seasonId: number
  tier: number              // 0 to PASS_MAX_TIER
  xp: number                // 0 to PASS_XP_PER_TIER-1
  isPremium: boolean
  claimedFree: number[]     // tier numbers with free reward claimed
  claimedPremium: number[]  // tier numbers with premium reward claimed
  /**
   * All season mission chains — one slot per chain. Each slot tracks the
   * chain's currently active stage; when the player claims a stage the
   * slot's `stageIndex` advances and the next stage replaces it in the
   * UI grid. The whole array is regenerated when a new season starts.
   */
  seasonMissions: BattlePassMission[]
}

export interface PlayerData {
  username: string
  level: number
  xp: number
  gold: number
  dg: number
  wins: number
  losses: number
  rankPoints: number
  /** Spendable Attack Mastery balance (decreases when spent in shops). */
  attackMastery: number
  /** Spendable Defense Mastery balance (decreases when spent in shops). */
  defenseMastery: number
  /**
   * Lifetime Attack Mastery earned across all raids/PvE — never decreases.
   * RaidHubScene displays this alongside the spendable balance so the
   * player sees both "how much I've earned" and "how much is left to spend".
   */
  attackMasteryEarned: number
  defenseMasteryEarned: number
  /**
   * Offline Raid system — daily attack/defense quotas, participation
   * toggle, and the catalogue of fortifications the player has purchased.
   * See `data/raidFortifications.ts` for the available items.
   */
  raid: RaidProfile
  ownedSkills: OwnedSkill[]
  deckConfig: Record<string, { attackCards: string[]; defenseCards: string[] }>
  ranked: RankedProfile
  battlePass: BattlePassData
  /**
   * Skins unlocked by the player, keyed by class. The classic 'idle' skin is
   * granted automatically to every account and never removed from these lists.
   * Added in data v9 — legacy profiles get this field backfilled on load.
   */
  ownedSkins: Record<CharClass, string[]>
  /**
   * Currently equipped skin per class. This is player-owned state (not
   * slot-owned), so it follows the player across character swaps in the
   * lobby and into the battle — each player brings their own skins.
   */
  equippedSkins: Record<CharClass, string>
}

export interface OwnedSkill {
  skillId: string
  level: number    // 1-5
  unitClass: string
  progress: number // filled dots (0 to <level> to upgrade; resets on upgrade)
}

/**
 * Per-day quota for the Offline Raid feature plus the player's owned
 * fortifications. The quota numbers reset every calendar day, tracked via
 * `lastResetDate` in YYYY-MM-DD form.
 */
export interface RaidProfile {
  /** When false, the player cannot launch raids and is excluded from the
   *  matchmaking pool that other players draw from. */
  participating: boolean
  /** Number of raid attacks consumed today (capped at RAID_DAILY_LIMIT). */
  attacksUsedToday: number
  /** Number of raids received today (capped at RAID_DAILY_LIMIT). */
  defensesReceivedToday: number
  /** YYYY-MM-DD of the last day the counters were reset. */
  lastResetDate: string
  /** Fortifications the player owns. Items live here as soon as they're
   *  bought in the shop. Only entries with `equipped = true` are active
   *  during defense and tick `remainingDefenses` down. Up to
   *  `RAID_EQUIP_SLOTS` can be equipped at once. */
  ownedFortifications: Array<{
    itemId: string
    remainingDefenses: number
    equipped: boolean
  }>
}

/** Daily cap on both raid attacks and raid defenses received. */
export const RAID_DAILY_LIMIT = 10

/** Maximum number of fortifications the player can equip at once. */
export const RAID_EQUIP_SLOTS = 4

/** Standardised gold amount the winner takes from the loser on every
 *  offline raid resolution (both attack and defense outcomes). */
export const RAID_VICTORY_GOLD = 100

/** Standardised mastery awarded per raid victory (attack or defense). */
export const RAID_VICTORY_MASTERY = 1

import { getXPForLevel, getStatMultiplier as _getStatMult, getLevelUpGold, getLevelUpDG, MAX_LEVEL } from '../data/progression'
import { createDefaultRankedProfile } from '../data/tournaments'
import { CURRENT_SEASON, PASS_XP_PER_TIER, PASS_MAX_TIER, SEASON_MISSION_CHAINS, SEASON_TIERS, findMissionChain } from '../data/battlePass'
import type { TierReward, MissionTrackKey } from '../data/battlePass'

const STORAGE_KEY = 'draft_player_data'
const DATA_VERSION = 13 // v13: fortifications gain explicit equipped flag

class PlayerDataManager {
  private data: PlayerData

  constructor() {
    this.data = this.load()
  }

  private load(): PlayerData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as PlayerData & { _version?: number }
        if (!parsed.deckConfig) return this.createDefault()
        const ver = parsed._version ?? 0
        if (ver < 4) return this.createDefault()
        // v4→v5 migration: merge duplicate skills into single entries with progress
        if (ver < 5) {
          parsed.ownedSkills = this.migrateSkillsV5(parsed.ownedSkills)
          ;(parsed as unknown as Record<string, unknown>)._version = DATA_VERSION
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
        }
        // Ensure all skills have progress field
        for (const s of parsed.ownedSkills) {
          if (s.progress === undefined) s.progress = 0
        }
        // Ensure battlePass exists
        if (!parsed.battlePass) {
          parsed.battlePass = this.createDefaultBattlePass()
        }
        // v8→v9 migration: give every legacy account the default skin state
        // (owns 'idle' for each class, has 'idle' equipped). This keeps
        // existing progress intact and unlocks the lobby skin picker
        // without forcing a reset.
        if (ver < 9 || !parsed.ownedSkins || !parsed.equippedSkins) {
          parsed.ownedSkins = this.defaultOwnedSkins()
          parsed.equippedSkins = this.defaultEquippedSkins()
          ;(parsed as unknown as Record<string, unknown>)._version = DATA_VERSION
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
        }
        // v9→v10 migration: battle pass switched from daily/weekly rotation
        // to a single 90-day season mission pool. Old daily/weekly state is
        // dropped; tier/xp/claimed are preserved so upgraders don't lose
        // progress. We also drop the daily/weekly timestamp fields.
        if (ver < 10) {
          const legacy = parsed.battlePass as (BattlePassData & {
            dailyMissions?: BattlePassMission[]
            weeklyMissions?: BattlePassMission[]
            lastDailyReset?: number
            lastWeeklyReset?: number
          }) | undefined
          if (legacy) {
            legacy.seasonMissions = this._generateSeasonMissions()
            delete legacy.dailyMissions
            delete legacy.weeklyMissions
            delete legacy.lastDailyReset
            delete legacy.lastWeeklyReset
            parsed.battlePass = legacy
          } else {
            parsed.battlePass = this.createDefaultBattlePass()
          }
          ;(parsed as unknown as Record<string, unknown>)._version = DATA_VERSION
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
        }
        // v10→v11 migration: flat mission pool → evolving mission chains.
        // The old mission shape (id/description/target/progress/xpReward/
        // completed/claimed) is incompatible with chain stages. We discard
        // any in-flight mission progress (the chains have all-new ids) and
        // regenerate a fresh chain set. Tier/xp/claimed-tier state on the
        // pass itself is preserved so the player keeps any rewards already
        // earned this season.
        if (ver < 11) {
          if (parsed.battlePass) {
            parsed.battlePass.seasonMissions = this._generateSeasonMissions()
          } else {
            parsed.battlePass = this.createDefaultBattlePass()
          }
          ;(parsed as unknown as Record<string, unknown>)._version = DATA_VERSION
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
        }
        // v11→v12 migration: add the offline-raid profile + lifetime
        // mastery counters. Lifetime totals are seeded from the existing
        // spendable balance so legacy accounts don't show "0 earned" when
        // they already accumulated mastery from PvE matches.
        if (ver < 12) {
          if (!parsed.raid) parsed.raid = this.createDefaultRaidProfile()
          if (parsed.attackMasteryEarned == null)  parsed.attackMasteryEarned  = parsed.attackMastery ?? 0
          if (parsed.defenseMasteryEarned == null) parsed.defenseMasteryEarned = parsed.defenseMastery ?? 0
          ;(parsed as unknown as Record<string, unknown>)._version = DATA_VERSION
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
        }
        // v12→v13 migration: fortifications now have an explicit `equipped`
        // flag. Older entries used to behave as "always active" — backfill
        // with `equipped = true` for the first RAID_EQUIP_SLOTS items so
        // upgraders don't suddenly find their buffs disabled, and `false`
        // for any extras that wouldn't fit in the new slot cap.
        if (ver < 13) {
          if (parsed.raid?.ownedFortifications) {
            let equippedSoFar = 0
            for (const f of parsed.raid.ownedFortifications) {
              if (typeof (f as { equipped?: boolean }).equipped !== 'boolean') {
                if (equippedSoFar < RAID_EQUIP_SLOTS) {
                  ;(f as { equipped: boolean }).equipped = true
                  equippedSoFar++
                } else {
                  ;(f as { equipped: boolean }).equipped = false
                }
              } else if ((f as { equipped: boolean }).equipped) {
                equippedSoFar++
              }
            }
          }
          ;(parsed as unknown as Record<string, unknown>)._version = DATA_VERSION
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
        }
        return parsed
      }
    } catch {
      /* corrupted data, use defaults */
    }
    return this.createDefault()
  }

  /**
   * Default ownedSkins map — every fresh / legacy account gets exactly the
   * 'idle' classic skin for every class. Alternate skins are purchased in
   * the shop and appended to these lists.
   */
  private defaultOwnedSkins(): Record<CharClass, string[]> {
    return {
      king:       ['idle'],
      warrior:    ['idle'],
      specialist: ['idle'],
      executor:   ['idle'],
    }
  }

  /**
   * Default equippedSkins — starts classic for every class. Changes when
   * the player picks another skin in the lobby picker.
   */
  private defaultEquippedSkins(): Record<CharClass, string> {
    return {
      king:       'idle',
      warrior:    'idle',
      specialist: 'idle',
      executor:   'idle',
    }
  }

  /** Migrate v4 duplicates → v5 unique skills with progress */
  private migrateSkillsV5(skills: OwnedSkill[]): OwnedSkill[] {
    const map = new Map<string, OwnedSkill>()
    for (const s of skills) {
      const key = `${s.skillId}_${s.level}`
      const existing = map.get(key)
      if (existing) {
        // Duplicate found — add 1 progress to the existing entry
        existing.progress = Math.min((existing.progress ?? 0) + 1, existing.level)
      } else {
        map.set(key, { ...s, progress: s.progress ?? 0 })
      }
    }
    return Array.from(map.values())
  }

  private createDefault(): PlayerData {
    // 8 starter skills per class (4 atk + 4 def) = 32 total
    const ownedSkills: OwnedSkill[] = [
      // King
      { skillId: 'lk_a1', level: 1, unitClass: 'king', progress: 0 },
      { skillId: 'lk_a3', level: 1, unitClass: 'king', progress: 0 },
      { skillId: 'lk_a6', level: 1, unitClass: 'king', progress: 0 },
      { skillId: 'lk_a7', level: 1, unitClass: 'king', progress: 0 },
      { skillId: 'lk_d2', level: 1, unitClass: 'king', progress: 0 },
      { skillId: 'lk_d3', level: 1, unitClass: 'king', progress: 0 },
      { skillId: 'lk_d5', level: 1, unitClass: 'king', progress: 0 },
      { skillId: 'lk_d6', level: 1, unitClass: 'king', progress: 0 },
      // Warrior
      { skillId: 'lw_a1', level: 1, unitClass: 'warrior', progress: 0 },
      { skillId: 'lw_a2', level: 1, unitClass: 'warrior', progress: 0 },
      { skillId: 'lw_a6', level: 1, unitClass: 'warrior', progress: 0 },
      { skillId: 'lw_a7', level: 1, unitClass: 'warrior', progress: 0 },
      { skillId: 'lw_d1', level: 1, unitClass: 'warrior', progress: 0 },
      { skillId: 'lw_d8', level: 1, unitClass: 'warrior', progress: 0 },
      { skillId: 'lw_d4', level: 1, unitClass: 'warrior', progress: 0 },
      { skillId: 'lw_d5', level: 1, unitClass: 'warrior', progress: 0 },
      // Specialist
      { skillId: 'ls_a1', level: 1, unitClass: 'specialist', progress: 0 },
      { skillId: 'ls_a2', level: 1, unitClass: 'specialist', progress: 0 },
      { skillId: 'ls_a5', level: 1, unitClass: 'specialist', progress: 0 },
      { skillId: 'ls_a6', level: 1, unitClass: 'specialist', progress: 0 },
      { skillId: 'ls_d1', level: 1, unitClass: 'specialist', progress: 0 },
      { skillId: 'ls_d4', level: 1, unitClass: 'specialist', progress: 0 },
      { skillId: 'ls_d5', level: 1, unitClass: 'specialist', progress: 0 },
      { skillId: 'ls_d7', level: 1, unitClass: 'specialist', progress: 0 },
      // Executor
      { skillId: 'le_a1', level: 1, unitClass: 'executor', progress: 0 },
      { skillId: 'le_a2', level: 1, unitClass: 'executor', progress: 0 },
      { skillId: 'le_a5', level: 1, unitClass: 'executor', progress: 0 },
      { skillId: 'le_a6', level: 1, unitClass: 'executor', progress: 0 },
      { skillId: 'le_d1', level: 1, unitClass: 'executor', progress: 0 },
      { skillId: 'le_d2', level: 1, unitClass: 'executor', progress: 0 },
      { skillId: 'le_d7', level: 1, unitClass: 'executor', progress: 0 },
      { skillId: 'le_d8', level: 1, unitClass: 'executor', progress: 0 },
    ]
    return {
      _version: DATA_VERSION,
      username: 'Jogador',
      level: 1,
      xp: 0,
      gold: 10000,
      dg: 10000,
      wins: 0,
      losses: 0,
      rankPoints: 0,
      attackMastery: 0,
      defenseMastery: 0,
      attackMasteryEarned: 0,
      defenseMasteryEarned: 0,
      raid: this.createDefaultRaidProfile(),
      ownedSkills,
      deckConfig: {
        king: {
          attackCards: ['lk_a1', 'lk_a3', 'lk_a6', 'lk_a7'],
          defenseCards: ['lk_d2', 'lk_d3', 'lk_d5', 'lk_d6'],
        },
        warrior: {
          attackCards: ['lw_a1', 'lw_a2', 'lw_a6', 'lw_a7'],
          defenseCards: ['lw_d1', 'lw_d8', 'lw_d4', 'lw_d5'],
        },
        specialist: {
          attackCards: ['ls_a1', 'ls_a2', 'ls_a5', 'ls_a6'],
          defenseCards: ['ls_d1', 'ls_d4', 'ls_d5', 'ls_d7'],
        },
        executor: {
          attackCards: ['le_a1', 'le_a2', 'le_a5', 'le_a6'],
          defenseCards: ['le_d1', 'le_d2', 'le_d7', 'le_d8'],
        },
      },
      ranked: createDefaultRankedProfile(),
      battlePass: this.createDefaultBattlePass(),
      ownedSkins: this.defaultOwnedSkins(),
      equippedSkins: this.defaultEquippedSkins(),
    } as PlayerData
  }

  private save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
  }

  // -- Getters --

  get(): PlayerData {
    return { ...this.data }
  }

  getGold(): number {
    return this.data.gold
  }

  getDG(): number {
    return this.data.dg
  }

  getRanked(): import('../data/tournaments').RankedProfile {
    return this.data.ranked ?? createDefaultRankedProfile()
  }

  updateRanked(queue: import('../data/tournaments').RankedQueue, info: import('../data/tournaments').RankedInfo): void {
    if (!this.data.ranked) this.data.ranked = createDefaultRankedProfile()
    this.data.ranked[queue] = info
    this.save()
  }

  getLevel(): number {
    return this.data.level
  }

  getXP(): number {
    return this.data.xp
  }

  getSkills(): OwnedSkill[] {
    return [...this.data.ownedSkills]
  }

  getDeckConfig(): Record<string, { attackCards: string[]; defenseCards: string[] }> {
    return { ...this.data.deckConfig }
  }

  saveDeckConfig(unitClass: string, attackCards: string[], defenseCards: string[]): void {
    this.data.deckConfig[unitClass] = { attackCards, defenseCards }
    this.save()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SKIN ECONOMY — owned / equipped / purchasable
  // ═══════════════════════════════════════════════════════════════════════════

  /** Safe getter that self-heals if a legacy profile is somehow missing the map. */
  private _ensureSkinMaps(): void {
    if (!this.data.ownedSkins) this.data.ownedSkins = this.defaultOwnedSkins()
    if (!this.data.equippedSkins) this.data.equippedSkins = this.defaultEquippedSkins()
  }

  /** List of skin IDs the player owns for the given class (always includes 'idle'). */
  getOwnedSkins(classId: CharClass): string[] {
    this._ensureSkinMaps()
    return [...(this.data.ownedSkins[classId] ?? ['idle'])]
  }

  /** True if the player already owns this skin for that class. */
  ownsSkin(classId: CharClass, skinId: string): boolean {
    this._ensureSkinMaps()
    if (skinId === 'idle') return true
    return (this.data.ownedSkins[classId] ?? []).includes(skinId)
  }

  /** Currently equipped skin for a class. Falls back to 'idle' if unset. */
  getEquippedSkin(classId: CharClass): string {
    this._ensureSkinMaps()
    return this.data.equippedSkins[classId] ?? 'idle'
  }

  /**
   * Returns a snapshot of { class → equipped skin } for all 4 classes. This is
   * the shape BattleScene consumes when drawing characters — call this from
   * any lobby right before kicking off the battle.
   */
  getSkinConfig(): Record<CharClass, string> {
    this._ensureSkinMaps()
    return {
      king:       this.getEquippedSkin('king'),
      warrior:    this.getEquippedSkin('warrior'),
      specialist: this.getEquippedSkin('specialist'),
      executor:   this.getEquippedSkin('executor'),
    }
  }

  /**
   * Equip a skin for a class. Fails silently (returns false) if the player
   * doesn't own it — callers should gate the UI on ownsSkin() first so this
   * guard only fires on bugs.
   */
  setEquippedSkin(classId: CharClass, skinId: string): boolean {
    this._ensureSkinMaps()
    if (!this.ownsSkin(classId, skinId)) return false
    // Guard against typos: the skin must be registered in the catalog.
    if (!SKIN_CATALOG[classId].some((s) => s.id === skinId)) return false
    this.data.equippedSkins[classId] = skinId
    this.save()
    return true
  }

  /**
   * Grant a skin for free (battle pass rewards, promos, etc). Idempotent —
   * calling twice with the same id is a no-op. Returns true if the skin
   * was actually added, false if the id is unknown or already owned.
   *
   * Unlike `purchaseSkin`, this does NOT auto-equip — battle pass claims
   * are meant to drop into the wardrobe silently so the current loadout
   * stays untouched.
   */
  grantSkin(classId: CharClass, skinId: string): boolean {
    this._ensureSkinMaps()
    if (!SKIN_CATALOG[classId].some((s) => s.id === skinId)) return false
    if (this.ownsSkin(classId, skinId)) return false
    if (!this.data.ownedSkins[classId]) this.data.ownedSkins[classId] = ['idle']
    this.data.ownedSkins[classId].push(skinId)
    this.save()
    return true
  }

  /**
   * Purchase a skin with DG. Returns true on success. Rejects the transaction
   * if:
   *   - the skin ID isn't registered in the catalog;
   *   - the player already owns it;
   *   - the player can't afford the DG price.
   *
   * On success the skin is added to ownedSkins and immediately auto-equipped
   * — the expected UX after buying something cool.
   */
  purchaseSkin(classId: CharClass, skinId: string): boolean {
    this._ensureSkinMaps()
    const def = findSkin(classId, skinId)
    if (!def) return false
    if (def.rarity === 'default') return false
    if (this.ownsSkin(classId, skinId)) return false
    if (this.data.dg < def.dgPrice) return false

    this.data.dg -= def.dgPrice
    if (!this.data.ownedSkins[classId]) this.data.ownedSkins[classId] = ['idle']
    this.data.ownedSkins[classId].push(skinId)
    this.data.equippedSkins[classId] = skinId
    this.save()
    return true
  }

  // -- Battle rewards --

  addBattleRewards(gold: number, xp: number, won: boolean): void {
    this.data.gold += gold
    this.data.xp += xp
    if (won) this.data.wins++
    else this.data.losses++
    this.checkLevelUp()
    this.save()
  }

  addMastery(type: 'attack' | 'defense', amount: number): { newTotal: number; earnedPack: boolean } {
    if (type === 'attack') {
      this.data.attackMastery += amount
      this.data.attackMasteryEarned = (this.data.attackMasteryEarned ?? 0) + amount
    } else {
      this.data.defenseMastery += amount
      this.data.defenseMasteryEarned = (this.data.defenseMasteryEarned ?? 0) + amount
    }

    const total = type === 'attack' ? this.data.attackMastery : this.data.defenseMastery
    const earnedPack = total > 0 && total % 10 === 0  // every 10 mastery = free pack

    this.save()
    return { newTotal: total, earnedPack }
  }

  /** Spend mastery (returns false if balance is insufficient). */
  spendMastery(type: 'attack' | 'defense', amount: number): boolean {
    const balance = type === 'attack' ? this.data.attackMastery : this.data.defenseMastery
    if (balance < amount) return false
    if (type === 'attack') this.data.attackMastery -= amount
    else this.data.defenseMastery -= amount
    this.save()
    return true
  }

  // -- Offline Raid --

  /**
   * Default raid profile for new accounts and the v11→v12 migration. Daily
   * counters start at zero with `lastResetDate` pre-stamped to today's
   * date, so the first call to `getRaid()` doesn't trigger a needless
   * reset on day 1.
   */
  private createDefaultRaidProfile(): RaidProfile {
    return {
      participating:         false,
      attacksUsedToday:      0,
      defensesReceivedToday: 0,
      lastResetDate:         this._todayKey(),
      ownedFortifications:   [],
    }
  }

  private _todayKey(): string {
    const d = new Date()
    const y  = d.getFullYear()
    const m  = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }

  /**
   * Returns the raid profile after applying any pending day rollover.
   * Called by every other raid getter so the counters are always in sync
   * with the calendar without needing a global tick.
   */
  getRaid(): RaidProfile {
    if (!this.data.raid) {
      this.data.raid = this.createDefaultRaidProfile()
      this.save()
    }
    const today = this._todayKey()
    if (this.data.raid.lastResetDate !== today) {
      this.data.raid.attacksUsedToday      = 0
      this.data.raid.defensesReceivedToday = 0
      this.data.raid.lastResetDate         = today
      this.save()
    }
    return this.data.raid
  }

  getRaidAttacksRemaining(): number {
    return Math.max(0, RAID_DAILY_LIMIT - this.getRaid().attacksUsedToday)
  }

  /**
   * Daily defense cap with reciprocity rule baked in:
   *   - participation ON  → up to RAID_DAILY_LIMIT defenses/day
   *   - participation OFF → cap drops to attacksUsedToday so the player
   *     can only receive as many raids as they've launched (proportional
   *     fairness when they opt out mid-day).
   */
  getRaidDefenseCap(): number {
    const raid = this.getRaid()
    return raid.participating ? RAID_DAILY_LIMIT : raid.attacksUsedToday
  }

  getRaidDefensesRemaining(): number {
    return Math.max(0, this.getRaidDefenseCap() - this.getRaid().defensesReceivedToday)
  }

  setRaidParticipating(value: boolean): void {
    this.getRaid().participating = value
    this.save()
  }

  /**
   * Try to consume one of today's raid attacks. Returns true if the
   * counter was incremented (caller should proceed with the raid),
   * false if the daily quota is exhausted.
   */
  consumeRaidAttack(): boolean {
    const raid = this.getRaid()
    if (raid.attacksUsedToday >= RAID_DAILY_LIMIT) return false
    raid.attacksUsedToday += 1
    this.save()
    return true
  }

  /**
   * Record an incoming raid (offline-side, fired when another player
   * raids the local player). Respects the dynamic defense cap from
   * `getRaidDefenseCap` — when participation is OFF the cap drops to
   * `attacksUsedToday`, so the local player can only be raided as many
   * times as they've raided others. Returns false when the cap is
   * already met. Decrements `remainingDefenses` on every EQUIPPED
   * fortification regardless of victory; equipped items at 0 are
   * dropped. Inventory items (not equipped) are untouched.
   */
  recordRaidDefense(): boolean {
    const raid = this.getRaid()
    if (raid.defensesReceivedToday >= this.getRaidDefenseCap()) return false
    raid.defensesReceivedToday += 1
    raid.ownedFortifications = raid.ownedFortifications
      .map((f) => f.equipped
        ? { ...f, remainingDefenses: f.remainingDefenses - 1 }
        : f)
      .filter((f) => !f.equipped || f.remainingDefenses > 0)
    this.save()
    return true
  }

  /**
   * Add a freshly-purchased fortification to the player's inventory. If
   * the item is already owned, its remaining-defenses counter is topped
   * up (not stacked) so re-buying acts like a refresh. New purchases
   * land UNEQUIPPED — the player chooses what to slot in the Hub's
   * equip panel.
   */
  addRaidFortification(itemId: string, durationDefenses: number): void {
    const raid = this.getRaid()
    const existing = raid.ownedFortifications.find((f) => f.itemId === itemId)
    if (existing) {
      existing.remainingDefenses = Math.max(existing.remainingDefenses, durationDefenses)
    } else {
      raid.ownedFortifications.push({
        itemId,
        remainingDefenses: durationDefenses,
        equipped: false,
      })
    }
    this.save()
  }

  /** Equipped subset (active during defense). */
  getEquippedFortifications(): RaidProfile['ownedFortifications'] {
    return this.getRaid().ownedFortifications.filter((f) => f.equipped)
  }

  /** Inventory subset (owned but not currently equipped). */
  getInventoryFortifications(): RaidProfile['ownedFortifications'] {
    return this.getRaid().ownedFortifications.filter((f) => !f.equipped)
  }

  /**
   * Move an inventory item into the equipped pool. Returns false if the
   * item is already equipped, not owned, or all RAID_EQUIP_SLOTS are
   * full.
   */
  equipFortification(itemId: string): boolean {
    const raid = this.getRaid()
    const equippedCount = raid.ownedFortifications.filter((f) => f.equipped).length
    if (equippedCount >= RAID_EQUIP_SLOTS) return false
    const target = raid.ownedFortifications.find((f) => f.itemId === itemId && !f.equipped)
    if (!target) return false
    target.equipped = true
    this.save()
    return true
  }

  /**
   * Move an equipped item back into the inventory. Remaining-defenses
   * count is preserved so the player can re-equip later without losing
   * progress.
   */
  unequipFortification(itemId: string): boolean {
    const raid = this.getRaid()
    const target = raid.ownedFortifications.find((f) => f.itemId === itemId && f.equipped)
    if (!target) return false
    target.equipped = false
    this.save()
    return true
  }

  /**
   * Standardised offline-raid attack-victory rewards: +1 Attack Mastery
   * and +100 gold "stolen" from the defending player. Consolidated here
   * so BattleResultScene + future raid-resolution code share a single
   * source of truth.
   */
  applyRaidAttackVictory(): { masteryGained: number; goldGained: number } {
    this.addMastery('attack', 1)
    this.addGold(RAID_VICTORY_GOLD)
    return { masteryGained: 1, goldGained: RAID_VICTORY_GOLD }
  }

  /**
   * Standardised offline-raid defense-victory rewards: +1 Defense
   * Mastery and +100 gold "received" from the would-be raider. Used
   * when the offline-defense feature simulates a raid the local player
   * survived.
   */
  applyRaidDefenseVictory(): { masteryGained: number; goldGained: number } {
    this.addMastery('defense', 1)
    this.addGold(RAID_VICTORY_GOLD)
    return { masteryGained: 1, goldGained: RAID_VICTORY_GOLD }
  }

  /**
   * Earned (lifetime) Mastery for a side. Always >= the spendable balance
   * once the player has spent any mastery in shops.
   */
  getMasteryEarned(type: 'attack' | 'defense'): number {
    return type === 'attack'
      ? (this.data.attackMasteryEarned ?? this.data.attackMastery ?? 0)
      : (this.data.defenseMasteryEarned ?? this.data.defenseMastery ?? 0)
  }

  /** Spendable Mastery for a side (matches the existing balance field). */
  getMasteryAvailable(type: 'attack' | 'defense'): number {
    return type === 'attack' ? this.data.attackMastery : this.data.defenseMastery
  }

  // -- Economy --

  spendGold(amount: number): boolean {
    if (this.data.gold < amount) return false
    this.data.gold -= amount
    this.save()
    return true
  }

  spendDG(amount: number): boolean {
    if (this.data.dg < amount) return false
    this.data.dg -= amount
    this.save()
    return true
  }

  addGold(amount: number): void {
    this.data.gold += amount
    this.save()
  }

  addDG(amount: number): void {
    this.data.dg += amount
    this.save()
  }

  // -- Skills --

  /** Add a brand new skill to inventory (first time obtained). */
  addSkill(skillId: string, unitClass: string, level = 1): void {
    this.data.ownedSkills.push({ skillId, level, unitClass, progress: 0 })
    this.save()
  }

  /** Increment progress when a duplicate is found. Syncs shared skills. Returns true if incremented. */
  addSkillProgress(skillId: string): boolean {
    const skill = this.data.ownedSkills.find(s => s.skillId === skillId)
    if (!skill) return false
    if (skill.level >= 5) return false
    if (skill.progress >= skill.level) return false
    skill.progress++
    this._syncSharedSkills(skillId)
    this.save()
    return true
  }

  /** Check if a skill can receive another copy (has empty progress dots). */
  canReceiveSkill(skillId: string): boolean {
    const skill = this.data.ownedSkills.find(s => s.skillId === skillId)
    if (!skill) return true // new skill, can always receive
    if (skill.level >= 5) return false
    return skill.progress < skill.level
  }

  /** Upgrade a skill to next level. Requires full progress + gold cost. Syncs shared skills. */
  upgradeSkill(skillId: string): boolean {
    const skill = this.data.ownedSkills.find(s => s.skillId === skillId)
    if (!skill) return false
    if (skill.level >= 5) return false
    if (skill.progress < skill.level) return false

    const costs = [0, 100, 300, 700, 1500]
    const cost = costs[skill.level - 1] ?? 1500
    if (this.data.gold < cost) return false

    skill.level++
    skill.progress = 0
    this.data.gold -= cost
    this._syncSharedSkills(skillId)
    this.checkLevelUp()
    this.save()
    return true
  }

  /** Get upgrade cost for a skill at its current level. */
  getUpgradeCost(level: number): number {
    const costs = [0, 100, 300, 700, 1500]
    return costs[level - 1] ?? 1500
  }

  /**
   * Sync shared skills: skills with the same name across classes (e.g., Esquiva, Bloqueio Total)
   * share the same level and progress. When one is upgraded or progressed, all copies sync.
   */
  // ═══════════════════════════════════════════════════════════════════════════
  // BATTLE PASS
  // ═══════════════════════════════════════════════════════════════════════════

  private createDefaultBattlePass(): BattlePassData {
    return {
      seasonId: CURRENT_SEASON.id,
      tier: 0,
      xp: 0,
      isPremium: false,
      claimedFree: [],
      claimedPremium: [],
      seasonMissions: this._generateSeasonMissions(),
    }
  }

  /**
   * Build the mission list for a fresh season. One slot per chain in
   * `SEASON_MISSION_CHAINS`, each starting at stage 0 with zero progress.
   * The derived display fields (description, target, etc.) are filled in
   * by `_hydrateMission` so this only needs to seed the persisted bits.
   */
  private _generateSeasonMissions(): BattlePassMission[] {
    return SEASON_MISSION_CHAINS.map((c) => this._hydrateMission({
      id: c.id,
      stageIndex: 0,
      progress: 0,
      // Hydrate fills these in:
      totalStages: 0,
      fullyDone: false,
      category: '',
      description: '',
      target: 0,
      xpReward: 0,
      completed: false,
      claimed: false,
    }))
  }

  /**
   * Take a stored mission record (id + stageIndex + progress) and fold in
   * every derived display field from the chain definition. Returns a fresh
   * object — the caller is free to push it back into state. If the chain
   * id is unknown (e.g. a chain was deleted between releases) the mission
   * is marked fullyDone so it shows as a checkmark instead of a broken
   * card.
   */
  private _hydrateMission(m: BattlePassMission): BattlePassMission {
    const chain = findMissionChain(m.id)
    if (!chain) {
      return {
        ...m,
        totalStages: 0,
        fullyDone: true,
        category: '',
        description: '(missão removida)',
        target: 0,
        xpReward: 0,
        completed: false,
        claimed: true,
      }
    }
    const totalStages = chain.stages.length
    const fullyDone = m.stageIndex >= totalStages
    // When fully done we still want to render the LAST stage's description
    // so the card reads "Vença 50 batalhas PvE ✓" instead of being blank.
    const stageRef = fullyDone
      ? chain.stages[totalStages - 1]!
      : chain.stages[m.stageIndex]!
    const completed = !fullyDone && m.progress >= stageRef.target
    return {
      id: m.id,
      stageIndex: m.stageIndex,
      progress: m.progress,
      totalStages,
      fullyDone,
      category: chain.category,
      description: stageRef.description,
      target: stageRef.target,
      xpReward: stageRef.xpReward,
      completed,
      claimed: fullyDone,
    }
  }

  getBattlePass(): BattlePassData {
    if (!this.data.battlePass) {
      this.data.battlePass = this.createDefaultBattlePass()
      this.save()
    }
    return {
      ...this.data.battlePass,
      // Always re-hydrate from chain definitions so stage targets / XP /
      // descriptions stay in sync if we tweak `battlePass.ts` between
      // releases without bumping the data version.
      seasonMissions: this.data.battlePass.seasonMissions.map((m) => this._hydrateMission(m)),
    }
  }

  /** Add XP to battle pass, auto-leveling tiers */
  addBattlePassXP(amount: number): void {
    const bp = this.data.battlePass
    if (!bp || bp.tier >= PASS_MAX_TIER) return
    bp.xp += amount
    while (bp.xp >= PASS_XP_PER_TIER && bp.tier < PASS_MAX_TIER) {
      bp.xp -= PASS_XP_PER_TIER
      bp.tier++
    }
    if (bp.tier >= PASS_MAX_TIER) bp.xp = 0
    this.save()
  }

  /**
   * Claim the active stage of a mission chain. Awards the stage's XP and
   * advances `stageIndex` so the next stage becomes active. The next stage
   * may already be completed (e.g. a long win streak rolling over multiple
   * stage thresholds); the player just claims it again on the next click.
   *
   * Returns false if the chain id is unknown, the chain is already fully
   * done, or the active stage isn't yet completed.
   */
  claimMission(missionId: string): boolean {
    const bp = this.data.battlePass
    if (!bp) return false
    const stored = bp.seasonMissions.find((m) => m.id === missionId)
    if (!stored) return false
    const chain = findMissionChain(missionId)
    if (!chain) return false
    if (stored.stageIndex >= chain.stages.length) return false
    const stage = chain.stages[stored.stageIndex]!
    if (stored.progress < stage.target) return false

    // Award XP and advance to the next stage.
    this.addBattlePassXP(stage.xpReward)
    stored.stageIndex++

    // For cumulative chains, progress carries over (so a player who
    // banked 50 wins gets every stage in one rapid claim sequence). For
    // `max` chains we leave the peak value intact too — same behavior.
    this.save()
    return true
  }

  /**
   * Apply a bundle of tier rewards to the player's inventory. Handles every
   * RewardType transparently — skill packs pull a random skill (with class
   * lookup from the 2-letter id prefix), skins grant via `grantSkin`, and
   * gold/DG are added straight to the wallet.
   */
  private _applyTierRewards(rewards: TierReward[]): void {
    for (const r of rewards) {
      if (r.type === 'gold') {
        this.addGold(r.amount)
      } else if (r.type === 'dg') {
        this.addDG(r.amount)
      } else if (r.type === 'skin') {
        if (r.skinClass && r.skinId) this.grantSkin(r.skinClass, r.skinId)
      } else if (r.type === 'skill_pack') {
        const classMap: Record<string, CharClass> = {
          lk: 'king', lw: 'warrior', ls: 'specialist', le: 'executor',
        }
        for (let i = 0; i < r.amount; i++) {
          const candidates = SKILL_CATALOG.filter(
            (s) => s.id.startsWith('l') && this.canReceiveSkill(s.id),
          )
          if (candidates.length === 0) break
          const sk = candidates[Math.floor(Math.random() * candidates.length)]!
          const cls = classMap[sk.id.substring(0, 2)] ?? 'king'
          const existing = this.data.ownedSkills.find((s) => s.skillId === sk.id)
          if (existing) this.addSkillProgress(sk.id)
          else this.addSkill(sk.id, cls)
        }
      }
    }
  }

  /** Claim free tier reward — applies every reward bundled into that tier. */
  claimFreeReward(tier: number): boolean {
    const bp = this.data.battlePass
    if (!bp || bp.tier < tier || bp.claimedFree.includes(tier)) return false
    const tierDef = SEASON_TIERS.find((st) => st.tier === tier)
    if (!tierDef) return false
    bp.claimedFree.push(tier)
    this._applyTierRewards(tierDef.freeReward)
    this.save()
    return true
  }

  /** Claim premium tier reward — applies every reward bundled into that tier. */
  claimPremiumReward(tier: number): boolean {
    const bp = this.data.battlePass
    if (!bp || !bp.isPremium || bp.tier < tier || bp.claimedPremium.includes(tier)) return false
    const tierDef = SEASON_TIERS.find((st) => st.tier === tier)
    if (!tierDef) return false
    bp.claimedPremium.push(tier)
    this._applyTierRewards(tierDef.premiumReward)
    this.save()
    return true
  }

  /**
   * Unlock the premium pass. In production this is gated by a real-money
   * IAP callback (Steam / App Store / Play). For now the client just
   * flips the flag — the UI should only call this after the payment
   * provider confirms the transaction.
   */
  unlockPremiumPass(): boolean {
    if (!this.data.battlePass) this.data.battlePass = this.createDefaultBattlePass()
    if (this.data.battlePass.isPremium) return false
    this.data.battlePass.isPremium = true
    this.save()
    return true
  }

  /**
   * Push progress into every chain that subscribes to `trackKey`. The
   * `amount` argument means different things per progress mode:
   *   - cumulative: "add this much to the running total" (e.g. wins +1).
   *   - max: "the new peak value to compare against" (e.g. current win
   *     streak length, current tournament rank). Use `Math.max` so a
   *     lower value never demotes a stored peak.
   *
   * Note that progress can blow PAST the active stage target — the
   * chain doesn't auto-advance, the player has to physically click
   * "claim" so they get the XP-bar animation feedback. Stages with old
   * progress already above their target will show as immediately
   * claimable on the next BP screen visit.
   */
  progressMissions(trackKey: MissionTrackKey, amount = 1): void {
    const bp = this.data.battlePass
    if (!bp) return
    let changed = false
    for (const m of bp.seasonMissions) {
      const chain = findMissionChain(m.id)
      if (!chain) continue
      if (chain.trackKey !== trackKey) continue
      if (m.stageIndex >= chain.stages.length) continue // fully done
      if (chain.progressMode === 'cumulative') {
        m.progress += amount
      } else {
        // max mode: keep the peak value
        if (amount > m.progress) m.progress = amount
      }
      changed = true
    }
    if (changed) this.save()
  }

  /** Check if there are unclaimed rewards available */
  hasUnclaimedRewards(): boolean {
    const bp = this.data.battlePass
    if (!bp) return false
    // Unclaimed mission XP counts as a pending reward too — triggers the
    // red badge on the lobby button even when no tier is ready yet. A
    // mission is "claimable" when its active stage is completed but not
    // yet claimed (i.e. progress >= target and stageIndex still in range).
    for (const m of bp.seasonMissions) {
      const chain = findMissionChain(m.id)
      if (!chain) continue
      if (m.stageIndex >= chain.stages.length) continue // fully done
      const stage = chain.stages[m.stageIndex]!
      if (m.progress >= stage.target) return true
    }
    for (let t = 1; t <= bp.tier; t++) {
      if (!bp.claimedFree.includes(t)) return true
      if (bp.isPremium && !bp.claimedPremium.includes(t)) return true
    }
    return false
  }

  private _syncSharedSkills(skillId: string) {
    const def = SKILL_CATALOG.find(s => s.id === skillId)
    if (!def) return

    // Find the updated skill state
    const source = this.data.ownedSkills.find(s => s.skillId === skillId)
    if (!source) return

    // Find all other skills with the same name (shared across classes)
    const sameNameIds = SKILL_CATALOG
      .filter(s => s.name === def.name && s.id !== skillId)
      .map(s => s.id)

    // Sync level and progress to all copies the player owns
    for (const otherId of sameNameIds) {
      const other = this.data.ownedSkills.find(s => s.skillId === otherId)
      if (other) {
        other.level = source.level
        other.progress = source.progress
      }
    }
  }

  // -- Level up --

  private checkLevelUp(): void {
    while (this.data.level < MAX_LEVEL) {
      const needed = getXPForLevel(this.data.level)
      if (this.data.xp < needed) break
      this.data.xp -= needed
      this.data.level++
      // Level-up rewards
      this.data.gold += getLevelUpGold(this.data.level)
      this.data.dg += getLevelUpDG(this.data.level)
    }
  }

  /** Stat multiplier based on current player level (1.0x at lv1, 2.98x at lv100). */
  getStatMultiplier(): number {
    return _getStatMult(this.data.level)
  }

  // -- Server sync --

  /**
   * Merge server profile data into local state.
   * Called after login/register or token validation.
   * Server fields overwrite local fields; ownedSkills stay local for now.
   */
  syncFromServer(serverUser: {
    username?: string
    level?: number
    xp?: number
    gold?: number
    dg?: number
    rankPoints?: number
    wins?: number
    losses?: number
  }): void {
    if (serverUser.username !== undefined) this.data.username = serverUser.username
    if (serverUser.level !== undefined) this.data.level = serverUser.level
    if (serverUser.xp !== undefined) this.data.xp = serverUser.xp
    if (serverUser.gold !== undefined) this.data.gold = serverUser.gold
    if (serverUser.dg !== undefined) this.data.dg = serverUser.dg
    if (serverUser.rankPoints !== undefined) this.data.rankPoints = serverUser.rankPoints
    if (serverUser.wins !== undefined) this.data.wins = serverUser.wins
    if (serverUser.losses !== undefined) this.data.losses = serverUser.losses
    this.save()
  }

  // -- Reset (for testing) --

  reset(): void {
    this.data = this.createDefault()
    this.save()
  }
}

export const playerData = new PlayerDataManager()
