
import Phaser from 'phaser'
import { initialUnits } from '../data/initialUnits'
import { getRoleAttackCards, getRoleCards, getRoleDefenseCards } from '../data/cardTemplates'
import { unitStatsByRole } from '../data/unitStats'
import type { CardData, CardTargetType, PhaseType, TeamSide, UnitData, UnitRole } from '../types'

const GRID_SIZE = 64
const COLS = 16
const ROWS = 6
const BOARD_WIDTH = COLS * GRID_SIZE
const BOARD_HEIGHT = ROWS * GRID_SIZE
const SIDES: TeamSide[] = ['left', 'right']

const WARRIOR_GUARD_REDUCTION = 6
const EXECUTOR_ISOLATION_BONUS = 8
const HEAL_REDUCTION_TICKS = 2
const HEAL_REDUCTION_FACTOR = 0.5
const WALL_TOUCH_BONUS_PER_UNIT = 2

type UnitProgress = {
  movedThisPhase: boolean
  actedThisPhase: boolean
  selectedAttackId: string | null
  selectedDefenseId: string | null
  selectedTargetUnitId: string | null
  selectedArea: { col: number; row: number } | null
}

type RuntimeState = {
  hp: number
  maxHp: number
  attack: number
  defense: number
  mobility: number
  shield: number
  evadeCharges: number
  reflectPower: number
  bleedTicks: number
  bleedPower: number
  regenTicks: number
  regenPower: number
  stunTicks: number
  healReductionTicks: number
  healReductionFactor: number
  alive: boolean
}

type UnitDeck = {
  attackQueue: string[]
  defenseQueue: string[]
}

type UnitVisual = {
  container: Phaser.GameObjects.Container
  body: Phaser.GameObjects.Arc
  hpBar: Phaser.GameObjects.Rectangle
  hpText: Phaser.GameObjects.Text
  statusText: Phaser.GameObjects.Text
}

type PendingTargetSelection = {
  unitId: string
  cardId: string
  targetType: Extract<CardTargetType, 'single' | 'area'>
}

export default class ArenaScene extends Phaser.Scene {
  private boardX = 0
  private boardY = 0
  private hoverRect?: Phaser.GameObjects.Rectangle
  private selectedUnitId: string | null = null
  private unitsById = new Map<string, UnitData>()
  private unitSprites = new Map<string, UnitVisual>()
  private unitState = new Map<string, RuntimeState>()
  private unitProgress = new Map<string, UnitProgress>()
  private unitDecks = new Map<string, UnitDeck>()
  private infoText?: Phaser.GameObjects.Text
  private battleLogText?: Phaser.GameObjects.Text
  private topBarText?: Phaser.GameObjects.Text
  private phaseText?: Phaser.GameObjects.Text
  private roundText?: Phaser.GameObjects.Text
  private timerText?: Phaser.GameObjects.Text
  private sideBanner?: Phaser.GameObjects.Rectangle
  private sideBannerText?: Phaser.GameObjects.Text
  private selectedUnitText?: Phaser.GameObjects.Text
  private cardHintText?: Phaser.GameObjects.Text
  private deckInfoText?: Phaser.GameObjects.Text
  private actionButton?: Phaser.GameObjects.Rectangle
  private overlayGroup?: Phaser.GameObjects.Container
  private validMoveMarkers: Phaser.GameObjects.Rectangle[] = []
  private targetMarkers: Phaser.GameObjects.Rectangle[] = []
  private cardButtons: Phaser.GameObjects.Container[] = []
  private battleLog: string[] = []
  private currentSideIndex = 0
  private currentPhase: PhaseType = 'movement'
  private roundNumber = 1
  private phaseTimeRemaining = 20
  private phaseTimer?: Phaser.Time.TimerEvent
  private battleEnded = false
  private pendingTargetSelection: PendingTargetSelection | null = null

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
    this.addLog('Combate iniciado. Objetivo: eliminar o rei inimigo.')
    this.startPhase('movement')
  }

  private bootstrapState() {
    initialUnits.forEach((unit) => {
      this.unitsById.set(unit.id, { ...unit })
      const stats = unitStatsByRole[unit.role]
      this.unitState.set(unit.id, {
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        attack: stats.attack,
        defense: stats.defense,
        mobility: stats.mobility,
        shield: 0,
        evadeCharges: 0,
        reflectPower: 0,
        bleedTicks: 0,
        bleedPower: 0,
        regenTicks: 0,
        regenPower: 0,
        stunTicks: 0,
        healReductionTicks: 0,
        healReductionFactor: 0,
        alive: true
      })

      this.unitProgress.set(unit.id, {
        movedThisPhase: false,
        actedThisPhase: false,
        selectedAttackId: null,
        selectedDefenseId: null,
        selectedTargetUnitId: null,
        selectedArea: null
      })

      this.unitDecks.set(unit.id, {
        attackQueue: getRoleAttackCards(unit.role).map((card) => card.id),
        defenseQueue: getRoleDefenseCards(unit.role).map((card) => card.id)
      })
    })
  }

  private drawBackground() {
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x0c1018)
    this.add.rectangle(this.scale.width / 2, 48, this.scale.width, 96, 0x101827)
    this.add.rectangle(this.scale.width / 2, this.scale.height - 110, this.scale.width, 220, 0x101827)

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
    this.refreshAllUnitVisuals()
  }

  private createUnitSprite(unit: UnitData): UnitVisual {
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

    const hpBarBg = this.add.rectangle(0, -33, 42, 6, 0x111827, 0.9).setStrokeStyle(1, 0xffffff, 0.15)
    const hpBar = this.add.rectangle(-20, -33, 40, 4, 0x22c55e, 1).setOrigin(0, 0.5)
    const hpText = this.add.text(0, -45, '', {
      fontFamily: 'Arial',
      fontSize: '10px',
      color: '#f8fafc'
    }).setOrigin(0.5)
    const statusText = this.add.text(0, 33, '', {
      fontFamily: 'Arial',
      fontSize: '10px',
      color: '#fde68a',
      align: 'center'
    }).setOrigin(0.5)

    const container = this.add.container(x, y, [outer, body, label, hpBarBg, hpBar, hpText, statusText]).setSize(58, 72).setInteractive({ useHandCursor: true })
    container.on('pointerdown', () => this.handleUnitClick(unit.id))

    return { container, body, hpBar, hpText, statusText }
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

    this.selectedUnitText = this.add.text(this.boardX, this.boardY + BOARD_HEIGHT + 12, 'Selecione uma unidade do lado ativo.', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#e5e7eb'
    })

    this.infoText = this.add.text(this.boardX, this.boardY + BOARD_HEIGHT + 42, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#9fb0d9',
      wordWrap: { width: 640 }
    })

    this.cardHintText = this.add.text(this.boardX, this.boardY + BOARD_HEIGHT + 84, '', {
      fontFamily: 'Arial',
      fontSize: '17px',
      color: '#fde68a',
      wordWrap: { width: 640 }
    })

    this.deckInfoText = this.add.text(this.boardX, this.boardY + BOARD_HEIGHT + 136, '', {
      fontFamily: 'Courier New',
      fontSize: '14px',
      color: '#c7d2fe',
      wordWrap: { width: 640 }
    })

    this.battleLogText = this.add.text(this.boardX + 680, this.boardY + BOARD_HEIGHT + 8, '', {
      fontFamily: 'Courier New',
      fontSize: '14px',
      color: '#dbeafe',
      wordWrap: { width: 340 }
    })

    this.actionButton = this.add.rectangle(this.boardX + 950, this.boardY + BOARD_HEIGHT + 150, 240, 48, 0x3a7a45, 1)
      .setStrokeStyle(2, 0x9ee6a9, 0.9)
      .setInteractive({ useHandCursor: true })
    this.add.text(this.boardX + 950, this.boardY + BOARD_HEIGHT + 150, 'Encerrar fase', {
      fontFamily: 'Arial',
      fontSize: '21px',
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
    if (this.battleEnded) return

    if (this.pendingTargetSelection) {
      const pendingUnit = this.unitsById.get(this.pendingTargetSelection.unitId)
      const clicked = this.unitsById.get(unitId)
      if (!pendingUnit || !clicked) return
      if (this.pendingTargetSelection.targetType !== 'single') return
      if (clicked.side === pendingUnit.side) {
        this.updateInfo('Selecione um inimigo para essa skill.')
        return
      }
      const clickedState = this.unitState.get(clicked.id)
      if (!clickedState?.alive) return
      this.confirmAttackTarget(this.pendingTargetSelection.unitId, this.pendingTargetSelection.cardId, clicked.id)
      return
    }

    const unit = this.unitsById.get(unitId)
    const runtime = this.unitState.get(unitId)
    if (!unit || !runtime || !runtime.alive) return

    if (unit.side !== this.currentSide()) {
      this.updateInfo('Você só pode interagir com unidades do lado ativo.')
      return
    }

    const progress = this.unitProgress.get(unitId)
    if (!progress) return

    if (runtime.stunTicks > 0) {
      this.updateInfo(`${unit.name} está atordoado e perde esta fase.`)
      return
    }

    if (this.currentPhase === 'movement' && progress.movedThisPhase) {
      this.updateInfo('Essa unidade já se moveu nesta fase.')
      return
    }

    if (this.currentPhase === 'action' && progress.actedThisPhase) {
      this.updateInfo('Essa unidade já confirmou as ações desta fase.')
      return
    }

    this.pendingTargetSelection = null
    this.clearTargetMarkers()
    this.selectedUnitId = unitId
    this.refreshSelectionVisuals()
    this.syncSelectedUnitPanel()

    if (this.currentPhase === 'movement') {
      this.showValidMoveMarkers(unit)
      this.selectedUnitText?.setText(`${unit.name} selecionado para movimento.`)
      this.cardHintText?.setText(this.getRolePassiveText(unit.role))
      return
    }

    this.clearValidMoveMarkers()
    this.selectedUnitText?.setText(`${unit.name} selecionado para escolher ações.`)
    this.cardHintText?.setText(`${this.getRolePassiveText(unit.role)} | Escolha 1 ataque e 1 defesa.`)
    this.renderCardButtons(unit)
  }

  private handleTileClick(col: number, row: number) {
    if (this.battleEnded) return

    if (this.pendingTargetSelection?.targetType === 'area') {
      this.confirmAreaTarget(this.pendingTargetSelection.unitId, this.pendingTargetSelection.cardId, col, row)
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
    const runtime = this.unitState.get(this.selectedUnitId)
    if (!unit || !runtime || !runtime.alive) return

    if (!this.isMoveAllowed(unit, col, row)) {
      this.updateInfo('Movimento inválido para esta unidade.')
      return
    }

    unit.col = col
    unit.row = row

    const progress = this.unitProgress.get(unit.id)
    if (progress) progress.movedThisPhase = true

    const visual = this.unitSprites.get(unit.id)
    if (visual) {
      this.tweens.add({
        targets: visual.container,
        x: this.boardX + col * GRID_SIZE + GRID_SIZE / 2,
        y: this.boardY + row * GRID_SIZE + GRID_SIZE / 2,
        duration: 180,
        ease: 'Sine.easeOut'
      })
    }

    this.updateInfo(`${unit.name} moveu para ${col},${row}.`)
    this.addLog(`${unit.name} reposicionou para ${col},${row}.`)
    this.selectedUnitId = null
    this.refreshSelectionVisuals()
    this.clearValidMoveMarkers()
    this.syncSelectedUnitPanel()

    if (this.haveAllActiveUnitsMoved()) {
      this.startPhase('action')
    }
  }

  private isMoveAllowed(unit: UnitData, targetCol: number, targetRow: number) {
    const runtime = this.unitState.get(unit.id)
    if (!runtime || !runtime.alive) return false

    const onCorrectSide = unit.side === 'left' ? targetCol <= 7 : targetCol >= 8
    if (!onCorrectSide) return false

    const occupied = [...this.unitsById.values()].some((other) => {
      const otherState = this.unitState.get(other.id)
      return other.id !== unit.id && otherState?.alive && other.col === targetCol && other.row === targetRow
    })
    if (occupied) return false

    const distance = Math.abs(unit.col - targetCol) + Math.abs(unit.row - targetRow)
    if (distance === 0) return false

    return distance <= runtime.mobility
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

  private showTargetMarkers(targetType: Extract<CardTargetType, 'single' | 'area'>, unit: UnitData) {
    this.clearTargetMarkers()

    if (targetType === 'single') {
      this.getSideUnits(unit.side === 'left' ? 'right' : 'left').forEach((enemy) => {
        const state = this.unitState.get(enemy.id)
        if (!state?.alive) return
        const marker = this.add.rectangle(
          this.boardX + enemy.col * GRID_SIZE + GRID_SIZE / 2,
          this.boardY + enemy.row * GRID_SIZE + GRID_SIZE / 2,
          GRID_SIZE - 16,
          GRID_SIZE - 16,
          0xef4444,
          0.2
        ).setStrokeStyle(3, 0xfca5a5, 0.9)
        this.targetMarkers.push(marker)
      })
      return
    }

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const marker = this.add.rectangle(
          this.boardX + col * GRID_SIZE + GRID_SIZE / 2,
          this.boardY + row * GRID_SIZE + GRID_SIZE / 2,
          GRID_SIZE - 20,
          GRID_SIZE - 20,
          0x22c55e,
          0.16
        ).setStrokeStyle(2, 0x86efac, 0.85)
        this.targetMarkers.push(marker)
      }
    }
  }

  private clearTargetMarkers() {
    this.targetMarkers.forEach((marker) => marker.destroy())
    this.targetMarkers = []
  }

  private renderCardButtons(unit: UnitData) {
    this.clearCardButtons()
    const deck = this.unitDecks.get(unit.id)
    if (!deck) return

    const startX = this.boardX
    const y = this.boardY + BOARD_HEIGHT + 192

    const attackCards = deck.attackQueue.map((id) => this.getCardById(unit.role, id)).filter(Boolean) as CardData[]
    const defenseCards = deck.defenseQueue.map((id) => this.getCardById(unit.role, id)).filter(Boolean) as CardData[]
    const visibleCards = [...attackCards, ...defenseCards]

    visibleCards.forEach((card, index) => {
      const col = index % 4
      const row = Math.floor(index / 4)
      const x = startX + col * 250 + 110
      const cy = y + row * 72
      const isAttack = card.category === 'attack'
      const fill = isAttack ? 0x7c2d12 : 0x164e63
      const border = isAttack ? 0xfb923c : 0x67e8f9

      const bg = this.add.rectangle(0, 0, 220, 56, fill, 0.95).setStrokeStyle(2, border, 0.9)
      const title = this.add.text(0, -10, card.name, {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold'
      }).setOrigin(0.5)
      const desc = this.add.text(0, 12, `${card.shortDescription} [${card.power}]`, {
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

    this.syncSelectedUnitPanel()
  }

  private clearCardButtons() {
    this.cardButtons.forEach((button) => button.destroy())
    this.cardButtons = []
  }

  private selectCardForUnit(unitId: string, card: CardData) {
    const progress = this.unitProgress.get(unitId)
    const unit = this.unitsById.get(unitId)
    if (!progress || !unit) return

    if (card.category === 'attack') {
      if (card.targetType === 'single' || card.targetType === 'area') {
        this.pendingTargetSelection = {
          unitId,
          cardId: card.id,
          targetType: card.targetType
        }
        this.showTargetMarkers(card.targetType, unit)
        this.updateInfo(card.targetType === 'single'
          ? `${unit.name}: selecione um inimigo para ${card.name}.`
          : `${unit.name}: selecione uma região do mapa para ${card.name}.`)
      } else {
        progress.selectedAttackId = card.id
      }
    } else {
      progress.selectedDefenseId = card.id
      this.updateInfo(`${unit.name}: defesa ${card.name} selecionada.`)
    }

    if (card.category === 'defense') {
      this.addLog(`${unit.name} preparou ${card.name}.`)
    }

    this.tryFinalizeUnitAction(unitId)
    this.syncSelectedUnitPanel()
  }

  private confirmAttackTarget(unitId: string, cardId: string, targetUnitId: string) {
    const progress = this.unitProgress.get(unitId)
    const unit = this.unitsById.get(unitId)
    const target = this.unitsById.get(targetUnitId)
    if (!progress || !unit || !target) return

    progress.selectedAttackId = cardId
    progress.selectedTargetUnitId = targetUnitId
    progress.selectedArea = null
    this.pendingTargetSelection = null
    this.clearTargetMarkers()
    this.updateInfo(`${unit.name}: alvo de ataque definido em ${target.name}.`)
    this.addLog(`${unit.name} travou alvo em ${target.name}.`)
    this.tryFinalizeUnitAction(unitId)
    this.syncSelectedUnitPanel()
  }

  private confirmAreaTarget(unitId: string, cardId: string, col: number, row: number) {
    const progress = this.unitProgress.get(unitId)
    const unit = this.unitsById.get(unitId)
    if (!progress || !unit) return

    progress.selectedAttackId = cardId
    progress.selectedArea = { col, row }
    progress.selectedTargetUnitId = null
    this.pendingTargetSelection = null
    this.clearTargetMarkers()
    this.updateInfo(`${unit.name}: área de ataque definida em ${col},${row}.`)
    this.addLog(`${unit.name} marcou área em ${col},${row}.`)
    this.tryFinalizeUnitAction(unitId)
    this.syncSelectedUnitPanel()
  }

  private tryFinalizeUnitAction(unitId: string) {
    const progress = this.unitProgress.get(unitId)
    const unit = this.unitsById.get(unitId)
    if (!progress || !unit) return

    if (!progress.selectedDefenseId) return
    if (!progress.selectedAttackId) return

    const attackCard = this.getCardById(unit.role, progress.selectedAttackId)
    if (!attackCard) return

    if (attackCard.targetType === 'single' && !progress.selectedTargetUnitId) return
    if (attackCard.targetType === 'area' && !progress.selectedArea) return

    progress.actedThisPhase = true
    this.selectedUnitText?.setText(`${unit.name} já confirmou ataque e defesa.`)
    this.cardHintText?.setText('Selecione outra unidade do lado ativo ou encerre a fase.')
    this.selectedUnitId = null
    this.refreshSelectionVisuals()
    this.clearCardButtons()
    this.clearTargetMarkers()
    this.pendingTargetSelection = null
    this.addLog(`${unit.name} confirmou suas 2 skills da rodada.`)
    this.syncSelectedUnitPanel()

    if (this.haveAllActiveUnitsActed()) {
      this.resolveCurrentSideActions()
    }
  }

  private resolveCurrentSideActions() {
    if (this.battleEnded) return
    const side = this.currentSide()
    const sideUnits = this.getSideUnits(side)
    const executionOrder: UnitRole[] = ['king', 'warrior', 'executor', 'specialist']

    executionOrder.forEach((role) => {
      const unit = sideUnits.find((entry) => entry.role === role)
      if (!unit) return
      const runtime = this.unitState.get(unit.id)
      const progress = this.unitProgress.get(unit.id)
      if (!runtime || !progress || !runtime.alive) return

      if (runtime.stunTicks > 0) {
        this.addLog(`${unit.name} perdeu a ação por atordoamento.`)
        runtime.stunTicks = Math.max(runtime.stunTicks - 1, 0)
        return
      }

      if (progress.selectedDefenseId) {
        const defenseCard = this.getCardById(unit.role, progress.selectedDefenseId)
        if (defenseCard) {
          this.applyDefenseCard(unit, defenseCard)
          this.rotateCardInDeck(unit.id, defenseCard)
        }
      }

      if (progress.selectedAttackId) {
        const attackCard = this.getCardById(unit.role, progress.selectedAttackId)
        if (attackCard) {
          this.applyAttackCard(unit, attackCard, progress)
          this.rotateCardInDeck(unit.id, attackCard)
        }
      }
    })

    this.refreshAllUnitVisuals()
    this.checkVictory()

    if (!this.battleEnded) {
      this.time.delayedCall(900, () => this.advanceAfterActionResolution())
    }
  }

  private applyDefenseCard(unit: UnitData, card: CardData) {
    const selfState = this.unitState.get(unit.id)
    if (!selfState || !selfState.alive) return

    switch (card.effect) {
      case 'evade':
        selfState.evadeCharges = 1
        this.addLog(`${unit.name} ativou esquiva.`)
        break
      case 'regen':
        selfState.regenTicks = 2
        selfState.regenPower = card.power
        this.addLog(`${unit.name} recebeu regeneração.`)
        break
      case 'shield':
        if (card.targetType === 'all_allies') {
          this.getSideUnits(unit.side).forEach((ally) => {
            const allyState = this.unitState.get(ally.id)
            if (!allyState || !allyState.alive) return
            allyState.shield += card.power
          })
          this.addLog(`${unit.name} aplicou shield em grupo.`)
        } else {
          selfState.shield += card.power
          this.addLog(`${unit.name} ganhou ${card.power} de shield.`)
        }
        break
      case 'heal':
        if (card.targetType === 'all_allies') {
          this.getSideUnits(unit.side).forEach((ally) => this.healUnit(ally.id, card.power, unit.id))
          this.addLog(`${unit.name} curou todo o time.`)
        } else {
          const ally = this.findLowestHpAlly(unit.side)
          if (ally) {
            this.healUnit(ally.id, card.power, unit.id)
            this.addLog(`${unit.name} curou ${ally.name}.`)
          }
        }
        break
      case 'reflect':
        selfState.reflectPower = card.power
        this.addLog(`${unit.name} ficará refletindo dano.`)
        break
      default:
        break
    }
  }

  private applyAttackCard(unit: UnitData, card: CardData, progress: UnitProgress) {
    if (card.targetType === 'single') {
      const target = progress.selectedTargetUnitId ? this.unitsById.get(progress.selectedTargetUnitId) : null
      const state = target ? this.unitState.get(target.id) : null
      if (!target || !state?.alive) {
        this.addLog(`${unit.name} perdeu o alvo de ${card.name}.`)
        return
      }
      this.applyCardOnUnit(unit, target, card)
      return
    }

    if (card.targetType === 'area') {
      const area = progress.selectedArea
      if (!area) return
      this.addLog(`${unit.name} executou ${card.name} na área ${area.col},${area.row}.`)
      const hits = this.getUnitsInArea(area.col, area.row, unit.side === 'left' ? 'right' : 'left')
      if (hits.length === 0) {
        this.addLog(`${card.name} não acertou nenhum inimigo.`)
        this.spawnAreaPulse(area.col, area.row, 0x86efac)
        return
      }

      this.spawnAreaPulse(area.col, area.row, 0xf97316)
      hits.forEach((target) => this.applyCardOnUnit(unit, target, card))
    }
  }

  private applyCardOnUnit(caster: UnitData, target: UnitData, card: CardData) {
    switch (card.effect) {
      case 'damage':
        this.damageUnit(target.id, this.computeDirectDamage(caster, target, card.power), caster.id)
        this.addLog(`${caster.name} usou ${card.name} em ${target.name}.`)
        if (caster.role === 'king' && card.id === 'king-a1') {
          this.healUnit(caster.id, 8, caster.id)
        }
        if (caster.role === 'specialist') {
          this.applyHealReduction(target.id)
        }
        break
      case 'stun':
        this.damageUnit(target.id, this.computeDirectDamage(caster, target, card.power), caster.id)
        this.applyStun(target.id, 1)
        this.addLog(`${caster.name} atordoou ${target.name}.`)
        if (caster.role === 'specialist') {
          this.applyHealReduction(target.id)
        }
        break
      case 'bleed':
        this.damageUnit(target.id, this.computeDirectDamage(caster, target, card.power), caster.id)
        this.applyBleed(target.id, 2, 6)
        this.addLog(`${caster.name} aplicou sangramento em ${target.name}.`)
        break
      case 'area':
        this.damageUnit(target.id, this.computeDirectDamage(caster, target, card.power), caster.id)
        this.applyHealReduction(target.id)
        this.addLog(`${target.name} foi atingido pela zona de ${caster.name}.`)
        break
      default:
        break
    }
  }

  private computeDirectDamage(caster: UnitData, target: UnitData, basePower: number) {
    const casterState = this.unitState.get(caster.id)
    const targetState = this.unitState.get(target.id)
    if (!casterState || !targetState) return basePower

    let damage = basePower + casterState.attack - targetState.defense
    damage -= this.getWarriorGuardReduction(target)
    damage -= this.getWallTouchReduction(target)
    if (caster.role === 'executor' && this.isIsolated(caster.id)) {
      damage += EXECUTOR_ISOLATION_BONUS
    }

    return Math.max(damage, 5)
  }

  private damageUnit(unitId: string, amount: number, sourceUnitId?: string) {
    const runtime = this.unitState.get(unitId)
    const unit = this.unitsById.get(unitId)
    if (!runtime || !unit || !runtime.alive) return

    if (runtime.evadeCharges > 0) {
      runtime.evadeCharges -= 1
      this.addLog(`${unit.name} desviou totalmente do dano.`)
      return
    }

    let remaining = amount
    if (runtime.shield > 0) {
      const absorbed = Math.min(runtime.shield, remaining)
      runtime.shield -= absorbed
      remaining -= absorbed
      this.addLog(`${unit.name} absorveu ${absorbed} com shield.`)
    }

    if (remaining > 0) {
      runtime.hp = Math.max(runtime.hp - remaining, 0)
    }

    if (runtime.reflectPower > 0 && sourceUnitId) {
      const reflect = runtime.reflectPower
      runtime.reflectPower = 0
      this.damageUnit(sourceUnitId, reflect)
      this.addLog(`${unit.name} refletiu ${reflect} de dano.`)
    }

    if (runtime.hp <= 0) {
      runtime.alive = false
      this.addLog(`${unit.name} foi derrotado.`)
    }
  }

  private healUnit(unitId: string, amount: number, sourceUnitId?: string) {
    const runtime = this.unitState.get(unitId)
    const unit = this.unitsById.get(unitId)
    if (!runtime || !runtime.alive || !unit) return

    const effective = runtime.healReductionTicks > 0
      ? Math.max(1, Math.floor(amount * (1 - runtime.healReductionFactor)))
      : amount

    runtime.hp = Math.min(runtime.hp + effective, runtime.maxHp)

    if (runtime.healReductionTicks > 0 && sourceUnitId) {
      const source = this.unitsById.get(sourceUnitId)
      if (source) {
        this.addLog(`${unit.name} recebeu cura reduzida por anti-heal.`)
      }
    }
  }

  private applyBleed(unitId: string, ticks: number, power: number) {
    const runtime = this.unitState.get(unitId)
    if (!runtime || !runtime.alive) return
    runtime.bleedTicks = Math.max(runtime.bleedTicks, ticks)
    runtime.bleedPower = Math.max(runtime.bleedPower, power)
  }

  private applyStun(unitId: string, ticks: number) {
    const runtime = this.unitState.get(unitId)
    if (!runtime || !runtime.alive) return
    runtime.stunTicks = Math.max(runtime.stunTicks, ticks)
  }

  private applyHealReduction(unitId: string) {
    const runtime = this.unitState.get(unitId)
    const unit = this.unitsById.get(unitId)
    if (!runtime || !runtime.alive || !unit) return
    runtime.healReductionTicks = Math.max(runtime.healReductionTicks, HEAL_REDUCTION_TICKS)
    runtime.healReductionFactor = Math.max(runtime.healReductionFactor, HEAL_REDUCTION_FACTOR)
    this.addLog(`${unit.name} ficou com cura reduzida.`)
  }

  private getWarriorGuardReduction(target: UnitData) {
    const allies = this.getAdjacentAllies(target.id)
    const hasWarrior = allies.some((ally) => ally.role === 'warrior')
    return hasWarrior ? WARRIOR_GUARD_REDUCTION : 0
  }

  private getWallTouchReduction(target: UnitData) {
    if (!this.isTouchingWall(target)) return 0
    return this.countWallTouchUnits(target.side) * WALL_TOUCH_BONUS_PER_UNIT
  }

  private isTouchingWall(unit: UnitData) {
    return unit.side === 'left' ? unit.col === 7 : unit.col === 8
  }

  private countWallTouchUnits(side: TeamSide) {
    return this.getSideUnits(side).filter((ally) => {
      const state = this.unitState.get(ally.id)
      return state?.alive && this.isTouchingWall(ally)
    }).length
  }

  private isIsolated(unitId: string) {
    return this.getAdjacentAllies(unitId).length === 0
  }

  private getAdjacentAllies(unitId: string) {
    const unit = this.unitsById.get(unitId)
    if (!unit) return []
    return this.getSideUnits(unit.side).filter((ally) => {
      if (ally.id === unitId) return false
      const state = this.unitState.get(ally.id)
      if (!state?.alive) return false
      const distance = Math.abs(ally.col - unit.col) + Math.abs(ally.row - unit.row)
      return distance === 1
    })
  }

  private findLowestHpAlly(side: TeamSide): UnitData | null {
    let best: UnitData | null = null
    let bestRatio = Number.MAX_SAFE_INTEGER

    this.getSideUnits(side).forEach((ally) => {
      const state = this.unitState.get(ally.id)
      if (!state?.alive) return
      const ratio = state.hp / state.maxHp
      if (ratio < bestRatio) {
        bestRatio = ratio
        best = ally
      }
    })

    return best
  }

  private getUnitsInArea(centerCol: number, centerRow: number, side: TeamSide) {
    return this.getSideUnits(side).filter((unit) => {
      const state = this.unitState.get(unit.id)
      if (!state?.alive) return false
      const distance = Math.abs(unit.col - centerCol) + Math.abs(unit.row - centerRow)
      return distance <= 1
    })
  }

  private processOngoingEffectsForSide(side: TeamSide) {
    this.getSideUnits(side).forEach((unit) => {
      const runtime = this.unitState.get(unit.id)
      if (!runtime || !runtime.alive) return

      if (runtime.bleedTicks > 0) {
        runtime.bleedTicks -= 1
        runtime.hp = Math.max(runtime.hp - runtime.bleedPower, 0)
        this.addLog(`${unit.name} sofreu ${runtime.bleedPower} de sangramento.`)
        if (runtime.hp <= 0) {
          runtime.alive = false
          this.addLog(`${unit.name} caiu pelo sangramento.`)
        }
      }

      if (runtime.regenTicks > 0 && runtime.alive) {
        runtime.regenTicks -= 1
        runtime.hp = Math.min(runtime.hp + runtime.regenPower, runtime.maxHp)
        this.addLog(`${unit.name} regenerou ${runtime.regenPower} de vida.`)
      }

      if (runtime.healReductionTicks > 0) {
        runtime.healReductionTicks -= 1
        if (runtime.healReductionTicks === 0) {
          runtime.healReductionFactor = 0
        }
      }
    })
  }

  private rotateCardInDeck(unitId: string, card: CardData) {
    const deck = this.unitDecks.get(unitId)
    if (!deck) return

    const queue = card.category === 'attack' ? deck.attackQueue : deck.defenseQueue
    const index = queue.indexOf(card.id)
    if (index === -1) return

    queue.splice(index, 1)
    queue.push(card.id)
  }

  private advanceAfterActionResolution() {
    if (this.currentSideIndex === 0) {
      this.currentSideIndex = 1
      this.resetProgressForSide(this.currentSide())
      this.processOngoingEffectsForSide(this.currentSide())
      this.refreshAllUnitVisuals()
      this.checkVictory()
      if (!this.battleEnded) this.startPhase('movement')
    } else {
      this.currentSideIndex = 0
      this.roundNumber += 1
      SIDES.forEach((side) => this.resetProgressForSide(side))
      this.processOngoingEffectsForSide(this.currentSide())
      this.refreshAllUnitVisuals()
      this.checkVictory()
      if (!this.battleEnded) this.startPhase('movement')
    }
  }

  private startPhase(phase: PhaseType) {
    if (this.battleEnded) return
    this.currentPhase = phase
    this.pendingTargetSelection = null
    this.selectedUnitId = null
    this.refreshSelectionVisuals()
    this.clearValidMoveMarkers()
    this.clearTargetMarkers()
    this.clearCardButtons()

    if (phase === 'movement') {
      this.phaseTimeRemaining = 20
      this.phaseText?.setText('Fase: Movimento')
      this.selectedUnitText?.setText('Selecione uma unidade do lado ativo para mover.')
      this.cardHintText?.setText('Rei teleporta no próprio lado. Executor move 3. Guerreiro/Especialista movem 2.')
    } else {
      this.phaseTimeRemaining = 18
      this.phaseText?.setText('Fase: Ações')
      this.selectedUnitText?.setText('Selecione uma unidade do lado ativo para escolher ataque e defesa.')
      this.cardHintText?.setText('Ataques single seguem o alvo travado. Skills de área ficam na região marcada.')
    }

    this.syncSelectedUnitPanel()
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
    if (this.battleEnded) return
    if (this.currentPhase === 'movement') {
      this.updateInfo('Tempo da fase de movimento encerrado. Indo para a fase de ações.')
      this.startPhase('action')
      return
    }

    this.updateInfo('Tempo da fase de ações encerrado. Resolvendo ações do lado ativo.')
    this.resolveCurrentSideActions()
  }

  private haveAllActiveUnitsMoved() {
    return this.getSideUnits(this.currentSide()).every((unit) => {
      const state = this.unitState.get(unit.id)
      const progress = this.unitProgress.get(unit.id)
      if (!state?.alive) return true
      if (state.stunTicks > 0) return true
      return !!progress?.movedThisPhase
    })
  }

  private haveAllActiveUnitsActed() {
    return this.getSideUnits(this.currentSide()).every((unit) => {
      const state = this.unitState.get(unit.id)
      const progress = this.unitProgress.get(unit.id)
      if (!state?.alive) return true
      if (state.stunTicks > 0) return true
      return !!progress?.actedThisPhase
    })
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
      const state = this.unitState.get(unit.id)
      if (!progress || !state || !state.alive) return
      progress.movedThisPhase = false
      progress.actedThisPhase = false
      progress.selectedAttackId = null
      progress.selectedDefenseId = null
      progress.selectedTargetUnitId = null
      progress.selectedArea = null
    })
  }

  private updateTopHud() {
    const side = this.currentSide()
    const sideLabel = side === 'left' ? 'Time Azul' : 'Time Vermelho'
    const sideColor = side === 'left' ? 0x274c77 : 0x7f1d1d
    const borderColor = side === 'left' ? 0xdbeafe : 0xfecaca

    this.topBarText?.setText('Build atual: classes finais, passivas, target manual e deck rotativo base')
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
    this.unitSprites.forEach((visual, id) => {
      visual.body.setStrokeStyle(id === this.selectedUnitId ? 5 : 3, id === this.selectedUnitId ? 0xffffff : 0xf8fafc, 0.95)
      visual.container.setScale(id === this.selectedUnitId ? 1.08 : 1)
      visual.container.setAlpha(this.isUnitDimmed(id) ? 0.48 : 1)
    })
  }

  private isUnitDimmed(unitId: string) {
    const unit = this.unitsById.get(unitId)
    const progress = this.unitProgress.get(unitId)
    const state = this.unitState.get(unitId)
    if (!unit || !progress || !state) return false
    if (!state.alive) return true
    if (this.pendingTargetSelection) {
      return unit.side === this.currentSide()
    }
    if (unit.side !== this.currentSide()) return true
    return this.currentPhase === 'movement' ? !!progress.movedThisPhase : !!progress.actedThisPhase
  }

  private refreshAllUnitVisuals() {
    this.unitSprites.forEach((visual, unitId) => {
      const state = this.unitState.get(unitId)
      const unit = this.unitsById.get(unitId)
      if (!state || !unit) return

      const ratio = Math.max(state.hp, 0) / state.maxHp
      visual.hpBar.width = 40 * ratio
      visual.hpBar.setFillStyle(ratio > 0.55 ? 0x22c55e : ratio > 0.25 ? 0xf59e0b : 0xef4444)
      visual.hpText.setText(`${Math.max(0, state.hp)}/${state.maxHp}`)
      visual.container.setVisible(state.alive)

      const statuses: string[] = []
      if (state.shield > 0) statuses.push(`S${state.shield}`)
      if (state.bleedTicks > 0) statuses.push(`B${state.bleedTicks}`)
      if (state.stunTicks > 0) statuses.push('ST')
      if (state.evadeCharges > 0) statuses.push('EV')
      if (state.reflectPower > 0) statuses.push('RF')
      if (state.regenTicks > 0) statuses.push(`RG${state.regenTicks}`)
      if (state.healReductionTicks > 0) statuses.push('CR')
      if (unit.role === 'executor' && this.isIsolated(unit.id)) statuses.push('ISO')
      if (this.isTouchingWall(unit)) statuses.push(`MU${this.countWallTouchUnits(unit.side)}`)
      visual.statusText.setText(statuses.join(' '))
    })

    this.refreshSelectionVisuals()
  }

  private syncSelectedUnitPanel() {
    if (!this.selectedUnitId) {
      this.deckInfoText?.setText('Deck: selecione uma unidade para ver fila de ataques, defesas e passiva ativa.')
      return
    }

    const unit = this.unitsById.get(this.selectedUnitId)
    const deck = this.unitDecks.get(this.selectedUnitId)
    const progress = this.unitProgress.get(this.selectedUnitId)
    if (!unit || !deck || !progress) return

    const attackNames = deck.attackQueue.map((id) => this.getCardById(unit.role, id)?.name ?? id).join(' -> ')
    const defenseNames = deck.defenseQueue.map((id) => this.getCardById(unit.role, id)?.name ?? id).join(' -> ')
    const attackPick = progress.selectedAttackId ? this.getCardById(unit.role, progress.selectedAttackId)?.name ?? progress.selectedAttackId : '-'
    const defensePick = progress.selectedDefenseId ? this.getCardById(unit.role, progress.selectedDefenseId)?.name ?? progress.selectedDefenseId : '-'

    this.deckInfoText?.setText(
      `Passiva: ${this.getRolePassiveText(unit.role)}\n` +
      `Ataques na fila: ${attackNames}\n` +
      `Defesas na fila: ${defenseNames}\n` +
      `Escolhas atuais: ataque=${attackPick} | defesa=${defensePick}`
    )
  }

  private getRolePassiveText(role: UnitRole) {
    switch (role) {
      case 'king':
        return 'Rei: teleporte livre no próprio lado.'
      case 'warrior':
        return 'Guerreiro: reduz dano em aliados adjacentes.'
      case 'specialist':
        return 'Especialista: ataques aplicam redução de cura.'
      case 'executor':
        return 'Executor: ganha dano extra quando isolado.'
    }
  }

  private getCardById(role: UnitRole, cardId: string) {
    return getRoleCards(role).find((card) => card.id === cardId) ?? null
  }

  private checkVictory() {
    const leftKingAlive = this.isRoleAlive('left', 'king')
    const rightKingAlive = this.isRoleAlive('right', 'king')

    if (leftKingAlive && rightKingAlive) return

    this.battleEnded = true
    this.phaseTimer?.remove(false)
    const winner = leftKingAlive ? 'Time Azul' : 'Time Vermelho'
    const color = leftKingAlive ? 0x1d4ed8 : 0x991b1b
    this.showBattleEndOverlay(`${winner} venceu!`, color)
  }

  private isRoleAlive(side: TeamSide, role: UnitRole) {
    return this.getSideUnits(side).some((unit) => unit.role === role && this.unitState.get(unit.id)?.alive)
  }

  private showBattleEndOverlay(message: string, fill: number) {
    this.overlayGroup?.destroy(true)
    const bg = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, 520, 240, 0x0b1020, 0.95).setStrokeStyle(2, 0xf8fafc, 0.3)
    const banner = this.add.rectangle(this.scale.width / 2, this.scale.height / 2 - 24, 420, 74, fill, 1)
    const title = this.add.text(this.scale.width / 2, this.scale.height / 2 - 24, message, {
      fontFamily: 'Arial',
      fontSize: '34px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5)
    const subtitle = this.add.text(this.scale.width / 2, this.scale.height / 2 + 34, 'Clique abaixo para reiniciar a batalha.', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#cbd5e1'
    }).setOrigin(0.5)
    const button = this.add.rectangle(this.scale.width / 2, this.scale.height / 2 + 92, 240, 52, 0x3a7a45, 1)
      .setStrokeStyle(2, 0x9ee6a9, 0.9)
      .setInteractive({ useHandCursor: true })
    const buttonLabel = this.add.text(this.scale.width / 2, this.scale.height / 2 + 92, 'Reiniciar', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5)
    button.on('pointerdown', () => this.scene.restart())

    this.overlayGroup = this.add.container(0, 0, [bg, banner, title, subtitle, button, buttonLabel])
  }

  private spawnAreaPulse(col: number, row: number, color: number) {
    const x = this.boardX + col * GRID_SIZE + GRID_SIZE / 2
    const y = this.boardY + row * GRID_SIZE + GRID_SIZE / 2
    const pulse = this.add.circle(x, y, 12, color, 0.35).setStrokeStyle(2, color, 0.9)
    this.tweens.add({
      targets: pulse,
      scale: 3,
      alpha: 0,
      duration: 450,
      onComplete: () => pulse.destroy()
    })
  }

  private addLog(text: string) {
    this.battleLog.unshift(text)
    this.battleLog = this.battleLog.slice(0, 8)
    this.battleLogText?.setText(this.battleLog.map((line, index) => `${index + 1}. ${line}`).join('\n'))
  }

  private updateInfo(text: string) {
    this.infoText?.setText(text)
  }
}
