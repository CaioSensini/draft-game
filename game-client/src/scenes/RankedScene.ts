/**
 * RankedScene.ts -- Room-based ranked lobby.
 *
 * Layout:
 *   LEFT (0-160)     — Elo sidebar: 3 queue cards (1v1, 2v2, 4v4) with tier + LP + W/L
 *   CENTER (160-1060) — Room system (team cards, bonus, info, invite)
 *   RIGHT (1060-1260) — Room log (players with rank icons) + invite pill
 *
 * Queue selection determines room size:
 *   1v1 = Solo (1 player, 4 chars) — no invites
 *   2v2 = Duo  (2 players, 2 chars each) — 1 invite
 *   4v4 = Squad (4 players, 1 char each) — 3 invites
 */

import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import { showPlayModesOverlay } from '../utils/PlayModesOverlay'
import { drawCharacterSprite, type SpriteRole } from '../utils/SpriteFactory'
import { RANKED_TIERS } from '../data/tournaments'
import type { RankedQueue } from '../data/tournaments'
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
  king: 'REI',
  warrior: 'GUERREIRO',
  specialist: 'ESPECIALISTA',
  executor: 'EXECUTOR',
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

type DerivedMode = 'Solo' | 'Duo' | 'Squad'

const QUEUE_MODE_NAMES: Record<RankedQueue, string> = {
  '1v1': 'SOLO',
  '2v2': 'DUPLA',
  '4v4': 'SQUAD',
}

// ── Layout ───────────────────────────────────────────────────────────────────

const TOP_H = 56
const SIDEBAR_X = 20
const SIDEBAR_W = 150
const TEAM_PANEL_X = SIDEBAR_X + SIDEBAR_W + 20   // 190
const TEAM_PANEL_Y = TOP_H + 20                    // 76
const TEAM_PANEL_W = 720
const TEAM_PANEL_H = 300
const LOG_X = W - 200
const LOG_Y = TOP_H + 20
const LOG_W = 200
const LOG_H = 300

// ── Interfaces ───────────────────────────────────────────────────────────────

interface RoomSlot {
  role: UnitRole
  playerName: string | null
  isMe: boolean
}

// ── Scene ────────────────────────────────────────────────────────────────────

export default class RankedScene extends Phaser.Scene {
  // State
  private roomSlots: RoomSlot[] = []
  private playerCount = 1
  private activeQueue: RankedQueue = '1v1'

  // UI references
  private cardContainers: Phaser.GameObjects.Container[] = []
  private bonusTextObjs: Phaser.GameObjects.Text[] = []
  private bonusBadges: Phaser.GameObjects.Text[] = []
  private modePillLabel: Phaser.GameObjects.Text | null = null
  private blockedLabel: Phaser.GameObjects.Text | null = null
  private searchBtnRef: { container: Phaser.GameObjects.Container; setDisabled: (v: boolean) => void } | null = null
  private searchBtnLabel: Phaser.GameObjects.Text | null = null

  // Back button
  private backBtn: Phaser.GameObjects.Container | null = null

  // Matchmaking — MatchmakingScene owns the queue UX; fields kept for
  // compatibility with cancelSearch() in case it's ever toggled externally.
  private searching = false
  private searchTimer: Phaser.Time.TimerEvent | null = null

  // Room owner (framework for multiplayer)
  private isRoomOwner = true

  // Swap cooldown
  private swapCooldown = false
  private _swapHLs: Phaser.GameObjects.GameObject[] = []

  constructor() { super('RankedScene') }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  create(): void {
    // Guard: Ranked requires LVL 100
    if (playerData.getLevel() < 100) {
      UI.background(this, { vignette: false, diagonalPattern: false, streaks: false })
      this.drawLockedHeader()
      this.add.text(W / 2, H / 2 - 20, 'ARENA RANKEADA', {
        fontFamily: fontFamily.display,
        fontSize:   typeScale.displayMd,
        color:      accent.primaryHex,
        fontStyle:  '900',
      }).setOrigin(0.5).setLetterSpacing(4)
      this.add.text(W / 2, H / 2 + 18, 'Disponível a partir do Nível 100', {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.body,
        color:      fg.tertiaryHex,
        fontStyle:  'italic',
      }).setOrigin(0.5)
      UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))
      return
    }

    this.searching = false
    this.swapCooldown = false
    this.searchTimer = null
    this.cardContainers = []
    this.bonusTextObjs = []
    this.bonusBadges = []
    this.blockedLabel = null
    this.backBtn = null
    this.playerCount = 1
    this.activeQueue = '1v1'
    this._swapHLs = []

    this.initRoom()

    UI.background(this, { vignette: false, diagonalPattern: false, streaks: false })
    UI.fadeIn(this)

    this.drawHeader()
    this.drawEloSidebar()
    this.drawTeamPanel()
    this.drawRoomLog()
    this.drawBonusPanel()
    this.drawInfoPanel()
    this.drawSearchButton()
  }

  private drawLockedHeader(): void {
    const bar = this.add.graphics()
    bar.fillStyle(surface.panel, 1)
    bar.fillRect(0, 0, W, TOP_H)
    bar.lineStyle(1, border.subtle, 1)
    bar.beginPath()
    bar.moveTo(0, TOP_H - 0.5)
    bar.lineTo(W, TOP_H - 0.5)
    bar.strokePath()
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
    return this.playerCount !== 3
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════

  private drawHeader(): void {
    const bar = this.add.graphics()
    bar.fillStyle(surface.panel, 1)
    bar.fillRect(0, 0, W, TOP_H)
    bar.lineStyle(1, border.subtle, 1)
    bar.beginPath()
    bar.moveTo(0, TOP_H - 0.5)
    bar.lineTo(W, TOP_H - 0.5)
    bar.strokePath()

    this.backBtn = UI.backArrow(this, () => {
      if (!this.searching) transitionTo(this, 'LobbyScene')
    })

    // Eyebrow + title
    this.add.text(W / 2, TOP_H / 2 - 10, 'RANKED', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8)

    this.add.text(W / 2, TOP_H / 2 + 10, 'ARENA RANKEADA', {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '600',
    }).setOrigin(0.5).setLetterSpacing(3)

    // Mode switcher (left)
    UI.buttonGhost(this, 156, TOP_H / 2, 'ALTERAR MODO', {
      w: 160,
      h: 32,
      onPress: () => this.showModeSwitcher(),
    })

    // Mode pill (right)
    const pillW = 72
    const pillX = W - 60
    const pillY = TOP_H / 2
    const pillBg = this.add.graphics()
    pillBg.fillStyle(surface.deepest, 1)
    pillBg.fillRoundedRect(pillX - pillW / 2, pillY - 12, pillW, 24, radii.pill)
    pillBg.lineStyle(1, accent.primary, 1)
    pillBg.strokeRoundedRect(pillX - pillW / 2, pillY - 12, pillW, 24, radii.pill)
    this.modePillLabel = this.add.text(pillX, pillY, this.derivedMode.toUpperCase(), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.4)
  }

  private refreshModePill(): void {
    if (this.modePillLabel) this.modePillLabel.setText(this.derivedMode.toUpperCase())
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ELO SIDEBAR (left)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawEloSidebar(): void {
    const sideX = SIDEBAR_X + SIDEBAR_W / 2
    const sideY = TOP_H + 20
    const sideH = H - TOP_H - 40

    // Panel
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(SIDEBAR_X, sideY, SIDEBAR_W, sideH, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(SIDEBAR_X, sideY, SIDEBAR_W, sideH, radii.lg)
    // Accent top stripe
    bg.fillStyle(accent.primary, 0.45)
    bg.fillRect(SIDEBAR_X + 16, sideY, SIDEBAR_W - 32, 1)

    // Header
    this.add.text(sideX, sideY + 18, 'RANKS', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8)

    // Divider
    const div = this.add.graphics()
    div.fillStyle(border.subtle, 1)
    div.fillRect(SIDEBAR_X + 20, sideY + 36, SIDEBAR_W - 40, 1)

    // Queue cards
    const queues: RankedQueue[] = ['1v1', '2v2', '4v4']
    const ranked = playerData.getRanked()
    const cardH = 170
    const gap = 10
    let y = sideY + 48

    queues.forEach((q) => {
      const info = ranked[q]
      const td = RANKED_TIERS[info.tier]
      const isActive = q === this.activeQueue

      const cardX = SIDEBAR_X + 10
      const cardW = SIDEBAR_W - 20

      // Card frame
      const cbg = this.add.graphics()
      cbg.fillStyle(isActive ? surface.raised : surface.deepest, 1)
      cbg.fillRoundedRect(cardX, y, cardW, cardH, radii.md)
      cbg.lineStyle(1, isActive ? accent.primary : border.default, 1)
      cbg.strokeRoundedRect(cardX, y, cardW, cardH, radii.md)
      if (isActive) {
        cbg.fillStyle(accent.primary, 0.9)
        cbg.fillRoundedRect(cardX + 2, y + 8, 3, cardH - 16, 2)
      }

      // Queue name
      this.add.text(sideX, y + 16, QUEUE_MODE_NAMES[q], {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      isActive ? accent.primaryHex : fg.tertiaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.4)

      // Tier icon (large emoji)
      this.add.text(sideX, y + 44, td.icon, {
        fontSize: '26px',
      }).setOrigin(0.5)

      // Tier name
      this.add.text(sideX, y + 72, td.name.toUpperCase(), {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      td.colorHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.4)

      // Division
      if (info.division) {
        this.add.text(sideX, y + 88, `DIV ${info.division}`, {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      fg.tertiaryHex,
          fontStyle:  '700',
        }).setOrigin(0.5).setLetterSpacing(1.4)
      }

      // LP bar
      const barW = cardW - 24
      const barH = 6
      const barX = cardX + 12
      const barY = y + 106
      const trackBg = this.add.graphics()
      trackBg.fillStyle(surface.deepest, 1)
      trackBg.fillRoundedRect(barX, barY, barW, barH, 3)
      trackBg.lineStyle(1, border.subtle, 1)
      trackBg.strokeRoundedRect(barX, barY, barW, barH, 3)

      const lpRatio = info.tier === 'comandante' && info.division === 3
        ? Math.min(info.lp / 200, 1)
        : Math.min(info.lp / 100, 1)
      if (lpRatio > 0) {
        const fillG = this.add.graphics()
        fillG.fillStyle(td.color, 1)
        fillG.fillRoundedRect(barX, barY, barW * lpRatio, barH, 3)
      }

      // LP text
      this.add.text(sideX, barY + 16, `${info.lp} LP`, {
        fontFamily: fontFamily.mono,
        fontSize:   typeScale.meta,
        color:      fg.secondaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5)

      // W/L
      const total = info.wins + info.losses
      const wr = total > 0 ? Math.round(info.wins / total * 100) : 0
      this.add.text(sideX, y + cardH - 14, `${info.wins}V · ${info.losses}D · ${wr}%`, {
        fontFamily: fontFamily.mono,
        fontSize:   typeScale.meta,
        color:      fg.tertiaryHex,
      }).setOrigin(0.5)

      y += cardH + gap
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM PANEL (center)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawTeamPanel(): void {
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(TEAM_PANEL_X, TEAM_PANEL_Y, TEAM_PANEL_W, TEAM_PANEL_H, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(TEAM_PANEL_X, TEAM_PANEL_Y, TEAM_PANEL_W, TEAM_PANEL_H, radii.lg)
    bg.fillStyle(accent.primary, 0.45)
    bg.fillRect(TEAM_PANEL_X + 16, TEAM_PANEL_Y, TEAM_PANEL_W - 32, 1)

    this.add.text(TEAM_PANEL_X + 24, TEAM_PANEL_Y + 20, 'SEU TIME', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    this.drawCards(TEAM_PANEL_X + TEAM_PANEL_W / 2, TEAM_PANEL_Y + 38)
  }

  private drawCards(centerX: number, topY: number): void {
    this.cardContainers.forEach((c) => c.destroy())
    this.cardContainers = []

    const cardW = 162
    const cardH = 240
    const gap = 14
    const totalW = 4 * cardW + 3 * gap
    const startX = centerX - totalW / 2 + cardW / 2
    const cardCenterY = topY + cardH / 2 + 8

    const p = playerData.get()

    this.roomSlots.forEach((slot, i) => {
      const cx = startX + i * (cardW + gap)
      const container = this.add.container(cx, cardCenterY)
      this.cardContainers.push(container)

      const classAccent = CLASS_ACCENT[slot.role]
      const classAccentHex = CLASS_ACCENT_HEX[slot.role]
      const isFilled = slot.playerName !== null

      const bg = this.add.graphics()
      bg.fillStyle(surface.raised, 1)
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, radii.lg)
      bg.fillStyle(classAccent, 0.14)
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, 40,
        { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })
      const borderColor = slot.isMe ? classAccent : isFilled ? border.default : border.subtle
      bg.lineStyle(1, borderColor, 1)
      bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, radii.lg)
      container.add(bg)

      // Class label
      container.add(this.add.text(0, -cardH / 2 + 20, ROLE_LABELS[slot.role], {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      classAccentHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.8))

      if (isFilled) {
        const skinId = slot.isMe ? playerData.getEquippedSkin(slot.role as CharClass) : 'idle'
        const sprite = drawCharacterSprite(this, slot.role as SpriteRole, 'left', 78, skinId)
        sprite.setPosition(0, -cardH / 2 + 92)
        container.add(sprite)

        const ped = this.add.graphics()
        ped.fillStyle(classAccent, slot.isMe ? 0.24 : 0.12)
        ped.fillEllipse(0, -cardH / 2 + 136, cardW * 0.6, 10)
        container.add(ped)
        container.sendToBack(ped)
        container.bringToTop(sprite)
      } else {
        UI.classIcon(this, cx, cardCenterY - cardH / 2 + 92, slot.role, 30, classAccent)
      }

      const nameY = -cardH / 2 + 158
      if (isFilled) {
        container.add(this.add.text(0, nameY, slot.playerName!, {
          fontFamily: fontFamily.serif,
          fontSize:   typeScale.h3,
          color:      slot.isMe ? fg.primaryHex : fg.secondaryHex,
          fontStyle:  '600',
        }).setOrigin(0.5))

        container.add(this.add.text(0, nameY + 18, `NV ${p.level}`, {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      fg.tertiaryHex,
          fontStyle:  '700',
        }).setOrigin(0.5).setLetterSpacing(1.4))

        if (slot.isMe) {
          const badgeW = 60
          const badgeY = -cardH / 2 + 210
          const badge = this.add.graphics()
          badge.fillStyle(state.successDim, 1)
          badge.fillRoundedRect(-badgeW / 2, badgeY - 10, badgeW, 20, radii.md)
          badge.lineStyle(1, state.success, 1)
          badge.strokeRoundedRect(-badgeW / 2, badgeY - 10, badgeW, 20, radii.md)
          container.add(badge)
          container.add(this.add.text(0, badgeY, 'VOCÊ', {
            fontFamily: fontFamily.body,
            fontSize:   typeScale.meta,
            color:      state.successHex,
            fontStyle:  '700',
          }).setOrigin(0.5).setLetterSpacing(1.6))
        }

        if (this.derivedMode !== 'Solo') {
          this.drawSwapButton(container, cardH, i)
        }
      } else {
        container.add(this.add.text(0, nameY, 'Vazio', {
          fontFamily: fontFamily.serif,
          fontSize:   typeScale.h3,
          color:      fg.tertiaryHex,
          fontStyle:  'italic',
        }).setOrigin(0.5))

        container.add(this.add.text(0, nameY + 18, 'Aguardando…', {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.small,
          color:      fg.disabledHex,
        }).setOrigin(0.5))

        const invW = 104
        const invH = 26
        const invY = -cardH / 2 + 210
        const invG = this.add.graphics()
        invG.fillStyle(surface.deepest, 1)
        invG.fillRoundedRect(-invW / 2, invY - invH / 2, invW, invH, radii.md)
        invG.lineStyle(1, state.info, 1)
        invG.strokeRoundedRect(-invW / 2, invY - invH / 2, invW, invH, radii.md)
        container.add(invG)

        const invText = this.add.text(0, invY, 'CONVIDAR', {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      state.infoHex,
          fontStyle:  '700',
        }).setOrigin(0.5).setLetterSpacing(1.4)
        container.add(invText)

        const invHit = this.add.rectangle(0, invY, invW, invH, 0x000000, 0.001)
          .setInteractive({ useHandCursor: true })
        invHit.on('pointerdown', () => this.showInvitePopup())
        container.add(invHit)
      }

      // Entrance
      container.setAlpha(0).setScale(0.94)
      this.tweens.add({
        targets: container,
        alpha: 1, scaleX: 1, scaleY: 1,
        duration: 300, delay: 90 + i * 80, ease: 'Back.easeOut',
      })
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SWAP BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  private drawSwapButton(
    container: Phaser.GameObjects.Container,
    cardH: number,
    slotIndex: number,
  ): void {
    const btnR = 13
    const bx = 60
    const by = -cardH / 2 + 20

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
    hit.on('pointerdown', () => this.onSwap(slotIndex))
  }

  private onSwap(slotIndex: number): void {
    if (this.swapCooldown || this.searching) return
    if (this.derivedMode === 'Solo') return

    for (const o of this._swapHLs) o.destroy()
    this._swapHLs = []

    const targets: number[] = []
    for (let i = 0; i < 4; i++) {
      if (i !== slotIndex && !this.roomSlots[i].isMe) targets.push(i)
    }
    if (targets.length === 0) return

    const cancelOv = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.2).setInteractive().setDepth(14)
    cancelOv.on('pointerdown', () => { for (const o of this._swapHLs) o.destroy(); this._swapHLs = [] })
    this._swapHLs.push(cancelOv)

    for (const tIdx of targets) {
      const card = this.cardContainers[tIdx]
      if (!card) continue

      const hl = this.add.rectangle(card.x, card.y, 170, 248, accent.primary, 0.12)
        .setStrokeStyle(2, accent.primary, 0.65).setDepth(15)
      this.tweens.add({ targets: hl, alpha: { from: 0.08, to: 0.22 }, duration: 520, yoyo: true, repeat: -1 })
      this._swapHLs.push(hl)

      const txt = this.add.text(card.x, card.y + 70, 'TROCAR', {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      accent.primaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.8).setDepth(16)
      this._swapHLs.push(txt)

      const hit = this.add.rectangle(card.x, card.y, 170, 248, 0, 0.001).setInteractive({ useHandCursor: true }).setDepth(17)
      this._swapHLs.push(hit)
      hit.on('pointerdown', () => {
        for (const o of this._swapHLs) o.destroy(); this._swapHLs = []
        this.swapSlotOwnership(slotIndex, tIdx)
        this.swapCooldown = true
        this.time.delayedCall(2000, () => { this.swapCooldown = false })
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
    this.refreshModePill()
    this.refreshBonusHighlight()
    this.refreshSearchState()
    this.drawCards(TEAM_PANEL_X + TEAM_PANEL_W / 2, TEAM_PANEL_Y + 38)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROOM LOG (right)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawRoomLog(): void {
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(LOG_X - LOG_W / 2, LOG_Y, LOG_W, LOG_H, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(LOG_X - LOG_W / 2, LOG_Y, LOG_W, LOG_H, radii.lg)
    bg.fillStyle(accent.primary, 0.45)
    bg.fillRect(LOG_X - LOG_W / 2 + 16, LOG_Y, LOG_W - 32, 1)

    this.add.text(LOG_X, LOG_Y + 18, `SALA ${this.playerCount}/4`, {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8)

    // Get best tier across queues
    const ranked = playerData.getRanked()
    const allInfos = [ranked['1v1'], ranked['2v2'], ranked['4v4']]
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

    let y = LOG_Y + 48
    unique.forEach(p => {
      UI.tierIcon(this, LOG_X - LOG_W / 2 + 22, y, bestInfo.tier, 12)

      this.add.text(LOG_X - LOG_W / 2 + 40, y, p.name, {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.small,
        color:      p.isMe ? accent.primaryHex : fg.primaryHex,
        fontStyle:  p.isMe ? '700' : '500',
      }).setOrigin(0, 0.5)

      this.add.text(LOG_X + LOG_W / 2 - 14, y, bestTd.name.toUpperCase(), {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      bestTd.colorHex,
        fontStyle:  '700',
      }).setOrigin(1, 0.5).setLetterSpacing(1.2)

      y += 28
    })

    // Invite button below log
    const invY = LOG_Y + LOG_H + 20
    UI.buttonSecondary(this, LOG_X, invY, 'CONVIDAR AMIGO', {
      w: 184,
      h: 36,
      onPress: () => this.showInvitePopup(),
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BONUS PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  private drawBonusPanel(): void {
    const panelX = TEAM_PANEL_X
    const panelY = TEAM_PANEL_Y + TEAM_PANEL_H + 20
    const panelW = 340
    const panelH = 140

    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(panelX, panelY, panelW, panelH, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(panelX, panelY, panelW, panelH, radii.lg)

    this.add.text(panelX + 20, panelY + 20, 'BÔNUS DE EQUIPE', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    const entries: { label: string; mode: DerivedMode }[] = [
      { label: 'SOLO · sem bônus',          mode: 'Solo'  },
      { label: 'DUO · +10% XP e Gold',      mode: 'Duo'   },
      { label: 'SQUAD · +20% XP e Gold',    mode: 'Squad' },
    ]

    this.bonusTextObjs = []
    this.bonusBadges = []

    entries.forEach((entry, i) => {
      const isActive = entry.mode === this.derivedMode
      const ly = panelY + 48 + i * 24

      const dot = this.add.graphics()
      dot.fillStyle(isActive ? state.success : border.default, 1)
      dot.fillCircle(panelX + 24, ly, 3)

      const txt = this.add.text(panelX + 36, ly, entry.label, {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.small,
        color:      isActive ? fg.primaryHex : fg.tertiaryHex,
        fontStyle:  isActive ? '700' : '500',
      }).setOrigin(0, 0.5)
      this.bonusTextObjs.push(txt)

      const badge = this.add.text(panelX + panelW - 20, ly, 'ATUAL', {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      state.successHex,
        fontStyle:  '700',
      }).setOrigin(1, 0.5).setLetterSpacing(1.4)
      badge.setVisible(isActive)
      this.bonusBadges.push(badge)
    })
  }

  private refreshBonusHighlight(): void {
    const modes: DerivedMode[] = ['Solo', 'Duo', 'Squad']
    modes.forEach((m, i) => {
      const isActive = m === this.derivedMode
      const txt = this.bonusTextObjs[i]
      if (txt) {
        txt.setColor(isActive ? fg.primaryHex : fg.tertiaryHex)
        txt.setFontStyle(isActive ? '700' : '500')
      }
      const badge = this.bonusBadges[i]
      if (badge) badge.setVisible(isActive)
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INFO PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  private drawInfoPanel(): void {
    const panelX = TEAM_PANEL_X + 360
    const panelY = TEAM_PANEL_Y + TEAM_PANEL_H + 20
    const panelW = 360
    const panelH = 140

    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(panelX, panelY, panelW, panelH, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(panelX, panelY, panelW, panelH, radii.lg)

    this.add.text(panelX + 20, panelY + 20, 'INFORMAÇÕES', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    const bullets = [
      'Torneio entre 8 jogadores reais',
      'Double elimination: perdedores jogam entre si',
      'LP baseado na posição final (1º ao 8º)',
      'Sem custo de entrada',
    ]

    bullets.forEach((b, i) => {
      const ly = panelY + 48 + i * 22
      const dot = this.add.graphics()
      dot.fillStyle(accent.primary, 1)
      dot.fillCircle(panelX + 24, ly, 2)

      this.add.text(panelX + 36, ly, b, {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.small,
        color:      fg.secondaryHex,
      }).setOrigin(0, 0.5)
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  private drawSearchButton(): void {
    const btnX = TEAM_PANEL_X + (TEAM_PANEL_W / 2)
    const btnY = H - 56

    this.searchBtnRef = UI.buttonPrimary(this, btnX, btnY, 'INICIAR BATALHA', {
      size: 'lg',
      w:    360,
      h:    56,
      onPress: () => {
        if (this.searching) {
          this.cancelSearch()
        } else {
          this.startSearch()
        }
      },
    })

    this.searchBtnLabel = this.findButtonLabel(this.searchBtnRef.container)

    this.refreshSearchState()
  }

  private findButtonLabel(c: Phaser.GameObjects.Container): Phaser.GameObjects.Text | null {
    for (const child of c.list) {
      if (child instanceof Phaser.GameObjects.Text) return child
    }
    return null
  }

  private refreshSearchState(): void {
    if (!this.searchBtnRef) return
    const canSearch = this.canSearch

    if (this.blockedLabel) { this.blockedLabel.destroy(); this.blockedLabel = null }

    if (!canSearch && !this.searching) {
      this.searchBtnRef.setDisabled(true)
      if (this.searchBtnLabel) this.searchBtnLabel.setText('SALA INCOMPLETA (3/4)')
      this.blockedLabel = this.add.text(TEAM_PANEL_X + TEAM_PANEL_W / 2, H - 102,
        'Convide mais 1 jogador para completar o squad', {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.small,
        color:      state.errorHex,
        fontStyle:  'italic',
      }).setOrigin(0.5)
    } else if (!this.searching) {
      this.searchBtnRef.setDisabled(false)
      if (this.searchBtnLabel) this.searchBtnLabel.setText('INICIAR BATALHA')
    }
  }

  private startSearch(): void {
    if (this.searching) return
    if (!this.canSearch) return
    if (!this.isRoomOwner) return

    const playerCount = (this.playerCount === 1 || this.playerCount === 2 || this.playerCount === 4)
      ? this.playerCount
      : 1
    transitionTo(this, 'MatchmakingScene', {
      mode:        'ranked',
      playerCount,
      returnTo:    'RankedScene',
    })
  }

  private cancelSearch(): void {
    this.searching = false
    if (this.searchTimer) { this.searchTimer.destroy(); this.searchTimer = null }
    this.refreshSearchState()

    if (this.backBtn) {
      this.backBtn.setAlpha(1)
      this.backBtn.each((child: Phaser.GameObjects.GameObject) => {
        if (child.input) (child as any).setInteractive({ useHandCursor: true })
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVITE POPUP
  // ═══════════════════════════════════════════════════════════════════════════

  private showInvitePopup(): void {
    if (this.searching) return
    UI.modal(this, {
      eyebrow: 'PRÓXIMAMENTE',
      title:   'CONVITE DE AMIGO',
      body:    'O sistema de convites está em desenvolvimento. Por enquanto, use modo Solo para jogar ranqueada.',
      actions: [{ label: 'OK', kind: 'primary', onClick: () => {} }],
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE SWITCHER OVERLAY
  // ═══════════════════════════════════════════════════════════════════════════

  private showModeSwitcher(): void {
    if (this.searching) return
    showPlayModesOverlay(this, {
      title: 'ALTERAR MODO',
      currentTarget: 'RankedScene',
      dimSceneBackground: true,
    })
  }

  shutdown(): void {
    this.tweens.killAll()
  }
}
