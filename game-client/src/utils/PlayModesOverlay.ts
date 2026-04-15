/**
 * utils/PlayModesOverlay.ts — shared "modes de jogo" full-screen overlay.
 *
 * One canonical implementation of the play modes panel, used by the lobby
 * (when the player clicks "JOGAR") and by every room scene (when the player
 * clicks "ALTERAR MODO"). All callers get the same large, mobile-friendly
 * card layout so the UX is identical in both flows.
 *
 * Per-caller knobs:
 *  - `title`           — header text (default "MODOS DE JOGO")
 *  - `currentTarget`   — scene key of the mode to mark with the "ATUAL" badge
 *  - `currentPveType`  — distinguishes Batalha PvE vs Torneio PvE (both share the
 *                        PvELobbyScene key, so we need the data field too)
 *  - `dimTargets`      — background containers to fade out while the overlay is open
 *  - `onModeSelect`    — custom click handler. Defaults to `transitionTo(scene, mode.target, mode.data)`
 *  - `onClose`         — called after the overlay finishes its fade-out tween
 *
 * Returns a handle with `close()` so the caller can dismiss the overlay
 * programmatically (e.g. from a parent close button).
 */

import Phaser from 'phaser'
import { C, F, S, SHADOW } from './DesignTokens'
import { playerData } from './PlayerDataManager'
import { transitionTo } from './SceneTransition'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlayMode {
  label: string
  desc: string
  target: string
  color: number
  /** Static payload passed to `transitionTo`. e.g. `{ pveType: 'battle' }`. */
  data: Record<string, unknown>
}

export interface PlayCategory {
  title: string
  titleColorHex: string
  titleColorNum: number
  modes: PlayMode[]
}

// ── Canonical mode data (single source of truth) ────────────────────────────

export const PLAY_CATEGORIES: PlayCategory[] = [
  {
    title: 'PVP',
    titleColorHex: C.dangerHex,
    titleColorNum: C.danger,
    modes: [
      { label: 'Arena Rankeada', desc: 'Torneios rankeados (Lv.100)',         target: 'RankedScene',     color: 0xff4444, data: {} },
      { label: 'Batalha PvP',    desc: 'Enfrente jogadores de nivel similar', target: 'PvPLobbyScene',   color: 0x4ade80, data: {} },
    ],
  },
  {
    title: 'PVE',
    titleColorHex: C.infoHex,
    titleColorNum: C.info,
    modes: [
      { label: 'Batalha PvE',    desc: 'Enfrente um bot inteligente do seu nivel', target: 'PvELobbyScene', color: 0x4fc3f7, data: { pveType: 'battle' } },
      { label: 'Torneio PvE',    desc: 'Chaveamento por faixa de nivel',           target: 'PvELobbyScene', color: 0xf0c850, data: { pveType: 'tournament' } },
    ],
  },
  {
    title: 'CRIACAO',
    titleColorHex: C.purpleHex,
    titleColorNum: C.purple,
    modes: [
      { label: 'Partida Personalizada', desc: 'Monte times com amigos e bots', target: 'CustomLobbyScene', color: 0xab47bc, data: {} },
    ],
  },
]

// ── Options + handle ────────────────────────────────────────────────────────

export interface PlayModesOverlayOptions {
  /** Header text. Default 'MODOS DE JOGO'. Rooms typically pass 'ALTERAR MODO'. */
  title?: string
  /** Scene key of the mode to mark "ATUAL". */
  currentTarget?: string
  /** Required when currentTarget === 'PvELobbyScene' to disambiguate. */
  currentPveType?: 'battle' | 'tournament'
  /** Background objects to dim while the overlay is open. */
  dimTargets?: Phaser.GameObjects.GameObject[]
  /**
   * Convenience flag for room scenes: snapshot every existing top-level
   * GameObject in the scene and fade them while the overlay is open. Saves
   * each caller from having to enumerate its containers manually.
   * Ignored when `dimTargets` is also passed.
   */
  dimSceneBackground?: boolean
  /** Custom click handler. If omitted, default is `transitionTo(scene, mode.target, mode.data)`. */
  onModeSelect?: (mode: PlayMode) => void
  /** Called after the overlay fully closes. */
  onClose?: () => void
}

export interface PlayModesOverlayHandle {
  close: () => void
}

// ── Constants ───────────────────────────────────────────────────────────────

const PANEL_BORDER = C.panelBorder
const TEXT_MUTED   = C.mutedHex
const GOLD_ACCENT  = C.goldHex

// Card layout (must stay in sync with what the lobby originally used).
const CARD_W       = 640
const CARD_H       = 90
const CARD_GAP     = 14
const CATEGORY_GAP = 24
const HEADER_H     = 34

// ── Implementation ──────────────────────────────────────────────────────────

export function showPlayModesOverlay(
  scene: Phaser.Scene,
  options: PlayModesOverlayOptions = {},
): PlayModesOverlayHandle {
  const W = scene.scale.width
  const H = scene.scale.height

  const title          = options.title         ?? 'MODOS DE JOGO'
  const currentTarget  = options.currentTarget
  const currentPveType = options.currentPveType

  // Resolve dim targets: explicit list wins, otherwise snapshot the whole scene
  // if dimSceneBackground was requested. The snapshot MUST happen before we add
  // any of our own GameObjects below — otherwise the overlay itself would dim.
  let dimTargets: Phaser.GameObjects.GameObject[] = options.dimTargets ?? []
  if (dimTargets.length === 0 && options.dimSceneBackground) {
    dimTargets = scene.children.list.filter(
      (c): c is Phaser.GameObjects.GameObject => 'alpha' in c,
    )
  }

  let isClosing = false

  // Dark background — fades in
  const dimBg = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0)
    .setDepth(100).setInteractive()
  dimBg.on('pointerdown', () => closeOverlay())

  // Lighter center radial glow
  const radialGlow = scene.add.circle(W / 2, H / 2, 350, 0x111825, 0).setDepth(100)

  const overlayContainer = scene.add.container(W / 2, H / 2)
    .setDepth(101).setAlpha(0).setScale(0.92)

  const elements: Phaser.GameObjects.GameObject[] = [dimBg, radialGlow, overlayContainer]

  // ── Title ──
  overlayContainer.add(scene.add.text(0, -225, title, {
    fontFamily: F.title, fontSize: S.titleMedium, color: GOLD_ACCENT, fontStyle: 'bold',
    shadow: SHADOW.goldGlow,
  }).setOrigin(0.5))

  // ── Close button (X in a circle, top-right of the overlay) ──
  const closeX = 275
  const closeY = -225
  const closeGfx = scene.add.graphics()
  const drawCloseBg = (hover: boolean) => {
    closeGfx.clear()
    closeGfx.fillStyle(hover ? 0x1a2434 : 0x0e1420, hover ? 0.95 : 0.9)
    closeGfx.fillCircle(closeX, closeY, 16)
    closeGfx.lineStyle(1.5, hover ? C.danger : C.goldDim, hover ? 0.6 : 0.4)
    closeGfx.strokeCircle(closeX, closeY, 16)
  }
  drawCloseBg(false)
  overlayContainer.add(closeGfx)

  const closeIcon = scene.add.text(closeX, closeY, 'X', {
    fontFamily: F.title, fontSize: '14px', color: TEXT_MUTED, fontStyle: 'bold',
    shadow: SHADOW.text,
  }).setOrigin(0.5)
  overlayContainer.add(closeIcon)

  const closeHit = scene.add.circle(closeX, closeY, 16, 0x000000, 0.001)
    .setInteractive({ useHandCursor: true }).setDepth(102)
  overlayContainer.add(closeHit)
  closeHit.on('pointerover', () => { drawCloseBg(true);  closeIcon.setColor(C.dangerHex) })
  closeHit.on('pointerout',  () => { drawCloseBg(false); closeIcon.setColor(TEXT_MUTED) })
  closeHit.on('pointerdown', () => closeOverlay())

  // ── Layout: total height for vertical centering ──
  let totalContentH = 0
  PLAY_CATEGORIES.forEach((cat, ci) => {
    totalContentH += HEADER_H
    totalContentH += cat.modes.length * CARD_H + (cat.modes.length - 1) * CARD_GAP
    if (ci < PLAY_CATEGORIES.length - 1) totalContentH += CATEGORY_GAP
  })

  let cursorY = -totalContentH / 2 - 10

  // Helper: is this mode the "current" one?
  const isCurrentMode = (mode: PlayMode): boolean => {
    if (currentTarget !== mode.target) return false
    if (mode.target === 'PvELobbyScene' && currentPveType !== undefined) {
      return mode.data.pveType === currentPveType
    }
    return true
  }

  // ── Cards ──
  PLAY_CATEGORIES.forEach((cat) => {
    const headerY = cursorY + HEADER_H / 2

    // Category header decorative gradient line
    const headerGfx = scene.add.graphics()
    for (let i = 0; i < CARD_W - 50; i++) {
      const t = i / (CARD_W - 50)
      headerGfx.fillStyle(cat.titleColorNum, 0.15 * t)
      headerGfx.fillRect(-CARD_W / 2 + 50 + i, headerY + 10, 1, 1)
    }
    overlayContainer.add(headerGfx)

    overlayContainer.add(scene.add.text(-CARD_W / 2 + 4, headerY, cat.title, {
      fontFamily: F.title, fontSize: '18px', color: cat.titleColorHex, fontStyle: 'bold',
      shadow: SHADOW.text, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5))

    cursorY += HEADER_H

    cat.modes.forEach((rawMode) => {
      let mode = rawMode
      if (mode.target === 'RankedScene' && playerData.getLevel() < 100) {
        mode = { ...mode, desc: 'Disponivel a partir do Lv.100' }
      }
      const isLocked  = mode.target === 'RankedScene' && playerData.getLevel() < 100
      const available = !isLocked
      const current   = isCurrentMode(mode)
      const cy        = cursorY + CARD_H / 2
      const accentHex = '#' + mode.color.toString(16).padStart(6, '0')

      // ── Card background (multi-layer) ──
      const cardGfx = scene.add.graphics()
      // Drop shadow
      cardGfx.fillStyle(0x000000, 0.25)
      cardGfx.fillRoundedRect(-CARD_W / 2 + 2, cy - CARD_H / 2 + 3, CARD_W, CARD_H, 6)
      // Main fill
      cardGfx.fillStyle(available ? 0x111825 : 0x0a0e14, 1)
      cardGfx.fillRoundedRect(-CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 6)
      // Top gloss
      if (available) {
        cardGfx.fillStyle(0xffffff, 0.02)
        cardGfx.fillRoundedRect(-CARD_W / 2 + 2, cy - CARD_H / 2 + 2, CARD_W - 4, CARD_H * 0.35,
          { tl: 4, tr: 4, bl: 0, br: 0 })
      }
      // Border (gold for current, default otherwise)
      if (current) {
        cardGfx.lineStyle(1.5, C.gold, 0.7)
      } else {
        cardGfx.lineStyle(1, available ? PANEL_BORDER : 0x222222, 0.5)
      }
      cardGfx.strokeRoundedRect(-CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 6)
      overlayContainer.add(cardGfx)

      // ── Colored left accent bar ──
      const accentBar = scene.add.graphics()
      accentBar.fillStyle(mode.color, available ? 0.9 : 0.25)
      accentBar.fillRoundedRect(-CARD_W / 2, cy - CARD_H / 2, 7, CARD_H,
        { tl: 6, bl: 6, tr: 0, br: 0 })
      overlayContainer.add(accentBar)

      // ── Label ──
      const label = scene.add.text(-CARD_W / 2 + 26, cy - 14, mode.label, {
        fontFamily: F.title, fontSize: '24px',
        color: available ? '#ffffff' : TEXT_MUTED,
        fontStyle: 'bold', shadow: SHADOW.strong,
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5)
      overlayContainer.add(label)

      // ── Description ──
      overlayContainer.add(scene.add.text(-CARD_W / 2 + 26, cy + 16, mode.desc, {
        fontFamily: F.body, fontSize: '16px',
        color: available ? TEXT_MUTED : C.dimHex,
        shadow: SHADOW.text, stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0, 0.5))

      // ── Right-side indicator: ATUAL badge / lock pill / arrow ──
      if (current) {
        // ATUAL pill — gold rounded badge
        const pillCx = CARD_W / 2 - 50
        const pillW  = 70
        const pillH  = 24

        const pillGfx = scene.add.graphics()
        pillGfx.fillStyle(0x2a2010, 0.95)
        pillGfx.fillRoundedRect(pillCx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2)
        pillGfx.lineStyle(1.2, C.gold, 0.7)
        pillGfx.strokeRoundedRect(pillCx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2)
        overlayContainer.add(pillGfx)

        overlayContainer.add(scene.add.text(pillCx, cy, 'ATUAL', {
          fontFamily: F.title, fontSize: '13px', color: GOLD_ACCENT, fontStyle: 'bold',
          shadow: SHADOW.text, stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5))
      } else if (!available) {
        // Lock pill (Lv.100)
        const reqLevel = mode.target === 'RankedScene' ? 'Lv.100' : 'Lv.30'
        const pillCx = CARD_W / 2 - 50
        const pillW  = 70
        const pillH  = 22

        const pillGfx = scene.add.graphics()
        pillGfx.fillStyle(0x1a1a2a, 0.9)
        pillGfx.fillRoundedRect(pillCx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2)
        pillGfx.lineStyle(1, 0x777777, 0.45)
        pillGfx.strokeRoundedRect(pillCx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2)
        overlayContainer.add(pillGfx)

        // Padlock icon
        const lockGfx = scene.add.graphics()
        const lkX = pillCx - 17
        const lkOffY = cy + 1
        lockGfx.lineStyle(1.5, 0x999999, 0.8)
        lockGfx.beginPath()
        lockGfx.arc(lkX, lkOffY - 4, 3, Math.PI, 0, false)
        lockGfx.strokePath()
        lockGfx.fillStyle(0x999999, 0.8)
        lockGfx.fillRoundedRect(lkX - 4, lkOffY - 4, 8, 6, 1)
        lockGfx.fillStyle(0x000000, 0.5)
        lockGfx.fillCircle(lkX, lkOffY - 2, 1)
        overlayContainer.add(lockGfx)

        overlayContainer.add(scene.add.text(pillCx + 1, cy, reqLevel, {
          fontFamily: F.body, fontSize: '10px', color: '#999999', fontStyle: 'bold',
          shadow: SHADOW.text,
        }).setOrigin(0, 0.5))
      } else {
        // Arrow chevron
        const arrowGfx = scene.add.graphics()
        arrowGfx.lineStyle(3, mode.color, 0.5)
        arrowGfx.beginPath()
        arrowGfx.moveTo(CARD_W / 2 - 30, cy - 12)
        arrowGfx.lineTo(CARD_W / 2 - 16, cy)
        arrowGfx.lineTo(CARD_W / 2 - 30, cy + 12)
        arrowGfx.strokePath()
        overlayContainer.add(arrowGfx)
      }

      // ── Click handling (only available + not current) ──
      if (available && !current) {
        const cardHit = scene.add.rectangle(0, cy, CARD_W, CARD_H, 0x000000, 0.001)
          .setInteractive({ useHandCursor: true })
        overlayContainer.add(cardHit)

        const hoverGlow = scene.add.graphics()
        hoverGlow.fillStyle(mode.color, 0.06)
        hoverGlow.fillRoundedRect(-CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 6)
        hoverGlow.setAlpha(0)
        overlayContainer.add(hoverGlow)

        const hoverBorder = scene.add.graphics()
        hoverBorder.lineStyle(1.5, mode.color, 0.5)
        hoverBorder.strokeRoundedRect(-CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, 6)
        hoverBorder.setAlpha(0)
        overlayContainer.add(hoverBorder)

        cardHit.on('pointerover', () => {
          hoverGlow.setAlpha(1)
          hoverBorder.setAlpha(1)
          label.setColor(accentHex)
        })
        cardHit.on('pointerout', () => {
          hoverGlow.setAlpha(0)
          hoverBorder.setAlpha(0)
          label.setColor('#ffffff')
        })
        cardHit.on('pointerdown', () => {
          closeOverlay()
          if (options.onModeSelect) {
            options.onModeSelect(mode)
          } else {
            transitionTo(scene, mode.target, mode.data)
          }
        })
      }

      cursorY += CARD_H + CARD_GAP
    })
    cursorY += CATEGORY_GAP - CARD_GAP
  })

  // ── Fade out background containers (lobby uses this; rooms typically don't) ──
  if (dimTargets.length > 0) {
    scene.tweens.add({
      targets: dimTargets,
      alpha: 0.05,
      duration: 250,
      ease: 'Quad.Out',
    })
  }

  // ── Animate overlay in ──
  scene.tweens.add({
    targets: dimBg,
    alpha: 0.94,
    duration: 250,
    ease: 'Quad.Out',
  })
  scene.tweens.add({
    targets: radialGlow,
    alpha: 0.35,
    duration: 300,
    ease: 'Quad.Out',
  })
  scene.tweens.add({
    targets: overlayContainer,
    alpha: 1, scaleX: 1, scaleY: 1,
    duration: 300, ease: 'Back.easeOut',
  })

  // Stagger individual elements inside the overlay
  const children = overlayContainer.list
  children.forEach((child, i) => {
    if ('setAlpha' in child) {
      (child as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0)
      scene.tweens.add({
        targets: child,
        alpha: 1,
        duration: 200,
        delay: 50 + i * 20,
        ease: 'Quad.Out',
      })
    }
  })

  // ── Close fn (returned + used internally) ──
  function closeOverlay() {
    if (isClosing) return
    isClosing = true

    // Restore dimmed backgrounds
    if (dimTargets.length > 0) {
      scene.tweens.add({
        targets: dimTargets,
        alpha: 1,
        duration: 200,
        ease: 'Quad.Out',
      })
    }

    const targets = elements.filter((el) => 'alpha' in el)
    scene.tweens.add({
      targets,
      alpha: 0,
      duration: 150,
      ease: 'Quad.In',
      onComplete: () => {
        elements.forEach((el) => el.destroy())
        options.onClose?.()
      },
    })
  }

  return { close: closeOverlay }
}
