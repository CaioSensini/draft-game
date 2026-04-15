/**
 * CustomLobbyScene.ts -- Custom match lobby.
 * Same layout as PvPLobbyScene but with two team panels.
 *
 * Mode rules:
 *   - SOLO: 1 player per side (controls 4 chars). Max 2 players total.
 *   - DUO: 2 players per side (each controls 2 chars). Max 4 players total.
 *   - SQUAD: 4 players per side (each controls 1 char). Max 8 players total.
 *   - Modes auto-upgrade when more players join.
 *   - Lower modes lock when too many players for them.
 */

import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import { C, F, S, SHADOW, SCREEN } from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import { drawCharacterSprite, type SpriteRole, type SpriteSide } from '../utils/SpriteFactory'
import { openSkinPicker } from '../utils/SkinPicker'
import { showPlayModesOverlay } from '../utils/PlayModesOverlay'
import type { UnitRole } from '../engine/types'
import type { CharClass } from '../utils/AssetPaths'

const W = SCREEN.W
const H = SCREEN.H

const ROLES: UnitRole[] = ['king', 'warrior', 'specialist', 'executor']
const ROLE_LABELS: Record<UnitRole, string> = {
  king: 'REI', warrior: 'GUERREIRO', specialist: 'ESPECIALISTA', executor: 'EXECUTOR',
}
const CLASS_ACCENTS: Record<UnitRole, number> = {
  king: C.king, warrior: C.warrior, specialist: C.specialist, executor: C.executor,
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
    this.matchMode = _savedMode; this.playerSide = _savedSide
    if (_savedBlue && _savedRed) {
      this.blueSlots = _savedBlue; this.redSlots = _savedRed
      _savedBlue = null; _savedRed = null
    } else {
      this._rebuildSlots()
    }

    UI.background(this)
    UI.particles(this, 12)
    UI.fadeIn(this)

    this._drawHeader()
    this._drawBlueTeamPanel()
    this._drawSwapTeamButton()
    this._drawRedTeamPanel()
    this._drawRoomLog()
    this._drawStartButton()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SLOT LOGIC
  // ═══════════════════════════════════════════════════════════════════════════

  private _rebuildSlots(): void {
    const name = playerData.get().username || 'Jogador'
    this.blueSlots = ROLES.map(r => ({ role: r, occupant: 'empty' as SlotOccupant, playerName: null }))
    this.redSlots  = ROLES.map(r => ({ role: r, occupant: 'empty' as SlotOccupant, playerName: null }))
    const count = SLOTS_PER_PLAYER[this.matchMode]
    const target = this.playerSide === 'blue' ? this.blueSlots : this.redSlots
    for (let i = 0; i < count && i < 4; i++) { target[i].occupant = 'me'; target[i].playerName = name }
  }

  /** Count total human players across both teams. */
  private _totalPlayers(): number {
    return [...this.blueSlots, ...this.redSlots].filter(s => s.occupant === 'me' || s.occupant === 'friend').length
  }

  /** Check if a mode is available (not locked due to player count). */
  private _isModeAvailable(mode: MatchMode): boolean {
    const total = this._totalPlayers()
    if (mode === 'solo' && total > 2) return false
    if (mode === 'duo' && total > 4) return false
    return true
  }

  /** Swap player to the other team using smart logic based on mode. */
  private _swapTeam(): void {
    const newSide = this.playerSide === 'blue' ? 'red' : 'blue'
    const fromSlots = this.playerSide === 'blue' ? this.blueSlots : this.redSlots
    const toSlots = newSide === 'blue' ? this.blueSlots : this.redSlots
    const count = SLOTS_PER_PLAYER[this.matchMode]
    const name = playerData.get().username || 'Jogador'

    // Find bot/empty slots on the target side (prioritize bots)
    const targetIdxs: number[] = []
    for (let i = 0; i < 4 && targetIdxs.length < count; i++) {
      if (toSlots[i].occupant === 'empty') targetIdxs.push(i)
    }
    // If not enough empty, take bot slots too
    if (targetIdxs.length < count) {
      // In this offline mode, non-me non-friend slots are effectively bots
      for (let i = 0; i < 4 && targetIdxs.length < count; i++) {
        if (toSlots[i].occupant !== 'me' && toSlots[i].occupant !== 'friend' && !targetIdxs.includes(i)) {
          targetIdxs.push(i)
        }
      }
    }

    if (targetIdxs.length === 0) return // no room

    // Clear player from old side
    for (const s of fromSlots) { if (s.occupant === 'me') { s.occupant = 'empty'; s.playerName = null } }

    // Place player on new side
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
    const stk = { stroke: '#000000', strokeThickness: 3 }

    this.add.text(W / 2, 16, 'PARTIDA', {
      fontFamily: F.title, fontSize: '20px', color: '#ffffff',
      fontStyle: 'bold', shadow: SHADOW.strong, ...stk,
    }).setOrigin(0.5)
    this.add.text(W / 2, 36, 'PERSONALIZADA', {
      fontFamily: F.title, fontSize: '16px', color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow, ...stk,
    }).setOrigin(0.5)

    // Mode selector (right side)
    const modes: Array<{ key: MatchMode; label: string }> = [
      { key: 'solo', label: 'SOLO' }, { key: 'duo', label: 'DUO' }, { key: 'squad', label: 'SQUAD' },
    ]
    const mBtnW = 64; const mGap = 6
    const totalMW = modes.length * mBtnW + (modes.length - 1) * mGap
    const mStartX = W - 30 - totalMW

    modes.forEach((m, i) => {
      const mx = mStartX + i * (mBtnW + mGap) + mBtnW / 2
      const active = m.key === this.matchMode
      const available = this._isModeAvailable(m.key)
      const locked = !available && !active

      const mbg = this.add.graphics()
      mbg.fillStyle(active ? 0x1a1808 : 0x0e1420, active ? 0.95 : locked ? 0.3 : 0.6)
      mbg.fillRoundedRect(mx - mBtnW / 2, 10, mBtnW, 28, 4)
      mbg.lineStyle(1, active ? C.gold : 0x333344, active ? 0.6 : 0.2)
      mbg.strokeRoundedRect(mx - mBtnW / 2, 10, mBtnW, 28, 4)

      const ml = this.add.text(mx, 24, m.label, {
        fontFamily: F.title, fontSize: '13px',
        color: active ? C.goldHex : locked ? C.dimHex : C.mutedHex,
        fontStyle: 'bold', ...stk,
      }).setOrigin(0.5)

      if (!locked) {
        const mHit = this.add.rectangle(mx, 24, mBtnW, 28, 0, 0.001).setInteractive({ useHandCursor: true })
        mHit.on('pointerdown', () => {
          if (m.key === this.matchMode) return
          _savedMode = m.key as MatchMode; _savedSide = this.playerSide; _savedBlue = null; _savedRed = null; this.scene.restart()
        })
        mHit.on('pointerover', () => { if (m.key !== this.matchMode) ml.setColor('#c9a84c') })
        mHit.on('pointerout', () => { if (m.key !== this.matchMode) ml.setColor(C.mutedHex) })
      }
    })

    UI.backArrow(this, () => { _savedMode = 'solo'; _savedSide = 'blue'; _savedBlue = null; _savedRed = null; transitionTo(this, 'LobbyScene') })

    // Alterar Modo
    const sw = 120; const sh = 28; const sx = 126; const sy = 26
    const sbg = this.add.graphics()
    sbg.fillStyle(0x12161f, 1); sbg.fillRoundedRect(sx - sw / 2, sy - sh / 2, sw, sh, 4)
    sbg.lineStyle(1, C.goldDim, 0.5); sbg.strokeRoundedRect(sx - sw / 2, sy - sh / 2, sw, sh, 4)
    const sl = this.add.text(sx, sy, 'Alterar Modo', { fontFamily: F.body, fontSize: '13px', color: C.goldDimHex, fontStyle: 'bold', shadow: SHADOW.text }).setOrigin(0.5)
    const sHit = this.add.rectangle(sx, sy, sw, sh, 0, 0.001).setInteractive({ useHandCursor: true })
    sHit.on('pointerover', () => { sl.setColor(C.goldHex); sbg.clear(); sbg.fillStyle(0x1a2030, 1); sbg.fillRoundedRect(sx - sw / 2, sy - sh / 2, sw, sh, 4); sbg.lineStyle(1, C.gold, 0.6); sbg.strokeRoundedRect(sx - sw / 2, sy - sh / 2, sw, sh, 4) })
    sHit.on('pointerout', () => { sl.setColor(C.goldDimHex); sbg.clear(); sbg.fillStyle(0x12161f, 1); sbg.fillRoundedRect(sx - sw / 2, sy - sh / 2, sw, sh, 4); sbg.lineStyle(1, C.goldDim, 0.5); sbg.strokeRoundedRect(sx - sw / 2, sy - sh / 2, sw, sh, 4) })
    sHit.on('pointerdown', () => this._showModeSwitcher())

    this.add.rectangle(W / 2, 55, W - 60, 1, C.goldDim, 0.12)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM PANELS
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawBlueTeamPanel(): void {
    const px = W / 2 - 70; const py = 72; const pw = 780; const ph = 240
    UI.panel(this, px, py + ph / 2, pw, ph, { fill: 0x0c1019, border: 0x00ccaa, borderAlpha: 0.4 })
    this.add.text(px - pw / 2 + 24, py + 10, 'TIME AZUL', {
      fontFamily: F.title, fontSize: S.titleSmall, color: '#00ccaa', fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0, 0.5)
    const dg = this.add.graphics(); dg.fillStyle(0x00ccaa, 0.15); dg.fillRect(px - pw / 2 + 20, py + 22, pw - 40, 1)
    this._drawCards(px, py + 26, this.blueSlots, this.blueCards)
  }

  private _drawRedTeamPanel(): void {
    const px = W / 2 - 70; const py = 328; const pw = 780; const ph = 240
    UI.panel(this, px, py + ph / 2, pw, ph, { fill: 0x0c1019, border: 0x8844cc, borderAlpha: 0.4 })
    this.add.text(px - pw / 2 + 24, py + 10, 'TIME ROXO', {
      fontFamily: F.title, fontSize: S.titleSmall, color: '#8844cc', fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0, 0.5)
    const dg = this.add.graphics(); dg.fillStyle(0x8844cc, 0.15); dg.fillRect(px - pw / 2 + 20, py + 22, pw - 40, 1)
    this._drawCards(px, py + 26, this.redSlots, this.redCards)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWAP TEAM BUTTON (between the two panels)
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawSwapTeamButton(): void {
    const stk = { stroke: '#000000', strokeThickness: 2 }
    const cx = W / 2 - 70; const cy = 320
    const bw = 180; const bh = 30

    const bg = this.add.graphics()
    const draw = (hover: boolean) => {
      bg.clear()
      bg.fillStyle(hover ? 0x1a1808 : 0x0e1420, 0.95)
      bg.fillRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 6)
      bg.lineStyle(1.5, hover ? C.gold : C.goldDim, hover ? 0.6 : 0.3)
      bg.strokeRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 6)
    }
    draw(false)

    const label = this.add.text(cx, cy, '⇅  Trocar de Time', {
      fontFamily: F.body, fontSize: '14px', color: C.goldDimHex, fontStyle: 'bold', ...stk,
    }).setOrigin(0.5)

    const hit = this.add.rectangle(cx, cy, bw, bh, 0, 0.001).setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => { draw(true); label.setColor(C.goldHex) })
    hit.on('pointerout', () => { draw(false); label.setColor(C.goldDimHex) })
    hit.on('pointerdown', () => this._swapTeam())
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CARDS
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawCards(centerX: number, topY: number, slots: CustomSlot[], cardContainers: Phaser.GameObjects.Container[]): void {
    cardContainers.forEach(c => c.destroy()); cardContainers.length = 0
    const cardW = 170; const cardH = 200; const gap = 14
    const totalW = 4 * cardW + 3 * gap
    const startX = centerX - totalW / 2 + cardW / 2
    const cardCenterY = topY + cardH / 2 + 10

    // Side this team belongs to — used to flip the preview sprite the right way
    const teamSide: SpriteSide = slots === this.blueSlots ? 'left' : 'right'

    slots.forEach((slot, i) => {
      const cx = startX + i * (cardW + gap)
      const container = this.add.container(cx, cardCenterY); cardContainers.push(container)
      const accent = CLASS_ACCENTS[slot.role]
      const accentHex = '#' + accent.toString(16).padStart(6, '0')
      const isMe = slot.occupant === 'me'; const isFriend = slot.occupant === 'friend'
      const isFilled = isMe || isFriend

      const bg = this.add.graphics()
      bg.fillStyle(0x0e1420, 1); bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, S.borderRadius)
      bg.fillStyle(accent, 0.08); bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, 42, { tl: S.borderRadius, tr: S.borderRadius, bl: 0, br: 0 })
      bg.lineStyle(1.5, isMe ? accent : isFilled ? 0x555555 : 0x333333, isMe ? 0.55 : 0.2)
      bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, S.borderRadius); container.add(bg)

      // Character sprite preview — uses player's equipped skin for 'me', defaults
      // to 'idle' for bots/friends. Pedestal glow underneath for that AAA feel.
      const skinId = isMe ? playerData.getEquippedSkin(slot.role as CharClass) : 'idle'
      const ped = this.add.graphics()
      ped.fillStyle(accent, isMe ? 0.22 : 0.1)
      ped.fillEllipse(0, -cardH / 2 + 76, cardW * 0.55, 12)
      container.add(ped)
      const sprite = drawCharacterSprite(this, slot.role as SpriteRole, teamSide, 72, skinId)
      sprite.setPosition(0, -cardH / 2 + 46)
      container.add(sprite)

      container.add(this.add.text(0, -cardH / 2 + 90, ROLE_LABELS[slot.role], {
        fontFamily: F.title, fontSize: '13px', color: accentHex, fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5))

      const dg = this.add.graphics(); dg.fillStyle(accent, 0.15); dg.fillRect(-cardW / 2 + 16, -cardH / 2 + 104, cardW - 32, 1); container.add(dg)

      let nameText = 'Bot'; let nameColor: string = C.mutedHex
      if (isMe) { nameText = slot.playerName ?? 'Jogador'; nameColor = C.bodyHex }
      else if (isFriend) { nameText = slot.playerName ?? 'Amigo'; nameColor = '#88ccff' }

      container.add(this.add.text(0, -cardH / 2 + 118, nameText, {
        fontFamily: F.body, fontSize: '13px', color: nameColor, fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5))

      if (isMe) {
        container.add(this.add.text(0, -cardH / 2 + 134, 'Voce', {
          fontFamily: F.body, fontSize: '11px', color: C.successHex, shadow: SHADOW.text,
        }).setOrigin(0.5))
      } else if (isFriend) {
        container.add(this.add.text(0, -cardH / 2 + 134, 'Amigo', {
          fontFamily: F.body, fontSize: '11px', color: C.infoHex, shadow: SHADOW.text,
        }).setOrigin(0.5))
      }

      // ALTERAR SKIN pill — on the player's own cards
      if (isMe) {
        const pillW = 116
        const pillH = 22
        const pillY = -cardH / 2 + 156
        const pillG = this.add.graphics()
        const drawPill = (hover: boolean) => {
          pillG.clear()
          pillG.fillStyle(hover ? 0x1a1808 : 0x0e1420, 0.95)
          pillG.fillRoundedRect(-pillW / 2, pillY - pillH / 2, pillW, pillH, 5)
          pillG.lineStyle(1.2, hover ? C.gold : C.goldDim, hover ? 0.85 : 0.5)
          pillG.strokeRoundedRect(-pillW / 2, pillY - pillH / 2, pillW, pillH, 5)
        }
        drawPill(false)
        container.add(pillG)
        const pillLabel = this.add.text(0, pillY, '✦  ALTERAR SKIN', {
          fontFamily: F.title, fontSize: '10px', color: C.goldDimHex,
          fontStyle: 'bold', shadow: SHADOW.text,
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5)
        container.add(pillLabel)
        const pillHit = this.add.rectangle(0, pillY, pillW + 8, pillH + 8, 0x000000, 0.001)
          .setInteractive({ useHandCursor: true })
        container.add(pillHit)
        pillHit.on('pointerover', () => { drawPill(true); pillLabel.setColor(C.goldHex) })
        pillHit.on('pointerout', () => { drawPill(false); pillLabel.setColor(C.goldDimHex) })
        pillHit.on('pointerdown', () => {
          openSkinPicker(this, slot.role as CharClass, {
            side: teamSide,
            onChange: () => this._drawCards(centerX, topY, slots, cardContainers),
          })
        })
      }

      // Swap button (duo/squad only, on player's own cards)
      if (isMe && this.matchMode !== 'solo') {
        this._drawSwapIcon(container, cardH, slots, i)
      }

      container.setAlpha(0).setScale(0.95)
      this.tweens.add({ targets: container, alpha: 1, scaleX: 1, scaleY: 1, duration: 250, delay: 60 + i * 50, ease: 'Back.easeOut' })
    })
  }

  /** Draw a circular swap icon on a card for changing role within the team. */
  private _drawSwapIcon(
    container: Phaser.GameObjects.Container, cardH: number,
    slots: CustomSlot[], slotIdx: number,
  ): void {
    // Top-right corner so it doesn't collide with the bottom-aligned ALTERAR SKIN pill.
    const cardW = 170
    const btnR = 12; const bx = cardW / 2 - 18; const by = -cardH / 2 + 18

    const btnBg = this.add.graphics()
    btnBg.fillStyle(0x1a2030, 1); btnBg.fillCircle(bx, by, btnR)
    btnBg.lineStyle(1.2, C.info, 0.4); btnBg.strokeCircle(bx, by, btnR)
    container.add(btnBg)

    // Swap arrows icon
    const ag = this.add.graphics()
    ag.lineStyle(1.8, C.info, 0.8)
    ag.beginPath()
    for (let a = -0.8; a <= 0.8; a += 0.1) {
      const rx = bx + Math.cos(a - Math.PI / 2) * 7
      const ry = by + Math.sin(a - Math.PI / 2) * 7 + 1
      if (a <= -0.7) ag.moveTo(rx, ry); else ag.lineTo(rx, ry)
    }
    ag.strokePath()
    ag.fillStyle(C.info, 0.8); ag.fillTriangle(bx + 5, by - 8, bx + 9, by - 4, bx + 3, by - 3)
    ag.beginPath()
    for (let a = -0.8; a <= 0.8; a += 0.1) {
      const rx = bx + Math.cos(a + Math.PI / 2) * 7
      const ry = by + Math.sin(a + Math.PI / 2) * 7 - 1
      if (a <= -0.7) ag.moveTo(rx, ry); else ag.lineTo(rx, ry)
    }
    ag.strokePath()
    ag.fillTriangle(bx - 5, by + 8, bx - 9, by + 4, bx - 3, by + 3)
    container.add(ag)

    const hit = this.add.rectangle(bx, by, btnR * 2.5, btnR * 2.5, 0, 0.001)
      .setInteractive({ useHandCursor: true })
    container.add(hit)
    hit.on('pointerover', () => {
      btnBg.clear(); btnBg.fillStyle(0x253040, 1); btnBg.fillCircle(bx, by, btnR)
      btnBg.lineStyle(1.2, C.info, 0.7); btnBg.strokeCircle(bx, by, btnR)
    })
    hit.on('pointerout', () => {
      btnBg.clear(); btnBg.fillStyle(0x1a2030, 1); btnBg.fillCircle(bx, by, btnR)
      btnBg.lineStyle(1.2, C.info, 0.4); btnBg.strokeCircle(bx, by, btnR)
    })
    hit.on('pointerdown', () => {
      const cards = slots === this.blueSlots ? this.blueCards : this.redCards
      this._onSwapRole(slots, slotIdx, cards)
    })
  }

  /** Show highlighted swap targets — player clicks one to confirm swap. */
  private _onSwapRole(slots: CustomSlot[], myIdx: number, cardContainers: Phaser.GameObjects.Container[]): void {
    // Clear previous highlights
    this._clearSwapHighlights()

    // Find all valid swap targets (non-me, non-friend)
    const targets: number[] = []
    for (let i = 0; i < 4; i++) {
      if (i !== myIdx && slots[i].occupant !== 'me' && slots[i].occupant !== 'friend') targets.push(i)
    }
    if (targets.length === 0) return

    // Add overlay to cancel if clicking elsewhere
    const cancelOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.15)
      .setInteractive().setDepth(14)
    cancelOverlay.on('pointerdown', () => this._clearSwapHighlights())
    this._swapHighlights.push(cancelOverlay)

    // Highlight each valid target card
    for (const tIdx of targets) {
      const card = cardContainers[tIdx]
      if (!card) continue
      const { x, y } = card

      // Pulsing gold highlight
      const hl = this.add.rectangle(x, y, 174, 204, 0xf0c850, 0.1)
        .setStrokeStyle(2, 0xf0c850, 0.6).setDepth(15)
      this.tweens.add({ targets: hl, alpha: { from: 0.06, to: 0.18 }, duration: 500, yoyo: true, repeat: -1 })
      this._swapHighlights.push(hl)

      // "Trocar" text
      const txt = this.add.text(x, y + 60, 'TROCAR', {
        fontFamily: F.title, fontSize: '13px', color: C.goldHex, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(16)
      this._swapHighlights.push(txt)

      // Click target to swap
      const hit = this.add.rectangle(x, y, 174, 204, 0, 0.001)
        .setInteractive({ useHandCursor: true }).setDepth(17)
      this._swapHighlights.push(hit)
      hit.on('pointerdown', () => {
        // Do the swap
        const tmpOcc = slots[myIdx].occupant; const tmpName = slots[myIdx].playerName
        slots[myIdx].occupant = slots[tIdx].occupant; slots[myIdx].playerName = slots[tIdx].playerName
        slots[tIdx].occupant = tmpOcc; slots[tIdx].playerName = tmpName
        // Persist and restart
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
  // ROOM LOG (right side)
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawRoomLog(): void {
    const stk = { stroke: '#000000', strokeThickness: 2 }
    const logX = 1160; const logY = 100; const logW = 200; const logH = 260
    UI.panel(this, logX, logY + logH / 2, logW, logH, { fill: 0x0c1019 })

    const total = this._totalPlayers()
    const max = MAX_PLAYERS[this.matchMode]
    this.add.text(logX, logY + 14, `SALA ${total}/${max}`, {
      fontFamily: F.title, fontSize: S.bodySmall, color: C.goldHex, fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)
    this.add.rectangle(logX, logY + 28, logW - 20, 1, C.goldDim, 0.2)

    // List all human players
    let y = logY + 46
    const allSlots = [...this.blueSlots.map(s => ({ ...s, side: 'blue' as const })), ...this.redSlots.map(s => ({ ...s, side: 'red' as const }))]
    const seen = new Set<string>()
    for (const s of allSlots) {
      if ((s.occupant === 'me' || s.occupant === 'friend') && s.playerName && !seen.has(s.playerName)) {
        seen.add(s.playerName)
        const teamColor = s.side === 'blue' ? 0x00ccaa : 0x8844cc
        const teamHex = s.side === 'blue' ? '#00ccaa' : '#8844cc'
        const teamLabel = s.side === 'blue' ? 'AZUL' : 'ROXO'

        const dotG = this.add.graphics(); dotG.fillStyle(teamColor, 0.8); dotG.fillCircle(logX - logW / 2 + 22, y, 5)
        this.add.text(logX - logW / 2 + 34, y, s.playerName, {
          fontFamily: F.body, fontSize: S.bodySmall, color: s.occupant === 'me' ? C.goldHex : C.bodyHex,
          fontStyle: s.occupant === 'me' ? 'bold' : 'normal', shadow: SHADOW.text, ...stk,
        }).setOrigin(0, 0.5)
        this.add.text(logX + logW / 2 - 14, y, teamLabel, {
          fontFamily: F.body, fontSize: '10px', color: teamHex, fontStyle: 'bold', shadow: SHADOW.text,
        }).setOrigin(1, 0.5)
        y += 28
      }
    }

    // Convidar button below
    const invY = logY + logH + 20; const invW = logW - 16; const invH = 32
    const invG = this.add.graphics()
    invG.fillStyle(0x141a24, 1); invG.fillRoundedRect(logX - invW / 2, invY - invH / 2, invW, invH, 5)
    invG.lineStyle(1, C.info, 0.4); invG.strokeRoundedRect(logX - invW / 2, invY - invH / 2, invW, invH, 5)
    this.add.text(logX, invY, '+ Convidar Amigo', {
      fontFamily: F.body, fontSize: S.small, color: C.infoHex, fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)
    const invHit = this.add.rectangle(logX, invY, invW, invH, 0, 0.001).setInteractive({ useHandCursor: true })
    invHit.on('pointerdown', () => this._showInvitePopup())
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // START BUTTON (right side, below room log)
  // ═══════════════════════════════════════════════════════════════════════════

  private _drawStartButton(): void {
    const btnX = 1160; const btnY = 618; const btnW = 200; const btnH = 44
    const bg = this.add.graphics()
    const render = (hover: boolean) => { bg.clear()
      bg.fillStyle(hover ? 0x224422 : 0x1a3a1a, 1); bg.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, S.borderRadius)
      bg.lineStyle(2, C.success, hover ? 0.8 : 0.6); bg.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, S.borderRadius)
      bg.fillStyle(0xffffff, hover ? 0.05 : 0.03); bg.fillRoundedRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 2, btnW - 4, btnH * 0.4,
        { tl: S.borderRadius - 1, tr: S.borderRadius - 1, bl: 0, br: 0 }) }
    render(false)
    this.add.text(btnX, btnY, 'INICIAR', {
      fontFamily: F.title, fontSize: '16px', color: C.successHex, fontStyle: 'bold',
      shadow: SHADOW.goldGlow, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5)
    const hit = this.add.rectangle(btnX, btnY, btnW, btnH, 0, 0.001).setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => render(true)); hit.on('pointerout', () => render(false))
    hit.on('pointerdown', () => {
      const side = this.playerSide === 'blue' ? 'left' : 'right'
      // Build list of character IDs the player controls
      const mySlots = (this.playerSide === 'blue' ? this.blueSlots : this.redSlots)
        .filter(s => s.occupant === 'me')
      const prefix = side === 'left' ? 'l' : 'r'
      const charIds = mySlots.map(s => `${prefix}${s.role}`)
      // If player controls all 4, don't pass specific IDs (full side control)
      const playerCharIds = charIds.length < 4 ? charIds : undefined

      // Count actual human players on the player's team (me + friends)
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
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE SWITCHER OVERLAY — same panel as lobby (shared utility)
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
    const dimBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(100).setInteractive()
    const popup = this.add.container(W / 2, H / 2).setDepth(101).setAlpha(0).setScale(0.9)
    const pw = 320; const ph = 110
    const pbg = this.add.graphics()
    pbg.fillStyle(0x0c1019, 0.98); pbg.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 8)
    pbg.lineStyle(1.5, C.purple, 0.4); pbg.strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 8)
    popup.add(pbg)
    popup.add(this.add.text(0, -18, 'Em breve', { fontFamily: F.title, fontSize: S.titleSmall, color: C.purpleHex, fontStyle: 'bold', shadow: SHADOW.goldGlow }).setOrigin(0.5))
    popup.add(this.add.text(0, 6, 'Sistema de convites em desenvolvimento', { fontFamily: F.body, fontSize: S.bodySmall, color: C.mutedHex, shadow: SHADOW.text }).setOrigin(0.5))
    const okl = this.add.text(0, ph / 2 - 22, 'OK', { fontFamily: F.body, fontSize: S.body, color: C.goldHex, fontStyle: 'bold', shadow: SHADOW.text }).setOrigin(0.5)
    popup.add(okl)
    const okH = this.add.rectangle(0, ph / 2 - 22, 60, 22, 0, 0.001).setInteractive({ useHandCursor: true }); popup.add(okH)
    const close = () => { this.tweens.add({ targets: [popup, dimBg], alpha: 0, duration: 150, onComplete: () => { popup.destroy(); dimBg.destroy() } }) }
    dimBg.on('pointerdown', close); okH.on('pointerdown', close)
    okH.on('pointerover', () => okl.setColor('#ffe680')); okH.on('pointerout', () => okl.setColor(C.goldHex))
    this.tweens.add({ targets: popup, alpha: 1, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut' })
  }
}
