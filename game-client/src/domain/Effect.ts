/**
 * domain/Effect.ts — status effects applied to Characters during combat.
 *
 * Design decisions:
 *   - Abstract base class `Effect` defines the contract.
 *   - `EffectKind` classifies every effect as buff, debuff, or neutral.
 *   - `StatModEffect` (abstract subclass) covers all temporary stat modifiers;
 *     Character reads the current stat through `_applyStatMods()` so that
 *     buffs/debuffs resolve transparently with no separate "remove" logic.
 *   - `tick()` advances the effect by one round and returns what happened.
 *   - `interceptDamage()` allows absorbing/reflecting incoming damage before HP.
 *   - No Phaser, no UI, no engine dependencies.
 */

// ── Shared types ──────────────────────────────────────────────────────────────

export type EffectKind = 'buff' | 'debuff' | 'neutral'

export type EffectType =
  // ── DoT / HoT ──
  | 'bleed'
  | 'poison'
  | 'burn'
  | 'regen'
  // ── Crowd control ──
  | 'stun'
  | 'snare'
  | 'heal_reduction'
  // ── Damage buffers ──
  | 'shield'
  | 'evade'
  | 'reflect'
  // ── Stat debuffs ──
  | 'def_down'
  | 'atk_down'
  | 'mov_down'
  // ── Stat buffs ──
  | 'def_up'
  | 'atk_up'
  // ── Special ──
  | 'mark'
  | 'revive'

/** Stat targeted by a stat-modifier effect. */
export type ModifiableStat = 'defense' | 'attack' | 'mobility'

/** What happened when an effect ticked. Null = this effect does not tick. */
export interface TickResult {
  readonly effectType: EffectType
  readonly value:      number    // damage, heal, or 0
  readonly expired:    boolean
}

/**
 * How an effect responds to incoming raw damage.
 * `absorbed`  — damage removed by the shield/barrier.
 * `reflected` — damage sent back to the attacker.
 * `evaded`    — true if the entire hit was negated.
 */
export interface DamageInterception {
  readonly absorbed:  number
  readonly reflected: number
  readonly evaded:    boolean
}

const NO_INTERCEPTION: DamageInterception = { absorbed: 0, reflected: 0, evaded: false }

// ── Abstract base ─────────────────────────────────────────────────────────────

export abstract class Effect {
  /** Discriminant — never changes after construction. */
  abstract readonly type: EffectType

  /** Whether this effect helps ('buff') or hurts ('debuff') its bearer. */
  abstract readonly kind: EffectKind

  /** True when the effect has no remaining duration or charges. */
  abstract get isExpired(): boolean

  /**
   * Advance the effect by one round.
   * Returns a TickResult if the effect produces an outcome (damage, heal…),
   * or null if it is passive and does not tick (e.g. shield, evade).
   */
  abstract tick(): TickResult | null

  /**
   * Called before HP damage is applied to the bearer.
   * Override to implement absorption / reflection / evasion.
   * The default returns NO_INTERCEPTION (no interference).
   */
  interceptDamage(_rawDamage: number): DamageInterception {
    return NO_INTERCEPTION
  }
}

// ── StatModEffect — base for temporary stat modifiers ─────────────────────────
//
// Subclasses only need to declare `stat` and implement `modify(base)`.
// Character reads modified stats via `_applyStatMods()` so restoration is
// automatic: when the effect expires and is pruned, the getter reverts.

export abstract class StatModEffect extends Effect {
  /** Which stat this effect modifies. */
  abstract readonly stat: ModifiableStat

  /**
   * Apply this modifier to `baseValue`.
   * Return the new (potentially clamped) value.
   */
  abstract modify(baseValue: number): number
}

// ── Concrete effects — DoT / HoT ─────────────────────────────────────────────

/**
 * Deals `damagePerTick` raw damage to the bearer each round.
 * Applied by physical bleed/laceration skills.
 */
export class BleedEffect extends Effect {
  readonly type = 'bleed' as const
  readonly kind = 'debuff' as const
  private _ticks: number

  constructor(readonly damagePerTick: number, ticks = 3) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean    { return this._ticks <= 0 }
  get ticksRemaining(): number { return this._ticks }

  tick(): TickResult {
    const value = this._ticks > 0 ? this.damagePerTick : 0
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'bleed', value, expired: this.isExpired }
  }
}

/**
 * Deals `damagePerTick` raw damage each round.
 * Distinct from bleed — both can coexist on the same target simultaneously,
 * stacking DoT pressure (e.g. a warrior bleeds while a specialist poisons).
 */
export class PoisonEffect extends Effect {
  readonly type = 'poison' as const
  readonly kind = 'debuff' as const
  private _ticks: number

  constructor(readonly damagePerTick: number, ticks = 3) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean    { return this._ticks <= 0 }
  get ticksRemaining(): number { return this._ticks }

  tick(): TickResult {
    const value = this._ticks > 0 ? this.damagePerTick : 0
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'poison', value, expired: this.isExpired }
  }
}

/**
 * Restores `healPerTick` HP to the bearer each round.
 */
export class RegenEffect extends Effect {
  readonly type = 'regen' as const
  readonly kind = 'buff' as const
  private _ticks: number

  constructor(readonly healPerTick: number, ticks = 3) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean    { return this._ticks <= 0 }
  get ticksRemaining(): number { return this._ticks }

  tick(): TickResult {
    const value = this._ticks > 0 ? this.healPerTick : 0
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'regen', value, expired: this.isExpired }
  }
}

// ── Concrete effects — crowd control ─────────────────────────────────────────

/**
 * Prevents the bearer from taking any action for its duration.
 */
export class StunEffect extends Effect {
  readonly type = 'stun' as const
  readonly kind = 'debuff' as const
  private _ticks: number

  constructor(ticks = 1) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean  { return this._ticks <= 0 }
  get isActive(): boolean   { return this._ticks > 0 }
  get ticksRemaining(): number { return this._ticks }

  tick(): TickResult {
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'stun', value: 0, expired: this.isExpired }
  }
}

/**
 * Reduces all healing received by `factor` (e.g. 0.5 = 50% less) for its duration.
 * Applied by the Specialist's attacks.
 */
export class HealReductionEffect extends Effect {
  readonly type = 'heal_reduction' as const
  readonly kind = 'debuff' as const
  private _ticks: number

  constructor(readonly factor: number, ticks = 2) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean   { return this._ticks <= 0 }
  get isActive(): boolean    { return this._ticks > 0 }
  get ticksRemaining(): number { return this._ticks }

  tick(): TickResult {
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'heal_reduction', value: this.factor, expired: this.isExpired }
  }
}

// ── Concrete effects — damage buffers ─────────────────────────────────────────

/**
 * Absorbs incoming damage before it reaches HP.
 * Consumed as damage is dealt; expires when fully depleted.
 */
export class ShieldEffect extends Effect {
  readonly type = 'shield' as const
  readonly kind = 'buff' as const
  private _remaining: number

  constructor(amount: number) {
    super()
    this._remaining = amount
  }

  get isExpired(): boolean { return this._remaining <= 0 }
  get remaining(): number  { return this._remaining }

  tick(): null { return null }

  override interceptDamage(rawDamage: number): DamageInterception {
    const absorbed = Math.min(this._remaining, rawDamage)
    this._remaining -= absorbed
    return { absorbed, reflected: 0, evaded: false }
  }
}

/**
 * Negates one incoming hit entirely.
 * Each evade grants one charge; charges are consumed one at a time.
 */
export class EvadeEffect extends Effect {
  readonly type = 'evade' as const
  readonly kind = 'buff' as const
  private _charges: number

  constructor(charges = 1) {
    super()
    this._charges = charges
  }

  get isExpired(): boolean { return this._charges <= 0 }
  get charges(): number    { return this._charges }

  tick(): null { return null }

  override interceptDamage(_rawDamage: number): DamageInterception {
    if (this._charges <= 0) return { absorbed: 0, reflected: 0, evaded: false }
    this._charges--
    return { absorbed: 0, reflected: 0, evaded: true }
  }
}

/**
 * Sends `power` damage back to the attacker on the next hit.
 * Single-use: expires after reflecting once.
 */
export class ReflectEffect extends Effect {
  readonly type = 'reflect' as const
  readonly kind = 'buff' as const
  private _triggered = false

  constructor(readonly power: number) {
    super()
  }

  get isExpired(): boolean { return this._triggered }

  tick(): null { return null }

  override interceptDamage(_rawDamage: number): DamageInterception {
    if (this._triggered) return { absorbed: 0, reflected: 0, evaded: false }
    this._triggered = true
    return { absorbed: 0, reflected: this.power, evaded: false }
  }
}

// ── Concrete effects — stat debuffs ───────────────────────────────────────────

/**
 * Reduces the bearer's defense by a flat amount for a number of rounds.
 *
 * Example: DefReductionEffect(20, 3) → -20 DEF for 3 rounds.
 * The Character.defense getter applies this automatically; CombatEngine's
 * damage formula then sees the lowered DEF without any extra wiring.
 */
export class DefReductionEffect extends StatModEffect {
  readonly type = 'def_down' as const
  readonly kind = 'debuff' as const
  readonly stat  = 'defense' as const
  private _ticks: number

  constructor(readonly amount: number, ticks = 3) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean    { return this._ticks <= 0 }
  get ticksRemaining(): number { return this._ticks }

  modify(base: number): number { return Math.max(0, base - this.amount) }

  tick(): TickResult {
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'def_down', value: this.amount, expired: this.isExpired }
  }
}

/**
 * Reduces the bearer's attack by a flat amount for a number of rounds.
 */
export class AtkReductionEffect extends StatModEffect {
  readonly type = 'atk_down' as const
  readonly kind = 'debuff' as const
  readonly stat  = 'attack' as const
  private _ticks: number

  constructor(readonly amount: number, ticks = 2) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean    { return this._ticks <= 0 }
  get ticksRemaining(): number { return this._ticks }

  modify(base: number): number { return Math.max(0, base - this.amount) }

  tick(): TickResult {
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'atk_down', value: this.amount, expired: this.isExpired }
  }
}

/**
 * Reduces the bearer's mobility by a flat amount for a number of rounds.
 * A unit whose effective mobility reaches 0 cannot move.
 */
export class MovReductionEffect extends StatModEffect {
  readonly type = 'mov_down' as const
  readonly kind = 'debuff' as const
  readonly stat  = 'mobility' as const
  private _ticks: number

  constructor(readonly amount: number, ticks = 2) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean    { return this._ticks <= 0 }
  get ticksRemaining(): number { return this._ticks }

  modify(base: number): number { return Math.max(0, base - this.amount) }

  tick(): TickResult {
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'mov_down', value: this.amount, expired: this.isExpired }
  }
}

// ── Concrete effects — stat buffs ─────────────────────────────────────────────

/**
 * Increases the bearer's defense by a flat amount for a number of rounds.
 */
export class DefBoostEffect extends StatModEffect {
  readonly type = 'def_up' as const
  readonly kind = 'buff' as const
  readonly stat  = 'defense' as const
  private _ticks: number

  constructor(readonly amount: number, ticks = 3) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean    { return this._ticks <= 0 }
  get ticksRemaining(): number { return this._ticks }

  modify(base: number): number { return base + this.amount }

  tick(): TickResult {
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'def_up', value: this.amount, expired: this.isExpired }
  }
}

/**
 * Increases the bearer's attack by a flat amount for a number of rounds.
 */
export class AtkBoostEffect extends StatModEffect {
  readonly type = 'atk_up' as const
  readonly kind = 'buff' as const
  readonly stat  = 'attack' as const
  private _ticks: number

  constructor(readonly amount: number, ticks = 2) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean    { return this._ticks <= 0 }
  get ticksRemaining(): number { return this._ticks }

  modify(base: number): number { return base + this.amount }

  tick(): TickResult {
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'atk_up', value: this.amount, expired: this.isExpired }
  }
}

// ── Concrete effects — new mechanics ─────────────────────────────────────────

/**
 * Deals `damagePerTick` fire damage to the bearer each round.
 * Distinct from bleed and poison — all three can coexist simultaneously,
 * stacking DoT pressure from different damage sources.
 */
export class BurnEffect extends Effect {
  readonly type = 'burn' as const
  readonly kind = 'debuff' as const
  private _ticks: number

  constructor(readonly damagePerTick: number, ticks = 3) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean    { return this._ticks <= 0 }
  get ticksRemaining(): number { return this._ticks }

  tick(): TickResult {
    const value = this._ticks > 0 ? this.damagePerTick : 0
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'burn', value, expired: this.isExpired }
  }
}

/**
 * Prevents the bearer from moving for its duration.
 * Unlike StunEffect, the bearer can still use skills during the action phase.
 */
export class SnareEffect extends Effect {
  readonly type = 'snare' as const
  readonly kind = 'debuff' as const
  private _ticks: number

  constructor(ticks = 2) {
    super()
    this._ticks = ticks
  }

  get isExpired(): boolean   { return this._ticks <= 0 }
  get isActive(): boolean    { return this._ticks > 0 }
  get ticksRemaining(): number { return this._ticks }

  tick(): TickResult {
    this._ticks = Math.max(0, this._ticks - 1)
    return { effectType: 'snare', value: 0, expired: this.isExpired }
  }
}

/**
 * Tags the bearer for bonus damage.
 * When a marked target is hit, the mark is consumed and bonus damage is dealt.
 * Tracks the source (the marker) so bonus damage is properly attributed.
 */
export class MarkEffect extends Effect {
  readonly type = 'mark' as const
  readonly kind = 'debuff' as const
  private _consumed = false

  /** ID of the character that applied the mark. */
  readonly sourceId: string
  /** Bonus damage dealt when the mark is consumed. */
  readonly bonusDamage: number

  constructor(sourceId: string, bonusDamage: number) {
    super()
    this.sourceId    = sourceId
    this.bonusDamage = bonusDamage
  }

  get isExpired(): boolean { return this._consumed }

  /** Consume the mark. Returns the bonus damage. */
  consume(): number {
    this._consumed = true
    return this.bonusDamage
  }

  tick(): TickResult | null { return null }   // passive — no tick
}

/**
 * Grants the bearer a one-time death-prevention buffer.
 * When the bearer would be killed, HP is restored to `reviveHp` instead.
 * Consumes itself after triggering.
 */
export class ReviveEffect extends Effect {
  readonly type = 'revive' as const
  readonly kind = 'buff' as const
  private _triggered = false

  /** HP to restore the bearer to when revive triggers. */
  readonly reviveHp: number

  constructor(reviveHp: number) {
    super()
    this.reviveHp = reviveHp
  }

  get isExpired(): boolean { return this._triggered }

  /** Trigger the revive. Returns the HP to restore to. */
  trigger(): number {
    this._triggered = true
    return this.reviveHp
  }

  tick(): TickResult | null { return null }   // passive — no tick
}

// ── Factory ───────────────────────────────────────────────────────────────────

/** Convenience factory — avoids calling `new` in places that don't import subclasses. */
export function createEffect(type: EffectType, value: number, ticks?: number): Effect {
  switch (type) {
    case 'bleed':         return new BleedEffect(value, ticks)
    case 'poison':        return new PoisonEffect(value, ticks)
    case 'regen':         return new RegenEffect(value, ticks)
    case 'stun':          return new StunEffect(ticks ?? 1)
    case 'heal_reduction': return new HealReductionEffect(value, ticks)
    case 'shield':        return new ShieldEffect(value)
    case 'evade':         return new EvadeEffect(value)
    case 'reflect':       return new ReflectEffect(value)
    case 'def_down':      return new DefReductionEffect(value, ticks)
    case 'atk_down':      return new AtkReductionEffect(value, ticks)
    case 'mov_down':      return new MovReductionEffect(value, ticks)
    case 'def_up':        return new DefBoostEffect(value, ticks)
    case 'atk_up':        return new AtkBoostEffect(value, ticks)
    case 'burn':          return new BurnEffect(value, ticks)
    case 'snare':         return new SnareEffect(ticks ?? 2)
    case 'mark':          return new MarkEffect('', value)    // sourceId must be set externally
    case 'revive':        return new ReviveEffect(value)
  }
}
