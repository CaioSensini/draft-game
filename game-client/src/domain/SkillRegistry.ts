/**
 * domain/SkillRegistry.ts — central catalog of all skills in the game.
 *
 * Responsibilities:
 *   - Hold every SkillDefinition loaded at startup.
 *   - Validate definitions on registration (no duplicate IDs).
 *   - Convert raw definitions into Skill value-objects on demand.
 *   - Build DeckConfig objects from lists of skill IDs so that
 *     callers never need to touch Skill constructors directly.
 *
 * Adding a new skill to the game requires ONLY adding its SkillDefinition
 * to the catalog data file — no changes to the registry or engine code.
 *
 * No Phaser, no UI, no engine dependencies.
 */

import { Skill } from './Skill'
import type { SkillDefinition } from './Skill'
import type { DeckConfig } from './Deck'

// ── Validation ────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS: ReadonlyArray<keyof SkillDefinition> = [
  'id', 'name', 'category', 'group', 'effectType', 'targetType', 'power',
]

function _validateDef(def: SkillDefinition): void {
  for (const field of REQUIRED_FIELDS) {
    if (def[field] === undefined || def[field] === null) {
      throw new Error(`SkillRegistry: skill "${def.id ?? '(no id)'}" is missing required field "${field}"`)
    }
  }
  if (typeof def.power !== 'number' || def.power < 0) {
    throw new Error(`SkillRegistry: skill "${def.id}" has invalid power (${def.power})`)
  }
  if (def.range !== undefined && (typeof def.range !== 'number' || def.range < 0)) {
    throw new Error(`SkillRegistry: skill "${def.id}" has invalid range (${def.range})`)
  }
  // Validate the secondaryEffects array (v3+ schema).
  if (def.secondaryEffects !== undefined) {
    if (!Array.isArray(def.secondaryEffects)) {
      throw new Error(`SkillRegistry: skill "${def.id}" secondaryEffects must be an array`)
    }
    for (let i = 0; i < def.secondaryEffects.length; i++) {
      const sec = def.secondaryEffects[i]
      if (!sec.effectType) {
        throw new Error(`SkillRegistry: skill "${def.id}" secondaryEffects[${i}] is missing effectType`)
      }
      if (typeof sec.power !== 'number') {
        throw new Error(`SkillRegistry: skill "${def.id}" secondaryEffects[${i}] has invalid power`)
      }
    }
  }
  // Validate the legacy single-secondary shape (still accepted, normalized at construction).
  if (def.secondaryEffect !== undefined) {
    if (!def.secondaryEffect.effectType) {
      throw new Error(`SkillRegistry: skill "${def.id}" secondaryEffect is missing effectType`)
    }
    if (typeof def.secondaryEffect.power !== 'number') {
      throw new Error(`SkillRegistry: skill "${def.id}" secondaryEffect has invalid power`)
    }
  }
}

// ── SkillRegistry ─────────────────────────────────────────────────────────────

export class SkillRegistry {
  private readonly _skills: Map<string, Skill> = new Map()

  /**
   * Build a registry pre-loaded with `catalog`.
   * Throws on the first validation error or duplicate ID.
   */
  constructor(catalog: SkillDefinition[] = []) {
    for (const def of catalog) {
      this.register(def)
    }
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Add a single skill definition to the registry.
   * Throws if the ID already exists or if the definition is invalid.
   * This is the ONLY place where new skills enter the system — no engine
   * changes required when calling this with a new SkillDefinition.
   */
  register(def: SkillDefinition): void {
    _validateDef(def)
    if (this._skills.has(def.id)) {
      throw new Error(`SkillRegistry: duplicate skill ID "${def.id}"`)
    }
    this._skills.set(def.id, new Skill(def))
  }

  /**
   * Add or replace a skill definition (safe re-registration).
   * Use for hot-reloading or test overrides.
   */
  registerOrReplace(def: SkillDefinition): void {
    _validateDef(def)
    this._skills.set(def.id, new Skill(def))
  }

  // ── Lookup ────────────────────────────────────────────────────────────────

  /** Returns the Skill for `id`. Throws if not found. */
  get(id: string): Skill {
    const skill = this._skills.get(id)
    if (!skill) throw new Error(`SkillRegistry: unknown skill "${id}"`)
    return skill
  }

  /** Returns the Skill for `id`, or null if not found. */
  find(id: string): Skill | null {
    return this._skills.get(id) ?? null
  }

  /** Returns Skills for all `ids` in order. Throws on any unknown ID. */
  getMany(ids: string[]): Skill[] {
    return ids.map((id) => this.get(id))
  }

  /** True if `id` is registered. */
  has(id: string): boolean {
    return this._skills.has(id)
  }

  /** Every registered skill in registration order. */
  get all(): ReadonlyArray<Skill> {
    return [...this._skills.values()]
  }

  /** All skills of a given category. */
  byCategory(category: 'attack' | 'defense'): Skill[] {
    return this.all.filter((s) => s.category === category)
  }

  /** Total number of registered skills. */
  get size(): number {
    return this._skills.size
  }

  // ── Deck construction ─────────────────────────────────────────────────────

  /**
   * Build a DeckConfig from arrays of skill IDs.
   * The result can be passed directly to `Team`, `CharacterDeck`, or
   * `buildCharacterDeck()`.
   *
   * Throws if any ID is unknown.
   *
   * @example
   * const config = registry.buildDeckConfig(
   *   ['lk_a1', 'lk_a2', 'lk_a3', 'lk_a4'],
   *   ['lk_d1', 'lk_d2', 'lk_d3', 'lk_d4'],
   * )
   */
  buildDeckConfig(attackIds: string[], defenseIds: string[]): DeckConfig {
    return {
      attackSkills:  this.getMany(attackIds),
      defenseSkills: this.getMany(defenseIds),
    }
  }

  // ── Display ───────────────────────────────────────────────────────────────

  toString(): string {
    return `SkillRegistry(${this._skills.size} skills)`
  }
}
