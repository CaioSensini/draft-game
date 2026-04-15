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
import { C, F, S, SHADOW, SCREEN } from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import { drawCharacterSprite, type SpriteRole } from '../utils/SpriteFactory'
import { openSkinPicker } from '../utils/SkinPicker'
import { showPlayModesOverlay } from '../utils/PlayModesOverlay'
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

type PvEType = 'battle' | 'tournament'

// ── Level brackets for Torneio ──────────────────────────────────────────────

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

// ── Interfaces ───────────────────────────────────────────────────────────────

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
  private modeLabel!: Phaser.GameObjects.Text
  private modeBadgeBg!: Phaser.GameObjects.Graphics
  private bonusTexts: Phaser.GameObjects.Text[] = []
  private startBg!: Phaser.GameObjects.Graphics

  // Tab buttons
  // Mode tabs removed — "Alterar Modo" handles switching

  // Bracket UI
  private bracketContainer: Phaser.GameObjects.Container | null = null

  // Info panel text
  private infoTexts: Phaser.GameObjects.Text[] = []

  constructor() { super('PvELobbyScene') }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  init(data?: { pveType?: PvEType }): void {
    this.pveType = data?.pveType ?? 'battle'
  }

  create(): void {
    this.cardContainers = []
    this.bonusTexts = []
    this.infoTexts = []
    this.bracketContainer = null
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

    UI.background(this)
    UI.particles(this, 15)
    UI.fadeIn(this)

    this.drawHeader()
    // Mode tabs removed — use "Alterar Modo" button instead
    this.drawTeamPanel()
    this.drawRoomLog()
    this.drawBonusPanel()
    this.drawInfoPanel()
    this.drawBracketSelector()
    this.drawInviteButton()
    this.drawStartButton()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════

  private drawHeader(): void {
    const stk = { stroke: '#000000', strokeThickness: 3 }

    // Title centered — two lines
    const topWord = this.pveType === 'battle' ? 'BATALHA' : 'TORNEIO'
    this.add.text(W / 2, 16, topWord, {
      fontFamily: F.title, fontSize: '20px', color: '#ffffff',
      fontStyle: 'bold', shadow: SHADOW.strong, ...stk,
    }).setOrigin(0.5)
    this.add.text(W / 2, 36, 'PVE', {
      fontFamily: F.title, fontSize: '16px', color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow, ...stk,
    }).setOrigin(0.5)

    // Mode label (SOLO) — right side, slightly lower
    this.modeBadgeBg = this.add.graphics()
    this.modeLabel = this.add.text(W - 140, 26, 'SOLO', {
      fontFamily: F.title, fontSize: '20px', color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow, ...stk,
    }).setOrigin(0.5)

    this.refreshModeBadge()

    // Room count removed

    // Back arrow
    UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))

    // Mode switcher button (left side, dark panel with gold border)
    const switchBtnW = 110
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
    this.modeLabel.setText('SOLO')
    this.modeBadgeBg.clear()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE TABS (Batalha / Torneio toggle)
  // ═══════════════════════════════════════════════════════════════════════════

  // Mode tabs removed — "Alterar Modo" button handles mode switching now

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

    this.add.text(panelX - panelW / 2 + 24, panelY + 12, 'SEU TIME', {
      fontFamily: F.title, fontSize: '24px', color: C.goldDimHex,
      fontStyle: 'bold', shadow: SHADOW.text, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5)

    const divG = this.add.graphics()
    divG.fillStyle(C.goldDim, 0.15)
    divG.fillRect(panelX - panelW / 2 + 20, panelY + 22, panelW - 40, 1)

    this.drawCards(panelX, panelY + 24)
  }

  private drawCards(centerX: number, topY: number): void {
    this.cardContainers.forEach((c) => c.destroy())
    this.cardContainers = []

    const cardW = 200
    const cardH = 240
    const gap = 12
    const totalW = 4 * cardW + 3 * gap
    const startX = centerX - totalW / 2 + cardW / 2
    const cardCenterY = topY + cardH / 2 + 6

    const p = playerData.get()
    const stk2 = { stroke: '#000000', strokeThickness: 2 }

    this.roomSlots.forEach((slot, i) => {
      const cx = startX + i * (cardW + gap)
      const container = this.add.container(cx, cardCenterY)
      this.cardContainers.push(container)

      const accent = CLASS_ACCENTS[slot.role]
      const accentHex = '#' + accent.toString(16).padStart(6, '0')
      const isFilled = slot.playerName !== null

      const bg = this.add.graphics()
      bg.fillStyle(0x0e1420, 1)
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, S.borderRadius)
      bg.fillStyle(accent, 0.08)
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, 46, { tl: S.borderRadius, tr: S.borderRadius, bl: 0, br: 0 })
      const borderAlpha = slot.isMe ? 0.55 : isFilled ? 0.35 : 0.2
      bg.lineStyle(1.5, slot.isMe ? accent : isFilled ? 0x555555 : 0x333333, borderAlpha)
      bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, S.borderRadius)
      container.add(bg)

      // Character preview sprite — uses the player's equipped skin so they
      // can see what they look like without entering battle. Bot/friend slots
      // fall back to the default 'idle' skin since we don't track their data.
      if (isFilled) {
        const skinId = slot.isMe ? playerData.getEquippedSkin(slot.role as CharClass) : 'idle'
        const sprite = drawCharacterSprite(this, slot.role as SpriteRole, 'left', 86, skinId)
        sprite.setPosition(0, -cardH / 2 + 56)
        container.add(sprite)

        // Subtle pedestal glow
        const ped = this.add.graphics()
        ped.fillStyle(accent, slot.isMe ? 0.22 : 0.1)
        ped.fillEllipse(0, -cardH / 2 + 100, cardW * 0.55, 14)
        container.add(ped)
        container.sendToBack(ped)
        container.bringToTop(sprite)
      } else {
        UI.classIcon(this, cx, cardCenterY - cardH / 2 + 50, slot.role, 26, accent)
      }

      container.add(this.add.text(0, -cardH / 2 + 110, ROLE_LABELS[slot.role], {
        fontFamily: F.title, fontSize: '17px', color: accentHex,
        fontStyle: 'bold', shadow: SHADOW.text, ...stk2,
      }).setOrigin(0.5))

      const divLine = this.add.graphics()
      divLine.fillStyle(accent, 0.15)
      divLine.fillRect(-cardW / 2 + 16, -cardH / 2 + 124, cardW - 32, 1)
      container.add(divLine)

      if (isFilled) {
        const displayName = slot.playerName!
        container.add(this.add.text(0, -cardH / 2 + 142, displayName, {
          fontFamily: F.body, fontSize: '15px',
          color: slot.isMe ? C.bodyHex : C.infoHex,
          fontStyle: 'bold', shadow: SHADOW.text, ...stk2,
        }).setOrigin(0.5))

        container.add(this.add.text(0, -cardH / 2 + 162, `Lv.${p.level}`, {
          fontFamily: F.body, fontSize: '13px', color: C.mutedHex,
          shadow: SHADOW.text, ...stk2,
        }).setOrigin(0.5))

        if (slot.isMe) {
          // ALTERAR SKIN pill — opens the picker and refreshes the card
          const pillW = 124
          const pillH = 24
          const pillY = -cardH / 2 + 192
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
            fontFamily: F.title, fontSize: '11px', color: C.goldDimHex,
            fontStyle: 'bold', shadow: SHADOW.text, ...stk2,
          }).setOrigin(0.5)
          container.add(pillLabel)

          const pillHit = this.add.rectangle(0, pillY, pillW + 8, pillH + 8, 0x000000, 0.001)
            .setInteractive({ useHandCursor: true })
          container.add(pillHit)
          pillHit.on('pointerover', () => { drawPill(true); pillLabel.setColor(C.goldHex) })
          pillHit.on('pointerout', () => { drawPill(false); pillLabel.setColor(C.goldDimHex) })
          pillHit.on('pointerdown', () => {
            openSkinPicker(this, slot.role as CharClass, {
              side: 'left',
              onChange: () => this.drawCards(centerX, topY),
            })
          })

          // SEU username badge
          const myBadge = this.add.graphics()
          myBadge.fillStyle(C.success, 0.12)
          myBadge.fillRoundedRect(-34, -cardH / 2 + 212, 68, 22, 4)
          myBadge.lineStyle(1, C.success, 0.45)
          myBadge.strokeRoundedRect(-34, -cardH / 2 + 212, 68, 22, 4)
          container.add(myBadge)

          container.add(this.add.text(0, -cardH / 2 + 223, p.username, {
            fontFamily: F.title, fontSize: '11px', color: C.successHex,
            fontStyle: 'bold', shadow: SHADOW.text, ...stk2,
          }).setOrigin(0.5))
        }
      } else {
        container.add(this.add.text(0, -cardH / 2 + 128, 'Vazio', {
          fontFamily: F.body, fontSize: '18px', color: C.mutedHex,
          fontStyle: 'bold', shadow: SHADOW.text, ...stk2,
        }).setOrigin(0.5))

        container.add(this.add.text(0, -cardH / 2 + 146, 'Aguardando...', {
          fontFamily: F.body, fontSize: S.bodySmall, color: C.dimHex,
          shadow: SHADOW.text,
        }).setOrigin(0.5))

        // Mini invite on empty card
        const invW = 100
        const invH = 26
        const invBg = this.add.graphics()
        invBg.fillStyle(0x1a2030, 1)
        invBg.fillRoundedRect(-invW / 2, -cardH / 2 + 170 - invH / 2, invW, invH, 4)
        invBg.lineStyle(1, C.info, 0.3)
        invBg.strokeRoundedRect(-invW / 2, -cardH / 2 + 170 - invH / 2, invW, invH, 4)
        container.add(invBg)

        const invText = this.add.text(0, -cardH / 2 + 170, 'Convidar', {
          fontFamily: F.body, fontSize: S.small, color: C.infoHex,
          fontStyle: 'bold', shadow: SHADOW.text,
        }).setOrigin(0.5)
        container.add(invText)

        const invHit = this.add.rectangle(0, -cardH / 2 + 170, invW, invH, 0x000000, 0.001)
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
  // ROOM LOG (right side)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawRoomLog(): void {
    const logX = 1160, logY = 100, logW = 200, logH = 260

    UI.panel(this, logX, logY + logH / 2, logW, logH, { fill: 0x0c1019 })

    this.add.text(logX, logY + 16, `SALA ${this.playerCount}/4`, {
      fontFamily: F.title, fontSize: S.bodySmall, color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)

    this.add.rectangle(logX, logY + 28, logW - 20, 1, C.goldDim, 0.2)

    // Get highest elo across all queues
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

    let y = logY + 46
    unique.forEach(p => {
      UI.tierIcon(this, logX - logW / 2 + 22, y, bestInfo.tier, 12)
      const color = p.isMe ? C.goldHex : C.bodyHex
      this.add.text(logX - logW / 2 + 38, y, p.name, {
        fontFamily: F.body, fontSize: S.bodySmall, color,
        fontStyle: p.isMe ? 'bold' : 'normal', shadow: SHADOW.text,
      }).setOrigin(0, 0.5)

      this.add.text(logX + logW / 2 - 14, y, bestTd.name, {
        fontFamily: F.body, fontSize: '10px', color: bestTd.colorHex,
        shadow: SHADOW.text,
      }).setOrigin(1, 0.5)

      y += 28
    })
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

    const activeIdx = this.derivedMode === 'Solo' ? 0 : this.derivedMode === 'Duo' ? 1 : 2
    this.add.text(
      panelX + panelW / 2 - 20,
      panelY + 44 + activeIdx * 24,
      'Atual',
      {
        fontFamily: F.body, fontSize: '10px', color: C.successHex,
        fontStyle: 'bold', shadow: SHADOW.text,
      },
    ).setOrigin(1, 0.5)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INFO PANEL (changes based on pveType)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawInfoPanel(): void {
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

    this.renderInfoBullets(panelX, panelY, panelW)
  }

  private renderInfoBullets(panelX: number, panelY: number, panelW: number): void {
    // Destroy old info texts
    this.infoTexts.forEach(t => t.destroy())
    this.infoTexts = []

    let bullets: string[]
    if (this.pveType === 'battle') {
      bullets = [
        'Bot inteligente do seu nivel',
        'Bonus de gold por vitoria',
      ]
    } else {
      bullets = [
        'Chaveamento 8 times',
        'Bonus de gold por vitoria',
      ]
    }

    bullets.forEach((b, i) => {
      const txt = this.add.text(panelX - panelW / 2 + 24, panelY + 44 + i * 22, `\u2022  ${b}`, {
        fontFamily: F.body, fontSize: S.bodySmall, color: C.mutedHex,
        shadow: SHADOW.text,
      }).setOrigin(0, 0.5)
      this.infoTexts.push(txt)
    })
  }

  private refreshInfoPanel(): void {
    const panelX = W / 2 + 140
    const panelY = 376
    const panelW = 370
    this.renderInfoBullets(panelX, panelY, panelW)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BRACKET SELECTOR (only visible for Torneio)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawBracketSelector(): void {
    const baseX = W / 2
    const baseY = 530

    this.bracketContainer = this.add.container(baseX, baseY)

    // Label
    this.bracketContainer.add(this.add.text(-180, 0, 'Nivel:', {
      fontFamily: F.title, fontSize: S.bodySmall, color: C.goldDimHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0, 0.5))

    // Left arrow
    const leftArrow = this.add.text(-60, 0, '<', {
      fontFamily: F.title, fontSize: S.titleSmall, color: C.infoHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    leftArrow.on('pointerdown', () => this.changeBracket(-1))
    leftArrow.on('pointerover', () => leftArrow.setColor('#80e0ff'))
    leftArrow.on('pointerout', () => leftArrow.setColor(C.infoHex))
    this.bracketContainer.add(leftArrow)

    // Bracket display
    const bracketBg = this.add.graphics()
    bracketBg.fillStyle(0x0e1420, 1)
    bracketBg.fillRoundedRect(-40, -16, 80, 32, 4)
    bracketBg.lineStyle(1, C.warning, 0.5)
    bracketBg.strokeRoundedRect(-40, -16, 80, 32, 4)
    this.bracketContainer.add(bracketBg)

    const bracketLabel = this.add.text(0, 0, this.currentBracket.label, {
      fontFamily: F.title, fontSize: S.body, color: C.warningHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)
    this.bracketContainer.add(bracketLabel)

    // Right arrow
    const rightArrow = this.add.text(60, 0, '>', {
      fontFamily: F.title, fontSize: S.titleSmall, color: C.infoHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    rightArrow.on('pointerdown', () => this.changeBracket(1))
    rightArrow.on('pointerover', () => rightArrow.setColor('#80e0ff'))
    rightArrow.on('pointerout', () => rightArrow.setColor(C.infoHex))
    this.bracketContainer.add(rightArrow)

    // Cost display
    this.bracketContainer.add(this.add.text(120, 0, `| Custo: ${this.currentBracket.cost}g`, {
      fontFamily: F.body, fontSize: S.bodySmall, color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0, 0.5))

    // Store references for updates
    ;(this.bracketContainer as any)._bracketLabel = bracketLabel
    ;(this.bracketContainer as any)._costLabel = this.bracketContainer.list[this.bracketContainer.list.length - 1]

    this.refreshBracketVisibility()
  }

  private changeBracket(dir: number): void {
    this.selectedBracketIndex = Math.max(0, Math.min(LEVEL_BRACKETS.length - 1, this.selectedBracketIndex + dir))

    if (this.bracketContainer) {
      const lbl = (this.bracketContainer as any)._bracketLabel as Phaser.GameObjects.Text
      const costLbl = (this.bracketContainer as any)._costLabel as Phaser.GameObjects.Text
      if (lbl) lbl.setText(this.currentBracket.label)
      if (costLbl) costLbl.setText(`| Custo: ${this.currentBracket.cost}g`)
    }

    this.refreshInfoPanel()
  }

  private refreshBracketVisibility(): void {
    if (this.bracketContainer) {
      this.bracketContainer.setVisible(this.pveType === 'tournament')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVITE BUTTON (below room log)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawInviteButton(): void {
    const logX = 1160, logY = 100, logW = 200, logH = 260
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
  // START BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  private drawStartButton(): void {
    const btnX = W / 2
    const btnY = 618
    const btnW = 380
    const btnH = 58

    this.startBg = this.add.graphics()
    this.renderStartBtn(this.startBg, btnX, btnY, btnW, btnH, false)

    this.add.text(btnX, btnY, 'INICIAR PARTIDA', {
      fontFamily: F.title, fontSize: S.titleSmall, color: C.successHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)

    const startHit = this.add.rectangle(btnX, btnY, btnW, btnH, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })

    startHit.on('pointerover', () => {
      this.renderStartBtn(this.startBg, btnX, btnY, btnW, btnH, true)
    })
    startHit.on('pointerout', () => {
      this.renderStartBtn(this.startBg, btnX, btnY, btnW, btnH, false)
    })
    startHit.on('pointerdown', () => this.onStartMatch())
  }

  private renderStartBtn(
    g: Phaser.GameObjects.Graphics,
    bx: number, by: number, bw: number, bh: number,
    hovered: boolean,
  ): void {
    g.clear()
    g.fillStyle(hovered ? 0x224422 : 0x1a3a1a, 1)
    g.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, S.borderRadius)
    g.lineStyle(2, C.success, hovered ? 0.8 : 0.6)
    g.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, S.borderRadius)
    g.fillStyle(0xffffff, hovered ? 0.05 : 0.04)
    g.fillRoundedRect(
      bx - bw / 2 + 2, by - bh / 2 + 2, bw - 4, bh * 0.4,
      { tl: S.borderRadius - 1, tr: S.borderRadius - 1, bl: 0, br: 0 },
    )
  }

  private onStartMatch(): void {
    if (this.pveType === 'battle') {
      // Start battle vs smart bot at player level
      transitionTo(this, 'BattleScene', {
        deckConfig: playerData.getDeckConfig(),
        skinConfig: playerData.getSkinConfig(),
        pveMode: 'battle',
        botLevel: playerData.getLevel(),
      }, 400, 'wipeRight')
    } else {
      // Start tournament bracket
      transitionTo(this, 'BracketScene', {
        type: 'pve',
        bracketLevel: this.currentBracket.level,
        teamCount: 8,
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVITE POPUP (placeholder)
  // ═══════════════════════════════════════════════════════════════════════════

  private showInvitePopup(): void {
    const dimBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7)
      .setDepth(100).setInteractive()

    const popup = this.add.container(W / 2, H / 2).setDepth(101).setAlpha(0).setScale(0.9)

    const pW = 360
    const pH = 150

    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x0c1019, 0.98)
    panelBg.fillRoundedRect(-pW / 2, -pH / 2, pW, pH, 10)
    panelBg.lineStyle(1.5, C.info, 0.4)
    panelBg.strokeRoundedRect(-pW / 2, -pH / 2, pW, pH, 10)
    popup.add(panelBg)

    popup.add(this.add.text(0, -28, 'Em breve', {
      fontFamily: F.title, fontSize: S.titleSmall, color: C.infoHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0.5))

    popup.add(this.add.text(0, 4, 'Sistema de convites em desenvolvimento', {
      fontFamily: F.body, fontSize: S.body, color: C.mutedHex,
      shadow: SHADOW.text,
    }).setOrigin(0.5))

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
  // MODE SWITCHER OVERLAY
  // ═══════════════════════════════════════════════════════════════════════════

  private showModeSwitcher(): void {
    showPlayModesOverlay(this, {
      title: 'ALTERAR MODO',
      currentTarget: 'PvELobbyScene',
      currentPveType: this.pveType,
      dimSceneBackground: true,
      onModeSelect: (mode) => {
        if (mode.target === 'PvELobbyScene') {
          // Same scene: restart with new data instead of start+stop
          this.time.delayedCall(200, () => this.scene.restart(mode.data))
        } else {
          transitionTo(this, mode.target, mode.data)
        }
      },
    })
  }
}
