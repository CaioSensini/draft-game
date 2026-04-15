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
 */

import type { CharClass } from '../utils/AssetPaths'

export type SkinRarity = 'default' | 'common' | 'rare' | 'epic' | 'legendary'

/**
 * Definition of a single purchasable skin variant.
 *
 * @field id          The skin key used by AssetPaths (e.g. 'crimson_idle').
 *                    Must exist in CHARACTER_SKINS[classId].
 * @field classId     Which class this skin belongs to.
 * @field displayName Shown on shop cards and lobby picker.
 * @field subtitle    Short descriptive line under the name.
 * @field rarity      Controls the colour/border used when rendering.
 * @field dgPrice     Cost in DG. Zero for 'default' rarity (always owned).
 */
export interface SkinDef {
  id: string
  classId: CharClass
  displayName: string
  subtitle: string
  rarity: SkinRarity
  dgPrice: number
}

/** Every skin the game knows about — keyed by class for fast lookup. */
export const SKIN_CATALOG: Record<CharClass, SkinDef[]> = {
  king: [
    {
      id: 'idle',
      classId: 'king',
      displayName: 'Rei Classico',
      subtitle: 'A coroa eterna da linhagem original',
      rarity: 'default',
      dgPrice: 0,
    },
    {
      id: 'king_of_the_kingdom_idle',
      classId: 'king',
      displayName: 'Rei do Reino',
      subtitle: 'Guardiao das terras fundadoras',
      rarity: 'common',
      dgPrice: 0,
    },
    {
      id: 'crimson_idle',
      classId: 'king',
      displayName: 'Rei da Tempestade',
      subtitle: 'Coroa que ordena raios e trovoes',
      rarity: 'epic',
      dgPrice: 450,
    },
    {
      id: 'eternal_idle',
      classId: 'king',
      displayName: 'Rei do Horizonte',
      subtitle: 'Soberano de terras sem fim',
      rarity: 'legendary',
      dgPrice: 900,
    },
  ],
  warrior: [
    {
      id: 'idle',
      classId: 'warrior',
      displayName: 'Guerreiro Classico',
      subtitle: 'O veterano que abre caminho',
      rarity: 'default',
      dgPrice: 0,
    },
    {
      id: 'warrior_of_the_kingdom_idle',
      classId: 'warrior',
      displayName: 'Guerreiro do Reino',
      subtitle: 'Defensor leal das muralhas',
      rarity: 'common',
      dgPrice: 0,
    },
    {
      id: 'ashes_idle',
      classId: 'warrior',
      displayName: 'Guerreiro da Montanha',
      subtitle: 'Firme como a rocha ancestral',
      rarity: 'epic',
      dgPrice: 450,
    },
    {
      id: 'radiant_idle',
      classId: 'warrior',
      displayName: 'Guerreiro Radiante',
      subtitle: 'Lamina abencoada pela aurora',
      rarity: 'legendary',
      dgPrice: 900,
    },
  ],
  specialist: [
    {
      id: 'idle',
      classId: 'specialist',
      displayName: 'Especialista Classico',
      subtitle: 'Mestre das tecnicas ancestrais',
      rarity: 'default',
      dgPrice: 0,
    },
    {
      id: 'specialist_of_the_kingdom_idle',
      classId: 'specialist',
      displayName: 'Especialista do Reino',
      subtitle: 'Conselheiro dos saberes antigos',
      rarity: 'common',
      dgPrice: 0,
    },
    {
      id: 'arcane_idle',
      classId: 'specialist',
      displayName: 'Especialista Rubi',
      subtitle: 'Sabedoria cristalizada em chama rubra',
      rarity: 'epic',
      dgPrice: 450,
    },
    {
      id: 'cosmic_idle',
      classId: 'specialist',
      displayName: 'Especialista Nebular',
      subtitle: 'Tecelao de nebulosas e cometas',
      rarity: 'legendary',
      dgPrice: 900,
    },
  ],
  executor: [
    {
      id: 'idle',
      classId: 'executor',
      displayName: 'Executor Classico',
      subtitle: 'Sombra afiada e silenciosa',
      rarity: 'default',
      dgPrice: 0,
    },
    {
      id: 'executor_of_the_kingdom_idle',
      classId: 'executor',
      displayName: 'Executor do Reino',
      subtitle: 'Sentinela das estradas reais',
      rarity: 'common',
      dgPrice: 0,
    },
    {
      id: 'spectral_idle',
      classId: 'executor',
      displayName: 'Executor da Brisa',
      subtitle: 'Pes mais leves que o vento da manha',
      rarity: 'epic',
      dgPrice: 450,
    },
    {
      id: 'shadow_idle',
      classId: 'executor',
      displayName: 'Executor da Sombra',
      subtitle: 'Passo silencioso do entardecer',
      rarity: 'legendary',
      dgPrice: 900,
    },
  ],
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

export const SKIN_RARITY_LABEL: Record<SkinRarity, string> = {
  default:   'CLASSICO',
  common:    'COMUM',
  rare:      'RARO',
  epic:      'EPICO',
  legendary: 'LENDARIO',
}
