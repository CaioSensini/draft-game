/**
 * SoundManager — global singleton wrapping AudioManager.
 *
 * Provides a single import for any scene that needs to trigger sound effects.
 * All play methods are no-ops when sound is disabled or before init().
 *
 * Usage:
 *   import { soundManager } from '../utils/SoundManager'
 *   soundManager.init()        // call once after first user gesture
 *   soundManager.playHit()     // fire-and-forget
 *   soundManager.toggle()      // mute / unmute
 */

import { AudioManager } from './audioUtils'

class SoundManager {
  private audio = new AudioManager()
  private enabled = true
  private initialized = false

  /** Initialise the underlying AudioContext (must be called from a user gesture). */
  init(): void {
    if (this.initialized) return
    this.audio.init()
    this.initialized = true
  }

  /** Toggle mute/unmute. Returns the new enabled state. */
  toggle(): boolean {
    this.enabled = !this.enabled
    return this.enabled
  }

  /** Returns true when sound is currently enabled. */
  isEnabled(): boolean {
    return this.enabled
  }

  // ── Combat sounds ──────────────────────────────────────────────────────────

  playHit(): void       { if (this.enabled) this.audio.playHit() }
  playCritical(): void  { if (this.enabled) this.audio.playCritical() }
  playHeal(): void      { if (this.enabled) this.audio.playHeal() }
  playShield(): void    { if (this.enabled) this.audio.playShield() }
  playEvade(): void     { if (this.enabled) this.audio.playEvade() }
  playReflect(): void   { if (this.enabled) this.audio.playReflect() }
  playBleed(): void     { if (this.enabled) this.audio.playBleed() }
  playPoison(): void    { if (this.enabled) this.audio.playPoison() }
  playBurn(): void      { if (this.enabled) this.audio.playBurn() }
  playStun(): void      { if (this.enabled) this.audio.playStun() }
  playSnare(): void     { if (this.enabled) this.audio.playSnare() }
  playMark(): void      { if (this.enabled) this.audio.playMark() }
  playRevive(): void    { if (this.enabled) this.audio.playRevive() }
  playDeath(): void     { if (this.enabled) this.audio.playDeath() }
  playPush(): void      { if (this.enabled) this.audio.playPush() }

  // ── UI sounds ──────────────────────────────────────────────────────────────

  playClick(): void          { if (this.enabled) this.audio.playClick() }
  playSelect(): void         { if (this.enabled) this.audio.playSelect() }
  playConfirm(): void        { if (this.enabled) this.audio.playConfirm() }
  playCancel(): void         { if (this.enabled) this.audio.playCancel() }
  playPhaseChange(): void    { if (this.enabled) this.audio.playPhaseChange() }
  playRoundStart(): void     { if (this.enabled) this.audio.playRoundStart() }
  playVictory(): void        { if (this.enabled) this.audio.playVictory() }
  playDefeat(): void         { if (this.enabled) this.audio.playDefeat() }
  playTimerWarning(): void   { if (this.enabled) this.audio.playTimerWarning() }
  playPurchase(): void       { if (this.enabled) this.audio.playPurchase() }
  playSkillDrop(): void      { if (this.enabled) this.audio.playSkillDrop() }
}

/** Global singleton — import this from any scene. */
export const soundManager = new SoundManager()
