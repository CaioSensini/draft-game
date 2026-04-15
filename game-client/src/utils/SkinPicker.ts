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
 *   - Locked skins show a padlock + DG price + "loja" hint
 *   - Calls onChange(newSkinId) right after persisting the choice, so the
 *     calling lobby scene can redraw its character card with the new sprite
 *
 * Visual design follows the AAA conventions used elsewhere in the project:
 *   multi-layer panels, rarity-tinted borders, soft glows, entrance tweens.
 */

import Phaser from 'phaser'
import { C, F, S, SHADOW, SCREEN } from './DesignTokens'
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
   * Which side the preview faces. Defaults to 'left' (turquesa team look).
   * Pass 'right' for purple-team previews so the picker matches the lobby.
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
    fillAlpha: 0.82,
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

  // Soft outer gold halo so the modal pops off the dark backdrop
  const halo = scene.add.graphics()
  halo.fillStyle(C.gold, 0.05)
  halo.fillRoundedRect(-PANEL_W / 2 - 12, -PANEL_H / 2 - 12, PANEL_W + 24, PANEL_H + 24, 18)
  halo.fillStyle(C.gold, 0.03)
  halo.fillRoundedRect(-PANEL_W / 2 - 6, -PANEL_H / 2 - 6, PANEL_W + 12, PANEL_H + 12, 16)
  root.add(halo)

  // Main panel — multi-layer for AAA depth
  const bg = scene.add.graphics()
  // shadow
  bg.fillStyle(0x000000, 0.55)
  bg.fillRoundedRect(-PANEL_W / 2 + 4, -PANEL_H / 2 + 8, PANEL_W, PANEL_H, 14)
  // body
  bg.fillStyle(0x070a12, 0.985)
  bg.fillRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 14)
  // top header strip (slightly lighter)
  bg.fillStyle(0x121724, 0.95)
  bg.fillRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, 70, { tl: 14, tr: 14, bl: 0, br: 0 })
  // gloss highlight on the very top
  bg.fillStyle(0xffffff, 0.05)
  bg.fillRoundedRect(-PANEL_W / 2 + 2, -PANEL_H / 2 + 2, PANEL_W - 4, 32, { tl: 13, tr: 13, bl: 0, br: 0 })
  // bottom darkening
  bg.fillStyle(0x000000, 0.18)
  bg.fillRoundedRect(-PANEL_W / 2 + 2, PANEL_H / 2 - 56, PANEL_W - 4, 54, { tl: 0, tr: 0, bl: 13, br: 13 })
  // outer gold border
  bg.lineStyle(2, C.gold, 0.55)
  bg.strokeRoundedRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 14)
  // inner subtle border
  bg.lineStyle(1, C.goldDim, 0.22)
  bg.strokeRoundedRect(-PANEL_W / 2 + 4, -PANEL_H / 2 + 4, PANEL_W - 8, PANEL_H - 8, 12)
  root.add(bg)

  // ── Header — "ESCOLHER SKIN" + role label ──
  root.add(
    scene.add
      .text(0, -PANEL_H / 2 + 22, 'ESCOLHER SKIN', {
        fontFamily: F.title,
        fontSize: '14px',
        color: C.goldDimHex,
        fontStyle: 'bold',
        shadow: SHADOW.text,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5),
  )

  root.add(
    scene.add
      .text(0, -PANEL_H / 2 + 44, ROLE_LABEL[classId], {
        fontFamily: F.title,
        fontSize: '24px',
        color: C.goldHex,
        fontStyle: 'bold',
        shadow: SHADOW.goldGlow,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5),
  )

  // Decorative divider under the header
  const dividerY = -PANEL_H / 2 + 70
  const dvg = scene.add.graphics()
  dvg.fillStyle(C.goldDim, 0.35)
  dvg.fillRect(-PANEL_W / 2 + 60, dividerY, PANEL_W - 120, 1)
  dvg.fillStyle(C.gold, 0.6)
  dvg.fillRect(-30, dividerY, 60, 1)
  root.add(dvg)

  // ── Close X (top right) ──
  const closeX = scene.add
    .text(PANEL_W / 2 - 24, -PANEL_H / 2 + 32, 'X', {
      fontFamily: F.title,
      fontSize: '20px',
      color: C.mutedHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
  closeX.on('pointerover', () => closeX.setColor('#ff6b6b'))
  closeX.on('pointerout', () => closeX.setColor(C.mutedHex))
  closeX.on('pointerdown', () => close())
  root.add(closeX)

  // ── Cards layer (rebuilt on every equip so visuals stay in sync) ──
  const cardsLayer = scene.add.container(0, 0)
  root.add(cardsLayer)

  // Footer hint text (re-created on each redraw with current state)
  const hintText = scene.add
    .text(0, PANEL_H / 2 - 28, '', {
      fontFamily: F.body,
      fontSize: '13px',
      color: C.mutedHex,
      fontStyle: 'italic',
      shadow: SHADOW.text,
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
        // Equip handler — only fires for owned, non-equipped skins
        const ok = playerData.setEquippedSkin(classId, skin.id)
        if (ok) {
          if (onChange) onChange(skin.id)
          redraw()
        }
      })
      cardsLayer.add(card)

      // Stagger entrance for the cards on first open
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

    // Update the footer hint based on whether anything is locked
    const locked = skins.filter((s) => !playerData.ownsSkin(classId, s.id)).length
    if (locked > 0) {
      hintText.setText(`${locked} skin(s) bloqueada(s) — compre na loja`)
      hintText.setColor(C.mutedHex)
    } else {
      hintText.setText('Todas as skins desbloqueadas — toque para equipar')
      hintText.setColor(C.successHex)
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

  // ── Background — multi-layer card with rarity tint ──
  const bg = scene.add.graphics()

  // Drop shadow
  bg.fillStyle(0x000000, 0.55)
  bg.fillRoundedRect(-hw + 3, -hh + 5, cw, ch, 12)

  // Body
  bg.fillStyle(0x0a0e18, 1)
  bg.fillRoundedRect(-hw, -hh, cw, ch, 12)

  // Rarity colour wash on top half
  bg.fillStyle(rarityColor, isOwned ? 0.1 : 0.05)
  bg.fillRoundedRect(-hw, -hh, cw, ch * 0.55, { tl: 12, tr: 12, bl: 0, br: 0 })

  // Glass sheen
  bg.fillStyle(0xffffff, 0.04)
  bg.fillRoundedRect(-hw + 3, -hh + 3, cw - 6, 28, { tl: 11, tr: 11, bl: 0, br: 0 })

  // Bottom darkening
  bg.fillStyle(0x000000, 0.22)
  bg.fillRoundedRect(-hw + 2, hh - 70, cw - 4, 68, { tl: 0, tr: 0, bl: 11, br: 11 })

  // Border — gold if equipped, rarity colour if owned, dim grey if locked
  let borderColor = 0x2a2e3a
  let borderAlpha = 0.4
  if (isEquipped) {
    borderColor = C.gold
    borderAlpha = 0.9
  } else if (isOwned) {
    borderColor = rarityColor
    borderAlpha = 0.6
  }
  bg.lineStyle(2.5, borderColor, borderAlpha)
  bg.strokeRoundedRect(-hw, -hh, cw, ch, 12)
  // Inner accent line for crisp polish
  bg.lineStyle(1, borderColor, borderAlpha * 0.4)
  bg.strokeRoundedRect(-hw + 4, -hh + 4, cw - 8, ch - 8, 10)
  container.add(bg)

  // ── Rarity badge (top center) ──
  const badgeW = 96
  const badgeH = 22
  const badgeY = -hh + 16
  const bbg = scene.add.graphics()
  bbg.fillStyle(0x000000, 0.55)
  bbg.fillRoundedRect(-badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 6)
  bbg.fillStyle(rarityColor, isOwned ? 0.32 : 0.16)
  bbg.fillRoundedRect(-badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 6)
  bbg.lineStyle(1.2, rarityColor, isOwned ? 0.85 : 0.4)
  bbg.strokeRoundedRect(-badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 6)
  container.add(bbg)

  container.add(
    scene.add
      .text(0, badgeY, rarityLabel, {
        fontFamily: F.title,
        fontSize: '11px',
        color: rarityHex,
        fontStyle: 'bold',
        shadow: SHADOW.text,
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5),
  )

  // ── Pedestal glow under the preview ──
  const pedestalY = -hh + 168
  const ped = scene.add.graphics()
  ped.fillStyle(rarityColor, isOwned ? 0.2 : 0.08)
  ped.fillEllipse(0, pedestalY + 60, cw * 0.62, 22)
  ped.fillStyle(rarityColor, isOwned ? 0.1 : 0.04)
  ped.fillEllipse(0, pedestalY + 60, cw * 0.78, 30)
  container.add(ped)

  // ── Character preview sprite (the actual skin asset) ──
  const sprite = drawCharacterSprite(scene, skin.classId as SpriteRole, side, 110, skin.id)
  sprite.setPosition(0, pedestalY)
  container.add(sprite)

  // Subtle bob so the preview feels alive
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
    lock.lineStyle(2, 0xffffff, 0.85)
    lock.strokeRoundedRect(-18, lockY - 6, 36, 28, 4)
    // Shackle
    lock.lineStyle(3, 0xffffff, 0.9)
    lock.beginPath()
    lock.arc(0, lockY - 8, 11, Math.PI, 0)
    lock.strokePath()
    // Keyhole
    lock.fillStyle(0xffffff, 0.85)
    lock.fillCircle(0, lockY + 6, 2.5)
    container.add(lock)
  }

  // ── Skin name + subtitle ──
  const nameY = -hh + 248
  container.add(
    scene.add
      .text(0, nameY, skin.displayName, {
        fontFamily: F.title,
        fontSize: '17px',
        color: isOwned ? '#ffffff' : C.mutedHex,
        fontStyle: 'bold',
        shadow: SHADOW.text,
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
        wordWrap: { width: cw - 24 },
      })
      .setOrigin(0.5),
  )

  container.add(
    scene.add
      .text(0, nameY + 22, skin.subtitle, {
        fontFamily: F.body,
        fontSize: '11px',
        color: isOwned ? C.mutedHex : C.dimHex,
        fontStyle: 'italic',
        shadow: SHADOW.text,
        align: 'center',
        wordWrap: { width: cw - 28 },
      })
      .setOrigin(0.5),
  )

  // ── Action area (bottom) ──
  const actionY = hh - 38
  const actionW = cw - 28
  const actionH = 36

  if (isEquipped) {
    // EQUIPADA — glowing gold badge
    const eg = scene.add.graphics()
    eg.fillStyle(C.gold, 0.18)
    eg.fillRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, 8)
    eg.lineStyle(1.5, C.gold, 0.85)
    eg.strokeRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, 8)
    container.add(eg)
    container.add(
      scene.add
        .text(0, actionY, '✓  EQUIPADA', {
          fontFamily: F.title,
          fontSize: '14px',
          color: C.goldHex,
          fontStyle: 'bold',
          shadow: SHADOW.goldGlow,
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5),
    )
  } else if (isOwned) {
    // EQUIPAR — clickable button
    const btnG = scene.add.graphics()
    const drawBtn = (hover: boolean) => {
      btnG.clear()
      btnG.fillStyle(hover ? 0x244534 : 0x18301f, 1)
      btnG.fillRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, 8)
      btnG.lineStyle(2, C.success, hover ? 0.95 : 0.7)
      btnG.strokeRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, 8)
      btnG.fillStyle(0xffffff, hover ? 0.07 : 0.04)
      btnG.fillRoundedRect(-actionW / 2 + 2, actionY - actionH / 2 + 2, actionW - 4, 14, { tl: 7, tr: 7, bl: 0, br: 0 })
    }
    drawBtn(false)
    container.add(btnG)

    const btnLabel = scene.add
      .text(0, actionY, 'EQUIPAR', {
        fontFamily: F.title,
        fontSize: '14px',
        color: C.successHex,
        fontStyle: 'bold',
        shadow: SHADOW.text,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
    container.add(btnLabel)

    const hit = scene.add
      .rectangle(0, actionY, actionW + 8, actionH + 8, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    container.add(hit)
    hit.on('pointerover', () => {
      drawBtn(true)
      btnLabel.setColor('#a8f7c0')
      scene.tweens.add({ targets: container, scaleX: 1.03, scaleY: 1.03, duration: 120, ease: 'Sine.Out' })
    })
    hit.on('pointerout', () => {
      drawBtn(false)
      btnLabel.setColor(C.successHex)
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
    lg.fillStyle(0x12161f, 1)
    lg.fillRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, 8)
    lg.lineStyle(1.5, C.goldDim, 0.45)
    lg.strokeRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, 8)
    container.add(lg)

    // DG coin
    const coin = scene.add.graphics()
    coin.fillStyle(C.gold, 1)
    coin.fillCircle(-actionW / 2 + 22, actionY, 9)
    coin.lineStyle(1.5, C.goldDark, 1)
    coin.strokeCircle(-actionW / 2 + 22, actionY, 9)
    container.add(coin)
    container.add(
      scene.add
        .text(-actionW / 2 + 22, actionY, 'DG', {
          fontFamily: F.title,
          fontSize: '8px',
          color: C.goldDarkHex,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    )

    container.add(
      scene.add
        .text(-actionW / 2 + 40, actionY, String(skin.dgPrice), {
          fontFamily: F.title,
          fontSize: '15px',
          color: C.goldHex,
          fontStyle: 'bold',
          shadow: SHADOW.text,
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0, 0.5),
    )

    container.add(
      scene.add
        .text(actionW / 2 - 12, actionY, 'NA LOJA', {
          fontFamily: F.title,
          fontSize: '11px',
          color: C.mutedHex,
          fontStyle: 'bold',
          shadow: SHADOW.text,
        })
        .setOrigin(1, 0.5),
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
 *
 * Pass `parentCard` so the pill can be added to it. The picker callback will
 * fire `onChange` so the lobby can rebuild its card visuals.
 */
export function makeChangeSkinPill(
  scene: Phaser.Scene,
  classId: CharClass,
  options: { onChange?: () => void; side?: SpriteSide; width?: number } = {},
): Phaser.GameObjects.Container {
  const w = options.width ?? 120
  const h = 24

  const c = scene.add.container(0, 0)

  const g = scene.add.graphics()
  const draw = (hover: boolean) => {
    g.clear()
    g.fillStyle(hover ? 0x1a1808 : 0x0e1420, 0.95)
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 5)
    g.lineStyle(1.2, hover ? C.gold : C.goldDim, hover ? 0.85 : 0.5)
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 5)
  }
  draw(false)
  c.add(g)

  const label = scene.add
    .text(0, 0, '✦  ALTERAR SKIN', {
      fontFamily: F.title,
      fontSize: '11px',
      color: C.goldDimHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
      stroke: '#000000',
      strokeThickness: 2,
    })
    .setOrigin(0.5)
  c.add(label)

  const hit = scene.add
    .rectangle(0, 0, w + 6, h + 6, 0x000000, 0.001)
    .setInteractive({ useHandCursor: true })
  c.add(hit)

  hit.on('pointerover', () => {
    draw(true)
    label.setColor(C.goldHex)
  })
  hit.on('pointerout', () => {
    draw(false)
    label.setColor(C.goldDimHex)
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

// silence unused-import warning when consumers only use openSkinPicker
void S
void H
