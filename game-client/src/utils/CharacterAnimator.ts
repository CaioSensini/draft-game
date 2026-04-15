/**
 * utils/CharacterAnimator.ts — AAA-style procedural character animation.
 *
 * Drives every state a battle-arena character can be in — idle, hop, attack,
 * defend, cast, hurt, death, victory — using pure Phaser tweens. No
 * spritesheets required: squash-and-stretch, anticipation, follow-through,
 * shadow scaling, and colour tints combine to give the "AAA" game feel on
 * top of static PNG art.
 *
 * ── Why a separate module ───────────────────────────────────────────────────
 * The BattleScene is already huge and busy with input + event wiring. This
 * class owns the pure visual response to each state, keeping BattleScene
 * focused on game logic and leaving animation tuning in one file.
 *
 * ── Architecture ────────────────────────────────────────────────────────────
 * The animator targets the *sprite subcontainer* (returned by
 * `drawCharacterSprite`) — NOT the outer unit container. That means
 * squash/stretch, local Y bob, rotation, and anticipation offsets all happen
 * in the sprite's own local space while the outer container keeps world
 * position (so HP bars, rings, and status dots stay rock-steady during
 * animation).
 *
 * The outer container is still moved by the caller (BattleScene) for
 * tile-to-tile movement; `playHop()` layers a local Y arc + squash on top,
 * producing a parabolic "hop" trajectory visually.
 *
 * ── Principles applied ──────────────────────────────────────────────────────
 *   - Anticipation: pullback before every action (attack, cast, hop takeoff)
 *   - Squash/stretch: vertical compression + horizontal stretch on impact
 *   - Follow-through: Back.Out easing overshoots then settles
 *   - Shadow as a weight cue: smaller and lighter as the character leaves ground
 *   - Tint flashes: red on hurt, colour on cast, gold on victory
 *   - Rotation shake: rotate + counter-rotate on impact for juice
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   const charGraphics = drawCharacterSprite(scene, role, side, size)
 *   // charGraphics is added to the outer unit container elsewhere
 *   const animator = new CharacterAnimator(scene, charGraphics)
 *   animator.playIdle()          // once — loops forever
 *   animator.playHop()           // on CHARACTER_MOVED (alongside outer tween)
 *   animator.playAttack(+1, onImpact, onDone)
 *   animator.playHurt(true)      // knock right
 *   animator.playDeath()
 */

import Phaser from 'phaser'

export class CharacterAnimator {
  private readonly scene: Phaser.Scene
  /** The sprite subcontainer (returned by drawCharacterSprite). */
  private readonly root: Phaser.GameObjects.Container

  // Refs pulled from root.getData() — any may be null in fallback mode.
  private readonly shadow: Phaser.GameObjects.Graphics | null
  private readonly glow:   Phaser.GameObjects.Graphics | null
  private readonly img:    Phaser.GameObjects.Image    | null

  /** Facing: +1 = faces right (left-side character), -1 = faces left. */
  private readonly facing: number

  // ── Running idle tweens (kept so we can stop cleanly before other anims) ──
  private _idleScaleTween: Phaser.Tweens.Tween | null = null
  private _idleBobTween:   Phaser.Tweens.Tween | null = null
  private _idleGlowTween:  Phaser.Tweens.Tween | null = null

  /** True once `playDeath()` has run — stops re-applying idle after anims. */
  private _dead = false

  constructor(scene: Phaser.Scene, root: Phaser.GameObjects.Container) {
    this.scene = scene
    this.root  = root
    this.shadow = (root.getData('shadow') as Phaser.GameObjects.Graphics | undefined) ?? null
    this.glow   = (root.getData('glow')   as Phaser.GameObjects.Graphics | undefined) ?? null
    this.img    = (root.getData('img')    as Phaser.GameObjects.Image    | undefined) ?? null
    this.facing = (root.getData('facing') as number                      | undefined) ?? 1
  }

  // ══════════════════════════════════════════════════════════════════════
  // IDLE — breathing + subtle float + glow pulse (looped forever)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Start the looping idle animation. Safe to call repeatedly — any running
   * idle tweens are stopped before new ones begin. Randomised delays prevent
   * four characters in a row from breathing in sync.
   */
  playIdle(): void {
    if (this._dead) return
    this.stopIdle()

    // Breathing — vertical stretch with slight horizontal compression
    this._idleScaleTween = this.scene.tweens.add({
      targets: this.root,
      scaleY: 1.04, scaleX: 0.985,
      duration: 1400 + Math.random() * 500,
      yoyo: true, repeat: -1, ease: 'Sine.InOut',
      delay: Math.random() * 600,
    })

    // Subtle float (local Y bob, keeps HP bar steady)
    this._idleBobTween = this.scene.tweens.add({
      targets: this.root,
      y: -3,
      duration: 1800 + Math.random() * 500,
      yoyo: true, repeat: -1, ease: 'Sine.InOut',
      delay: Math.random() * 800,
    })

    // Glow pulse (only when glow exists, PNG path)
    if (this.glow) {
      this._idleGlowTween = this.scene.tweens.add({
        targets: this.glow,
        alpha: { from: 0.75, to: 1 },
        duration: 1600 + Math.random() * 300,
        yoyo: true, repeat: -1, ease: 'Sine.InOut',
        delay: Math.random() * 500,
      })
    }
  }

  /** Stop the idle loop (used internally before one-shot animations). */
  stopIdle(): void {
    this._idleScaleTween?.stop(); this._idleScaleTween = null
    this._idleBobTween?.stop();   this._idleBobTween   = null
    this._idleGlowTween?.stop();  this._idleGlowTween  = null
  }

  // ══════════════════════════════════════════════════════════════════════
  // HOP — squash/stretch + Y arc + shadow scale (during tile movement)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Run a hop animation locally. The caller is responsible for tweening the
   * *outer* container's world (x, y) over the same `duration` — this method
   * adds the arc + squash/stretch on top so the movement reads as a jump.
   *
   * Phases (all percentages of `duration`):
   *   15% — Take-off squash (scaleY↓ scaleX↑)
   *   40% — Rising stretch  (y↓ scaleY↑ scaleX↓)
   *   30% — Falling recovery (y→0 scale→1)
   *   15% — Landing squash (yoyo)
   */
  playHop(duration: number = 320): void {
    if (this._dead) return
    this.stopIdle()

    const takeoffMs = duration * 0.18
    const riseMs    = duration * 0.32
    const fallMs    = duration * 0.30
    const landMs    = duration * 0.20

    this.scene.tweens.killTweensOf(this.root)
    this.root.setScale(1).setY(0).setAngle(0)

    // 1. Take-off squash
    this.scene.tweens.add({
      targets: this.root,
      scaleY: 0.82, scaleX: 1.2,
      duration: takeoffMs, ease: 'Quad.Out',
      onComplete: () => {
        // 2. Rising stretch
        this.scene.tweens.add({
          targets: this.root,
          y: -12,
          scaleY: 1.18, scaleX: 0.88,
          duration: riseMs, ease: 'Quad.Out',
          onComplete: () => {
            // 3. Falling recovery
            this.scene.tweens.add({
              targets: this.root,
              y: 0,
              scaleY: 1, scaleX: 1,
              duration: fallMs, ease: 'Quad.In',
              onComplete: () => {
                // 4. Landing squash (yoyo back to rest)
                this.scene.tweens.add({
                  targets: this.root,
                  scaleY: 0.88, scaleX: 1.12,
                  duration: landMs * 0.5, ease: 'Quad.Out', yoyo: true,
                  onComplete: () => {
                    this.root.setScale(1).setY(0)
                    this.playIdle()
                  },
                })
              },
            })
          },
        })
      },
    })

    // Shadow shrinks and fades as character leaves the ground (sells weight)
    if (this.shadow) {
      const totalAirMs = takeoffMs + riseMs + fallMs
      this.scene.tweens.add({
        targets: this.shadow,
        scaleX: 0.55, scaleY: 0.55, alpha: 0.18,
        duration: totalAirMs * 0.5,
        yoyo: true, ease: 'Sine.InOut',
        onComplete: () => {
          this.shadow?.setScale(1).setAlpha(0.45)
        },
      })
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // ATTACK — anticipation → lunge → impact rotation → recovery
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Play an attack animation lunging toward `dir` (+1 = right, -1 = left).
   *
   * @param dir         direction to lunge (usually sign of target - caster)
   * @param onImpact    called at peak lunge (use for damage visuals / SFX)
   * @param onComplete  called after recovery returns to rest pose
   */
  playAttack(dir: number = +1, onImpact?: () => void, onComplete?: () => void): void {
    if (this._dead) { onImpact?.(); onComplete?.(); return }
    this.stopIdle()

    const sign = dir >= 0 ? 1 : -1
    const pullback = -12 * sign   // anticipation pullback
    const lunge    =  22 * sign   // forward strike

    this.scene.tweens.killTweensOf(this.root)
    this.root.setScale(1).setPosition(0, 0).setAngle(0)

    // 1. Anticipation — pull back + slight crouch
    this.scene.tweens.add({
      targets: this.root,
      x: pullback,
      scaleY: 0.92, scaleX: 1.1,
      duration: 220, ease: 'Back.In',
      onComplete: () => {
        // 2. Lunge forward + stretch + slight tilt
        this.scene.tweens.add({
          targets: this.root,
          x: lunge,
          scaleY: 1.12, scaleX: 0.9,
          angle: sign * 5,
          duration: 85, ease: 'Quad.Out',
          onComplete: () => {
            onImpact?.()
            // 3. Impact rotation shake (counter-rotate)
            this.scene.tweens.add({
              targets: this.root,
              angle: -sign * 3,
              duration: 55, ease: 'Sine.InOut', yoyo: true,
            })
            // 4. Recovery — bounce back to rest with overshoot
            this.scene.tweens.add({
              targets: this.root,
              x: 0, angle: 0,
              scaleX: 1, scaleY: 1,
              duration: 260, ease: 'Back.Out', delay: 80,
              onComplete: () => {
                this.root.setPosition(0, 0).setAngle(0).setScale(1)
                onComplete?.()
                this.playIdle()
              },
            })
          },
        })
      },
    })
  }

  // ══════════════════════════════════════════════════════════════════════
  // CAST — upward float + glow burst + colour tint (ranged/magic skills)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Play a casting animation: the character floats upward with a glow burst
   * and colour tint, then settles. Good for magic / ranged attacks where
   * there's no physical contact to justify a lunge.
   */
  playCast(tint: number = 0xf0c850, onComplete?: () => void): void {
    if (this._dead) { onComplete?.(); return }
    this.stopIdle()

    this.scene.tweens.killTweensOf(this.root)
    this.root.setScale(1).setY(0)

    // Upward float + slight vertical stretch
    this.scene.tweens.add({
      targets: this.root,
      y: -10,
      scaleY: 1.1, scaleX: 0.95,
      duration: 280, yoyo: true, ease: 'Sine.InOut',
      onComplete: () => {
        this.root.setScale(1).setY(0)
        onComplete?.()
        this.playIdle()
      },
    })

    // Glow burst
    if (this.glow) {
      this.scene.tweens.add({
        targets: this.glow,
        alpha: 1, scaleX: 1.5, scaleY: 1.5,
        duration: 320, yoyo: true, ease: 'Quad.Out',
        onComplete: () => this.glow?.setScale(1).setAlpha(1),
      })
    }

    // Tint pulse on the sprite image
    if (this.img) {
      this.img.setTint(tint)
      this.scene.time.delayedCall(520, () => this.img?.clearTint())
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // DEFEND — brace pose + shield glow flash (reactive)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Brace against an attack: slight crouch + glow flash. Use for shield /
   * block skill activations.
   */
  playDefend(color: number = 0x4488ff): void {
    if (this._dead) return
    this.stopIdle()

    this.scene.tweens.killTweensOf(this.root)

    // Brace crouch (low, wide, plant feet)
    this.scene.tweens.add({
      targets: this.root,
      scaleY: 0.9, scaleX: 1.12,
      duration: 170, ease: 'Quad.Out', yoyo: true,
      onComplete: () => {
        this.root.setScale(1)
        this.playIdle()
      },
    })

    // Shield glow flash
    if (this.glow) {
      this.scene.tweens.add({
        targets: this.glow,
        alpha: 1, scaleX: 1.3, scaleY: 1.3,
        duration: 280, ease: 'Quad.Out', yoyo: true,
        onComplete: () => this.glow?.setScale(1).setAlpha(1),
      })
    }

    // Brief blue tint on the sprite
    if (this.img) {
      this.img.setTint(color)
      this.scene.time.delayedCall(300, () => this.img?.clearTint())
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // HURT — knockback + rotation shake + squash + red tint
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Take a hit: knock back, shake, flash red. The knockback direction is
   * inferred from `fromLeft` — true means the source is on the left, so
   * the character is pushed right.
   */
  playHurt(fromLeft: boolean = true): void {
    if (this._dead) return
    // Do NOT stop idle — idle scale tween is overwritten by the flinch
    // anyway, and stopping it here causes a visible jump.

    const kb = fromLeft ? 6 : -6

    this.scene.tweens.killTweensOf(this.root)
    this.root.setX(0).setAngle(0)

    // Knockback bounce
    this.scene.tweens.add({
      targets: this.root,
      x: kb,
      duration: 65, yoyo: true, repeat: 1, ease: 'Quad.Out',
      onComplete: () => this.root.setX(0),
    })

    // Rotation shake
    this.scene.tweens.add({
      targets: this.root,
      angle: fromLeft ? 6 : -6,
      duration: 55, yoyo: true, repeat: 1, ease: 'Sine.InOut',
      onComplete: () => this.root.setAngle(0),
    })

    // Squash on impact
    this.scene.tweens.add({
      targets: this.root,
      scaleY: 0.85, scaleX: 1.15,
      duration: 90, ease: 'Quad.Out', yoyo: true,
      onComplete: () => { this.root.setScale(1); this.playIdle() },
    })

    // Red tint flash
    if (this.img) {
      this.img.setTint(0xff4444)
      this.scene.time.delayedCall(200, () => this.img?.clearTint())
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // DEATH — rotate + fall + fade + shadow dissolve
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Play the death collapse. Once this runs, `_dead = true` prevents any
   * other animation method from re-animating the corpse.
   */
  playDeath(onComplete?: () => void): void {
    if (this._dead) { onComplete?.(); return }
    this._dead = true

    this.stopIdle()
    this.scene.tweens.killTweensOf(this.root)

    // Brief anticipation rise (death "gasp")
    this.scene.tweens.add({
      targets: this.root,
      y: -4, scaleY: 1.05,
      duration: 120, ease: 'Sine.Out',
      onComplete: () => {
        // Collapse: rotate + fall + flatten
        this.scene.tweens.add({
          targets: this.root,
          angle: 90 * (this.facing >= 0 ? 1 : -1),
          y: 12,
          scaleX: 1.1, scaleY: 0.7,
          alpha: 0.3,
          duration: 650, ease: 'Back.In',
          onComplete: () => onComplete?.(),
        })
      },
    })

    // Shadow grows and fades as if body settles and disintegrates
    if (this.shadow) {
      this.scene.tweens.add({
        targets: this.shadow,
        alpha: 0, scaleX: 1.4, scaleY: 1.4,
        duration: 600, ease: 'Quad.Out',
      })
    }

    // Red tint on final collapse
    if (this.img) {
      this.img.setTint(0x993333)
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // VICTORY — infinite upward float + gold tint + glow pulse
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Play victory pose: infinite gentle upward float with golden tint.
   * Used when the battle ends with this character's team winning.
   */
  playVictory(): void {
    if (this._dead) return
    this.stopIdle()
    this.scene.tweens.killTweensOf(this.root)

    // Infinite gentle float
    this.scene.tweens.add({
      targets: this.root,
      y: -6, scaleY: 1.05,
      duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Golden tint
    if (this.img) this.img.setTint(0xffee88)

    // Infinite glow pulse
    if (this.glow) {
      this.scene.tweens.add({
        targets: this.glow,
        alpha: 1, scaleX: 1.35, scaleY: 1.35,
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      })
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // RESET — kill tweens, restore rest pose (used rarely)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Kill all running tweens and restore the rest pose. Does NOT clear the
   * `_dead` flag — once dead, the character stays dead.
   */
  reset(): void {
    this.stopIdle()
    this.scene.tweens.killTweensOf(this.root)
    this.root.setScale(1).setPosition(0, 0).setAngle(0).setAlpha(1)
    if (this.img)    this.img.clearTint()
    if (this.glow)   this.glow.setAlpha(1).setScale(1)
    if (this.shadow) this.shadow.setAlpha(0.45).setScale(1)
  }
}
