import Phaser from 'phaser'
import { initialUnits } from '../data/initialUnits'
import { getRoleCards } from '../data/cardTemplates'
import type { CardData, PhaseType, TeamSide, UnitData } from '../types'

const GRID_SIZE = 64
const COLS = 16
const ROWS = 6
const BOARD_WIDTH = COLS * GRID_SIZE
const BOARD_HEIGHT = ROWS * GRID_SIZE
const SIDES: TeamSide[] = ['left', 'right']

type TileTarget = {
  col: number
  row: number
}

type TargetSelection = {
  label: string
  unitId?: string
  tile?: TileTarget
}

type UnitProgress = {
  movedThisPhase: boolean
  actedThisPhase: boolean
  selectedAttackId: string | null
  selectedDefenseId: string | null
  selectedAttackTarget: TargetSelection | null
  selectedDefenseTarget: TargetSelection | null
}

type PendingTargeting = {
  unitId: string
  card: CardData
}

export default class ArenaScene extends Phaser.Scene {
  private boardX = 0
  private boardY = 0
  private hoverRect?: Phaser.GameObjects.Rectangle
  private selectedUnitId: string | null = null
  private unitsById = new Map<string, UnitData>()
  private unitSprites = new Map<string, Phaser.GameObjects.Container>()
  private infoText?: Phaser.GameObjects.Text
  private topBarText?: Phaser.GameObjects.Text
  private phaseText?: Phaser.GameObjects.Text
  private roundText?: Phaser.GameObjects.Text
  private timerText?: Phaser.GameObjects.Text
  private sideBanner?: Phaser.GameObjects.Rectangle
  private sideBannerText?: Phaser.GameObjects.Text
  private selectedUnitText?: Phaser.GameObjects.Text
  private cardHintText?: Phaser.GameObjects.Text
  private actionButton?: Phaser.GameObjects.Rectangle
  private actionButtonText?: Phaser.GameObjects.Text
  private validMoveMarkers: Phaser.GameObjects.Rectangle[] = []
  private targetTileMarkers: Phaser.GameObjects.Rectangle[] = []
  private cardButtons: Phaser.GameObjects.Container[] = []
  private unitProgress = new Map<string, UnitProgress>()
  private currentSideIndex = 0
  private currentPhase: PhaseType = 'movement'
  private roundNumber = 1
  private phaseTimeRemaining = 20
  private phaseTimer?: Phaser.Time.TimerEvent
  private pendingTargeting: PendingTargeting | null = null
  private highlightedUnitIds = new Set<string>()

  constructor() {
    super('ArenaScene')
  }

  create() {
    this.boardX = Math.floor((this.scale.width - BOARD_WIDTH) / 2)
    this.boardY = 150

    this.bootstrapState()
    this.drawBackground()
    this.drawBoardFrame()
    this.drawTiles()
    this.drawMiddleWall()
    this.createUnits()
    this.createHud()
    this.createHover()
    this.startPhase('movement')
  }

  private bootstrapState() {
    initialUnits.forEach((unit) => {
      this.unitsById.set(unit.id, { ...unit })
      this.unitProgress.set(unit.id, {
        movedThisPhase: false,
        actedThisPhase: false,
        selectedAttackId: null,
        selectedDefenseId: null,
        selectedAttackTarget: null,
        selectedDefenseTarget: null
      })
    })
  }

  private drawBackground() {
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x0c1018)
    this.add.rectangle(this.scale.width / 2, 48, this.scale.width, 96, 0x101827)
    this.add.rectangle(this.scale.width / 2, this.scale.height - 90, this.scale.width, 180, 0x101827)

    this.add.text(this.scale.width / 2, 40, 'Draft Game - Arena Tática', {
      fontFamily: 'Arial',
      fontSize: '34px',
      color: '#f8e7b9',
      fontStyle: 'bold'
    }).setOrigin(0.5)
  }

  private drawBoardFrame() {
    this.add.rectangle(this.boardX + BOARD_WIDTH / 2, this.boardY + BOARD_HEIGHT / 2, BOARD_WIDTH + 28, BOARD_HEIGHT + 28, 0x151b29)
      .setStrokeStyle(2, 0x38445e)
  }

  private drawTiles() {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const sideColor = col < 8 ? 0x1f3354 : 0x4b2534
        const tileColor = (row + col) % 2 === 0
          ? Phaser.Display.Color.IntegerToColor(sideColor).darken(10).color
          : sideColor
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
      this.add.rectangle(wallX, wallY, 10, GRID_SIZE - 6, 0x8c97a4, 0.95)
      this.add.rectangle(wallX - 4, wallY, 3, GRID_SIZE - 12, 0xd1d5db, 0.8)
    }
  }

  private createUnits() {
    initialUnits.forEach((unit) => {
      this.unitSprites.set(unit.id, this.createUnitSprite(unit))
    })
  }

  private createUnitSprite(unit: UnitData) {
    const x = this.boardX + unit.col * GRID_SIZE + GRID_SIZE / 2
    const y = this.boardY + unit.row * GRID_SIZE + GRID_SIZE / 2

    const outer = this.add.circle(0, 0, 24, 0x0b1020).setStrokeStyle(2, 0xffffff, 0.2)
    const body = this.add.circle(0, 0, 21, unit.color).setStrokeStyle(3, 0xf8fafc, 0.9)
    const label = this.add.text(0, 0, unit.symbol, {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#0b1020',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    const container = this.add.container(x, y, [outer, body, label]).setSize(48, 48).setInteractive({ useHandCursor: true })
    container.on('pointerdown', () => this.handleUnitClick(unit.id))
    return container
  }

  private createHud() {
    this.topBarText = this.add.text(this.boardX, 82, '', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#cbd5e1'
    })

    this.roundText = this.add.text(this.boardX, 112, '', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#f8fafc',
      fontStyle: 'bold'
    })

    this.phaseText = this.add.text(this.boardX + 320, 112, '', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#fef3c7',
      fontStyle: 'bold'
    })

    this.timerText = this.add.text(this.boardX + 600, 112, '', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#fca5a5',
      fontStyle: 'bold'
    })

    this.sideBanner = this.add.rectangle(this.boardX + BOARD_WIDTH - 90, 104, 170, 48, 0x274c77, 1)
      .setStrokeStyle(2, 0xdbeafe, 0.7)
    this.sideBannerText = this.add.text(this.boardX + BOARD_WIDTH - 90, 104, '', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.selectedUnitText = this.add.text(this.boardX, this.boardY + BOARD_HEIGHT + 22, 'Selecione uma unidade do lado ativo.', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#e5e7eb'
    })

    this.infoText = this.add.text(this.boardX, this.boardY + BOARD_HEIGHT + 50, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#9fb0d9',
      wordWrap: { width: BOARD_WIDTH }
    })

    this.cardHintText = this.add.text(this.boardX, this.boardY + BOARD_HEIGHT + 86, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#fde68a',
      wordWrap: { width: BOARD_WIDTH }
    })

    this.actionButton = this.add.rectangle(this.boardX + BOARD_WIDTH - 130, this.boardY + BOARD_HEIGHT + 120, 250, 52, 0x3a7a45, 1)
      .setStrokeStyle(2, 0x9ee6a9, 0.9)
      .setInteractive({ useHandCursor: true })
    this.actionButtonText = this.add.text(this.boardX + BOARD_WIDTH - 130, this.boardY + BOARD_HEIGHT + 120, 'Encerrar fase', {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    this.actionButton.on('pointerdown', () => this.forceAdvancePhase())
  }

  private createHover() {
    this.hoverRect = this.add.rectangle(0, 0, GRID_SIZE - 4, GRID_SIZE - 4, 0xffffff, 0.12)
      .setStrokeStyle(2, 0xffffff, 0.35)
      .setVisible(false)
  }

  private handleUnitClick(unitId: string) {
    if (this.pendingTargeting) {
      this.handleTargetedUnitSelection(unitId)
      return
    }

    const unit = this.unitsById.get(unitId)
    if (!unit) return

    if (unit.side !== this.currentSide()) {
      this.updateInfo('Você só pode interagir com unidades do lado ativo.')
      return
    }

    const progress = this.unitProgress.get(unitId)
    if (!progress) return

    if (this.currentPhase === 'movement' && progress.movedThisPhase) {
      this.updateInfo('Essa unidade já se moveu nesta fase.')
      return
    }

    if (this.currentPhase === 'action' && progress.actedThisPhase) {
      this.updateInfo('Essa unidade já escolheu as ações desta fase.')
      return
    }

    this.selectedUnitId = unitId
    this.refreshSelectionVisuals()

    if (this.currentPhase === 'movement') {
      this.showValidMoveMarkers(unit)
      this.selectedUnitText?.setText(`${unit.name} selecionado para movimento.`)
      this.cardHintText?.setText('Fase de movimento: clique em uma casa válida do seu lado.')
    } else {
      this.clearValidMoveMarkers()
      this.selectedUnitText?.setText(`${unit.name} selecionado para escolher ações.`)
      this.renderCardButtons(unit)
    }
  }

  private handleTargetedUnitSelection(targetUnitId: string) {
    const pending = this.pendingTargeting
    if (!pending) return

    const sourceUnit = this.unitsById.get(pending.unitId)
    const targetUnit = this.unitsById.get(targetUnitId)
    if (!sourceUnit || !targetUnit) return

    const validTargetIds = this.getUnitsInRange(sourceUnit, pending.card.targetKind, pending.card.range).map((unit) => unit.id)
    if (!validTargetIds.includes(targetUnitId)) {
      this.updateInfo('Esse alvo não é válido para a carta selecionada.')
      return
    }

    this.applyCardSelection(pending.unitId, pending.card, {
      unitId: targetUnit.id,
      label: targetUnit.name
    })
    this.updateInfo(`${sourceUnit.name} preparou ${pending.card.name} em ${targetUnit.name}.`)
    this.clearTargetingState()
  }

  private handleTileClick(col: number, row: number) {
    if (this.pendingTargeting) {
      this.handleTargetedTileSelection(col, row)
      return
    }

    if (this.currentPhase !== 'movement') {
      this.updateInfo('No momento, você está na fase de ações.')
      return
    }

    if (!this.selectedUnitId) {
      this.updateInfo('Primeiro selecione uma unidade do lado ativo.')
      return
    }

    const unit = this.unitsById.get(this.selectedUnitId)
    if (!unit) return

    if (!this.isMoveAllowed(unit, col, row)) {
      this.updateInfo('Movimento inválido para esta unidade.')
      return
    }

    unit.col = col
    unit.row = row

    const progress = this.unitProgress.get(unit.id)
    if (progress) progress.movedThisPhase = true

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

    this.updateInfo(`${unit.name} moveu para ${col},${row}.`)
    this.selectedUnitId = null
    this.refreshSelectionVisuals()
    this.clearValidMoveMarkers()

    if (this.haveAllActiveUnitsMoved()) {
      this.startPhase('action')
    }
  }

  private handleTargetedTileSelection(col: number, row: number) {
    const pending = this.pendingTargeting
    if (!pending) return

    const sourceUnit = this.unitsById.get(pending.unitId)
    if (!sourceUnit) return

    if (!this.isTileAllowedForCard(sourceUnit, pending.card, col, row)) {
      this.updateInfo('Esse bloco não é válido para a carta selecionada.')
      return
    }

    this.applyCardSelection(pending.unitId, pending.card, {
      tile: { col, row },
      label: `${col},${row}`
    })
    this.updateInfo(`${sourceUnit.name} preparou ${pending.card.name} no bloco ${col},${row}.`)
    this.clearTargetingState()
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

  private isTileInRange(unit: UnitData, targetCol: number, targetRow: number, range: number) {
    const distance = Math.abs(unit.col - targetCol) + Math.abs(unit.row - targetRow)
    return distance > 0 && distance <= range
  }

  private isTileOnSide(col: number, side: TeamSide) {
    return side === 'left' ? col <= 7 : col >= 8
  }

  private getTileTargetSide(sourceUnit: UnitData, card: CardData): TeamSide {
    if (card.targetKind === 'enemy') {
      return sourceUnit.side === 'left' ? 'right' : 'left'
    }

    return sourceUnit.side
  }

  private isTileAllowedForCard(sourceUnit: UnitData, card: CardData, col: number, row: number) {
    return this.isTileInRange(sourceUnit, col, row, card.range) && this.isTileOnSide(col, this.getTileTargetSide(sourceUnit, card))
  }

  private showValidMoveMarkers(unit: UnitData) {
    this.clearValidMoveMarkers()

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!this.isMoveAllowed(unit, col, row)) continue
        const marker = this.add.rectangle(
          this.boardX + col * GRID_SIZE + GRID_SIZE / 2,
          this.boardY + row * GRID_SIZE + GRID_SIZE / 2,
          GRID_SIZE - 22,
          GRID_SIZE - 22,
          0xfacc15,
          0.24
        ).setStrokeStyle(2, 0xfef08a, 0.75)
        this.validMoveMarkers.push(marker)
      }
    }
  }

  private clearValidMoveMarkers() {
    this.validMoveMarkers.forEach((marker) => marker.destroy())
    this.validMoveMarkers = []
  }

  private renderCardButtons(unit: UnitData) {
    this.clearCardButtons()
    const cards = getRoleCards(unit.role)
    const startX = this.boardX
    const y = this.boardY + BOARD_HEIGHT + 120

    cards.forEach((card, index) => {
      const col = index % 4
      const row = Math.floor(index / 4)
      const x = startX + col * 250 + 110
      const cy = y + row * 72
      const isAttack = card.category === 'attack'
      const fill = isAttack ? 0x7c2d12 : 0x164e63
      const border = isAttack ? 0xfb923c : 0x67e8f9
      const targetingLabel = card.targetingMode === 'unit' ? 'alvo' : card.targetingMode === 'tile' ? 'bloco' : 'auto'

      const bg = this.add.rectangle(0, 0, 220, 56, fill, 0.95).setStrokeStyle(2, border, 0.9)
      const title = this.add.text(0, -10, `${card.name} [${targetingLabel}]`, {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold'
      }).setOrigin(0.5)
      const desc = this.add.text(0, 12, card.shortDescription, {
        fontFamily: 'Arial',
        fontSize: '11px',
        color: '#f8fafc',
        align: 'center',
        wordWrap: { width: 190 }
      }).setOrigin(0.5)

      const container = this.add.container(x, cy, [bg, title, desc]).setSize(220, 56).setInteractive({ useHandCursor: true })
      container.on('pointerdown', () => this.selectCardForUnit(unit.id, card))
      this.cardButtons.push(container)
    })

    this.cardHintText?.setText('Escolha 1 carta de ataque e 1 carta de defesa. Ataques miram no campo inimigo e defesas no seu campo.')
  }

  private clearCardButtons() {
    this.cardButtons.forEach((button) => button.destroy())
    this.cardButtons = []
  }

  private selectCardForUnit(unitId: string, card: CardData) {
    const unit = this.unitsById.get(unitId)
    if (!unit) return

    if (card.targetingMode === 'none') {
      this.applyCardSelection(unitId, card, { label: 'auto' })
      this.updateInfo(`${unit.name}: ${card.name} selecionada.`)
      return
    }

    this.beginTargeting(unitId, card)
  }

  private beginTargeting(unitId: string, card: CardData) {
    const sourceUnit = this.unitsById.get(unitId)
    if (!sourceUnit) return

    this.pendingTargeting = { unitId, card }
    this.clearTargetIndicators()

    if (card.targetingMode === 'unit') {
      const validUnits = this.getUnitsInRange(sourceUnit, card.targetKind, card.range)
      validUnits.forEach((unit) => this.highlightedUnitIds.add(unit.id))
      const targetLabel = card.targetKind === 'enemy' ? 'um inimigo' : card.targetKind === 'ally' ? 'um aliado' : 'a própria unidade'
      this.cardHintText?.setText(`Modo alvo ativo: clique em ${targetLabel} para ${card.name}.`)
    }

    if (card.targetingMode === 'tile') {
      const sideLabel = this.getTileTargetSide(sourceUnit, card) === sourceUnit.side ? 'seu campo' : 'campo inimigo'
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          if (!this.isTileAllowedForCard(sourceUnit, card, col, row)) continue
          const marker = this.add.rectangle(
            this.boardX + col * GRID_SIZE + GRID_SIZE / 2,
            this.boardY + row * GRID_SIZE + GRID_SIZE / 2,
            GRID_SIZE - 18,
            GRID_SIZE - 18,
            0x22c55e,
            0.18
          ).setStrokeStyle(2, 0x86efac, 0.9)
          this.targetTileMarkers.push(marker)
        }
      }
      this.cardHintText?.setText(`Modo bloco ativo: clique em um tile válido no ${sideLabel} para ${card.name}.`)
    }

    this.refreshSelectionVisuals()
    this.updateInfo(`${sourceUnit.name} entrou em modo de targeting com ${card.name}.`)
  }

  private applyCardSelection(unitId: string, card: CardData, target: TargetSelection) {
    const progress = this.unitProgress.get(unitId)
    const unit = this.unitsById.get(unitId)
    if (!progress || !unit) return

    if (card.category === 'attack') {
      progress.selectedAttackId = card.id
      progress.selectedAttackTarget = target
    } else {
      progress.selectedDefenseId = card.id
      progress.selectedDefenseTarget = target
    }

    if (progress.selectedAttackId && progress.selectedDefenseId) {
      progress.actedThisPhase = true
      this.selectedUnitText?.setText(`${unit.name} já confirmou ataque e defesa.`)
      this.cardHintText?.setText('Selecione outra unidade do lado ativo ou encerre a fase.')
      this.selectedUnitId = null
      this.clearCardButtons()

      if (this.haveAllActiveUnitsActed()) {
        this.resolveCurrentSideActions()
      }
    }

    this.refreshSelectionVisuals()
  }

  private getUnitsInRange(sourceUnit: UnitData, targetKind: CardData['targetKind'], range: number) {
    return [...this.unitsById.values()].filter((unit) => {
      if (unit.id === sourceUnit.id) {
        return targetKind === 'self'
      }

      if (targetKind === 'enemy' && unit.side === sourceUnit.side) return false
      if (targetKind === 'ally' && unit.side !== sourceUnit.side) return false
      if (targetKind === 'self') return false

      const distance = Math.abs(sourceUnit.col - unit.col) + Math.abs(sourceUnit.row - unit.row)
      return distance <= range
    })
  }

  private clearTargetIndicators() {
    this.targetTileMarkers.forEach((marker) => marker.destroy())
    this.targetTileMarkers = []
    this.highlightedUnitIds.clear()
  }

  private clearTargetingState() {
    this.pendingTargeting = null
    this.clearTargetIndicators()
    this.refreshSelectionVisuals()
  }

  private resolveCurrentSideActions() {
    const side = this.currentSide()
    const sideUnits = this.getSideUnits(side)
    const executionOrder: Array<UnitData['role']> = ['king', 'tank', 'dps', 'healer']
    const lines: string[] = []

    executionOrder.forEach((role) => {
      const unit = sideUnits.find((entry) => entry.role === role)
      const progress = unit ? this.unitProgress.get(unit.id) : null
      if (!unit || !progress) return

      const attackCard = progress.selectedAttackId ? getRoleCards(unit.role).find((card) => card.id === progress.selectedAttackId) : null
      const defenseCard = progress.selectedDefenseId ? getRoleCards(unit.role).find((card) => card.id === progress.selectedDefenseId) : null
      const attackLabel = attackCard ? `${attackCard.name}${progress.selectedAttackTarget ? ` -> ${progress.selectedAttackTarget.label}` : ''}` : '-'
      const defenseLabel = defenseCard ? `${defenseCard.name}${progress.selectedDefenseTarget ? ` -> ${progress.selectedDefenseTarget.label}` : ''}` : '-'

      lines.push(`${unit.name}: ataque=${attackLabel} | defesa=${defenseLabel}`)
    })

    this.updateInfo(`Ações preparadas do ${side === 'left' ? 'Time Azul' : 'Time Vermelho'}: ${lines.join(' / ')}`)
    this.playMockResolution(sideUnits, executionOrder, 0)
  }

  private playMockResolution(sideUnits: UnitData[], executionOrder: Array<UnitData['role']>, index: number) {
    if (index >= executionOrder.length) {
      this.time.delayedCall(450, () => this.advanceAfterActionResolution())
      return
    }

    const unit = sideUnits.find((entry) => entry.role === executionOrder[index])
    const progress = unit ? this.unitProgress.get(unit.id) : null
    const sourceSprite = unit ? this.unitSprites.get(unit.id) : null

    if (!unit || !progress || !sourceSprite) {
      this.playMockResolution(sideUnits, executionOrder, index + 1)
      return
    }

    const attackCard = progress.selectedAttackId ? getRoleCards(unit.role).find((card) => card.id === progress.selectedAttackId) : null
    const defenseCard = progress.selectedDefenseId ? getRoleCards(unit.role).find((card) => card.id === progress.selectedDefenseId) : null

    this.tweens.add({
      targets: sourceSprite,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 120,
      yoyo: true,
      ease: 'Sine.easeInOut'
    })

    if (attackCard) {
      this.spawnFloatingText(unit.col, unit.row, attackCard.name, '#fca5a5')
      this.playAttackPreview(unit, attackCard, progress.selectedAttackTarget)
    }

    if (defenseCard) {
      this.time.delayedCall(180, () => {
        this.spawnFloatingText(unit.col, unit.row, defenseCard.name, '#93c5fd')
      })
    }

    this.time.delayedCall(700, () => this.playMockResolution(sideUnits, executionOrder, index + 1))
  }

  private playAttackPreview(sourceUnit: UnitData, card: CardData, target: TargetSelection | null) {
    if (!target) return

    const start = this.getBoardPoint(sourceUnit.col, sourceUnit.row)

    if (target.unitId) {
      const targetUnit = this.unitsById.get(target.unitId)
      const targetSprite = this.unitSprites.get(target.unitId)
      if (!targetUnit || !targetSprite) return

      const end = this.getBoardPoint(targetUnit.col, targetUnit.row)
      const projectile = this.add.circle(start.x, start.y, 8, card.category === 'attack' ? 0xfb7185 : 0x60a5fa, 0.95)

      this.tweens.add({
        targets: projectile,
        x: end.x,
        y: end.y,
        duration: 260,
        ease: 'Sine.easeOut',
        onComplete: () => projectile.destroy()
      })

      this.tweens.add({
        targets: targetSprite,
        alpha: 0.35,
        duration: 70,
        yoyo: true,
        repeat: 1
      })

      this.spawnFloatingText(targetUnit.col, targetUnit.row, card.category === 'attack' ? '-hit' : '+buff', card.category === 'attack' ? '#fda4af' : '#93c5fd')
      return
    }

    if (target.tile) {
      const impact = this.add.circle(0, 0, 14, card.category === 'attack' ? 0xf97316 : 0x22c55e, 0.22)
      impact.setPosition(this.boardX + target.tile.col * GRID_SIZE + GRID_SIZE / 2, this.boardY + target.tile.row * GRID_SIZE + GRID_SIZE / 2)
      impact.setStrokeStyle(3, card.category === 'attack' ? 0xfdba74 : 0x86efac, 0.95)

      this.tweens.add({
        targets: impact,
        scaleX: 2.1,
        scaleY: 2.1,
        alpha: 0,
        duration: 280,
        ease: 'Sine.easeOut',
        onComplete: () => impact.destroy()
      })

      this.spawnFloatingText(target.tile.col, target.tile.row, card.name, card.category === 'attack' ? '#fdba74' : '#86efac')
    }
  }

  private spawnFloatingText(col: number, row: number, text: string, color: string) {
    const point = this.getBoardPoint(col, row)
    const floating = this.add.text(point.x, point.y - 20, text, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color,
      fontStyle: 'bold',
      stroke: '#0b1020',
      strokeThickness: 4
    }).setOrigin(0.5)

    this.tweens.add({
      targets: floating,
      y: floating.y - 34,
      alpha: 0,
      duration: 550,
      ease: 'Sine.easeOut',
      onComplete: () => floating.destroy()
    })
  }

  private getBoardPoint(col: number, row: number) {
    return {
      x: this.boardX + col * GRID_SIZE + GRID_SIZE / 2,
      y: this.boardY + row * GRID_SIZE + GRID_SIZE / 2
    }
  }

  private advanceAfterActionResolution() {
    if (this.currentSideIndex === 0) {
      this.currentSideIndex = 1
      this.resetProgressForSide(this.currentSide())
      this.startPhase('movement')
    } else {
      this.currentSideIndex = 0
      this.roundNumber += 1
      SIDES.forEach((side) => this.resetProgressForSide(side))
      this.startPhase('movement')
    }
  }

  private startPhase(phase: PhaseType) {
    this.currentPhase = phase
    this.selectedUnitId = null
    this.clearTargetingState()
    this.refreshSelectionVisuals()
    this.clearValidMoveMarkers()
    this.clearCardButtons()

    if (phase === 'movement') {
      this.phaseTimeRemaining = 20
      this.phaseText?.setText('Fase: Movimento')
      this.selectedUnitText?.setText('Selecione uma unidade do lado ativo para mover.')
      this.cardHintText?.setText('Rei pode teleportar para qualquer casa do seu lado. DPS move 3. Tank/Healer movem 2.')
    } else {
      this.phaseTimeRemaining = 15
      this.phaseText?.setText('Fase: Ações')
      this.selectedUnitText?.setText('Selecione uma unidade do lado ativo para escolher ataque e defesa.')
      this.cardHintText?.setText('Cartas de ataque miram no campo inimigo. Cartas de defesa miram no seu campo.')
    }

    this.updateTopHud()
    this.restartPhaseTimer()
  }

  private restartPhaseTimer() {
    this.phaseTimer?.remove(false)
    this.timerText?.setText(`Tempo: ${this.phaseTimeRemaining}s`)

    this.phaseTimer = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.phaseTimeRemaining -= 1
        this.timerText?.setText(`Tempo: ${Math.max(this.phaseTimeRemaining, 0)}s`)

        if (this.phaseTimeRemaining <= 0) {
          this.phaseTimer?.remove(false)
          this.forceAdvancePhase()
        }
      }
    })
  }

  private forceAdvancePhase() {
    if (this.currentPhase === 'movement') {
      this.updateInfo('Tempo da fase de movimento encerrado. Indo para a fase de ações.')
      this.startPhase('action')
      return
    }

    this.clearTargetingState()
    this.updateInfo('Tempo da fase de ações encerrado. Resolvendo ações mock do lado ativo.')
    this.resolveCurrentSideActions()
  }

  private haveAllActiveUnitsMoved() {
    return this.getSideUnits(this.currentSide()).every((unit) => this.unitProgress.get(unit.id)?.movedThisPhase)
  }

  private haveAllActiveUnitsActed() {
    return this.getSideUnits(this.currentSide()).every((unit) => this.unitProgress.get(unit.id)?.actedThisPhase)
  }

  private getSideUnits(side: TeamSide) {
    return [...this.unitsById.values()].filter((unit) => unit.side === side)
  }

  private currentSide(): TeamSide {
    return SIDES[this.currentSideIndex]
  }

  private resetProgressForSide(side: TeamSide) {
    this.getSideUnits(side).forEach((unit) => {
      const progress = this.unitProgress.get(unit.id)
      if (!progress) return
      progress.movedThisPhase = false
      progress.actedThisPhase = false
      progress.selectedAttackId = null
      progress.selectedDefenseId = null
      progress.selectedAttackTarget = null
      progress.selectedDefenseTarget = null
    })
  }

  private updateTopHud() {
    const side = this.currentSide()
    const sideLabel = side === 'left' ? 'Time Azul' : 'Time Vermelho'
    const sideColor = side === 'left' ? 0x274c77 : 0x7f1d1d
    const borderColor = side === 'left' ? 0xdbeafe : 0xfecaca

    this.topBarText?.setText('Build atual: targeting por lado do campo + preview visual de ações')
    this.roundText?.setText(`Round ${this.roundNumber}`)
    this.sideBanner?.setFillStyle(sideColor, 1).setStrokeStyle(2, borderColor, 0.8)
    this.sideBannerText?.setText(sideLabel)
  }

  private updateHover(col: number, row: number, visible: boolean) {
    if (!this.hoverRect) return
    this.hoverRect.setPosition(this.boardX + col * GRID_SIZE + GRID_SIZE / 2, this.boardY + row * GRID_SIZE + GRID_SIZE / 2)
    this.hoverRect.setVisible(visible)
  }

  private refreshSelectionVisuals() {
    this.unitSprites.forEach((container, id) => {
      const body = container.list[1] as Phaser.GameObjects.Arc
      const isSelected = id === this.selectedUnitId
      const isHighlightedTarget = this.highlightedUnitIds.has(id)
      const strokeColor = isSelected ? 0xffffff : isHighlightedTarget ? 0x86efac : 0xf8fafc
      const strokeWidth = isSelected || isHighlightedTarget ? 5 : 3

      body.setStrokeStyle(strokeWidth, strokeColor, 0.95)
      container.setScale(isSelected ? 1.08 : isHighlightedTarget ? 1.04 : 1)
      container.setAlpha(this.isUnitDimmed(id) ? 0.52 : 1)
    })
  }

  private isUnitDimmed(unitId: string) {
    const unit = this.unitsById.get(unitId)
    const progress = this.unitProgress.get(unitId)
    if (!unit || !progress) return false
    if (this.pendingTargeting) {
      return !this.highlightedUnitIds.has(unitId) && unitId !== this.pendingTargeting.unitId
    }
    if (unit.side !== this.currentSide()) return true
    return this.currentPhase === 'movement' ? progress.movedThisPhase : progress.actedThisPhase
  }

  private updateInfo(text: string) {
    this.infoText?.setText(text)
  }
}
