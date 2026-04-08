/**
 * domain/Skill.ts — a skill/card that a Character can use in combat.
 *
 * Skill is a value object: it is fully described by its properties and
 * has no mutable state. Two skills with identical properties are equivalent.
 *
 * Responsibility boundary:
 *   Skill describes WHAT a card does and WHO it can target.
 *   It does NOT perform the resolution — that belongs to the engine, which
 *   needs access to both characters' stats, the board state, and the event bus.
 *
 * No Phaser, no UI, no engine dependencies.
 */

import type { CharacterRole, CharacterSide } from './Character'
import type { AreaShape } from './Grid'

// ── Type aliases ──────────────────────────────────────────────────────────────

export type SkillCategory  = 'attack' | 'defense'
export type SkillGroup     = 'attack1' | 'attack2' | 'defense1' | 'defense2'
export type SkillTargetType = 'single' | 'self' | 'lowest_ally' | 'all_allies' | 'area'

export type SkillEffectType =
  // ── Offensive ──
  | 'damage'        // direct HP damage
  | 'bleed'         // damage over time (physical laceration)
  | 'poison'        // damage over time (toxic — stacks with bleed)
  | 'stun'          // prevent action for N rounds
  | 'area'          // AoE damage (area + damage combined)
  // ── Offensive stat debuffs ──
  | 'def_down'      // reduce target's defense
  | 'atk_down'      // reduce target's attack
  | 'mov_down'      // reduce target's mobility
  // ── Defensive ──
  | 'heal'          // restore HP
  | 'shield'        // grant absorb buffer
  | 'evade'         // negate next hit
  | 'reflect'       // retaliate on next hit
  | 'regen'         // heal over time
  // ── Defensive stat buffs ──
  | 'def_up'        // increase own defense
  | 'atk_up'        // increase own attack
  // ── Special ──
  | 'true_damage'   // flat damage — skips ATK scaling and DEF mitigation
  | 'cleanse'       // remove all active debuffs from target (ally/self)
  | 'purge'         // remove all active buffs from target (enemy)
  // ── New mechanics ──
  | 'burn'          // damage over time (fire — stacks with bleed/poison)
  | 'snare'         // prevents movement for N turns (allows skill usage unlike stun)
  | 'push'          // knockback target in a direction
  | 'lifesteal'     // deal damage and heal caster for power% of damage dealt
  | 'mark'          // tag target for bonus damage on next hit; if already marked, deal bonus
  | 'revive'        // grant target a revive buffer — on fatal blow, restore to low HP
  // ── Turn-modifier mechanics ──
  | 'double_attack'     // caster uses 2 attack skills next turn instead of 1 attack + 1 defense
  | 'silence_defense'   // target cannot use defense skills next turn

// ── Skill ─────────────────────────────────────────────────────────────────────

export class Skill {
  // ── Identity ──────────────────────────────────────────────────────────────
  readonly id:          string
  readonly name:        string
  readonly description: string

  // ── Classification ────────────────────────────────────────────────────────
  readonly category:    SkillCategory    // 'attack' or 'defense'
  readonly group:       SkillGroup       // which deck slot this belongs to

  // ── Mechanics ─────────────────────────────────────────────────────────────
  readonly effectType:      SkillEffectType      // primary effect produced
  readonly targetType:      SkillTargetType      // how the target is selected
  readonly power:           number               // base magnitude (damage, heal, shield…)
  readonly range:           number               // tile range (0 = unrestricted)
  readonly areaRadius:      number               // AoE radius (0 = not an area skill)
  /**
   * Explicit hit-pattern for area skills.
   * When provided, takes precedence over the legacy `areaRadius` diamond fallback.
   * Null for single-target and self-targeting skills.
   */
  readonly areaShape:       AreaShape | null
  readonly secondaryEffect: SecondaryEffectDef | null  // optional follow-up effect

  constructor(def: SkillDefinition) {
    this.id              = def.id
    this.name            = def.name
    this.description     = def.description ?? ''
    this.category        = def.category
    this.group           = def.group
    this.effectType      = def.effectType
    this.targetType      = def.targetType
    this.power           = def.power
    this.range           = def.range       ?? 0
    this.areaRadius      = def.areaRadius  ?? 0
    this.areaShape       = def.areaShape   ?? null
    this.secondaryEffect = def.secondaryEffect ?? null
  }

  // ── Targeting queries ──────────────────────────────────────────────────────

  /** True if this skill attacks enemies. */
  get isOffensive(): boolean {
    return this.category === 'attack'
  }

  /** True if this skill can target the caster's own side. */
  get targetsSelf(): boolean {
    return this.targetType === 'self'
  }

  /** True if this skill hits an area around a chosen tile. */
  get isAreaEffect(): boolean {
    return this.targetType === 'area'
  }

  /** True if this skill requires the player to explicitly pick a target. */
  get requiresTarget(): boolean {
    return this.targetType === 'single' || this.targetType === 'area'
  }

  /**
   * Returns true if `caster` is allowed to use this skill at all.
   * Basic gate-check — engine adds further constraints (range, LoS, etc.).
   */
  canBeUsedBy(caster: { role: CharacterRole; alive: boolean; isStunned: boolean }): boolean {
    return caster.alive && !caster.isStunned
  }

  /**
   * Returns true if `target` is a valid destination side for this skill.
   * `casterSide` is the side that is casting.
   */
  isValidTargetSide(casterSide: CharacterSide, targetSide: CharacterSide): boolean {
    switch (this.effectType) {
      case 'heal':
      case 'regen':
      case 'shield':
      case 'evade':
      case 'reflect':
      case 'def_up':
      case 'atk_up':
      case 'cleanse':       // cleanse removes debuffs from allies/self
      case 'revive':        // revive buffer — applied to allies/self
      case 'double_attack': // self-buff — enables 2 attacks next turn
        return targetSide === casterSide
      case 'damage':
      case 'true_damage':
      case 'bleed':
      case 'poison':
      case 'stun':
      case 'area':
      case 'def_down':
      case 'atk_down':
      case 'mov_down':
      case 'purge':         // purge removes buffs from enemies
      case 'burn':          // fire DoT — offensive
      case 'snare':         // movement lock — offensive
      case 'push':          // knockback — offensive
      case 'lifesteal':     // damage + self-heal — offensive
      case 'mark':          // tag for bonus damage — offensive
      case 'silence_defense': // blocks enemy defense — offensive
        return targetSide !== casterSide
      default:
        return true
    }
  }

  // ── Display ───────────────────────────────────────────────────────────────

  /** Short label for UI: "Soco Real (22 dmg)" */
  get label(): string {
    if (this.power > 0) return `${this.name} (${this.power})`
    return this.name
  }

  toString(): string {
    return `Skill[${this.id}] ${this.name} — ${this.effectType} / ${this.targetType} / power:${this.power}`
  }
}

// ── Secondary effect ──────────────────────────────────────────────────────────

/**
 * An optional follow-up effect applied to the target AFTER the primary effect
 * resolves. Allows combo skills to be expressed as pure data without new engine
 * code — e.g. a "Shatter Strike" that deals damage AND reduces DEF.
 *
 * Rules:
 *   - Only applied if the primary hit was not evaded and the target survived.
 *   - `power` is the direct magnitude of the secondary (tick damage, stat
 *     reduction amount, shield size, etc.) — it is NOT scaled by ATK.
 *   - `ticks` overrides the engine's default duration when provided.
 */
export interface SecondaryEffectDef {
  readonly effectType: SkillEffectType
  readonly power:      number
  /** Duration in rounds. Uses the engine's default when omitted. */
  readonly ticks?:     number
}

// ── Definition shape used to construct Skills ─────────────────────────────────

export interface SkillDefinition {
  id:               string
  name:             string
  description?:     string
  category:         SkillCategory
  group:            SkillGroup
  effectType:       SkillEffectType
  targetType:       SkillTargetType
  power:            number
  /**
   * Maximum tile range of the skill (Manhattan distance from caster to target).
   * 0 means unrestricted / handled by game rules elsewhere.
   * Self-targeting skills always ignore range.
   */
  range?:           number
  /**
   * Radius (in tiles) of an area effect around the chosen tile center.
   * Only meaningful when targetType === 'area'.
   * Ignored when `areaShape` is provided.
   */
  areaRadius?:      number
  /**
   * Explicit hit-pattern shape for area skills.
   * Overrides the legacy `areaRadius` diamond fallback when present.
   * Supports: single, diamond(r), square(r), line(dir, len), ring(r), cone(dir, len).
   */
  areaShape?:       AreaShape
  /**
   * Optional second effect applied to the same target after the primary effect.
   * Enables data-driven combo skills without adding new engine switch cases.
   */
  secondaryEffect?: SecondaryEffectDef
}

// Deck management has moved to domain/Deck.ts (SkillQueue, CharacterDeck, TeamDecks).
// Import from there for all rotation logic.
