import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import { playerData } from '../utils/PlayerDataManager'
import { soundManager } from '../utils/SoundManager'

// ---- Dark Fantasy Premium palette (1280 x 720) --------------------------------

const W = 1280
const H = 720

const BG_COLOR        = 0x080a12
const PANEL_BG        = 0x12161f
const PANEL_BORDER    = 0x3d2e14
const GOLD_ACCENT     = '#f0c850'
const GOLD_ACCENT_HEX = 0xf0c850
const GOLD_DIM        = '#c9a84c'
const ICE_BLUE        = '#4fc3f7'
const TEXT_BODY        = '#e8e0d0'
const TEXT_MUTED       = '#7a7062'

const BTN_FILL        = 0x141a24
const BTN_FILL_HOVER  = 0x1c2333
const BTN_EXIT_FILL   = 0x2a1015
const BTN_EXIT_HOVER  = 0x3d161d

const ACCENT_GREEN    = 0x4caf50
const ACCENT_BLUE     = 0x4fc3f7
const ACCENT_AMBER    = 0xffa726
const ACCENT_PURPLE   = 0xab47bc
const ACCENT_CYAN     = 0x26c6da
const ACCENT_GRAY     = 0x78909c

// ---- Scene ------------------------------------------------------------------

export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene')
  }

  create() {
    GameStateManager.set(GameState.MENU)

    // Redirect first-time players to the tutorial
    const tutorialDone = localStorage.getItem('draft_tutorial_done')
    if (!tutorialDone) {
      this.scene.start('TutorialScene')
      return
    }

    this.drawBackground()
    this.drawTitle()
    this.drawPlayerBar()
    this.drawNavButtons()
    this.drawExitButton()
    this.drawSoundToggle()
  }

  // ---- Drawing helpers ------------------------------------------------------

  private drawBackground() {
    this.add.rectangle(W / 2, H / 2, W, H, BG_COLOR)
  }

  private drawTitle() {
    this.add.text(W / 2, 58, 'DRAFT GAME', {
      fontFamily: 'Arial',
      fontSize: '48px',
      color: GOLD_ACCENT,
      fontStyle: 'bold',
      shadow: {
        offsetX: 0, offsetY: 2, color: '#000000', blur: 8, fill: true,
      },
    }).setOrigin(0.5)

    this.add.text(W / 2, 96, 'by Codeforje VIO', {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: TEXT_MUTED,
    }).setOrigin(0.5)

    // Gold decorative line below title
    this.add.rectangle(W / 2, 118, 260, 2, GOLD_ACCENT_HEX, 0.35)
  }

  private drawPlayerBar() {
    const p = playerData.get()
    const barY = 156
    const barW = 620
    const barH = 48

    // Panel background with gold border
    this.add.rectangle(W / 2, barY, barW, barH, PANEL_BG, 0.95)
      .setStrokeStyle(1, PANEL_BORDER, 0.8)

    // Username in gold
    const leftX = W / 2 - barW / 2 + 20
    this.add.text(leftX, barY, p.username, {
      fontFamily: 'Arial',
      fontSize: '15px',
      color: GOLD_ACCENT,
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    // Level in ice blue
    this.add.text(leftX + 140, barY, `Lv.${p.level}`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: ICE_BLUE,
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    // Gold currency
    const rightX = W / 2 + barW / 2 - 20
    this.add.text(rightX, barY, `${p.gold}`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: GOLD_ACCENT,
      fontStyle: 'bold',
    }).setOrigin(1, 0.5)

    this.add.text(rightX - 65, barY, '\u269c', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: GOLD_DIM,
    }).setOrigin(1, 0.5)

    // DG currency in ice blue
    this.add.text(rightX - 130, barY, `\uD83D\uDC8E ${p.dg}`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: ICE_BLUE,
      fontStyle: 'bold',
    }).setOrigin(1, 0.5)
  }

  private drawNavButtons() {
    const buttons: Array<{
      label: string
      icon: string
      accent: number
      target: string
      data?: Record<string, unknown>
    }> = [
      { label: 'BATALHA PvP',     icon: '\u2694',  accent: ACCENT_GREEN,  target: 'BattleScene' },
      { label: 'CAMPANHA PvE',    icon: '\uD83D\uDDFA',  accent: ACCENT_BLUE,   target: 'PvESelectScene' },
      { label: 'LOJA',            icon: '\uD83D\uDECD',  accent: ACCENT_AMBER,  target: 'ShopScene' },
      { label: 'PERFIL',          icon: '\uD83D\uDC64',  accent: ACCENT_PURPLE, target: 'ProfileScene' },
      { label: 'GERENCIAR DECK',  icon: '\u2B06',  accent: ACCENT_CYAN,   target: 'SkillUpgradeScene' },
      { label: 'CONFIGURACOES',   icon: '\u2699',  accent: ACCENT_GRAY,   target: 'SettingsScene' },
    ]

    const cols = 2
    const btnW = 280
    const btnH = 68
    const gapX = 20
    const gapY = 16
    const gridW = cols * btnW + (cols - 1) * gapX
    const rows = Math.ceil(buttons.length / cols)
    const gridH = rows * btnH + (rows - 1) * gapY
    const startX = (W - gridW) / 2
    const startY = 200 + (H - 200 - 80 - gridH) / 2

    buttons.forEach((cfg, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = startX + col * (btnW + gapX) + btnW / 2
      const y = startY + row * (btnH + gapY) + btnH / 2

      // Button background
      const bg = this.add.rectangle(x, y, btnW, btnH, BTN_FILL, 1)
        .setStrokeStyle(1, PANEL_BORDER, 0.5)
        .setInteractive({ useHandCursor: true })

      // Colored left accent bar (4px wide)
      const accentBar = this.add.rectangle(
        x - btnW / 2 + 2, y, 4, btnH, cfg.accent, 1,
      )

      // Icon
      this.add.text(x - btnW / 2 + 24, y, cfg.icon, {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: TEXT_BODY,
      }).setOrigin(0, 0.5)

      // Label
      const label = this.add.text(x - btnW / 2 + 54, y, cfg.label, {
        fontFamily: 'Arial',
        fontSize: '17px',
        color: TEXT_BODY,
        fontStyle: 'bold',
      }).setOrigin(0, 0.5)

      bg.on('pointerover', () => {
        bg.setFillStyle(BTN_FILL_HOVER, 1)
        bg.setStrokeStyle(1, cfg.accent, 0.7)
        accentBar.setAlpha(1)
        label.setColor('#ffffff')
      })
      bg.on('pointerout', () => {
        bg.setFillStyle(BTN_FILL, 1)
        bg.setStrokeStyle(1, PANEL_BORDER, 0.5)
        accentBar.setAlpha(1)
        label.setColor(TEXT_BODY)
      })
      bg.on('pointerdown', () => {
        if (cfg.target === 'BattleScene') {
          this.scene.start('BattleScene', { deckConfig: playerData.getDeckConfig() })
        } else {
          this.scene.start(cfg.target, cfg.data)
        }
      })
    })
  }

  private drawExitButton() {
    const y = H - 46

    const bg = this.add.rectangle(W / 2, y, 140, 36, BTN_EXIT_FILL, 1)
      .setStrokeStyle(1, 0x5c2020, 0.6)
      .setInteractive({ useHandCursor: true })

    const label = this.add.text(W / 2, y, 'Sair', {
      fontFamily: 'Arial',
      fontSize: '15px',
      color: '#b05050',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    bg.on('pointerover', () => {
      bg.setFillStyle(BTN_EXIT_HOVER, 1)
      label.setColor('#e07070')
    })
    bg.on('pointerout', () => {
      bg.setFillStyle(BTN_EXIT_FILL, 1)
      label.setColor('#b05050')
    })
    bg.on('pointerdown', () => {
      this.scene.start('MenuScene')
    })
  }

  // -- Sound toggle -----------------------------------------------------------

  private drawSoundToggle() {
    soundManager.init()
    let muted = false

    const bg = this.add.rectangle(W - 60, H - 36, 90, 30, BTN_FILL, 0.8)
      .setStrokeStyle(1, PANEL_BORDER, 0.4)
      .setInteractive({ useHandCursor: true })

    const label = this.add.text(W - 60, H - 36, '\uD83D\uDD0A Som', {
      fontFamily: 'Arial', fontSize: '13px', color: TEXT_MUTED,
    }).setOrigin(0.5)

    bg.on('pointerover', () => bg.setStrokeStyle(1, PANEL_BORDER, 0.8))
    bg.on('pointerout', () => bg.setStrokeStyle(1, PANEL_BORDER, 0.4))

    bg.on('pointerdown', () => {
      muted = !soundManager.toggle()
      label.setText(muted ? '\uD83D\uDD07 Mudo' : '\uD83D\uDD0A Som')
      soundManager.playClick()
    })
  }
}
