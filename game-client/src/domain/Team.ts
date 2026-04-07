/**
 * domain/Team.ts — a group of Characters fighting on one side of the board.
 *
 * Team is an aggregate root for its Characters. It provides:
 *   - A typed collection with identity-based lookup
 *   - Derived queries (living units, king alive, adjacency)
 *   - A losing condition (king eliminated)
 *   - Deck access via CharacterDeck (attack + defense queues)
 *
 * Responsibility boundary:
 *   Team knows about its own characters and their relationships to each other.
 *   It does NOT know about the enemy team — cross-team queries belong to Battle.
 *
 * No Phaser, no UI, no engine dependencies.
 */

import { Character } from './Character'
import type { CharacterRole, CharacterSide } from './Character'
import { CharacterDeck, buildCharacterDeck } from './Deck'
import type { DeckConfig } from './Deck'

// ── Deck configuration ────────────────────────────────────────────────────────

export type TeamDeckConfig = Partial<Record<CharacterRole, DeckConfig>>

// ── Team ──────────────────────────────────────────────────────────────────────

export class Team {
  readonly side: CharacterSide

  private readonly _characters: Map<string, Character>
  private readonly _decks:      Map<string, CharacterDeck>

  constructor(side: CharacterSide, characters: Character[], deckConfig: TeamDeckConfig = {}) {
    this.side        = side
    this._characters = new Map(characters.map((c) => [c.id, c]))
    this._decks      = new Map()

    for (const character of characters) {
      const config = deckConfig[character.role]
      if (config) {
        this._decks.set(character.id, buildCharacterDeck(character.id, config))
      }
    }
  }

  // ── Collection queries ────────────────────────────────────────────────────

  /** All characters on this team (living and dead). */
  get all(): ReadonlyArray<Character> {
    return [...this._characters.values()]
  }

  /** All living characters. */
  get living(): ReadonlyArray<Character> {
    return this.all.filter((c) => c.alive)
  }

  /** Number of characters still alive. */
  get livingCount(): number {
    return this.living.length
  }

  // ── Identity lookup ───────────────────────────────────────────────────────

  /** Find a character by ID. Returns null if not on this team. */
  getById(id: string): Character | null {
    return this._characters.get(id) ?? null
  }

  /** Find a character by role. Returns null if not found. */
  getByRole(role: CharacterRole): Character | null {
    return this.all.find((c) => c.role === role) ?? null
  }

  /** True if `id` belongs to this team. */
  has(id: string): boolean {
    return this._characters.has(id)
  }

  // ── Win / loss condition ──────────────────────────────────────────────────

  /** The king character, regardless of alive status. Null if team has no king. */
  get king(): Character | null {
    return this.getByRole('king')
  }

  /** True if the king has been eliminated. Losing condition for this team. */
  get isDefeated(): boolean {
    return this.king?.alive === false
  }

  // ── Spatial queries ───────────────────────────────────────────────────────

  /**
   * All living allies at Manhattan distance exactly 1 from `character`.
   * Used for warrior guard checks and executor isolation.
   */
  adjacentTo(character: Character): Character[] {
    return this.living.filter(
      (other) =>
        other.id !== character.id &&
        Math.abs(other.col - character.col) + Math.abs(other.row - character.row) === 1,
    )
  }

  /**
   * True if `character` has no living allies adjacent to it.
   * Executor isolation bonus triggers when this is true.
   */
  isIsolated(character: Character): boolean {
    return this.adjacentTo(character).length === 0
  }

  /**
   * True if any living warrior on this team is adjacent to `character`.
   * Reduces incoming damage for `character`.
   */
  hasWarriorGuard(character: Character): boolean {
    return this.living.some(
      (ally) =>
        ally.role === 'warrior' &&
        ally.id !== character.id &&
        Math.abs(ally.col - character.col) + Math.abs(ally.row - character.row) === 1,
    )
  }

  /**
   * True if `character` is on the wall column for this team's side.
   * Wall-touching characters receive a damage mitigation bonus.
   */
  isTouchingWall(character: Character, wallCol = 8): boolean {
    return this.side === 'left'
      ? character.col === wallCol - 1
      : character.col === wallCol
  }

  /** Number of living characters currently touching the wall. */
  wallTouchCount(wallCol = 8): number {
    return this.living.filter((c) => this.isTouchingWall(c, wallCol)).length
  }

  /**
   * The living character with the lowest HP ratio.
   * Used for `lowest_ally` targeting.
   */
  lowestHpCharacter(): Character | null {
    let best:     Character | null = null
    let bestRatio = Infinity

    for (const character of this.living) {
      const ratio = character.hpRatio
      if (ratio < bestRatio) { bestRatio = ratio; best = character }
    }
    return best
  }

  // ── Deck access ───────────────────────────────────────────────────────────

  /**
   * The full CharacterDeck (attack + defense) for a character.
   * Returns null if no deck was configured for this character.
   */
  deck(characterId: string): CharacterDeck | null {
    return this._decks.get(characterId) ?? null
  }

  /**
   * The attack SkillQueue for a character.
   * Convenience accessor — equivalent to `team.deck(id)?.attack`.
   */
  attackDeck(characterId: string): CharacterDeck['attack'] | null {
    return this._decks.get(characterId)?.attack ?? null
  }

  /**
   * The defense SkillQueue for a character.
   * Convenience accessor — equivalent to `team.deck(id)?.defense`.
   */
  defenseDeck(characterId: string): CharacterDeck['defense'] | null {
    return this._decks.get(characterId)?.defense ?? null
  }

  /** Reset all character decks to their initial order (between battles). */
  resetDecks(): void {
    for (const deck of this._decks.values()) deck.reset()
  }

  // ── Display ───────────────────────────────────────────────────────────────

  toString(): string {
    const status = this.isDefeated ? 'DEFEATED' : `${this.livingCount} alive`
    return `Team[${this.side}] ${status}: ${this.all.map((c) => c.name).join(', ')}`
  }
}
