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

/**
 * SkillEffectType — the 31 canonical effect types from SKILLS_CATALOG_v3_FINAL §13,
 * plus 4 extensions required by specific v3 skills.
 *
 * ── Canonical 31 (v3 §13) ─────────────────────────────────────────────────────
 *   Damage:     damage, true_damage
 *   Healing:    heal, regen, lifesteal
 *   Defense:    shield, evade, reflect, revive
 *   DoT:        bleed, burn, poison
 *   CC:         stun, snare, silence_attack, silence_defense
 *   Movement:   push, pull, teleport_self, teleport_target
 *   Stat mods:  def_up, def_down, atk_up, atk_down, mov_up, mov_down
 *   Special:    mark, purge, cleanse, double_attack, area_field,
 *               summon_wall, invisibility
 *
 * ── v3 §6 extensions (required by specific skills) ────────────────────────────
 *   area            — instant AoE damage. Legacy in this codebase; many skills
 *                     combine `area` + `areaShape` to specify the hit pattern.
 *                     Conceptually a convenience synonym for `damage` + AoE.
 *   advance_allies  — Avançar (Guerreiro d7): move own team forward 1 tile + buff.
 *   retreat_allies  — Bater em Retirada (Guerreiro d8): move own team back + buff.
 *   clone           — Sombra Real (Rei d3): summon visual decoy entities.
 *   damage_redirect — Guardião (Guerreiro d2): reroute ally's incoming damage
 *                     to the caster with mitigation.
 *
 * NOTE: the TypeScript exhaustive-switch pattern requires that every resolver
 * (EffectResolver, Skill.isValidTargetSide, etc.) handle every variant here.
 * If you add a new effect type, TS will force you to update those call sites.
 */
export type SkillEffectType =
  // ── Damage ────────────────────────────────────────────────────────────────
  /** Direct HP damage. Scales with atk buffs/passives, mitigated by DEF. */
  | 'damage'
  /** Flat damage that **ignores DEF mitigation**. Still multiplied by passives
   * and modifiers (e.g. Proteção Real reduces true damage too — v3 §4.1). */
  | 'true_damage'
  // ── Healing ───────────────────────────────────────────────────────────────
  /** Instant HP restore. Blocked on Kings (v3 §2.1) unless caller signals
   * self-skill exception. Counted against Heal Cap (v3 §2.4). */
  | 'heal'
  /** Heal over time. Same blocks as `heal`. */
  | 'regen'
  /** Damage + self-heal for a % of damage dealt. Exception to King heal-immunity
   * when the caster IS the King (v3 §2.1 note — Sequência de Socos). */
  | 'lifesteal'
  // ── Defense ───────────────────────────────────────────────────────────────
  /** Absorb buffer — consumed by incoming damage before HP. Subject to the
   * Shield Cap of 100 HP total per unit (v3 §2.5). */
  | 'shield'
  /** Negate the next single incoming hit. Charges are consumed one at a time. */
  | 'evade'
  /** Retaliate against the next attacker — deal `power` damage back. */
  | 'reflect'
  /** Grant a revive buffer: on fatal damage, restore to a low HP instead of dying. */
  | 'revive'
  // ── Damage-over-time (DoT) ────────────────────────────────────────────────
  /** Physical laceration DoT. v3 §2.3: resolves before heal each turn. */
  | 'bleed'
  /** Fire DoT. Same ordering as bleed. */
  | 'burn'
  /** Toxic DoT. Stacks with bleed/burn. */
  | 'poison'
  // ── Crowd Control (CC) ────────────────────────────────────────────────────
  /** Prevent any action for N rounds. Target also cannot use defense skills. */
  | 'stun'
  /** Prevent movement for N rounds. Target can still use skills (unlike stun). */
  | 'snare'
  /** Prevent attack skill usage for N rounds. */
  | 'silence_attack'
  /** Prevent defense skill usage for N rounds. */
  | 'silence_defense'
  // ── Movement ──────────────────────────────────────────────────────────────
  /** Knockback the target away from the caster. `power` = tiles pushed. */
  | 'push'
  /** Drag the target toward the caster. `power` = tiles pulled. */
  | 'pull'
  /** Relocate the CASTER to a chosen tile. v3: replaces the old generic `teleport`. */
  | 'teleport_self'
  /** Relocate the TARGET (and optionally their adjacents). v3: Intimidação, Ordem Real. */
  | 'teleport_target'
  // ── Stat modifiers ────────────────────────────────────────────────────────
  /** Increase target's DEF for N rounds. */
  | 'def_up'
  /** Reduce target's DEF for N rounds. */
  | 'def_down'
  /** Increase target's ATK for N rounds. */
  | 'atk_up'
  /** Reduce target's ATK for N rounds. */
  | 'atk_down'
  /** Increase target's mobility (tiles per movement phase) for N rounds. */
  | 'mov_up'
  /** Reduce target's mobility for N rounds. */
  | 'mov_down'
  // ── Special mechanics ─────────────────────────────────────────────────────
  /** Tag target for a conditional follow-up. Explosão Central: 1st = mark,
   * 2nd on marked target = bonus damage. */
  | 'mark'
  /** Remove all active buffs from the target (typically an enemy). */
  | 'purge'
  /** Remove all active debuffs from the target (typically an ally/self). */
  | 'cleanse'
  /** Caster uses 2 attack skills next turn and no defense skill. */
  | 'double_attack'
  /** Persistent ground/area effect on the grid for N rounds (zone hazard,
   * healing zone, mist). Different from the instant `area` AoE. */
  | 'area_field'
  /** Create a physical wall entity with HP that blocks movement/los. */
  | 'summon_wall'
  /** Caster becomes untargetable by single-target skills until dispelled. */
  | 'invisibility'
  // ── v3 §6 extensions (beyond §13 canonical list) ──────────────────────────
  /** AoE instant damage. Use `areaShape` to specify the hit pattern.
   * Kept for compatibility with the catalog — conceptually `damage` + area. */
  | 'area'
  /** Sombra Real (Rei d3) — spawn visual decoys to confuse the enemy. */
  | 'clone'
  /** Guardião (Guerreiro d2) — reroute ally's incoming damage to caster with
   * mitigation bonus for the duration. */
  | 'damage_redirect'
  /** Avançar (Guerreiro d7) — shift the entire team one tile toward enemy + buff. */
  | 'advance_allies'
  /** Bater em Retirada (Guerreiro d8) — shift team one tile back + buff. */
  | 'retreat_allies'

// ── Type guards ───────────────────────────────────────────────────────────────
//
// Exhaustive predicates that group effect types by behavior. Engine layers
// (EffectResolver, PassiveSystem, rules) use these instead of open-coded
// switch statements when they only care about a category.
//
// Each guard has a corresponding `const` array so callers can also enumerate
// the members. All arrays are `as const` so tests can check completeness at
// type level.

/** All effects that deal HP damage on application (including true damage). */
export const DAMAGE_EFFECTS = ['damage', 'true_damage', 'area'] as const
export function isDamageEffect(t: SkillEffectType): boolean {
  return (DAMAGE_EFFECTS as readonly string[]).includes(t)
}

/** Damage-over-time effects. Resolve before heal each turn (v3 §2.3). */
export const DOT_EFFECTS = ['bleed', 'burn', 'poison'] as const
export function isDoTEffect(t: SkillEffectType): boolean {
  return (DOT_EFFECTS as readonly string[]).includes(t)
}

/** Healing-family effects — subject to King heal-immunity + Heal Cap. */
export const HEAL_EFFECTS = ['heal', 'regen', 'lifesteal'] as const
export function isHealEffect(t: SkillEffectType): boolean {
  return (HEAL_EFFECTS as readonly string[]).includes(t)
}

/** Positive stat/buff effects. */
export const BUFF_EFFECTS = [
  'shield', 'evade', 'reflect', 'revive',
  'def_up', 'atk_up', 'mov_up',
  'double_attack', 'invisibility',
] as const
export function isBuffEffect(t: SkillEffectType): boolean {
  return (BUFF_EFFECTS as readonly string[]).includes(t)
}

/** Crowd-control effects — prevent or restrict actions. */
export const CROWD_CONTROL_EFFECTS = [
  'stun', 'snare', 'silence_attack', 'silence_defense',
] as const
export function isCrowdControlEffect(t: SkillEffectType): boolean {
  return (CROWD_CONTROL_EFFECTS as readonly string[]).includes(t)
}

/** Negative stat-reduction effects (not CC). */
export const DEBUFF_STAT_EFFECTS = ['def_down', 'atk_down', 'mov_down'] as const
export function isDebuffStatEffect(t: SkillEffectType): boolean {
  return (DEBUFF_STAT_EFFECTS as readonly string[]).includes(t)
}

/** Movement/displacement effects. */
export const MOVEMENT_EFFECTS = [
  'push', 'pull', 'teleport_self', 'teleport_target',
  'advance_allies', 'retreat_allies',
] as const
export function isMovementEffect(t: SkillEffectType): boolean {
  return (MOVEMENT_EFFECTS as readonly string[]).includes(t)
}

/** The full ordered list of every canonical effect type — used by tests and
 * registries to enumerate without relying on the union. */
export const ALL_EFFECT_TYPES: readonly SkillEffectType[] = [
  'damage', 'true_damage',
  'heal', 'regen', 'lifesteal',
  'shield', 'evade', 'reflect', 'revive',
  'bleed', 'burn', 'poison',
  'stun', 'snare', 'silence_attack', 'silence_defense',
  'push', 'pull', 'teleport_self', 'teleport_target',
  'def_up', 'def_down', 'atk_up', 'atk_down', 'mov_up', 'mov_down',
  'mark', 'purge', 'cleanse', 'double_attack', 'area_field',
  'summon_wall', 'invisibility',
  'area', 'clone', 'damage_redirect', 'advance_allies', 'retreat_allies',
] as const

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

  /**
   * Optional follow-up effects applied after the primary effect resolves.
   * Executed in array order. Empty array means "no secondary".
   *
   * v3+ schema (replaces the legacy single `secondaryEffect` field). Enables
   * multi-effect skills like Warrior's Impacto (damage + def_down + mov_down)
   * or Executor's Golpe Envenenado (damage + poison + atk_down) without
   * bespoke skill-specific handlers.
   */
  readonly secondaryEffects: ReadonlyArray<SecondaryEffectDef>

  /**
   * Minimum number of rounds between consecutive uses of this skill by the
   * same character. `undefined`/0 means no cooldown (default). When set, the
   * skill cannot be selected again until `lastUsedRound + cooldownTurns` has
   * passed. Drives v3 rules like Ataque em Dobro's 2-turn lockout.
   */
  readonly cooldownTurns: number

  /**
   * @deprecated Use `secondaryEffects` — returns the first secondary (or null)
   * for backward compatibility with pre-refactor callers. Will be removed once
   * all callers migrate (tracked in DECISIONS.md 2026-04-21).
   */
  get secondaryEffect(): SecondaryEffectDef | null {
    return this.secondaryEffects[0] ?? null
  }

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
    // Normalize secondary-effect input: accept either the array form
    // (secondaryEffects) or the legacy single-entry form (secondaryEffect).
    // If both are present, secondaryEffects wins and the legacy field is
    // ignored — loud but non-breaking.
    if (def.secondaryEffects && def.secondaryEffects.length > 0) {
      this.secondaryEffects = [...def.secondaryEffects]
    } else if (def.secondaryEffect) {
      this.secondaryEffects = [def.secondaryEffect]
    } else {
      this.secondaryEffects = []
    }
    this.cooldownTurns = def.cooldownTurns ?? 0
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
    const type: SkillEffectType = this.effectType
    switch (type) {
      // Ally-targeting (own side only)
      case 'heal':
      case 'regen':
      case 'lifesteal':       // caster only heals from own damage — still targets enemies,
                              // but the heal side-effect lands on caster (same side). Treated
                              // as "own side" for the lifesteal self-heal check. Enemy damage
                              // path is validated separately by the engine.
      case 'shield':
      case 'evade':
      case 'reflect':
      case 'revive':
      case 'def_up':
      case 'atk_up':
      case 'mov_up':
      case 'cleanse':
      case 'double_attack':
      case 'advance_allies':
      case 'retreat_allies':
      case 'teleport_self':
      case 'invisibility':
      case 'clone':
      case 'damage_redirect':
        return targetSide === casterSide
      // Enemy-targeting
      case 'damage':
      case 'true_damage':
      case 'area':
      case 'bleed':
      case 'burn':
      case 'poison':
      case 'stun':
      case 'snare':
      case 'silence_attack':
      case 'silence_defense':
      case 'def_down':
      case 'atk_down':
      case 'mov_down':
      case 'push':
      case 'pull':
      case 'teleport_target':
      case 'mark':
      case 'purge':
        return targetSide !== casterSide
      // Board-level (not associated with a specific side)
      case 'summon_wall':
      case 'area_field':
        return true
    }
    // Exhaustiveness: if a new SkillEffectType is added, TS forces the switch
    // above to be updated. The `never`-assignment below is the compile-time
    // check; it cannot be reached at runtime.
    const _exhaustive: never = type
    return _exhaustive
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
   * Optional follow-up effects applied after the primary effect resolves.
   * Each entry is dispatched independently through the EffectResolver.
   *
   * This is the current shape (v3+ schema, see DECISIONS.md 2026-04-21).
   * When both `secondaryEffects` and `secondaryEffect` are provided, the
   * array wins.
   */
  secondaryEffects?: SecondaryEffectDef[]
  /**
   * @deprecated Use `secondaryEffects: [X]` instead.
   * Legacy single-effect field kept for backward compatibility during the
   * refactor — ignored when `secondaryEffects` is present.
   */
  secondaryEffect?: SecondaryEffectDef
  /**
   * Minimum rounds between consecutive uses. Omit or 0 for no cooldown.
   */
  cooldownTurns?:   number
}

// Deck management has moved to domain/Deck.ts (SkillQueue, CharacterDeck, TeamDecks).
// Import from there for all rotation logic.
