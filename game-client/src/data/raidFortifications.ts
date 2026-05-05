/**
 * data/raidFortifications.ts — items the player can buy in the Raid Hub
 * to fortify their offline defenses (and, in some cases, hand the player
 * an offensive perk for their own raids).
 *
 * Each item lasts a fixed number of defenses (`durationDefenses`). The
 * counter ticks down on every defense received — successful or not —
 * and the item is removed from the owned list when it hits zero.
 *
 * Effects (`type`) are tagged here as data only; the actual gameplay
 * hookup happens later inside the BattleScene defense flow. The Hub
 * scene uses the tag to render the right icon / colour.
 */

export type FortificationType =
  | 'defense-buff-all'   // +X% defense for every character on your team
  | 'attack-buff-all'    // +X% attack for every character on your team
  | 'king-defense-buff'  // +X% defense, king only (concentrated)
  | 'random-traps'       // N random traps planted on the invader's lane
  | 'reveal-skills'      // Show invader's queued skills 1 turn early
  | 'first-turn-rush'    // +1 movement on the very first turn
  | 'royal-evade'        // King gets one free evade per defense
  | 'gold-multiplier'    // +25% gold reward on victorious defenses

export type FortificationCurrency = 'gold' | 'dg'

export interface FortificationDef {
  /** Stable id used by playerData and the i18n keys. */
  id: string
  /** i18n key for the display name (under scenes.raid-hub.items.<id>.name). */
  nameKey: string
  /** i18n key for the descriptive line below the name. */
  descKey: string
  /** Effect tag — drives the iconography and the future combat hookup. */
  type: FortificationType
  /** Magnitude of the effect (interpretation depends on `type`). */
  magnitude: number
  /** Currency the player pays in. */
  currency: FortificationCurrency
  /** Cost in the chosen currency. */
  cost: number
  /** Number of defenses the buff lasts before the item is consumed. */
  durationDefenses: number
}

export const RAID_FORTIFICATIONS: FortificationDef[] = [
  {
    id:               'reforco-real',
    nameKey:          'scenes.raid-hub.items.reforco-real.name',
    descKey:          'scenes.raid-hub.items.reforco-real.desc',
    type:             'defense-buff-all',
    magnitude:        15,
    currency:         'gold',
    cost:             200,
    durationDefenses: 5,
  },
  {
    id:               'furia-coletiva',
    nameKey:          'scenes.raid-hub.items.furia-coletiva.name',
    descKey:          'scenes.raid-hub.items.furia-coletiva.desc',
    type:             'attack-buff-all',
    magnitude:        15,
    currency:         'gold',
    cost:             200,
    durationDefenses: 5,
  },
  {
    id:               'trap-espinhos',
    nameKey:          'scenes.raid-hub.items.trap-espinhos.name',
    descKey:          'scenes.raid-hub.items.trap-espinhos.desc',
    type:             'random-traps',
    magnitude:        3,        // 3 traps planted
    currency:         'gold',
    cost:             150,
    durationDefenses: 3,
  },
  {
    id:               'muralha-reforcada',
    nameKey:          'scenes.raid-hub.items.muralha-reforcada.name',
    descKey:          'scenes.raid-hub.items.muralha-reforcada.desc',
    type:             'king-defense-buff',
    magnitude:        25,
    currency:         'dg',
    cost:             80,
    durationDefenses: 8,
  },
  {
    id:               'olho-vigia',
    nameKey:          'scenes.raid-hub.items.olho-vigia.name',
    descKey:          'scenes.raid-hub.items.olho-vigia.desc',
    type:             'reveal-skills',
    magnitude:        1,        // 1 turn early
    currency:         'dg',
    cost:             60,
    durationDefenses: 4,
  },
  {
    id:               'bandeira-sorte',
    nameKey:          'scenes.raid-hub.items.bandeira-sorte.name',
    descKey:          'scenes.raid-hub.items.bandeira-sorte.desc',
    type:             'gold-multiplier',
    magnitude:        25,
    currency:         'gold',
    cost:             300,
    durationDefenses: 10,
  },
  {
    id:               'esquiva-real',
    nameKey:          'scenes.raid-hub.items.esquiva-real.name',
    descKey:          'scenes.raid-hub.items.esquiva-real.desc',
    type:             'royal-evade',
    magnitude:        1,
    currency:         'gold',
    cost:             250,
    durationDefenses: 6,
  },
  {
    id:               'avancada-rapida',
    nameKey:          'scenes.raid-hub.items.avancada-rapida.name',
    descKey:          'scenes.raid-hub.items.avancada-rapida.desc',
    type:             'first-turn-rush',
    magnitude:        1,
    currency:         'dg',
    cost:             100,
    durationDefenses: 5,
  },
]

export function findFortification(id: string): FortificationDef | undefined {
  return RAID_FORTIFICATIONS.find((f) => f.id === id)
}
