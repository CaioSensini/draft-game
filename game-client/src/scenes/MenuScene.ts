import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create() {
    GameStateManager.set(GameState.MENU)
    const { width, height } = this.scale

    this.add.rectangle(width / 2, height / 2, width, height, 0x0f1117)
    this.add.rectangle(width / 2, height / 2, 920, 500, 0x171b26, 0.96).setStrokeStyle(2, 0x39435c, 1)

    this.add.text(width / 2, 170, 'DRAFT GAME', {
      fontFamily: 'Arial',
      fontSize: '58px',
      color: '#f8e7b9',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.add.text(width / 2, 245, 'Jogo tático — monte seu deck, enfrente o bot e derrote o Rei inimigo', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#cfd7ea',
      align: 'center',
      wordWrap: { width: 760 }
    }).setOrigin(0.5)

    const startButton = this.add.rectangle(width / 2, 390, 360, 80, 0x3a7a45, 1)
      .setStrokeStyle(2, 0x9ee6a9, 1)
      .setInteractive({ useHandCursor: true })

    const startLabel = this.add.text(width / 2, 390, 'CLIQUE PARA INICIAR', {
      fontFamily: 'Arial',
      fontSize: '30px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.add.text(width / 2, 500, 'Monte um deck de 8 habilidades por unidade (2 por grupo), posicione suas tropas e vença o Rei adversário controlado pelo bot.', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#8ea0c9',
      wordWrap: { width: 820 },
      align: 'center'
    }).setOrigin(0.5)

    startButton.on('pointerover', () => {
      startButton.setFillStyle(0x4a9155, 1)
      startLabel.setScale(1.03)
    })

    startButton.on('pointerout', () => {
      startButton.setFillStyle(0x3a7a45, 1)
      startLabel.setScale(1)
    })

    startButton.on('pointerdown', () => {
      this.scene.start('DeckBuildScene')
    })
  }
}
