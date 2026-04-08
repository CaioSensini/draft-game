import type { UnitRole } from '../types'

/**
 * Canonical passive ability descriptions for each unit role.
 * Single source of truth — used by both BattleScene (HUD) and DeckBuildScene (deck builder).
 */

/** Short form — shown in the arena HUD tooltip and card hint bar. */
export const ROLE_PASSIVE_SHORT: Record<UnitRole, string> = {
  king:       'Proteção Real: -15% dano recebido (permanente)',
  warrior:    'Protetor: aliados adjacentes ganham -15% dano',
  specialist: 'Queimação: ataques reduzem cura inimiga em 20%',
  executor:   'Isolado: +15% dano quando sem ninguém adjacente',
}

/** Long form — shown in the deck builder passive description row. */
export const ROLE_PASSIVE_LONG: Record<UnitRole, string> = {
  king:       'Passiva: Proteção Real — O rei possui um pequeno escudo renovado a cada turno, reduzindo permanentemente 15% de todo dano recebido.',
  warrior:    'Passiva: Protetor — Aliados adjacentes ao guerreiro (8 tiles ao redor) ganham 15% de mitigação de dano. O guerreiro NÃO recebe esse bônus.',
  specialist: 'Passiva: Queimação — Inimigos atingidos pelas habilidades do especialista ficam com cura recebida reduzida em 20% por 1 turno.',
  executor:   'Passiva: Isolado — Se não tiver ninguém nos 8 tiles adjacentes, o executor ganha +15% de dano em todas as skills de ataque.',
}
