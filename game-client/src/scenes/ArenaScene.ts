import Phaser from 'phaser'
import { initialUnits } from '../data/initialUnits'
import type { TeamSide, UnitData } from '../types'

const GRID_SIZE = 64
const COLS = 16
const ROWS = 6
const BOARD_WIDTH = COLS * GRID_SIZE
const BOARD_HEIGHT = ROWS * GRID_SIZE

export default class ArenaScene extends Phaser.Scene {
  private boardX = 0
  private boardY = 0
  private hoverRect?: Phaser.GameObjects.Rectangle
  private selectedUnitId: string | null = null
  private unitsById = new Map<string, UnitData>()
  private unitSprites = new Map<string, Phaser.GameObjects.Container>()
  private infoText?: Phaser.GameObjects.Text
  private turnText?: Phaser.GameObjects.Text
  private activeSide: TeamSide = 'left'

  constructor() {
    super('ArenaScene')
  }

  create() {
    this.boardX = Math.floor((this.scale.width - BOARD_WIDTH) / 2)
    this.boardY = Math.floor((this.scale.height - BOARD_HEIGHT) / 2) + 30

    this.drawBackground()
    this.drawBoardFrame()
    this.drawTiles()
    this.drawMiddleWall()
    this.createUnits()
    this.createHud()
    this.createHover()
  }

  private drawBackground() {
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x0f1117)
    this.add.rectangle(this.scale.width / 2, 50, this.scale.width, 100, 0x121826)
    this.add.text(this.scale.width / 2, 42, 'Arena de Batalha - Protótipo', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#f3f4f6',
      fontStyle: 'bold'
    }).setOrigin(0.5)
  }

  private drawBoardFrame() {
    this.add.rectangle(this.boardX + BOARD_WIDTH / 2, this.boardY + BOARD_HEIGHT / 2, BOARD_WIDTH + 24, BOARD_HEIGHT + 24, 0x171b26)
      .setStrokeStyle(2, 0x3d4866)
  }

  private drawTiles() {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const sideColor = col < 8 ? 0x1a2942 : 0x3b1f2d
        const tileColor = (row + col) % 2 === 0 ? Phaser.Display.Color.IntegerToColor(sideColor).darken(8).color : sideColor
        const tileX = this.boardX + col * GRID_SIZE + GRID_SIZE / 2
        const tileY = this.boardY + row * GRID_SIZE + GRID_SIZE / 2

        const tile = this.add.rectangle(tileX, tileY, GRID_SIZE - 2, GRID_SIZE - 2, tileColor)
          .setStrokeStyle(1, 0xffffff, 0.12)
          .setInteractive({ useHandCursor: true })

        tile.on('pointerover', () => this.updateHover(col, row, true))
        tile.on('pointerout', () => this.updateHover(col, row, false))
        tile.on('pointerdown', () => this.handleTileClick(col, row))
      }
    }
  }

  private drawMiddleWall() {
    for (let row = 0; row < ROWS; row++) {
      const wallX = this.boardX + 8 * GRID_SIZE
      const wallY = this.boardY + row * GRID_SIZE + GRID_SIZE / 2

      this.add.rectangle(wallX, wallY, 8, GRID_SIZE - 6, 0x8b949e, 0.95)
      this.add.rectangle(wallX - 4, wallY, 3, GRID_SIZE - 10, 0xc7ccd4, 0.7)
    }
  }

  private createUnits() {
    initialUnits.forEach((unit) => {
      this.unitsById.set(unit.id, { ...unit })
      this.unitSprites.set(unit.id, this.createUnitSprite(unit))
    })
  }

  private createUnitSprite(unit: UnitData) {
    const x = this.boardX + unit.col * GRID_SIZE + GRID_SIZE / 2
    const y = this.boardY + unit.row * GRID_SIZE + GRID_SIZE / 2

    const body = this.add.circle(0, 0, 22, unit.color)
      .setStrokeStyle(3, 0xf8fafc, 0.85)

    const label = this.add.text(0, 0, unit.symbol, {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#0b1020',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    const container = this.add.container(x, y, [body, label]).setSize(44, 44).setInteractive({ useHandCursor: true })

    container.on('pointerdown', () => {
      this.selectedUnitId = unit.id
      this.refreshSelectionVisuals()
      this.updateInfo(`${unit.name} (${unit.side === 'left' ? 'esquerda' : 'direita'}) selecionado. Clique em uma casa válida.`)
    })

    return container
  }

  private createHud() {
    this.turnText = this.add.text(this.boardX, this.boardY - 48, 'Turno atual: Time Azul', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#dbeafe',
      fontStyle: 'bold'
    })

    this.infoText = this.add.text(this.boardX, this.boardY + BOARD_HEIGHT + 24, 'Selecione um personagem e clique em uma casa vazia do seu lado.', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#d1d5db',
      wordWrap: { width: BOARD_WIDTH }
    })
  }

  private createHover() {
    this.hoverRect = this.add.rectangle(0, 0, GRID_SIZE - 4, GRID_SIZE - 4, 0xffffff, 0.12)
      .setStrokeStyle(2, 0xffffff, 0.35)
      .setVisible(false)
  }

  private updateHover(col: number, row: number, visible: boolean) {
    if (!this.hoverRect) return

    this.hoverRect.setPosition(
      this.boardX + col * GRID_SIZE + GRID_SIZE / 2,
      this.boardY + row * GRID_SIZE + GRID_SIZE / 2
    )
    this.hoverRect.setVisible(visible)
  }

  private handleTileClick(col: number, row: number) {
    if (!this.selectedUnitId) {
      this.updateInfo('Primeiro selecione um personagem.')
      return
    }

    const unit = this.unitsById.get(this.selectedUnitId)
    if (!unit) return

    if (!this.isMoveAllowed(unit, col, row)) {
      this.updateInfo('Movimento inválido para este protótipo.')
      return
    }

    unit.col = col
    unit.row = row

    const sprite = this.unitSprites.get(unit.id)
    if (sprite) {
      this.tweens.add({
        targets: sprite,
        x: this.boardX + col * GRID_SIZE + GRID_SIZE / 2,
        y: this.boardY + row * GRID_SIZE + GRID_SIZE / 2,
        duration: 180,
        ease: 'Sine.easeOut'
      })
    }

    this.selectedUnitId = null
    this.refreshSelectionVisuals()
    this.swapActiveSide()
  }

  private isMoveAllowed(unit: UnitData, targetCol: number, targetRow: number) {
    const onCorrectSide = unit.side === 'left' ? targetCol <= 7 : targetCol >= 8
    if (!onCorrectSide) return false

    const occupied = [...this.unitsById.values()].some((other) => other.id !== unit.id && other.col === targetCol && other.row === targetRow)
    if (occupied) return false

    const distance = Math.abs(unit.col - targetCol) + Math.abs(unit.row - targetRow)
    if (distance === 0) return false

    const maxDistance = unit.role === 'dps' ? 3 : unit.role === 'king' ? 99 : 2
    return distance <= maxDistance
  }

  private swapActiveSide() {
    this.activeSide = this.activeSide === 'left' ? 'right' : 'left'
    const label = this.activeSide === 'left' ? 'Time Azul' : 'Time Vermelho'
    this.turnText?.setText(`Turno atual: ${label}`)
    this.updateInfo(`Movimento concluído. Agora é a vez do ${label}.`)
  }

  private refreshSelectionVisuals() {
    this.unitSprites.forEach((container, id) => {
      const circle = container.list[0] as Phaser.GameObjects.Arc
      circle.setStrokeStyle(id === this.selectedUnitId ? 5 : 3, id === this.selectedUnitId ? 0xffffff : 0xf8fafc, 0.95)
      container.setScale(id === this.selectedUnitId ? 1.08 : 1)
    })
  }

  private updateInfo(text: string) {
    this.infoText?.setText(text)
  }
}
