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
  BurnEffect,
  StunEffect,
  SnareEffect,
  MarkEffect,
  ReviveEffect,
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
  GuardedByEffect,
} from '../domain/Effect'
import type { EffectType } from '../domain/Effect'
import type { Direction } from '../domain/Grid'
import { Position } from '../domain/Grid'
import type { EngineEvent } from './types'
import { EventType } from './types'

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
  /**
   * Push request — set by the 'push' handler.
   * CombatEngine reads this after resolve() and calls Grid.applyPush().
   * Null when no push is requested.
   */
  readonly pushRequest?: {
    readonly targetId:  string
    readonly direction: import('../domain/Grid').Direction
    readonly force:     number
  } | null
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
const BURN_TICKS      = 3
const REGEN_TICKS     = 3
const STAT_MOD_TICKS  = 3
const STUN_TICKS      = 1
const SNARE_TICKS     = 2
const HEAL_RED_TICKS  = 2
const HEAL_RED_FACTOR = 0.50
const BLEED_PER_TICK_RATIO = 0.4   // tick damage = power × this
const BURN_PER_TICK_RATIO  = 0.4   // burn tick damage = power × this
const MARK_BONUS_RATIO     = 0.50  // bonus damage when mark is consumed = power × this
const REVIVE_HP_RATIO      = 0.20  // revive restores 20% of target's maxHp
const LIFESTEAL_RATIO      = 0.50  // default lifesteal % (power overrides this)

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
    events.push({ type: EventType.EVADE_TRIGGERED, unitId: ctx.target.id })
    return { ...EMPTY, events, evaded: true }
  }

  if (result.shieldAbsorbed > 0) {
    events.push({
      type:        EventType.SHIELD_ABSORBED,
      unitId:      ctx.target.id,
      shieldDamage: result.shieldAbsorbed,
      newShield:   ctx.target.shieldAmount,
    })
  }

  if (result.hpDamage > 0) {
    events.push({
      type:     EventType.DAMAGE_APPLIED,
      unitId:   ctx.target.id,
      amount:   result.hpDamage,
      newHp:    ctx.target.hp,
      sourceId: ctx.caster.id,
    })
  }

  if (result.reflected > 0) {
    events.push({
      type:     EventType.REFLECT_TRIGGERED,
      unitId:   ctx.target.id,
      amount:   result.reflected,
      sourceId: ctx.caster.id,
    })
  }

  if (result.revived) {
    events.push({
      type:       EventType.REVIVE_TRIGGERED,
      unitId:     ctx.target.id,
      restoredHp: result.revivedHp,
    })
  }

  if (result.killed) {
    events.push({
      type:     EventType.CHARACTER_DIED,
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
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'bleed', value: tickDmg },
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
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'poison', value: tickDmg },
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
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'stun', value: stunTicks },
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
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'def_down', value: ctx.power },
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
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'atk_down', value: ctx.power },
    ],
  }
}

const handleMovDown: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  const ticks = ctx.ticks ?? STAT_MOD_TICKS
  ctx.target.addEffect(new MovReductionEffect(ctx.power, ticks))
  return {
    ...EMPTY,
    events: [{ type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'mov_down', value: ctx.power }],
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
      type:     EventType.HEAL_APPLIED,
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
    events: [{ type: EventType.SHIELD_APPLIED, unitId: ctx.target.id, amount: ctx.power }],
  }
}

// ── Evade ──

const handleEvade: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new EvadeEffect(1))
  return {
    ...EMPTY,
    events: [{ type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'evade', value: 1 }],
  }
}

// ── Reflect ──

const handleReflect: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new ReflectEffect(ctx.power))
  return {
    ...EMPTY,
    events: [{ type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'reflect', value: ctx.power }],
  }
}

// ── Regen ──

const handleRegen: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new RegenEffect(ctx.power, ctx.ticks ?? REGEN_TICKS))
  return {
    ...EMPTY,
    events: [{ type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'regen', value: ctx.power }],
  }
}

// ── Stat buffs ──

const handleDefUp: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new DefBoostEffect(ctx.power, ctx.ticks ?? STAT_MOD_TICKS))
  return {
    ...EMPTY,
    events: [{ type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'def_up', value: ctx.power }],
  }
}

const handleAtkUp: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new AtkBoostEffect(ctx.power, ctx.ticks ?? STAT_MOD_TICKS))
  return {
    ...EMPTY,
    events: [{ type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'atk_up', value: ctx.power }],
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
    events: [{ type: EventType.EFFECTS_CLEANSED, unitId: ctx.target.id, removed }],
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
    events: [{ type: EventType.EFFECTS_PURGED, unitId: ctx.target.id, removed }],
  }
}

// ── Heal-reduction (applied as passive by Specialist — registered for completeness) ──

const handleHealReduction: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY
  ctx.target.addEffect(new HealReductionEffect(HEAL_RED_FACTOR, ctx.ticks ?? HEAL_RED_TICKS))
  return EMPTY   // no visual event for this passive — Specialist applies it silently
}

// ── Burn — damage hit + fire DoT ──

const handleBurn: EffectHandler = (ctx) => {
  const hit = _applyRawDamage(ctx)
  if (hit.evaded || !ctx.target.alive) return hit

  const tickDmg = Math.max(1, Math.round(ctx.power * BURN_PER_TICK_RATIO))
  ctx.target.addEffect(new BurnEffect(tickDmg, ctx.ticks ?? BURN_TICKS))

  return {
    ...hit,
    events: [
      ...hit.events,
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'burn' as const, value: tickDmg },
    ],
  }
}

// ── Snare — optional light hit + movement lock ──

const handleSnare: EffectHandler = (ctx) => {
  const hit = ctx.rawDamage > 0 ? _applyRawDamage(ctx) : EMPTY
  if (hit.evaded || hit.killed || !ctx.target.alive) return hit

  const snareTicks = ctx.ticks ?? SNARE_TICKS
  ctx.target.addEffect(new SnareEffect(snareTicks))

  return {
    ...hit,
    events: [
      ...hit.events,
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'snare' as const, value: snareTicks },
    ],
  }
}

// ── Push — returns a push request for CombatEngine to execute via Grid ──

const handlePush: EffectHandler = (ctx) => {
  const hit = ctx.rawDamage > 0 ? _applyRawDamage(ctx) : EMPTY
  if (hit.evaded || hit.killed || !ctx.target.alive) return hit

  // Determine push direction: away from caster
  const casterPos = Position.of(ctx.caster.col, ctx.caster.row)
  const targetPos = Position.of(ctx.target.col, ctx.target.row)
  const dc = Math.sign(targetPos.col - casterPos.col)
  const dr = Math.sign(targetPos.row - casterPos.row)
  const direction = _offsetToDirection(dc, dr)

  // Push force = power (capped at reasonable range)
  const force = Math.max(1, Math.min(ctx.power, 5))

  return {
    ...hit,
    pushRequest: {
      targetId:  ctx.target.id,
      direction,
      force,
    },
  }
}

/** Map (Δcol, Δrow) sign to a Direction string. Defaults to 'east' if ambiguous. */
function _offsetToDirection(dc: number, dr: number): Direction {
  if (dc > 0 && dr === 0) return 'east'
  if (dc < 0 && dr === 0) return 'west'
  if (dc === 0 && dr < 0) return 'north'
  if (dc === 0 && dr > 0) return 'south'
  if (dc > 0 && dr < 0)   return 'northeast'
  if (dc > 0 && dr > 0)   return 'southeast'
  if (dc < 0 && dr < 0)   return 'northwest'
  if (dc < 0 && dr > 0)   return 'southwest'
  return 'east'  // fallback (same tile — shouldn't happen in practice)
}

// ── Lifesteal — damage + heal caster for a percentage of damage dealt ──

const handleLifesteal: EffectHandler = (ctx) => {
  const hit = _applyRawDamage(ctx)
  if (hit.evaded || hit.hpDamage <= 0) return hit

  // power = lifesteal percentage (e.g. 50 = 50%)
  const stealPct = ctx.power > 0 ? ctx.power / 100 : LIFESTEAL_RATIO
  const healAmount = Math.max(1, Math.round(hit.hpDamage * stealPct))

  // v3 §2.1 exception: King's own lifesteal skill (Sequência de Socos) is a
  // self-heal AND the caster is the King — so we bypass the global King
  // heal-immunity. Non-King casters heal normally through the same call.
  const healResult = ctx.caster.heal(healAmount, {
    ignoreKingImmunity: ctx.caster.role === 'king',
  })
  const events = [...hit.events]

  if (healResult.actual > 0) {
    events.push({
      type:   EventType.LIFESTEAL_HEAL,
      unitId: ctx.caster.id,
      amount: healResult.actual,
      newHp:  ctx.caster.hp,
    })
  }

  return { ...hit, events, healed: healResult.actual }
}

// ── Mark — tag target for bonus damage; if already marked, consume and deal bonus ──

const handleMark: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY

  const existingMark = ctx.target.markEffect
  if (existingMark) {
    // Consume the mark — deal bonus damage
    const bonus = existingMark.consume()
    const bonusResult = ctx.target.takeDamage(bonus)

    const events: EngineEvent[] = [
      { type: EventType.MARK_CONSUMED, unitId: ctx.target.id, bonusDamage: bonus, sourceId: ctx.caster.id },
    ]
    if (bonusResult.hpDamage > 0) {
      events.push({
        type: EventType.DAMAGE_APPLIED, unitId: ctx.target.id,
        amount: bonusResult.hpDamage, newHp: ctx.target.hp, sourceId: ctx.caster.id,
      })
    }
    if (bonusResult.killed) {
      events.push({
        type: EventType.CHARACTER_DIED, unitId: ctx.target.id,
        killedBy: ctx.caster.id, wasKing: ctx.target.role === 'king', round: ctx.round,
      })
    }

    return {
      ...EMPTY,
      events,
      hpDamage: bonusResult.hpDamage,
      killed:   bonusResult.killed,
    }
  }

  // No existing mark — apply a new one
  const bonusDmg = Math.max(1, Math.round(ctx.power * MARK_BONUS_RATIO))
  ctx.target.addEffect(new MarkEffect(ctx.caster.id, bonusDmg))

  return {
    ...EMPTY,
    events: [
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'mark' as const, value: bonusDmg },
    ],
  }
}

// ── Revive — grant a one-time death-prevention buffer to the target ──

const handleRevive: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY

  // Restore HP = power if set, else 20% of maxHp
  const reviveHp = ctx.power > 0
    ? ctx.power
    : Math.max(1, Math.round(ctx.target.maxHp * REVIVE_HP_RATIO))

  ctx.target.addEffect(new ReviveEffect(reviveHp))

  return {
    ...EMPTY,
    events: [
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'revive' as const, value: reviveHp },
    ],
  }
}

// ── Double Attack — self-buff that grants 2 attack skills next turn ──

const handleDoubleAttack: EffectHandler = (ctx) => {
  if (!ctx.caster.alive) return EMPTY
  ctx.caster.setDoubleAttackNextTurn(true)
  return {
    ...EMPTY,
    events: [
      { type: EventType.STATUS_APPLIED, unitId: ctx.caster.id, status: 'double_attack' as const, value: 1 },
      { type: EventType.DOUBLE_ATTACK_READY, unitId: ctx.caster.id },
    ],
  }
}

// ── Silence Defense — blocks enemy from using defense skills next turn ──

const handleSilenceDefense: EffectHandler = (ctx) => {
  const hit = ctx.rawDamage > 0 ? _applyRawDamage(ctx) : EMPTY
  if (hit.evaded || hit.killed || !ctx.target.alive) return hit

  ctx.target.setSilencedDefenseTicks(ctx.ticks ?? 1)

  return {
    ...hit,
    events: [
      ...hit.events,
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'silence_defense' as const, value: 1 },
      { type: EventType.DEFENSE_SILENCED, unitId: ctx.target.id, sourceId: ctx.caster.id },
    ],
  }
}

// ── Silence Attack — v3: blocks enemy attack skill next turn (Desarme) ──
//
// Mirrors silence_defense but targets the attack queue. v3 §6.5 says
// "Desarme: 6 dano + cancela skill atk do alvo no turno + silence_attack 1t".
// The "cancela skill atk do alvo no turno" part is actionable only in the
// action-phase sequencer (not this resolver), but setting the silence flag
// covers the persistent 1-turn effect correctly.

const handleSilenceAttack: EffectHandler = (ctx) => {
  const hit = ctx.rawDamage > 0 ? _applyRawDamage(ctx) : EMPTY
  if (hit.evaded || hit.killed || !ctx.target.alive) return hit

  // v3: "Não afeta reis". If target is a king, skill only deals damage —
  // silence is suppressed.
  if (ctx.target.role === 'king') {
    return {
      ...hit,
      events: [
        ...hit.events,
        // No status_applied emitted — silence was suppressed on a King.
      ],
    }
  }

  ctx.target.setSilencedAttackTicks(ctx.ticks ?? 1)

  return {
    ...hit,
    events: [
      ...hit.events,
      { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'silence_attack' as const, value: 1 },
    ],
  }
}

// ── Teleport (self / target) — stub handlers ─────────────────────────────────
// v3 has two teleport variants (teleport_self for caster relocation, e.g.
// Executor's Teleport and King's Fuga Sombria reposition; teleport_target
// for enemy displacement, e.g. King's Intimidação and Ordem Real).
// Full implementation requires input from the player (destination tile)
// or scene-level choice. For Bloco 2 we emit a status event so animations
// can fire, and leave the position change to the scene layer to orchestrate.

const handleTeleportSelf: EffectHandler = (ctx) => {
  return {
    ...EMPTY,
    events: [{
      type: EventType.STATUS_APPLIED,
      unitId: ctx.caster.id,
      status: 'teleport_self' as const,
      value: ctx.power,
    }],
  }
}

const handleTeleportTarget: EffectHandler = (ctx) => {
  const hit = ctx.rawDamage > 0 ? _applyRawDamage(ctx) : EMPTY
  if (!ctx.target.alive) return hit

  return {
    ...hit,
    events: [
      ...hit.events,
      {
        type: EventType.STATUS_APPLIED,
        unitId: ctx.target.id,
        status: 'teleport_target' as const,
        value: ctx.power,
      },
    ],
  }
}

// ── Invisibility (Fuga Sombria) — stub handler ──────────────────────────────
// v3: King becomes untargetable by single-target skills until damaged or
// moved. Full enforcement requires TargetingSystem participation; we set
// a status flag on the Character so the UI can show the "hidden" visual.

const handleInvisibility: EffectHandler = (ctx) => {
  return {
    ...EMPTY,
    events: [{
      type: EventType.STATUS_APPLIED,
      unitId: ctx.caster.id,
      status: 'invisibility' as const,
      value: 1,
    }],
  }
}

// ── Clone (Sombra Real) — stub handler ───────────────────────────────────────
// v3: Create 2 decoys in empty cells; King can swap with one. Clones last
// 2 turns. A full clone system needs entity spawning, targeting filters,
// and resolution on clone-hit — all outside the scope of EffectResolver.
// We emit a clone-spawn signal so future systems can implement it.

const handleClone: EffectHandler = (ctx) => {
  return {
    ...EMPTY,
    events: [{
      type: EventType.STATUS_APPLIED,
      unitId: ctx.caster.id,
      status: 'clone' as const,
      value: ctx.power,   // number of clones
    }],
  }
}

// ── Summon wall (Muralha Viva, Prisão de Muralha Morta) — stub handler ──────
// v3 §6.3:
//   Muralha Viva: creates a 2-sqm vertical wall in enemy field for 2 turns;
//     enemies adjacent to the wall take 3 dmg/turn + def_down 15% + mov_down 1.
//   Prisão de Muralha Morta: 8 temporary walls around a 3x3 center; enemies
//     in the ring are snared 2 turns; walls break to any atk1 hit.
//
// Full implementation requires a "tile obstacle" system in Grid (occupancy
// semantics, HP per wall tile, area damage zones, break-on-atk1 detection).
// That's out of scope for Bloco 3 — we emit a status event so animations can
// signal the wall summon, and leave the mechanic as a documented stub.
// The secondaryEffect (def_down / snare) still applies to whatever targets
// the area shape resolves to, so partial gameplay value exists today.

const handleSummonWall: EffectHandler = (ctx) => {
  // If the skill carries damage (power > 0 and rawDamage computed, e.g.
  // Prisão de Muralha Morta has 12 center damage), apply it first.
  const hit = ctx.rawDamage > 0 ? _applyRawDamage(ctx) : EMPTY

  return {
    ...hit,
    events: [
      ...hit.events,
      {
        type:   EventType.STATUS_APPLIED,
        unitId: ctx.caster.id,
        status: 'summon_wall' as const,
        value:  ctx.power,
      },
    ],
  }
}

// ── Damage redirect (Guardião) ───────────────────────────────────────────────
// v3 §6.3 — attaches a GuardedByEffect to the protected ally. The actual
// damage-split math is applied inside CombatEngine._applyOffensiveSkill,
// which inspects the effect on every incoming hit and routes the
// configured fraction to the protector after a 30% mitigation.

const handleDamageRedirect: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY

  // v3 §6.3: 60% redirected, reduced 30% on the warrior, 1 turn.
  ctx.target.addEffect(new GuardedByEffect(ctx.caster.id, 0.60, 0.30, ctx.ticks ?? 1))

  return {
    ...EMPTY,
    events: [{
      type:   EventType.STATUS_APPLIED,
      unitId: ctx.target.id,
      status: 'damage_redirect' as const,
      value:  Math.round(0.60 * 100),
    }],
  }
}

// ── Advance allies — move target 1 tile toward enemy side + DEF buff ─────────

const handleAdvanceAllies: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY

  // Apply def_up buff
  ctx.target.addEffect(new DefBoostEffect(ctx.power, ctx.ticks ?? STAT_MOD_TICKS))

  const events: EngineEvent[] = [
    { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'def_up', value: ctx.power },
  ]

  // Move target 1 tile toward enemy side
  const direction: Direction = ctx.caster.side === 'left' ? 'east' : 'west'

  return {
    ...EMPTY,
    events,
    pushRequest: { targetId: ctx.target.id, direction, force: 1 },
  }
}

// ── Retreat allies — move target 1 tile away from enemy side + DEF buff ──────

const handleRetreatAllies: EffectHandler = (ctx) => {
  if (!ctx.target.alive) return EMPTY

  // Apply def_up buff
  ctx.target.addEffect(new DefBoostEffect(ctx.power, ctx.ticks ?? STAT_MOD_TICKS))

  const events: EngineEvent[] = [
    { type: EventType.STATUS_APPLIED, unitId: ctx.target.id, status: 'def_up', value: ctx.power },
  ]

  // Move target 1 tile away from enemy side
  const direction: Direction = ctx.caster.side === 'left' ? 'west' : 'east'

  return {
    ...EMPTY,
    events,
    pushRequest: { targetId: ctx.target.id, direction, force: 1 },
  }
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

  // New mechanics
  r.register('burn',      handleBurn)
  r.register('snare',     handleSnare)
  r.register('push',      handlePush)
  r.register('lifesteal', handleLifesteal)
  r.register('mark',      handleMark)
  r.register('revive',    handleRevive)

  // Turn-modifier mechanics
  r.register('double_attack',    handleDoubleAttack)
  r.register('silence_defense',  handleSilenceDefense)
  r.register('silence_attack',   handleSilenceAttack)

  // v3 Bloco 2 — King skills
  r.register('teleport_self',    handleTeleportSelf)
  r.register('teleport_target',  handleTeleportTarget)
  r.register('invisibility',     handleInvisibility)
  r.register('clone',            handleClone)

  // Ally movement mechanics
  r.register('advance_allies',   handleAdvanceAllies)
  r.register('retreat_allies',   handleRetreatAllies)

  // Bloco 3 Warrior stubs
  r.register('summon_wall',      handleSummonWall)
  r.register('damage_redirect',  handleDamageRedirect)

  return r
}
