/**
 * CustomLobbyScene.ts -- Custom match lobby.
 * Two vertically stacked team panels (Blue / Red), mode selector, swap team.
 *
 * Mode rules:
 *   - SOLO: 1 player per side (controls 4 chars). Max 2 players total.
 *   - DUO: 2 players per side (each controls 2 chars). Max 4 players total.
 *   - SQUAD: 4 players per side (each controls 1 char). Max 8 players total.
 *   - Lower modes lock when too many players for them.
 */

import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import { drawCharacterSprite, type SpriteRole, type SpriteSide } from '../utils/SpriteFactory'
import { openSkinPicker } from '../utils/SkinPicker'
import { showPlayModesOverlay } from '../utils/PlayModesOverlay'
import type { UnitRole } from '../engine/types'
import type { CharClass } from '../utils/AssetPaths'
import {
  SCREEN, surface, border, fg, accent, state,
  colors, fontFamily, typeScale, radii,
} from '../utils/DesignTokens'

const W = SCREEN.W
const H = SCREEN.H

const ROLES: UnitRole[] = ['king', 'warrior', 'specialist', 'executor']
const ROLE_LABELS: Record<UnitRole, string> = {
  king: 'REI', warrior: 'GUERREIRO', specialist: 'ESPECIALISTA', executor: 'EXECUTOR',
}
const CLASS_ACCENT: Record<UnitRole, number> = {
  king:       colors.class.king,
  warrior:    colors.class.warrior,
  specialist: colors.class.specialist,
  executor:   colors.class.executor,
}
const CLASS_ACCENT_HEX: Record<UnitRole, string> = {
  king:       colors.class.kingHex,
  warrior:    colors.class.warriorHex,
  specialist: colors.class.specialistHex,
  executor:   colors.class.executorHex,
}

type SlotOccupant = 'me' | 'friend' | 'empty'
interface CustomSlot { role: UnitRole; occupant: SlotOccupant; playerName: string | null }

type MatchMode = 'solo' | 'duo' | 'squad'
const SLOTS_PER_PLAYER: Record<MatchMode, number> = { solo: 4, duo: 2, squad: 1 }
const MAX_PLAYERS: Record<MatchMode, number> = { solo: 2, duo: 4, squad: 8 }

let _savedMode: MatchMode = 'solo'
let _savedSide: 'blue' | 'red' = 'blue'
let _savedBlue: CustomSlot[] | null = null
let _savedRed: CustomSlot[] | null = null

// Layout
const TOP_H = 56
const TEAM_PANEL_X = 40
const TEAM_PANEL_W = 880
const TEAM_PANEL_H = 250
const BLUE_PANEL_Y = TOP_H + 16
const RED_PANEL_Y  = TOP_H + 16 + TEAM_PANEL_H + 50
const LOG_X = W - 200
const LOG_W = 200
const LOG_H = 260

export default class CustomLobbyScene extends Phaser.Scene {
  private blueSlots: CustomSlot[] = []
  private redSlots: CustomSlot[] = []
  private matchMode: MatchMode = 'solo'
  private playerSide: 'blue' | 'red' = 'blue'
  private blueCards: Phaser.GameObjects.Container[] = []
  private redCards: Phaser.GameObjects.Container[] = []
  private _swapHighlights: Phaser.GameObjects.GameObject[] = []

  constructor() { super('CustomLobbyScene') }

  create(): void {
    this.blueCards = []; this.redCards = []
    this._swapHighlights = []
    this.matchMode = _savedMode; this.playerSide = _savedSide
    if (_savedBlue && _savedRed) {
      this.blueSlots = _savedBlue; this.redSlots = _savedRed
      _savedBlue = null; _savedRed = null
    } else {
      this._rebuildSlots()
    }

    UI.background(this, { vignette: false, diagonalPattern: false, streaks: false })
    UI.fadeIn(this)

    this._drawHeader()
    this._drawBlueTeamPanel()
    this._drawRedTeamPanel()
    this._drawSwapTeamButton()
    this._drawRoomLog()
    this._drawStartButton()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLOT LOGIC (preserved)
  // ═══════════════════════════════════════════════════════════════════════════

  private _rebuildSlots(): void {
    const name = playerData.get().username || 'Jogador'
    this.blueSlots = ROLES.map(r => ({ role: r, occupant: 'empty' as SlotOccupant, playerName: null }))
    this.redSlots  = ROLES.map(r => ({ role: r, occupant: 'empty' as SlotOccupant, playerName: null }))
    const count = SLOTS_PER_PLAYER[this.matchMode]
    const target = this.playerSide === 'blue' ? this.blueSlots : this.redSlots
    for (let i = 0; i < count && i < 4; i++) { target[i].occupant = 'me'; target[i].playerName = name }
  }

  private _totalPlayers(): number {
    return [...this.blueSlots, ...this.redSlots].filter(s => s.occupant === 'me' || s.occupant === 'friend').length
  }

  private _isModeAvailable(mode: MatchMode): boolean {
    const total = this._totalPlayers()
    if (mode === 'solo' && total > 2) return false
    if (mode === 'duo' && total > 4) return false
    return true
  }

  private _swapTeam(): void {
    const newSide = this.playerSide === 'blue' ? 'red' : 'blue'
    const fromSlots = this.playerSide === 'blue' ? this.blueSlots : this.redSlots
    const toSlots = newSide === 'blue' ? this.blueSlots : this.redSlots
    const count = SLOTS_PER_PLAYER[this.matchMode]
    const name = playerData.get().username || 'Jogador'

    const targetIdxs: number[] = []
    for (let i = 0; i < 4 && targetIdxs.length < count; i++) {
      if (toSlots[i].occupant === 'empty') targetIdxs.push(i)
    }
    if (targetIdxs.length < count) {
      for (let i = 0; i < 4 && targetIdxs.length < count; i++) {
        if (toSlots[i].occupant !== 'me' && toSlots[i].occupant !== 'friend' && !targetIdxs.includes(i)) {
          targetIdxs.push(i)
        }
      }
    }

    if (targetIdxs.length === 0) return

    for (const s of fromSlots) { if (s.occupant === 'me') { s.occupant = 'empty'; s.playerName = null } }
    for (let n = 0; n < count && n < targetIdxs.length; n++) {
      toSlots[targetIdxs[n]].occupant = 'me'
      toSlots[targetIdxs[n]].playerName = name
    }

    _savedSide = newSide
    _savedMode = this.matchMode
    _savedBlue = this.blueSlots.map(s => ({ ...s }))
    _savedRed = this.redSlots.map(s => ({ ...s }))
    this.scene.restart()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawHeader(): void {
    const bar = this.add.graphics()
    bar.fillStyle(surface.panel, 1)
    bar.fillRect(0, 0, W, TOP_H)
    bar.lineStyle(1, border.subtle, 1)
    bar.beginPath()
    bar.moveTo(0, TOP_H - 0.5)
    bar.lineTo(W, TOP_H - 0.5)
    bar.strokePath()

    UI.backArrow(this, () => {
      _savedMode = 'solo'; _savedSide = 'blue'
      _savedBlue = null; _savedRed = null
      transitionTo(this, 'LobbyScene')
    })

    // Eyebrow + title (centered)
    this.add.text(W / 2, TOP_H / 2 - 10, 'CUSTOM', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8)

    this.add.text(W / 2, TOP_H / 2 + 10, 'PARTIDA PERSONALIZADA', {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '600',
    }).setOrigin(0.5).setLetterSpacing(3)

    // Mode switcher "ALTERAR MODO" (left-center)
    UI.buttonGhost(this, 156, TOP_H / 2, 'ALTERAR MODO', {
      w: 160,
      h: 32,
      onPress: () => this._showModeSwitcher(),
    })

    // Mode selector (right) — 3 pill segments: SOLO / DUO / SQUAD
    const modes: Array<{ key: MatchMode; label: string }> = [
      { key: 'solo',  label: 'SOLO'  },
      { key: 'duo',   label: 'DUO'   },
      { key: 'squad', label: 'SQUAD' },
    ]
    const segW = 68
    const segH = 28
    const gap = 4
    const totalW = modes.length * segW + (modes.length - 1) * gap
    const startX = W - 24 - totalW
    const segY = TOP_H / 2

    modes.forEach((m, i) => {
      const mx = startX + i * (segW + gap)
      const active = m.key === this.matchMode
      const available = this._isModeAvailable(m.key)
      const locked = !available && !active

      const bg = this.add.graphics()
      const drawSeg = (hover: boolean) => {
        bg.clear()
        bg.fillStyle(active ? surface.raised : surface.panel, locked ? 0.5 : 1)
        bg.fillRoundedRect(mx, segY - segH / 2, segW, segH, radii.md)
        bg.lineStyle(1, active ? accent.primary : hover ? border.strong : border.default, locked ? 0.4 : 1)
        bg.strokeRoundedRect(mx, segY - segH / 2, segW, segH, radii.md)
      }
      drawSeg(false)

      const labelColor = active ? accent.primaryHex : locked ? fg.disabledHex : fg.secondaryHex
      const label = this.add.text(mx + segW / 2, segY, m.label, {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      labelColor,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.4)

      if (!locked) {
        const hit = this.add.rectangle(mx + segW / 2, segY, segW, segH, 0, 0.001)
          .setInteractive({ useHandCursor: true })
        hit.on('pointerover', () => { if (!active) { drawSeg(true); label.setColor(fg.primaryHex) } })
        hit.on('pointerout',  () => { if (!active) { drawSeg(false); label.setColor(fg.secondaryHex) } })
        hit.on('pointerdown', () => {
          if (m.key === this.matchMode) return
          _savedMode = m.key; _savedSide = this.playerSide
          _savedBlue = null; _savedRed = null
          this.scene.restart()
        })
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM PANELS
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawBlueTeamPanel(): void {
    this._drawTeamPanel({
      panelY: BLUE_PANEL_Y,
      teamColor: colors.team.ally,
      teamColorHex: colors.team.allyHex,
      title: 'TIME AZUL',
      slots: this.blueSlots,
      cardContainers: this.blueCards,
      side: 'blue',
    })
  }

  private _drawRedTeamPanel(): void {
    this._drawTeamPanel({
      panelY: RED_PANEL_Y,
      teamColor: colors.team.enemy,
      teamColorHex: colors.team.enemyHex,
      title: 'TIME VERMELHO',
      slots: this.redSlots,
      cardContainers: this.redCards,
      side: 'red',
    })
  }

  private _drawTeamPanel(opts: {
    panelY: number
    teamColor: number
    teamColorHex: string
    title: string
    slots: CustomSlot[]
    cardContainers: Phaser.GameObjects.Container[]
    side: 'blue' | 'red'
  }): void {
    const { panelY, teamColor, teamColorHex, title, slots, cardContainers, side } = opts
    const panelX = TEAM_PANEL_X

    // Panel frame
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(panelX, panelY, TEAM_PANEL_W, TEAM_PANEL_H, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(panelX, panelY, TEAM_PANEL_W, TEAM_PANEL_H, radii.lg)
    // Team accent top stripe
    bg.fillStyle(teamColor, 0.7)
    bg.fillRect(panelX + 16, panelY, TEAM_PANEL_W - 32, 2)
    // Top inset highlight
    bg.fillStyle(0xffffff, 0.04)
    bg.fillRect(panelX + 1, panelY + 2, TEAM_PANEL_W - 2, 1)

    // Title
    this.add.text(panelX + 24, panelY + 20, title, {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      teamColorHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    // Playing-side indicator
    if (this.playerSide === side) {
      this.add.text(panelX + TEAM_PANEL_W - 24, panelY + 20, 'SEU TIME', {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      accent.primaryHex,
        fontStyle:  '700',
      }).setOrigin(1, 0.5).setLetterSpacing(1.8)
    }

    this._drawCards(panelX + TEAM_PANEL_W / 2, panelY + 40, slots, cardContainers, side)
  }

  private _drawCards(
    centerX: number,
    topY: number,
    slots: CustomSlot[],
    cardContainers: Phaser.GameObjects.Container[],
    side: 'blue' | 'red',
  ): void {
    cardContainers.forEach(c => c.destroy())
    cardContainers.length = 0

    const cardW = 200
    const cardH = 196
    const gap = 14
    const totalW = 4 * cardW + 3 * gap
    const startX = centerX - totalW / 2 + cardW / 2
    const cardCenterY = topY + cardH / 2 + 6

    const teamSide: SpriteSide = side === 'blue' ? 'left' : 'right'

    slots.forEach((slot, i) => {
      const cx = startX + i * (cardW + gap)
      const container = this.add.container(cx, cardCenterY)
      cardContainers.push(container)
      const classAccent = CLASS_ACCENT[slot.role]
      const classAccentHex = CLASS_ACCENT_HEX[slot.role]
      const isMe = slot.occupant === 'me'
      const isFriend = slot.occupant === 'friend'
      const isFilled = isMe || isFriend

      // Card frame
      const bg = this.add.graphics()
      bg.fillStyle(surface.raised, 1)
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, radii.lg)
      bg.fillStyle(classAccent, 0.14)
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, 38,
        { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })
      const borderColor = isMe ? classAccent : isFilled ? border.default : border.subtle
      bg.lineStyle(1, borderColor, 1)
      bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, radii.lg)
      container.add(bg)

      // Class label
      container.add(this.add.text(0, -cardH / 2 + 19, ROLE_LABELS[slot.role], {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      classAccentHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.8))

      // Sprite + pedestal
      const skinId = isMe ? playerData.getEquippedSkin(slot.role as CharClass) : 'idle'
      const ped = this.add.graphics()
      ped.fillStyle(classAccent, isMe ? 0.24 : 0.12)
      ped.fillEllipse(0, -cardH / 2 + 108, cardW * 0.55, 10)
      container.add(ped)
      const sprite = drawCharacterSprite(this, slot.role as SpriteRole, teamSide, 68, skinId)
      sprite.setPosition(0, -cardH / 2 + 70)
      container.add(sprite)

      // Name + status
      const nameY = -cardH / 2 + 128
      let nameText = 'Bot'
      let nameColor: string = fg.tertiaryHex
      let subText: string | null = null
      if (isMe) {
        nameText = slot.playerName ?? 'Jogador'
        nameColor = fg.primaryHex
        subText = 'VOCÊ'
      } else if (isFriend) {
        nameText = slot.playerName ?? 'Amigo'
        nameColor = state.infoHex
        subText = 'AMIGO'
      } else {
        subText = 'BOT'
      }

      container.add(this.add.text(0, nameY, nameText, {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.h3,
        color:      nameColor,
        fontStyle:  '600',
      }).setOrigin(0.5))

      if (subText) {
        const pillW = 48
        const pillY = nameY + 18
        const pillColor = isMe ? state.success : isFriend ? state.info : border.strong
        const pillColorHex = isMe ? state.successHex : isFriend ? state.infoHex : fg.disabledHex
        const pillBg = this.add.graphics()
        pillBg.fillStyle(isMe ? state.successDim : surface.deepest, 1)
        pillBg.fillRoundedRect(-pillW / 2, pillY - 8, pillW, 16, radii.sm)
        pillBg.lineStyle(1, pillColor, 1)
        pillBg.strokeRoundedRect(-pillW / 2, pillY - 8, pillW, 16, radii.sm)
        container.add(pillBg)
        container.add(this.add.text(0, pillY, subText, {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      pillColorHex,
          fontStyle:  '700',
        }).setOrigin(0.5).setLetterSpacing(1.4))
      }

      // ALTERAR SKIN pill (only on player's own cards)
      if (isMe) {
        const pillW = 124
        const pillH = 22
        const pillY = cardH / 2 - 18
        const pillG = this.add.graphics()
        const drawPill = (hover: boolean) => {
          pillG.clear()
          pillG.fillStyle(hover ? surface.raised : surface.deepest, 1)
          pillG.fillRoundedRect(-pillW / 2, pillY - pillH / 2, pillW, pillH, radii.md)
          pillG.lineStyle(1, hover ? accent.primary : border.default, 1)
          pillG.strokeRoundedRect(-pillW / 2, pillY - pillH / 2, pillW, pillH, radii.md)
        }
        drawPill(false)
        container.add(pillG)

        const pillLabel = this.add.text(0, pillY, 'ALTERAR SKIN', {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      fg.secondaryHex,
          fontStyle:  '700',
        }).setOrigin(0.5).setLetterSpacing(1.4)
        container.add(pillLabel)

        const pillHit = this.add.rectangle(0, pillY, pillW + 8, pillH + 8, 0x000000, 0.001)
          .setInteractive({ useHandCursor: true })
        container.add(pillHit)
        pillHit.on('pointerover', () => { drawPill(true); pillLabel.setColor(accent.primaryHex) })
        pillHit.on('pointerout',  () => { drawPill(false); pillLabel.setColor(fg.secondaryHex) })
        pillHit.on('pointerdown', () => {
          openSkinPicker(this, slot.role as CharClass, {
            side: teamSide,
            onChange: () => this._drawCards(centerX, topY, slots, cardContainers, side),
          })
        })
      }

      // Swap within-team button (duo/squad only, top-right)
      if (isMe && this.matchMode !== 'solo') {
        this._drawSwapIcon(container, cardW, cardH, slots, i, cardContainers)
      }

      container.setAlpha(0).setScale(0.94)
      this.tweens.add({
        targets: container,
        alpha: 1, scaleX: 1, scaleY: 1,
        duration: 280, delay: 80 + i * 60, ease: 'Back.easeOut',
      })
    })
  }

  /** Draw a circular swap icon on a card for changing role within the team. */
  private _drawSwapIcon(
    container: Phaser.GameObjects.Container,
    cardW: number,
    cardH: number,
    slots: CustomSlot[],
    slotIdx: number,
    cardContainers: Phaser.GameObjects.Container[],
  ): void {
    const btnR = 13
    const bx = cardW / 2 - 18
    const by = -cardH / 2 + 19

    const btnBg = this.add.graphics()
    const drawBg = (hover: boolean) => {
      btnBg.clear()
      btnBg.fillStyle(hover ? surface.raised : surface.deepest, 1)
      btnBg.fillCircle(bx, by, btnR)
      btnBg.lineStyle(1, hover ? accent.primary : state.info, 1)
      btnBg.strokeCircle(bx, by, btnR)
    }
    drawBg(false)
    container.add(btnBg)

    const icon = this.add.text(bx, by, '⇄', {
      fontFamily: fontFamily.body,
      fontSize:   '16px',
      color:      state.infoHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    container.add(icon)

    const hit = this.add.rectangle(bx, by, btnR * 2.5, btnR * 2.5, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    container.add(hit)
    hit.on('pointerover', () => { drawBg(true); icon.setColor(accent.primaryHex) })
    hit.on('pointerout',  () => { drawBg(false); icon.setColor(state.infoHex) })
    hit.on('pointerdown', () => this._onSwapRole(slots, slotIdx, cardContainers))
  }

  /** Show highlighted swap targets -- player clicks one to confirm swap. */
  private _onSwapRole(
    slots: CustomSlot[],
    myIdx: number,
    cardContainers: Phaser.GameObjects.Container[],
  ): void {
    this._clearSwapHighlights()

    const targets: number[] = []
    for (let i = 0; i < 4; i++) {
      if (i !== myIdx && slots[i].occupant !== 'me' && slots[i].occupant !== 'friend') targets.push(i)
    }
    if (targets.length === 0) return

    const cancelOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.2)
      .setInteractive().setDepth(14)
    cancelOverlay.on('pointerdown', () => this._clearSwapHighlights())
    this._swapHighlights.push(cancelOverlay)

    for (const tIdx of targets) {
      const card = cardContainers[tIdx]
      if (!card) continue
      const { x, y } = card

      const hl = this.add.rectangle(x, y, 208, 204, accent.primary, 0.12)
        .setStrokeStyle(2, accent.primary, 0.65).setDepth(15)
      this.tweens.add({ targets: hl, alpha: { from: 0.08, to: 0.22 }, duration: 520, yoyo: true, repeat: -1 })
      this._swapHighlights.push(hl)

      const txt = this.add.text(x, y + 64, 'TROCAR', {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      accent.primaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.8).setDepth(16)
      this._swapHighlights.push(txt)

      const hit = this.add.rectangle(x, y, 208, 204, 0, 0.001)
        .setInteractive({ useHandCursor: true }).setDepth(17)
      this._swapHighlights.push(hit)
      hit.on('pointerdown', () => {
        const tmpOcc = slots[myIdx].occupant
        const tmpName = slots[myIdx].playerName
        slots[myIdx].occupant = slots[tIdx].occupant
        slots[myIdx].playerName = slots[tIdx].playerName
        slots[tIdx].occupant = tmpOcc
        slots[tIdx].playerName = tmpName
        _savedMode = this.matchMode; _savedSide = this.playerSide
        _savedBlue = this.blueSlots.map(s => ({ ...s }))
        _savedRed = this.redSlots.map(s => ({ ...s }))
        this.scene.restart()
      })
    }
  }

  private _clearSwapHighlights(): void {
    for (const obj of this._swapHighlights) obj.destroy()
    this._swapHighlights = []
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWAP TEAM BUTTON (between the two panels)
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawSwapTeamButton(): void {
    const cx = TEAM_PANEL_X + TEAM_PANEL_W / 2
    const cy = BLUE_PANEL_Y + TEAM_PANEL_H + 25
    UI.buttonSecondary(this, cx, cy, '⇅  TROCAR DE TIME', {
      w: 200,
      h: 36,
      onPress: () => this._swapTeam(),
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM LOG (right side)
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawRoomLog(): void {
    const logX = LOG_X
    const logY = BLUE_PANEL_Y

    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(logX - LOG_W / 2, logY, LOG_W, LOG_H, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(logX - LOG_W / 2, logY, LOG_W, LOG_H, radii.lg)
    bg.fillStyle(accent.primary, 0.45)
    bg.fillRect(logX - LOG_W / 2 + 16, logY, LOG_W - 32, 1)

    const total = this._totalPlayers()
    const max = MAX_PLAYERS[this.matchMode]
    this.add.text(logX, logY + 18, `SALA ${total}/${max}`, {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8)

    // Mode readout
    this.add.text(logX, logY + 38, this.matchMode.toUpperCase(), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.4)

    // Divider
    const div = this.add.graphics()
    div.fillStyle(border.subtle, 1)
    div.fillRect(logX - LOG_W / 2 + 20, logY + 56, LOG_W - 40, 1)

    // List all human players
    let y = logY + 74
    const allSlots = [
      ...this.blueSlots.map(s => ({ ...s, side: 'blue' as const })),
      ...this.redSlots.map(s => ({ ...s, side: 'red' as const })),
    ]
    const seen = new Set<string>()
    for (const s of allSlots) {
      if ((s.occupant === 'me' || s.occupant === 'friend') && s.playerName && !seen.has(s.playerName)) {
        seen.add(s.playerName)
        const teamColor = s.side === 'blue' ? colors.team.ally : colors.team.enemy
        const teamColorHex = s.side === 'blue' ? colors.team.allyHex : colors.team.enemyHex
        const teamLabel = s.side === 'blue' ? 'AZUL' : 'VERM'

        const dot = this.add.graphics()
        dot.fillStyle(teamColor, 1)
        dot.fillCircle(logX - LOG_W / 2 + 22, y, 4)

        this.add.text(logX - LOG_W / 2 + 36, y, s.playerName, {
          fontFamily: fontFamily.serif,
          fontSize:   typeScale.small,
          color:      s.occupant === 'me' ? accent.primaryHex : fg.primaryHex,
          fontStyle:  s.occupant === 'me' ? '700' : '500',
        }).setOrigin(0, 0.5)

        this.add.text(logX + LOG_W / 2 - 14, y, teamLabel, {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      teamColorHex,
          fontStyle:  '700',
        }).setOrigin(1, 0.5).setLetterSpacing(1.2)

        y += 24
      }
    }

    // Invite button below
    const invY = logY + LOG_H + 20
    UI.buttonSecondary(this, logX, invY, 'CONVIDAR AMIGO', {
      w: 184,
      h: 36,
      onPress: () => this._showInvitePopup(),
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // START BUTTON (bottom center)
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawStartButton(): void {
    const btnX = W / 2
    const btnY = H - 56

    UI.buttonPrimary(this, btnX, btnY, 'INICIAR BATALHA', {
      size: 'lg',
      w:    340,
      h:    56,
      onPress: () => {
        const side = this.playerSide === 'blue' ? 'left' : 'right'
        const mySlots = (this.playerSide === 'blue' ? this.blueSlots : this.redSlots)
          .filter(s => s.occupant === 'me')
        const prefix = side === 'left' ? 'l' : 'r'
        const charIds = mySlots.map(s => `${prefix}${s.role}`)
        const playerCharIds = charIds.length < 4 ? charIds : undefined

        const teamSlots = this.playerSide === 'blue' ? this.blueSlots : this.redSlots
        const humanCount = teamSlots.filter(s => s.occupant === 'me' || s.occupant === 'friend').length

        transitionTo(this, 'BattleScene', {
          deckConfig: playerData.getDeckConfig(),
          skinConfig: playerData.getSkinConfig(),
          pveMode: 'custom', difficulty: 'normal',
          playerSide: side,
          playerCharIds,
          playersPerSide: humanCount,
        }, 400, 'wipeRight')
      },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE SWITCHER OVERLAY
  // ═══════════════════════════════════════════════════════════════════════════

  private _showModeSwitcher(): void {
    showPlayModesOverlay(this, {
      title: 'ALTERAR MODO',
      currentTarget: 'CustomLobbyScene',
      dimSceneBackground: true,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVITE POPUP
  // ═══════════════════════════════════════════════════════════════════════════

  private _showInvitePopup(): void {
    UI.modal(this, {
      eyebrow: 'PRÓXIMAMENTE',
      title:   'CONVITE DE AMIGO',
      body:    'O sistema de convites está em desenvolvimento. Por enquanto, adicione bots ao seu time.',
      actions: [{ label: 'OK', kind: 'primary', onClick: () => {} }],
    })
  }

  shutdown(): void {
    this.tweens.killAll()
  }
}
