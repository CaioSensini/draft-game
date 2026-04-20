/**
 * engine/PhaserBridge.ts — typed integration point between the engine and Phaser scenes.
 *
 * PhaserBridge wraps a GameController and provides:
 *   1. Chainable event subscription helpers, grouped by Phaser concern.
 *   2. Subscription lifecycle management — a single `destroy()` clears everything,
 *      designed to be called from Phaser's `shutdown` / `destroy` scene event.
 *
 * ── Why not just use controller.on() directly? ───────────────────────────────
 *   You can, and for simple cases it's fine. PhaserBridge adds:
 *   - No manual unsub array management in the scene class.
 *   - Chainable registration reads more like a Phaser event block.
 *   - Clear intent grouping: animations vs HUD vs audio.
 *   - One `bridge.destroy()` call instead of several per-listener unsub calls.
 *
 * ── Recommended Phaser scene pattern ────────────────────────────────────────
 *
 *   class BattleScene extends Phaser.Scene {
 *     private _bridge!: PhaserBridge
 *
 *     create() {
 *       const ctrl = GameController.create({ ... })
 *
 *       this._bridge = new PhaserBridge(ctrl)
 *
 *         // ── Visual animations ─────────────────────────────────────────────
 *         .onAnimation(EventType.SKILL_USED, (e) => {
 *           // e.category === 'attack' → play projectile from e.unitId → e.targetId
 *           // e.areaCenter            → play blast overlay at e.areaCenter
 *         })
 *         .onAnimation(EventType.CHARACTER_DIED, (e) => {
 *           // Play death animation for e.unitId
 *         })
 *         .onAnimation(EventType.AREA_RESOLVED, (e) => {
 *           // Shake tiles at e.centerCol, e.centerRow
 *         })
 *
 *         // ── HUD updates ───────────────────────────────────────────────────
 *         .onHUD(EventType.DAMAGE_APPLIED, (e) => {
 *           // Update HP bar for e.unitId to e.newHp
 *         })
 *         .onHUD(EventType.HEAL_APPLIED, (e) => {
 *           // Update HP bar for e.unitId to e.newHp
 *         })
 *         .onHUD(EventType.TURN_STARTED, (e) => {
 *           // Highlight the active character indicator for e.unitId
 *         })
 *         .onHUD(EventType.ROUND_STARTED, (e) => {
 *           // Update round counter display to e.round
 *         })
 *         .onHUD(EventType.PHASE_STARTED, (e) => {
 *           // Show phase banner (e.phase, e.side) and start timer (e.duration)
 *         })
 *         .onHUD(EventType.BATTLE_ENDED, (e) => {
 *           // Show victory screen (e.winner, e.reason)
 *         })
 *
 *         // ── Audio cues ────────────────────────────────────────────────────
 *         .onAudio(EventType.DAMAGE_APPLIED, (_e) => this.sound.play('sfx_hit'))
 *         .onAudio(EventType.CHARACTER_DIED,    (_e) => this.sound.play('sfx_death'))
 *         .onAudio(EventType.SKILL_USED,   (e)  => {
 *           if (e.category === 'attack') this.sound.play('sfx_attack')
 *           else                         this.sound.play('sfx_buff')
 *         })
 *
 *         // ── Player action state ───────────────────────────────────────────
 *         .on(EventType.CHARACTER_FOCUSED, (e) => {
 *           // Highlight the selected character (e.unitId)
 *         })
 *         .on(EventType.AWAITING_TARGET, (e) => {
 *           // Enter target-selection mode
 *           // e.targetMode === 'unit' → show valid unit targets
 *           // e.targetMode === 'tile' → show valid tile targets
 *         })
 *         .on(EventType.SELECTION_READY, (e) => {
 *           // Show "ready" indicator for e.unitId
 *         })
 *
 *       ctrl.startBattle()
 *     }
 *
 *     // Phaser calls this on scene shutdown/restart
 *     shutdown() { this._bridge.destroy() }
 *   }
 *
 * ── Event timing reference (in order of emission per turn) ──────────────────
 *
 * EventType.TURN_STARTED     → whose turn begins, time budget
 * EventType.CHARACTER_FOCUSED → (controller) player focused a character
 * EventType.CARD_SELECTED     → player selected a card (UI feedback)
 * EventType.AWAITING_TARGET   → (controller) waiting for player to pick target
 * EventType.SELECTION_READY   → (controller) both cards selected, ready to commit
 * EventType.TURN_COMMITTED    → the turn executes:
 *   EventType.SKILL_USED      →   defense skill fires (with targetId = self)
 *   EventType.SHIELD_APPLIED  →   shield buff applied
 *   EventType.SKILL_USED      →   attack skill fires (with targetId or areaCenter)
 *   EventType.DAMAGE_APPLIED  →   HP loss on target
 *   EventType.STATUS_APPLIED  →   bleed/stun/etc. applied
 *   EventType.CHARACTER_DIED  →   target killed (may end battle)
 *   EventType.PASSIVE_TRIGGERED →   passive ability activated
 *   EventType.CARD_ROTATED    →   cards rotate to next in queue
 * EventType.TURN_SKIPPED      → (if dead/stunned/no selection)
 * EventType.ACTIONS_RESOLVED  → all actors done this phase
 * EventType.PHASE_ENDED       → phase closes
 * EventType.PHASE_STARTED     → next phase opens
 * EventType.ROUND_STARTED     → (at round boundary) new round
 * EventType.BLEED_TICK        → (end of round) DoT damage
 * EventType.REGEN_TICK        → (end of round) HoT healing
 */

import type { GameController }      from './GameController'
import type { EngineEvent }         from './types'

// ── PhaserBridge ──────────────────────────────────────────────────────────────

export class PhaserBridge {
  private readonly _ctrl:   GameController
  private readonly _unsubs: Array<() => void> = []

  constructor(controller: GameController) {
    this._ctrl = controller
  }

  // ── Generic subscription ─────────────────────────────────────────────────

  /**
   * Subscribe to any EngineEvent by type.
   * Returns `this` for chaining.
   */
  on<T extends EngineEvent['type']>(
    type: T,
    handler: (event: Extract<EngineEvent, { type: T }>) => void,
  ): this {
    this._unsubs.push(this._ctrl.onType(type, handler))
    return this
  }

  // ── Semantic subscription groups ─────────────────────────────────────────

  /**
   * Subscribe to events that drive visual animations.
   * Alias for `on()` — the grouping is a readability convention.
   *
   * Common animation events:
   *   skill_used, damage_taken, unit_died, area_resolved,
   *   unit_moved, unit_pushed, evade_triggered, reflect_triggered,
   *   bleed_tick, regen_tick, passive_triggered
   */
  onAnimation<T extends EngineEvent['type']>(
    type: T,
    handler: (event: Extract<EngineEvent, { type: T }>) => void,
  ): this {
    return this.on(type, handler)
  }

  /**
   * Subscribe to events that update the HUD (HP bars, phase banners, timers).
   *
   * Common HUD events:
   *   damage_taken, heal_applied, shield_applied, shield_absorbed,
   *   turn_started, turn_committed, turn_skipped,
   *   round_started, phase_started, phase_ended,
   *   status_applied, stat_modifier_expired,
   *   battle_started, battle_ended, combat_rule_active
   */
  onHUD<T extends EngineEvent['type']>(
    type: T,
    handler: (event: Extract<EngineEvent, { type: T }>) => void,
  ): this {
    return this.on(type, handler)
  }

  /**
   * Subscribe to events that trigger audio cues.
   *
   * Common audio events:
   *   skill_used, damage_taken, unit_died,
   *   heal_applied, shield_absorbed, evade_triggered,
   *   bleed_tick, battle_ended
   */
  onAudio<T extends EngineEvent['type']>(
    type: T,
    handler: (event: Extract<EngineEvent, { type: T }>) => void,
  ): this {
    return this.on(type, handler)
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Unsubscribe all listeners registered through this bridge.
   * Call from Phaser's `shutdown` or `destroy` scene event.
   */
  destroy(): void {
    for (const unsub of this._unsubs) unsub()
    this._unsubs.length = 0
  }

  // ── Read-through queries ──────────────────────────────────────────────────

  /**
   * Convenience accessor — avoids importing GameController separately in the scene.
   */
  get controller(): GameController {
    return this._ctrl
  }
}
