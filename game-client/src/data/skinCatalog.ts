/**
 * data/skinCatalog.ts — Single source of truth for every character skin
 * the player can own, equip or buy.
 *
 * Each CharClass has exactly 4 skins:
 *   1. 'idle'                  — default classic skin, granted free to every account
 *   2. '{class}_of_the_kingdom_idle' — common skin distributed in the free
 *                                     battle pass track (never sold in shop)
 *   3. First alternate (epic)  — sold in shop and granted in the premium
 *                                battle pass track
 *   4. Second alternate (legendary) — shop exclusive, rarer DG price
 *
 * Shop, lobby picker and BattleScene all resolve skins through this file,
 * so renaming a skin or tweaking its price only needs to happen once.
 *
 * Names + subtitles live in the i18n bundles (scenes.skins.<class>.<skin-id>.{name,subtitle}).
 * Use `getSkinName(skin)` and `getSkinSubtitle(skin)` to render them in any
 * locale.
 */

import type { CharClass } from '../utils/AssetPaths'
import { t } from '../i18n'

export type SkinRarity = 'default' | 'common' | 'rare' | 'epic' | 'legendary'

/**
 * Definition of a single purchasable skin variant.
 *
 * @field id          The skin key used by AssetPaths (e.g. 'crimson_idle').
 *                    Must exist in CHARACTER_SKINS[classId].
 * @field classId     Which class this skin belongs to.
 * @field rarity      Controls the colour/border used when rendering.
 * @field dgPrice     Cost in DG. Zero for 'default' rarity (always owned).
 *
 * The display name and subtitle are resolved at render time from the i18n
 * bundle key `scenes.skins.<classId>.<id>.{name,subtitle}` — see helpers.
 */
export interface SkinDef {
  id: string
  classId: CharClass
  rarity: SkinRarity
  dgPrice: number
}

/** Every skin the game knows about — keyed by class for fast lookup. */
export const SKIN_CATALOG: Record<CharClass, SkinDef[]> = {
  king: [
    { id: 'idle',                       classId: 'king', rarity: 'default',   dgPrice: 0   },
    { id: 'king_of_the_kingdom_idle',   classId: 'king', rarity: 'common',    dgPrice: 0   },
    { id: 'crimson_idle',               classId: 'king', rarity: 'epic',      dgPrice: 450 },
    { id: 'eternal_idle',               classId: 'king', rarity: 'legendary', dgPrice: 900 },
  ],
  warrior: [
    { id: 'idle',                          classId: 'warrior', rarity: 'default',   dgPrice: 0   },
    { id: 'warrior_of_the_kingdom_idle',   classId: 'warrior', rarity: 'common',    dgPrice: 0   },
    { id: 'ashes_idle',                    classId: 'warrior', rarity: 'epic',      dgPrice: 450 },
    { id: 'radiant_idle',                  classId: 'warrior', rarity: 'legendary', dgPrice: 900 },
  ],
  specialist: [
    { id: 'idle',                              classId: 'specialist', rarity: 'default',   dgPrice: 0   },
    { id: 'specialist_of_the_kingdom_idle',    classId: 'specialist', rarity: 'common',    dgPrice: 0   },
    { id: 'arcane_idle',                       classId: 'specialist', rarity: 'epic',      dgPrice: 450 },
    { id: 'cosmic_idle',                       classId: 'specialist', rarity: 'legendary', dgPrice: 900 },
  ],
  executor: [
    { id: 'idle',                            classId: 'executor', rarity: 'default',   dgPrice: 0   },
    { id: 'executor_of_the_kingdom_idle',    classId: 'executor', rarity: 'common',    dgPrice: 0   },
    { id: 'spectral_idle',                   classId: 'executor', rarity: 'epic',      dgPrice: 450 },
    { id: 'shadow_idle',                     classId: 'executor', rarity: 'legendary', dgPrice: 900 },
  ],
}

// ─── i18n helpers ──────────────────────────────────────────────────────────

/**
 * Resolved display name for a skin in the active locale.
 * Falls back to PT-BR via the standard i18n cascade, then to the raw key.
 */
export function getSkinName(skin: SkinDef): string {
  return t(`scenes.skins.${skin.classId}.${skin.id}.name`)
}

/** Resolved subtitle (italic flavor line) for a skin in the active locale. */
export function getSkinSubtitle(skin: SkinDef): string {
  return t(`scenes.skins.${skin.classId}.${skin.id}.subtitle`)
}

/** Flat list of every skin, in a stable order (useful for the shop grid). */
export function getAllSkins(): SkinDef[] {
  const out: SkinDef[] = []
  const classes: CharClass[] = ['king', 'warrior', 'specialist', 'executor']
  for (const cls of classes) {
    out.push(...SKIN_CATALOG[cls])
  }
  return out
}

/**
 * Only the skins that cost DG (shop grid).
 * Excludes 'default' (starter idle) and 'common' (battle pass free track).
 */
export function getPurchasableSkins(): SkinDef[] {
  return getAllSkins().filter((s) => s.rarity !== 'default' && s.rarity !== 'common')
}

/** Lookup helper — returns null if the id isn't registered for that class. */
export function findSkin(classId: CharClass, skinId: string): SkinDef | null {
  return SKIN_CATALOG[classId].find((s) => s.id === skinId) ?? null
}

// ─── Rendering tokens used by shop + lobby picker ──────────────────────────

/**
 * Colour tokens per rarity. The shop card border and lobby badge both use
 * these so rare/epic/legendary skins feel visibly different to players at a
 * glance, matching AAA conventions (grey → blue → purple → gold).
 */
export const SKIN_RARITY_COLOR: Record<SkinRarity, number> = {
  default:   0x808a9c,  // neutral silver
  common:    0x9bb7d4,  // soft blue-grey (slightly warmer than default)
  rare:      0x4fc3f7,  // cyan / info blue
  epic:      0xc77dff,  // violet
  legendary: 0xf0c850,  // gold
}

export const SKIN_RARITY_HEX: Record<SkinRarity, string> = {
  default:   '#808a9c',
  common:    '#9bb7d4',
  rare:      '#4fc3f7',
  epic:      '#c77dff',
  legendary: '#f0c850',
}

/**
 * Translated rarity label for badges and modal titles. Keyed by the same
 * scenes.shop.rarity.<name> path the shop already uses, so a single i18n
 * source covers shop cards, skin picker badges, and any future surface.
 */
export function getSkinRarityLabel(rarity: SkinRarity): string {
  return t(`scenes.shop.rarity.${rarity}`)
}
