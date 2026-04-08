import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import { playerData } from '../utils/PlayerDataManager'

// ---- Dark Fantasy Premium palette -------------------------------------------

const W = 1280
const H = 720

const BG_COLOR        = 0x080a12
const PANEL_BG        = 0x12161f
const PANEL_BORDER    = 0x3d2e14
const CARD_BG         = 0x141a24
const CARD_BG_HOVER   = 0x1a2230
const CARD_BG_SELECT  = 0x1e2838

const GOLD_HEX        = '#f0c850'
const ICE_BLUE_HEX    = '#4fc3f7'
const AMBER_HEX       = '#ffa726'
const BODY_TEXT_HEX   = '#e8e0d0'
const MUTED_HEX       = '#7a7062'
const WHITE_HEX       = '#ffffff'

const GOLD_BORDER     = 0x3d2e14
const DIVIDER_GOLD    = 0xc9a84c

// Difficulty accent colors (left border)
const DIFF_EASY       = 0x4caf50
const DIFF_MEDIUM     = 0x4fc3f7
const DIFF_HARD       = 0xffa726
const DIFF_EXTREME    = 0xef5350

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
    this.drawTitle()
    this.drawTeamGrid()
    this.drawBackButton()
  }

  // ---- Drawing helpers ------------------------------------------------------

  private drawBackground() {
    this.add.rectangle(W / 2, H / 2, W, H, BG_COLOR)
    this.add.rectangle(W / 2, H / 2, 1080, 640, PANEL_BG, 0.97)
      .setStrokeStyle(2, PANEL_BORDER, 1)
  }

  private drawTitle() {
    this.add.text(W / 2, 74, 'CAMPANHA', {
      fontFamily: 'Arial',
      fontSize: '42px',
      color: GOLD_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    // Gold divider
    this.add.rectangle(W / 2, 100, 180, 2, DIVIDER_GOLD, 0.3)

    this.add.text(W / 2, 118, 'Escolha um oponente para enfrentar', {
      fontFamily: 'Arial',
      fontSize: '15px',
      color: MUTED_HEX,
    }).setOrigin(0.5)
  }

  private drawTeamGrid() {
    const cols = 2
    const cardW = 470
    const cardH = 80
    const gapX = 20
    const gapY = 10
    const gridW = cols * cardW + (cols - 1) * gapX
    const startX = (W - gridW) / 2 + cardW / 2
    const startY = 152

    NPC_TEAMS.forEach((team, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const cx = startX + col * (cardW + gapX)
      const cy = startY + row * (cardH + gapY) + cardH / 2

      const accent = DIFFICULTY_ACCENTS[idx] ?? DIFF_EASY

      // Card background
      const bg = this.add.rectangle(cx, cy, cardW, cardH, CARD_BG)
        .setStrokeStyle(1, GOLD_BORDER, 0.2)
        .setInteractive({ useHandCursor: true })
      this.cardBgs.push(bg)

      // Left accent border (difficulty color) - 4px tall bar on left edge
      const accentBar = this.add.rectangle(
        cx - cardW / 2 + 2, cy, 4, cardH - 8, accent, 0.9,
      )
      this.accentBars.push(accentBar)

      // Team name
      this.add.text(cx - cardW / 2 + 18, cy - 18, team.name, {
        fontFamily: 'Arial',
        fontSize: '17px',
        color: WHITE_HEX,
        fontStyle: 'bold',
      }).setOrigin(0, 0)

      // Level range + difficulty tag
      const diffLabel = DIFFICULTY_LABELS[idx] ?? ''
      this.add.text(cx - cardW / 2 + 18, cy + 8, `Nivel ${team.levelMin}\u2013${team.levelMax}  \u00B7  ${diffLabel}`, {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: MUTED_HEX,
      }).setOrigin(0, 0)

      // Rewards (right side) - gold icon
      this.add.text(cx + cardW / 2 - 16, cy - 14, `\u269C ${team.goldReward}`, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: AMBER_HEX,
        fontStyle: 'bold',
      }).setOrigin(1, 0)

      // XP reward
      this.add.text(cx + cardW / 2 - 16, cy + 8, `\u2726 ${team.xpReward} XP`, {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: ICE_BLUE_HEX,
      }).setOrigin(1, 0)

      // Hover / click
      bg.on('pointerover', () => {
        if (this.selectedIdx !== idx) {
          bg.setFillStyle(CARD_BG_HOVER)
          accentBar.setAlpha(1)
        }
        // Scale lift effect
        bg.setScale(1.02)
        accentBar.setScale(1, 1.02)
      })
      bg.on('pointerout', () => {
        if (this.selectedIdx !== idx) {
          bg.setFillStyle(CARD_BG)
          accentBar.setAlpha(0.9)
        }
        bg.setScale(1)
        accentBar.setScale(1, 1)
      })
      bg.on('pointerdown', () => {
        // Deselect previous
        if (this.selectedIdx >= 0 && this.selectedIdx !== idx) {
          const prevBg = this.cardBgs[this.selectedIdx]
          if (prevBg) {
            prevBg.setFillStyle(CARD_BG)
            prevBg.setStrokeStyle(1, GOLD_BORDER, 0.2)
          }
        }

        // Select this card
        this.selectedIdx = idx
        bg.setFillStyle(CARD_BG_SELECT)
        bg.setStrokeStyle(1, accent, 0.6)

        // Navigate directly to battle with saved deck
        this.scene.start('BattleScene', {
          deckConfig: playerData.getDeckConfig(),
          pveMode: true,
          npcTeam: team,
        })
      })
    })
  }

  private drawBackButton() {
    const y = H - 50

    const bg = this.add.rectangle(W / 2, y, 200, 42, CARD_BG)
      .setStrokeStyle(1, GOLD_BORDER, 0.4)
      .setInteractive({ useHandCursor: true })

    const label = this.add.text(W / 2, y, 'Voltar', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: MUTED_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    bg.on('pointerover', () => { bg.setFillStyle(CARD_BG_HOVER); label.setColor(BODY_TEXT_HEX) })
    bg.on('pointerout', () => { bg.setFillStyle(CARD_BG); label.setColor(MUTED_HEX) })
    bg.on('pointerdown', () => this.scene.start('LobbyScene'))
  }
}
