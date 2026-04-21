/**
 * UIComponents.ts — AAA-quality reusable UI component library.
 *
 * Every visual element uses multi-layer rendering:
 *   Layer 1: Drop shadow (offset, blurred edges)
 *   Layer 2: Main fill (dark, rich)
 *   Layer 3: Inner gradient (lighter top, darker bottom)
 *   Layer 4: Border (gold/accent trim)
 *   Layer 5: Gloss highlight (top edge shine)
 *   Layer 6: Content (text, icons)
 *
 * Usage:
 *   import { UI } from '../utils/UIComponents'
 *   const panel = UI.panel(this, 640, 360, 400, 300)
 *   const { container } = UI.button(this, 640, 500, 200, 46, 'JOGAR')
 */

import Phaser from 'phaser'
import { C, F, S, SHADOW, SCREEN, STROKE } from './DesignTokens'
import { getSkillIconKey, hasSkillIcon } from './AssetPaths'

// ── Touch-first constants (Sprint 0.7) ──────────────────────────────────────
//
// iOS Human Interface Guidelines: tappable targets must be at least 44×44 pt.
// Material Design Android: 48×48 dp.
// We use 44 as the baseline; components can opt into 48 via `minTouchSize: 48`.
export const MIN_TOUCH_TARGET = 44 as const

/**
 * Given a visual width+height, returns the interaction area size that will be
 * used by setInteractive(). If the visual size is below MIN_TOUCH_TARGET on
 * either axis, the hit area expands invisibly so touch users have a comfortable
 * tap area without affecting the visual layout.
 *
 * Returns `{ hitW, hitH }` — pass these to the hit-area rectangle/circle.
 */
export function touchHitSize(
  visualW: number,
  visualH: number,
  minSize: number = MIN_TOUCH_TARGET,
): { hitW: number; hitH: number } {
  return {
    hitW: Math.max(visualW, minSize),
    hitH: Math.max(visualH, minSize),
  }
}

// ── Helper: draw rounded rect with multi-layer depth ─────────────────────────

function drawRichRect(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number, r: number,
  fill: number, borderColor: number, borderAlpha: number,
  hasShadow: boolean = true, hasGloss: boolean = true,
) {
  // Shadow layer (soft, offset)
  if (hasShadow) {
    g.fillStyle(0x000000, 0.35)
    g.fillRoundedRect(x + 3, y + 4, w, h, r)
    g.fillStyle(0x000000, 0.15)
    g.fillRoundedRect(x + 1, y + 2, w, h, r)
  }

  // Main fill
  g.fillStyle(fill, 1)
  g.fillRoundedRect(x, y, w, h, r)

  // Inner top gradient (lighter, simulates light from above)
  if (hasGloss) {
    g.fillStyle(0xffffff, 0.05)
    g.fillRoundedRect(x + 2, y + 2, w - 4, Math.min(h * 0.4, 30), { tl: r - 1, tr: r - 1, bl: 0, br: 0 })
  }

  // Inner bottom darkening (simulates depth)
  g.fillStyle(0x000000, 0.08)
  g.fillRoundedRect(x + 2, y + h * 0.6, w - 4, h * 0.4 - 2, { tl: 0, tr: 0, bl: r - 1, br: r - 1 })

  // Border (crisp accent line)
  g.lineStyle(1.5, borderColor, borderAlpha)
  g.strokeRoundedRect(x, y, w, h, r)

  // Inner top edge highlight (1px white line for that premium polish)
  if (hasGloss) {
    g.lineStyle(1, 0xffffff, 0.06)
    const innerR = Math.max(1, r - 2)
    g.beginPath()
    g.arc(x + innerR + 2, y + innerR + 2, innerR, Math.PI, Math.PI * 1.5)
    g.lineTo(x + w - innerR - 2, y + 2)
    g.arc(x + w - innerR - 2, y + innerR + 2, innerR, Math.PI * 1.5, 0)
    g.strokePath()
  }
}

export const UI = {

  // ═══════════════════════════════════════════════════════════════════════════
  // PANELS — Multi-layered depth with premium feel
  // ═══════════════════════════════════════════════════════════════════════════

  panel(
    scene: Phaser.Scene, x: number, y: number, w: number, h: number,
    opts?: { fill?: number; border?: number; borderAlpha?: number; radius?: number; depth?: number; noShadow?: boolean },
  ): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics().setDepth(opts?.depth ?? 0)
    drawRichRect(
      g, x - w / 2, y - h / 2, w, h,
      opts?.radius ?? S.borderRadius,
      opts?.fill ?? C.panelBg,
      opts?.border ?? C.panelBorder,
      opts?.borderAlpha ?? 0.6,
      !(opts?.noShadow),
    )
    return g
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BUTTONS — 3D with shadow, gloss, accent bar, hover/press micro-anims
  // ═══════════════════════════════════════════════════════════════════════════

  button(
    scene: Phaser.Scene, x: number, y: number, w: number, h: number,
    text: string,
    opts?: {
      accent?: number; accentHex?: string; fill?: number;
      fontSize?: string; depth?: number; icon?: string;
      onPress?: () => void;
      /**
       * Touch-first hooks (Sprint 0.7). All optional. `onPress` remains the
       * primary action callback and fires on pointerdown + delay. The hooks
       * below give scenes finer-grained control for touch-specific UX:
       *   onTouchStart — fires on pointerdown (raw, no delay)
       *   onTouchEnd   — fires on pointerup
       *   onHover      — fires on pointerover (mouse or finger drag-in)
       *   onHoverEnd   — fires on pointerout
       */
      onTouchStart?: () => void;
      onTouchEnd?:   () => void;
      onHover?:      () => void;
      onHoverEnd?:   () => void;
      /**
       * Minimum hit-area size (both axes). Defaults to 44×44 (iOS HIG).
       * The visual button stays the original w×h; only the interactive
       * rectangle grows to the minimum.
       */
      minTouchSize?: number;
    },
  ): { container: Phaser.GameObjects.Container; hitArea: Phaser.GameObjects.Rectangle } {
    const accent = opts?.accent ?? C.success
    const accentHex = opts?.accentHex ?? '#4ade80'
    const baseFill = opts?.fill ?? 0x141a24
    const fontSize = opts?.fontSize ?? '15px'
    const d = opts?.depth ?? 0

    const g = scene.add.graphics()

    const render = (hovered: boolean, pressed: boolean) => {
      g.clear()
      const fill = pressed ? 0x0a0e14 : hovered ? 0x1c2434 : baseFill
      const bAlpha = pressed ? 0.9 : hovered ? 0.85 : 0.55

      drawRichRect(
        g, -w / 2, -h / 2 + (pressed ? 1 : 0), w, h,
        S.borderRadiusSmall, fill, accent, bAlpha,
        !pressed, true,
      )

      // Left accent bar (signature element)
      g.fillStyle(accent, hovered ? 1 : 0.7)
      g.fillRoundedRect(-w / 2 + 3, -h / 2 + 5, 4, h - 10, 2)
    }

    render(false, false)

    // Icon + text
    const displayText = opts?.icon ? `${opts.icon}  ${text}` : text
    const label = scene.add.text(4, 0, displayText, {
      fontFamily: F.body, fontSize, color: accentHex, fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    // Touch-first: hit area is at least 44×44 so finger taps have comfortable
    // tolerance even when the visual button is smaller (e.g. icon buttons).
    const { hitW, hitH } = touchHitSize(w, h, opts?.minTouchSize)
    const hitArea = scene.add.rectangle(0, 0, hitW, hitH, C.black, 0.001)
      .setInteractive({ useHandCursor: true })

    hitArea.on('pointerover', () => {
      render(true, false)
      scene.tweens.add({ targets: container, scaleX: 1.02, scaleY: 1.02, duration: 100 })
      opts?.onHover?.()
    })
    hitArea.on('pointerout', () => {
      render(false, false)
      scene.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 100 })
      opts?.onHoverEnd?.()
    })
    hitArea.on('pointerdown', () => {
      render(true, true)
      scene.tweens.add({ targets: container, scaleX: 0.97, scaleY: 0.97, duration: 60 })
      opts?.onTouchStart?.()
      if (opts?.onPress) scene.time.delayedCall(80, () => opts.onPress!())
    })
    hitArea.on('pointerup', () => {
      render(true, false)
      scene.tweens.add({ targets: container, scaleX: 1.02, scaleY: 1.02, duration: 60 })
      opts?.onTouchEnd?.()
    })

    const container = scene.add.container(x, y, [g, label, hitArea]).setDepth(d)
    return { container, hitArea }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRESS BARS — Track + fill + gloss + rounded ends
  // ═══════════════════════════════════════════════════════════════════════════

  progressBar(
    scene: Phaser.Scene, x: number, y: number, w: number, h: number,
    ratio: number, color: number = C.gold,
  ): { track: Phaser.GameObjects.Graphics; fill: Phaser.GameObjects.Rectangle; gloss: Phaser.GameObjects.Rectangle } {
    const gr = scene.add.graphics()
    // Track background
    gr.fillStyle(0x0a0e18, 1)
    gr.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2)
    gr.lineStyle(1, 0x2a2a3e, 0.5)
    gr.strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2)

    const fillW = Math.max(h, w * Math.min(ratio, 1))
    const fill = scene.add.rectangle(x - w / 2 + fillW / 2, y, fillW, h - 2, color, 0.85)
    fill.setMask(fill.createGeometryMask(
      scene.add.graphics().fillRoundedRect(x - w / 2 + 1, y - h / 2 + 1, w - 2, h - 2, (h - 2) / 2).setVisible(false) as unknown as Phaser.GameObjects.Graphics
    ))

    const gloss = scene.add.rectangle(x - w / 2 + fillW / 2, y - h * 0.15, fillW, h * 0.3, 0xffffff, 0.15)

    // typed return uses Graphics for track since we custom drew it
    return { track: gr, fill, gloss }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BADGES — Pill-shaped with inner glow
  // ═══════════════════════════════════════════════════════════════════════════

  badge(
    scene: Phaser.Scene, x: number, y: number, text: string,
    color: number = C.gold, textColor: string = '#ffffff',
  ): Phaser.GameObjects.Container {
    const txt = scene.add.text(0, 0, text, {
      fontFamily: F.body, fontSize: '11px', color: textColor, fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    const pw = Math.max(txt.width + 18, 36)
    const ph = 22

    const g = scene.add.graphics()
    // Outer glow
    g.fillStyle(color, 0.08)
    g.fillRoundedRect(-pw / 2 - 2, -ph / 2 - 2, pw + 4, ph + 4, (ph + 4) / 2)
    // Main badge
    g.fillStyle(color, 0.18)
    g.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, ph / 2)
    g.lineStyle(1, color, 0.5)
    g.strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, ph / 2)
    // Inner gloss
    g.fillStyle(0xffffff, 0.08)
    g.fillRoundedRect(-pw / 2 + 2, -ph / 2 + 2, pw - 4, ph * 0.4, { tl: ph / 2 - 2, tr: ph / 2 - 2, bl: 0, br: 0 })

    return scene.add.container(x, y, [g, txt])
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXT — Consistent typography with proper shadows
  // ═══════════════════════════════════════════════════════════════════════════

  goldText(
    scene: Phaser.Scene, x: number, y: number, text: string,
    size: string = S.titleLarge,
  ): Phaser.GameObjects.Text {
    return scene.add.text(x, y, text, {
      fontFamily: F.title, fontSize: size, color: C.goldHex, fontStyle: 'bold',
      shadow: SHADOW.goldGlow,
      stroke: STROKE.color, strokeThickness: STROKE.thin,
    }).setOrigin(0.5)
  },

  bodyText(
    scene: Phaser.Scene, x: number, y: number, text: string,
    size: string = S.body,
  ): Phaser.GameObjects.Text {
    return scene.add.text(x, y, text, {
      fontFamily: F.body, fontSize: size, color: C.bodyHex,
      shadow: SHADOW.text,
      stroke: STROKE.color, strokeThickness: STROKE.thin,
    }).setOrigin(0.5)
  },

  mutedText(
    scene: Phaser.Scene, x: number, y: number, text: string,
    size: string = S.bodySmall,
  ): Phaser.GameObjects.Text {
    return scene.add.text(x, y, text, {
      fontFamily: F.body, fontSize: size, color: C.mutedHex,
      shadow: SHADOW.text,
      stroke: STROKE.color, strokeThickness: STROKE.thin,
    }).setOrigin(0.5)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION TITLE — Decorative lines + diamond ornaments
  // ═══════════════════════════════════════════════════════════════════════════

  sectionTitle(
    scene: Phaser.Scene, x: number, y: number, text: string,
    lineW: number = 80,
  ): Phaser.GameObjects.Text {
    const g = scene.add.graphics()

    // Left gradient line
    for (let i = 0; i < lineW; i++) {
      const a = 0.3 * (i / lineW)
      g.fillStyle(C.goldDim, a)
      g.fillRect(x - 100 - lineW + i, y, 1, 1)
    }
    // Right gradient line (mirror)
    for (let i = 0; i < lineW; i++) {
      const a = 0.3 * (1 - i / lineW)
      g.fillStyle(C.goldDim, a)
      g.fillRect(x + 100 + i, y, 1, 1)
    }

    // Diamond ornaments
    const drawDiamond = (dx: number) => {
      g.fillStyle(C.goldDim, 0.5)
      g.fillPoints([
        new Phaser.Geom.Point(dx, y - 4),
        new Phaser.Geom.Point(dx + 4, y),
        new Phaser.Geom.Point(dx, y + 4),
        new Phaser.Geom.Point(dx - 4, y),
      ], true)
    }
    drawDiamond(x - 96)
    drawDiamond(x + 96)

    return scene.add.text(x, y, text, {
      fontFamily: F.title, fontSize: S.titleSmall, color: C.goldDimHex, fontStyle: 'bold',
      shadow: SHADOW.text,
      stroke: STROKE.color, strokeThickness: STROKE.thin,
    }).setOrigin(0.5)
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKGROUND — 4-layer depth system
  // ═══════════════════════════════════════════════════════════════════════════

  background(scene: Phaser.Scene): void {
    const { W, H } = SCREEN

    // Layer 1: Solid dark base
    scene.add.rectangle(W / 2, H / 2, W, H, C.bg)

    // Layer 2: Subtle diagonal gold pattern (luxurious texture)
    const diag = scene.add.graphics()
    diag.lineStyle(1, C.goldDim, 0.012)
    for (let i = -H; i < W + H; i += 36) {
      diag.lineBetween(i, 0, i + H, H)
    }

    // Layer 3: Radial vignette (darker edges create focus)
    const vig = scene.add.graphics()
    vig.fillStyle(C.black, 0.35)
    vig.fillRect(0, 0, W * 0.1, H)
    vig.fillRect(W * 0.9, 0, W * 0.1, H)
    vig.fillStyle(C.black, 0.25)
    vig.fillRect(0, 0, W, H * 0.08)
    vig.fillRect(0, H * 0.92, W, H * 0.08)
    // Corner darkening (extra depth)
    vig.fillStyle(C.black, 0.15)
    vig.fillRect(0, 0, W * 0.15, H * 0.15)
    vig.fillRect(W * 0.85, 0, W * 0.15, H * 0.15)
    vig.fillRect(0, H * 0.85, W * 0.15, H * 0.15)
    vig.fillRect(W * 0.85, H * 0.85, W * 0.15, H * 0.15)

    // Layer 4: Ambient horizontal light streaks (very subtle)
    const streaks = scene.add.graphics()
    streaks.fillStyle(C.goldDim, 0.008)
    streaks.fillRect(0, H * 0.3, W, 2)
    streaks.fillRect(0, H * 0.7, W, 1)
  },

  /** Floating gold particles with randomized behavior */
  particles(scene: Phaser.Scene, count: number = 18): void {
    const { W, H } = SCREEN
    for (let i = 0; i < count; i++) {
      const px = Math.random() * W, py = Math.random() * H
      const size = 0.6 + Math.random() * 1.8
      const baseAlpha = 0.04 + Math.random() * 0.08
      const p = scene.add.circle(px, py, size, C.goldDim, baseAlpha)
      scene.tweens.add({
        targets: p,
        y: py - 35 - Math.random() * 55,
        x: px + (Math.random() - 0.5) * 15,
        alpha: 0,
        duration: 3500 + Math.random() * 4500,
        repeat: -1,
        delay: Math.random() * 3500,
        onRepeat: () => {
          p.setPosition(Math.random() * W, H + 10)
          p.setAlpha(baseAlpha)
        },
      })
    }
  },

  /** Standard fade-in from black */
  fadeIn(scene: Phaser.Scene, duration: number = 400): void {
    const { W, H } = SCREEN
    const ov = scene.add.rectangle(W / 2, H / 2, W, H, C.black, 1).setDepth(999)
    scene.tweens.add({
      targets: ov, alpha: 0, duration, ease: 'Quad.Out',
      onComplete: () => ov.destroy(),
    })
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ICONS — Drawn vector icons (no emojis)
  // ═══════════════════════════════════════════════════════════════════════════

  classIcon(
    scene: Phaser.Scene, x: number, y: number,
    role: 'king' | 'warrior' | 'specialist' | 'executor',
    size: number = 16, color: number = C.gold,
  ): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics()
    g.lineStyle(2, color, 0.9)

    switch (role) {
      case 'king': {
        const w = size, h = size * 0.7
        g.fillStyle(color, 0.8)
        g.beginPath()
        g.moveTo(x - w / 2, y + h / 2)
        g.lineTo(x - w / 2, y - h / 2)
        g.lineTo(x - w / 4, y)
        g.lineTo(x, y - h / 2 - 2)
        g.lineTo(x + w / 4, y)
        g.lineTo(x + w / 2, y - h / 2)
        g.lineTo(x + w / 2, y + h / 2)
        g.closePath()
        g.fillPath()
        g.strokePath()
        // Jewels
        g.fillStyle(0xff4444, 1)
        g.fillCircle(x, y - h / 2 - 2, 2)
        g.fillStyle(0x4488ff, 1)
        g.fillCircle(x - w / 4, y, 1.5)
        g.fillCircle(x + w / 4, y, 1.5)
        break
      }
      case 'warrior': {
        const w = size * 0.8, h = size
        g.fillStyle(color, 0.7)
        g.beginPath()
        g.moveTo(x, y - h / 2)
        g.lineTo(x + w / 2, y - h / 4)
        g.lineTo(x + w / 2, y + h / 6)
        g.lineTo(x, y + h / 2)
        g.lineTo(x - w / 2, y + h / 6)
        g.lineTo(x - w / 2, y - h / 4)
        g.closePath()
        g.fillPath()
        g.strokePath()
        g.lineStyle(1.5, 0xffffff, 0.5)
        g.lineBetween(x, y - 5, x, y + 5)
        g.lineBetween(x - 5, y, x + 5, y)
        break
      }
      case 'specialist': {
        g.fillStyle(color, 0.6)
        g.fillCircle(x, y, size * 0.4)
        g.lineStyle(1.5, color, 0.9)
        g.strokeCircle(x, y, size * 0.4)
        g.fillStyle(0xffffff, 0.3)
        g.fillCircle(x - 2, y - 2, size * 0.15)
        const r = size * 0.6
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI / 2) * i + Math.PI / 4
          g.lineBetween(
            x + Math.cos(a) * size * 0.3, y + Math.sin(a) * size * 0.3,
            x + Math.cos(a) * r, y + Math.sin(a) * r,
          )
        }
        break
      }
      case 'executor': {
        // Single drawn dagger, vertical, blade pointing up
        const bladeH = size * 0.55
        const bladeW = size * 0.16
        const guardW = size * 0.55
        const guardH = size * 0.09
        const gripH  = size * 0.22

        // Blade (silver triangle, role-tinted)
        g.fillStyle(color, 0.85)
        g.beginPath()
        g.moveTo(x, y - bladeH)
        g.lineTo(x + bladeW, y)
        g.lineTo(x - bladeW, y)
        g.closePath()
        g.fillPath()
        g.lineStyle(1.5, color, 1)
        g.strokePath()

        // Cross-guard (horizontal bar)
        g.fillStyle(color, 1)
        g.fillRect(x - guardW / 2, y, guardW, guardH)

        // Grip (vertical rectangle below the guard)
        g.fillStyle(color, 0.55)
        g.fillRect(x - bladeW * 0.7, y + guardH, bladeW * 1.4, gripH)

        // Pommel — red gem accent
        g.fillStyle(0xff3366, 1)
        g.fillCircle(x, y + guardH + gripH + 2, 2.2)
        break
      }
    }
    return g
  },

  /**
   * Premium back arrow button (top-left corner, Brawl Stars style).
   * Returns the container for alpha/visibility control.
   */
  backArrow(
    scene: Phaser.Scene,
    onPress: () => void,
  ): Phaser.GameObjects.Container {
    const x = 32, y = 24
    const size = 36

    const g = scene.add.graphics()
    // Circle background (dark with subtle border)
    g.fillStyle(0x0e1420, 0.9)
    g.fillCircle(0, 0, size / 2)
    g.lineStyle(2, C.goldDim, 0.4)
    g.strokeCircle(0, 0, size / 2)
    // Gloss
    g.fillStyle(0xffffff, 0.04)
    g.fillCircle(0, -3, size / 2 - 4)

    // Arrow pointing LEFT (chevron style)
    const ag = scene.add.graphics()
    ag.lineStyle(3.5, C.goldDim, 0.9)
    ag.beginPath()
    ag.moveTo(5, -8)
    ag.lineTo(-5, 0)
    ag.lineTo(5, 8)
    ag.strokePath()

    const hit = scene.add.circle(0, 0, size / 2, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })

    const container = scene.add.container(x, y, [g, ag, hit]).setDepth(50)

    hit.on('pointerover', () => {
      g.clear()
      g.fillStyle(0x1a2434, 0.95)
      g.fillCircle(0, 0, size / 2)
      g.lineStyle(2, C.gold, 0.7)
      g.strokeCircle(0, 0, size / 2)
      container.setScale(1.08)
    })
    hit.on('pointerout', () => {
      g.clear()
      g.fillStyle(0x0e1420, 0.9)
      g.fillCircle(0, 0, size / 2)
      g.lineStyle(2, C.goldDim, 0.4)
      g.strokeCircle(0, 0, size / 2)
      g.fillStyle(0xffffff, 0.04)
      g.fillCircle(0, -3, size / 2 - 4)
      container.setScale(1)
    })
    hit.on('pointerdown', () => {
      container.setScale(0.92)
      scene.time.delayedCall(80, () => onPress())
    })
    hit.on('pointerup', () => container.setScale(1.08))

    return container
  },

  /**
   * Standardized skill card — Brawl Stars mobile style.
   *
   * Big bold icon + name, high-contrast strokes, colored pill badge for group,
   * thick left accent bar. Designed to be readable on small screens from
   * arm's length. Used everywhere skills are displayed (battle, inventory,
   * pack opening, deck management).
   *
   * If `skill.skillId` is passed AND the PNG icon is loaded, renders the real
   * icon; otherwise falls back to a 2-letter effect abbreviation.
   */
  skillCard(
    scene: Phaser.Scene,
    x: number, y: number,
    skill: {
      name: string; effectType: string; power: number;
      group: string; unitClass: string; level: number;
      progress?: number; // filled dots (new system)
      skillId?: string; description?: string;
    },
    opts?: {
      width?: number; height?: number; depth?: number;
      showTooltip?: boolean;
      equipped?: boolean;
      battleMode?: boolean;  // larger card with description inline
      animateLastDot?: boolean; // animate the last filled dot (progress gain)
      interactive?: boolean;
      onPointerDown?: () => void;
    },
  ): Phaser.GameObjects.Container {
    const isBattle = opts?.battleMode ?? false
    const w = opts?.width ?? (isBattle ? 300 : 210)
    const h = opts?.height ?? (isBattle ? 150 : 105)
    const d = opts?.depth ?? 0

    // ── Lookup tables ──
    const GROUP_COLORS: Record<string, number> = {
      attack1: 0xef4444, attack2: 0xf59e0b,
      defense1: 0x3b82f6, defense2: 0x10b981,
    }
    const GROUP_COLORS_HEX: Record<string, string> = {
      attack1: '#ef4444', attack2: '#f59e0b',
      defense1: '#3b82f6', defense2: '#10b981',
    }
    const CLASS_COLORS_HEX: Record<string, string> = {
      king: '#f0c850', warrior: '#4a90d9', specialist: '#44aacc', executor: '#a366ff',
    }
    const CLASS_FULL_NAMES: Record<string, string> = {
      king: 'Rei', warrior: 'Guerreiro', specialist: 'Especialista', executor: 'Executor',
    }
    const EFFECT_ABBREVS: Record<string, string> = {
      damage: 'DA', heal: 'HE', shield: 'SH', area: 'AR', stun: 'ST',
      bleed: 'BL', burn: 'BU', snare: 'SN', push: 'PU', mark: 'MK',
      regen: 'RG', evade: 'EV', reflect: 'RF', lifesteal: 'LS',
      true_damage: 'TD', cleanse: 'CL', purge: 'PU', poison: 'PO',
      def_up: 'D+', atk_up: 'A+', def_down: 'D-', double_attack: '2A',
      silence_defense: 'SD', advance_allies: 'AV', retreat_allies: 'RT',
      revive: 'RV', mov_down: 'M-', atk_down: 'A-',
    }
    const SHARED_SKILLS: Record<string, string[]> = {
      'Esquiva': ['Especialista', 'Executor', 'Rei'],
      'Bloqueio Total': ['Especialista', 'Executor'],
      'Fortaleza Inabalavel': ['Guerreiro', 'Rei'],
    }

    const classHex = CLASS_COLORS_HEX[skill.unitClass] ?? '#f0c850'
    const borderColor = GROUP_COLORS[skill.group] ?? 0xf0c850
    const borderHex = GROUP_COLORS_HEX[skill.group] ?? classHex
    const className = CLASS_FULL_NAMES[skill.unitClass] ?? skill.unitClass
    const sharedClasses = SHARED_SKILLS[skill.name]
    const displayClass = sharedClasses ? sharedClasses.join('/') : className
    const abbrev = EFFECT_ABBREVS[skill.effectType] ?? '??'
    const progress = skill.progress ?? 0
    const maxLevel = 5

    const hw = w / 2
    const hh = h / 2

    // ── Card background (Brawl Stars style: dark panel, thick accent, rounded) ──
    const CORNER = 10
    const ACCENT_W = 7
    const g = scene.add.graphics()
    // Drop shadow
    g.fillStyle(0x000000, 0.35)
    g.fillRoundedRect(-hw + 2, -hh + 4, w, h, CORNER)
    // Main fill (darker, richer)
    g.fillStyle(0x0c1118, 1)
    g.fillRoundedRect(-hw, -hh, w, h, CORNER)
    // Inner subtle vertical gradient via top highlight
    g.fillStyle(0xffffff, 0.04)
    g.fillRoundedRect(-hw + 2, -hh + 2, w - 4, h * 0.45,
      { tl: CORNER - 2, tr: CORNER - 2, bl: 0, br: 0 })
    // Thick left accent bar (colored by group)
    g.fillStyle(borderColor, 1)
    g.fillRoundedRect(-hw, -hh + 4, ACCENT_W, h - 8,
      { tl: CORNER, bl: CORNER, tr: 0, br: 0 })
    // Outer border — soft tint of group color
    g.lineStyle(2, borderColor, 0.55)
    g.strokeRoundedRect(-hw, -hh, w, h, CORNER)

    // ── Layout constants ──
    // Icon is the visual anchor — big and prominent
    const iconSize = isBattle ? 80 : 72
    const iconX = -hw + ACCENT_W + 8 + iconSize / 2
    const iconCenterY = -6  // slightly above center so name fits above and badge below

    // Text column starts right of the icon
    const textX = iconX + iconSize / 2 + 10
    const textW = hw - textX - 8  // available width for name/class/lv

    // Y position of the class label row, directly below the icon
    const pillY = iconCenterY + iconSize / 2 + 11

    // ── Icon frame (rounded square with dark inner background) ──
    const iconGfx = scene.add.graphics()
    iconGfx.fillStyle(0x06090f, 1)
    iconGfx.fillRoundedRect(iconX - iconSize / 2, iconCenterY - iconSize / 2, iconSize, iconSize, 9)
    iconGfx.lineStyle(2.5, borderColor, 0.85)
    iconGfx.strokeRoundedRect(iconX - iconSize / 2, iconCenterY - iconSize / 2, iconSize, iconSize, 9)
    // Inner highlight top for gloss
    iconGfx.fillStyle(0xffffff, 0.05)
    iconGfx.fillRoundedRect(iconX - iconSize / 2 + 3, iconCenterY - iconSize / 2 + 3,
      iconSize - 6, iconSize / 2 - 3, { tl: 7, tr: 7, bl: 0, br: 0 })

    // Prefer real PNG icon when available; fall back to 2-letter abbreviation.
    // The icon lookup normalizes right-side IDs (rk_/rw_/re_/rs_) to left-side
    // automatically, so both teams share the same textures.
    let iconContent: Phaser.GameObjects.GameObject
    if (skill.skillId && hasSkillIcon(scene, skill.skillId)) {
      const iconImg = scene.add.image(iconX, iconCenterY, getSkillIconKey(skill.skillId))
      // Fit inside the icon square with inner padding (4px each side)
      const pad = 8
      const target = iconSize - pad
      const scale = target / Math.max(iconImg.width, iconImg.height)
      iconImg.setScale(scale)
      iconContent = iconImg
    } else {
      iconContent = scene.add.text(iconX, iconCenterY, abbrev, {
        fontFamily: F.title, fontSize: isBattle ? '26px' : '22px', color: borderHex,
        fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5)
    }
    const abbrevText = iconContent

    // ── Skill name (big, bold, aligned with the top of the icon) ──
    let nameFontSize = isBattle ? 20 : 18
    const nameText = scene.add.text(textX, iconCenterY - iconSize / 2 - 2, skill.name, {
      fontFamily: F.title, fontSize: `${nameFontSize}px`, color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
      shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 4, fill: true },
      wordWrap: { width: textW },
    }).setOrigin(0, 0)
    // Shrink name if it's wider than available space OR wraps past 2 lines.
    // Word-wrap will push very long names onto 3+ lines, which collides with Lv/class
    // rows below — so we progressively shrink until it fits in at most 2 lines.
    const nameLineCount = (): number => {
      const lines = nameText.getWrappedText(nameText.text)
      return Array.isArray(lines) ? Math.max(1, lines.length) : 1
    }
    while (nameFontSize > 11 && (nameText.width > textW || nameLineCount() > 2)) {
      nameFontSize--
      nameText.setFontSize(nameFontSize)
    }

    // ── Level (middle of text area, below name) ──
    const lvY = iconCenterY + 22
    const lvText = scene.add.text(textX, lvY, `Lv.${skill.level}`, {
      fontFamily: F.title, fontSize: '15px', color: C.goldHex,
      fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5)

    // Progress dots (right of Lv text)
    const dotsY = lvY
    const dotStartX = textX + lvText.width + 8

    const progressElements: Phaser.GameObjects.GameObject[] = []

    if (skill.level >= maxLevel) {
      // Max level indicator
      const maxText = scene.add.text(dotStartX, dotsY, 'MAX', {
        fontFamily: F.title, fontSize: '14px', color: C.goldHex,
        fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
        shadow: SHADOW.goldGlow,
      }).setOrigin(0, 0.5)
      progressElements.push(maxText)
    } else {
      // Progress dots: skill.level dots total, skill.progress filled
      const dotsNeeded = skill.level
      const animateLast = opts?.animateLastDot && progress > 0
      const lastFilledIdx = progress - 1

      for (let i = 0; i < dotsNeeded; i++) {
        const filled = i < progress
        const isAnimatedDot = animateLast && i === lastFilledIdx
        const dotX = dotStartX + i * 12

        if (isAnimatedDot) {
          // Start as empty, animate to filled
          const dot = scene.add.circle(dotX, dotsY, 4, 0x2a2a2a, 1)
          dot.setStrokeStyle(1, 0x444444, 0.5)
          progressElements.push(dot)

          // Animate: scale pulse + color change after delay
          scene.time.delayedCall(600, () => {
            // Flash glow behind
            const glow = scene.add.circle(dotX, dotsY, 12, C.gold, 0)
            container.add(glow)
            scene.tweens.add({
              targets: glow,
              alpha: { from: 0, to: 0.5 },
              scaleX: { from: 0.5, to: 1.5 },
              scaleY: { from: 0.5, to: 1.5 },
              duration: 400, yoyo: true,
              onComplete: () => glow.destroy(),
            })
            // Fill the dot
            scene.tweens.add({
              targets: dot,
              scaleX: { from: 1, to: 1.8 },
              scaleY: { from: 1, to: 1.8 },
              duration: 200, yoyo: true, ease: 'Back.Out',
              onStart: () => {
                dot.setFillStyle(C.gold, 1)
                dot.setStrokeStyle(0)
              },
            })
          })
        } else {
          const dot = scene.add.circle(dotX, dotsY, 4,
            filled ? C.gold : 0x2a2a2a, 1)
          if (!filled) dot.setStrokeStyle(1, 0x444444, 0.5)
          progressElements.push(dot)
        }
      }
    }

    // ── Equipped badge removed — no longer shown on cards ──
    const badgeElements: Phaser.GameObjects.GameObject[] = []

    // ── Class label (plain text, colored by unit class) ──
    // Layout differs between modes:
    //  - Battle mode: lives inside the text column between name and Lv, because the
    //    card's inline description occupies the area below the icon and would
    //    otherwise collide.
    //  - Normal mode: sits below the icon, centered in a *safe zone* that stays
    //    inside the left accent bar AND reserves space for an optional UPAR upgrade
    //    button that some consumer scenes overlay in the bottom-right corner.
    //    Long shared-skill labels (e.g. "Especialista/Executor/Rei") start at a
    //    smaller base size and shrink further if still too wide.
    let classText: Phaser.GameObjects.Text
    if (isBattle) {
      classText = scene.add.text(textX, iconCenterY + 4, displayClass, {
        fontFamily: F.body,
        fontSize: displayClass.length > 16 ? '13px' : '15px',
        color: classHex, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5)
    } else {
      // Label is LEFT-ALIGNED and starts just past the accent bar so it never
      // crowds the left edge. It must also stay clear of the bottom-right corner
      // where consumer scenes may overlay an UPAR upgrade button.
      const classSafeLeft  = -hw + ACCENT_W + 6   // just past the accent bar
      const classSafeRight = hw - 82                // reserves ~72px UPAR btn + 10px margin
      const classMaxW      = classSafeRight - classSafeLeft
      // Heuristic starting size based on label length — avoids many shrink iterations.
      let classFontSize =
        displayClass.length > 21 ? 9
        : displayClass.length > 16 ? 11
        : displayClass.length > 11 ? 13
        : 14
      classText = scene.add.text(classSafeLeft, pillY, displayClass, {
        fontFamily: F.title, fontSize: `${classFontSize}px`, color: classHex,
        fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
        shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 3, fill: true },
      }).setOrigin(0, 0.5)
      // Shrink further if the heuristic wasn't tight enough. Floor at 7px — rare
      // 3-class shared skills may land here but stay legible.
      while (classText.width > classMaxW && classFontSize > 7) {
        classFontSize--
        classText.setFontSize(classFontSize)
      }
    }

    // ── Battle mode: inline description ──
    const descElements: Phaser.GameObjects.GameObject[] = []
    if (isBattle && skill.description) {
      const descY2 = lvY + 20
      const descText = scene.add.text(textX, descY2, skill.description, {
        fontFamily: F.body, fontSize: '13px', color: '#c4c0b6',
        fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2,
        wordWrap: { width: textW },
      }).setOrigin(0, 0)
      descElements.push(descText)
    }

    // ── Assemble container ──
    const container = scene.add.container(x, y, [
      g, iconGfx, abbrevText, nameText, classText, lvText,
      ...progressElements, ...badgeElements, ...descElements,
    ]).setDepth(d)

    // ── Interactivity ──
    if (opts?.interactive || opts?.onPointerDown || opts?.showTooltip) {
      const hitArea = scene.add.rectangle(0, 0, w, h, 0, 0.001).setInteractive({ useHandCursor: true })
      container.add(hitArea)

      if (opts?.onPointerDown) {
        hitArea.on('pointerdown', opts.onPointerDown)
      }

      // Tooltip on hover (non-battle mode).
      // Rich layout: icon + name/class/lv header, separator, then wrapped description.
      if (opts?.showTooltip && skill.description && !isBattle) {
        let tooltip: Phaser.GameObjects.Container | null = null
        hitArea.on('pointerover', () => {
          const ttW = 290
          const ttPad = 12
          const ttIconSize = 40

          // ── Icon frame (small version of the card's icon block) ──
          const ttIconX = ttPad
          const ttIconY = ttPad
          const iconFrameG = scene.add.graphics()
          iconFrameG.fillStyle(0x06090f, 1)
          iconFrameG.fillRoundedRect(ttIconX, ttIconY, ttIconSize, ttIconSize, 6)
          iconFrameG.lineStyle(1.5, borderColor, 0.9)
          iconFrameG.strokeRoundedRect(ttIconX, ttIconY, ttIconSize, ttIconSize, 6)
          // Inner highlight for gloss consistency with card icon
          iconFrameG.fillStyle(0xffffff, 0.05)
          iconFrameG.fillRoundedRect(ttIconX + 2, ttIconY + 2,
            ttIconSize - 4, ttIconSize / 2 - 2, { tl: 5, tr: 5, bl: 0, br: 0 })

          // ── Icon content (PNG if available, fallback to effect abbreviation) ──
          let ttIconContent: Phaser.GameObjects.GameObject
          if (skill.skillId && hasSkillIcon(scene, skill.skillId)) {
            const img = scene.add.image(
              ttIconX + ttIconSize / 2, ttIconY + ttIconSize / 2,
              getSkillIconKey(skill.skillId),
            )
            const target = ttIconSize - 6
            const scale = target / Math.max(img.width, img.height)
            img.setScale(scale)
            ttIconContent = img
          } else {
            ttIconContent = scene.add.text(
              ttIconX + ttIconSize / 2, ttIconY + ttIconSize / 2, abbrev, {
                fontFamily: F.title, fontSize: '16px', color: borderHex,
                fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
              }).setOrigin(0.5)
          }

          // ── Skill name (right of icon) ──
          const headerTextX = ttIconX + ttIconSize + 10
          const headerTextW = ttW - headerTextX - ttPad
          let ttNameFontSize = 15
          const ttName = scene.add.text(headerTextX, ttIconY, skill.name, {
            fontFamily: F.title, fontSize: `${ttNameFontSize}px`, color: '#ffffff',
            fontStyle: 'bold', stroke: '#000000', strokeThickness: 2,
            wordWrap: { width: headerTextW },
          })
          while (ttName.width > headerTextW && ttNameFontSize > 11) {
            ttNameFontSize--
            ttName.setFontSize(ttNameFontSize)
          }

          // ── Class + level (below name, in class color) ──
          const ttMeta = scene.add.text(
            headerTextX, ttIconY + 20, `${displayClass}  \u2022  Lv.${skill.level}`, {
              fontFamily: F.body, fontSize: '11px', color: classHex,
              fontStyle: 'bold', stroke: '#000000', strokeThickness: 2,
            })

          // ── Separator line between header and description ──
          const sepY = ttIconY + ttIconSize + 8
          const sepG = scene.add.graphics()
          sepG.lineStyle(1, C.goldDim, 0.4)
          sepG.lineBetween(ttPad, sepY, ttW - ttPad, sepY)

          // ── Description (full width, wrapped) ──
          const descY = sepY + 8
          const ttText = scene.add.text(ttPad, descY, skill.description!, {
            fontFamily: F.body, fontSize: '12px', color: C.bodyHex,
            shadow: SHADOW.text, wordWrap: { width: ttW - 2 * ttPad },
          })

          const ttH = descY + ttText.height + ttPad

          // ── Background panel (rendered first, behind everything else) ──
          const ttG = scene.add.graphics()
          ttG.fillStyle(0x000000, 0.4)
          ttG.fillRoundedRect(2, 3, ttW, ttH, 8)
          ttG.fillStyle(0x080c14, 0.97)
          ttG.fillRoundedRect(0, 0, ttW, ttH, 8)
          ttG.lineStyle(1.5, C.goldDim, 0.5)
          ttG.strokeRoundedRect(0, 0, ttW, ttH, 8)

          const ttX = Math.min(x + hw, 1280 - ttW - 10)
          const ttY = Math.max(10, y - hh - ttH - 5)
          tooltip = scene.add.container(ttX, ttY, [
            ttG, iconFrameG, ttIconContent, ttName, ttMeta, sepG, ttText,
          ]).setDepth(d + 100)
        })
        hitArea.on('pointerout', () => {
          tooltip?.destroy(true)
          tooltip = null
        })
      }
    }

    return container
  },

  /**
   * Animated horizontal shimmer that passes over a text element.
   * Creates a bright highlight that sweeps left-to-right on repeat.
   */
  shimmer(
    scene: Phaser.Scene, x: number, y: number,
    w: number, h: number, interval: number = 4000,
  ): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics()
    const shW = 60

    const draw = (sx: number) => {
      g.clear()
      for (let i = 0; i < shW; i++) {
        const dist = Math.abs(i - shW / 2) / (shW / 2)
        const a = 0.18 * (1 - dist * dist)
        g.fillStyle(0xffffff, a)
        g.fillRect(sx + i, y - h / 2, 1, h)
      }
    }

    const startX = x - w / 2 - shW
    const endX = x + w / 2
    draw(startX)
    g.setAlpha(0)

    scene.tweens.add({
      targets: { val: startX },
      val: endX,
      duration: 800,
      ease: 'Quad.InOut',
      delay: interval,
      repeat: -1,
      repeatDelay: interval,
      onStart: () => g.setAlpha(1),
      onUpdate: (_tw: Phaser.Tweens.Tween, target: { val: number }) => draw(target.val),
      onRepeat: () => g.setAlpha(1),
    })

    return g
  },

  /**
   * Draw decorative L-shaped corner ornaments on a panel.
   * Returns the Graphics object containing all 4 corners.
   */
  cornerOrnaments(
    scene: Phaser.Scene, x: number, y: number,
    w: number, h: number,
    color: number = C.goldDim, alpha: number = 0.3, len: number = 24,
  ): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics()
    g.lineStyle(1.5, color, alpha)
    const hw = w / 2, hh = h / 2

    // Top-left
    g.beginPath()
    g.moveTo(x - hw, y - hh + len)
    g.lineTo(x - hw, y - hh)
    g.lineTo(x - hw + len, y - hh)
    g.strokePath()
    // Top-right
    g.beginPath()
    g.moveTo(x + hw - len, y - hh)
    g.lineTo(x + hw, y - hh)
    g.lineTo(x + hw, y - hh + len)
    g.strokePath()
    // Bottom-left
    g.beginPath()
    g.moveTo(x - hw, y + hh - len)
    g.lineTo(x - hw, y + hh)
    g.lineTo(x - hw + len, y + hh)
    g.strokePath()
    // Bottom-right
    g.beginPath()
    g.moveTo(x + hw - len, y + hh)
    g.lineTo(x + hw, y + hh)
    g.lineTo(x + hw, y + hh - len)
    g.strokePath()

    // Small diamonds at each corner vertex
    const dSize = 3
    const drawDot = (dx: number, dy: number) => {
      g.fillStyle(color, alpha + 0.15)
      g.fillCircle(dx, dy, dSize)
    }
    drawDot(x - hw, y - hh)
    drawDot(x + hw, y - hh)
    drawDot(x - hw, y + hh)
    drawDot(x + hw, y + hh)

    return g
  },

  /**
   * Large skill detail card — shown on hover/select.
   * Clean layout: icon + name top, class/lv top-left, stats (dano/cura/escudo + tipo), description.
   * All text large and readable (mobile-friendly).
   */
  skillDetailCard(
    scene: Phaser.Scene,
    x: number, y: number,
    skill: {
      name: string; effectType: string; power: number;
      group: string; unitClass: string; level: number;
      progress?: number; description?: string;
      targetType?: string; range?: number;
      skillId?: string;
      // TODO(design-system Fase 2) — Bloco 3 Parte 1 schema refactor (2026-04-21):
      // skillCatalog now uses `secondaryEffects: T[]` with 2+ entries on some
      // skills (Impacto, Provocação, Investida). This tooltip only renders the
      // first secondary for now — a deliberate partial to avoid polishing UI
      // that will be redesigned in the design-system integration pass. See
      // docs/DECISIONS.md 2026-04-21 "Bloco 3 Parte 1".
      secondaryEffect?: { effectType: string; power: number; ticks?: number } | null;
    },
  ): Phaser.GameObjects.Container {
    const cardW = 310; const cardH = 380
    const hw = cardW / 2; const hh = cardH / 2

    const GROUP_COLORS: Record<string, number> = { attack1: 0xdd4433, attack2: 0xdd7733, defense1: 0x3366cc, defense2: 0x33aa88 }
    const GROUP_HEX: Record<string, string> = { attack1: '#dd4433', attack2: '#dd7733', defense1: '#3366cc', defense2: '#33aa88' }
    const CLASS_HEX: Record<string, string> = { king: '#f0c850', warrior: '#4a90d9', specialist: '#44aacc', executor: '#7744cc' }
    const CLASS_NAMES: Record<string, string> = { king: 'Rei', warrior: 'Guerreiro', specialist: 'Especialista', executor: 'Executor' }
    const ABBREVS: Record<string, string> = {
      damage: 'DA', heal: 'HE', shield: 'SH', area: 'AR', stun: 'ST', bleed: 'BL', burn: 'BU',
      snare: 'SN', push: 'PU', mark: 'MK', regen: 'RG', evade: 'EV', reflect: 'RF', lifesteal: 'LS',
      true_damage: 'TD', cleanse: 'CL', purge: 'PU', poison: 'PO', def_up: 'D+', atk_up: 'A+',
      def_down: 'D-', double_attack: '2A', silence_defense: 'SD', advance_allies: 'AV',
      retreat_allies: 'RT', revive: 'RV', mov_down: 'M-', atk_down: 'A-',
    }
    const TARGET_LABELS: Record<string, string> = {
      single: 'Alvo Unico', area: 'Area', self: 'Proprio',
      lowest_ally: 'Aliado Fraco', all_allies: 'Todos Aliados',
    }

    // Determine what the skill does: damage, heal, or shield
    const DAMAGE_TYPES = new Set(['damage', 'true_damage', 'area', 'bleed', 'burn', 'poison', 'lifesteal', 'mark'])
    const HEAL_TYPES = new Set(['heal', 'regen', 'revive'])
    const SHIELD_TYPES = new Set(['shield'])

    const bColor = GROUP_COLORS[skill.group] ?? 0xf0c850
    const bHex = GROUP_HEX[skill.group] ?? '#f0c850'
    const cHex = CLASS_HEX[skill.unitClass] ?? '#f0c850'
    const cName = CLASS_NAMES[skill.unitClass] ?? skill.unitClass
    const abbr = ABBREVS[skill.effectType] ?? '??'
    const tgtLabel = TARGET_LABELS[skill.targetType ?? 'single'] ?? ''

    const els: Phaser.GameObjects.GameObject[] = []

    // ── Background ──
    const g = scene.add.graphics()
    g.fillStyle(0x000000, 0.6); g.fillRoundedRect(-hw + 3, -hh + 4, cardW, cardH, 14)
    g.fillStyle(0x0a0e16, 1); g.fillRoundedRect(-hw, -hh, cardW, cardH, 14)
    g.fillStyle(0xffffff, 0.02); g.fillRoundedRect(-hw + 2, -hh + 2, cardW - 4, 18, { tl: 12, tr: 12, bl: 0, br: 0 })
    g.lineStyle(2, bColor, 0.5); g.strokeRoundedRect(-hw, -hh, cardW, cardH, 14)
    // Left accent
    g.fillStyle(bColor, 0.6); g.fillRoundedRect(-hw, -hh + 4, 4, cardH - 8, { tl: 14, bl: 14, tr: 0, br: 0 })
    els.push(g)

    // ── Top-left: Class + Level ──
    els.push(scene.add.text(-hw + 14, -hh + 10, `${cName}  •  Lv.${skill.level}`, {
      fontFamily: F.body, fontSize: '12px', color: cHex, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }))

    // ── Icon (centered, below class) ──
    const iconSz = 72; const iconCy = -hh + 66
    const ig = scene.add.graphics()
    ig.fillStyle(0x06090f, 1); ig.fillRoundedRect(-iconSz / 2, iconCy - iconSz / 2, iconSz, iconSz, 10)
    ig.lineStyle(2.5, bColor, 0.85); ig.strokeRoundedRect(-iconSz / 2, iconCy - iconSz / 2, iconSz, iconSz, 10)
    // Inner highlight top for gloss
    ig.fillStyle(0xffffff, 0.05)
    ig.fillRoundedRect(-iconSz / 2 + 3, iconCy - iconSz / 2 + 3,
      iconSz - 6, iconSz / 2 - 3, { tl: 8, tr: 8, bl: 0, br: 0 })
    els.push(ig)

    // Prefer PNG icon when loaded; fall back to 2-letter abbreviation.
    if (skill.skillId && hasSkillIcon(scene, skill.skillId)) {
      const iconImg = scene.add.image(0, iconCy, getSkillIconKey(skill.skillId))
      const pad = 10
      const target = iconSz - pad
      const scale = target / Math.max(iconImg.width, iconImg.height)
      iconImg.setScale(scale)
      els.push(iconImg)
    } else {
      els.push(scene.add.text(0, iconCy, abbr, {
        fontFamily: F.title, fontSize: '28px', color: bHex, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5))
    }

    // ── Skill name (large, bold, centered) ──
    const nameY2 = iconCy + iconSz / 2 + 14
    let nfs = 22
    const nameTx = scene.add.text(0, nameY2, skill.name, {
      fontFamily: F.title, fontSize: `${nfs}px`, color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5)
    while (nameTx.width > cardW - 28 && nfs > 13) { nfs--; nameTx.setFontSize(nfs) }
    els.push(nameTx)

    // ── Separator ──
    const sep1Y = nameY2 + 18
    const sg = scene.add.graphics()
    for (let i = 0; i < cardW - 30; i++) {
      const t2 = 1 - Math.abs(i - (cardW - 30) / 2) / ((cardW - 30) / 2)
      sg.fillStyle(bColor, 0.25 * t2); sg.fillRect(-hw + 15 + i, sep1Y, 1, 1)
    }
    els.push(sg)

    // ── Stats: show only relevant lines (Dano/Cura/Escudo + Tipo) ──
    let curY = sep1Y + 12
    const lnH = 24

    // Damage/Heal/Shield value (show only if applicable)
    if (DAMAGE_TYPES.has(skill.effectType) && skill.power > 0) {
      els.push(scene.add.text(-hw + 18, curY, 'Dano', { fontFamily: F.body, fontSize: '14px', color: '#cc6666', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }))
      els.push(scene.add.text(hw - 18, curY, `${skill.power}`, { fontFamily: F.title, fontSize: '16px', color: '#ff6666', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }).setOrigin(1, 0))
      curY += lnH
    }
    if (HEAL_TYPES.has(skill.effectType) && skill.power > 0) {
      els.push(scene.add.text(-hw + 18, curY, 'Cura', { fontFamily: F.body, fontSize: '14px', color: '#44cc66', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }))
      els.push(scene.add.text(hw - 18, curY, `${skill.power}`, { fontFamily: F.title, fontSize: '16px', color: '#66ff88', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }).setOrigin(1, 0))
      curY += lnH
    }
    if (SHIELD_TYPES.has(skill.effectType) && skill.power > 0) {
      els.push(scene.add.text(-hw + 18, curY, 'Escudo', { fontFamily: F.body, fontSize: '14px', color: '#4488cc', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }))
      els.push(scene.add.text(hw - 18, curY, `${skill.power}`, { fontFamily: F.title, fontSize: '16px', color: '#66aaff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }).setOrigin(1, 0))
      curY += lnH
    }

    // Secondary effect (if exists)
    if (skill.secondaryEffect && skill.secondaryEffect.power > 0) {
      const secIsDmg = DAMAGE_TYPES.has(skill.secondaryEffect.effectType)
      const secIsHeal = HEAL_TYPES.has(skill.secondaryEffect.effectType)
      const secLabel = secIsDmg ? 'Dano Extra' : secIsHeal ? 'Cura Extra' : 'Efeito'
      const secColor = secIsDmg ? '#cc8844' : secIsHeal ? '#44cc66' : '#ccaa44'
      const ticks = skill.secondaryEffect.ticks ? ` (${skill.secondaryEffect.ticks}t)` : ''
      els.push(scene.add.text(-hw + 18, curY, secLabel, { fontFamily: F.body, fontSize: '13px', color: secColor, fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }))
      els.push(scene.add.text(hw - 18, curY, `${skill.secondaryEffect.power}${ticks}`, { fontFamily: F.title, fontSize: '14px', color: secColor, fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }).setOrigin(1, 0))
      curY += lnH
    }

    // Tipo (target type)
    els.push(scene.add.text(-hw + 18, curY, 'Tipo', { fontFamily: F.body, fontSize: '14px', color: '#aaaaaa', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }))
    els.push(scene.add.text(hw - 18, curY, tgtLabel, { fontFamily: F.title, fontSize: '14px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 }).setOrigin(1, 0))
    curY += lnH + 4

    // ── Separator 2 ──
    const sg2 = scene.add.graphics()
    for (let i = 0; i < cardW - 30; i++) {
      const t3 = 1 - Math.abs(i - (cardW - 30) / 2) / ((cardW - 30) / 2)
      sg2.fillStyle(bColor, 0.15 * t3); sg2.fillRect(-hw + 15 + i, curY, 1, 1)
    }
    els.push(sg2)
    curY += 8

    // ── Description (large, bold, readable — mobile-friendly) ──
    const descMaxH = hh - (curY - (-hh)) - 10
    let dfs = 16
    const descTx = scene.add.text(0, curY, skill.description ?? '', {
      fontFamily: F.body, fontSize: `${dfs}px`, color: '#dddddd',
      wordWrap: { width: cardW - 30 }, align: 'center', lineSpacing: 5,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0)
    while (descTx.height > descMaxH && dfs > 12) { dfs--; descTx.setFontSize(dfs) }
    els.push(descTx)

    return scene.add.container(x, y, els).setDepth(500)
  },

  /** Tier-specific ranked icon — each elo has a unique shape */
  tierIcon(
    scene: Phaser.Scene, x: number, y: number,
    tier: string, size: number = 18,
  ): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics()
    const colors: Record<string, number> = {
      desconhecido: 0x666666, recruta: 0x8b6914, aprendiz: 0xcd7f32,
      soldado: 0xc0c0c0, veterano: 0xf0c850, comandante: 0x4fc3f7, rei: 0xff4444,
    }
    const c = colors[tier] ?? C.gold
    const s = size * 0.55

    switch (tier) {
      case 'rei': {
        // Crown — 3 pointed crown with jewel
        g.fillStyle(c, 0.85)
        g.beginPath()
        g.moveTo(x - s, y + s * 0.5)
        g.lineTo(x - s, y - s * 0.2)
        g.lineTo(x - s * 0.5, y + s * 0.15)
        g.lineTo(x, y - s * 0.7)
        g.lineTo(x + s * 0.5, y + s * 0.15)
        g.lineTo(x + s, y - s * 0.2)
        g.lineTo(x + s, y + s * 0.5)
        g.closePath()
        g.fillPath()
        g.lineStyle(1, c, 1)
        g.strokePath()
        // Jewel on top
        g.fillStyle(0xffffff, 0.4)
        g.fillCircle(x, y - s * 0.5, s * 0.15)
        break
      }
      case 'comandante': {
        // Diamond gem — faceted shape
        g.fillStyle(c, 0.7)
        g.beginPath()
        g.moveTo(x, y - s * 0.8)
        g.lineTo(x + s * 0.6, y - s * 0.2)
        g.lineTo(x + s * 0.4, y + s * 0.6)
        g.lineTo(x - s * 0.4, y + s * 0.6)
        g.lineTo(x - s * 0.6, y - s * 0.2)
        g.closePath()
        g.fillPath()
        g.lineStyle(1, c, 0.9)
        g.strokePath()
        // Facet line
        g.lineStyle(0.7, 0xffffff, 0.2)
        g.lineBetween(x - s * 0.5, y - s * 0.2, x + s * 0.5, y - s * 0.2)
        g.lineBetween(x - s * 0.5, y - s * 0.2, x, y + s * 0.5)
        g.lineBetween(x + s * 0.5, y - s * 0.2, x, y + s * 0.5)
        break
      }
      case 'veterano': {
        // Medal — circle with ribbon
        g.fillStyle(c, 0.75)
        g.fillCircle(x, y, s * 0.5)
        g.lineStyle(1, c, 1)
        g.strokeCircle(x, y, s * 0.5)
        // Inner ring
        g.lineStyle(0.7, 0xffffff, 0.15)
        g.strokeCircle(x, y, s * 0.3)
        // Ribbon tails
        g.lineStyle(1.5, c, 0.6)
        g.lineBetween(x - s * 0.3, y + s * 0.4, x - s * 0.5, y + s * 0.8)
        g.lineBetween(x + s * 0.3, y + s * 0.4, x + s * 0.5, y + s * 0.8)
        break
      }
      case 'soldado': {
        // Shield — small heater shield
        g.fillStyle(c, 0.5)
        g.lineStyle(1, c, 0.9)
        g.beginPath()
        g.moveTo(x - s * 0.6, y - s * 0.6)
        g.lineTo(x + s * 0.6, y - s * 0.6)
        g.lineTo(x + s * 0.5, y + s * 0.2)
        g.lineTo(x, y + s * 0.7)
        g.lineTo(x - s * 0.5, y + s * 0.2)
        g.closePath()
        g.fillPath()
        g.strokePath()
        // Center cross
        g.lineStyle(0.8, 0xffffff, 0.15)
        g.lineBetween(x, y - s * 0.4, x, y + s * 0.4)
        g.lineBetween(x - s * 0.3, y - s * 0.1, x + s * 0.3, y - s * 0.1)
        break
      }
      case 'aprendiz': {
        // Sword — simple upward blade
        g.lineStyle(1.5, c, 0.9)
        g.lineBetween(x, y - s * 0.7, x, y + s * 0.3)
        // Guard
        g.lineBetween(x - s * 0.4, y + s * 0.1, x + s * 0.4, y + s * 0.1)
        // Handle
        g.lineStyle(2, c, 0.6)
        g.lineBetween(x, y + s * 0.3, x, y + s * 0.7)
        // Pommel
        g.fillStyle(c, 0.5)
        g.fillCircle(x, y + s * 0.7, s * 0.12)
        break
      }
      case 'recruta': {
        // Simple chevron (V shape — lowest rank marking)
        g.lineStyle(1.5, c, 0.8)
        g.beginPath()
        g.moveTo(x - s * 0.5, y - s * 0.3)
        g.lineTo(x, y + s * 0.2)
        g.lineTo(x + s * 0.5, y - s * 0.3)
        g.strokePath()
        g.beginPath()
        g.moveTo(x - s * 0.5, y + s * 0.1)
        g.lineTo(x, y + s * 0.6)
        g.lineTo(x + s * 0.5, y + s * 0.1)
        g.strokePath()
        break
      }
      default: {
        // Desconhecido — question mark circle
        g.lineStyle(1, c, 0.5)
        g.strokeCircle(x, y, s * 0.5)
        scene.add.text(x, y, '?', {
          fontFamily: F.title, fontSize: `${Math.round(s)}px`, color: '#666666', fontStyle: 'bold',
        }).setOrigin(0.5)
        break
      }
    }

    return g
  },
}
