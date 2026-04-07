import Phaser from 'phaser'
import { GameState, GameStateManager } from './GameState'

/**
 * GameLoop — abstract base scene for all gameplay screens.
 *
 * Enforces the classic game-loop contract:
 *   handleInput() → tick(delta) → render()
 *
 * Phaser's Scene.update() is called once per frame by the engine.
 * This class chains the three lifecycle methods from there, giving every
 * concrete scene a clear, consistent structure.
 *
 * tick() is only called when the GameState is PLAYING — movement phase,
 * action phase, and any per-frame simulation work stop while paused or
 * while the player is in menus. handleInput() and render() always run
 * so that the pause overlay and other UI remain responsive.
 *
 * Usage:
 *   class MyScene extends GameLoop {
 *     protected handleInput() { ... }  // read keyboard / pointer state
 *     protected tick(delta: number) { ... }  // advance state (PLAYING only)
 *     protected render() { ... }  // push state to display objects
 *   }
 */
export abstract class GameLoop extends Phaser.Scene {
  override update(_time: number, delta: number): void {
    if (!this.scene.isActive()) return
    this.handleInput()
    if (GameStateManager.is(GameState.PLAYING)) {
      this.tick(delta)
    }
    this.render()
  }

  /**
   * Read and consume any pending input for this frame.
   * Event-driven listeners (pointerdown, keydown) are wired in create()
   * and do not need to be repeated here. Override this for continuous
   * key-hold detection or gamepad polling.
   */
  protected handleInput(): void {}

  /**
   * Advance game state by `delta` milliseconds.
   * Use this for per-frame timers, tweening state machines, or AI ticks
   * that need sub-second granularity beyond Phaser TimerEvents.
   */
  protected tick(_delta: number): void {}

  /**
   * Refresh all visual output to match the current game state.
   * Called after handleInput and tick, so every render sees the latest
   * state without a one-frame lag.
   */
  protected render(): void {}
}
