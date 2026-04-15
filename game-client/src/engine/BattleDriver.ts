/**
 * engine/BattleDriver.ts — battle sequencing orchestrator.
 *
 * BattleDriver drives the battle forward by reacting to engine events
 * and calling the right GameController methods at the right time.
 *
 * ── What it owns ─────────────────────────────────────────────────────────────
 *   - Deciding when to skip movement phases
 *   - Deciding when to call beginActionPhase()
 *   - Triggering AutoPlayer for bot turns
 *   - Advancing phases once they complete
 *
 * ── What it does NOT own ─────────────────────────────────────────────────────
 *   - Visual animations
 *   - Sound effects
 *   - HUD updates
 *   - Any Phaser dependency whatsoever
 *
 * ── Player vs bot turns ───────────────────────────────────────────────────────
 * Set `playerSide` to prevent auto-play for that side. The Phaser scene is
 * responsible for capturing input and calling ctrl.commitTurn() manually.
 * Bot turns continue to be handled by AutoPlayer after `turnPlayMs`.
 *
 * ── Delays ───────────────────────────────────────────────────────────────────
 * The driver uses native `setTimeout` so it works in any JavaScript context
 * (browser, Node.js, tests) without coupling to Phaser.time.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   const driver = new BattleDriver(controller, autoPlayer, {
 *     movementSkipMs: 400,
 *     actionBeginMs:  300,
 *     turnPlayMs:     700,
 *     phaseAdvanceMs: 500,
 *     playerSide:     'left',   // optional — omit for full-auto
 *   })
 *   driver.start()
 *   // later, on scene shutdown:
 *   driver.destroy()
 */

import type { GameController } from './GameController'
import type { AutoPlayer }     from './AutoPlayer'
import type { TeamSide }       from './types'
import { EventType }           from './types'

// ── Configuration ─────────────────────────────────────────────────────────────

export interface BattleDriverDelays {
  /** ms pause before skipping a movement phase. Default: 400 */
  movementSkipMs: number
  /** ms pause before calling beginActionPhase(). Default: 300 */
  actionBeginMs:  number
  /** ms pause before triggering AutoPlayer when a bot turn starts. Default: 700 */
  turnPlayMs:     number
  /** ms pause before advancing phase after ACTIONS_RESOLVED. Default: 500 */
  phaseAdvanceMs: number
  /**
   * Which side is controlled by a human player.
   * When set, AutoPlayer is skipped for that side and the scene must call
   * ctrl.commitTurn() once the player finishes their selections.
   * Undefined (default) = full auto on both sides.
   */
  playerSide?: TeamSide
  /** Specific character IDs the player controls (for duo/squad). If set, only these are player-controlled. */
  playerCharIds?: ReadonlySet<string>
}

const DEFAULT_DELAYS: BattleDriverDelays = {
  movementSkipMs: 400,
  actionBeginMs:  300,
  turnPlayMs:     700,
  phaseAdvanceMs: 500,
}

// ── BattleDriver ──────────────────────────────────────────────────────────────

export class BattleDriver {
  private readonly _delays: BattleDriverDelays
  /** Active setTimeout handles — cancelled on destroy() to avoid stale callbacks. */
  private readonly _timers: number[] = []
  /** Collected unsubscribe functions — called on destroy(). */
  private _unsub: (() => void) | null = null

  constructor(
    private readonly _ctrl: GameController,
    private readonly _auto: AutoPlayer,
    delays?: Partial<BattleDriverDelays>,
  ) {
    this._delays = { ...DEFAULT_DELAYS, ...delays }
  }

  /**
   * Subscribe to controller events and begin driving the battle.
   * Call once after `controller.startBattle()`.
   */
  start(): void {
    const unsubs: Array<() => void> = []

    // ── Phase lifecycle ───────────────────────────────────���────────────────

    unsubs.push(this._ctrl.onType(EventType.PHASE_STARTED, (e) => {
      if (e.phase === 'movement') {
        // Player's movement phase: the scene handles input and calls advancePhase().
        const isPlayerMovement =
          this._delays.playerSide !== undefined &&
          e.side === this._delays.playerSide
        if (isPlayerMovement) return

        // Bot movement phase: auto-skip after a short pause.
        this._after(this._delays.movementSkipMs, () => {
          if (!this._ctrl.isBattleOver) this._ctrl.advancePhase()
        })
      } else {
        // Action phase: begin the per-actor turn sequence.
        this._after(this._delays.actionBeginMs, () => {
          if (!this._ctrl.isBattleOver) this._ctrl.beginActionPhase()
        })
      }
    }))

    // ── Turn lifecycle ─────────────────────────────────────────────────────

    unsubs.push(this._ctrl.onType(EventType.TURN_STARTED, (_e) => {
      const actor = this._ctrl.currentActor
      if (!actor) return

      // Check if this specific character is player-controlled
      let isPlayerTurn = false
      if (this._delays.playerCharIds) {
        // Specific chars mode (duo/squad): only listed IDs are player-controlled
        isPlayerTurn = this._delays.playerCharIds.has(actor.id)
      } else if (this._delays.playerSide !== undefined) {
        // Side mode (solo): entire side is player-controlled
        isPlayerTurn = actor.side === this._delays.playerSide
      }

      if (isPlayerTurn) {
        // Human turn — scene handles input
        return
      }

      // Bot turn — auto-commit
      this._after(this._delays.turnPlayMs, () => {
        if (!this._ctrl.isBattleOver) this._auto.act()
      })
    }))

    // ── Phase completion ───────────────────────────────────────────────────

    unsubs.push(this._ctrl.onType(EventType.ACTIONS_RESOLVED, (_e) => {
      this._after(this._delays.phaseAdvanceMs, () => {
        if (!this._ctrl.isBattleOver) this._ctrl.advancePhase()
      })
    }))

    this._unsub = () => unsubs.forEach((fn) => fn())
  }

  /**
   * Cancel all pending timers and unsubscribe from controller events.
   * Call from Phaser's `shutdown` / `destroy` scene lifecycle.
   */
  destroy(): void {
    for (const id of this._timers) clearTimeout(id)
    this._timers.length = 0
    this._unsub?.()
    this._unsub = null
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _after(ms: number, fn: () => void): void {
    const id = setTimeout(fn, ms) as unknown as number
    this._timers.push(id)
  }
}
