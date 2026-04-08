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
 *   class ArenaScene extends Phaser.Scene {
 *     private _bridge!: PhaserBridge
 *
 *     create() {
 *       const ctrl = GameController.create({ ... })
 *
 *       this._bridge = new PhaserBridge(ctrl)
 *
 *         // ── Visual animations ─────────────────────────────────────────────
 *         .onAnimation('skill_used', (e) => {
 *           // e.category === 'attack' → play projectile from e.unitId → e.targetId
 *           // e.areaCenter            → play blast overlay at e.areaCenter
 *         })
 *         .onAnimation('unit_died', (e) => {
 *           // Play death animation for e.unitId
 *         })
 *         .onAnimation('area_resolved', (e) => {
 *           // Shake tiles at e.centerCol, e.centerRow
 *         })
 *
 *         // ── HUD updates ───────────────────────────────────────────────────
 *         .onHUD('damage_taken', (e) => {
 *           // Update HP bar for e.unitId to e.newHp
 *         })
 *         .onHUD('heal_applied', (e) => {
 *           // Update HP bar for e.unitId to e.newHp
 *         })
 *         .onHUD('turn_started', (e) => {
 *           // Highlight the active character indicator for e.unitId
 *         })
 *         .onHUD('round_started', (e) => {
 *           // Update round counter display to e.round
 *         })
 *         .onHUD('phase_started', (e) => {
 *           // Show phase banner (e.phase, e.side) and start timer (e.duration)
 *         })
 *         .onHUD('battle_ended', (e) => {
 *           // Show victory screen (e.winner, e.reason)
 *         })
 *
 *         // ── Audio cues ────────────────────────────────────────────────────
 *         .onAudio('damage_taken', (_e) => this.sound.play('sfx_hit'))
 *         .onAudio('unit_died',    (_e) => this.sound.play('sfx_death'))
 *         .onAudio('skill_used',   (e)  => {
 *           if (e.category === 'attack') this.sound.play('sfx_attack')
 *           else                         this.sound.play('sfx_buff')
 *         })
 *
 *         // ── Player action state ───────────────────────────────────────────
 *         .on('character_focused', (e) => {
 *           // Highlight the selected character (e.unitId)
 *         })
 *         .on('awaiting_target', (e) => {
 *           // Enter target-selection mode
 *           // e.targetMode === 'unit' → show valid unit targets
 *           // e.targetMode === 'tile' → show valid tile targets
 *         })
 *         .on('selection_ready', (e) => {
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
 *   turn_started        → whose turn begins, time budget
 *   character_focused   → (controller) player focused a character
 *   card_selected       → player selected a card (UI feedback)
 *   awaiting_target     → (controller) waiting for player to pick target
 *   selection_ready     → (controller) both cards selected, ready to commit
 *   turn_committed      → the turn executes:
 *     skill_used        →   defense skill fires (with targetId = self)
 *     shield_applied    →   shield buff applied
 *     skill_used        →   attack skill fires (with targetId or areaCenter)
 *     damage_taken      →   HP loss on target
 *     status_applied    →   bleed/stun/etc. applied
 *     unit_died         →   target killed (may end battle)
 *     passive_triggered →   passive ability activated
 *     card_rotated      →   cards rotate to next in queue
 *   turn_skipped        → (if dead/stunned/no selection)
 *   actions_resolved    → all actors done this phase
 *   phase_ended         → phase closes
 *   phase_started       → next phase opens
 *   round_started       → (at round boundary) new round
 *   bleed_tick          → (end of round) DoT damage
 *   regen_tick          → (end of round) HoT healing
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
