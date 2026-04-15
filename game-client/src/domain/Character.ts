/**
 * domain/Character.ts — a combatant on the board.
 *
 * Character is the central entity of the game. It owns:
 *   - Immutable identity (id, name, role, side)
 *   - Mutable position on the grid
 *   - Mutable combat stats (HP, attack, defense, mobility)
 *   - A list of active Effects
 *
 * Responsibility boundary:
 *   Character handles its OWN defensive responses (evade, shield, reflect)
 *   when `takeDamage()` is called with the already-calculated raw damage.
 *   Damage calculation (executor bonus, warrior guard, wall bonus) is the
 *   engine's responsibility — this class never looks at other characters.
 *
 * No Phaser, no UI, no engine dependencies.
 */

import type { Effect, EffectKind, EffectType, TickResult } from './Effect'
import { EvadeEffect, HealReductionEffect, ReflectEffect, ShieldEffect, StatModEffect, MarkEffect, ReviveEffect } from './Effect'

// ── Supporting types ──────────────────────────────────────────────────────────

export type CharacterRole = 'king' | 'warrior' | 'specialist' | 'executor'
export type CharacterSide = 'left' | 'right'

export interface CharacterStats {
  readonly maxHp:    number
  readonly attack:   number
  readonly defense:  number
  readonly mobility: number
}

/**
 * Full outcome of a `takeDamage()` call.
 * The engine uses this to emit the right events to the renderer.
 */
export interface DamageResult {
  /** The entire hit was negated by an EvadeEffect. */
  readonly evaded:          boolean
  /** Damage that was absorbed by a ShieldEffect. */
  readonly shieldAbsorbed:  number
  /** Damage that pierced through and reduced HP. */
  readonly hpDamage:        number
  /** Damage reflected back to the source (from ReflectEffect). */
  readonly reflected:       number
  /** True if HP reached 0 after this hit. */
  readonly killed:          boolean
  /** True if a ReviveEffect prevented death. HP was restored instead of dying. */
  readonly revived:         boolean
  /** HP the character was restored to by the revive (0 if revive did not trigger). */
  readonly revivedHp:       number
}

/** Outcome of a `heal()` call. */
export interface HealResult {
  readonly requested: number
  readonly actual:    number
}

/** What each ticking effect produced this round. */
export interface CharacterTickResult {
  readonly ticks:    TickResult[]   // one per ticking effect
  readonly killed:   boolean        // true if bleed brought HP to 0
}

// ── Character ─────────────────────────────────────────────────────────────────

export class Character {
  // ── Identity (immutable) ──────────────────────────────────────────────────
  readonly id:   string
  readonly name: string
  readonly role: CharacterRole
  readonly side: CharacterSide

  // ── Base stats (immutable reference values) ───────────────────────────────
  readonly baseStats: CharacterStats

  // ── Position (mutable) ───────────────────────────────────────────────────
  private _col: number
  private _row: number

  // ── Runtime stats (mutable — can be buffed/debuffed) ─────────────────────
  private _hp:       number
  private _attack:   number
  private _defense:  number
  private _mobility: number

  // ── Training dummy flag ──────────────────────────────────────────────────
  private _isDummy = false
  get isDummy(): boolean { return this._isDummy }
  setDummy(v: boolean): void { this._isDummy = v }

  // ── Status effects ────────────────────────────────────────────────────────
  private _effects: Effect[] = []

  // ── Turn-modifier flags ──────────────────────────────────────────────────
  /** When true, the character uses 2 attack skills instead of 1 attack + 1 defense next turn. Reset after use. */
  private _doubleAttackNextTurn = false
  /** When > 0, the character cannot use defense skills this turn. Decremented each round. */
  private _silencedDefenseTicks = 0

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  private _alive = true

  constructor(
    id:    string,
    name:  string,
    role:  CharacterRole,
    side:  CharacterSide,
    col:   number,
    row:   number,
    stats: CharacterStats,
  ) {
    this.id        = id
    this.name      = name
    this.role      = role
    this.side      = side
    this.baseStats = stats

    this._col      = col
    this._row      = row
    this._hp       = stats.maxHp
    this._attack   = stats.attack
    this._defense  = stats.defense
    this._mobility = stats.mobility
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  get col():      number { return this._col }
  get row():      number { return this._row }
  get hp():       number { return this._hp }
  get maxHp():    number { return this.baseStats.maxHp }
  get alive():    boolean { return this._alive }
  get hpRatio():  number { return this._hp / this.baseStats.maxHp }

  /**
   * Current effective attack, after applying all active stat-modifier effects.
   * Higher than base when `atk_up` is active; lower when `atk_down` is active.
   */
  get attack(): number   { return this._applyStatMods('attack',   this._attack) }

  /**
   * Current effective defense, after applying all active stat-modifier effects.
   * The CombatEngine damage formula reads this value directly, so def_down /
   * def_up debuffs resolve transparently with no extra engine wiring.
   */
  get defense(): number  { return this._applyStatMods('defense',  this._defense) }

  /**
   * Current effective mobility, after applying all active stat-modifier effects.
   * Movement validation reads this value; mov_down limits tile range.
   */
  get mobility(): number { return this._applyStatMods('mobility', this._mobility) }

  /** Snapshot of all currently active effects (read-only view). */
  get effects(): ReadonlyArray<Effect> { return this._effects }

  // ── Movement ──────────────────────────────────────────────────────────────

  /** Update position. Validation (range, territory, occupancy) is the engine's job. */
  moveTo(col: number, row: number): void {
    this._col = col
    this._row = row
  }

  // ── Damage ────────────────────────────────────────────────────────────────

  /**
   * Apply `rawDamage` to this character.
   *
   * Resolution order:
   *   1. Evade  — negate the entire hit (consumes one charge)
   *   2. Shield — absorb as much damage as possible
   *   3. Reflect — note reflected amount (engine applies it to the source)
   *   4. HP damage
   *
   * Returns a DamageResult describing exactly what happened.
   * The engine uses this to fire the right events and handle the reflect.
   */
  takeDamage(rawDamage: number): DamageResult {
    if (!this._alive || rawDamage <= 0) {
      return { evaded: false, shieldAbsorbed: 0, hpDamage: 0, reflected: 0, killed: false, revived: false, revivedHp: 0 }
    }

    let remaining  = rawDamage
    let shieldAbs  = 0
    let reflected  = 0
    let evaded     = false

    for (const effect of this._effects) {
      if (remaining <= 0) break

      const interception = effect.interceptDamage(remaining)

      if (interception.evaded) {
        evaded = true
        remaining = 0
        break
      }

      if (interception.absorbed > 0) {
        shieldAbs += interception.absorbed
        remaining -= interception.absorbed
      }

      if (interception.reflected > 0) {
        reflected = interception.reflected
        // Reflect doesn't reduce incoming damage — only retaliates
      }
    }

    // Remove fully depleted effects
    this._pruneExpired()

    const hpDamage = evaded ? 0 : Math.max(0, remaining)
    this._hp = Math.max(this._isDummy ? 1 : 0, this._hp - hpDamage)

    let killed  = this._hp === 0
    let revived = false
    let revivedHp = 0
    // Revive intercept: if the character would die but has a revive buffer,
    // restore to the revive HP instead of dying.
    if (killed) {
      const revive = this.reviveEffect
      if (revive) {
        const restoreHp = revive.trigger()
        this._hp    = Math.min(restoreHp, this.baseStats.maxHp)
        this._alive = true
        killed      = false
        revived     = true
        revivedHp   = this._hp
        this._pruneExpired()   // remove the consumed revive effect
      } else {
        this._alive = false
      }
    }

    return { evaded, shieldAbsorbed: shieldAbs, hpDamage, reflected, killed, revived, revivedHp }
  }

  /**
   * Apply damage directly to HP, bypassing shield, evade, reflect, and revive.
   * Used for overtime/environmental damage that cannot be blocked.
   * Returns true if the character died.
   */
  applyPureDamage(amount: number): boolean {
    if (!this._alive || amount <= 0) return false
    this._hp = Math.max(this._isDummy ? 1 : 0, this._hp - amount)
    if (this._hp === 0) {
      this._alive = false
      return true
    }
    return false
  }

  // ── Healing ───────────────────────────────────────────────────────────────

  /**
   * Restore up to `requestedAmount` HP, capped at maxHp.
   * Applies heal-reduction if the debuff is active.
   * Returns how much HP was actually restored.
   */
  heal(requestedAmount: number): HealResult {
    if (!this._alive || requestedAmount <= 0) return { requested: requestedAmount, actual: 0 }

    let amount = requestedAmount
    const reduction = this._effects.find((e): e is HealReductionEffect => e instanceof HealReductionEffect)
    if (reduction && !reduction.isExpired) {
      amount = Math.round(amount * (1 - reduction.factor))
    }

    const actual = Math.min(amount, this.baseStats.maxHp - this._hp)
    this._hp += actual
    return { requested: requestedAmount, actual }
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  /**
   * Apply a new effect to this character.
   * If an effect of the same type already exists, the new one replaces it
   * (re-application refreshes the duration rather than stacking).
   */
  addEffect(effect: Effect): void {
    const idx = this._effects.findIndex((e) => e.type === effect.type)
    if (idx !== -1) {
      this._effects[idx] = effect
    } else {
      this._effects.push(effect)
    }
  }

  /** Remove all effects of a given type. */
  removeEffect(type: EffectType): void {
    this._effects = this._effects.filter((e) => e.type !== type)
  }

  /**
   * Remove every active effect whose `kind` matches.
   * Used by cleanse (remove debuffs) and purge (remove buffs).
   * Returns the list of effect types that were removed.
   */
  removeEffectsByKind(kind: EffectKind): EffectType[] {
    const removed: EffectType[] = []
    this._effects = this._effects.filter((e) => {
      if (e.kind === kind && !e.isExpired) {
        removed.push(e.type)
        return false
      }
      return true
    })
    return removed
  }

  /** True if this character currently has at least one active effect of `type`. */
  hasEffect(type: EffectType): boolean {
    return this._effects.some((e) => e.type === type && !e.isExpired)
  }

  /** Returns the first active effect of `type`, or null. */
  getEffect(type: EffectType): Effect | null {
    return this._effects.find((e) => e.type === type && !e.isExpired) ?? null
  }

  /** True if the character cannot act this phase (stunned). */
  get isStunned(): boolean {
    return this.hasEffect('stun')
  }

  /** Current shield points remaining, or 0. */
  get shieldAmount(): number {
    const shield = this._effects.find((e) => e instanceof ShieldEffect) as ShieldEffect | undefined
    return shield?.remaining ?? 0
  }

  /** Current evade charges remaining, or 0. */
  get evadeCharges(): number {
    const evade = this._effects.find((e) => e instanceof EvadeEffect) as EvadeEffect | undefined
    return evade?.charges ?? 0
  }

  /** Reflect power currently active, or 0. */
  get reflectPower(): number {
    const reflect = this._effects.find((e) => e instanceof ReflectEffect) as ReflectEffect | undefined
    return reflect?.power ?? 0
  }

  /** True if the character cannot move this phase (snared). */
  get isSnared(): boolean {
    return this.hasEffect('snare')
  }

  /** True if the character is marked for bonus damage. */
  get isMarked(): boolean {
    return this.hasEffect('mark')
  }

  /** The active MarkEffect, if any. */
  get markEffect(): MarkEffect | null {
    return (this._effects.find((e) => e instanceof MarkEffect && !e.isExpired) as MarkEffect | undefined) ?? null
  }

  /** True if the character has a revive buffer active. */
  get hasRevive(): boolean {
    return this.hasEffect('revive')
  }

  /** The active ReviveEffect, if any. */
  get reviveEffect(): ReviveEffect | null {
    return (this._effects.find((e) => e instanceof ReviveEffect && !e.isExpired) as ReviveEffect | undefined) ?? null
  }

  // ── Turn-modifier queries ────────────────────────────────────────────────

  /** True if this character will use 2 attack skills next turn (no defense). */
  get doubleAttackNextTurn(): boolean { return this._doubleAttackNextTurn }

  /** Enable double-attack mode for the next turn. */
  setDoubleAttackNextTurn(value: boolean): void { this._doubleAttackNextTurn = value }

  /** Remaining turns where this character's defense is silenced. */
  get silencedDefenseTicks(): number { return this._silencedDefenseTicks }

  /** True if the character is currently unable to use defense skills. */
  get isDefenseSilenced(): boolean { return this._silencedDefenseTicks > 0 }

  /** Set the number of turns defense is silenced. */
  setSilencedDefenseTicks(ticks: number): void { this._silencedDefenseTicks = Math.max(0, ticks) }

  // ── Round tick ────────────────────────────────────────────────────────────

  /**
   * Advance all ticking effects by one round.
   * Bleed deals damage, regen restores HP, counters decrement.
   * Expired effects are removed.
   *
   * Returns a summary of what happened (for engine event emission).
   */
  tickEffects(): CharacterTickResult {
    if (!this._alive) return { ticks: [], killed: false }

    const ticks: TickResult[] = []

    for (const effect of [...this._effects]) {
      const result = effect.tick()
      if (result === null) continue   // passive effect, no tick outcome
      ticks.push(result)

      if ((effect.type === 'bleed' || effect.type === 'poison' || effect.type === 'burn') && result.value > 0) {
        this._hp = Math.max(0, this._hp - result.value)
        if (this._hp === 0) {
          // Check for revive buffer before dying to DoT
          const revive = this.reviveEffect
          if (revive) {
            const restoreHp = revive.trigger()
            this._hp    = Math.min(restoreHp, this.baseStats.maxHp)
            this._alive = true
          } else {
            this._alive = false
          }
        }
      }

      if (effect.type === 'regen' && result.value > 0 && this._alive) {
        this._hp = Math.min(this.baseStats.maxHp, this._hp + result.value)
      }
    }

    // Decrement silence-defense counter each round
    if (this._silencedDefenseTicks > 0) {
      this._silencedDefenseTicks--
    }

    this._pruneExpired()
    return { ticks, killed: !this._alive }
  }

  // ── Stat modifiers ────────────────────────────────────────────────────────

  /** Temporarily override attack (e.g. buff/debuff from a card). */
  setAttack(value: number): void   { this._attack = Math.max(0, value) }

  /** Temporarily override defense. */
  setDefense(value: number): void  { this._defense = Math.max(0, value) }

  /** Reset runtime stats back to base values. */
  resetStats(): void {
    this._attack   = this.baseStats.attack
    this._defense  = this.baseStats.defense
    this._mobility = this.baseStats.mobility
  }

  // ── Debug / display ───────────────────────────────────────────────────────

  toString(): string {
    return `${this.name} [${this.role}/${this.side}] HP:${this._hp}/${this.baseStats.maxHp} (${this._col},${this._row})`
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _pruneExpired(): void {
    this._effects = this._effects.filter((e) => !e.isExpired)
  }

  /**
   * Return `base` after folding all active StatModEffects for `stat`.
   * Buffs and debuffs are applied left-to-right in insertion order.
   * Expired effects are skipped (they may not have been pruned yet).
   * The result is clamped to ≥ 0.
   */
  private _applyStatMods(stat: 'attack' | 'defense' | 'mobility', base: number): number {
    let val = base
    for (const e of this._effects) {
      if (e instanceof StatModEffect && e.stat === stat && !e.isExpired) {
        val = e.modify(val)
      }
    }
    return Math.max(0, val)
  }
}
