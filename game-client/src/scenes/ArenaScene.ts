import Phaser from 'phaser'

export default class ArenaScene extends Phaser.Scene {
  gridSize = 80
  cols = 16
  rows = 6

  constructor() {
    super('ArenaScene')
  }

  create() {
    this.drawGrid()
  }

  drawGrid() {
    const graphics = this.add.graphics()
    graphics.lineStyle(1, 0xffffff, 0.3)

    for (let x = 0; x <= this.cols; x++) {
      graphics.moveTo(x * this.gridSize, 0)
      graphics.lineTo(x * this.gridSize, this.rows * this.gridSize)
    }

    for (let y = 0; y <= this.rows; y++) {
      graphics.moveTo(0, y * this.gridSize)
      graphics.lineTo(this.cols * this.gridSize, y * this.gridSize)
    }

    graphics.strokePath()
  }
}
