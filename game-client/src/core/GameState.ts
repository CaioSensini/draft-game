/**
 * GameState — central state machine for the game lifecycle.
 *
 * States:
 *   MENU    — player is on a menu or pre-game screen (MenuScene, DeckBuildScene)
 *   PLAYING — active combat; the simulation is running
 *   PAUSED  — combat is suspended; input is blocked, timer is frozen
 *
 * Usage:
 *   GameStateManager.set(GameState.PLAYING)
 *   if (GameStateManager.is(GameState.PAUSED)) { ... }
 */

export const enum GameState {
  MENU    = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED  = 'PAUSED',
}

type StateListener = (prev: GameState, next: GameState) => void

class GameStateManagerClass {
  private _current: GameState = GameState.MENU
  private _listeners: StateListener[] = []

  /** The currently active state. */
  get current(): GameState {
    return this._current
  }

  /** Transition to a new state. No-op if already in that state. */
  set(next: GameState): void {
    if (this._current === next) return
    const prev = this._current
    this._current = next
    for (const fn of this._listeners) fn(prev, next)
  }

  /** Returns true when the given state is active. */
  is(state: GameState): boolean {
    return this._current === state
  }

  /** Returns true only when the simulation is actively running. */
  isPlaying(): boolean {
    return this._current === GameState.PLAYING
  }

  /**
   * Subscribe to state transitions.
   * Returns an unsubscribe function.
   */
  onChange(listener: StateListener): () => void {
    this._listeners.push(listener)
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener)
    }
  }
}

/** Singleton — one shared state for the entire game session. */
export const GameStateManager = new GameStateManagerClass()
