/**
 * engine/EffectResolver.ts — data-driven effect dispatch.
 *
 * Problem it solves:
 *   CombatEngine used to contain one giant switch per call-site
 *   (defense, offense, secondary).  Adding a new SkillEffectType meant editing
 *   3+ locations in CombatEngine.
 *
 * Solution:
 *   EffectResolver holds a Map<effectType → handler>.  CombatEngine calls
 *   `resolver.resolve(type, ctx)` and gets back an EffectResult that describes
 *   everything that happened (events, damage numbers, flags).  CombatEngine then
 *   handles the meta-concerns it owns (kill tracking, stat accounting, victory
 *   check, reflect retaliation).
 *
 * Extending the system:
 *   To add a new skill effect, call `resolver.register('my_type', handler)` —
 *   zero changes required in CombatEngine or anywhere else.
 *
 * No Phaser, no DOM, no UI.
 */

import { Character } from '../domain/Character'
import {
  BleedEffect,
  PoisonEffect,
  StunEffect,
  RegenEffect,
  ShieldEffect,
  EvadeEffect,
  ReflectEffect,
  HealReductionEffect,
  DefReductionEffect,
  AtkReductionEffect,
  MovReductionEffect,
  DefBoostEffect,
  AtkBoostEffect,
} from '../domain/Effect'
import type { EffectType } from '../domain/Effect'
import type { EngineEvent } from './types'

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Everything a handler needs to execute one effect application.
 *
 * `rawDamage` is pre-computed by CombatEngine (ATK-scaled, mitigation applied).
 * For non-damage effects it is 0.  For `true_damage` it equals `power`.
 * Handlers must not call back into CombatEngine.
 */
export interface EffectContext {
  /** Character applying the effect (attacker or self). */
  readonly caster:    Character
  /** Character receiving the effect. */
  readonly target:    Character
  /** Raw power from the SkillDefinition (tick damage, shield size, stat delta…). */
  readonly power:     number
  /** Pre-computed damage to apply; 0 for non-damage effects. */
  readonly rawDamage: number
  /** Duration override in rounds; undefined = use the handler default. */
  readonly ticks?:    number
  /** Current battle round — included in CHARACTER_DIED events. */
  readonly round:     number
}

// ── Result ────────────────────────────────────────────────────────────────────

/**
 * What happened when one effect was applied.
 * CombatEngine uses this to emit events, update stats, and trigger meta-logic.
 */
export interface EffectResult {
  /** Events to emit to subscribers (renderer, logger, etc.). */
  readonly events:    EngineEvent[]
  /** HP damage that reached the target's HP pool (after shield, before death). */
  readonly hpDamage:  number
  /** HP restored to the target. */
  readonly healed:    number
  /** True if the target died from this effect. */
  readonly killed:    boolean
  /** True if an evade charge intercepted the hit (primary damage was negated). */
  readonly evaded:    boolean
  /** Damage to bounce back to the caster (from a ReflectEffect). */
  readonly reflected: number
  /** Effect types removed (for cleanse / purge). */
  readonly dispelled: EffectType[]
}

const EMPTY: EffectResult = {
  events: [], hpDamage: 0, healed: 0, killed: false, evaded: false, reflected: 0, dispelled: [],
}

// ── Handler type ──────────────────────────────────────────────────────────────

/**
 * A pure function that applies one effect and returns what happened.
 * Must NOT call back into CombatEngine or emit events directly.
 */
export type EffectHandler = (ctx: EffectContext) => EffectResult

// ── EffectResolver ────────────────────────────────────────────────────────────

export class EffectResolver {
  private readonly _handlers: Map<string, EffectHandler> = new Map()

  /**
   * Register a handler for `effectType`.
   * Overwrites any previously registered handler for the same type — useful
   * for overriding defaults in tests or loading modded skills.
   */
  register(effectType: string, handler: EffectHandler): void {
    this._handlers.set(effectType, handler)
  }

  /**
   * Dispatch to the registered handler for `effectType`.
   * Returns EMPTY_RESULT if no handler is registered (fail-soft).
   */
  resolve(effectType: string, ctx: EffectContext): EffectResult {
    const handler = this._handlers.get(effectType)
    if (!handler) return EMPTY
    return handler(ctx)
  }

  /** True when `effectType` has a registered handler. */
  has(effectType: string): boolean {
    return this._handlers.has(effectType)
  }

  /** All registered effect type keys. */
  get registeredTypes(): string[] {
    return [...this._handlers.keys()]
  }
}

// ── Default durations ─────────────────────────────────────────────────────────
//
// These match CombatEngine's static constants.  They live here too so that
// handlers are fully self-contained — no import cycle back to CombatEngine.

const BLEED_TICKS     = 3
const POISON_TICKS    = 3
const REGEN_TICKS     = 3
const STAT_MOD_TICKS  = 3
const STUN_TICKS      = 1
const HEAL_RED_TICKS  = 2
const HEAL_RED_FACTOR = 0.50
const BLEED_PER_TICK_RATIO = 0.4   // tick damage = power × this

// ── Built-in handlers ─────────────────────────────────────────────────────────
//
// Each function is a self-contained EffectHandler.  They mutate Character state
// and return the full EffectResult — no side-effects outside of `ctx.target`
// (and `ctx.caster` for reflect).  CombatEngine owns all meta-logic (kill
// tracking, victory check, stat accounting, reflect retaliation).

// ── Shared helper — apply Character.takeDamage and build the result object ──

function _applyRawDamage(ctx: EffectContext): EffectResult {
  if (!ctx.target.alive || ctx.rawDamage <= 0) return EMPTY

  const result = ctx.target.takeDamage(ctx.rawDamage)
  const events: EngineEvent[] = []

  if (result.evaded) {
    events.push({ type: 'EVADE_TRIGGERED', unitId: ctx.target.id })
    return { ...EMPTY, events, evaded: true }
  }

  if (result.shieldAbsorbed > 0) {
    events.push({
      type:        'SHIELD_ABSORBED',
      unitId:      ctx.target.id,
      shieldDamage: result.shieldAbsorbed,
      newShield:   ctx.target.shieldAmount,
    })
  }

  if (result.hpDamage > 0) {
    events.push({
      type:     'DAMAGE_APPLIED',
      unitId:   ctx.target.id,
      amount:   result.hpDamage,
      newHp:    ctx.target.hp,
      sourceId: ctx.caster.id,
    })
  }

  if (result.reflected > 0) {
    events.push({
      type:     'REFLECT_TRIGGERED',
      unitId:   ctx.target.id,
      amount:   result.reflected,
      sourceId: ctx.caster.id,
    })
  }

  if (result.killed) {
    events.push({
      type:     'CHARACTER_DIED',
      unitId:   ctx.target.id,
      killedBy: ctx.caster.id,
      wasKing:  ctx.target.role === 'king',
      round:    ctx.round,
    })
  }

  return {
    events,
    hpDamage:  result.hpDamage,
    healed:    0,
    killed:    result.killed,
    evaded:    false,
    reflected: result.reflected,
    dispelled: [],
  }
}

// ── Damage ──

const handleDamage: EffectHandler = (ctx) => _applyRawDamage(ctx)

// ── True damage (caller sets rawDamage = power, bypassing the formula) ──
// Shares the same handler — the distinction is made by CombatEngine before
// calling resolve().

const handleTrueDamage: EffectHandler = (ctx) => _applyRawDamage(ctx)

// ── Bleed — damage hit + DoT ──

const handleBleed: EffectHandler = (ctx) => {
  const hit = _applyRawDamage(ctx)
  if (hit.evaded || !ctx.target.alive) return hit

  const tickDmg = Math.max(1, Math.round(ctx.power * BLEED_PER_TICK_RATIO))
  ctx.target.addEffect(new BleedEffect(tickDmg, ctx.ticks ?? BLEED_TICKS))

  return {
    ...hit,
    events: [
      ...hit.events,
      { type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'bleed', value: tickDmg },
    ],
  }
}

// ── Poison — damage hit + DoT (stacks with bleed) ──

const handlePoison: EffectHandler = (ctx) => {
  const hit = _applyRawDamage(ctx)
  if (hit.evaded || !ctx.target.alive) return hit

  const tickDmg = Math.max(1, Math.round(ctx.power * BLEED_PER_TICK_RATIO))
  ctx.target.addEffect(new PoisonEffect(tickDmg, ctx.ticks ?? POISON_TICKS))

  return {
    ...hit,
    events: [
      ...hit.events,
      { type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'poison', value: tickDmg },
    ],
  }
}

// ── Stun — optional light hit + CC ──

const handleStun: EffectHandler = (ctx) => {
  const hit = ctx.rawDamage > 0 ? _applyRawDamage(ctx) : EMPTY
  if (hit.evaded || hit.killed || !ctx.target.alive) return hit

  const stunTicks = ctx.ticks ?? STUN_TICKS
  ctx.target.addEffect(new StunEffect(stunTicks))

  return {
    ...hit,
    events: [
      ...hit.events,
      { type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'stun', value: stunTicks },
    ],
  }
}

// ── Stat debuffs (def_down, atk_down, mov_down) ──

const handleDefDown: EffectHandler = (ctx) => {
  const hit = ctx.rawDamage > 0 ? _applyRawDamage(ctx) : EMPTY
  if (hit.evaded || hit.killed || !ctx.target.alive) return hit

  const ticks = ctx.ticks ?? STAT_MOD_TICKS
  ctx.target.addEffect(new DefReductionEffect(ctx.power, ticks))

  return {
    ...hit,
    events: [
      ...hit.events,
      { type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'def_down', value: ctx.power },
    ],
  }
}

const handleAtkDown: EffectHandler = (ctx) => {
  const hit = ctx.rawDamage > 0 ? _applyRawDamage(ctx) : EMPTY
  if (hit.evaded || hit.killed || !ctx.target.alive) return hit

  const ticks = ctx.ticks ?? STAT_MOD_TICKS
  ctx.target.addEffect(new AtkReductionEffect(ctx.power, ticks))

  return {
    ...hit,
    events: [
      ...hit.events,
      { type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'atk_down', value: ctx.power },
    ],
  }
}

const handleMovDown: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  const ticks = ctx.ticks ?? STAT_MOD_TICKS
  ctx.target.addEffect(new MovReductionEffect(ctx.power, ticks))
  return {
    ...EMPTY,
    events: [{ type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'mov_down', value: ctx.power }],
  }
}

// ── Heal ──

const handleHeal: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  const result = ctx.target.heal(ctx.power)
  if (result.actual <= 0) return EMPTY
  return {
    ...EMPTY,
    healed: result.actual,
    events: [{
      type:     'HEAL_APPLIED',
      unitId:   ctx.target.id,
      amount:   result.actual,
      newHp:    ctx.target.hp,
      sourceId: ctx.caster.id !== ctx.target.id ? ctx.caster.id : null,
    }],
  }
}

// ── Shield ──

const handleShield: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new ShieldEffect(ctx.power))
  return {
    ...EMPTY,
    events: [{ type: 'SHIELD_APPLIED', unitId: ctx.target.id, amount: ctx.power }],
  }
}

// ── Evade ──

const handleEvade: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new EvadeEffect(1))
  return {
    ...EMPTY,
    events: [{ type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'evade', value: 1 }],
  }
}

// ── Reflect ──

const handleReflect: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new ReflectEffect(ctx.power))
  return {
    ...EMPTY,
    events: [{ type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'reflect', value: ctx.power }],
  }
}

// ── Regen ──

const handleRegen: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new RegenEffect(ctx.power, ctx.ticks ?? REGEN_TICKS))
  return {
    ...EMPTY,
    events: [{ type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'regen', value: ctx.power }],
  }
}

// ── Stat buffs ──

const handleDefUp: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new DefBoostEffect(ctx.power, ctx.ticks ?? STAT_MOD_TICKS))
  return {
    ...EMPTY,
    events: [{ type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'def_up', value: ctx.power }],
  }
}

const handleAtkUp: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new AtkBoostEffect(ctx.power, ctx.ticks ?? STAT_MOD_TICKS))
  return {
    ...EMPTY,
    events: [{ type: 'STATUS_APPLIED', unitId: ctx.target.id, status: 'atk_up', value: ctx.power }],
  }
}

// ── Cleanse — remove all debuffs from target (ally / self) ──

const handleCleanse: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  const removed = ctx.target.removeEffectsByKind('debuff')
  if (removed.length === 0) return EMPTY
  return {
    ...EMPTY,
    dispelled: removed,
    events: [{ type: 'EFFECTS_CLEANSED', unitId: ctx.target.id, removed }],
  }
}

// ── Purge — strip all buffs from an enemy ──

const handlePurge: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  const removed = ctx.target.removeEffectsByKind('buff')
  if (removed.length === 0) return EMPTY
  return {
    ...EMPTY,
    dispelled: removed,
    events: [{ type: 'EFFECTS_PURGED', unitId: ctx.target.id, removed }],
  }
}

// ── Heal-reduction (applied as passive by Specialist — registered for completeness) ──

const handleHealReduction: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new HealReductionEffect(HEAL_RED_FACTOR, ctx.ticks ?? HEAL_RED_TICKS))
  return EMPTY   // no visual event for this passive — Specialist applies it silently
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Build an EffectResolver pre-loaded with every built-in handler.
 *
 * Call `resolver.register(type, handler)` to add new effect types or override
 * existing ones at any time without touching this file or CombatEngine.
 */
export function createDefaultResolver(): EffectResolver {
  const r = new EffectResolver()

  // Damage variants
  r.register('damage',      handleDamage)
  r.register('area',        handleDamage)     // AoE hits share damage semantics
  r.register('true_damage', handleTrueDamage)

  // DoT
  r.register('bleed',  handleBleed)
  r.register('poison', handlePoison)

  // Crowd control
  r.register('stun', handleStun)

  // Stat debuffs
  r.register('def_down', handleDefDown)
  r.register('atk_down', handleAtkDown)
  r.register('mov_down', handleMovDown)

  // Healing / sustain
  r.register('heal',  handleHeal)
  r.register('regen', handleRegen)

  // Damage mitigation
  r.register('shield',  handleShield)
  r.register('evade',   handleEvade)
  r.register('reflect', handleReflect)

  // Stat buffs
  r.register('def_up', handleDefUp)
  r.register('atk_up', handleAtkUp)

  // Dispel
  r.register('cleanse', handleCleanse)
  r.register('purge',   handlePurge)

  // Passive (registered so secondary-effect combos can reference it)
  r.register('heal_reduction', handleHealReduction)

  return r
}
