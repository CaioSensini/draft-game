/**
 * AudioManager — thin wrapper around the Web Audio API.
 *
 * Usage:
 *   const audio = new AudioManager()
 *   audio.init()           // call once after the first user gesture
 *   audio.playTone(440, 'sine', 0.2)
 *
 * All methods are no-ops when the AudioContext is unavailable (e.g. in
 * environments that block audio, or before init() is called).
 */
export class AudioManager {
  private ctx?: AudioContext

  /** Lazily create the AudioContext (must be called from a user gesture). */
  init(): void {
    if (this.ctx) return
    try {
      this.ctx = new AudioContext()
    } catch {
      /* audio not supported */
    }
  }

  /**
   * Play a single synthesised tone.
   * @param freq    Frequency in Hz
   * @param type    Oscillator waveform
   * @param dur     Duration in seconds
   * @param gain    Peak gain (0–1, default 0.14)
   * @param delay   Start delay in seconds (default 0)
   */
  playTone(freq: number, type: OscillatorType, dur: number, gain = 0.14, delay = 0): void {
    const ctx = this.ctx
    if (!ctx) return
    try {
      const osc = ctx.createOscillator()
      const amp = ctx.createGain()
      osc.connect(amp)
      amp.connect(ctx.destination)
      osc.type = type
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay)
      amp.gain.setValueAtTime(gain, ctx.currentTime + delay)
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + dur)
    } catch {
      /* ignore playback errors */
    }
  }
}
