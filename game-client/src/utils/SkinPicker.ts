/**
 * utils/SkinPicker.ts — AAA-quality reusable modal for changing a class's
 * equipped skin from inside any lobby scene.
 *
 * Usage:
 *   import { openSkinPicker } from '../utils/SkinPicker'
 *
 *   openSkinPicker(this, 'king', {
 *     onChange: (newSkinId) => this.refreshCard(),
 *   })
 *
 * The picker is fully self-contained:
 *   - Dims the parent scene with a click-to-close backdrop
 *   - Lays out the 3 skins for the chosen class side-by-side
 *   - Owned skins are clickable; the equipped one is highlighted in gold
 *   - Locked skins show a padlock + DG price + "na loja" hint
 *   - Calls onChange(newSkinId) right after persisting the choice, so the
 *     calling lobby scene can redraw its character card with the new sprite
 */

import Phaser from 'phaser'
import {
  SCREEN, surface, border, fg, accent, state,
  currency, fontFamily, typeScale, radii,
} from './DesignTokens'
import { drawCharacterSprite, type SpriteRole, type SpriteSide } from './SpriteFactory'
import { playerData } from './PlayerDataManager'
import {
  SKIN_CATALOG,
  SKIN_RARITY_COLOR,
  SKIN_RARITY_HEX,
  SKIN_RARITY_LABEL,
  type SkinDef,
} from '../data/skinCatalog'
import type { CharClass } from './AssetPaths'

const W = SCREEN.W
const H = SCREEN.H

// ── Picker config ──────────────────────────────────────────────────────────

const ROLE_LABEL: Record<CharClass, string> = {
  king:       'REI',
  warrior:    'GUERREIRO',
  specialist: 'ESPECIALISTA',
  executor:   'EXECUTOR',
}

export interface SkinPickerOptions {
  /**
   * Called whenever the player equips a different skin for the class.
   * The lobby scene should use this to redraw its character card so the
   * new sprite shows up immediately.
   */
  onChange?: (newSkinId: string) => void

  /**
   * Which side the preview faces. Defaults to 'left'.
   * Pass 'right' for enemy-team previews so the picker matches the lobby.
   */
  side?: SpriteSide
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Opens the skin picker overlay for a given class. The overlay is rendered
 * on top of whatever scene is currently running and tears itself down on
 * close — there is no permanent UI state to clean up.
 */
export function openSkinPicker(
  scene: Phaser.Scene,
  classId: CharClass,
  options: SkinPickerOptions = {},
): void {
  const onChange = options.onChange
  const side: SpriteSide = options.side ?? 'left'

  const DEPTH = 5000

  // ── Backdrop (dim + click-to-close) ──
  const backdrop = scene.add
    .rectangle(W / 2, H / 2, W, H, 0x000000, 0)
    .setDepth(DEPTH)
    .setInteractive()

  scene.tweens.add({
    targets: backdrop,
    fillAlpha: 0.75,
    duration: 200,
    ease: 'Quad.Out',
  })

  // ── Root container (panel + cards + header) ──
  const root = scene.add
    .container(W / 2, H / 2)
    .setDepth(DEPTH + 1)
    .setAlpha(0)
    .setScale(0.92)

  const PANEL_W = 900
  const PANEL_H = 520

  // Main panel — token-driven with drop shadow + top inset
  const bg = scene.add.graphics()
  // drop shadow
  bg.fillStyle(0x000000, 0.55)
  bg.fillRoundedRect(-PANEL_W / 2 + 4, -PANEL_H / 2 + 8, PANEL_W, PANEL_H, radii.xl)
  // body
  bg.fillStyle(surface.panel, 1)
  bg.fillRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, radii.xl)
  // header strip (raised surface)
  bg.fillStyle(surface.raised, 0.7)
  bg.fillRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, 70,
    { tl: radii.xl, tr: radii.xl, bl: 0, br: 0 })
  // top inset highlight
  bg.fillStyle(0xffffff, 0.05)
  bg.fillRect(-PANEL_W / 2 + 2, -PANEL_H / 2 + 2, PANEL_W - 4, 1)
  // outer border
  bg.lineStyle(1, border.default, 1)
  bg.strokeRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, radii.xl)
  root.add(bg)

  // ── Header — "ESCOLHER SKIN" + role label ──
  root.add(
    scene.add
      .text(0, -PANEL_H / 2 + 22, 'ESCOLHER SKIN', {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      accent.primaryHex,
        fontStyle:  '700',
      })
      .setOrigin(0.5)
      .setLetterSpacing(1.8),
  )

  root.add(
    scene.add
      .text(0, -PANEL_H / 2 + 44, ROLE_LABEL[classId], {
        fontFamily: fontFamily.display,
        fontSize:   typeScale.h2,
        color:      fg.primaryHex,
        fontStyle:  '600',
      })
      .setOrigin(0.5)
      .setLetterSpacing(3),
  )

  // Decorative divider under the header
  const dividerY = -PANEL_H / 2 + 70
  const dvg = scene.add.graphics()
  dvg.fillStyle(accent.primary, 0.45)
  dvg.fillRect(-PANEL_W / 2 + 16, dividerY, PANEL_W - 32, 1)
  root.add(dvg)

  // ── Close X (top right) ──
  const closeX = scene.add
    .text(PANEL_W / 2 - 24, -PANEL_H / 2 + 32, '✕', {
      fontFamily: fontFamily.body,
      fontSize:   '20px',
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
  closeX.on('pointerover', () => closeX.setColor(fg.primaryHex))
  closeX.on('pointerout', () => closeX.setColor(fg.tertiaryHex))
  closeX.on('pointerdown', () => close())
  root.add(closeX)

  // ── Cards layer (rebuilt on every equip so visuals stay in sync) ──
  const cardsLayer = scene.add.container(0, 0)
  root.add(cardsLayer)

  // Footer hint text (re-created on each redraw with current state)
  const hintText = scene.add
    .text(0, PANEL_H / 2 - 28, '', {
      fontFamily: fontFamily.serif,
      fontSize:   typeScale.small,
      color:      fg.tertiaryHex,
      fontStyle:  'italic',
    })
    .setOrigin(0.5)
  root.add(hintText)

  function redraw(): void {
    cardsLayer.removeAll(true)

    const skins = SKIN_CATALOG[classId]
    const equipped = playerData.getEquippedSkin(classId)

    const CARD_W = 250
    const CARD_H = 380
    const GAP = 24
    const totalW = skins.length * CARD_W + (skins.length - 1) * GAP
    const startX = -totalW / 2 + CARD_W / 2
    const cardY = 30

    skins.forEach((skin, i) => {
      const cx = startX + i * (CARD_W + GAP)
      const isEquipped = equipped === skin.id
      const isOwned = playerData.ownsSkin(classId, skin.id)

      const card = createCard(scene, cx, cardY, CARD_W, CARD_H, skin, side, isOwned, isEquipped, () => {
        const ok = playerData.setEquippedSkin(classId, skin.id)
        if (ok) {
          if (onChange) onChange(skin.id)
          redraw()
        }
      })
      cardsLayer.add(card)

      card.setAlpha(0).setScale(0.92)
      scene.tweens.add({
        targets: card,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 280,
        delay: 60 + i * 70,
        ease: 'Back.Out',
      })
    })

    const locked = skins.filter((s) => !playerData.ownsSkin(classId, s.id)).length
    if (locked > 0) {
      hintText.setText(`${locked} skin(s) bloqueada(s) — compre na loja`)
      hintText.setColor(fg.tertiaryHex)
    } else {
      hintText.setText('Todas as skins desbloqueadas — toque para equipar')
      hintText.setColor(state.successHex)
    }
  }

  redraw()

  // ── Animate the modal in ──
  scene.tweens.add({
    targets: root,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    duration: 280,
    ease: 'Back.Out',
  })

  // ── Close handler ──
  let closing = false
  function close(): void {
    if (closing) return
    closing = true
    scene.tweens.add({
      targets: root,
      alpha: 0,
      scaleX: 0.94,
      scaleY: 0.94,
      duration: 180,
      ease: 'Quad.In',
    })
    scene.tweens.add({
      targets: backdrop,
      fillAlpha: 0,
      duration: 180,
      ease: 'Quad.In',
      onComplete: () => {
        root.destroy()
        backdrop.destroy()
      },
    })
  }

  backdrop.on('pointerdown', () => close())
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD RENDERING
// ═══════════════════════════════════════════════════════════════════════════

function createCard(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
  skin: SkinDef,
  side: SpriteSide,
  isOwned: boolean,
  isEquipped: boolean,
  onEquip: () => void,
): Phaser.GameObjects.Container {
  const container = scene.add.container(cx, cy)
  const hw = cw / 2
  const hh = ch / 2

  const rarityColor = SKIN_RARITY_COLOR[skin.rarity]
  const rarityHex = SKIN_RARITY_HEX[skin.rarity]
  const rarityLabel = SKIN_RARITY_LABEL[skin.rarity]

  // ── Background — token-driven card with rarity tint ──
  const bg = scene.add.graphics()

  // Drop shadow
  bg.fillStyle(0x000000, 0.55)
  bg.fillRoundedRect(-hw + 3, -hh + 5, cw, ch, radii.lg)

  // Body
  bg.fillStyle(surface.raised, 1)
  bg.fillRoundedRect(-hw, -hh, cw, ch, radii.lg)

  // Rarity colour wash on top half
  bg.fillStyle(rarityColor, isOwned ? 0.1 : 0.05)
  bg.fillRoundedRect(-hw, -hh, cw, ch * 0.55,
    { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })

  // Top inset highlight
  bg.fillStyle(0xffffff, 0.04)
  bg.fillRect(-hw + 2, -hh + 2, cw - 4, 1)

  // Bottom darkening
  bg.fillStyle(0x000000, 0.22)
  bg.fillRoundedRect(-hw + 2, hh - 70, cw - 4, 68,
    { tl: 0, tr: 0, bl: radii.lg - 1, br: radii.lg - 1 })

  // Border — accent if equipped, rarity colour if owned, subtle if locked
  let borderColor: number = border.subtle
  let borderAlpha = 0.6
  if (isEquipped) {
    borderColor = accent.primary
    borderAlpha = 0.9
  } else if (isOwned) {
    borderColor = rarityColor
    borderAlpha = 0.6
  }
  bg.lineStyle(2, borderColor, borderAlpha)
  bg.strokeRoundedRect(-hw, -hh, cw, ch, radii.lg)
  container.add(bg)

  // ── Rarity badge (top center) ──
  const badgeW = 96
  const badgeH = 22
  const badgeY = -hh + 16
  const bbg = scene.add.graphics()
  bbg.fillStyle(surface.deepest, 0.9)
  bbg.fillRoundedRect(-badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, radii.md)
  bbg.fillStyle(rarityColor, isOwned ? 0.28 : 0.14)
  bbg.fillRoundedRect(-badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, radii.md)
  bbg.lineStyle(1, rarityColor, isOwned ? 0.85 : 0.4)
  bbg.strokeRoundedRect(-badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, radii.md)
  container.add(bbg)

  container.add(
    scene.add
      .text(0, badgeY, rarityLabel, {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      rarityHex,
        fontStyle:  '700',
      })
      .setOrigin(0.5)
      .setLetterSpacing(1.6),
  )

  // ── Pedestal glow under the preview ──
  const pedestalY = -hh + 168
  const ped = scene.add.graphics()
  ped.fillStyle(rarityColor, isOwned ? 0.2 : 0.08)
  ped.fillEllipse(0, pedestalY + 60, cw * 0.62, 22)
  ped.fillStyle(rarityColor, isOwned ? 0.1 : 0.04)
  ped.fillEllipse(0, pedestalY + 60, cw * 0.78, 30)
  container.add(ped)

  // ── Character preview sprite ──
  const sprite = drawCharacterSprite(scene, skin.classId as SpriteRole, side, 110, skin.id)
  sprite.setPosition(0, pedestalY)
  container.add(sprite)

  // Subtle bob
  scene.tweens.add({
    targets: sprite,
    y: pedestalY - 4,
    duration: 1700,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut',
  })

  // Locked overlay: dim sprite + padlock
  if (!isOwned) {
    sprite.setAlpha(0.45)

    const lockY = pedestalY
    const lock = scene.add.graphics()
    // Body
    lock.fillStyle(0x000000, 0.6)
    lock.fillRoundedRect(-18, lockY - 6, 36, 28, 4)
    lock.lineStyle(2, fg.primary, 0.85)
    lock.strokeRoundedRect(-18, lockY - 6, 36, 28, 4)
    // Shackle
    lock.lineStyle(3, fg.primary, 0.9)
    lock.beginPath()
    lock.arc(0, lockY - 8, 11, Math.PI, 0)
    lock.strokePath()
    // Keyhole
    lock.fillStyle(fg.primary, 0.85)
    lock.fillCircle(0, lockY + 6, 2.5)
    container.add(lock)
  }

  // ── Skin name + subtitle ──
  const nameY = -hh + 248
  container.add(
    scene.add
      .text(0, nameY, skin.displayName, {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.h3,
        color:      isOwned ? fg.primaryHex : fg.tertiaryHex,
        fontStyle:  '600',
        align:      'center',
        wordWrap:   { width: cw - 24 },
      })
      .setOrigin(0.5),
  )

  container.add(
    scene.add
      .text(0, nameY + 22, skin.subtitle, {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.small,
        color:      isOwned ? fg.tertiaryHex : fg.disabledHex,
        fontStyle:  'italic',
        align:      'center',
        wordWrap:   { width: cw - 28 },
      })
      .setOrigin(0.5),
  )

  // ── Action area (bottom) ──
  const actionY = hh - 38
  const actionW = cw - 28
  const actionH = 36

  if (isEquipped) {
    // EQUIPADA — accent badge
    const eg = scene.add.graphics()
    eg.fillStyle(accent.primary, 0.18)
    eg.fillRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, radii.md)
    eg.lineStyle(1.5, accent.primary, 0.85)
    eg.strokeRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, radii.md)
    container.add(eg)
    container.add(
      scene.add
        .text(0, actionY, '✓  EQUIPADA', {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.small,
          color:      accent.primaryHex,
          fontStyle:  '700',
        })
        .setOrigin(0.5)
        .setLetterSpacing(1.4),
    )
  } else if (isOwned) {
    // EQUIPAR — clickable button
    const btnG = scene.add.graphics()
    const drawBtn = (hover: boolean) => {
      btnG.clear()
      btnG.fillStyle(hover ? state.successDim : surface.deepest, 1)
      btnG.fillRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, radii.md)
      btnG.lineStyle(1.5, state.success, hover ? 1 : 0.7)
      btnG.strokeRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, radii.md)
    }
    drawBtn(false)
    container.add(btnG)

    const btnLabel = scene.add
      .text(0, actionY, 'EQUIPAR', {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.small,
        color:      state.successHex,
        fontStyle:  '700',
      })
      .setOrigin(0.5)
      .setLetterSpacing(1.6)
    container.add(btnLabel)

    const hit = scene.add
      .rectangle(0, actionY, actionW + 8, actionH + 8, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    container.add(hit)
    hit.on('pointerover', () => {
      drawBtn(true)
      btnLabel.setColor(fg.primaryHex)
      scene.tweens.add({ targets: container, scaleX: 1.03, scaleY: 1.03, duration: 120, ease: 'Sine.Out' })
    })
    hit.on('pointerout', () => {
      drawBtn(false)
      btnLabel.setColor(state.successHex)
      scene.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 120, ease: 'Sine.Out' })
    })
    hit.on('pointerdown', () => {
      scene.tweens.add({
        targets: container,
        scaleX: 0.96,
        scaleY: 0.96,
        duration: 80,
        yoyo: true,
        ease: 'Sine.InOut',
        onComplete: onEquip,
      })
    })
  } else {
    // LOCKED — DG price display
    const lg = scene.add.graphics()
    lg.fillStyle(surface.deepest, 1)
    lg.fillRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, radii.md)
    lg.lineStyle(1, border.default, 1)
    lg.strokeRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, radii.md)
    container.add(lg)

    // DG gem icon (violet)
    const gem = scene.add.graphics()
    gem.fillStyle(currency.dgGem, 1)
    gem.fillCircle(-actionW / 2 + 22, actionY, 9)
    gem.lineStyle(1, currency.dgGemEdge, 1)
    gem.strokeCircle(-actionW / 2 + 22, actionY, 9)
    container.add(gem)
    container.add(
      scene.add
        .text(-actionW / 2 + 22, actionY, 'DG', {
          fontFamily: fontFamily.body,
          fontSize:   '8px',
          color:      currency.dgGemEdgeHex,
          fontStyle:  '700',
        })
        .setOrigin(0.5),
    )

    container.add(
      scene.add
        .text(-actionW / 2 + 40, actionY, String(skin.dgPrice), {
          fontFamily: fontFamily.mono,
          fontSize:   typeScale.statMd,
          color:      currency.dgGemHex,
          fontStyle:  '700',
        })
        .setOrigin(0, 0.5),
    )

    container.add(
      scene.add
        .text(actionW / 2 - 12, actionY, 'NA LOJA', {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      fg.tertiaryHex,
          fontStyle:  '700',
        })
        .setOrigin(1, 0.5)
        .setLetterSpacing(1.4),
    )
  }

  return container
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK PREVIEW HELPER (for character cards in the lobby)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convenience helper for lobby cards: draws a small "ALTERAR SKIN" pill that,
 * when clicked, opens the picker for the given class. Returns the pill
 * container so the caller can position it inside their card.
 */
export function makeChangeSkinPill(
  scene: Phaser.Scene,
  classId: CharClass,
  options: { onChange?: () => void; side?: SpriteSide; width?: number } = {},
): Phaser.GameObjects.Container {
  const w = options.width ?? 124
  const h = 22

  const c = scene.add.container(0, 0)

  const g = scene.add.graphics()
  const draw = (hover: boolean) => {
    g.clear()
    g.fillStyle(hover ? surface.raised : surface.deepest, 1)
    g.fillRoundedRect(-w / 2, -h / 2, w, h, radii.md)
    g.lineStyle(1, hover ? accent.primary : border.default, 1)
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, radii.md)
  }
  draw(false)
  c.add(g)

  const label = scene.add
    .text(0, 0, 'ALTERAR SKIN', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.secondaryHex,
      fontStyle:  '700',
    })
    .setOrigin(0.5)
    .setLetterSpacing(1.4)
  c.add(label)

  const hit = scene.add
    .rectangle(0, 0, w + 6, h + 6, 0x000000, 0.001)
    .setInteractive({ useHandCursor: true })
  c.add(hit)

  hit.on('pointerover', () => {
    draw(true)
    label.setColor(accent.primaryHex)
  })
  hit.on('pointerout', () => {
    draw(false)
    label.setColor(fg.secondaryHex)
  })
  hit.on('pointerdown', () => {
    openSkinPicker(scene, classId, {
      side: options.side,
      onChange: () => {
        if (options.onChange) options.onChange()
      },
    })
  })

  return c
}
