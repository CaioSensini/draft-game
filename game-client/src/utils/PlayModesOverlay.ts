/**
 * utils/PlayModesOverlay.ts — shared "modes de jogo" full-screen overlay.
 *
 * One canonical implementation of the play modes panel, used by the lobby
 * (when the player clicks "JOGAR") and by every room scene (when the player
 * clicks "ALTERAR MODO"). All callers get the same large, mobile-friendly
 * card layout so the UX is identical in both flows.
 */

import Phaser from 'phaser'
import {
  surface, border, fg, accent, state,
  currency, fontFamily, typeScale, radii,
} from './DesignTokens'
import { playerData } from './PlayerDataManager'
import { transitionTo } from './SceneTransition'
import { t } from '../i18n'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlayMode {
  labelKey: string
  descKey: string
  target: string
  color: number
  /** Static payload passed to `transitionTo`. e.g. `{ pveType: 'battle' }`. */
  data: Record<string, unknown>
}

export interface PlayCategory {
  titleKey: string
  titleColorHex: string
  titleColorNum: number
  modes: PlayMode[]
}

// ── Canonical mode data (single source of truth) ────────────────────────────

export const PLAY_CATEGORIES: PlayCategory[] = [
  {
    titleKey: 'scenes.play-modes.sections.pvp',
    titleColorHex: state.errorHex,
    titleColorNum: state.error,
    modes: [
      { labelKey: 'scenes.play-modes.modes.ranked.title', descKey: 'scenes.play-modes.modes.ranked.desc', target: 'RankedScene', color: state.error, data: {} },
      { labelKey: 'scenes.play-modes.modes.pvp.title', descKey: 'scenes.play-modes.modes.pvp.desc', target: 'PvPLobbyScene', color: state.success, data: {} },
    ],
  },
  {
    titleKey: 'scenes.play-modes.sections.pve',
    titleColorHex: state.infoHex,
    titleColorNum: state.info,
    modes: [
      { labelKey: 'scenes.play-modes.modes.pve-battle.title', descKey: 'scenes.play-modes.modes.pve-battle.desc', target: 'PvELobbyScene', color: state.info, data: { pveType: 'battle' } },
      { labelKey: 'scenes.play-modes.modes.pve-tournament.title', descKey: 'scenes.play-modes.modes.pve-tournament.desc', target: 'PvELobbyScene', color: accent.primary, data: { pveType: 'tournament' } },
    ],
  },
  {
    titleKey: 'scenes.play-modes.sections.creation',
    titleColorHex: currency.dgGemHex,
    titleColorNum: currency.dgGem,
    modes: [
      { labelKey: 'scenes.play-modes.modes.custom.title', descKey: 'scenes.play-modes.modes.custom.desc', target: 'CustomLobbyScene', color: currency.dgGem, data: {} },
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
   * GameObject in the scene and fade them while the overlay is open.
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

  const title          = options.title         ?? t('scenes.lobby.play-modes-title')
  const currentTarget  = options.currentTarget
  const currentPveType = options.currentPveType

  // Resolve dim targets
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
  const radialGlow = scene.add.circle(W / 2, H / 2, 350, surface.primary, 0).setDepth(100)

  const overlayContainer = scene.add.container(W / 2, H / 2)
    .setDepth(101).setAlpha(0).setScale(0.92)

  const elements: Phaser.GameObjects.GameObject[] = [dimBg, radialGlow, overlayContainer]

  // ── Title ──
  overlayContainer.add(scene.add.text(0, -225, title, {
    fontFamily: fontFamily.display,
    fontSize:   typeScale.h2,
    color:      fg.primaryHex,
    fontStyle:  '600',
  }).setOrigin(0.5).setLetterSpacing(3))

  // ── Close button (X in a circle, top-right of the overlay) ──
  const closeX = 275
  const closeY = -225
  const closeGfx = scene.add.graphics()
  const drawCloseBg = (hover: boolean) => {
    closeGfx.clear()
    closeGfx.fillStyle(hover ? surface.raised : surface.deepest, 1)
    closeGfx.fillCircle(closeX, closeY, 16)
    closeGfx.lineStyle(1, hover ? state.error : border.default, 1)
    closeGfx.strokeCircle(closeX, closeY, 16)
  }
  drawCloseBg(false)
  overlayContainer.add(closeGfx)

  const closeIcon = scene.add.text(closeX, closeY, '✕', {
    fontFamily: fontFamily.body,
    fontSize:   '14px',
    color:      fg.tertiaryHex,
    fontStyle:  '700',
  }).setOrigin(0.5)
  overlayContainer.add(closeIcon)

  const closeHit = scene.add.circle(closeX, closeY, 16, 0x000000, 0.001)
    .setInteractive({ useHandCursor: true }).setDepth(102)
  overlayContainer.add(closeHit)
  closeHit.on('pointerover', () => { drawCloseBg(true);  closeIcon.setColor(state.errorHex) })
  closeHit.on('pointerout',  () => { drawCloseBg(false); closeIcon.setColor(fg.tertiaryHex) })
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

    const categoryTitle = t(cat.titleKey)
    overlayContainer.add(scene.add.text(-CARD_W / 2 + 4, headerY, categoryTitle, {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      cat.titleColorHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8))

    cursorY += HEADER_H

    cat.modes.forEach((rawMode) => {
      let mode = rawMode
      if (mode.target === 'RankedScene' && playerData.getLevel() < 100) {
        mode = { ...mode, descKey: 'scenes.play-modes.modes.ranked.locked-desc' }
      }
      const isLocked  = mode.target === 'RankedScene' && playerData.getLevel() < 100
      const available = !isLocked
      const current   = isCurrentMode(mode)
      const cy        = cursorY + CARD_H / 2
      const accentHex = '#' + mode.color.toString(16).padStart(6, '0')

      // ── Card background ──
      const cardGfx = scene.add.graphics()
      // Drop shadow
      cardGfx.fillStyle(0x000000, 0.25)
      cardGfx.fillRoundedRect(-CARD_W / 2 + 2, cy - CARD_H / 2 + 3, CARD_W, CARD_H, radii.md)
      // Main fill
      cardGfx.fillStyle(available ? surface.panel : surface.deepest, 1)
      cardGfx.fillRoundedRect(-CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, radii.md)
      // Top inset highlight
      if (available) {
        cardGfx.fillStyle(0xffffff, 0.03)
        cardGfx.fillRect(-CARD_W / 2 + 2, cy - CARD_H / 2 + 2, CARD_W - 4, 1)
      }
      // Border
      if (current) {
        cardGfx.lineStyle(1.5, accent.primary, 0.8)
      } else {
        cardGfx.lineStyle(1, available ? border.default : border.subtle, 1)
      }
      cardGfx.strokeRoundedRect(-CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, radii.md)
      overlayContainer.add(cardGfx)

      // ── Colored left accent bar ──
      const accentBar = scene.add.graphics()
      accentBar.fillStyle(mode.color, available ? 0.9 : 0.25)
      accentBar.fillRoundedRect(-CARD_W / 2, cy - CARD_H / 2, 4, CARD_H,
        { tl: radii.md, bl: radii.md, tr: 0, br: 0 })
      overlayContainer.add(accentBar)

      // ── Label ──
      const label = scene.add.text(-CARD_W / 2 + 26, cy - 14, t(mode.labelKey), {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.h3,
        color:      available ? fg.primaryHex : fg.tertiaryHex,
        fontStyle:  '600',
      }).setOrigin(0, 0.5)
      overlayContainer.add(label)

      // ── Description ──
      overlayContainer.add(scene.add.text(-CARD_W / 2 + 26, cy + 14, t(mode.descKey), {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.small,
        color:      available ? fg.secondaryHex : fg.disabledHex,
      }).setOrigin(0, 0.5))

      // ── Right-side indicator: ATUAL badge / lock pill / arrow ──
      if (current) {
        // ATUAL pill — accent rounded badge
        const pillCx = CARD_W / 2 - 50
        const pillW  = 72
        const pillH  = 24

        const pillGfx = scene.add.graphics()
        pillGfx.fillStyle(surface.deepest, 0.95)
        pillGfx.fillRoundedRect(pillCx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2)
        pillGfx.lineStyle(1, accent.primary, 0.9)
        pillGfx.strokeRoundedRect(pillCx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2)
        overlayContainer.add(pillGfx)

        overlayContainer.add(scene.add.text(pillCx, cy, t('scenes.lobby-shared.current-badge'), {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      accent.primaryHex,
          fontStyle:  '700',
        }).setOrigin(0.5).setLetterSpacing(1.6))
      } else if (!available) {
        // Lock pill (Lv.100)
        const reqLevel = mode.target === 'RankedScene' ? 'LV.100' : 'LV.30'
        const pillCx = CARD_W / 2 - 50
        const pillW  = 72
        const pillH  = 22

        const pillGfx = scene.add.graphics()
        pillGfx.fillStyle(surface.deepest, 1)
        pillGfx.fillRoundedRect(pillCx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2)
        pillGfx.lineStyle(1, border.default, 1)
        pillGfx.strokeRoundedRect(pillCx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2)
        overlayContainer.add(pillGfx)

        // Padlock icon
        const lockGfx = scene.add.graphics()
        const lkX = pillCx - 17
        const lkOffY = cy + 1
        lockGfx.lineStyle(1.5, fg.tertiary, 0.85)
        lockGfx.beginPath()
        lockGfx.arc(lkX, lkOffY - 4, 3, Math.PI, 0, false)
        lockGfx.strokePath()
        lockGfx.fillStyle(fg.tertiary, 0.85)
        lockGfx.fillRoundedRect(lkX - 4, lkOffY - 4, 8, 6, 1)
        lockGfx.fillStyle(0x000000, 0.5)
        lockGfx.fillCircle(lkX, lkOffY - 2, 1)
        overlayContainer.add(lockGfx)

        overlayContainer.add(scene.add.text(pillCx + 1, cy, reqLevel, {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      fg.tertiaryHex,
          fontStyle:  '700',
        }).setOrigin(0, 0.5).setLetterSpacing(1.4))
      } else {
        // Arrow chevron
        const arrowGfx = scene.add.graphics()
        arrowGfx.lineStyle(2.5, mode.color, 0.6)
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
        hoverGlow.fillStyle(mode.color, 0.08)
        hoverGlow.fillRoundedRect(-CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, radii.md)
        hoverGlow.setAlpha(0)
        overlayContainer.add(hoverGlow)

        const hoverBorder = scene.add.graphics()
        hoverBorder.lineStyle(1.5, mode.color, 0.6)
        hoverBorder.strokeRoundedRect(-CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, radii.md)
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
          label.setColor(fg.primaryHex)
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

  // ── Fade out background containers ──
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
    alpha: 0.75,
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

  // ── Close fn ──
  function closeOverlay() {
    if (isClosing) return
    isClosing = true

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
