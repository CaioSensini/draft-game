import type { UnitRole } from '../types'

/**
 * Canonical passive ability descriptions for each unit role.
 * Single source of truth — used by both ArenaScene (HUD) and DeckBuildScene (deck builder).
 */

/** Short form — shown in the arena HUD tooltip and card hint bar. */
export const ROLE_PASSIVE_SHORT: Record<UnitRole, string> = {
  king:       'Rei: teleporte livre no próprio lado.',
  warrior:    'Guerreiro: reduz dano em aliados adjacentes.',
  specialist: 'Especialista: ataques aplicam redução de cura.',
  executor:   'Executor: ganha dano extra quando isolado.',
}

/** Long form — shown in the deck builder passive description row. */
export const ROLE_PASSIVE_LONG: Record<UnitRole, string> = {
  king:       'Passiva: Teleporte livre no próprio lado durante a fase de movimento.',
  warrior:    'Passiva: Aliados adjacentes recebem −25% de dano.',
  specialist: 'Passiva: Todo ataque aplica −50% de cura no inimigo atingido por 2 turnos.',
  executor:   'Passiva: +8 de dano extra quando sem aliados adjacentes (isolado).',
}
