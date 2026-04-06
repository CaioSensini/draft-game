// Commit 2 - Targeting base (simplified for chunk 1)
import Phaser from 'phaser'

export class ArenaScene extends Phaser.Scene {
  private selectedUnit: any = null
  private isTargeting = false

  constructor() {
    super('{arena}')
  }

  create() {
    this.add.text(10, 10, 'Targeting system activo', color: '#fff')

    this.input.on('pointerdown', (pointer: any) => {
      if (!this.isTargeting) return

      const x= Math.floor(pointer.x / 64)
      const y = Math.floor(pointer.y / 64)

      console.log('Tile selecionado:', x, y)

      this.isTargeting = false
    })
  }

  startTargeting() {
    this.isTargeting = true
    console.log('Entrando em modo targeting')
  }
}
