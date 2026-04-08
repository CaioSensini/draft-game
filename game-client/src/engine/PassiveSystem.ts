/**
 * engine/PassiveSystem.ts — runtime handler for character passive abilities.
 *
 * PassiveSystem maps PassiveType strings → handler functions, mirroring the
 * EffectResolver pattern. CombatEngine calls it at three injection points:
 *
 *   1. computeRawDamage (outgoing)  → getAtkBonus()
 *   2. computeRawDamage (incoming)  → getMitigationBonus()
 *   3. after HP damage is dealt     → onDamageDealt()
 *
 * Extending the system:
 *   - New formula passives: add a case to getAtkBonus() or getMitigationBonus()
 *   - New side-effect passives: add a case to onDamageDealt() (or a new method
 *     if a completely new injection point is needed in CombatEngine)
 *   - Both require a matching entry in data/passiveCatalog.ts
 *   - No CombatEngine changes are needed for existing injection points
 */

import type { PassiveDefinition } from '../domain/Passive'
import type { Character } from '../domain/Character'
import type { CharacterRole } from '../domain/Character'
import type { Battle } from '../domain/Battle'
import { HealReductionEffect } from '../domain/Effect'
import type { EngineEvent } from './types'
import { EventType } from './types'

// ── PassiveSystem ─────────────────────────────────────────────────────────────

export class PassiveSystem {
  /**
   * One passive per role key.
   * Keyed by `forRole` — allows O(1) lookup when checking a specific character.
   * Store an array to support multiple passives per role if ever needed.
   */
  private readonly _registry: Map<CharacterRole, PassiveDefinition[]> = new Map()

  // ── Registration ──────────────────────────────────────────────────────────

  /** Register a passive. Multiple passives per role are supported. */
  register(def: PassiveDefinition): void {
    const list = this._registry.get(def.forRole) ?? []
    list.push(def)
    this._registry.set(def.forRole, list)
  }

  /** All passives for `role`, or an empty array. */
  forRole(role: CharacterRole): PassiveDefinition[] {
    return this._registry.get(role) ?? []
  }

  /** All registered passives (flat list). */
  get all(): ReadonlyArray<PassiveDefinition> {
    return [...this._registry.values()].flat()
  }

  // ── Injection point 1: outgoing ATK multiplier ────────────────────────────

  /**
   * Returns an additive bonus to the caster's ATK multiplier.
   *
   * CombatEngine usage:
   *   atkMult *= (1 + passiveSystem.getAtkBonus(caster, battle))
   *
   * Currently handles:
   *   `atk_bonus_when_isolated` — +value% when no adjacent ally
   */
  getAtkBonus(caster: Character, battle: Battle): number {
    let bonus = 0
    for (const def of this.forRole(caster.role)) {
      if (def.type === 'atk_bonus_when_isolated') {
        if (battle.teamOf(caster.side).isIsolated(caster)) {
          bonus += def.value
        }
      }
    }
    return bonus
  }

  // ── Injection point 2: incoming mitigation bonus ──────────────────────────

  /**
   * Returns extra mitigation percentage for the target, summed from all
   * applicable passives on the target's team.
   *
   * CombatEngine usage:
   *   mit += passiveSystem.getMitigationBonus(target, battle)
   *   mit = Math.min(MAX_MITIGATION, mit)
   *
   * Currently handles:
   *   `incoming_damage_reduction` — target's own passive (always active)
   *   `guardian_mit_bonus`        — a nearby ally protects the target
   */
  getMitigationBonus(target: Character, battle: Battle): number {
    let bonus = 0
    const team = battle.teamOf(target.side)

    for (const member of team.living) {
      for (const def of this.forRole(member.role)) {
        switch (def.type) {

          case 'incoming_damage_reduction':
            // Self-only passive: applies only when the member IS the target
            if (member.id === target.id) {
              bonus += def.value
            }
            break

          case 'guardian_mit_bonus':
            // Protector passive: applies when the protector is adjacent to the target
            if (member.id !== target.id) {
              const dist =
                Math.abs(member.col - target.col) +
                Math.abs(member.row - target.row)
              if (dist === 1) {
                bonus += def.value
              }
            }
            break
        }
      }
    }

    return bonus
  }

  // ── Injection point 3: after HP damage is dealt ───────────────────────────

  /**
   * Called after `caster` deals HP damage to `target`.
   * Applies any side-effect passives and returns events to emit.
   *
   * CombatEngine usage:
   *   if (result.hpDamage > 0) {
   *     for (const e of passiveSystem.onDamageDealt(caster, target, round)) emit(e)
   *   }
   *
   * Currently handles:
   *   `heal_reduction_on_hit` — debuffs target's heals for `ticks` rounds
   */
  onDamageDealt(
    caster:  Character,
    target:  Character,
    round:   number,
  ): EngineEvent[] {
    if (!target.alive) return []

    const events: EngineEvent[] = []

    for (const def of this.forRole(caster.role)) {
      if (def.type === 'heal_reduction_on_hit') {
        const ticks = def.ticks ?? 2
        target.addEffect(new HealReductionEffect(def.value, ticks))

        events.push({
          type:      EventType.PASSIVE_TRIGGERED,
          unitId:    caster.id,
          passiveId: def.id,
          targetId:  target.id,
        })
        // Also let the UI know a debuff was applied
        events.push({
          type:   EventType.STATUS_APPLIED,
          unitId: target.id,
          status: 'heal_reduction' as never,   // narrow cast — see note below
          value:  def.value,
        })
        void round  // round available for future event fields (e.g. expiry tracking)
      }
    }

    return events
  }
}

// ── Default factory ───────────────────────────────────────────────────────────

/**
 * Build a PassiveSystem pre-loaded with all passives from the catalog.
 * Import `PASSIVE_CATALOG` from data/passiveCatalog.ts and register everything.
 */
export function createDefaultPassiveSystem(
  catalog: ReadonlyArray<PassiveDefinition>,
): PassiveSystem {
  const system = new PassiveSystem()
  for (const def of catalog) system.register(def)
  return system
}
