import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import { playerData } from '../utils/PlayerDataManager'
import type { PlayerData } from '../utils/PlayerDataManager'

// ---- Dark Fantasy Premium palette (1280 x 720) --------------------------------

const W = 1280
const H = 720

const BG_COLOR       = 0x080a12
const PANEL_BG       = 0x12161f
const PANEL_BORDER   = 0x3d2e14
const GOLD_ACCENT    = '#f0c850'
const GOLD_HEX       = 0xf0c850
const GOLD_DIM       = '#c9a84c'
const ICE_BLUE       = '#4fc3f7'
const TEXT_BODY      = '#e8e0d0'
const TEXT_MUTED     = '#7a7062'
const GREEN_VAL      = '#86efac'
const RED_VAL        = '#f87171'

const BTN_FILL       = 0x141a24
const BTN_FILL_HOVER = 0x1c2333

// ---- Scene ------------------------------------------------------------------

export default class ProfileScene extends Phaser.Scene {
  private profile!: PlayerData

  constructor() {
    super('ProfileScene')
  }

  create() {
    GameStateManager.set(GameState.MENU)
    this.profile = playerData.get()

    this.drawBackground()
    this.drawTitle()
    this.drawMainPanel()
    this.drawMasteryPanel()
    this.drawBackButton()
  }

  // ---- Drawing helpers ------------------------------------------------------

  private drawBackground() {
    this.add.rectangle(W / 2, H / 2, W, H, BG_COLOR)
  }

  private drawTitle() {
    this.add.text(W / 2, 50, 'PERFIL', {
      fontFamily: 'Arial',
      fontSize: '40px',
      color: GOLD_ACCENT,
      fontStyle: 'bold',
      shadow: {
        offsetX: 0, offsetY: 2, color: '#000000', blur: 8, fill: true,
      },
    }).setOrigin(0.5)

    // Gold decorative line
    this.add.rectangle(W / 2, 78, 180, 2, GOLD_HEX, 0.35)
  }

  private drawMainPanel() {
    const p = this.profile
    const totalGames = p.wins + p.losses
    const winRate = totalGames > 0 ? ((p.wins / totalGames) * 100).toFixed(1) : '0.0'

    // XP calculations
    const xpForNext = Math.max(1, p.level * 100)
    const xpPercent = Math.min(1, p.xp / xpForNext)

    const panelW = 680
    const panelH = 380
    const panelX = W / 2
    const panelY = 100 + panelH / 2 + 10

    // Central panel
    this.add.rectangle(panelX, panelY, panelW, panelH, PANEL_BG, 0.96)
      .setStrokeStyle(1, PANEL_BORDER, 0.8)

    // Username as large gold title
    this.add.text(panelX, panelY - panelH / 2 + 32, p.username, {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: GOLD_ACCENT,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    // Gold divider below username
    this.add.rectangle(panelX, panelY - panelH / 2 + 56, panelW - 80, 2, GOLD_HEX, 0.2)

    // ----- 2-column stat grid -----
    const colLeftX  = panelX - panelW / 2 + 50
    const colRightX = panelX + 30
    const colValOffset = 180
    let leftY  = panelY - panelH / 2 + 84
    let rightY = panelY - panelH / 2 + 84
    const rowH = 36

    // --- Left column: Level, XP bar, Gold, DG ---

    // Level
    this.drawStatRow(colLeftX, leftY, 'Nivel', `${p.level}`, ICE_BLUE, colValOffset)
    leftY += rowH

    // XP progress bar
    const barX = colLeftX
    const barW = 260
    const barH = 16
    this.add.rectangle(barX + barW / 2, leftY, barW, barH, 0x0d0f16)
      .setStrokeStyle(1, PANEL_BORDER, 0.4)
      .setOrigin(0.5)

    if (xpPercent > 0) {
      const fillW = barW * xpPercent
      this.add.rectangle(barX + fillW / 2, leftY, fillW, barH - 2, GOLD_HEX, 0.85)
        .setOrigin(0.5)
    }

    this.add.text(barX + barW / 2, leftY, `${p.xp} / ${xpForNext} XP`, {
      fontFamily: 'Arial',
      fontSize: '10px',
      color: TEXT_BODY,
      fontStyle: 'bold',
    }).setOrigin(0.5)
    leftY += rowH

    // Gold
    this.drawStatRow(colLeftX, leftY, '\u269c Gold', `${p.gold}`, GOLD_ACCENT, colValOffset)
    leftY += rowH

    // DG
    this.drawStatRow(colLeftX, leftY, '\uD83D\uDC8E DG', `${p.dg}`, ICE_BLUE, colValOffset)

    // --- Right column: Wins, Losses, Win Rate, Rank ---

    this.drawStatRow(colRightX, rightY, 'Vitorias', `${p.wins}`, GREEN_VAL, colValOffset)
    rightY += rowH

    this.drawStatRow(colRightX, rightY, 'Derrotas', `${p.losses}`, RED_VAL, colValOffset)
    rightY += rowH

    this.drawStatRow(colRightX, rightY, 'Win Rate', `${winRate}%`, TEXT_BODY, colValOffset)
    rightY += rowH

    this.drawStatRow(colRightX, rightY, 'Rank', `${p.rankPoints}`, ICE_BLUE, colValOffset)
  }

  private drawMasteryPanel() {
    const p = this.profile

    const panelW = 680
    const panelH = 100
    const panelX = W / 2
    const panelY = 520

    this.add.rectangle(panelX, panelY, panelW, panelH, PANEL_BG, 0.96)
      .setStrokeStyle(1, PANEL_BORDER, 0.8)

    // Section title
    this.add.text(panelX, panelY - panelH / 2 + 20, 'MAESTRIA', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: GOLD_DIM,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    // Gold divider
    this.add.rectangle(panelX, panelY - panelH / 2 + 36, panelW - 80, 2, GOLD_HEX, 0.15)

    const rowY = panelY + 12
    const leftX  = panelX - panelW / 2 + 50
    const rightX = panelX + 30

    this.drawStatRow(leftX, rowY, 'Maestria de Ataque', `${p.attackMastery}`, GOLD_ACCENT, 220)
    this.drawStatRow(rightX, rowY, 'Maestria de Defesa', `${p.defenseMastery}`, ICE_BLUE, 220)
  }

  private drawStatRow(
    x: number, y: number, label: string, value: string,
    valueColor: string, valOffset: number,
  ) {
    this.add.text(x, y, label, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: TEXT_MUTED,
    }).setOrigin(0, 0.5)

    this.add.text(x + valOffset, y, value, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: valueColor,
      fontStyle: 'bold',
    }).setOrigin(1, 0.5)
  }

  // ---- Back button ----------------------------------------------------------

  private drawBackButton() {
    const y = H - 50

    const bg = this.add.rectangle(W / 2, y, 180, 40, BTN_FILL, 1)
      .setStrokeStyle(1, PANEL_BORDER, 0.5)
      .setInteractive({ useHandCursor: true })

    // Colored left accent (matching lobby style)
    this.add.rectangle(W / 2 - 90 + 2, y, 4, 40, 0x78909c, 1)

    const label = this.add.text(W / 2, y, 'Voltar', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: TEXT_BODY,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    bg.on('pointerover', () => {
      bg.setFillStyle(BTN_FILL_HOVER, 1)
      bg.setStrokeStyle(1, PANEL_BORDER, 0.9)
      label.setColor('#ffffff')
    })
    bg.on('pointerout', () => {
      bg.setFillStyle(BTN_FILL, 1)
      bg.setStrokeStyle(1, PANEL_BORDER, 0.5)
      label.setColor(TEXT_BODY)
    })
    bg.on('pointerdown', () => this.scene.start('LobbyScene'))
  }
}
