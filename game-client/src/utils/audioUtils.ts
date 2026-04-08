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

  /**
   * Play a tone that sweeps from one frequency to another.
   * @param fromFreq  Starting frequency in Hz
   * @param toFreq    Ending frequency in Hz
   * @param type      Oscillator waveform
   * @param dur       Duration in seconds
   * @param gain      Peak gain (0–1)
   * @param delay     Start delay in seconds (default 0)
   */
  private playSweep(fromFreq: number, toFreq: number, type: OscillatorType, dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx
    if (!ctx) return
    try {
      const osc = ctx.createOscillator()
      const amp = ctx.createGain()
      osc.connect(amp)
      amp.connect(ctx.destination)
      osc.type = type
      osc.frequency.setValueAtTime(fromFreq, ctx.currentTime + delay)
      osc.frequency.linearRampToValueAtTime(toFreq, ctx.currentTime + delay + dur)
      amp.gain.setValueAtTime(gain, ctx.currentTime + delay)
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + dur)
    } catch {
      /* ignore playback errors */
    }
  }

  /**
   * Play a burst of white noise (used for fire/squelch sounds).
   * @param dur   Duration in seconds
   * @param gain  Peak gain (0–1)
   * @param delay Start delay in seconds (default 0)
   */
  private playNoise(dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx
    if (!ctx) return
    try {
      const bufferSize = Math.ceil(ctx.sampleRate * dur)
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
      const source = ctx.createBufferSource()
      source.buffer = buffer
      const amp = ctx.createGain()
      source.connect(amp)
      amp.connect(ctx.destination)
      amp.gain.setValueAtTime(gain, ctx.currentTime + delay)
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur)
      source.start(ctx.currentTime + delay)
      source.stop(ctx.currentTime + delay + dur)
    } catch {
      /* ignore playback errors */
    }
  }

  // ── Combat sounds ──────────────────────────────────────────────────────────

  /** Short sharp noise — enemy takes damage. */
  playHit(): void {
    this.playTone(200, 'square', 0.05, 0.3)
  }

  /** Louder, deeper hit — critical strike. */
  playCritical(): void {
    this.playTone(120, 'square', 0.08, 0.4)
    this.playTone(80, 'sawtooth', 0.12, 0.25, 0.03)
  }

  /** Gentle ascending tone — healing. */
  playHeal(): void {
    this.playTone(523, 'sine', 0.15, 0.2)        // C5
    this.playTone(659, 'sine', 0.15, 0.2, 0.15)  // E5
  }

  /** Metallic ping — shield applied. */
  playShield(): void {
    this.playTone(800, 'triangle', 0.1, 0.2)
  }

  /** Quick swoosh — dodge (high freq descending). */
  playEvade(): void {
    this.playSweep(1000, 400, 'sine', 0.1, 0.15)
  }

  /** Reverb ping — damage reflected. */
  playReflect(): void {
    this.playTone(900, 'triangle', 0.08, 0.2)
    this.playTone(1100, 'sine', 0.12, 0.15, 0.06)
  }

  /** Wet squelch — bleed tick. */
  playBleed(): void {
    this.playNoise(0.08, 0.15)
    this.playTone(150, 'sawtooth', 0.06, 0.12)
  }

  /** Crackling fire — burn tick (noise burst). */
  playBurn(): void {
    this.playNoise(0.12, 0.2)
    this.playTone(250, 'sawtooth', 0.06, 0.1, 0.04)
  }

  /** Electric zap — stun applied. */
  playStun(): void {
    this.playTone(300, 'sawtooth', 0.2, 0.25)
  }

  /** Chain rattle — snare applied. */
  playSnare(): void {
    this.playNoise(0.06, 0.12)
    this.playTone(180, 'square', 0.1, 0.15, 0.03)
    this.playTone(220, 'square', 0.08, 0.12, 0.08)
  }

  /** Ominous low tone — mark applied. */
  playMark(): void {
    this.playTone(90, 'sine', 0.3, 0.2)
  }

  /** Ascending triumphant chord — revive. */
  playRevive(): void {
    this.playTone(262, 'sine', 0.2, 0.2)         // C4
    this.playTone(330, 'sine', 0.2, 0.2, 0.1)    // E4
    this.playTone(392, 'sine', 0.3, 0.25, 0.2)   // G4
  }

  /** Low descending tone — character death. */
  playDeath(): void {
    this.playSweep(200, 80, 'sine', 0.5, 0.3)
  }

  /** Whoosh — push/knockback. */
  playPush(): void {
    this.playSweep(600, 200, 'sine', 0.15, 0.2)
  }

  // ── UI sounds ──────────────────────────────────────────────────────────────

  /** Button click. */
  playClick(): void {
    this.playTone(600, 'triangle', 0.03, 0.15)
  }

  /** Card/unit selection. */
  playSelect(): void {
    this.playTone(500, 'triangle', 0.05, 0.15)
    this.playTone(700, 'triangle', 0.04, 0.12, 0.04)
  }

  /** Action confirmed. */
  playConfirm(): void {
    this.playTone(600, 'sine', 0.06, 0.18)
    this.playTone(800, 'sine', 0.08, 0.18, 0.06)
  }

  /** Action cancelled. */
  playCancel(): void {
    this.playTone(400, 'sine', 0.06, 0.15)
    this.playTone(300, 'sine', 0.08, 0.15, 0.06)
  }

  /** New phase starting. */
  playPhaseChange(): void {
    this.playTone(440, 'sine', 0.1, 0.18)
    this.playTone(550, 'sine', 0.1, 0.18, 0.1)
  }

  /** New round starting. */
  playRoundStart(): void {
    this.playTone(330, 'sine', 0.08, 0.15)
    this.playTone(440, 'sine', 0.08, 0.15, 0.08)
    this.playTone(550, 'sine', 0.1, 0.18, 0.16)
  }

  /** Win fanfare — ascending major chord (C4-E4-G4). */
  playVictory(): void {
    this.playTone(262, 'sine', 0.25, 0.25)       // C4
    this.playTone(330, 'sine', 0.25, 0.25, 0.1)  // E4
    this.playTone(392, 'sine', 0.35, 0.3, 0.2)   // G4
  }

  /** Lose — descending sad chord (G3-Eb3-C3). */
  playDefeat(): void {
    this.playTone(196, 'sine', 0.25, 0.25)       // G3
    this.playTone(156, 'sine', 0.25, 0.25, 0.1)  // Eb3
    this.playTone(131, 'sine', 0.35, 0.3, 0.2)   // C3
  }

  /** Tick-tock — timer warning when < 5s. */
  playTimerWarning(): void {
    this.playTone(1000, 'square', 0.05, 0.2)
  }

  /** Coin sound — shop purchase. */
  playPurchase(): void {
    this.playTone(1200, 'triangle', 0.04, 0.15)
    this.playTone(1600, 'triangle', 0.06, 0.18, 0.04)
  }

  /** Sparkle — skill obtained. */
  playSkillDrop(): void {
    this.playTone(800, 'sine', 0.06, 0.12)
    this.playTone(1000, 'sine', 0.06, 0.12, 0.06)
    this.playTone(1200, 'sine', 0.06, 0.12, 0.12)
    this.playTone(1400, 'sine', 0.08, 0.15, 0.18)
  }
}
