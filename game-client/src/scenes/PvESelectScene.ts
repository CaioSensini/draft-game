import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import { playerData } from '../utils/PlayerDataManager'
import { transitionTo } from '../utils/SceneTransition'
import { UI } from '../utils/UIComponents'
import { C, F, S, SHADOW, SCREEN } from '../utils/DesignTokens'

// ---- Dark Fantasy Premium palette -------------------------------------------

const W = SCREEN.W
const H = SCREEN.H

const CARD_BG         = 0x141a24
const CARD_BG_HOVER   = 0x1a2230
const CARD_BG_SELECT  = 0x1e2838

// Difficulty accent colors (left border)
const DIFF_EASY       = 0x4caf50
const DIFF_MEDIUM     = 0x4fc3f7
const DIFF_HARD       = 0xffa726
const DIFF_EXTREME    = 0xef5350

const DIFF_EASY_HEX   = '#4caf50'
const DIFF_MEDIUM_HEX = '#4fc3f7'
const DIFF_HARD_HEX   = '#ffa726'
const DIFF_EXTREME_HEX = '#ef5350'

// ---- NPC team data ----------------------------------------------------------

interface NpcTeam {
  name: string
  levelMin: number
  levelMax: number
  goldReward: number
  xpReward: number
}

const NPC_TEAMS: NpcTeam[] = [
  { name: 'Guarda da Vila',      levelMin: 1,  levelMax: 5,   goldReward: 50,   xpReward: 30   },
  { name: 'Bandidos da Floresta', levelMin: 5,  levelMax: 10,  goldReward: 100,  xpReward: 60   },
  { name: 'Cavaleiros do Norte',  levelMin: 10, levelMax: 20,  goldReward: 200,  xpReward: 120  },
  { name: 'Esquadrao Sombrio',    levelMin: 20, levelMax: 35,  goldReward: 350,  xpReward: 200  },
  { name: 'Legiao Imperial',      levelMin: 35, levelMax: 50,  goldReward: 500,  xpReward: 300  },
  { name: 'Guardioes Ancioes',    levelMin: 50, levelMax: 75,  goldReward: 750,  xpReward: 500  },
  { name: 'Elite do Dragao',      levelMin: 75, levelMax: 90,  goldReward: 1000, xpReward: 750  },
  { name: 'Campeoes Imortais',    levelMin: 90, levelMax: 100, goldReward: 1500, xpReward: 1000 },
]

// Difficulty accent per team (mapped to 8 teams: 2 easy, 2 medium, 2 hard, 2 extreme)
const DIFFICULTY_ACCENTS: number[] = [
  DIFF_EASY, DIFF_EASY, DIFF_MEDIUM, DIFF_MEDIUM,
  DIFF_HARD, DIFF_HARD, DIFF_EXTREME, DIFF_EXTREME,
]

const DIFFICULTY_LABELS: string[] = [
  'Facil', 'Facil', 'Medio', 'Medio',
  'Dificil', 'Dificil', 'Extremo', 'Extremo',
]

const DIFFICULTY_HEX: string[] = [
  DIFF_EASY_HEX, DIFF_EASY_HEX, DIFF_MEDIUM_HEX, DIFF_MEDIUM_HEX,
  DIFF_HARD_HEX, DIFF_HARD_HEX, DIFF_EXTREME_HEX, DIFF_EXTREME_HEX,
]

// ---- Shared particles (now delegated to UI.particles) -----------------------

// ---- Scene ------------------------------------------------------------------

export default class PvESelectScene extends Phaser.Scene {
  private selectedIdx: number = -1
  private cardBgs: Phaser.GameObjects.Rectangle[] = []
  private accentBars: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super('PvESelectScene')
  }

  create() {
    GameStateManager.set(GameState.MENU)

    this.selectedIdx = -1
    this.cardBgs = []
    this.accentBars = []
    this.drawBackground()
    UI.particles(this, 18)
    this.drawTitle()
    this.drawTeamGrid()
    this.drawBackButton()

    // Fade-in from black
    UI.fadeIn(this)
  }

  // ---- Drawing helpers ------------------------------------------------------

  private drawBackground() {
    UI.background(this)

    // Main panel
    UI.panel(this, W / 2, H / 2, 1080, 640)
  }

  private drawTitle() {
    this.add.text(W / 2, 68, 'CAMPANHA', {
      fontFamily: F.title,
      fontSize: S.titleHuge,
      color: C.goldHex,
      fontStyle: 'bold',
      shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)

    // Decorative emblem: line + diamond + line
    const lineW = 80
    this.add.rectangle(W / 2 - lineW / 2 - 14, 98, lineW, 2, C.goldDim, 0.35)
    this.add.rectangle(W / 2 + lineW / 2 + 14, 98, lineW, 2, C.goldDim, 0.35)
    // Diamond emblem in center
    const diamond = this.add.polygon(W / 2, 98, [0, -6, 6, 0, 0, 6, -6, 0], C.goldDim, 0.5)
    diamond.setOrigin(0.5, 0.5)

    this.add.text(W / 2, 118, 'Escolha um oponente para enfrentar', {
      fontFamily: F.body,
      fontSize: S.body,
      color: C.mutedHex,
      shadow: SHADOW.text,
    }).setOrigin(0.5)
  }

  private drawTeamGrid() {
    const cols = 2
    const cardW = 470
    const cardH = 86
    const gapX = 20
    const gapY = 12
    const gridW = cols * cardW + (cols - 1) * gapX
    const startX = (W - gridW) / 2 + cardW / 2
    const startY = 148

    const playerLevel = playerData.getLevel?.() ?? 1

    NPC_TEAMS.forEach((team, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const cx = startX + col * (cardW + gapX)
      const cy = startY + row * (cardH + gapY) + cardH / 2

      const accent = DIFFICULTY_ACCENTS[idx] ?? DIFF_EASY
      const diffHex = DIFFICULTY_HEX[idx] ?? DIFF_EASY_HEX
      const locked = playerLevel < team.levelMin

      // Card background with shadow
      const shadow = this.add.rectangle(cx + 2, cy + 3, cardW, cardH, C.shadow, 0.2)
      const bg = this.add.rectangle(cx, cy, cardW, cardH, locked ? 0x0e1018 : CARD_BG)
        .setStrokeStyle(1, C.panelBorder, locked ? 0.1 : 0.25)
      if (!locked) bg.setInteractive({ useHandCursor: true })
      this.cardBgs.push(bg)

      // Left accent border (difficulty color) - 4px bar on left edge
      const accentBar = this.add.rectangle(
        cx - cardW / 2 + 2, cy, 4, cardH - 8, accent, locked ? 0.3 : 0.9,
      )
      this.accentBars.push(accentBar)

      // Team name
      const nameText = this.add.text(cx - cardW / 2 + 18, cy - 22, team.name, {
        fontFamily: F.body,
        fontSize: S.titleSmall,
        color: locked ? '#555555' : C.bodyHex,
        fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(0, 0)

      // Difficulty pill badge
      const diffLabel = DIFFICULTY_LABELS[idx] ?? ''
      const pillW = diffLabel.length * 8 + 16
      const pillX = cx - cardW / 2 + 18 + nameText.width + 12
      const pillY = cy - 16
      this.add.rectangle(pillX + pillW / 2, pillY, pillW, 18, accent, locked ? 0.15 : 0.25)
        .setStrokeStyle(1, accent, locked ? 0.2 : 0.5)
      this.add.text(pillX + pillW / 2, pillY, diffLabel, {
        fontFamily: F.body,
        fontSize: S.small,
        color: locked ? '#555555' : diffHex,
        fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(0.5)

      // Level range
      this.add.text(cx - cardW / 2 + 18, cy + 10, `Nivel ${team.levelMin}\u2013${team.levelMax}`, {
        fontFamily: F.body,
        fontSize: S.small,
        color: locked ? '#444444' : C.mutedHex,
        shadow: SHADOW.text,
      }).setOrigin(0, 0)

      // Rewards (right side) - gold coin icon + amount
      this.add.text(cx + cardW / 2 - 16, cy - 18, `\uD83E\uDE99 ${team.goldReward}`, {
        fontFamily: F.body,
        fontSize: S.body,
        color: locked ? '#555555' : C.warningHex,
        fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(1, 0)

      // XP star icon + amount
      this.add.text(cx + cardW / 2 - 16, cy + 6, `\u2B50 ${team.xpReward} XP`, {
        fontFamily: F.body,
        fontSize: S.bodySmall,
        color: locked ? '#444444' : C.infoHex,
        fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(1, 0)

      // Lock icon overlay for locked teams
      if (locked) {
        this.add.text(cx + cardW / 2 - 46, cy, '\uD83D\uDD12', {
          fontFamily: F.body,
          fontSize: '24px',
          color: '#444444',
        }).setOrigin(0.5)

        this.add.text(cx - cardW / 2 + 18, cy + 28, `Requer nivel ${team.levelMin}`, {
          fontFamily: F.body,
          fontSize: S.small,
          color: C.dangerHex,
          shadow: SHADOW.text,
        }).setOrigin(0, 0)
      }

      // Hover / click (only for unlocked cards)
      if (!locked) {
        bg.on('pointerover', () => {
          if (this.selectedIdx !== idx) {
            bg.setFillStyle(CARD_BG_HOVER)
            bg.setStrokeStyle(1, accent, 0.5)
            accentBar.setAlpha(1)
          }
          // Lift effect: move card up
          this.tweens.add({
            targets: [bg, shadow, accentBar],
            y: (t: { y: number }) => t.y - 2,
            duration: 100,
            ease: 'Quad.Out',
          })
          shadow.setAlpha(0.35)
        })
        bg.on('pointerout', () => {
          if (this.selectedIdx !== idx) {
            bg.setFillStyle(CARD_BG)
            bg.setStrokeStyle(1, C.panelBorder, 0.25)
            accentBar.setAlpha(0.9)
          }
          this.tweens.add({
            targets: [bg, shadow, accentBar],
            y: (t: { y: number }) => t.y + 2,
            duration: 100,
            ease: 'Quad.Out',
          })
          shadow.setAlpha(0.2)
        })
        bg.on('pointerdown', () => {
          // Press-in feedback
          this.tweens.add({
            targets: bg,
            scaleX: 0.98,
            scaleY: 0.98,
            duration: 80,
            yoyo: true,
            onComplete: () => {
              // Deselect previous
              if (this.selectedIdx >= 0 && this.selectedIdx !== idx) {
                const prevBg = this.cardBgs[this.selectedIdx]
                if (prevBg) {
                  prevBg.setFillStyle(CARD_BG)
                  prevBg.setStrokeStyle(1, C.panelBorder, 0.25)
                }
              }

              this.selectedIdx = idx
              bg.setFillStyle(CARD_BG_SELECT)
              bg.setStrokeStyle(1, accent, 0.6)

              // Navigate with transition
              transitionTo(this, 'BattleScene', {
                deckConfig: playerData.getDeckConfig(),
                skinConfig: playerData.getSkinConfig(),
                pveMode: true,
                npcTeam: team,
              })
            },
          })
        })
      }
    })
  }

  private drawBackButton() {
    UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))
  }

  shutdown() {
    this.tweens.killAll()
  }
}
