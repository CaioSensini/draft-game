import Phaser from 'phaser'
import { soundManager } from '../utils/SoundManager'
import { transitionTo } from '../utils/SceneTransition'
import { UI } from '../utils/UIComponents'
import { C, F, S, SHADOW, SCREEN } from '../utils/DesignTokens'

// ---- Dark Fantasy Premium palette (aliases for design tokens) ---------------

const W = SCREEN.W
const H = SCREEN.H

const CARD_BG         = 0x141a24
const CARD_BG_HOVER   = 0x1a2230

const DIFFICULTIES = ['easy', 'normal', 'hard'] as const
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Facil',
  normal: 'Normal',
  hard: 'Dificil',
}

// ---- Shared particles (now delegated to UI.particles) -----------------------

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene')
  }

  create() {
    // Background
    UI.background(this)
    UI.particles(this, 16)

    // Panel shadow + gold trim
    this.add.rectangle(W / 2, H / 2 + 4, 700, 540, C.shadow, 0.15)
    this.add.rectangle(W / 2, H / 2, 700, 540, C.panelBg, 0.97)
      .setStrokeStyle(2, C.panelBorder, 1)
    this.add.rectangle(W / 2, H / 2, 704, 544, C.black, 0)
      .setStrokeStyle(1, C.gold, 0.08)

    // Title
    this.add.text(W / 2, 120, 'CONFIGURACOES', {
      fontFamily: F.title,
      fontSize: S.titleHuge,
      color: C.goldHex,
      fontStyle: 'bold',
      shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)

    // Gold divider under title
    this.add.rectangle(W / 2, 148, 240, 2, C.goldDim, 0.3)

    let currentY = 190

    // ── Sound Toggle Panel ───────────────────────────────────────────────────
    soundManager.init()
    let soundEnabled = soundManager.isEnabled()

    const soundPanelW = 500
    const soundPanelH = 70
    this.add.rectangle(W / 2, currentY + soundPanelH / 2, soundPanelW, soundPanelH, CARD_BG)
      .setStrokeStyle(1, C.panelBorder, 0.3)

    const soundIcon = this.add.text(W / 2 - soundPanelW / 2 + 20, currentY + soundPanelH / 2, soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07', {
      fontFamily: F.body,
      fontSize: '28px',
      color: C.bodyHex,
    }).setOrigin(0, 0.5)

    const soundLabel = this.add.text(W / 2 - soundPanelW / 2 + 60, currentY + soundPanelH / 2, `Som: ${soundEnabled ? 'Ligado' : 'Desligado'}`, {
      fontFamily: F.body,
      fontSize: S.titleSmall,
      color: C.bodyHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0, 0.5)

    // Bigger toggle switch (right side)
    const toggleW = 72
    const toggleH = 36
    const toggleX = W / 2 + soundPanelW / 2 - 58
    const toggleY = currentY + soundPanelH / 2

    const toggleTrack = this.add.rectangle(toggleX, toggleY, toggleW, toggleH,
      soundEnabled ? C.successDark : C.dangerDark,
    ).setStrokeStyle(2, soundEnabled ? C.success : C.danger, 0.8)
      .setInteractive({ useHandCursor: true })

    const toggleKnob = this.add.rectangle(
      soundEnabled ? toggleX + 16 : toggleX - 16, toggleY, 24, 28,
      soundEnabled ? C.success : C.danger,
    )

    // ON/OFF big text inside the toggle
    const toggleStateText = this.add.text(
      soundEnabled ? toggleX - 12 : toggleX + 10, toggleY,
      soundEnabled ? 'ON' : 'OFF', {
        fontFamily: F.body,
        fontSize: S.small,
        color: soundEnabled ? C.successHex : C.dangerHex,
        fontStyle: 'bold',
      }).setOrigin(0.5)

    toggleTrack.on('pointerdown', () => {
      soundEnabled = soundManager.toggle()
      soundLabel.setText(`Som: ${soundEnabled ? 'Ligado' : 'Desligado'}`)
      soundIcon.setText(soundEnabled ? '\uD83D\uDD0A' : '\uD83D\uDD07')
      toggleTrack.setFillStyle(soundEnabled ? C.successDark : C.dangerDark)
      toggleTrack.setStrokeStyle(2, soundEnabled ? C.success : C.danger, 0.8)
      // Animate knob slide
      this.tweens.add({
        targets: toggleKnob,
        x: soundEnabled ? toggleX + 16 : toggleX - 16,
        duration: 120,
        ease: 'Quad.Out',
      })
      toggleKnob.setFillStyle(soundEnabled ? C.success : C.danger)
      toggleStateText.setText(soundEnabled ? 'ON' : 'OFF')
      toggleStateText.setColor(soundEnabled ? C.successHex : C.dangerHex)
      toggleStateText.setX(soundEnabled ? toggleX - 12 : toggleX + 10)
      soundManager.playClick()
    })

    currentY += soundPanelH + 16

    // ── Difficulty Selector Panel (Radio Buttons) ────────────────────────────
    const diffPanelW = 500
    const diffPanelH = 70
    this.add.rectangle(W / 2, currentY + diffPanelH / 2, diffPanelW, diffPanelH, CARD_BG)
      .setStrokeStyle(1, C.panelBorder, 0.3)

    this.add.text(W / 2 - diffPanelW / 2 + 20, currentY + 14, 'Dificuldade do Bot:', {
      fontFamily: F.body,
      fontSize: S.body,
      color: C.bodyHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0, 0)

    const savedDifficulty = localStorage.getItem('draft_difficulty') || 'normal'
    let difficultyIndex = DIFFICULTIES.indexOf(savedDifficulty as typeof DIFFICULTIES[number])
    if (difficultyIndex === -1) difficultyIndex = 1

    // Radio-button style difficulty options
    const radioY = currentY + 48
    const radioGap = 150
    const radioStartX = W / 2 - radioGap

    const radioItems: Array<{
      outer: Phaser.GameObjects.Arc
      inner: Phaser.GameObjects.Arc
      label: Phaser.GameObjects.Text
      hitZone: Phaser.GameObjects.Rectangle
    }> = []

    DIFFICULTIES.forEach((d, i) => {
      const x = radioStartX + i * radioGap
      const isActive = i === difficultyIndex

      // Radio outer ring
      const outer = this.add.circle(x - 30, radioY, 9, C.black, 0)
        .setStrokeStyle(2, isActive ? C.gold : C.panelBorder, isActive ? 1 : 0.4)
      // Radio inner filled dot
      const inner = this.add.circle(x - 30, radioY, 5, C.gold, isActive ? 1 : 0)

      const label = this.add.text(x - 14, radioY, DIFFICULTY_LABELS[d], {
        fontFamily: F.body,
        fontSize: S.body,
        color: isActive ? C.goldHex : C.mutedHex,
        fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(0, 0.5)

      // Invisible hit zone for easy clicking
      const hitZone = this.add.rectangle(x, radioY, 120, 28, 0x000000, 0)
        .setInteractive({ useHandCursor: true })

      hitZone.on('pointerdown', () => {
        difficultyIndex = i
        const key = DIFFICULTIES[difficultyIndex]
        localStorage.setItem('draft_difficulty', key)
        soundManager.playClick()

        // Update all radio buttons
        radioItems.forEach((item, j) => {
          const active = j === difficultyIndex
          item.outer.setStrokeStyle(2, active ? C.gold : C.panelBorder, active ? 1 : 0.4)
          item.inner.setAlpha(active ? 1 : 0)
          item.label.setColor(active ? C.goldHex : C.mutedHex)
        })
      })

      radioItems.push({ outer, inner, label, hitZone })
    })

    currentY += diffPanelH + 16

    currentY += 24

    // ── Credits ───────────────────────────────────────────────────────────────
    this.add.rectangle(W / 2, currentY, 160, 1, C.goldDim, 0.2)
    currentY += 14

    this.add.text(W / 2, currentY, 'Draft Game v1.0', {
      fontFamily: F.body,
      fontSize: S.body,
      color: C.mutedHex,
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    // Prominent studio name with gold border treatment
    const studioY = currentY + 26
    this.add.rectangle(W / 2, studioY, 180, 30, C.black, 0)
      .setStrokeStyle(1, C.goldDim, 0.25)
    this.add.text(W / 2, studioY, 'CODEFORJE VIO', {
      fontFamily: F.title,
      fontSize: S.titleSmall,
      color: C.goldHex,
      fontStyle: 'bold',
      shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)
    // Small decorative lines flanking the name
    this.add.rectangle(W / 2 - 100, studioY, 16, 1, C.goldDim, 0.4)
    this.add.rectangle(W / 2 + 100, studioY, 16, 1, C.goldDim, 0.4)

    this.add.text(W / 2, studioY + 22, 'Desenvolvido por Caio Sensini', {
      fontFamily: F.body,
      fontSize: S.small,
      color: C.mutedHex,
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    currentY = studioY + 52

    // ── Logout Button (with confirmation popup) ─────────────────────────────
    let logoutConfirming = false
    const logoutConfirmGroup: Phaser.GameObjects.GameObject[] = []

    this.add.rectangle(W / 2, currentY + 3, 260, S.buttonH, C.shadow, 0.25) // shadow
    const logoutBg = this.add.rectangle(W / 2, currentY, 260, S.buttonH, C.dangerDark)
      .setStrokeStyle(2, C.danger, 0.7)
      .setInteractive({ useHandCursor: true })

    this.add.text(W / 2, currentY, 'Sair da Conta', {
      fontFamily: F.body,
      fontSize: S.body,
      color: C.dangerHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    logoutBg.on('pointerover', () => { if (!logoutConfirming) logoutBg.setFillStyle(0x4a1a1a) })
    logoutBg.on('pointerout', () => { if (!logoutConfirming) logoutBg.setFillStyle(C.dangerDark) })
    logoutBg.on('pointerdown', () => {
      if (logoutConfirming) return
      logoutConfirming = true
      soundManager.playClick()

      // Show confirmation popup overlay
      const overlay = this.add.rectangle(W / 2, H / 2, W, H, C.black, 0.5).setDepth(100)
        .setInteractive() // block clicks behind
      const popupBg = this.add.rectangle(W / 2, H / 2, 340, 160, C.panelBg, 0.98).setDepth(101)
        .setStrokeStyle(2, C.danger, 0.6)
      const popupTitle = this.add.text(W / 2, H / 2 - 40, 'Deseja sair?', {
        fontFamily: F.title, fontSize: S.titleMedium, color: C.dangerHex, fontStyle: 'bold',
        shadow: SHADOW.strong,
      }).setOrigin(0.5).setDepth(101)

      // Yes button
      const yesBg = this.add.rectangle(W / 2 - 70, H / 2 + 30, 110, 38, C.dangerDark)
        .setStrokeStyle(1, C.danger, 0.7).setDepth(101).setInteractive({ useHandCursor: true })
      const yesLabel = this.add.text(W / 2 - 70, H / 2 + 30, 'Sim', {
        fontFamily: F.body, fontSize: S.body, color: C.dangerHex, fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(0.5).setDepth(101)

      // No button
      const noBg = this.add.rectangle(W / 2 + 70, H / 2 + 30, 110, 38, CARD_BG)
        .setStrokeStyle(1, C.panelBorder, 0.4).setDepth(101).setInteractive({ useHandCursor: true })
      const noLabel = this.add.text(W / 2 + 70, H / 2 + 30, 'Nao', {
        fontFamily: F.body, fontSize: S.body, color: C.mutedHex, fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(0.5).setDepth(101)

      logoutConfirmGroup.push(overlay, popupBg, popupTitle, yesBg, yesLabel, noBg, noLabel)

      const closePopup = () => {
        logoutConfirmGroup.forEach(o => o.destroy())
        logoutConfirmGroup.length = 0
        logoutConfirming = false
      }

      noBg.on('pointerover', () => noBg.setFillStyle(CARD_BG_HOVER))
      noBg.on('pointerout', () => noBg.setFillStyle(CARD_BG))
      noBg.on('pointerdown', () => { soundManager.playClick(); closePopup() })

      yesBg.on('pointerover', () => yesBg.setFillStyle(0x4a1a1a))
      yesBg.on('pointerout', () => yesBg.setFillStyle(C.dangerDark))
      yesBg.on('pointerdown', async () => {
        soundManager.playClick()
        closePopup()
        localStorage.removeItem('draft_token')
        const { playerData } = await import('../utils/PlayerDataManager')
        playerData.reset()
        transitionTo(this, 'LoginScene')
      })
    })

    // ── Back Arrow ─────────────────────────────────────────────────────────────
    UI.backArrow(this, () => {
      soundManager.playClick()
      transitionTo(this, 'LobbyScene')
    })

    // Fade-in from black
    UI.fadeIn(this)
  }

  shutdown() {
    this.tweens.killAll()
  }
}
