/**
 * engine/CombatRuleSystem.ts — runtime evaluation of global combat rules.
 *
 * CombatRuleSystem maps CombatRuleType strings → handler logic, following the
 * same registry pattern as PassiveSystem and EffectResolver.
 *
 * CombatEngine calls it at three injection points:
 *
 *   1. computeRawDamage (outgoing)   → getAtkBonus(caster, battle)
 *   2. computeRawDamage (incoming)   → getMitigationBonus(target, battle)
 *   3. applyRoundStartRules()        → onRoundStart(battle)  [round-start events]
 *
 * Rules are evaluated dynamically at call time — no cached state.
 * Re-querying after movement gives the correct updated result automatically,
 * satisfying the "recalculated each turn" requirement.
 *
 * Extending the system (see also domain/CombatRule.ts for the full guide):
 *   - Formula rule: add a case to getAtkBonus() or getMitigationBonus().
 *   - Round-start rule: add a case to onRoundStart().
 *   - New injection point: add a method here + wire it in CombatEngine.
 */

import type { CombatRuleDefinition } from '../domain/CombatRule'
import type { Character } from '../domain/Character'
import type { Battle } from '../domain/Battle'
import type { EngineEvent, TeamSide } from './types'
import { EventType } from './types'

// ── CombatRuleSystem ──────────────────────────────────────────────────────────

export class CombatRuleSystem {
  private readonly _rules: CombatRuleDefinition[] = []

  // ── Registration ──────────────────────────────────────────────────────────

  /** Register a rule. Multiple rules may coexist; their bonuses stack. */
  register(def: CombatRuleDefinition): void {
    this._rules.push(def)
  }

  /** All registered rules (read-only). */
  get all(): ReadonlyArray<CombatRuleDefinition> {
    return this._rules
  }

  /** All rules of a given type. */
  ofType(type: CombatRuleDefinition['type']): CombatRuleDefinition[] {
    return this._rules.filter((r) => r.type === type)
  }

  // ── Injection point 1: outgoing ATK multiplier ────────────────────────────

  /**
   * Returns an additive bonus applied to the caster's ATK multiplier.
   *
   * CombatEngine usage:
   *   atkMult *= (1 + rules.getAtkBonus(caster, battle))
   *
   * Currently handles:
   *   `outnumbered_atk_bonus` — bonus when caster's team has fewer alive units
   */
  getAtkBonus(caster: Character, battle: Battle): number {
    let bonus = 0

    for (const rule of this._rules) {
      switch (rule.type) {

        case 'outnumbered_atk_bonus': {
          const casterTeam = battle.teamOf(caster.side)
          const enemySide  = caster.side === 'left' ? 'right' : 'left'
          const enemyTeam  = battle.teamOf(enemySide)
          if (casterTeam.livingCount < enemyTeam.livingCount) {
            bonus += rule.value
          }
          break
        }

        // Formula-mitigation rules handled in getMitigationBonus — skip here
        default: break
      }
    }

    return bonus
  }

  // ── Injection point 2: incoming mitigation bonus ──────────────────────────

  /**
   * Returns extra mitigation percentage added to the target's incoming mitigation.
   *
   * CombatEngine usage:
   *   mit += rules.getMitigationBonus(target, battle)
   *   mit = Math.min(MAX_MITIGATION, mit)
   *
   * Currently handles:
   *   `wall_mit_per_toucher` — scales with team wall-toucher count
   *   `last_stand_mit_bonus` — king's lone-survivor bonus
   */
  getMitigationBonus(target: Character, battle: Battle): number {
    let bonus = 0
    const targetTeam = battle.teamOf(target.side)

    for (const rule of this._rules) {
      switch (rule.type) {

        case 'wall_mit_per_toucher': {
          // Each team member touching the wall contributes `value` mitigation
          // for the entire team when under attack.
          bonus += rule.value * targetTeam.wallTouchCount()
          break
        }

        case 'last_stand_mit_bonus': {
          // Only applies when the target IS the king AND they are the last alive.
          if (target.role === 'king' && targetTeam.livingCount === 1) {
            bonus += rule.value
          }
          break
        }

        // ATK rules handled in getAtkBonus — skip here
        default: break
      }
    }

    return bonus
  }

  // ── Injection point 3: round start ───────────────────────────────────────

  /**
   * Called once at the beginning of each round.
   * Returns events describing which rules are currently active — lets the
   * renderer show battlefield-condition indicators in the HUD.
   *
   * Does NOT apply damage or modify character state here (DoT / zone hazard
   * effects should be added as new rule types with dedicated handler logic).
   *
   * CombatEngine usage:
   *   for (const e of rules.onRoundStart(battle)) emit(e)
   */
  onRoundStart(battle: Battle): EngineEvent[] {
    const events: EngineEvent[] = []

    for (const rule of this._rules) {
      switch (rule.type) {

        case 'wall_mit_per_toucher': {
          // Emit for each side that has wall-touchers this round
          for (const side of ['left', 'right'] as TeamSide[]) {
            const team = battle.teamOf(side)
            const count = team.wallTouchCount()
            if (count > 0) {
              events.push({
                type:      EventType.COMBAT_RULE_ACTIVE,
                ruleId:    rule.id,
                side,
                value:     rule.value * count,
              })
            }
          }
          break
        }

        case 'last_stand_mit_bonus': {
          // Emit for any king that is the sole survivor this round
          for (const side of ['left', 'right'] as TeamSide[]) {
            const team = battle.teamOf(side)
            if (team.livingCount === 1 && team.king?.alive) {
              events.push({
                type:   EventType.COMBAT_RULE_ACTIVE,
                ruleId: rule.id,
                side,
                value:  rule.value,
              })
            }
          }
          break
        }

        case 'outnumbered_atk_bonus': {
          // Emit for any side that is outnumbered
          for (const side of ['left', 'right'] as TeamSide[]) {
            const myTeam    = battle.teamOf(side)
            const enemySide = side === 'left' ? 'right' : 'left'
            const enemyTeam = battle.teamOf(enemySide)
            if (myTeam.livingCount < enemyTeam.livingCount) {
              events.push({
                type:   EventType.COMBAT_RULE_ACTIVE,
                ruleId: rule.id,
                side,
                value:  rule.value,
              })
            }
          }
          break
        }
      }
    }

    return events
  }

  // ── Snapshot query ────────────────────────────────────────────────────────

  /**
   * Compute the current effective ATK and mitigation bonuses for every living
   * character on both sides. Useful for the HUD and AI decision-making.
   *
   * Returns a map of characterId → { atkBonus, mitBonus }.
   */
  snapshot(battle: Battle): Map<string, { atkBonus: number; mitBonus: number }> {
    const result = new Map<string, { atkBonus: number; mitBonus: number }>()

    for (const char of battle.livingCharacters) {
      result.set(char.id, {
        atkBonus: this.getAtkBonus(char, battle),
        mitBonus: this.getMitigationBonus(char, battle),
      })
    }

    return result
  }
}

// ── Default factory ───────────────────────────────────────────────────────────

/** Build a CombatRuleSystem pre-loaded with the provided rule definitions. */
export function createDefaultRuleSystem(
  catalog: ReadonlyArray<CombatRuleDefinition>,
): CombatRuleSystem {
  const system = new CombatRuleSystem()
  for (const def of catalog) system.register(def)
  return system
}
