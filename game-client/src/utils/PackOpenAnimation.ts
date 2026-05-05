import Phaser from 'phaser'
import {
  SCREEN,
  surface, accent, fg, state,
  fontFamily, typeScale, radii,
} from './DesignTokens'
import { SKILL_CATALOG } from '../data/skillCatalog'
import { UI } from './UIComponents'
import { t } from '../i18n'

const W = SCREEN.W, H = SCREEN.H

// ═══════════════════════════════════════════════════════════════════════════════
// Public interface
// ═══════════════════════════════════════════════════════════════════════════════

export interface DroppedSkill {
  name: string
  unitClass: string
  effectType: string
  power: number
  description: string
  level: number
  progress?: number
  group?: string
  /** When true, the last progress dot animates filling in */
  isProgressGain?: boolean
  /** Optional — when present, used to look up class name and skill group */
  skillId?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Show a pack-opening animation that reveals actual skill cards.
 *
 * Sequence:
 *   1. Dark overlay fades in
 *   2. Pack box scales in (Back.Out)
 *   3. Box shakes for 0.5s
 *   4. Box explodes with particles + camera flash
 *   5. Skill cards revealed one-by-one (staggered slide-up + fade-in)
 *   6. "Toque para fechar" after all revealed
 *   7. Click to fade out
 */
export function showPackOpen(
  scene: Phaser.Scene,
  drops: DroppedSkill[],
  onComplete?: () => void,
): void {
  const depth = 5000
  const allObjects: Phaser.GameObjects.GameObject[] = []

  // Helper to track objects for cleanup
  const track = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
    allObjects.push(obj)
    return obj
  }

  // ── 1. Dark overlay ──────────────────────────────────────────────────────
  const overlay = track(
    scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(depth),
  )
  scene.tweens.add({ targets: overlay, alpha: 0.85, duration: 300 })

  // ── 2. Pack box (centered, starts small) ─────────────────────────────────
  const boxSize = 120
  const boxG = track(scene.add.graphics().setDepth(depth + 1))

  const drawBox = (glow: boolean) => {
    boxG.clear()
    if (glow) {
      boxG.fillStyle(accent.primary, 0.15)
      boxG.fillRoundedRect(
        W / 2 - boxSize / 2 - 8, H / 2 - boxSize / 2 - 8,
        boxSize + 16, boxSize + 16, radii.xl + 4,
      )
    }
    boxG.fillStyle(surface.panel, 1)
    boxG.fillRoundedRect(W / 2 - boxSize / 2, H / 2 - boxSize / 2, boxSize, boxSize, radii.xl)
    boxG.fillStyle(0xffffff, 0.05)
    boxG.fillRoundedRect(
      W / 2 - boxSize / 2 + 4, H / 2 - boxSize / 2 + 4,
      boxSize - 8, boxSize * 0.4,
      { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 },
    )
    boxG.lineStyle(2, accent.primary, glow ? 1 : 0.6)
    boxG.strokeRoundedRect(W / 2 - boxSize / 2, H / 2 - boxSize / 2, boxSize, boxSize, radii.xl)
  }

  drawBox(false)

  // Question mark
  const qm = track(
    scene.add.text(W / 2, H / 2 - 10, '?', {
      fontFamily: fontFamily.display, fontSize: '48px',
      color: accent.dimHex, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(depth + 2),
  )
  scene.tweens.add({
    targets: qm, alpha: 0, scaleX: 2, scaleY: 2,
    duration: 400, delay: 800, onComplete: () => qm.setVisible(false),
  })

  // Scale-in animation
  boxG.setScale(0.3).setAlpha(0)
  scene.tweens.add({
    targets: boxG, scaleX: 1, scaleY: 1, alpha: 1,
    duration: 400, ease: 'Back.Out',
  })

  // ── 3. Shake + 4. Burst ──────────────────────────────────────────────────
  scene.time.delayedCall(1000, () => {
    // Shake for ~0.5s
    scene.tweens.add({
      targets: boxG, x: boxG.x + 4, duration: 40,
      yoyo: true, repeat: 6,
    })

    scene.time.delayedCall(300, () => {
      drawBox(true)

      // Burst particles
      for (let i = 0; i < 24; i++) {
        const angle = Math.random() * Math.PI * 2
        const dist = 60 + Math.random() * 100
        const size = 2 + Math.random() * 5
        const colors = [accent.primary, state.info, state.success, state.warn, state.error]
        const color = colors[Math.floor(Math.random() * colors.length)]
        const p = track(scene.add.circle(W / 2, H / 2, size, color, 0.9).setDepth(depth + 3))
        scene.tweens.add({
          targets: p,
          x: W / 2 + Math.cos(angle) * dist,
          y: H / 2 + Math.sin(angle) * dist,
          alpha: 0, scaleX: 0.2, scaleY: 0.2,
          duration: 500 + Math.random() * 400,
          ease: 'Quad.Out',
        })
      }

      // 5. Camera flash
      scene.cameras.main.flash(150, 255, 255, 200, false, undefined, 0.3)

      // Fade box away
      scene.tweens.add({
        targets: boxG, alpha: 0, scaleX: 0.5, scaleY: 0.5,
        duration: 300, ease: 'Quad.In',
      })

      // ── 5/6. Reveal skill cards ────────────────────────────────────────
      const revealDelay = 450
      scene.time.delayedCall(revealDelay, () => {
        revealSkillCards(scene, drops, depth + 5, track, () => {
          // ── 7. "Tap to close" ────────────────────────────────────────
          const closeText = track(
            scene.add.text(W / 2, H - 50, t('scenes.pack-open.tap-to-close'), {
              fontFamily: fontFamily.body, fontSize: typeScale.meta,
              color: fg.tertiaryHex, fontStyle: 'bold',
            }).setOrigin(0.5).setDepth(depth + 10).setAlpha(0).setLetterSpacing(1.6),
          )
          scene.tweens.add({ targets: closeText, alpha: 0.75, duration: 400 })

          // ── 8. Click to close ────────────────────────────────────────
          scene.time.delayedCall(300, () => {
            overlay.setInteractive()
            overlay.on('pointerdown', () => {
              scene.tweens.add({
                targets: allObjects.filter(o => o.active),
                alpha: 0,
                duration: 300,
                onComplete: () => {
                  allObjects.forEach(o => { if (o.active) o.destroy() })
                  onComplete?.()
                },
              })
            })
          })
        })
      })
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reveal skill cards with stagger
// ═══════════════════════════════════════════════════════════════════════════════

function revealSkillCards(
  scene: Phaser.Scene,
  drops: DroppedSkill[],
  baseDepth: number,
  track: <T extends Phaser.GameObjects.GameObject>(obj: T) => T,
  onAllRevealed: () => void,
): void {
  const count = drops.length
  // Vertical 120×160 (INTEGRATION_SPEC §2 canonical). Mantém a regra de
  // 1 row pra 1-4 cards, 2 rows pra 5-8 — 4 × 120 + 3 × 16 = 528 cabe folgado em 1280.
  const cardW = 120
  const cardH = 160

  let cols: number, rows: number
  if (count <= 4) {
    cols = count; rows = 1
  } else {
    cols = Math.ceil(count / 2); rows = 2
  }

  const gapX = 16
  const gapY = 18
  const totalW = cols * cardW + (cols - 1) * gapX
  const totalH = rows * cardH + (rows - 1) * gapY
  const startX = (W - totalW) / 2 + cardW / 2
  const startY = (H - totalH) / 2 + cardH / 2

  const staggerMs = 300

  drops.forEach((drop, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const cx = startX + col * (cardW + gapX)
    const cy = startY + row * (cardH + gapY)
    const delay = i * staggerMs

    // Draw card after delay
    scene.time.delayedCall(delay, () => {
      drawSkillCard(scene, cx, cy, cardW, cardH, drop, baseDepth + i * 2, track)
    })
  })

  // Notify all revealed after last card appears
  const totalRevealTime = (count - 1) * staggerMs + 500
  scene.time.delayedCall(totalRevealTime, onAllRevealed)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Draw a single skill card (uses standardized UI.skillCard)
// ═══════════════════════════════════════════════════════════════════════════════

function drawSkillCard(
  scene: Phaser.Scene,
  cx: number, cy: number,
  cardW: number, cardH: number,
  drop: DroppedSkill,
  depth: number,
  track: <T extends Phaser.GameObjects.GameObject>(obj: T) => T,
): void {
  // Resolve group from catalog
  const catalogEntry = drop.skillId
    ? SKILL_CATALOG.find(s => s.id === drop.skillId)
    : null
  const group = drop.group ?? catalogEntry?.group ?? 'attack1'

  // Slide-up offset proportional to card height so the entrance reads at
  // any size; 60% of the card's height is enough travel to feel airy.
  const slideFrom = cardH * 0.6

  const container = UI.skillCard(scene, cx, cy + slideFrom, {
    name: drop.name,
    effectType: drop.effectType,
    power: drop.power,
    group,
    unitClass: drop.unitClass,
    level: drop.level,
    progress: drop.progress ?? 0,
    skillId: drop.skillId,
    description: drop.description,
    targetType: catalogEntry?.targetType,
    areaShape: catalogEntry?.areaShape ?? null,
  }, {
    orientation: 'vertical',
    width: cardW,
    height: cardH,
    depth,
    showTooltip: false,
    animateLastDot: drop.isProgressGain ?? false,
  })

  container.setAlpha(0)
  track(container)

  // Soft halo pulse behind each card — accent colour @ 18%, 1×320 ms
  const halo = track(
    scene.add.graphics().setDepth(depth - 1),
  )
  halo.fillStyle(accent.primary, 0.18)
  halo.fillRoundedRect(cx - cardW / 2 - 6, cy - cardH / 2 - 6, cardW + 12, cardH + 12, radii.lg)
  halo.setAlpha(0)

  // ── Entrance animation: slide up from below + fade in ──────────────────
  scene.tweens.add({
    targets: container,
    y: cy,
    alpha: 1,
    duration: 460,
    ease: 'Back.Out',
  })
  scene.tweens.add({
    targets: halo,
    alpha: { from: 0, to: 0.85 },
    duration: 240,
    yoyo: true,
    delay: 120,
    onComplete: () => halo.destroy(),
  })
}


