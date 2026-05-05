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
  /** Aggregate team power (sum of unit stats) — secondary sort hint. */
  teamPower: number
  /** Defense rating of the offline team (0–100). Higher = harder raid. */
  defenseStrength: number
  /** When the owner was last online (ms epoch). Older targets give bonus loot. */
  lastSeenAt: number
  /** Estimated rewards if the raid succeeds. */
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
 * Flip to true once the server endpoint is live. The lobby tile reads this
 * to decide whether the click opens the target picker or the explainer
 * popup that introduces the feature.
 */
export function isOfflineRaidLive(): boolean {
  return false
}

/**
 * Whether the "ENTRAR" CTA on the explainer popup is interactive.
 *
 * The user wanted the button reachable for QA but plans to lock it before
 * launch. Flip to false at release time; the popup will keep showing the
 * button at full opacity but the click handler short-circuits.
 *
 * Kept separate from `isOfflineRaidLive` because that flag governs the
 * lobby tile's primary action (target picker vs. explainer), while this
 * flag governs only the "Enter" CTA inside the explainer.
 */
export function isOfflineRaidEnterUnlocked(): boolean {
  return true
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
 * Pick offline raid targets for the given local level.
 *
 * Mock implementation walks a deterministic synthesized pool (~30 entries)
 * and returns the top N closest-level targets. Real implementation will
 * `await fetch('/api/offline-raids/targets?level=...')` and map the
 * response to OfflineRaidTarget[].
 */
export function findOfflineRaidTargets(opts: RaidMatchmakingOptions): OfflineRaidTarget[] {
  const limit = opts.limit ?? 5
  const tolerance = opts.levelTolerance ?? 5

  const pool = synthesizePool(opts.localLevel)

  // Strict pass: only ±tolerance levels.
  const strict = pool
    .filter((t) => Math.abs(t.ownerLevel - opts.localLevel) <= tolerance)
    .sort(byLevelProximity(opts.localLevel))

  if (strict.length >= limit) return strict.slice(0, limit)

  // Widen the net: ±(tolerance × 2). The mock pool guarantees enough.
  const wide = pool
    .filter((t) => Math.abs(t.ownerLevel - opts.localLevel) <= tolerance * 2)
    .sort(byLevelProximity(opts.localLevel))

  return wide.slice(0, limit)
}

// ─── Internals ──────────────────────────────────────────────────────────

function byLevelProximity(localLevel: number) {
  return (a: OfflineRaidTarget, b: OfflineRaidTarget): number => {
    const da = Math.abs(a.ownerLevel - localLevel)
    const db = Math.abs(b.ownerLevel - localLevel)
    if (da !== db) return da - db
    // Tiebreaker: weaker defense first (gentler intro for newcomers).
    return a.defenseStrength - b.defenseStrength
  }
}

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
    // Spread targets across ±15 levels around the local player.
    const levelOffset = Math.round((rand() - 0.5) * 30)
    const level = Math.max(1, localLevel + levelOffset)
    const teamPower = 200 + Math.round(level * 4 + rand() * 30)
    const defenseStrength = Math.round(40 + rand() * 50)
    const hoursOffline = 1 + Math.round(rand() * 47) // 1..48h offline
    const lastSeenAt = Date.now() - hoursOffline * 3600 * 1000

    out.push({
      id: `raid-mock-${i}-${level}`,
      ownerName: `${pick(FANTASY_NAMES)} ${pick(SUFFIXES)}`,
      ownerLevel: level,
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
