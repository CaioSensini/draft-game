import { getRoleCards } from '../data/cardTemplates'
import type { CardData, UnitRole } from '../types'
import type { UnitDeck } from './Unit'

/**
 * Look up a card by its ID within a role's card pool.
 * Returns null if the ID is not found (guards against stale deck configs).
 */
export function getCardById(role: UnitRole, cardId: string): CardData | null {
  return getRoleCards(role).find((card) => card.id === cardId) ?? null
}

/**
 * Rotate a used card to the back of its queue (attack or defense).
 * Implements the deck-cycling mechanic so every card is eventually reused.
 */
export function rotateCardInDeck(deck: UnitDeck, card: CardData): void {
  const queue = card.category === 'attack' ? deck.attackQueue : deck.defenseQueue
  const index = queue.indexOf(card.id)
  if (index === -1) return
  queue.splice(index, 1)
  queue.push(card.id)
}
