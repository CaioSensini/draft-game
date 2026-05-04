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
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import { showPlayModesOverlay } from '../utils/PlayModesOverlay'
import { drawCharacterSprite, type SpriteRole } from '../utils/SpriteFactory'
import { RANKED_TIERS } from '../data/tournaments'
import type { UnitRole } from '../engine/types'
import type { CharClass } from '../utils/AssetPaths'
import {
  SCREEN, surface, border, fg, accent, state,
  colors, fontFamily, typeScale, radii,
} from '../utils/DesignTokens'
import { t } from '../i18n'

const W = SCREEN.W
const H = SCREEN.H

// ── Static data ──────────────────────────────────────────────────────────────

const ROLES: UnitRole[] = ['king', 'warrior', 'specialist', 'executor']

const MODE_I18N_KEY: Record<DerivedMode, 'solo' | 'duo' | 'squad'> = {
  Solo: 'solo', Duo: 'duo', Squad: 'squad',
}

function roleLabel(role: UnitRole): string {
  return t(`skills.roles.${role}`)
}

function modeLabel(mode: DerivedMode): string {
  return t(`scenes.lobby-shared.modes.${MODE_I18N_KEY[mode]}`)
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

// Layout constants
const TOP_H = 56
const TEAM_PANEL_X = 40
const TEAM_PANEL_Y = TOP_H + 20
const TEAM_PANEL_W = 880
const TEAM_PANEL_H = 300
const LOG_X = W - 200
const LOG_Y = TOP_H + 20
const LOG_W = 200
const LOG_H = 300

interface RoomSlot {
  role: UnitRole
  playerName: string | null
  isMe: boolean
}

export default class PvPLobbyScene extends Phaser.Scene {
  // State
  private roomSlots: RoomSlot[] = []
  private playerCount = 1

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

  // Matchmaking compatibility shim (MatchmakingScene owns the queue UX now)
  private searching = false
  private searchTimer: Phaser.Time.TimerEvent | null = null

  // Room owner (framework for multiplayer)
  private isRoomOwner = true

  // Swap cooldown
  private swapCooldown = false
  private _swapHLs: Phaser.GameObjects.GameObject[] = []

  constructor() { super('PvPLobbyScene') }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  create(): void {
    this.searching = false
    this.swapCooldown = false
    this.searchTimer = null
    this.cardContainers = []
    this.bonusTextObjs = []
    this.bonusBadges = []
    this.blockedLabel = null
    this.backBtn = null
    this.playerCount = 1
    this._swapHLs = []

    this.initRoom()

    UI.background(this, { vignette: false })
    UI.fadeIn(this)

    this.drawHeader()
    this.drawTeamPanel()
    this.drawRoomLog()
    this.drawBonusPanel()
    this.drawRulesPanel()
    this.drawInviteButton()
    this.drawSearchButton()
  }

  // ── State ─────────────────────────────────────────────────────────────────

  private initRoom(): void {
    const p = playerData.get()
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

  // ── Header ────────────────────────────────────────────────────────────────

  private drawHeader(): void {
    // ETAPA 6.9i: every top-bar element (bar + back arrow + texts + pill)
    // sits at depth 100. The user reported perceived dark stripes on the
    // bar that pixel sampling could not find — instead of fighting the
    // root cause, we lift the bar above any other scene content so the
    // text always reads cleanly on top.
    const TBD = 100

    const bar = this.add.graphics().setDepth(TBD)
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
    this.backBtn.setDepth(TBD + 1)

    // Eyebrow + title
    this.add.text(W / 2, TOP_H / 2 - 10, t('scenes.pvp.title'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8).setDepth(TBD + 1)

    this.add.text(W / 2, TOP_H / 2 + 10, t('scenes.pvp.subtitle'), {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '600',
    }).setOrigin(0.5).setLetterSpacing(3).setDepth(TBD + 1)

    // Mode switcher (left) — mirrors CustomLobby layout per ETAPA 6.3
    const altModoBtn = UI.buttonGhost(this, 156, TOP_H / 2, t('scenes.lobby-shared.change-mode'), {
      w: 160,
      h: 32,
      onPress: () => this.showModeSwitcher(),
    })
    altModoBtn.container.setDepth(TBD + 1)

    // Mode pill (right) — single derivedMode indicator, CustomLobby-aligned
    const pillW = 72
    const pillX = W - 60
    const pillY = TOP_H / 2
    const pillBg = this.add.graphics().setDepth(TBD + 1)
    pillBg.fillStyle(surface.deepest, 1)
    // ETAPA 6.9j root cause: radii.pill (999) overflows Phaser's
    // fillRoundedRect — the arc geometry extends across the canvas
    // and renders surface.deepest as visible "stripes" on the bar.
    // Use a sane radius equal to half the height instead.
    pillBg.fillRoundedRect(pillX - pillW / 2, pillY - 12, pillW, 24, 12)
    pillBg.lineStyle(1, accent.primary, 1)
    pillBg.strokeRoundedRect(pillX - pillW / 2, pillY - 12, pillW, 24, 12)
    this.modePillLabel = this.add.text(pillX, pillY, modeLabel(this.derivedMode), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.4).setDepth(TBD + 2)
  }

  private refreshModePill(): void {
    if (this.modePillLabel) this.modePillLabel.setText(modeLabel(this.derivedMode))
  }

  // ── Team panel ────────────────────────────────────────────────────────────

  private drawTeamPanel(): void {
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(TEAM_PANEL_X, TEAM_PANEL_Y, TEAM_PANEL_W, TEAM_PANEL_H, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(TEAM_PANEL_X, TEAM_PANEL_Y, TEAM_PANEL_W, TEAM_PANEL_H, radii.lg)
    bg.fillStyle(accent.primary, 0.45)
    bg.fillRect(TEAM_PANEL_X + 16, TEAM_PANEL_Y, TEAM_PANEL_W - 32, 1)

    this.add.text(TEAM_PANEL_X + 24, TEAM_PANEL_Y + 20, t('scenes.lobby-shared.your-team'), {
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

    const cardW = 200
    const cardH = 240
    const gap = 16
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
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, 44,
        { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })
      const borderColor = slot.isMe ? classAccent : isFilled ? border.default : border.subtle
      bg.lineStyle(1, borderColor, 1)
      bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, radii.lg)
      container.add(bg)

      container.add(this.add.text(0, -cardH / 2 + 22, roleLabel(slot.role), {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      classAccentHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.8))

      if (isFilled) {
        const skinId = slot.isMe ? playerData.getEquippedSkin(slot.role as CharClass) : 'idle'
        const sprite = drawCharacterSprite(this, slot.role as SpriteRole, 'left', 86, skinId)
        sprite.setPosition(0, -cardH / 2 + 102)
        container.add(sprite)

        const ped = this.add.graphics()
        ped.fillStyle(classAccent, slot.isMe ? 0.24 : 0.12)
        ped.fillEllipse(0, -cardH / 2 + 152, cardW * 0.58, 12)
        container.add(ped)
        container.sendToBack(ped)
        container.bringToTop(sprite)
      } else {
        UI.classIcon(this, cx, cardCenterY - cardH / 2 + 102, slot.role, 34, classAccent)
      }

      const nameY = -cardH / 2 + 172
      if (isFilled) {
        container.add(this.add.text(0, nameY, slot.playerName!, {
          fontFamily: fontFamily.serif,
          fontSize:   typeScale.h3,
          color:      slot.isMe ? fg.primaryHex : fg.secondaryHex,
          fontStyle:  '600',
        }).setOrigin(0.5))

        container.add(this.add.text(0, nameY + 20, t('scenes.lobby-shared.level-short', { level: p.level }), {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      fg.tertiaryHex,
          fontStyle:  '700',
        }).setOrigin(0.5).setLetterSpacing(1.4))

        if (slot.isMe) {
          // "SEU" badge
          const badgeW = 68
          const badgeY = -cardH / 2 + 210
          const badge = this.add.graphics()
          badge.fillStyle(state.successDim, 1)
          badge.fillRoundedRect(-badgeW / 2, badgeY - 10, badgeW, 20, radii.md)
          badge.lineStyle(1, state.success, 1)
          badge.strokeRoundedRect(-badgeW / 2, badgeY - 10, badgeW, 20, radii.md)
          container.add(badge)
          container.add(this.add.text(0, badgeY, t('scenes.lobby-shared.your-badge-short'), {
            fontFamily: fontFamily.body,
            fontSize:   typeScale.meta,
            color:      state.successHex,
            fontStyle:  '700',
          }).setOrigin(0.5).setLetterSpacing(1.6))
        }

        if (this.derivedMode !== 'Solo') {
          this.drawSwapButton(container, cardW, cardH, i)
        }
      } else {
        container.add(this.add.text(0, nameY, t('scenes.lobby-shared.empty-slot'), {
          fontFamily: fontFamily.serif,
          fontSize:   typeScale.h3,
          color:      fg.tertiaryHex,
          fontStyle:  'italic',
        }).setOrigin(0.5))

        container.add(this.add.text(0, nameY + 18, t('scenes.lobby-shared.waiting'), {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.small,
          color:      fg.disabledHex,
        }).setOrigin(0.5))

        // Mini invite pill
        const invW = 112
        const invH = 26
        const invY = -cardH / 2 + 210
        const invG = this.add.graphics()
        invG.fillStyle(surface.deepest, 1)
        invG.fillRoundedRect(-invW / 2, invY - invH / 2, invW, invH, radii.md)
        invG.lineStyle(1, state.info, 1)
        invG.strokeRoundedRect(-invW / 2, invY - invH / 2, invW, invH, radii.md)
        container.add(invG)

        const invText = this.add.text(0, invY, t('scenes.lobby-shared.invite'), {
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

  // ── Swap button ──────────────────────────────────────────────────────────

  private drawSwapButton(
    container: Phaser.GameObjects.Container,
    _cardW: number, cardH: number,
    slotIndex: number,
  ): void {
    const btnR = 13
    const bx = 80
    const by = -cardH / 2 + 22

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

    // Unicode swap glyph
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

      const hl = this.add.rectangle(card.x, card.y, 188, 232, accent.primary, 0.12)
        .setStrokeStyle(2, accent.primary, 0.65).setDepth(15)
      this.tweens.add({ targets: hl, alpha: { from: 0.08, to: 0.22 }, duration: 520, yoyo: true, repeat: -1 })
      this._swapHLs.push(hl)

      const txt = this.add.text(card.x, card.y + 74, t('scenes.lobby-shared.swap'), {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      accent.primaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.8).setDepth(16)
      this._swapHLs.push(txt)

      const hit = this.add.rectangle(card.x, card.y, 188, 232, 0, 0.001).setInteractive({ useHandCursor: true }).setDepth(17)
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
    this.refreshModePill()
    this.refreshBonusHighlight()
    this.refreshSearchState()
    this.drawCards(TEAM_PANEL_X + TEAM_PANEL_W / 2, TEAM_PANEL_Y + 38)
  }

  // ── Room log (right) ──────────────────────────────────────────────────────

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

    const ranked = playerData.getRanked()
    const allInfos = [ranked['1v1'], ranked['2v2'], ranked['4v4']]
    const tierOrder = ['desconhecido', 'recruta', 'aprendiz', 'soldado', 'veterano', 'comandante', 'rei']
    let bestInfo = allInfos[0]
    for (const info of allInfos) {
      if (tierOrder.indexOf(info.tier) > tierOrder.indexOf(bestInfo.tier)) bestInfo = info
      else if (info.tier === bestInfo.tier && info.lp > bestInfo.lp) bestInfo = info
    }
    const bestTd = RANKED_TIERS[bestInfo.tier]

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
  }

  // ── Bonus panel ───────────────────────────────────────────────────────────

  private drawBonusPanel(): void {
    const panelX = 40
    const panelY = TOP_H + 340
    const panelW = 400
    const panelH = 140

    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(panelX, panelY, panelW, panelH, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(panelX, panelY, panelW, panelH, radii.lg)

    this.add.text(panelX + 20, panelY + 20, t('scenes.lobby-shared.team-bonus'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    const entries: { label: string; mode: DerivedMode }[] = [
      { label: t('scenes.lobby-shared.mode-bonus.solo'), mode: 'Solo' },
      { label: t('scenes.lobby-shared.mode-bonus.duo'), mode: 'Duo' },
      { label: t('scenes.lobby-shared.mode-bonus.squad'), mode: 'Squad' },
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

      const badge = this.add.text(panelX + panelW - 20, ly, t('scenes.lobby-shared.current-badge'), {
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

  // ── Rules panel ───────────────────────────────────────────────────────────

  private drawRulesPanel(): void {
    const panelX = 460
    const panelY = TOP_H + 340
    const panelW = 460
    const panelH = 140

    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(panelX, panelY, panelW, panelH, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(panelX, panelY, panelW, panelH, radii.lg)

    this.add.text(panelX + 20, panelY + 20, t('scenes.lobby-shared.team-info'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    const bullets = [
      t('scenes.pvp.info.no-entry-cost'),
      t('scenes.pvp.info.level-matchmaking'),
      t('scenes.pvp.info.any-team-size'),
      t('scenes.pvp.info.gold-rewards'),
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

  // ── Invite button (below room log) ────────────────────────────────────────

  private drawInviteButton(): void {
    const invY = LOG_Y + LOG_H + 20
    UI.buttonSecondary(this, LOG_X, invY, t('scenes.lobby-shared.invite-friend'), {
      w: 184,
      h: 36,
      onPress: () => this.showInvitePopup(),
    })
  }

  // ── Search button ─────────────────────────────────────────────────────────

  private drawSearchButton(): void {
    const btnX = W / 2
    const btnY = H - 56

    this.searchBtnRef = UI.buttonPrimary(this, btnX, btnY, t('scenes.pvp.search-opponents'), {
      size: 'lg',
      w:    340,
      h:    56,
      onPress: () => {
        if (this.searching) {
          this.cancelSearch()
        } else {
          this.startSearch()
        }
      },
    })

    // Find the label text so we can update copy on state changes.
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
      if (this.searchBtnLabel) this.searchBtnLabel.setText(t('scenes.lobby-shared.room-incomplete', { current: 3, max: 4 }))
      this.blockedLabel = this.add.text(W / 2, H - 102, t('scenes.pvp.squad-incomplete'), {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.small,
        color:      state.errorHex,
        fontStyle:  'italic',
      }).setOrigin(0.5)
    } else if (!this.searching) {
      this.searchBtnRef.setDisabled(false)
      if (this.searchBtnLabel) this.searchBtnLabel.setText(t('scenes.pvp.search-opponents'))
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
      mode:        'casual',
      playerCount,
      returnTo:    'PvPLobbyScene',
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

  // ── Invite popup ──────────────────────────────────────────────────────────

  private showInvitePopup(): void {
    if (this.searching) return
    UI.modal(this, {
      eyebrow: t('scenes.lobby-shared.invite-modal.eyebrow'),
      title:   t('scenes.lobby-shared.invite-modal.title'),
      body:    t('scenes.lobby-shared.invite-modal.body-solo'),
      actions: [{ label: 'OK', kind: 'primary', onClick: () => {} }],
    })
  }

  // ── Mode switcher ─────────────────────────────────────────────────────────

  private showModeSwitcher(): void {
    if (this.searching) return
    showPlayModesOverlay(this, {
      title: t('scenes.lobby-shared.change-mode'),
      currentTarget: 'PvPLobbyScene',
      dimSceneBackground: true,
    })
  }

  shutdown(): void {
    this.tweens.killAll()
  }
}
