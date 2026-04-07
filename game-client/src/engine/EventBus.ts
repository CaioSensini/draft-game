/**
 * engine/EventBus.ts — typed event bus for engine → renderer communication.
 *
 * The engine emits events whenever state changes. Renderers, sound managers,
 * analytics, or tests subscribe to receive a stream of those events.
 *
 * No Phaser, no DOM, no external dependencies.
 */

import type { EngineEvent } from './types'

type Handler = (event: EngineEvent) => void

export class EventBus {
  private readonly _handlers: Handler[] = []

  /**
   * Subscribe to all engine events.
   * Returns an unsubscribe function — call it to stop receiving events.
   */
  on(handler: Handler): () => void {
    this._handlers.push(handler)
    return () => {
      const idx = this._handlers.indexOf(handler)
      if (idx !== -1) this._handlers.splice(idx, 1)
    }
  }

  /**
   * Subscribe to events of a specific type only.
   * Returns an unsubscribe function.
   */
  onType<T extends EngineEvent['type']>(
    type: T,
    handler: (event: Extract<EngineEvent, { type: T }>) => void,
  ): () => void {
    return this.on((event) => {
      if (event.type === type) {
        handler(event as Extract<EngineEvent, { type: T }>)
      }
    })
  }

  /** Dispatch an event to all current subscribers. */
  emit(event: EngineEvent): void {
    for (const handler of this._handlers) handler(event)
  }

  /** Dispatch multiple events in order. */
  emitAll(events: EngineEvent[]): void {
    for (const event of events) this.emit(event)
  }

  /** Remove all subscribers. */
  clear(): void {
    this._handlers.length = 0
  }
}
