/**
 * domain/Deck.ts — skill rotation system for combat.
 *
 * Each Character carries two independent rotating queues:
 *   attackQueue  — 4 attack skills, 2 visible at a time
 *   defenseQueue — 4 defense skills, 2 visible at a time
 *
 * Rotation rule (applied every time a skill is used):
 *   1. Remove the used skill from its current position.
 *   2. Append it to the back of the queue.
 *   3. The skill that was just behind the hand (position handSize) slides in.
 *
 * Example — handSize=2, queue=[A, B, C, D]:
 *   hand=[A,B]   →   use A   →   queue=[B,C,D,A], hand=[B,C]   (+C entered)
 *   hand=[A,B]   →   use B   →   queue=[A,C,D,B], hand=[A,C]   (+C entered)
 *
 * CharacterDeck owns both queues for one character and is the public API.
 *
 * No Phaser, no UI, no engine dependencies.
 */

import type { Skill } from './Skill'

// ── Configuration ──────────────────────────────────────────────────────────────

/** Standard deck sizes enforced by the game rules. */
export const DECK_SIZE = 4
export const HAND_SIZE = 2

/** Input required to build a CharacterDeck. */
export interface DeckConfig {
  /** Exactly DECK_SIZE attack skills. */
  attackSkills:  Skill[]
  /** Exactly DECK_SIZE defense skills. */
  defenseSkills: Skill[]
}

// ── Rotation result ────────────────────────────────────────────────────────────

/** Describes what changed when a skill was used. */
export interface RotationResult {
  /** The skill that was used and moved to the back. */
  readonly used:         Skill
  /** The skill that entered the hand as a result (was at position handSize). */
  readonly enteredHand:  Skill | null
  /** The hand state immediately after rotation. */
  readonly newHand:      ReadonlyArray<Skill>
}

// ── SkillQueue ─────────────────────────────────────────────────────────────────

/**
 * A single-category rotating queue (attack-only or defense-only).
 *
 * The queue holds all skills in order. The first `handSize` are the
 * "current hand" — the only skills the player can select from.
 * Every time one is used it rotates to the back.
 */
export class SkillQueue {
  private _queue: Skill[]
  private readonly _original: Skill[]
  readonly handSize: number
  readonly category: 'attack' | 'defense'

  /**
   * @param skills   All skills in initial order (must be > 0; ideally DECK_SIZE).
   * @param category Used only for display/debugging.
   * @param handSize How many are visible at once (default: HAND_SIZE = 2).
   */
  constructor(
    skills: Skill[],
    category: 'attack' | 'defense',
    handSize: number = HAND_SIZE,
  ) {
    if (skills.length === 0) throw new Error('SkillQueue requires at least one skill')
    if (handSize < 1)        throw new Error('handSize must be ≥ 1')
    if (handSize > skills.length) throw new Error('handSize cannot exceed the number of skills')

    this.category  = category
    this.handSize  = handSize
    this._queue    = [...skills]
    this._original = [...skills]
  }

  // ── Hand access ────────────────────────────────────────────────────────────

  /** The currently visible skills (slice of the front of the queue). */
  get hand(): ReadonlyArray<Skill> {
    return this._queue.slice(0, this.handSize)
  }

  /** The skills NOT currently in hand (waiting in the back). */
  get bench(): ReadonlyArray<Skill> {
    return this._queue.slice(this.handSize)
  }

  /** Full queue in current order (hand first, then bench). */
  get all(): ReadonlyArray<Skill> {
    return this._queue
  }

  /** Total number of skills in the queue. */
  get size(): number {
    return this._queue.length
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** True if the skill with `skillId` is currently in the hand. */
  inHand(skillId: string): boolean {
    return this.hand.some((s) => s.id === skillId)
  }

  /** Skill at the given queue position (0-indexed). Null if out of bounds. */
  peek(index: number): Skill | null {
    return this._queue[index] ?? null
  }

  /** The skill that will enter the hand when the front card rotates out. */
  get nextInLine(): Skill | null {
    return this._queue[this.handSize] ?? null
  }

  /** Find a skill in the queue by ID regardless of position. */
  find(skillId: string): Skill | null {
    return this._queue.find((s) => s.id === skillId) ?? null
  }

  // ── Mutation ───────────────────────────────────────────────────────────────

  /**
   * Use the skill with `skillId`, rotating it to the back of the queue.
   *
   * The skill must be in the current hand; using a bench skill is not allowed.
   * Returns the rotation result, or null if the skill is not in hand.
   */
  use(skillId: string): RotationResult | null {
    if (!this.inHand(skillId)) return null

    const idx  = this._queue.findIndex((s) => s.id === skillId)
    const used = this._queue[idx]

    // Capture what will enter the hand before mutation
    const nextIncoming = this._queue[this.handSize] ?? null

    // Remove from current position, append to back
    this._queue.splice(idx, 1)
    this._queue.push(used)

    return {
      used,
      enteredHand: nextIncoming,
      newHand:     this.hand,
    }
  }

  /**
   * Use a skill by reference (convenience wrapper around `use(id)`).
   * Returns null if the skill is not in the current hand.
   */
  useSkill(skill: Skill): RotationResult | null {
    return this.use(skill.id)
  }

  /**
   * Force-rotate `skill` to the back without validation.
   * Used by CombatEngine after verifying the selection is valid.
   * Alias for `use()` that accepts a Skill object; returns void for callers
   * that don't need the rotation report.
   */
  rotate(skill: Skill): void {
    this.use(skill.id)
  }

  /**
   * Restore the queue to its original construction order.
   * Useful for resetting decks between battles.
   */
  reset(): void {
    this._queue = [...this._original]
  }

  // ── Display ────────────────────────────────────────────────────────────────

  toString(): string {
    const handStr  = this.hand.map((s) => s.name).join(', ')
    const benchStr = this.bench.map((s) => s.name).join(', ')
    return `SkillQueue[${this.category}] hand=[${handStr}] bench=[${benchStr}]`
  }
}

// ── CharacterDeck ──────────────────────────────────────────────────────────────

/**
 * A character's complete deck: one attack queue + one defense queue.
 *
 * This is the single object handed out by Team and consumed by CombatEngine.
 * All interactions (selection, validation, rotation) go through here.
 */
export class CharacterDeck {
  readonly characterId: string
  readonly attack:  SkillQueue
  readonly defense: SkillQueue

  constructor(characterId: string, config: DeckConfig, handSize: number = HAND_SIZE) {
    if (config.attackSkills.length  === 0) throw new Error(`${characterId}: attackSkills cannot be empty`)
    if (config.defenseSkills.length === 0) throw new Error(`${characterId}: defenseSkills cannot be empty`)

    this.characterId = characterId
    this.attack      = new SkillQueue(config.attackSkills,  'attack',  handSize)
    this.defense     = new SkillQueue(config.defenseSkills, 'defense', handSize)
  }

  // ── Snapshots ──────────────────────────────────────────────────────────────

  /** Current attack hand. */
  get attackHand(): ReadonlyArray<Skill> { return this.attack.hand }

  /** Current defense hand. */
  get defenseHand(): ReadonlyArray<Skill> { return this.defense.hand }

  /** Both hands combined. */
  get currentHand(): { attack: ReadonlyArray<Skill>; defense: ReadonlyArray<Skill> } {
    return { attack: this.attack.hand, defense: this.defense.hand }
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  /** True if the attack skill with `skillId` is currently available. */
  canUseAttack(skillId: string): boolean {
    return this.attack.inHand(skillId)
  }

  /** True if the defense skill with `skillId` is currently available. */
  canUseDefense(skillId: string): boolean {
    return this.defense.inHand(skillId)
  }

  // ── Usage (triggers rotation) ──────────────────────────────────────────────

  /**
   * Use an attack skill by ID. Rotates the skill to the back.
   * Returns the rotation result or null if the skill is not in hand.
   */
  useAttack(skillId: string): RotationResult | null {
    return this.attack.use(skillId)
  }

  /**
   * Use a defense skill by ID. Rotates the skill to the back.
   * Returns the rotation result or null if the skill is not in hand.
   */
  useDefense(skillId: string): RotationResult | null {
    return this.defense.use(skillId)
  }

  /**
   * Use both selected skills in one call.
   * Passing null for either skips that rotation.
   * Returns both rotation results.
   */
  useBoth(
    attackId: string | null,
    defenseId: string | null,
  ): { attack: RotationResult | null; defense: RotationResult | null } {
    return {
      attack:  attackId  ? this.attack.use(attackId)   : null,
      defense: defenseId ? this.defense.use(defenseId) : null,
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────

  /** Restore both queues to their original order (use between battles). */
  reset(): void {
    this.attack.reset()
    this.defense.reset()
  }

  // ── Display ────────────────────────────────────────────────────────────────

  toString(): string {
    return `CharacterDeck[${this.characterId}]\n  ${this.attack}\n  ${this.defense}`
  }
}

// ── DeckBuilder ───────────────────────────────────────────────────────────────

/**
 * Validates and constructs a CharacterDeck from a config object.
 *
 * Enforces the game rule: exactly DECK_SIZE skills per category.
 * Throws descriptive errors for configuration mistakes.
 */
export function buildCharacterDeck(
  characterId: string,
  config: DeckConfig,
  handSize: number = HAND_SIZE,
): CharacterDeck {
  _validateDeckConfig(characterId, config)
  return new CharacterDeck(characterId, config, handSize)
}

function _validateDeckConfig(characterId: string, config: DeckConfig): void {
  const { attackSkills, defenseSkills } = config

  if (attackSkills.length !== DECK_SIZE) {
    throw new Error(
      `${characterId}: expected ${DECK_SIZE} attack skills, got ${attackSkills.length}`,
    )
  }
  if (defenseSkills.length !== DECK_SIZE) {
    throw new Error(
      `${characterId}: expected ${DECK_SIZE} defense skills, got ${defenseSkills.length}`,
    )
  }

  const checkDuplicates = (skills: Skill[], label: string) => {
    const ids = skills.map((s) => s.id)
    const unique = new Set(ids)
    if (unique.size !== ids.length) {
      throw new Error(`${characterId}: duplicate skill IDs in ${label} deck`)
    }
  }
  checkDuplicates(attackSkills,  'attack')
  checkDuplicates(defenseSkills, 'defense')
}

// ── TeamDecks ─────────────────────────────────────────────────────────────────

/**
 * Manages decks for an entire team.
 * Thin wrapper over a Map so callers don't manage the Map themselves.
 */
export class TeamDecks {
  private readonly _decks: Map<string, CharacterDeck> = new Map()

  /** Register a pre-built deck. */
  set(deck: CharacterDeck): void {
    this._decks.set(deck.characterId, deck)
  }

  /** Build and register a deck from config. */
  build(characterId: string, config: DeckConfig, handSize?: number): CharacterDeck {
    const deck = buildCharacterDeck(characterId, config, handSize)
    this._decks.set(characterId, deck)
    return deck
  }

  /** Retrieve a deck. Returns null if none was registered. */
  get(characterId: string): CharacterDeck | null {
    return this._decks.get(characterId) ?? null
  }

  /** True if a deck exists for this character. */
  has(characterId: string): boolean {
    return this._decks.has(characterId)
  }

  /** Reset all decks (call between battles). */
  resetAll(): void {
    for (const deck of this._decks.values()) deck.reset()
  }

  /** All character IDs that have decks registered. */
  get characterIds(): string[] {
    return [...this._decks.keys()]
  }
}
