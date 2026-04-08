import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create() {
    GameStateManager.set(GameState.MENU)
    const { width, height } = this.scale

    // Dark fantasy background
    this.add.rectangle(width / 2, height / 2, width, height, 0x080a12)

    // Central panel with gold border glow
    const panel = this.add.rectangle(width / 2, height / 2, 960, 500, 0x1a1f2e, 0.96)
      .setStrokeStyle(1, 0x3d2e14, 1)
    // Outer glow effect via a slightly larger rectangle behind the panel
    this.add.rectangle(width / 2, height / 2, 964, 504, 0x000000, 0)
      .setStrokeStyle(3, 0xc9a84c, 0.15)
      .setDepth(-1)
    panel.setDepth(0)

    // Title with gold glow
    const title = this.add.text(width / 2, 160, 'DRAFT GAME', {
      fontFamily: 'Arial',
      fontSize: '64px',
      color: '#f0c850',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(1)
    title.setShadow(2, 2, '#8b6914', 6)

    // Subtitle
    this.add.text(width / 2, 220, 'by Codeforje VIO', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#7a7062',
    }).setOrigin(0.5).setDepth(1)

    // Description
    this.add.text(width / 2, 268, 'Forje seu destino — monte seu deck, comande suas tropas e conquiste o trono inimigo', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#e8e0d0',
      align: 'center',
      wordWrap: { width: 760 }
    }).setOrigin(0.5).setDepth(1)

    // Decorative gold line above button
    this.add.rectangle(width / 2, 330, 300, 1, 0xc9a84c, 0.4).setDepth(1)

    // Start button - dramatic dark base with gold border
    const startButton = this.add.rectangle(width / 2, 390, 400, 90, 0x1a2a1a, 1)
      .setStrokeStyle(2, 0xc9a84c, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(1)

    const startLabel = this.add.text(width / 2, 390, 'ENTRAR', {
      fontFamily: 'Arial',
      fontSize: '34px',
      color: '#f0c850',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(2)

    // Decorative gold line below button
    this.add.rectangle(width / 2, 450, 300, 1, 0xc9a84c, 0.4).setDepth(1)

    // Pulsing border tween on the start button
    this.tweens.add({
      targets: startButton,
      alpha: { from: 1, to: 0.8 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })

    // Bottom description
    this.add.text(width / 2, 510, 'Monte um deck de 8 habilidades por unidade, posicione suas tropas e derrote o Rei adversario.', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#7a7062',
      wordWrap: { width: 820 },
      align: 'center'
    }).setOrigin(0.5).setDepth(1)

    startButton.on('pointerover', () => {
      startButton.setFillStyle(0x243a24, 1)
      startButton.setStrokeStyle(2, 0xf0c850, 1)
      startLabel.setScale(1.04)
    })

    startButton.on('pointerout', () => {
      startButton.setFillStyle(0x1a2a1a, 1)
      startButton.setStrokeStyle(2, 0xc9a84c, 1)
      startLabel.setScale(1)
    })

    startButton.on('pointerdown', () => {
      this.scene.start('LobbyScene')
    })
  }
}
