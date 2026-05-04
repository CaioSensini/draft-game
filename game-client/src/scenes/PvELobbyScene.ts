/**
 * PvELobbyScene.ts -- Room/Party PvE lobby.
 *
 * Accepts { pveType: 'battle' | 'tournament' } from LobbyScene.
 *
 * "Batalha PvE"  — instant fight vs smart bot at player level.
 * "Torneio PvE"  — bracket tournament with level-range selection.
 *
 * Room has 4 SLOTS (one per class). Each slot is filled by a player.
 * Mode is DERIVED from playerCount (same as PvP):
 *   1 player  = Solo   (controls all 4 chars)
 *   2 players = Duo    (2 chars each)
 *   4 players = Squad  (1 char each)
 *   3 players = blocked (need 4th)
 */

import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import { drawCharacterSprite, type SpriteRole } from '../utils/SpriteFactory'
import { openSkinPicker } from '../utils/SkinPicker'
import { showPlayModesOverlay } from '../utils/PlayModesOverlay'
import { getRankedTierName, RANKED_TIERS } from '../data/tournaments'
import type { UnitRole } from '../engine/types'
import type { CharClass } from '../utils/AssetPaths'
import {
  SCREEN, surface, border, fg, accent, state, currency,
  colors, fontFamily, typeScale, radii, motion,
} from '../utils/DesignTokens'
import { t } from '../i18n'

const W = SCREEN.W
const H = SCREEN.H

// ── Static data ──────────────────────────────────────────────────────────────

const ROLES: UnitRole[] = ['king', 'warrior', 'specialist', 'executor']

type DerivedMode = 'Solo' | 'Duo' | 'Squad'
type PvEType = 'battle' | 'tournament'

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

// Level brackets for Torneio
interface LevelBracket {
  level: number
  label: string
  cost: number
}

const LEVEL_BRACKETS: LevelBracket[] = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]
  .map(lvl => ({
    level: lvl,
    label: `Lv.${lvl}`,
    cost: 50 + Math.floor((lvl - 1) / 5) * 25,
  }))

// Layout constants
const TOP_H = 56

interface RoomSlot {
  role: UnitRole
  playerName: string | null
  isMe: boolean
}

// ── Scene ────────────────────────────────────────────────────────────────────

export default class PvELobbyScene extends Phaser.Scene {
  // State
  private roomSlots: RoomSlot[] = []
  private playerCount = 1
  private pveType: PvEType = 'battle'
  private selectedBracketIndex = 0

  // UI references
  private cardContainers: Phaser.GameObjects.Container[] = []
  private bracketLabel: Phaser.GameObjects.Text | null = null
  private bracketCost:  Phaser.GameObjects.Text | null = null
  private infoTexts: Phaser.GameObjects.Text[] = []

  constructor() { super('PvELobbyScene') }

  init(data?: { pveType?: PvEType }): void {
    this.pveType = data?.pveType ?? 'battle'
  }

  create(): void {
    this.cardContainers = []
    this.infoTexts = []
    this.playerCount = 1

    // Auto-select bracket closest to player level
    const pLvl = playerData.getLevel()
    let closestIdx = 0
    let closestDist = Math.abs(LEVEL_BRACKETS[0].level - pLvl)
    for (let i = 1; i < LEVEL_BRACKETS.length; i++) {
      const dist = Math.abs(LEVEL_BRACKETS[i].level - pLvl)
      if (dist < closestDist) { closestDist = dist; closestIdx = i }
    }
    this.selectedBracketIndex = closestIdx

    this.initRoom()

    UI.background(this, { vignette: false })
    UI.fadeIn(this)

    this.drawHeader()
    this.drawTeamPanel()
    this.drawRoomLog()
    this.drawBonusPanel()
    this.drawInfoPanel()
    this.drawBracketSelector()
    this.drawInviteButton()
    this.drawStartButton()
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

  private get currentBracket(): LevelBracket {
    return LEVEL_BRACKETS[this.selectedBracketIndex]
  }

  // ── Header ────────────────────────────────────────────────────────────────

  private drawHeader(): void {
    // ETAPA 6.9i: every top-bar element lifted to depth 100+ so it
    // renders above any other scene content (see PvPLobbyScene comment).
    const TBD = 100

    const bar = this.add.graphics().setDepth(TBD)
    bar.fillStyle(surface.panel, 1)
    bar.fillRect(0, 0, W, TOP_H)
    bar.lineStyle(1, border.subtle, 1)
    bar.beginPath()
    bar.moveTo(0, TOP_H - 0.5)
    bar.lineTo(W, TOP_H - 0.5)
    bar.strokePath()

    UI.backArrow(this, () => transitionTo(this, 'LobbyScene')).setDepth(TBD + 1)

    // Title (eyebrow + h2)
    this.add.text(W / 2, TOP_H / 2 - 10, t('scenes.pve.title'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8).setDepth(TBD + 1)

    const titleWord = this.pveType === 'battle' ? t('scenes.pve.battle-title') : t('scenes.pve.tournament-title')
    this.add.text(W / 2, TOP_H / 2 + 10, titleWord, {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '600',
    }).setOrigin(0.5).setLetterSpacing(3).setDepth(TBD + 1)

    // Mode switcher button (left) — mirrors CustomLobby layout per ETAPA 6.3
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
    this.add.text(pillX, pillY, modeLabel(this.derivedMode), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.4).setDepth(TBD + 2)
  }

  // ── Team panel ────────────────────────────────────────────────────────────

  private drawTeamPanel(): void {
    const panelX = 40
    const panelY = TOP_H + 20
    const panelW = 880
    const panelH = 300

    // Panel shell
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(panelX, panelY, panelW, panelH, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(panelX, panelY, panelW, panelH, radii.lg)
    bg.fillStyle(accent.primary, 0.45)
    bg.fillRect(panelX + 16, panelY, panelW - 32, 1)

    // Eyebrow
    this.add.text(panelX + 24, panelY + 20, t('scenes.lobby-shared.your-team'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    this.drawCards(panelX + panelW / 2, panelY + 38)
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

      // Card bg
      const bg = this.add.graphics()
      bg.fillStyle(surface.raised, 1)
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, radii.lg)
      // Class-color band (top)
      bg.fillStyle(classAccent, 0.14)
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, 44,
        { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })
      // Border (brighter when filled/isMe)
      const borderColor = slot.isMe ? classAccent : isFilled ? border.default : border.subtle
      bg.lineStyle(1, borderColor, 1)
      bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, radii.lg)
      container.add(bg)

      // Class label (top band)
      const roleLabelText = this.add.text(0, -cardH / 2 + 22, roleLabel(slot.role), {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      classAccentHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.8)
      container.add(roleLabelText)

      // Preview sprite or class icon
      if (isFilled) {
        const skinId = slot.isMe ? playerData.getEquippedSkin(slot.role as CharClass) : 'idle'
        const sprite = drawCharacterSprite(this, slot.role as SpriteRole, 'left', 86, skinId)
        sprite.setPosition(0, -cardH / 2 + 102)
        container.add(sprite)

        // Pedestal
        const ped = this.add.graphics()
        ped.fillStyle(classAccent, slot.isMe ? 0.24 : 0.12)
        ped.fillEllipse(0, -cardH / 2 + 152, cardW * 0.58, 12)
        container.add(ped)
        container.sendToBack(ped)
        container.bringToTop(sprite)
      } else {
        UI.classIcon(this, cx, cardCenterY - cardH / 2 + 102, slot.role, 34, classAccent)
      }

      // Name (Cormorant h3)
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
          // Alter skin pill (token-ized)
          const pillW = 132
          const pillH = 24
          const pillY = -cardH / 2 + 212
          const pillG = this.add.graphics()
          const drawPill = (hover: boolean) => {
            pillG.clear()
            pillG.fillStyle(hover ? surface.raised : surface.deepest, 1)
            pillG.fillRoundedRect(-pillW / 2, pillY - pillH / 2, pillW, pillH, radii.md)
            pillG.lineStyle(1, hover ? accent.primary : accent.dim, 1)
            pillG.strokeRoundedRect(-pillW / 2, pillY - pillH / 2, pillW, pillH, radii.md)
          }
          drawPill(false)
          container.add(pillG)

          const pillLabel = this.add.text(0, pillY, t('scenes.lobby-shared.change-skin'), {
            fontFamily: fontFamily.body,
            fontSize:   typeScale.meta,
            color:      accent.primaryHex,
            fontStyle:  '700',
          }).setOrigin(0.5).setLetterSpacing(1.4)
          container.add(pillLabel)

          const pillHit = this.add.rectangle(0, pillY, pillW + 8, pillH + 8, 0x000000, 0.001)
            .setInteractive({ useHandCursor: true })
          container.add(pillHit)
          pillHit.on('pointerover', () => { drawPill(true); pillLabel.setColor(fg.primaryHex) })
          pillHit.on('pointerout',  () => { drawPill(false); pillLabel.setColor(accent.primaryHex) })
          pillHit.on('pointerdown', () => {
            openSkinPicker(this, slot.role as CharClass, {
              side: 'left',
              onChange: () => this.drawCards(centerX, topY),
            })
          })
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
      }

      // Entrance animation
      container.setAlpha(0).setScale(0.94)
      this.tweens.add({
        targets: container,
        alpha: 1, scaleX: 1, scaleY: 1,
        duration: 300, delay: 90 + i * 80, ease: 'Back.easeOut',
      })
    })
  }

  // ── Room log (right sidebar) ──────────────────────────────────────────────

  private drawRoomLog(): void {
    const logX = W - 200
    const logY = TOP_H + 20
    const logW = 200
    const logH = 300

    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(logX - logW / 2, logY, logW, logH, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(logX - logW / 2, logY, logW, logH, radii.lg)
    bg.fillStyle(accent.primary, 0.45)
    bg.fillRect(logX - logW / 2 + 16, logY, logW - 32, 1)

    this.add.text(logX, logY + 18, `SALA ${this.playerCount}/4`, {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8)

    // Get highest elo
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

    let y = logY + 48
    unique.forEach(p => {
      UI.tierIcon(this, logX - logW / 2 + 22, y, bestInfo.tier, 12)
      this.add.text(logX - logW / 2 + 40, y, p.name, {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.small,
        color:      p.isMe ? accent.primaryHex : fg.primaryHex,
        fontStyle:  p.isMe ? '700' : '500',
      }).setOrigin(0, 0.5)

      this.add.text(logX + logW / 2 - 14, y, getRankedTierName(bestInfo.tier).toUpperCase(), {
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

    entries.forEach((entry, i) => {
      const isActive = entry.mode === this.derivedMode
      const ly = panelY + 48 + i * 24
      const dot = this.add.graphics()
      dot.fillStyle(isActive ? state.success : border.default, 1)
      dot.fillCircle(panelX + 24, ly, 3)

      this.add.text(panelX + 36, ly, entry.label, {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.small,
        color:      isActive ? fg.primaryHex : fg.tertiaryHex,
        fontStyle:  isActive ? '700' : '500',
      }).setOrigin(0, 0.5)

      if (isActive) {
        this.add.text(panelX + panelW - 20, ly, t('scenes.lobby-shared.current-badge'), {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.meta,
          color:      state.successHex,
          fontStyle:  '700',
        }).setOrigin(1, 0.5).setLetterSpacing(1.4)
      }
    })
  }

  // ── Info panel ────────────────────────────────────────────────────────────

  private drawInfoPanel(): void {
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

    this.renderInfoBullets(panelX, panelY)
  }

  private renderInfoBullets(panelX: number, panelY: number): void {
    this.infoTexts.forEach(t => t.destroy())
    this.infoTexts = []

    const bullets = this.pveType === 'battle'
      ? [
          t('scenes.pve.info.smart-bot'),
          t('scenes.pve.info.gold-bonus'),
        ]
      : [
          t('scenes.pve.info.eight-team-bracket'),
          t('scenes.pve.info.scaled-cost'),
          t('scenes.pve.info.scaled-reward'),
        ]

    bullets.forEach((b, i) => {
      const ly = panelY + 48 + i * 22
      const dot = this.add.graphics()
      dot.fillStyle(accent.primary, 1)
      dot.fillCircle(panelX + 24, ly, 2)

      const txt = this.add.text(panelX + 36, ly, b, {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.small,
        color:      fg.secondaryHex,
      }).setOrigin(0, 0.5)
      this.infoTexts.push(txt)
    })
  }

  private refreshInfoPanel(): void {
    this.renderInfoBullets(460, TOP_H + 340)
  }

  // ── Bracket selector (tournament only) ────────────────────────────────────

  private drawBracketSelector(): void {
    const baseX = W / 2
    const baseY = TOP_H + 500

    const container = this.add.container(baseX, baseY)

    // Eyebrow
    container.add(this.add.text(-200, 0, t('scenes.lobby-shared.level-range'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8))

    // Left arrow
    const leftX = -80
    const leftArrow = this.add.text(leftX, 0, '<', {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    container.add(leftArrow)
    const leftHit = this.add.rectangle(leftX, 0, 36, 36, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    leftHit.on('pointerover', () => leftArrow.setColor(accent.primaryHex))
    leftHit.on('pointerout',  () => leftArrow.setColor(fg.primaryHex))
    leftHit.on('pointerdown', () => this.changeBracket(-1))
    container.add(leftHit)

    // Level chip
    const chipW = 108
    const chipH = 32
    const chipBg = this.add.graphics()
    chipBg.fillStyle(surface.deepest, 1)
    chipBg.fillRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, radii.md)
    chipBg.lineStyle(1, accent.primary, 1)
    chipBg.strokeRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, radii.md)
    container.add(chipBg)

    this.bracketLabel = this.add.text(0, 0, this.currentBracket.label, {
      fontFamily: fontFamily.mono,
      fontSize:   typeScale.statMd,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    container.add(this.bracketLabel)

    // Right arrow
    const rightX = 80
    const rightArrow = this.add.text(rightX, 0, '>', {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    container.add(rightArrow)
    const rightHit = this.add.rectangle(rightX, 0, 36, 36, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    rightHit.on('pointerover', () => rightArrow.setColor(accent.primaryHex))
    rightHit.on('pointerout',  () => rightArrow.setColor(fg.primaryHex))
    rightHit.on('pointerdown', () => this.changeBracket(1))
    container.add(rightHit)

    // Cost
    this.bracketCost = this.add.text(130, 0, t('scenes.pve.cost-format', { cost: this.currentBracket.cost }), {
      fontFamily: fontFamily.mono,
      fontSize:   typeScale.small,
      color:      currency.goldCoinHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.2)
    container.add(this.bracketCost)

    container.setVisible(this.pveType === 'tournament')
  }

  private changeBracket(dir: number): void {
    this.selectedBracketIndex = Math.max(0, Math.min(LEVEL_BRACKETS.length - 1, this.selectedBracketIndex + dir))
    if (this.bracketLabel) this.bracketLabel.setText(this.currentBracket.label)
    if (this.bracketCost)  this.bracketCost.setText(t('scenes.pve.cost-format', { cost: this.currentBracket.cost }))
    this.refreshInfoPanel()
  }

  // ── Invite button (under room log) ────────────────────────────────────────

  private drawInviteButton(): void {
    const logX = W - 200
    const logY = TOP_H + 20
    const logH = 300
    const invY = logY + logH + 20

    UI.buttonSecondary(this, logX, invY, t('scenes.lobby-shared.invite-friend'), {
      w: 184,
      h: 36,
      onPress: () => this.showInvitePopup(),
    })
  }

  // ── Start button ──────────────────────────────────────────────────────────

  private drawStartButton(): void {
    const btnX = W / 2
    const btnY = H - 56

    UI.buttonPrimary(this, btnX, btnY, t('scenes.pve.start-match'), {
      size: 'lg',
      w:    320,
      h:    56,
      onPress: () => this.onStartMatch(),
    })
  }

  private onStartMatch(): void {
    if (this.pveType === 'battle') {
      transitionTo(this, 'BattleScene', {
        deckConfig: playerData.getDeckConfig(),
        skinConfig: playerData.getSkinConfig(),
        pveMode: 'battle',
        botLevel: playerData.getLevel(),
      }, 400, 'wipeRight')
    } else {
      transitionTo(this, 'BracketScene', {
        type: 'pve',
        bracketLevel: this.currentBracket.level,
        teamCount: 8,
      })
    }
  }

  // ── Invite popup ──────────────────────────────────────────────────────────

  private showInvitePopup(): void {
    UI.modal(this, {
      eyebrow: t('scenes.lobby-shared.invite-modal.eyebrow'),
      title:   t('scenes.lobby-shared.invite-modal.title'),
      body:    t('scenes.lobby-shared.invite-modal.body-solo'),
      actions: [{ label: 'OK', kind: 'primary', onClick: () => {} }],
    })
  }

  // ── Mode switcher ─────────────────────────────────────────────────────────

  private showModeSwitcher(): void {
    showPlayModesOverlay(this, {
      title: t('scenes.lobby-shared.change-mode'),
      currentTarget: 'PvELobbyScene',
      currentPveType: this.pveType,
      dimSceneBackground: true,
      onModeSelect: (mode) => {
        if (mode.target === 'PvELobbyScene') {
          this.time.delayedCall(200, () => this.scene.restart(mode.data))
        } else {
          transitionTo(this, mode.target, mode.data)
        }
      },
    })
  }

  shutdown(): void {
    this.tweens.killAll()
  }
}

// Prevent unused warnings for values not consumed in the new layout
void motion
