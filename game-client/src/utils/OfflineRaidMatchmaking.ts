/**
 * utils/OfflineRaidMatchmaking.ts — finds offline player teams to raid.
 *
 * The Offline Raid feature lets a player attack OTHER players' teams while
 * those owners are not online. Targets are picked by level proximity so
 * matches stay balanced regardless of how thinly populated the matchmaking
 * pool is.
 *
 * Public API:
 *   isOfflineRaidLive()
 *     Returns true when the backend matchmaking is wired up and the click
 *     should open the live target-selection screen. Until then the lobby
 *     button shows the "Coming soon" explainer popup.
 *
 *   findOfflineRaidTargets({ localLevel, limit?, levelTolerance? })
 *     Returns the N closest-level offline targets, sorted by absolute
 *     level distance from the local player. Falls back to a wider net
 *     when the strict tolerance produces too few candidates.
 *
 * Today the pool is synthesized client-side so the UI can be wired and
 * tested against a deterministic data shape; once the backend lands the
 * `findOfflineRaidTargets` body switches to a fetch call against the real
 * service without changing any caller.
 */

export interface OfflineRaidTarget {
  /** Stable id used when the player picks this target to attack. */
  id: string
  /** Display name shown on the target card. */
  ownerName: string
  /** Owner's player level — drives matchmaking proximity. */
  ownerLevel: number
  /** Whether the owner has the offline-raid mode toggled on. Only
   *  participating players are returned by `findOfflineRaidTargets`. */
  participating: boolean
  /** Aggregate team power (sum of unit stats) — secondary sort hint. */
  teamPower: number
  /** Defense rating of the offline team (0–100). Higher = harder raid. */
  defenseStrength: number
  /** When the owner was last online (ms epoch). Older targets give bonus loot. */
  lastSeenAt: number
  /** Estimated rewards if the raid succeeds. Note: actual rewards on
   *  victory are standardised by PlayerData (+1 mastery + 100 gold);
   *  this estimate is a UI hint only and may differ. */
  rewardEstimate: {
    masteryAttack: number
    masteryDefense: number
    gold: number
  }
}

export interface RaidMatchmakingOptions {
  /** Local player's current level — center of the search window. */
  localLevel: number
  /** Maximum number of targets to return. Default 5. */
  limit?: number
  /** Half-width of the level window in either direction. Default 5. */
  levelTolerance?: number
}

/**
 * Whether the backend matchmaking + raid resolution loop is shipped.
 *
 * Flip to true once the server endpoint is live. Today the explainer
 * popup is always reachable; this flag is reserved for future server-
 * side gating (e.g. region-specific rollout).
 */
export function isOfflineRaidLive(): boolean {
  return false
}

/**
 * Build the BattleScene payload that launches a raid against `target`.
 * Routes through the existing PvE pipeline (pveMode + npcTeam) so the
 * post-battle BattleResultScene already shows the loot, and tags the
 * payload with a `raidTarget` field so the result screen can award
 * mastery on top of the standard PvE rewards.
 *
 * The caller passes the player's deckConfig + skinConfig (typically from
 * `playerData`) so the player's personalised loadout/skins travel into
 * the battle.
 */
export interface RaidBattlePayload {
  pveMode: 'offlineRaid'
  npcTeam: {
    name: string
    levelMin: number
    levelMax: number
    goldReward: number
    xpReward: number
  }
  raidTarget: OfflineRaidTarget
  deckConfig?: unknown
  skinConfig?: unknown
}

export function buildRaidBattlePayload(
  target: OfflineRaidTarget,
  loadout: { deckConfig?: unknown; skinConfig?: unknown } = {},
): RaidBattlePayload {
  return {
    pveMode:    'offlineRaid',
    npcTeam: {
      name:       target.ownerName,
      levelMin:   target.ownerLevel,
      levelMax:   target.ownerLevel,
      goldReward: target.rewardEstimate.gold,
      // XP reward stays the standard 50 for now; the bespoke loot the raid
      // adds is mastery, paid out by BattleResultScene when raidTarget is
      // present in the scene data.
      xpReward:   50,
    },
    raidTarget: target,
    deckConfig: loadout.deckConfig,
    skinConfig: loadout.skinConfig,
  }
}

/**
 * Pick offline raid targets that match BOTH:
 *   - same level as the local player (strict equality)
 *   - have offline-raid participation toggled ON
 *
 * If no one matches, the caller surfaces a "no available player at your
 * level" message instead of widening the net.
 *
 * The `levelTolerance` field on the options is accepted for backwards
 * compatibility but ignored — the strict-equality filter takes priority.
 *
 * Mock implementation walks a deterministic synthesized pool where ~70%
 * of entries are flagged participating. Real implementation will
 * `await fetch('/api/offline-raids/targets?level=N&participating=true')`
 * and map the response to OfflineRaidTarget[].
 */
export function findOfflineRaidTargets(opts: RaidMatchmakingOptions): OfflineRaidTarget[] {
  const limit = opts.limit ?? 5
  const pool = synthesizePool(opts.localLevel)
  return pool
    .filter((t) => t.participating && t.ownerLevel === opts.localLevel)
    .sort((a, b) => a.defenseStrength - b.defenseStrength)
    .slice(0, limit)
}

// ─── Internals ──────────────────────────────────────────────────────────

/**
 * Deterministic synthesizer used during development. Keys off the local
 * level so the same player always sees a consistent pool until the real
 * server replaces this.
 */
function synthesizePool(localLevel: number): OfflineRaidTarget[] {
  const FANTASY_NAMES = [
    'Aldric', 'Branwen', 'Cedric', 'Delara', 'Eowin', 'Faelar',
    'Galen',  'Hilda',   'Ivar',   'Jora',   'Kael',  'Lyra',
    'Magnar', 'Nessa',   'Orin',   'Petra',  'Quinn', 'Riona',
    'Soren',  'Tova',    'Ulric',  'Vesna',  'Wren',  'Xander',
    'Yara',   'Zorin',   'Aric',   'Bryn',   'Caleb', 'Dara',
  ] as const

  const SUFFIXES = [
    'do Norte', 'da Tempestade', 'das Cinzas', 'do Vale',
    'Sombrio',  'Radiante',     'do Lobo',    'da Forja',
    'Errante',  'Implacável',
  ] as const

  // Seed the RNG by level so the pool is stable across runs.
  let seed = (localLevel + 7) * 9301 + 49297
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]

  const out: OfflineRaidTarget[] = []
  for (let i = 0; i < 30; i++) {
    // 60 % of the synthesized pool sits at the exact local level so the
    // strict-equality matchmaking has plenty of candidates to choose
    // from. The remaining 40 % spreads ±10 levels for flavor / future
    // ranged matchmaking; today they're filtered out by the strict pass.
    const levelOffset = rand() < 0.6
      ? 0
      : Math.round((rand() - 0.5) * 20)
    const level = Math.max(1, localLevel + levelOffset)
    const teamPower = 200 + Math.round(level * 4 + rand() * 30)
    const defenseStrength = Math.round(40 + rand() * 50)
    const hoursOffline = 1 + Math.round(rand() * 47) // 1..48h offline
    const lastSeenAt = Date.now() - hoursOffline * 3600 * 1000

    // ~70% of the synthesized pool has participation toggled ON.
    // Off-pool entries simulate players who opted out and should not
    // appear in matchmaking, mirroring how the real backend will only
    // return participating accounts.
    const participating = rand() < 0.7

    out.push({
      id: `raid-mock-${i}-${level}`,
      ownerName: `${pick(FANTASY_NAMES)} ${pick(SUFFIXES)}`,
      ownerLevel: level,
      participating,
      teamPower,
      defenseStrength,
      lastSeenAt,
      rewardEstimate: {
        masteryAttack:  10 + Math.round(level * 0.6 + rand() * 8),
        masteryDefense: 4  + Math.round(level * 0.3 + rand() * 4),
        gold:           50 + Math.round(level * 2.5 + rand() * 30),
      },
    })
  }
  return out
}
