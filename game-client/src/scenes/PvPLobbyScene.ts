/**
 * PvPLobbyScene.ts -- Room/Party PvP lobby.
 *
 * Room has 4 SLOTS (one per class). Each slot is filled by a player.
 *
 * Mode is DERIVED from playerCount:
 *   1 player  = Solo   (controls all 4 chars)
 *   2 players = Duo    (2 chars each)
 *   4 players = Squad  (1 char each)
 *   3 players = blocked (need 4th)
 *
 * Players cannot manually switch modes. Invite friends to change mode.
 * Swap icon lets you change which character you control (duo/squad).
 *
 * Can search if playerCount is 1, 2, or 4 (never 3).
 */

import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import { C, F, S, SHADOW, SCREEN } from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import { showPlayModesOverlay } from '../utils/PlayModesOverlay'
import { drawCharacterSprite, type SpriteRole } from '../utils/SpriteFactory'
import { RANKED_TIERS } from '../data/tournaments'
import type { UnitRole } from '../engine/types'
import type { CharClass } from '../utils/AssetPaths'

const W = SCREEN.W
const H = SCREEN.H

// ── Static data ──────────────────────────────────────────────────────────────

const ROLES: UnitRole[] = ['king', 'warrior', 'specialist', 'executor']

const ROLE_LABELS: Record<UnitRole, string> = {
  king: 'REI',
  warrior: 'GUERREIRO',
  specialist: 'ESPECIALISTA',
  executor: 'EXECUTOR',
}

const CLASS_ACCENTS: Record<UnitRole, number> = {
  king: C.king,
  warrior: C.warrior,
  specialist: C.specialist,
  executor: C.executor,
}

type DerivedMode = 'Solo' | 'Duo' | 'Squad'

const MODE_COLORS: Record<DerivedMode, number> = {
  Solo: C.gold,
  Duo: C.info,
  Squad: C.success,
}; void MODE_COLORS

// Bonus descriptions used in the bonus panel
// Solo: Sem bonus | Duo: +10% XP e Gold | Squad: +20% XP e Gold

// ── Interfaces ───────────────────────────────────────────────────────────────

interface RoomSlot {
  role: UnitRole
  playerName: string | null
  isMe: boolean
}

// ── Scene ────────────────────────────────────────────────────────────────────

export default class PvPLobbyScene extends Phaser.Scene {
  // State
  private roomSlots: RoomSlot[] = []
  private playerCount = 1

  // UI references
  private cardContainers: Phaser.GameObjects.Container[] = []
  private modeLabel!: Phaser.GameObjects.Text
  private modeBadgeBg!: Phaser.GameObjects.Graphics
  private roomCountLabel!: Phaser.GameObjects.Text
  private bonusTexts: Phaser.GameObjects.Text[] = []
  private bonusCheckmark!: Phaser.GameObjects.Text
  private searchLabel!: Phaser.GameObjects.Text
  private searchBg!: Phaser.GameObjects.Graphics
  private searchHit!: Phaser.GameObjects.Rectangle
  private blockedLabel: Phaser.GameObjects.Text | null = null

  // Back button
  private backBtn: Phaser.GameObjects.Container | null = null

  // Matchmaking
  private searching = false
  private searchDots = 0
  private searchTimer: Phaser.Time.TimerEvent | null = null

  // Room owner (framework for multiplayer)
  private isRoomOwner = true

  // Swap cooldown
  private swapCooldown = false

  constructor() { super('PvPLobbyScene') }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  create(): void {
    this.searching = false
    this.swapCooldown = false
    this.searchTimer = null
    this.cardContainers = []
    this.bonusTexts = []
    this.blockedLabel = null
    this.backBtn = null
    this.playerCount = 1

    this.initRoom()

    // Background layers
    UI.background(this)
    UI.particles(this, 15)
    UI.fadeIn(this)

    this.drawHeader()
    this.drawTeamPanel()
    this.drawRoomLog()
    this.drawBonusPanel()
    this.drawRulesPanel()
    this.drawInviteButton()
    this.drawSearchButton()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  private initRoom(): void {
    const p = playerData.get()
    // Solo start: all 4 slots belong to local player
    this.roomSlots = ROLES.map((role) => ({
      role,
      playerName: p.username,
      isMe: true,
    }))
    this.playerCount = 1
  }

  private get derivedMode(): DerivedMode {
    if (this.playerCount <= 1) return 'Solo'
    if (this.playerCount === 2) return 'Duo'
    return 'Squad'
  }

  private get canSearch(): boolean {
    // 1, 2, or 4 players can search. 3 cannot.
    return this.playerCount !== 3
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════

  private drawHeader(): void {
    const stk = { stroke: '#000000', strokeThickness: 3 }

    // Title centered — two lines
    this.add.text(W / 2, 16, 'BATALHA', {
      fontFamily: F.title, fontSize: '20px', color: '#ffffff',
      fontStyle: 'bold', shadow: SHADOW.strong, ...stk,
    }).setOrigin(0.5)
    this.add.text(W / 2, 36, 'PVP', {
      fontFamily: F.title, fontSize: '16px', color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow, ...stk,
    }).setOrigin(0.5)

    // Mode label (SOLO / DUO / SQUAD) — right side, slightly lower
    this.modeBadgeBg = this.add.graphics()
    this.modeLabel = this.add.text(W - 140, 26, '', {
      fontFamily: F.title, fontSize: '20px', color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow, ...stk,
    }).setOrigin(0.5)

    this.refreshModeBadge()

    // Room count (hidden — no longer shown)
    this.roomCountLabel = this.add.text(-999, -999, '', { fontSize: '1px' }).setVisible(false)

    // Back arrow
    this.backBtn = UI.backArrow(this, () => { if (!this.searching) transitionTo(this, 'LobbyScene') })

    // Mode switcher button (left, spaced from back arrow)
    const switchBtnW = 120
    const switchBtnH = 28
    const switchBtnX = 126
    const switchBtnY = 26
    const switchBg = this.add.graphics()
    switchBg.fillStyle(0x12161f, 1)
    switchBg.fillRoundedRect(switchBtnX - switchBtnW / 2, switchBtnY - switchBtnH / 2, switchBtnW, switchBtnH, 4)
    switchBg.lineStyle(1, C.goldDim, 0.5)
    switchBg.strokeRoundedRect(switchBtnX - switchBtnW / 2, switchBtnY - switchBtnH / 2, switchBtnW, switchBtnH, 4)

    const switchLabel = this.add.text(switchBtnX, switchBtnY, 'Alterar Modo', {
      fontFamily: F.body, fontSize: '13px', color: C.goldDimHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)

    const switchHit = this.add.rectangle(switchBtnX, switchBtnY, switchBtnW, switchBtnH, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    switchHit.on('pointerover', () => {
      switchBg.clear()
      switchBg.fillStyle(0x1a2030, 1)
      switchBg.fillRoundedRect(switchBtnX - switchBtnW / 2, switchBtnY - switchBtnH / 2, switchBtnW, switchBtnH, 4)
      switchBg.lineStyle(1, C.gold, 0.6)
      switchBg.strokeRoundedRect(switchBtnX - switchBtnW / 2, switchBtnY - switchBtnH / 2, switchBtnW, switchBtnH, 4)
      switchLabel.setColor(C.goldHex)
    })
    switchHit.on('pointerout', () => {
      switchBg.clear()
      switchBg.fillStyle(0x12161f, 1)
      switchBg.fillRoundedRect(switchBtnX - switchBtnW / 2, switchBtnY - switchBtnH / 2, switchBtnW, switchBtnH, 4)
      switchBg.lineStyle(1, C.goldDim, 0.5)
      switchBg.strokeRoundedRect(switchBtnX - switchBtnW / 2, switchBtnY - switchBtnH / 2, switchBtnW, switchBtnH, 4)
      switchLabel.setColor(C.goldDimHex)
    })
    switchHit.on('pointerdown', () => this.showModeSwitcher())

    // Divider
    this.add.rectangle(W / 2, 72, W - 60, 1, C.goldDim, 0.15)
  }

  private refreshModeBadge(): void {
    const mode = this.derivedMode
    const text = mode.toUpperCase()
    this.modeLabel.setText(text)
    this.modeBadgeBg.clear()
  }

  private refreshRoomCount(): void { void this.roomCountLabel }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM PANEL (character cards)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawTeamPanel(): void {
    const panelX = W / 2 - 70
    const panelY = 72
    const panelW = 880
    const panelH = 290

    UI.panel(this, panelX, panelY + panelH / 2, panelW, panelH, {
      fill: 0x0c1019, border: C.panelBorder, borderAlpha: 0.5,
    })

    // Section header
    this.add.text(panelX - panelW / 2 + 24, panelY + 12, 'SEU TIME', {
      fontFamily: F.title, fontSize: '24px', color: C.goldDimHex,
      fontStyle: 'bold', shadow: SHADOW.text, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5)

    // Header divider
    const divG = this.add.graphics()
    divG.fillStyle(C.goldDim, 0.15)
    divG.fillRect(panelX - panelW / 2 + 20, panelY + 22, panelW - 40, 1)

    this.drawCards(panelX, panelY + 30)
  }

  private drawCards(centerX: number, topY: number): void {
    // Destroy old
    this.cardContainers.forEach((c) => c.destroy())
    this.cardContainers = []

    const cardW = 200
    const cardH = 240
    const gap = 12
    const totalW = 4 * cardW + 3 * gap
    const startX = centerX - totalW / 2 + cardW / 2
    const cardCenterY = topY + cardH / 2 + 6

    const p = playerData.get()

    this.roomSlots.forEach((slot, i) => {
      const cx = startX + i * (cardW + gap)
      const container = this.add.container(cx, cardCenterY)
      this.cardContainers.push(container)

      const accent = CLASS_ACCENTS[slot.role]
      const accentHex = '#' + accent.toString(16).padStart(6, '0')
      const isFilled = slot.playerName !== null

      // -- Card background --
      const bg = this.add.graphics()
      bg.fillStyle(0x0e1420, 1)
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, S.borderRadius)
      // Top accent strip
      bg.fillStyle(accent, 0.08)
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, 42, { tl: S.borderRadius, tr: S.borderRadius, bl: 0, br: 0 })
      // Border (brighter if yours)
      const borderAlpha = slot.isMe ? 0.55 : isFilled ? 0.35 : 0.2
      bg.lineStyle(1.5, slot.isMe ? accent : isFilled ? 0x555555 : 0x333333, borderAlpha)
      bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, S.borderRadius)
      container.add(bg)

      // -- Character preview sprite --
      // Filled slots show the real PNG sprite (player's equipped skin for self,
      // default 'idle' for friends/bots since we don't track their skin choice).
      // Empty slots fall back to the procedural class icon.
      if (isFilled) {
        const skinId = slot.isMe ? playerData.getEquippedSkin(slot.role as CharClass) : 'idle'
        const sprite = drawCharacterSprite(this, slot.role as SpriteRole, 'left', 86, skinId)
        sprite.setPosition(0, -cardH / 2 + 56)
        container.add(sprite)

        // Subtle pedestal glow under the feet
        const ped = this.add.graphics()
        ped.fillStyle(accent, slot.isMe ? 0.22 : 0.1)
        ped.fillEllipse(0, -cardH / 2 + 100, cardW * 0.55, 14)
        container.add(ped)
        container.sendToBack(ped)
        container.bringToTop(sprite)
      } else {
        UI.classIcon(this, cx, cardCenterY - cardH / 2 + 50, slot.role, 26, accent)
      }

      // -- Class name --
      container.add(this.add.text(0, -cardH / 2 + 110, ROLE_LABELS[slot.role], {
        fontFamily: F.title, fontSize: '20px', color: accentHex,
        fontStyle: 'bold', shadow: SHADOW.text, stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5))

      // Divider
      const divLine = this.add.graphics()
      divLine.fillStyle(accent, 0.15)
      divLine.fillRect(-cardW / 2 + 16, -cardH / 2 + 132, cardW - 32, 1)
      container.add(divLine)

      if (isFilled) {
        // -- Player name --
        const displayName = slot.playerName!
        container.add(this.add.text(0, -cardH / 2 + 152, displayName, {
          fontFamily: F.body, fontSize: '18px',
          color: slot.isMe ? C.bodyHex : C.infoHex,
          fontStyle: 'bold', shadow: SHADOW.text, stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5))

        // -- Player level --
        container.add(this.add.text(0, -cardH / 2 + 174, `Lv.${p.level}`, {
          fontFamily: F.body, fontSize: '16px', color: C.mutedHex,
          shadow: SHADOW.text, stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5))

        if (slot.isMe) {
          // "SEU" badge
          const myBadge = this.add.graphics()
          myBadge.fillStyle(C.success, 0.12)
          myBadge.fillRoundedRect(-34, -cardH / 2 + 196, 68, 24, 4)
          myBadge.lineStyle(1, C.success, 0.45)
          myBadge.strokeRoundedRect(-34, -cardH / 2 + 196, 68, 24, 4)
          container.add(myBadge)

          container.add(this.add.text(0, -cardH / 2 + 208, p.username, {
            fontFamily: F.title, fontSize: '12px', color: C.successHex,
            fontStyle: 'bold', shadow: SHADOW.text, stroke: '#000000', strokeThickness: 2,
          }).setOrigin(0.5))
        }

        // -- Swap button --
        if (this.derivedMode !== 'Solo') {
          this.drawSwapButton(container, cardW, cardH, slot, i)
        }
      } else {
        // -- Empty slot --
        container.add(this.add.text(0, -cardH / 2 + 156, 'Vazio', {
          fontFamily: F.body, fontSize: '18px', color: C.mutedHex,
          fontStyle: 'bold', shadow: SHADOW.text, stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5))

        container.add(this.add.text(0, -cardH / 2 + 184, 'Aguardando...', {
          fontFamily: F.body, fontSize: '15px', color: C.dimHex,
          shadow: SHADOW.text, stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5))

        // Mini invite on empty card
        const invW = 100
        const invH = 26
        const invY = -cardH / 2 + 210
        const invBg = this.add.graphics()
        invBg.fillStyle(0x1a2030, 1)
        invBg.fillRoundedRect(-invW / 2, invY - invH / 2, invW, invH, 4)
        invBg.lineStyle(1, C.info, 0.3)
        invBg.strokeRoundedRect(-invW / 2, invY - invH / 2, invW, invH, 4)
        container.add(invBg)

        const invText = this.add.text(0, invY, 'Convidar', {
          fontFamily: F.body, fontSize: S.small, color: C.infoHex,
          fontStyle: 'bold', shadow: SHADOW.text,
        }).setOrigin(0.5)
        container.add(invText)

        const invHit = this.add.rectangle(0, invY, invW, invH, 0x000000, 0.001)
          .setInteractive({ useHandCursor: true })
        invHit.on('pointerover', () => invText.setColor('#80e0ff'))
        invHit.on('pointerout', () => invText.setColor(C.infoHex))
        invHit.on('pointerdown', () => this.showInvitePopup())
        container.add(invHit)
      }

      // Entrance animation
      container.setAlpha(0).setScale(0.9)
      this.tweens.add({
        targets: container,
        alpha: 1, scaleX: 1, scaleY: 1,
        duration: 300, delay: 100 + i * 80, ease: 'Back.easeOut',
      })
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWAP BUTTON (drawn as two curved arrows in a circle)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawSwapButton(
    container: Phaser.GameObjects.Container,
    _cardW: number, cardH: number,
    _slot: RoomSlot, slotIndex: number,
  ): void {
    const btnR = 14
    const bx = 0
    const by = cardH / 2 - 24

    // Circle background
    const btnBg = this.add.graphics()
    btnBg.fillStyle(0x1a2030, 1)
    btnBg.fillCircle(bx, by, btnR)
    btnBg.lineStyle(1.2, C.info, 0.4)
    btnBg.strokeCircle(bx, by, btnR)
    container.add(btnBg)

    // Draw two curved arrows (swap icon)
    const arrowG = this.add.graphics()
    arrowG.lineStyle(1.8, C.info, 0.8)

    // Top arc (right to left)
    arrowG.beginPath()
    for (let a = -0.8; a <= 0.8; a += 0.1) {
      const rx = bx + Math.cos(a - Math.PI / 2) * 7
      const ry = by + Math.sin(a - Math.PI / 2) * 7 + 1
      if (a <= -0.7) arrowG.moveTo(rx, ry)
      else arrowG.lineTo(rx, ry)
    }
    arrowG.strokePath()
    // Arrow tip (top arc)
    arrowG.fillStyle(C.info, 0.8)
    arrowG.fillTriangle(bx + 5, by - 8, bx + 9, by - 4, bx + 3, by - 3)

    // Bottom arc (left to right)
    arrowG.beginPath()
    for (let a = -0.8; a <= 0.8; a += 0.1) {
      const rx = bx + Math.cos(a + Math.PI / 2) * 7
      const ry = by + Math.sin(a + Math.PI / 2) * 7 - 1
      if (a <= -0.7) arrowG.moveTo(rx, ry)
      else arrowG.lineTo(rx, ry)
    }
    arrowG.strokePath()
    // Arrow tip (bottom arc)
    arrowG.fillTriangle(bx - 5, by + 8, bx - 9, by + 4, bx - 3, by + 3)
    container.add(arrowG)

    // Hit area
    const hit = this.add.rectangle(bx, by, btnR * 2.5, btnR * 2.5, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    container.add(hit)

    hit.on('pointerover', () => {
      btnBg.clear()
      btnBg.fillStyle(0x253040, 1)
      btnBg.fillCircle(bx, by, btnR)
      btnBg.lineStyle(1.2, C.info, 0.7)
      btnBg.strokeCircle(bx, by, btnR)
    })
    hit.on('pointerout', () => {
      btnBg.clear()
      btnBg.fillStyle(0x1a2030, 1)
      btnBg.fillCircle(bx, by, btnR)
      btnBg.lineStyle(1.2, C.info, 0.4)
      btnBg.strokeCircle(bx, by, btnR)
    })
    hit.on('pointerdown', () => this.onSwap(slotIndex))
  }

  private _swapHLs: Phaser.GameObjects.GameObject[] = []

  private onSwap(slotIndex: number): void {
    if (this.swapCooldown || this.searching) return
    if (this.derivedMode === 'Solo') return

    // Clear previous highlights
    for (const o of this._swapHLs) o.destroy(); this._swapHLs = []

    // Find valid targets (non-me slots)
    const targets: number[] = []
    for (let i = 0; i < 4; i++) {
      if (i !== slotIndex && !this.roomSlots[i].isMe) targets.push(i)
    }
    if (targets.length === 0) return

    // Cancel overlay
    const cancelOv = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.15).setInteractive().setDepth(14)
    cancelOv.on('pointerdown', () => { for (const o of this._swapHLs) o.destroy(); this._swapHLs = [] })
    this._swapHLs.push(cancelOv)

    for (const tIdx of targets) {
      const card = this.cardContainers[tIdx]
      if (!card) continue
      const hl = this.add.rectangle(card.x, card.y, 174, 224, 0xf0c850, 0.1)
        .setStrokeStyle(2, 0xf0c850, 0.6).setDepth(15)
      this.tweens.add({ targets: hl, alpha: { from: 0.06, to: 0.18 }, duration: 500, yoyo: true, repeat: -1 })
      this._swapHLs.push(hl)
      const txt = this.add.text(card.x, card.y + 70, 'TROCAR', {
        fontFamily: 'Arial Black', fontSize: '13px', color: '#f0c850', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(16)
      this._swapHLs.push(txt)
      const hit = this.add.rectangle(card.x, card.y, 174, 224, 0, 0.001).setInteractive({ useHandCursor: true }).setDepth(17)
      this._swapHLs.push(hit)
      hit.on('pointerdown', () => {
        for (const o of this._swapHLs) o.destroy(); this._swapHLs = []
        this.swapSlotOwnership(slotIndex, tIdx)
        this.swapCooldown = true; this.time.delayedCall(2000, () => { this.swapCooldown = false })
        this.refreshUI()
      })
    }
  }

  private swapSlotOwnership(idxA: number, idxB: number): void {
    const a = this.roomSlots[idxA]
    const b = this.roomSlots[idxB]
    const tmpName = a.playerName
    const tmpIsMe = a.isMe
    a.playerName = b.playerName
    a.isMe = b.isMe
    b.playerName = tmpName
    b.isMe = tmpIsMe
  }

  private refreshUI(): void {
    this.refreshModeBadge()
    this.refreshRoomCount()
    this.refreshBonusHighlight()
    this.refreshSearchState()

    // Redraw cards
    const panelY = 82
    this.drawCards(W / 2 - 70, panelY + 30)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM LOG (right side)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawRoomLog(): void {
    const logX = 1160, logY = 100, logW = 200, logH = 260

    UI.panel(this, logX, logY + logH / 2, logW, logH, { fill: 0x0c1019 })

    this.add.text(logX, logY + 16, `SALA ${this.playerCount}/4`, {
      fontFamily: F.title, fontSize: '18px', color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.text, stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5)

    this.add.rectangle(logX, logY + 28, logW - 20, 1, C.goldDim, 0.2)

    // Get highest elo across all queues
    const ranked = playerData.getRanked()
    const allInfos = [ranked['1v1'], ranked['2v2'], ranked['4v4']]
    // Find highest tier by index in tier order
    const tierOrder = ['desconhecido', 'recruta', 'aprendiz', 'soldado', 'veterano', 'comandante', 'rei']
    let bestInfo = allInfos[0]
    for (const info of allInfos) {
      if (tierOrder.indexOf(info.tier) > tierOrder.indexOf(bestInfo.tier)) bestInfo = info
      else if (info.tier === bestInfo.tier && info.lp > bestInfo.lp) bestInfo = info
    }
    const bestTd = RANKED_TIERS[bestInfo.tier]

    // Deduplicate players
    const unique = new Map<string, { name: string; isMe: boolean }>()
    this.roomSlots.filter(s => s.playerName).forEach(s => {
      if (!unique.has(s.playerName!)) {
        unique.set(s.playerName!, { name: s.playerName!, isMe: s.isMe })
      }
    })

    let y = logY + 46
    unique.forEach(p => {
      // Tier icon (small)
      UI.tierIcon(this, logX - logW / 2 + 22, y, bestInfo.tier, 12)

      // Player name
      const color = p.isMe ? C.goldHex : C.bodyHex
      this.add.text(logX - logW / 2 + 38, y, p.name, {
        fontFamily: F.body, fontSize: S.bodySmall, color,
        fontStyle: p.isMe ? 'bold' : 'normal', shadow: SHADOW.text,
      }).setOrigin(0, 0.5)

      // Tier name
      this.add.text(logX + logW / 2 - 14, y, bestTd.name, {
        fontFamily: F.body, fontSize: '10px', color: bestTd.colorHex,
        shadow: SHADOW.text,
      }).setOrigin(1, 0.5)

      y += 28
    })

    // CONVIDAR AMIGO button below the log
    const invY = logY + logH + 20
    const invW = logW - 16
    const invH = 32
    const invG = this.add.graphics()
    invG.fillStyle(0x141a24, 1)
    invG.fillRoundedRect(logX - invW / 2, invY - invH / 2, invW, invH, 5)
    invG.lineStyle(1, C.info, 0.4)
    invG.strokeRoundedRect(logX - invW / 2, invY - invH / 2, invW, invH, 5)

    this.add.text(logX, invY, '+ Convidar Amigo', {
      fontFamily: F.body, fontSize: S.small, color: C.infoHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)

    const invHit = this.add.rectangle(logX, invY, invW, invH, 0, 0.001)
      .setInteractive({ useHandCursor: true })
    invHit.on('pointerdown', () => this.showInvitePopup())
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BONUS PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  private drawBonusPanel(): void {
    const panelX = W / 2 - 210
    const panelY = 378
    const panelW = 320
    const panelH = 140

    UI.panel(this, panelX, panelY + panelH / 2, panelW, panelH, {
      fill: 0x0c1019, border: C.panelBorder, borderAlpha: 0.4,
    })

    this.add.text(panelX, panelY + 16, 'BONUS DE EQUIPE', {
      fontFamily: F.title, fontSize: S.bodySmall, color: C.goldDimHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)

    const entries: { label: string; mode: DerivedMode }[] = [
      { label: 'Solo:    Sem bonus', mode: 'Solo' },
      { label: 'Duo:     +10% XP e Gold', mode: 'Duo' },
      { label: 'Squad:  +20% XP e Gold', mode: 'Squad' },
    ]

    this.bonusTexts = []
    entries.forEach((entry, i) => {
      const isActive = entry.mode === this.derivedMode
      const txt = this.add.text(panelX - panelW / 2 + 24, panelY + 44 + i * 24, entry.label, {
        fontFamily: F.body, fontSize: S.bodySmall,
        color: isActive ? C.goldHex : C.mutedHex,
        fontStyle: isActive ? 'bold' : 'normal',
        shadow: SHADOW.text,
      }).setOrigin(0, 0.5)
      this.bonusTexts.push(txt)
    })

    // Active checkmark
    const activeIdx = this.derivedMode === 'Solo' ? 0 : this.derivedMode === 'Duo' ? 1 : 2
    this.bonusCheckmark = this.add.text(
      panelX + panelW / 2 - 20,
      panelY + 44 + activeIdx * 24,
      'Atual',
      {
        fontFamily: F.body, fontSize: '10px', color: C.successHex,
        fontStyle: 'bold', shadow: SHADOW.text,
      },
    ).setOrigin(1, 0.5)
  }

  private refreshBonusHighlight(): void {
    const modes: DerivedMode[] = ['Solo', 'Duo', 'Squad']
    this.bonusTexts.forEach((txt, i) => {
      const isActive = modes[i] === this.derivedMode
      txt.setColor(isActive ? C.goldHex : C.mutedHex)
      txt.setFontStyle(isActive ? 'bold' : 'normal')
    })

    if (this.bonusCheckmark) {
      const activeIdx = this.derivedMode === 'Solo' ? 0 : this.derivedMode === 'Duo' ? 1 : 2
      const panelY = 380
      this.bonusCheckmark.setY(panelY + 44 + activeIdx * 24)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RULES PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  private drawRulesPanel(): void {
    const panelX = W / 2 + 160
    const panelY = 378
    const panelW = 400
    const panelH = 140

    UI.panel(this, panelX, panelY + panelH / 2, panelW, panelH, {
      fill: 0x0c1019, border: C.panelBorder, borderAlpha: 0.4,
    })

    this.add.text(panelX, panelY + 16, 'INFORMACOES', {
      fontFamily: F.title, fontSize: S.bodySmall, color: C.goldDimHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)

    const bullets = [
      'Sem custo de entrada',
      'Matchmaking aleatorio',
      'Pode enfrentar qualquer tamanho de equipe',
      'Premiacoes por vitoria',
    ]

    bullets.forEach((b, i) => {
      this.add.text(panelX - panelW / 2 + 24, panelY + 44 + i * 22, `\u2022  ${b}`, {
        fontFamily: F.body, fontSize: S.bodySmall, color: C.mutedHex,
        shadow: SHADOW.text,
      }).setOrigin(0, 0.5)
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVITE BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  private drawInviteButton(): void {
    // Invite button is now drawn below the room log in drawRoomLog()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH / MATCHMAKING BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  private drawSearchButton(): void {
    const btnX = W / 2
    const btnY = 618
    const btnW = 380
    const btnH = 58

    // Background
    this.searchBg = this.add.graphics()
    this.renderSearchBtn(this.searchBg, btnX, btnY, btnW, btnH, false, false)

    // Label
    this.searchLabel = this.add.text(btnX, btnY, 'INICIAR BATALHA', {
      fontFamily: F.title, fontSize: S.titleSmall, color: C.successHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)

    // Hit area
    this.searchHit = this.add.rectangle(btnX, btnY, btnW, btnH, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })

    this.searchHit.on('pointerover', () => {
      if (!this.searching && this.canSearch) {
        this.renderSearchBtn(this.searchBg, btnX, btnY, btnW, btnH, true, false)
      }
    })
    this.searchHit.on('pointerout', () => {
      if (!this.searching) {
        this.renderSearchBtn(this.searchBg, btnX, btnY, btnW, btnH, false, false)
      }
    })
    this.searchHit.on('pointerdown', () => {
      if (this.searching) {
        this.cancelSearch()
      } else {
        this.startSearch()
      }
    })

    this.refreshSearchState()
  }

  private renderSearchBtn(
    g: Phaser.GameObjects.Graphics,
    bx: number, by: number, bw: number, bh: number,
    hovered: boolean, disabled: boolean,
  ): void {
    g.clear()
    if (disabled) {
      g.fillStyle(0x1a1a1a, 1)
      g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, S.borderRadius)
      g.lineStyle(2, 0x444444, 0.4)
      g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, S.borderRadius)
    } else {
      g.fillStyle(hovered ? 0x224422 : 0x1a3a1a, 1)
      g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, S.borderRadius)
      g.lineStyle(2, C.success, hovered ? 0.8 : 0.6)
      g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, S.borderRadius)
      // Gloss
      g.fillStyle(0xffffff, hovered ? 0.05 : 0.04)
      g.fillRoundedRect(
        bx - bw / 2 + 2, by - bh / 2 + 2, bw - 4, bh * 0.4,
        { tl: S.borderRadius - 1, tr: S.borderRadius - 1, bl: 0, br: 0 },
      )
    }
  }

  private refreshSearchState(): void {
    const btnX = W / 2
    const btnY = 618
    const btnW = 380
    const btnH = 58

    if (!this.canSearch && !this.searching) {
      this.renderSearchBtn(this.searchBg, btnX, btnY, btnW, btnH, false, true)
      this.searchLabel.setText('SALA INCOMPLETA (3/4)').setColor(C.mutedHex)

      // Blocked explanation
      if (!this.blockedLabel) {
        this.blockedLabel = this.add.text(btnX, btnY + 36, 'Convide mais 1 jogador para completar o squad', {
          fontFamily: F.body, fontSize: S.small, color: C.dangerHex,
          shadow: SHADOW.text,
        }).setOrigin(0.5)
      }
    } else if (!this.searching) {
      this.renderSearchBtn(this.searchBg, btnX, btnY, btnW, btnH, false, false)
      this.searchLabel.setText('INICIAR BATALHA').setColor(C.successHex)

      if (this.blockedLabel) {
        this.blockedLabel.destroy()
        this.blockedLabel = null
      }
    }
  }

  private startSearch(): void {
    if (this.searching) return
    if (!this.canSearch) return
    if (!this.isRoomOwner) return  // Only owner can start search

    this.searching = true
    this.searchDots = 0
    this.searchLabel.setText('Buscando batalha')
    this.searchLabel.setColor(C.warningHex)
    // Change button to "cancel" style (red-ish)
    this.renderSearchBtn(this.searchBg, W / 2, 618, 380, 58, false, false)
    this.searchBg.clear()
    this.searchBg.fillStyle(0x2a1a1a, 1)
    this.searchBg.fillRoundedRect(W / 2 - 190, 618 - 29, 380, 58, S.borderRadius)
    this.searchBg.lineStyle(2, C.warning, 0.6)
    this.searchBg.strokeRoundedRect(W / 2 - 190, 618 - 29, 380, 58, S.borderRadius)

    // Dim back button during search
    if (this.backBtn) {
      this.backBtn.setAlpha(0.3)
      this.backBtn.each((child: Phaser.GameObjects.GameObject) => {
        if (child.input) (child as any).disableInteractive()
      })
    }

    // Animated search dots
    this.searchTimer = this.time.addEvent({
      delay: 500,
      callback: () => {
        this.searchDots = (this.searchDots + 1) % 4
        const dots = '.'.repeat(this.searchDots)
        this.searchLabel.setText(`Buscando batalha${dots}`)
      },
      loop: true,
    })

    // Real matchmaking — stays in queue until a match is found via backend
    // For now, keeps searching indefinitely (no fake match)
    // The backend matchmaking service will notify when a match is found
    // Player can cancel the search by clicking the button again
  }

  private cancelSearch(): void {
    this.searching = false
    if (this.searchTimer) { this.searchTimer.destroy(); this.searchTimer = null }
    if (this.searchLabel) {
      this.searchLabel.setText('INICIAR BATALHA')
      this.searchLabel.setColor(C.successHex)
    }
    // Re-render the button as normal (not searching)
    this.renderSearchBtn(this.searchBg, W / 2, 618, 380, 58, false, false)

    // Restore back button
    if (this.backBtn) {
      this.backBtn.setAlpha(1)
      this.backBtn.each((child: Phaser.GameObjects.GameObject) => {
        if (child.input) (child as any).setInteractive({ useHandCursor: true })
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVITE POPUP (placeholder)
  // ═══════════════════════════════════════════════════════════════════════════

  private showInvitePopup(): void {
    if (this.searching) return

    const dimBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7)
      .setDepth(100).setInteractive()

    const popup = this.add.container(W / 2, H / 2).setDepth(101).setAlpha(0).setScale(0.9)

    const pW = 360
    const pH = 150

    // Background
    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x0c1019, 0.98)
    panelBg.fillRoundedRect(-pW / 2, -pH / 2, pW, pH, 10)
    panelBg.lineStyle(1.5, C.info, 0.4)
    panelBg.strokeRoundedRect(-pW / 2, -pH / 2, pW, pH, 10)
    popup.add(panelBg)

    // Title
    popup.add(this.add.text(0, -28, 'Em breve', {
      fontFamily: F.title, fontSize: S.titleSmall, color: C.infoHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0.5))

    // Subtitle
    popup.add(this.add.text(0, 4, 'Sistema de convites em desenvolvimento', {
      fontFamily: F.body, fontSize: S.body, color: C.mutedHex,
      shadow: SHADOW.text,
    }).setOrigin(0.5))

    // OK button
    const okLabel = this.add.text(0, pH / 2 - 28, 'OK', {
      fontFamily: F.body, fontSize: S.body, color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)
    popup.add(okLabel)

    const okHit = this.add.rectangle(0, pH / 2 - 28, 80, 28, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    popup.add(okHit)

    const closePopup = () => {
      this.tweens.add({
        targets: [popup, dimBg],
        alpha: 0, duration: 150, ease: 'Quad.In',
        onComplete: () => { popup.destroy(); dimBg.destroy() },
      })
    }

    dimBg.on('pointerdown', closePopup)
    okHit.on('pointerdown', closePopup)
    okHit.on('pointerover', () => okLabel.setColor('#ffe680'))
    okHit.on('pointerout', () => okLabel.setColor(C.goldHex))

    this.tweens.add({
      targets: popup,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 200, ease: 'Back.easeOut',
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE SWITCHER OVERLAY — same panel as lobby (shared utility)
  // ═══════════════════════════════════════════════════════════════════════════

  private showModeSwitcher(): void {
    if (this.searching) return
    showPlayModesOverlay(this, {
      title: 'ALTERAR MODO',
      currentTarget: 'PvPLobbyScene',
      dimSceneBackground: true,
    })
  }
}
