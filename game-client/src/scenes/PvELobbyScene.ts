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
import { RANKED_TIERS } from '../data/tournaments'
import type { UnitRole } from '../engine/types'
import type { CharClass } from '../utils/AssetPaths'
import {
  SCREEN, surface, border, fg, accent, state, currency,
  colors, fontFamily, typeScale, radii, motion,
} from '../utils/DesignTokens'

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
type PvEType = 'battle' | 'tournament'

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
    const bar = this.add.graphics()
    bar.fillStyle(surface.panel, 1)
    bar.fillRect(0, 0, W, TOP_H)
    bar.lineStyle(1, border.subtle, 1)
    bar.beginPath()
    bar.moveTo(0, TOP_H - 0.5)
    bar.lineTo(W, TOP_H - 0.5)
    bar.strokePath()

    UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))

    // Title (eyebrow + h2)
    this.add.text(W / 2, TOP_H / 2 - 10, 'PVE', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8)

    const titleWord = this.pveType === 'battle' ? 'BATALHA' : 'TORNEIO'
    this.add.text(W / 2, TOP_H / 2 + 10, titleWord, {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '600',
    }).setOrigin(0.5).setLetterSpacing(3)

    // Mode switcher button (left) — mirrors CustomLobby layout per ETAPA 6.3
    UI.buttonGhost(this, 156, TOP_H / 2, 'ALTERAR MODO', {
      w: 160,
      h: 32,
      onPress: () => this.showModeSwitcher(),
    })

    // Mode pill (right) — single derivedMode indicator, CustomLobby-aligned
    const pillW = 72
    const pillX = W - 60
    const pillY = TOP_H / 2
    const pillBg = this.add.graphics()
    pillBg.fillStyle(surface.deepest, 1)
    pillBg.fillRoundedRect(pillX - pillW / 2, pillY - 12, pillW, 24, radii.pill)
    pillBg.lineStyle(1, accent.primary, 1)
    pillBg.strokeRoundedRect(pillX - pillW / 2, pillY - 12, pillW, 24, radii.pill)
    this.add.text(pillX, pillY, this.derivedMode.toUpperCase(), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.4)
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
    this.add.text(panelX + 24, panelY + 20, 'SEU TIME', {
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
      const roleLabel = this.add.text(0, -cardH / 2 + 22, ROLE_LABELS[slot.role], {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      classAccentHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.8)
      container.add(roleLabel)

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

        container.add(this.add.text(0, nameY + 20, `NV ${p.level}`, {
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

          const pillLabel = this.add.text(0, pillY, 'ALTERAR SKIN', {
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

      this.add.text(logX + logW / 2 - 14, y, bestTd.name.toUpperCase(), {
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
        this.add.text(panelX + panelW - 20, ly, 'ATUAL', {
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

    this.add.text(panelX + 20, panelY + 20, 'INFORMAÇÕES', {
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
          'Bot inteligente do seu nível',
          'Bônus de Gold por vitória',
        ]
      : [
          'Chaveamento de 8 times',
          'Custo em Gold varia por faixa',
          'Recompensa escalada por round',
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
    container.add(this.add.text(-200, 0, 'FAIXA DE NÍVEL', {
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
    this.bracketCost = this.add.text(130, 0, `CUSTO ${this.currentBracket.cost}G`, {
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
    if (this.bracketCost)  this.bracketCost.setText(`CUSTO ${this.currentBracket.cost}G`)
    this.refreshInfoPanel()
  }

  // ── Invite button (under room log) ────────────────────────────────────────

  private drawInviteButton(): void {
    const logX = W - 200
    const logY = TOP_H + 20
    const logH = 300
    const invY = logY + logH + 20

    UI.buttonSecondary(this, logX, invY, 'CONVIDAR AMIGO', {
      w: 184,
      h: 36,
      onPress: () => this.showInvitePopup(),
    })
  }

  // ── Start button ──────────────────────────────────────────────────────────

  private drawStartButton(): void {
    const btnX = W / 2
    const btnY = H - 56

    UI.buttonPrimary(this, btnX, btnY, 'INICIAR PARTIDA', {
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
      eyebrow: 'PRÓXIMAMENTE',
      title:   'CONVITE DE AMIGO',
      body:    'O sistema de convites está em desenvolvimento. Por enquanto, use modo Solo para jogar.',
      actions: [{ label: 'OK', kind: 'primary', onClick: () => {} }],
    })
  }

  // ── Mode switcher ─────────────────────────────────────────────────────────

  private showModeSwitcher(): void {
    showPlayModesOverlay(this, {
      title: 'ALTERAR MODO',
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
