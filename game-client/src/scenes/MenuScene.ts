import Phaser from 'phaser'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create() {
    const { width, height } = this.scale

    this.add.rectangle(width / 2, height / 2, width, height, 0x0f1117)
    this.add.rectangle(width / 2, height / 2, 860, 420, 0x171b26, 0.95).setStrokeStyle(2, 0x39435c, 1)

    this.add.text(width / 2, 210, 'DRAFT GAME', {
      fontFamily: 'Arial',
      fontSize: '52px',
      color: '#f8e7b9',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.add.text(width / 2, 280, 'Protótipo inicial da arena tática', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#cfd7ea'
    }).setOrigin(0.5)

    const startButton = this.add.rectangle(width / 2, 420, 320, 74, 0x3a7a45, 1)
      .setStrokeStyle(2, 0x9ee6a9, 1)
      .setInteractive({ useHandCursor: true })

    const startLabel = this.add.text(width / 2, 420, 'CLIQUE PARA INICIAR', {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.add.text(width / 2, 520, 'Próximas etapas: movimentação, turnos e cartas', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#8ea0c9'
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
      this.scene.start('ArenaScene')
    })
  }
}
