import Phaser from 'phaser'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create() {
    const text = this.add.text(640, 360, 'DRAFT GAME\nClique para iniciar', {
      fontSize: '32px',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5)

    this.input.once('pointerdown', () => {
      this.scene.start('ArenaScene')
    })
  }
}
