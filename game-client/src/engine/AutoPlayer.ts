/**
 * engine/AutoPlayer.ts — automatic skill selection for one actor's turn.
 *
 * AutoPlayer picks the first valid attack + defense combination for the
 * currently active actor and commits the turn through GameController.
 *
 * Responsibility boundary:
 *   - Knows nothing about Phaser, DOM, or rendering.
 *   - Makes decisions via controller queries only (no raw domain access).
 *   - Selects the simplest valid move: first skill in hand, first valid target.
 *
 * Usage:
 *   const player = new AutoPlayer(controller)
 *   player.act()   // picks + commits the current actor's turn
 */

import type { GameController } from './GameController'
import type { TargetSpec }     from './CombatEngine'

export class AutoPlayer {
  constructor(private readonly ctrl: GameController) {}

  /**
   * Select skills and commit the current actor's turn.
   * Returns true if a turn was committed, false if there was no active actor.
   */
  act(): boolean {
    const actor = this.ctrl.currentActor
    if (!actor) return false

    // Training dummies don't act — skip immediately
    if (actor.isDummy) {
      this.ctrl.skipTurn('no_selection')
      return true
    }

    const id   = actor.id
    const hand = this.ctrl.getHand(id)
    if (!hand) return false

    // Defense — pick first available skill (always self-targeted)
    const defSkill = hand.defense[0]
    if (defSkill) {
      this.ctrl.selectDefense(id, defSkill.id)
    }

    // Attack — try each skill in order; stop at the first success
    for (const skill of hand.attack) {
      const spec = this._buildSpec(id, skill.id, skill.targetType)
      if (spec === null) continue
      const result = this.ctrl.selectAttack(id, skill.id, spec)
      if (result.ok) break
    }

    this.ctrl.commitTurn()
    return true
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Build a TargetSpec for the given skill, or return null if no valid
   * target could be found (e.g. all enemies are out of range for 'single').
   */
  private _buildSpec(
    characterId: string,
    skillId:     string,
    targetType:  string,
  ): TargetSpec | null {
    switch (targetType) {
      case 'self':
        return { kind: 'self' }

      case 'lowest_ally':
        return { kind: 'lowest_ally' }

      case 'all_allies':
        return { kind: 'all_allies' }

      case 'single': {
        const targets = this.ctrl.getValidTargets(characterId, skillId)
        if (targets.length === 0) return null
        return { kind: 'character', characterId: targets[0].id }
      }

      case 'area': {
        const positions = this.ctrl.getValidAreaPositions(characterId, skillId)
        if (positions.length === 0) return null
        return { kind: 'area', col: positions[0].col, row: positions[0].row }
      }

      default:
        return null
    }
  }
}
