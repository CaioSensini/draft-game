import Phaser from 'phaser'
import { soundManager } from '../utils/SoundManager'

// ---- Dark Fantasy Premium palette -------------------------------------------

const W = 1280
const H = 720

const BG_COLOR        = 0x080a12
const PANEL_BG        = 0x12161f
const PANEL_BORDER    = 0x3d2e14
const CARD_BG         = 0x141a24
const CARD_BG_HOVER   = 0x1a2230

const GOLD_HEX        = '#f0c850'
const ICE_BLUE_HEX    = '#4fc3f7'
const EMERALD_HEX     = '#4caf50'
const BLOOD_RED_HEX   = '#ef5350'
const BODY_TEXT_HEX   = '#e8e0d0'
const MUTED_HEX       = '#7a7062'

const GOLD_NUM        = 0xf0c850
const GOLD_BORDER     = 0x3d2e14
const EMERALD_NUM     = 0x4caf50
const EMERALD_DARK    = 0x1b3a1e
const BLOOD_RED_NUM   = 0xef5350
const BLOOD_RED_DARK  = 0x3a1515
const ICE_BLUE_NUM    = 0x4fc3f7
const DIVIDER_GOLD    = 0xc9a84c

const DIFFICULTIES = ['easy', 'normal', 'hard'] as const
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Facil',
  normal: 'Normal',
  hard: 'Dificil',
}

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene')
  }

  create() {
    // Background
    this.add.rectangle(W / 2, H / 2, W, H, BG_COLOR)
    this.add.rectangle(W / 2, H / 2, 700, 540, PANEL_BG, 0.97)
      .setStrokeStyle(2, PANEL_BORDER, 1)

    // Title
    this.add.text(W / 2, 120, 'CONFIGURACOES', {
      fontFamily: 'Arial',
      fontSize: '40px',
      color: GOLD_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    // Gold divider under title
    this.add.rectangle(W / 2, 148, 240, 2, DIVIDER_GOLD, 0.3)

    let currentY = 190

    // ── Sound Toggle Panel ───────────────────────────────────────────────────
    soundManager.init()
    let soundEnabled = soundManager.isEnabled()

    const soundPanelW = 500
    const soundPanelH = 60
    this.add.rectangle(W / 2, currentY + soundPanelH / 2, soundPanelW, soundPanelH, CARD_BG)
      .setStrokeStyle(1, GOLD_BORDER, 0.3)

    const soundIcon = this.add.text(W / 2 - soundPanelW / 2 + 20, currentY + soundPanelH / 2, soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: BODY_TEXT_HEX,
    }).setOrigin(0, 0.5)

    const soundLabel = this.add.text(W / 2 - soundPanelW / 2 + 56, currentY + soundPanelH / 2, `Som: ${soundEnabled ? 'Ligado' : 'Desligado'}`, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: BODY_TEXT_HEX,
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    // Toggle indicator (right side of panel)
    const toggleW = 56
    const toggleH = 28
    const toggleX = W / 2 + soundPanelW / 2 - 50
    const toggleY = currentY + soundPanelH / 2

    const toggleBg = this.add.rectangle(toggleX, toggleY, toggleW, toggleH,
      soundEnabled ? EMERALD_DARK : BLOOD_RED_DARK,
    ).setStrokeStyle(2, soundEnabled ? EMERALD_NUM : BLOOD_RED_NUM, 0.8)
      .setInteractive({ useHandCursor: true })

    const toggleKnob = this.add.rectangle(
      soundEnabled ? toggleX + 12 : toggleX - 12, toggleY, 18, 20,
      soundEnabled ? EMERALD_NUM : BLOOD_RED_NUM,
    )

    const toggleText = this.add.text(toggleX, toggleY + 20, soundEnabled ? 'ON' : 'OFF', {
      fontFamily: 'Arial',
      fontSize: '10px',
      color: soundEnabled ? EMERALD_HEX : BLOOD_RED_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    toggleBg.on('pointerdown', () => {
      soundEnabled = soundManager.toggle()
      soundLabel.setText(`Som: ${soundEnabled ? 'Ligado' : 'Desligado'}`)
      soundIcon.setText(soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07')
      toggleBg.setFillStyle(soundEnabled ? EMERALD_DARK : BLOOD_RED_DARK)
      toggleBg.setStrokeStyle(2, soundEnabled ? EMERALD_NUM : BLOOD_RED_NUM, 0.8)
      toggleKnob.setPosition(soundEnabled ? toggleX + 12 : toggleX - 12, toggleY)
      toggleKnob.setFillStyle(soundEnabled ? EMERALD_NUM : BLOOD_RED_NUM)
      toggleText.setText(soundEnabled ? 'ON' : 'OFF')
      toggleText.setColor(soundEnabled ? EMERALD_HEX : BLOOD_RED_HEX)
      soundManager.playClick()
    })

    currentY += soundPanelH + 16

    // ── Difficulty Selector Panel ─────────────────────────────────────────────
    const diffPanelW = 500
    const diffPanelH = 70
    this.add.rectangle(W / 2, currentY + diffPanelH / 2, diffPanelW, diffPanelH, CARD_BG)
      .setStrokeStyle(1, GOLD_BORDER, 0.3)

    this.add.text(W / 2 - diffPanelW / 2 + 20, currentY + 14, 'Dificuldade do Bot:', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: BODY_TEXT_HEX,
      fontStyle: 'bold',
    }).setOrigin(0, 0)

    const savedDifficulty = localStorage.getItem('draft_difficulty') || 'normal'
    let difficultyIndex = DIFFICULTIES.indexOf(savedDifficulty as typeof DIFFICULTIES[number])
    if (difficultyIndex === -1) difficultyIndex = 1

    // Three difficulty option buttons in a row
    const diffBtnW = 120
    const diffBtnH = 30
    const diffBtnY = currentY + 46
    const diffBtnGap = 10
    const diffTotalW = 3 * diffBtnW + 2 * diffBtnGap
    const diffStartX = W / 2 - diffTotalW / 2 + diffBtnW / 2

    const diffBtns: Array<{ bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }> = []

    DIFFICULTIES.forEach((d, i) => {
      const x = diffStartX + i * (diffBtnW + diffBtnGap)
      const isActive = i === difficultyIndex

      const bg = this.add.rectangle(x, diffBtnY, diffBtnW, diffBtnH, isActive ? CARD_BG_HOVER : CARD_BG)
        .setStrokeStyle(2, isActive ? GOLD_NUM : GOLD_BORDER, isActive ? 0.9 : 0.2)
        .setInteractive({ useHandCursor: true })

      const label = this.add.text(x, diffBtnY, DIFFICULTY_LABELS[d], {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: isActive ? GOLD_HEX : MUTED_HEX,
        fontStyle: 'bold',
      }).setOrigin(0.5)

      bg.on('pointerover', () => {
        if (DIFFICULTIES[difficultyIndex] !== d) bg.setFillStyle(CARD_BG_HOVER)
      })
      bg.on('pointerout', () => {
        if (DIFFICULTIES[difficultyIndex] !== d) bg.setFillStyle(CARD_BG)
      })
      bg.on('pointerdown', () => {
        difficultyIndex = i
        const key = DIFFICULTIES[difficultyIndex]
        localStorage.setItem('draft_difficulty', key)
        soundManager.playClick()

        // Update all difficulty buttons
        diffBtns.forEach((btn, j) => {
          const active = j === difficultyIndex
          btn.bg.setFillStyle(active ? CARD_BG_HOVER : CARD_BG)
          btn.bg.setStrokeStyle(2, active ? GOLD_NUM : GOLD_BORDER, active ? 0.9 : 0.2)
          btn.label.setColor(active ? GOLD_HEX : MUTED_HEX)
        })
      })

      diffBtns.push({ bg, label })
    })

    currentY += diffPanelH + 16

    // ── Reset Tutorial Panel ─────────────────────────────────────────────────
    const resetPanelW = 500
    const resetPanelH = 56
    this.add.rectangle(W / 2, currentY + resetPanelH / 2, resetPanelW, resetPanelH, CARD_BG)
      .setStrokeStyle(1, GOLD_BORDER, 0.3)

    this.add.text(W / 2 - resetPanelW / 2 + 20, currentY + resetPanelH / 2, 'Rever as instrucoes do jogo', {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: MUTED_HEX,
    }).setOrigin(0, 0.5)

    const resetBtnW = 160
    const resetBg = this.add.rectangle(W / 2 + resetPanelW / 2 - resetBtnW / 2 - 16, currentY + resetPanelH / 2, resetBtnW, 32, CARD_BG)
      .setStrokeStyle(1, ICE_BLUE_NUM, 0.6)
      .setInteractive({ useHandCursor: true })

    const resetLabel = this.add.text(W / 2 + resetPanelW / 2 - resetBtnW / 2 - 16, currentY + resetPanelH / 2, 'Resetar Tutorial', {
      fontFamily: 'Arial',
      fontSize: '13px',
      color: ICE_BLUE_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    resetBg.on('pointerover', () => resetBg.setFillStyle(CARD_BG_HOVER))
    resetBg.on('pointerout', () => resetBg.setFillStyle(CARD_BG))
    resetBg.on('pointerdown', () => {
      localStorage.removeItem('draft_tutorial_done')
      resetLabel.setText('Resetado!')
      resetLabel.setColor(EMERALD_HEX)
      soundManager.playConfirm()
      this.time.delayedCall(1500, () => {
        resetLabel.setText('Resetar Tutorial')
        resetLabel.setColor(ICE_BLUE_HEX)
      })
    })

    currentY += resetPanelH + 24

    // ── Credits ───────────────────────────────────────────────────────────────
    // Gold divider
    this.add.rectangle(W / 2, currentY, 160, 1, DIVIDER_GOLD, 0.2)
    currentY += 14

    this.add.text(W / 2, currentY, 'Draft Game v1.0', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: MUTED_HEX,
    }).setOrigin(0.5)

    this.add.text(W / 2, currentY + 22, 'Codeforje VIO', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: GOLD_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    this.add.text(W / 2, currentY + 42, 'Desenvolvido por Caio Sensini', {
      fontFamily: 'Arial',
      fontSize: '12px',
      color: MUTED_HEX,
    }).setOrigin(0.5)

    currentY += 68

    // ── Logout Button ─────────────────────────────────────────────────────────
    const logoutBg = this.add.rectangle(W / 2, currentY, 260, 42, BLOOD_RED_DARK)
      .setStrokeStyle(2, BLOOD_RED_NUM, 0.7)
      .setInteractive({ useHandCursor: true })

    this.add.text(W / 2, currentY, 'Sair da Conta', {
      fontFamily: 'Arial',
      fontSize: '15px',
      color: BLOOD_RED_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    logoutBg.on('pointerover', () => logoutBg.setFillStyle(0x4a1a1a))
    logoutBg.on('pointerout', () => logoutBg.setFillStyle(BLOOD_RED_DARK))
    logoutBg.on('pointerdown', async () => {
      soundManager.playClick()
      localStorage.removeItem('draft_token')
      const { playerData } = await import('../utils/PlayerDataManager')
      playerData.reset()
      this.scene.start('LoginScene')
    })

    currentY += 52

    // ── Back Button ───────────────────────────────────────────────────────────
    const backBg = this.add.rectangle(W / 2, currentY, 200, 42, CARD_BG)
      .setStrokeStyle(1, GOLD_BORDER, 0.4)
      .setInteractive({ useHandCursor: true })

    const backLabel = this.add.text(W / 2, currentY, 'Voltar', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: MUTED_HEX,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    backBg.on('pointerover', () => {
      backBg.setFillStyle(CARD_BG_HOVER)
      backLabel.setColor(BODY_TEXT_HEX)
    })
    backBg.on('pointerout', () => {
      backBg.setFillStyle(CARD_BG)
      backLabel.setColor(MUTED_HEX)
    })
    backBg.on('pointerdown', () => {
      soundManager.playClick()
      this.scene.start('LobbyScene')
    })
  }
}
