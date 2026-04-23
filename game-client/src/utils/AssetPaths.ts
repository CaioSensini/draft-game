/**
 * utils/AssetPaths.ts — Single source of truth for static asset keys and paths.
 *
 * Every PNG/image that ships in `public/assets/` must be registered here.
 * BootScene iterates this file to preload everything, and scenes/components
 * use the helpers below to get the texture key for a given character/skin/skill.
 *
 * DO NOT hardcode paths like '/assets/skills/ls_a1.png' in scene code — use
 * `getSkillIconKey(skillId)` instead. This keeps all paths centralized and
 * makes future renames/restructures trivial.
 */

/**
 * Cache-busting query string appended to every asset URL.
 *
 * In dev mode, Vite serves files from `public/` as-is, and browsers cache
 * them aggressively — so if an artist replaces a PNG on disk, the old
 * version keeps showing up until a hard refresh. We append `?v=<timestamp>`
 * at module load so each page reload fetches fresh content.
 *
 * `import.meta.env.DEV` is Vite's compile-time flag — true under
 * `vite dev` regardless of the hostname (covers localhost, 127.0.0.1,
 * LAN IPs, custom dev domains, tunneling URLs, etc.).
 *
 * In production builds, we skip cache-busting so browsers can cache
 * assets normally across visits.
 */
const ASSET_VERSION: string = import.meta.env.DEV ? `?v=${Date.now()}` : ''

// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTERS
// ═══════════════════════════════════════════════════════════════════════════════

export type CharClass = 'king' | 'warrior' | 'specialist' | 'executor'

/** Skin IDs per class. Each maps to a file in /public/assets/characters/{class}/{skin}.png */
export const CHARACTER_SKINS: Record<CharClass, string[]> = {
  king:       ['idle', 'king_of_the_kingdom_idle',       'crimson_idle',  'eternal_idle'],
  warrior:    ['idle', 'warrior_of_the_kingdom_idle',    'ashes_idle',    'radiant_idle'],
  specialist: ['idle', 'specialist_of_the_kingdom_idle', 'arcane_idle',   'cosmic_idle'],
  executor:   ['idle', 'executor_of_the_kingdom_idle',   'spectral_idle', 'shadow_idle'],
}

/**
 * Returns the Phaser texture key for a given character + skin.
 * Example: getCharacterKey('king', 'idle') → 'char_king_idle'
 */
export function getCharacterKey(charClass: CharClass, skin: string = 'idle'): string {
  return `char_${charClass}_${skin}`
}

/**
 * Returns the URL path served by Vite for a given character + skin.
 * Example: getCharacterPath('king', 'idle') → '/assets/characters/king/idle.png'
 */
export function getCharacterPath(charClass: CharClass, skin: string = 'idle'): string {
  return `/assets/characters/${charClass}/${skin}.png${ASSET_VERSION}`
}

/**
 * Flat list of every { key, path } pair for BootScene to preload.
 * Generated from CHARACTER_SKINS above — add new skins there, not here.
 */
export function getAllCharacterAssets(): Array<{ key: string; path: string }> {
  const out: Array<{ key: string; path: string }> = []
  const classes: CharClass[] = ['king', 'warrior', 'specialist', 'executor']
  for (const cls of classes) {
    for (const skin of CHARACTER_SKINS[cls]) {
      out.push({ key: getCharacterKey(cls, skin), path: getCharacterPath(cls, skin) })
    }
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════════
// SKILL ICONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All skill IDs that have an icon PNG in /public/assets/skills/.
 * Only LEFT-side IDs are stored — right-side IDs (rk_, rw_, re_, rs_) reuse
 * the same icons via the 'l' prefix (see getSkillIconKey).
 */
const SKILL_IDS_WITH_ICONS: readonly string[] = [
  // Specialist (ls_)
  'ls_a1', 'ls_a2', 'ls_a3', 'ls_a4', 'ls_a5', 'ls_a6', 'ls_a7', 'ls_a8',
  'ls_d1', 'ls_d2', 'ls_d3', 'ls_d4', 'ls_d5', 'ls_d6', 'ls_d7', 'ls_d8',
  // Warrior (lw_)
  'lw_a1', 'lw_a2', 'lw_a3', 'lw_a4', 'lw_a5', 'lw_a6', 'lw_a7', 'lw_a8',
  'lw_d1', 'lw_d2', 'lw_d3', 'lw_d4', 'lw_d5', 'lw_d6', 'lw_d7', 'lw_d8',
  // Executor (le_)
  'le_a1', 'le_a2', 'le_a3', 'le_a4', 'le_a5', 'le_a6', 'le_a7', 'le_a8',
  'le_d1', 'le_d2', 'le_d3', 'le_d4', 'le_d5', 'le_d6', 'le_d7', 'le_d8',
  // King (lk_)
  'lk_a1', 'lk_a2', 'lk_a3', 'lk_a4', 'lk_a5', 'lk_a6', 'lk_a7', 'lk_a8',
  'lk_d1', 'lk_d2', 'lk_d3', 'lk_d4', 'lk_d5', 'lk_d6', 'lk_d7', 'lk_d8',
] as const

/**
 * Returns the Phaser texture key for a given skill's icon.
 * Normalizes right-side IDs (rk_/rw_/re_/rs_) to left-side (lk_/lw_/le_/ls_)
 * since both sides share the same icons.
 *
 * Example: getSkillIconKey('rs_a1') → 'skill_ls_a1'
 */
export function getSkillIconKey(skillId: string): string {
  // Normalize right side → left side for icon lookup
  const normalized = skillId.replace(/^r/, 'l')
  return `skill_${normalized}`
}

/**
 * Returns the URL path served by Vite for a skill icon.
 * Example: getSkillIconPath('ls_a1') → '/assets/skills/ls_a1.png'
 */
export function getSkillIconPath(skillId: string): string {
  const normalized = skillId.replace(/^r/, 'l')
  return `/assets/skills/${normalized}.png${ASSET_VERSION}`
}

/**
 * Flat list of every { key, path } pair for BootScene to preload.
 * Only left-side IDs — right side reuses the same textures.
 */
export function getAllSkillAssets(): Array<{ key: string; path: string }> {
  return SKILL_IDS_WITH_ICONS.map((id) => ({
    key: getSkillIconKey(id),
    path: getSkillIconPath(id),
  }))
}

/**
 * Checks whether a given skill ID has a loaded icon texture.
 * Useful for UI components that want to fall back to abbrev text
 * when the icon isn't available.
 */
export function hasSkillIcon(scene: Phaser.Scene, skillId: string): boolean {
  const key = getSkillIconKey(skillId)
  return scene.textures.exists(key)
}

/**
 * Checks whether a given character + skin has a loaded sprite texture.
 */
export function hasCharacterSprite(
  scene: Phaser.Scene,
  charClass: CharClass,
  skin: string = 'idle',
): boolean {
  const key = getCharacterKey(charClass, skin)
  return scene.textures.exists(key)
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM SVGs (Phase 1 — wordmark, class sigils, currency icons)
// ═══════════════════════════════════════════════════════════════════════════════

export type DesignSvgEntry = { key: string; path: string; width: number; height: number }

export const DESIGN_SVG_ASSETS: readonly DesignSvgEntry[] = [
  { key: 'logo-wordmark',          path: '/assets/logo/draft-game-wordmark.svg',        width: 1200, height: 400 },
  { key: 'sigil-rei',              path: '/assets/icons/classes/rei.svg',               width: 64,  height: 64 },
  { key: 'sigil-guerreiro',        path: '/assets/icons/classes/guerreiro.svg',         width: 64,  height: 64 },
  { key: 'sigil-executor',         path: '/assets/icons/classes/executor.svg',          width: 64,  height: 64 },
  { key: 'sigil-especialista',     path: '/assets/icons/classes/especialista.svg',      width: 64,  height: 64 },
  { key: 'currency-gold',          path: '/assets/icons/currency/gold.svg',             width: 32,  height: 32 },
  { key: 'currency-dg',            path: '/assets/icons/currency/dg.svg',               width: 32,  height: 32 },
] as const

export function getAllDesignSvgAssets(): ReadonlyArray<DesignSvgEntry> {
  return DESIGN_SVG_ASSETS.map((a) => ({ ...a, path: `${a.path}${ASSET_VERSION}` }))
}

export function getClassSigilKey(charClass: CharClass): string {
  const map: Record<CharClass, string> = {
    king:       'sigil-rei',
    warrior:    'sigil-guerreiro',
    executor:   'sigil-executor',
    specialist: 'sigil-especialista',
  }
  return map[charClass]
}

// ═══════════════════════════════════════════════════════════════════════════════
// LUCIDE UI ICONS (Sub 1.9 — 2026-04-21)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Curated subset of Lucide SVGs copied to /public/assets/icons/ui/ by
// `npm run assets:lucide` (scripts/copy-lucide-icons.mjs). Icons are loaded
// at 2× their on-screen size (48 → 24 render) so Phaser's SVG rasterizer
// produces crisp results when downscaled.
//
// Source: lucide-static@^1.8.0 (dev dep). Not bundled — consumed as static
// public assets only.
// ═══════════════════════════════════════════════════════════════════════════════

/** Keys match the SVG filename stem (e.g. `arrow-left` → `icon-ui-arrow-left`). */
export const LUCIDE_ICON_NAMES = [
  'arrow-left', 'flag', 'x', 'settings', 'timer',
  'swords', 'shield', 'heart-pulse', 'droplet', 'flame',
  'snowflake', 'zap', 'wind', 'crown',
] as const

export type LucideIconName = typeof LUCIDE_ICON_NAMES[number]

/** Phaser texture key for a Lucide icon (e.g. `icon-ui-swords`). */
export function getLucideIconKey(name: LucideIconName): string {
  return `icon-ui-${name}`
}

/** All Lucide icon descriptors ready for BootScene preload. 48×48 source. */
export function getAllLucideIconAssets(): ReadonlyArray<DesignSvgEntry> {
  return LUCIDE_ICON_NAMES.map((name) => ({
    key: getLucideIconKey(name),
    path: `/assets/icons/ui/${name}.svg${ASSET_VERSION}`,
    width: 48,
    height: 48,
  }))
}
