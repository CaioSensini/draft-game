
import Phaser from 'phaser'
import { initialUnits } from '../data/initialUnits'
import { getDefaultDeckForRole } from '../data/cardTemplates'
import { unitStatsByRole } from '../data/unitStats'
import type { CardData, CardTargetType, PhaseType, TeamDeckConfig, TeamSide, UnitData, UnitRole } from '../types'
import { GameLoop } from '../core/GameLoop'
import { GameState, GameStateManager } from '../core/GameState'
import type { RuntimeState, UnitProgress, UnitDeck, CombatStats } from '../entities/Unit'
import { createCombatStats } from '../entities/Unit'
import { getCardById, rotateCardInDeck } from '../entities/Card'
import { CombatSystem } from '../systems/CombatSystem'
import { MovementSystem } from '../systems/MovementSystem'
import { BotSystem } from '../systems/BotSystem'
import { AudioManager } from '../utils/audioUtils'
import { ROLE_PASSIVE_SHORT } from '../data/rolePassives'

const GRID_SIZE = 64
const COLS = 16
const ROWS = 6
const BOARD_WIDTH = COLS * GRID_SIZE
const BOARD_HEIGHT = ROWS * GRID_SIZE
const SIDES: TeamSide[] = ['left', 'right']

const HEAL_REDUCTION_TICKS = 2
const HEAL_REDUCTION_FACTOR = 0.5

// UnitProgress, RuntimeState, UnitDeck, CombatStats → src/entities/Unit.ts
// Combat constants (WARRIOR_GUARD_REDUCTION etc.)  → src/systems/CombatSystem.ts

type UnitVisual = {
  container: Phaser.GameObjects.Container
  body: Phaser.GameObjects.Arc
  hpBar: Phaser.GameObjects.Rectangle
  shieldBar: Phaser.GameObjects.Rectangle
  hpText: Phaser.GameObjects.Text
  statusDots: Phaser.GameObjects.GameObject[]
}

type PendingTargetSelection = {
  unitId: string
  cardId: string
  targetType: Extract<CardTargetType, 'single' | 'area'>
}

export default class ArenaScene extends GameLoop {
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
  private areaPreviewMarkers: Phaser.GameObjects.Rectangle[] = []
  private cardButtons: Phaser.GameObjects.Container[] = []
  private tooltipContainer?: Phaser.GameObjects.Container
  private tooltipBg?: Phaser.GameObjects.Rectangle
  private tooltipText?: Phaser.GameObjects.Text
  private battleLog: string[] = []
  private currentSideIndex = 0
  private currentPhase: PhaseType = 'movement'
  private roundNumber = 1
  private phaseTimeRemaining = 20
  private phaseTimer?: Phaser.Time.TimerEvent
  private battleEnded = false
  private pendingTargetSelection: PendingTargetSelection | null = null
  private botDifficulty: 'easy' | 'normal' | 'hard' = 'normal'
  private lastDeckConfig: TeamDeckConfig | null = null
  private audio = new AudioManager()
  private unitStats = new Map<string, CombatStats>()
  private tombstones: Phaser.GameObjects.Container[] = []
  private ghostPreview?: Phaser.GameObjects.Arc
  private pauseOverlay?: Phaser.GameObjects.Container

  constructor() {
    super('ArenaScene')
  }

  create(data?: { deckConfig?: TeamDeckConfig; difficulty?: string }) {
    this.boardX = Math.floor((this.scale.width - BOARD_WIDTH) / 2)
    this.boardY = 150

    this.botDifficulty = (data?.difficulty as 'easy' | 'normal' | 'hard') ?? 'normal'
    this.lastDeckConfig = data?.deckConfig ?? null
    this.bootstrapState(this.lastDeckConfig)
    this.drawBackground()
    this.drawBoardFrame()
    this.drawTiles()
    this.drawMiddleWall()
    this.drawBoardCoordinates()
    this.createUnits()
    this.createHud()
    this.createHover()
    this.registerKeyboardShortcuts()
    // Unlock Web Audio on first user gesture
    this.input.once('pointerdown', () => this.audio.init())
    this.addLog('Combate iniciado. Objetivo: eliminar o rei inimigo.')
    GameStateManager.set(GameState.PLAYING)
    this.startPhase('movement')
  }

  private bootstrapState(deckConfig: TeamDeckConfig | null) {
    const botMult =
      this.botDifficulty === 'easy' ? { hp: 0.80, atk: 0.72 } :
      this.botDifficulty === 'hard' ? { hp: 1.22, atk: 1.30 } :
                                      { hp: 1.00, atk: 1.00 }

    initialUnits.forEach((unit) => {
      this.unitsById.set(unit.id, { ...unit })
      this.unitStats.set(unit.id, createCombatStats())
      const base  = unitStatsByRole[unit.role]
      const mult  = unit.side === 'right' ? botMult : { hp: 1, atk: 1 }
      const stats = {
        maxHp:    Math.round(base.maxHp    * mult.hp),
        attack:   Math.round(base.attack   * mult.atk),
        defense:  base.defense,
        mobility: base.mobility,
      }
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

      // Left side uses the player's chosen deck; right side always gets the default deck.
      const deck = unit.side === 'left' && deckConfig
        ? deckConfig[unit.role]
        : getDefaultDeckForRole(unit.role)

      this.unitDecks.set(unit.id, {
        attackQueue:  [...deck.attackCards],
        defenseQueue: [...deck.defenseCards],
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

    const diffColor = this.botDifficulty === 'easy' ? 0x166534 : this.botDifficulty === 'hard' ? 0x7f1d1d : 0x1e3a5f
    const diffLabel = this.botDifficulty === 'easy' ? 'FÁCIL' : this.botDifficulty === 'hard' ? 'DIFÍCIL' : 'NORMAL'
    this.add.rectangle(this.scale.width - 68, 40, 110, 28, diffColor, 1).setStrokeStyle(1, 0xffffff, 0.3)
    this.add.text(this.scale.width - 68, 40, diffLabel, {
      fontFamily: 'Arial', fontSize: '13px', color: '#f1f5f9', fontStyle: 'bold',
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

  private drawBoardCoordinates() {
    const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F']
    const style = { fontFamily: 'Arial', fontSize: '10px', color: '#334155' }

    for (let row = 0; row < ROWS; row++) {
      const y = this.boardY + row * GRID_SIZE + GRID_SIZE / 2
      // Left edge label
      this.add.text(this.boardX - 14, y, rowLabels[row], style).setOrigin(0.5)
      // Right edge label
      this.add.text(this.boardX + BOARD_WIDTH + 14, y, rowLabels[row], style).setOrigin(0.5)
    }

    for (let col = 0; col < COLS; col++) {
      const x = this.boardX + col * GRID_SIZE + GRID_SIZE / 2
      const label = String(col + 1)
      // Top edge
      this.add.text(x, this.boardY - 12, label, style).setOrigin(0.5)
      // Bottom edge
      this.add.text(x, this.boardY + BOARD_HEIGHT + 12, label, style).setOrigin(0.5)
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

    const hpBarBg   = this.add.rectangle(0, -33, 42, 6, 0x111827, 0.9).setStrokeStyle(1, 0xffffff, 0.15)
    const hpBar     = this.add.rectangle(-20, -33, 40, 4, 0x22c55e, 1).setOrigin(0, 0.5)
    // Shield bar overlays on top of the HP bar track in cyan — width reflects shield / maxHp
    const shieldBar = this.add.rectangle(-20, -29, 0, 3, 0x7dd3fc, 1).setOrigin(0, 0.5).setVisible(false)
    const hpText    = this.add.text(0, -45, '', {
      fontFamily: 'Arial',
      fontSize: '10px',
      color: '#f8fafc'
    }).setOrigin(0.5)
    const container = this.add.container(x, y, [outer, body, label, hpBarBg, hpBar, shieldBar, hpText]).setSize(58, 72).setInteractive({ useHandCursor: true })
    container.on('pointerdown', () => this.handleUnitClick(unit.id))

    return { container, body, hpBar, shieldBar, hpText, statusDots: [] }
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

    // Hover tooltip (unit stats + damage preview)
    this.tooltipBg = this.add.rectangle(0, 0, 196, 88, 0x060b14, 0.93)
      .setStrokeStyle(1, 0x475569, 0.85)
      .setOrigin(0, 0)
    this.tooltipText = this.add.text(8, 8, '', {
      fontFamily: 'Arial', fontSize: '11px', color: '#f1f5f9', lineSpacing: 3,
    }).setOrigin(0, 0)

    this.tooltipContainer = this.add.container(0, 0, [this.tooltipBg, this.tooltipText])
      .setVisible(false)
      .setDepth(200)
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
      this.cardHintText?.setText(ROLE_PASSIVE_SHORT[unit.role])
      return
    }

    this.clearValidMoveMarkers()
    this.selectedUnitText?.setText(`${unit.name} selecionado para escolher ações.`)
    this.cardHintText?.setText(`${ROLE_PASSIVE_SHORT[unit.role]} | Escolha 1 ataque e 1 defesa.`)
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

    if (!MovementSystem.isMoveAllowed(unit, col, row, this.unitsById, this.unitState)) {
      this.updateInfo('Movimento inválido para esta unidade.')
      return
    }

    const isKing = unit.role === 'king'
    const prevCol = unit.col
    const prevRow = unit.row
    unit.col = col
    unit.row = row

    const progress = this.unitProgress.get(unit.id)
    if (progress) progress.movedThisPhase = true
    this.clearGhostPreview()

    const visual = this.unitSprites.get(unit.id)
    if (visual) {
      if (isKing) {
        this.spawnTeleportBurst(prevCol, prevRow)
        this.time.delayedCall(80, () => {
          visual.container.setPosition(
            this.boardX + col * GRID_SIZE + GRID_SIZE / 2,
            this.boardY + row * GRID_SIZE + GRID_SIZE / 2
          )
          this.spawnTeleportBurst(col, row)
        })
      } else {
        this.tweens.add({
          targets: visual.container,
          x: this.boardX + col * GRID_SIZE + GRID_SIZE / 2,
          y: this.boardY + row * GRID_SIZE + GRID_SIZE / 2,
          duration: 180,
          ease: 'Sine.easeOut'
        })
      }
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

  // isMoveAllowed → MovementSystem.isMoveAllowed (systems/MovementSystem.ts)

  private showValidMoveMarkers(unit: UnitData) {
    this.clearValidMoveMarkers()

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!MovementSystem.isMoveAllowed(unit, col, row, this.unitsById, this.unitState)) continue
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
    const progress = this.unitProgress.get(unit.id)
    if (!deck || !progress) return

    // Show only the 2 cards at the front of each queue ("in hand")
    const handAttacks  = deck.attackQueue.slice(0, 2)
      .map((id) => getCardById(unit.role, id)).filter(Boolean) as CardData[]
    const handDefenses = deck.defenseQueue.slice(0, 2)
      .map((id) => getCardById(unit.role, id)).filter(Boolean) as CardData[]

    // "Next" card (index 2) for each queue — shown as preview inside the card
    const nextAttackCard  = deck.attackQueue[2]  ? getCardById(unit.role, deck.attackQueue[2])  : null
    const nextDefenseCard = deck.defenseQueue[2] ? getCardById(unit.role, deck.defenseQueue[2]) : null

    // Layout: 4 cards side by side centered on the bottom bar
    const cards = [...handAttacks, ...handDefenses]
    const cardW = 290
    const cardH = 76
    const gap   = 12
    const totalW = cards.length * cardW + (cards.length - 1) * gap
    const startX = (this.scale.width - totalW) / 2 + cardW / 2
    const cy = this.boardY + BOARD_HEIGHT + 50

    cards.forEach((card, i) => {
      const x = startX + i * (cardW + gap)
      const isAttack = card.category === 'attack'
      const isSelected = isAttack
        ? progress.selectedAttackId === card.id
        : progress.selectedDefenseId === card.id

      const fill        = isAttack ? 0x7c2d12 : 0x164e63
      const hoverFill   = isAttack ? 0x9a3a1a : 0x1a5f7a
      const borderColor = isSelected
        ? (isAttack ? 0xfde047 : 0x86efac)
        : (isAttack ? 0xfb923c : 0x67e8f9)
      const borderWidth = isSelected ? 3 : 2

      // Selection glow overlay (drawn behind everything)
      const glow = this.add.rectangle(0, 0, cardW + 6, cardH + 6,
        isAttack ? 0xfb923c : 0x67e8f9, isSelected ? 0.18 : 0)

      // Background
      const bg = this.add.rectangle(0, 0, cardW, cardH, fill, 0.95)
        .setStrokeStyle(borderWidth, borderColor, 1)

      // Category label + power value + selected check
      const catLabel = this.add.text(-cardW / 2 + 8, -cardH / 2 + 7,
        isAttack ? 'ATAQUE' : 'DEFESA', {
          fontFamily: 'Arial', fontSize: '9px',
          color: isAttack ? '#fb923c' : '#67e8f9', fontStyle: 'bold',
        }).setOrigin(0, 0)

      const powerBadge = this.add.text(cardW / 2 - 8, -cardH / 2 + 7,
        `${card.power}`, {
          fontFamily: 'Arial', fontSize: '11px',
          color: isAttack ? '#fcd34d' : '#7dd3fc', fontStyle: 'bold',
        }).setOrigin(1, 0)

      const checkMark = isSelected
        ? this.add.text(cardW / 2 - 8, -cardH / 2 + 7, '✓', {
            fontFamily: 'Arial', fontSize: '11px',
            color: isAttack ? '#fde047' : '#86efac', fontStyle: 'bold',
          }).setOrigin(1, 0)
        : null

      // Card name
      const title = this.add.text(0, -13, card.name, {
        fontFamily: 'Arial', fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5)

      // Description
      const desc = this.add.text(0, 10, card.shortDescription, {
        fontFamily: 'Arial', fontSize: '10px', color: '#cbd5e1',
        align: 'center', wordWrap: { width: cardW - 20 },
      }).setOrigin(0.5)

      // Next-card preview footer
      const nextCard = isAttack ? nextAttackCard : nextDefenseCard
      const nextText = nextCard
        ? this.add.text(0, cardH / 2 - 9, `» ${nextCard.name}`, {
            fontFamily: 'Arial', fontSize: '8px', color: '#6b7280', fontStyle: 'italic',
          }).setOrigin(0.5)
        : null

      const children: Phaser.GameObjects.GameObject[] = [glow, bg, catLabel, powerBadge, title, desc]
      if (checkMark) children.push(checkMark)
      if (nextText)  children.push(nextText)

      const container = this.add.container(x, cy, children)
        .setSize(cardW, cardH)
        .setInteractive({ useHandCursor: true })

      container.on('pointerover', () => bg.setFillStyle(hoverFill))
      container.on('pointerout',  () => bg.setFillStyle(fill))
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
    this.playSoundCardSelect()

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

    // Re-render card buttons to reflect selection highlight (only if unit hasn't fully acted yet)
    if (!progress.actedThisPhase && !this.pendingTargetSelection) {
      this.renderCardButtons(unit)
    }

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

    const attackCard = getCardById(unit.role, progress.selectedAttackId)
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

    // Build a list of units that will act, in order
    const actingUnits = executionOrder
      .map((role) => sideUnits.find((u) => u.role === role))
      .filter((u): u is UnitData => u !== undefined)

    // Execute each unit with a staggered delay for visual clarity
    this.executeNextUnitInSequence(actingUnits, 0)
  }

  private executeNextUnitInSequence(units: UnitData[], index: number) {
    if (this.battleEnded) {
      this.refreshAllUnitVisuals()
      return
    }

    if (index >= units.length) {
      this.refreshAllUnitVisuals()
      this.checkVictory()
      if (!this.battleEnded) {
        this.time.delayedCall(600, () => this.advanceAfterActionResolution())
      }
      return
    }

    const unit = units[index]
    const runtime  = this.unitState.get(unit.id)
    const progress = this.unitProgress.get(unit.id)

    if (!runtime || !progress || !runtime.alive) {
      this.executeNextUnitInSequence(units, index + 1)
      return
    }

    if (runtime.stunTicks > 0) {
      this.addLog(`${unit.name} perdeu a ação por atordoamento.`)
      this.spawnFloatingText(unit, 'Atordoado!', '#fbbf24')
      runtime.stunTicks = Math.max(runtime.stunTicks - 1, 0)
      this.time.delayedCall(500, () => this.executeNextUnitInSequence(units, index + 1))
      return
    }

    // Highlight the acting unit
    const visual = this.unitSprites.get(unit.id)
    if (visual) {
      this.tweens.add({ targets: visual.container, scaleX: 1.2, scaleY: 1.2, duration: 120, yoyo: true })
    }

    if (progress.selectedDefenseId) {
      const defenseCard = getCardById(unit.role, progress.selectedDefenseId)
      if (defenseCard) {
        this.applyDefenseCard(unit, defenseCard)
        { const dk = this.unitDecks.get(unit.id); if (dk) rotateCardInDeck(dk, defenseCard) }
      }
    }

    if (progress.selectedAttackId) {
      const attackCard = getCardById(unit.role, progress.selectedAttackId)
      if (attackCard) {
        this.resolveAttackWithAnimation(unit, attackCard, progress, () => {
          this.refreshAllUnitVisuals()
          this.time.delayedCall(480, () => this.executeNextUnitInSequence(units, index + 1))
        })
        return   // callback drives continuation
      }
    }

    this.refreshAllUnitVisuals()
    this.time.delayedCall(620, () => this.executeNextUnitInSequence(units, index + 1))
  }

  private applyDefenseCard(unit: UnitData, card: CardData) {
    const selfState = this.unitState.get(unit.id)
    if (!selfState || !selfState.alive) return

    switch (card.effect) {
      case 'evade':
        selfState.evadeCharges = 1
        this.spawnFloatingText(unit, 'Esquiva!', '#a78bfa')
        this.addLog(`${unit.name} ativou esquiva.`)
        break
      case 'regen':
        selfState.regenTicks = 2
        selfState.regenPower = card.power
        this.spawnFloatingText(unit, `Regen +${card.power}/t`, '#4ade80')
        this.addLog(`${unit.name} recebeu regeneração.`)
        break
      case 'shield':
        if (card.targetType === 'all_allies') {
          this.getSideUnits(unit.side).forEach((ally) => {
            const allyState = this.unitState.get(ally.id)
            if (!allyState || !allyState.alive) return
            allyState.shield += card.power
            this.spawnFloatingText(ally, `+${card.power} esc.`, '#93c5fd')
          })
          this.addLog(`${unit.name} aplicou shield em grupo.`)
        } else {
          selfState.shield += card.power
          this.spawnFloatingText(unit, `+${card.power} escudo`, '#93c5fd')
          this.addLog(`${unit.name} ganhou ${card.power} de shield.`)
        }
        break
      case 'heal':
        if (card.targetType === 'all_allies') {
          this.getSideUnits(unit.side).forEach((ally) => this.healUnit(ally.id, card.power, unit.id))
          this.addLog(`${unit.name} curou todo o time.`)
        } else if (card.targetType === 'self') {
          this.healUnit(unit.id, card.power, unit.id)
          this.addLog(`${unit.name} se curou em ${card.power}.`)
        } else {
          // lowest_ally — heal the most wounded teammate
          const ally = CombatSystem.findLowestHpAlly(unit.side, this.unitsById, this.unitState)
          if (ally) {
            this.healUnit(ally.id, card.power, unit.id)
            this.addLog(`${unit.name} curou ${ally.name}.`)
          }
        }
        break
      case 'reflect':
        selfState.reflectPower = card.power
        this.spawnFloatingText(unit, `Reflexo ${card.power}`, '#c4b5fd')
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
      const oppSide = unit.side === 'left' ? 'right' : 'left'
      const hits = CombatSystem.getUnitsInArea(area.col, area.row, oppSide, this.unitsById, this.unitState)
      if (hits.length === 0) {
        this.addLog(`${card.name} não acertou nenhum inimigo.`)
        this.spawnAreaPulse(area.col, area.row, 0x86efac)
        return
      }

      this.spawnAreaPulse(area.col, area.row, 0xf97316)
      hits.forEach((target: UnitData) => this.applyCardOnUnit(unit, target, card))
    }
  }

  /**
   * Applies an attack card with optional projectile animation for single-target cards.
   * Calls `onComplete` when the attack has been fully resolved (after any animation).
   */
  private resolveAttackWithAnimation(
    unit: UnitData,
    attackCard: CardData,
    progress: UnitProgress,
    onComplete: () => void
  ) {
    if (attackCard.targetType === 'single' && progress.selectedTargetUnitId) {
      const target      = this.unitsById.get(progress.selectedTargetUnitId)
      const targetState = this.unitState.get(progress.selectedTargetUnitId)
      if (target && targetState?.alive) {
        const projColor = attackCard.effect === 'stun'  ? 0xfbbf24
                        : attackCard.effect === 'bleed' ? 0xf87171
                        : 0xfb923c
        this.spawnProjectile(unit, target, projColor, () => {
          this.applyAttackCard(unit, attackCard, progress)
          { const dk = this.unitDecks.get(unit.id); if (dk) rotateCardInDeck(dk, attackCard) }
          onComplete()
        })
        return
      }
    }
    // Area, self, or missed target — no projectile
    this.applyAttackCard(unit, attackCard, progress)
    { const dk = this.unitDecks.get(unit.id); if (dk) rotateCardInDeck(dk, attackCard) }
    onComplete()
  }

  private spawnProjectile(caster: UnitData, target: UnitData, color: number, onComplete: () => void) {
    const fromX = this.boardX + caster.col * GRID_SIZE + GRID_SIZE / 2
    const fromY = this.boardY + caster.row * GRID_SIZE + GRID_SIZE / 2
    const toX   = this.boardX + target.col  * GRID_SIZE + GRID_SIZE / 2
    const toY   = this.boardY + target.row  * GRID_SIZE + GRID_SIZE / 2

    const proj = this.add.circle(fromX, fromY, 7, color, 0.95)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setDepth(50)

    const dist     = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2)
    const duration = Math.min(160 + dist * 0.55, 360)

    this.tweens.add({
      targets: proj,
      x: toX,
      y: toY,
      duration,
      ease: 'Sine.easeIn',
      onComplete: () => { proj.destroy(); onComplete() },
    })
  }

  private applyCardOnUnit(caster: UnitData, target: UnitData, card: CardData) {
    switch (card.effect) {
      case 'damage':
        this.damageUnit(target.id, CombatSystem.computeDirectDamage(caster, target, card.power, this.unitState, this.unitsById), caster.id)
        this.addLog(`${caster.name} usou ${card.name} em ${target.name}.`)
        if (caster.role === 'specialist') {
          this.applyHealReduction(target.id)
        }
        break
      case 'stun':
        this.damageUnit(target.id, CombatSystem.computeDirectDamage(caster, target, card.power, this.unitState, this.unitsById), caster.id)
        this.applyStun(target.id, 1)
        this.playSoundStun()
        this.addLog(`${caster.name} atordoou ${target.name}.`)
        if (caster.role === 'specialist') {
          this.applyHealReduction(target.id)
        }
        break
      case 'bleed':
        this.damageUnit(target.id, CombatSystem.computeDirectDamage(caster, target, card.power, this.unitState, this.unitsById), caster.id)
        this.applyBleed(target.id, 2, 6)
        this.addLog(`${caster.name} aplicou sangramento em ${target.name}.`)
        break
      case 'area':
        this.damageUnit(target.id, CombatSystem.computeDirectDamage(caster, target, card.power, this.unitState, this.unitsById), caster.id)
        this.applyHealReduction(target.id)
        this.addLog(`${target.name} foi atingido pela zona de ${caster.name}.`)
        break
      default:
        break
    }
  }

  // computeDirectDamage → CombatSystem.computeDirectDamage (systems/CombatSystem.ts)

  private damageUnit(unitId: string, amount: number, sourceUnitId?: string) {
    const runtime = this.unitState.get(unitId)
    const unit = this.unitsById.get(unitId)
    if (!runtime || !unit || !runtime.alive) return

    if (runtime.evadeCharges > 0) {
      runtime.evadeCharges -= 1
      this.addLog(`${unit.name} desviou totalmente do dano.`)
      this.spawnFloatingText(unit, 'Esquivou!', '#a78bfa')
      this.flashUnit(unitId, 0xa78bfa)
      this.playSoundEvade()
      return
    }

    let remaining = amount
    if (runtime.shield > 0) {
      const absorbed = Math.min(runtime.shield, remaining)
      runtime.shield -= absorbed
      remaining -= absorbed
      if (absorbed > 0) {
        this.addLog(`${unit.name} absorveu ${absorbed} com shield.`)
        this.spawnFloatingText(unit, `🛡 ${absorbed}`, '#93c5fd')
        this.playSoundShield()
      }
    }

    if (remaining > 0) {
      runtime.hp = Math.max(runtime.hp - remaining, 0)
      this.spawnFloatingText(unit, `-${remaining}`, '#f87171')
      this.flashUnit(unitId, 0xef4444)
      // Update receiver stats
      const receiverStats = this.unitStats.get(unitId)
      if (receiverStats) receiverStats.damageReceived += remaining
      // Update source stats
      if (sourceUnitId) {
        const srcStats = this.unitStats.get(sourceUnitId)
        if (srcStats) srcStats.damageDealt += remaining
      }
      // Camera shake + sound proportional to damage
      const hitRatio = remaining / runtime.maxHp
      if (hitRatio >= 0.25) {
        this.cameras.main.shake(200, 0.012)
        this.playSoundHeavyHit()
      } else if (hitRatio >= 0.12) {
        this.cameras.main.shake(120, 0.005)
        this.playSoundHit()
      } else {
        this.playSoundHit()
      }
    }

    if (runtime.reflectPower > 0 && sourceUnitId) {
      const reflect = runtime.reflectPower
      runtime.reflectPower = 0
      this.damageUnit(sourceUnitId, reflect)
      this.addLog(`${unit.name} refletiu ${reflect} de dano.`)
    }

    if (runtime.hp <= 0 && runtime.alive) {
      runtime.alive = false
      this.addLog(`${unit.name} foi derrotado.`)
      // Credit kill to the source
      if (sourceUnitId) {
        const srcStats = this.unitStats.get(sourceUnitId)
        if (srcStats) srcStats.kills += 1
      }
      this.playDeathAnimation(unitId)
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
    this.spawnFloatingText(unit, `+${effective}`, '#4ade80')
    this.playSoundHeal()
    if (sourceUnitId) {
      const srcStats = this.unitStats.get(sourceUnitId)
      if (srcStats) srcStats.healsGiven += effective
    }
    if (runtime.healReductionTicks > 0 && sourceUnitId) {
      this.addLog(`${unit.name} recebeu cura reduzida por anti-heal.`)
    }
  }

  // ─── Visual helpers ──────────────────────────────────────────────────────

  private spawnFloatingText(unit: UnitData, text: string, color: string) {
    const x = this.boardX + unit.col * GRID_SIZE + GRID_SIZE / 2
    const y = this.boardY + unit.row * GRID_SIZE + GRID_SIZE / 2 - 16

    const txt = this.add.text(x, y, text, {
      fontFamily: 'Arial', fontSize: '16px', color, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(100)

    this.tweens.add({
      targets: txt,
      y: y - 36,
      alpha: 0,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => txt.destroy(),
    })
  }

  private flashUnit(unitId: string, color: number) {
    const visual = this.unitSprites.get(unitId)
    if (!visual) return
    const origColor = this.unitsById.get(unitId)?.color ?? 0xffffff
    visual.body.setFillStyle(color)
    this.time.delayedCall(160, () => visual.body.setFillStyle(origColor))
  }

  private playDeathAnimation(unitId: string) {
    const visual = this.unitSprites.get(unitId)
    const unit   = this.unitsById.get(unitId)
    if (!visual || !unit) return
    this.playSoundDeath()
    this.tweens.add({
      targets: visual.container,
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 600,
      ease: 'Power2',
      onComplete: () => {
        visual.container.setVisible(false)
        this.spawnTombstone(unit.col, unit.row, unit.side)
      },
    })
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

  // Combat/movement helpers → CombatSystem & MovementSystem (systems/)

  private processOngoingEffectsForSide(side: TeamSide) {
    this.getSideUnits(side).forEach((unit) => {
      const runtime = this.unitState.get(unit.id)
      if (!runtime || !runtime.alive) return

      if (runtime.bleedTicks > 0) {
        runtime.bleedTicks -= 1
        const dmg = runtime.bleedPower
        runtime.hp = Math.max(runtime.hp - dmg, 0)
        this.spawnFloatingText(unit, `-${dmg} sangue`, '#f87171')
        this.flashUnit(unit.id, 0xef4444)
        this.addLog(`${unit.name} sofreu ${dmg} de sangramento.`)
        if (runtime.hp <= 0) {
          runtime.alive = false
          this.playDeathAnimation(unit.id)
          this.addLog(`${unit.name} caiu pelo sangramento.`)
        }
      }

      if (runtime.regenTicks > 0 && runtime.alive) {
        runtime.regenTicks -= 1
        const heal = runtime.regenPower
        runtime.hp = Math.min(runtime.hp + heal, runtime.maxHp)
        this.spawnFloatingText(unit, `+${heal} regen`, '#4ade80')
        this.addLog(`${unit.name} regenerou ${heal} de vida.`)
      }

      if (runtime.healReductionTicks > 0) {
        runtime.healReductionTicks -= 1
        if (runtime.healReductionTicks === 0) {
          runtime.healReductionFactor = 0
        }
      }
    })
  }

  // rotateCardInDeck → rotateCardInDeck() from entities/Card.ts

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
      if (!this.battleEnded) {
        this.showRoundBanner(this.roundNumber)
        this.startPhase('movement')
      }
    }
  }

  private registerKeyboardShortcuts() {
    this.input.keyboard?.on('keydown-SPACE', () => this.forceAdvancePhase())
    this.input.keyboard?.on('keydown-P',     () => this.togglePause())
    this.input.keyboard?.on('keydown-ESC',   () => {
      if (GameStateManager.is(GameState.PAUSED)) { this.resumeGame(); return }
      this.cancelTargetingOrDeselect()
    })
  }

  private cancelTargetingOrDeselect() {
    if (this.battleEnded) return
    if (this.pendingTargetSelection) {
      this.pendingTargetSelection = null
      this.clearTargetMarkers()
      this.updateInfo('Seleção de alvo cancelada. Escolha outra carta.')
      const unit = this.selectedUnitId ? this.unitsById.get(this.selectedUnitId) : null
      if (unit) this.renderCardButtons(unit)
      return
    }
    if (this.selectedUnitId) {
      this.selectedUnitId = null
      this.clearValidMoveMarkers()
      this.clearCardButtons()
      this.refreshSelectionVisuals()
      this.syncSelectedUnitPanel()
      this.updateInfo('Seleção cancelada.')
    }
  }

  private togglePause() {
    if (this.battleEnded) return
    if (GameStateManager.is(GameState.PAUSED)) {
      this.resumeGame()
    } else {
      GameStateManager.set(GameState.PAUSED)
      this.phaseTimer?.paused ? undefined : (this.phaseTimer && (this.phaseTimer.paused = true))
      this.createPauseOverlay()
    }
  }

  private resumeGame() {
    GameStateManager.set(GameState.PLAYING)
    if (this.phaseTimer) this.phaseTimer.paused = false
    this.pauseOverlay?.destroy()
    this.pauseOverlay = undefined
  }

  private createPauseOverlay() {
    this.pauseOverlay?.destroy()
    const cx = this.scale.width / 2
    const cy = this.scale.height / 2

    const bg = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.55)
    const panel = this.add.rectangle(cx, cy, 380, 200, 0x0f1117, 1).setStrokeStyle(2, 0x4a5568)
    const title = this.add.text(cx, cy - 55, 'PAUSADO', {
      fontFamily: 'Arial', fontSize: '36px', color: '#f8e7b9', fontStyle: 'bold',
    }).setOrigin(0.5)
    const hint = this.add.text(cx, cy - 10, 'Pressione P ou ESC para retomar', {
      fontFamily: 'Arial', fontSize: '16px', color: '#94a3b8',
    }).setOrigin(0.5)

    const btn = this.add.rectangle(cx, cy + 55, 200, 44, 0x3a7a45)
      .setStrokeStyle(2, 0x9ee6a9)
      .setInteractive({ useHandCursor: true })
    const btnLabel = this.add.text(cx, cy + 55, 'Retomar', {
      fontFamily: 'Arial', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    btn.on('pointerover', () => btn.setFillStyle(0x4a9155))
    btn.on('pointerout',  () => btn.setFillStyle(0x3a7a45))
    btn.on('pointerdown', () => this.resumeGame())

    this.pauseOverlay = this.add.container(0, 0, [bg, panel, title, hint, btn, btnLabel])
    this.pauseOverlay.setDepth(100)
  }

  private showRoundBanner(round: number) {
    const cx = this.scale.width / 2
    const cy = this.boardY - 22

    const txt = this.add.text(cx, cy, `— ROUND ${round} —`, {
      fontFamily: 'Arial', fontSize: '20px', color: '#fde68a', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0)

    this.tweens.add({
      targets: txt,
      alpha: 1,
      duration: 250,
      yoyo: true,
      hold: 900,
      onComplete: () => txt.destroy(),
    })
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
    this.showPhaseTransitionBanner(phase)
    this.playSoundPhaseChange()

    // If it is the bot's turn, run bot logic after a short delay so the UI renders first.
    if (this.currentSide() === 'right') {
      this.time.delayedCall(900, () => {
        if (phase === 'movement') this.runBotMovement()
        else this.runBotActions()
      })
    }
  }

  private showPhaseTransitionBanner(phase: PhaseType) {
    const side = this.currentSide()
    const phaseLabel = phase === 'movement' ? 'FASE DE MOVIMENTO' : 'FASE DE AÇÕES'
    const sideLabel  = side === 'left' ? 'SEU TURNO' : 'TURNO DO BOT'
    const accentColor = side === 'left' ? 0x1d4ed8 : 0x991b1b
    const accentHex   = side === 'left' ? '#93c5fd' : '#fca5a5'

    const cx = this.scale.width / 2
    const cy = this.boardY + BOARD_HEIGHT / 2

    const bg = this.add.rectangle(cx, cy, 480, 90, 0x060b14, 0.92)
      .setStrokeStyle(3, accentColor, 0.95)
    const titleTxt = this.add.text(cx, cy - 16, phaseLabel, {
      fontFamily: 'Arial', fontSize: '30px', color: '#f8fafc', fontStyle: 'bold',
    }).setOrigin(0.5)
    const sideTxt = this.add.text(cx, cy + 20, sideLabel, {
      fontFamily: 'Arial', fontSize: '15px', color: accentHex, fontStyle: 'bold',
    }).setOrigin(0.5)

    bg.setAlpha(0)
    titleTxt.setAlpha(0)
    sideTxt.setAlpha(0)

    this.tweens.add({
      targets: [bg, titleTxt, sideTxt],
      alpha: 1,
      duration: 180,
      onComplete: () => {
        this.time.delayedCall(720, () => {
          this.tweens.add({
            targets: [bg, titleTxt, sideTxt],
            alpha: 0,
            duration: 260,
            onComplete: () => { bg.destroy(); titleTxt.destroy(); sideTxt.destroy() },
          })
        })
      },
    })
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
    this.hoverRect.setPosition(
      this.boardX + col * GRID_SIZE + GRID_SIZE / 2,
      this.boardY + row * GRID_SIZE + GRID_SIZE / 2
    )
    this.hoverRect.setVisible(visible)

    this.clearAreaPreview()
    this.clearGhostPreview()

    if (!visible) {
      this.tooltipContainer?.setVisible(false)
      return
    }

    // Ghost preview for movement phase
    if (this.currentPhase === 'movement' && this.selectedUnitId) {
      const selUnit = this.unitsById.get(this.selectedUnitId)
      if (selUnit && MovementSystem.isMoveAllowed(selUnit, col, row, this.unitsById, this.unitState)) {
        this.showGhostAt(col, row, selUnit.color)
      }
    }

    // Area-of-effect preview when in area-targeting mode
    if (this.pendingTargetSelection?.targetType === 'area') {
      this.showAreaPreview(col, row)
    }

    // Unit tooltip
    const unitOnTile = this.findUnitAtTile(col, row)
    if (!unitOnTile) {
      this.tooltipContainer?.setVisible(false)
      return
    }

    const state = this.unitState.get(unitOnTile.id)
    if (!state) { this.tooltipContainer?.setVisible(false); return }

    const roleLabel: Record<UnitRole, string> = {
      king: 'Rei', warrior: 'Guerreiro', specialist: 'Especialista', executor: 'Executor',
    }
    const lines: string[] = [
      `${unitOnTile.name}  [${roleLabel[unitOnTile.role]}]`,
      `HP ${Math.max(0, state.hp)}/${state.maxHp}   ATK ${state.attack}   DEF ${state.defense}`,
    ]

    const fx: string[] = []
    if (state.shield > 0)            fx.push(`Escudo ${state.shield}`)
    if (state.bleedTicks > 0)        fx.push(`Sangue ${state.bleedTicks}t`)
    if (state.stunTicks > 0)         fx.push('Atordoado')
    if (state.evadeCharges > 0)      fx.push('Esquiva')
    if (state.reflectPower > 0)      fx.push(`Reflexo ${state.reflectPower}`)
    if (state.regenTicks > 0)        fx.push(`Regen ${state.regenTicks}t`)
    if (state.healReductionTicks > 0) fx.push('Anti-cura')
    if (fx.length > 0) lines.push(fx.join('  '))

    // Damage preview during single-target selection
    if (this.pendingTargetSelection?.targetType === 'single') {
      const caster = this.unitsById.get(this.pendingTargetSelection.unitId)
      const card   = caster ? getCardById(caster.role, this.pendingTargetSelection.cardId) : null
      if (caster && card && unitOnTile.side !== caster.side && state.alive) {
        const dmg = CombatSystem.computeDirectDamage(caster, unitOnTile, card.power, this.unitState, this.unitsById)
        lines.push(`> Dano estimado: ~${dmg}`)
      }
    }

    this.tooltipText?.setText(lines.join('\n'))

    // Resize background to fit text
    const lineCount = lines.length
    const bgH = lineCount * 15 + 16
    this.tooltipBg?.setSize(196, bgH)

    // Position tooltip: prefer right side of tile, flip left near board edge
    const tileRight = this.boardX + col * GRID_SIZE + GRID_SIZE + 4
    const tx = tileRight + 196 > this.scale.width ? this.boardX + col * GRID_SIZE - 200 : tileRight
    const ty = Math.min(
      this.boardY + row * GRID_SIZE,
      this.boardY + BOARD_HEIGHT - bgH
    )
    this.tooltipContainer?.setPosition(tx, ty)
    this.tooltipContainer?.setVisible(true)
  }

  private findUnitAtTile(col: number, row: number): UnitData | null {
    for (const unit of this.unitsById.values()) {
      const state = this.unitState.get(unit.id)
      if (state?.alive && unit.col === col && unit.row === row) return unit
    }
    return null
  }

  private showAreaPreview(centerCol: number, centerRow: number) {
    const deltas = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const
    deltas.forEach(([dc, dr]) => {
      const c = centerCol + dc
      const r = centerRow + dr
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return
      const marker = this.add.rectangle(
        this.boardX + c * GRID_SIZE + GRID_SIZE / 2,
        this.boardY + r * GRID_SIZE + GRID_SIZE / 2,
        GRID_SIZE - 8, GRID_SIZE - 8,
        0xf97316, 0.28
      ).setStrokeStyle(2, 0xfb923c, 0.9)
      this.areaPreviewMarkers.push(marker)
    })
  }

  private clearAreaPreview() {
    this.areaPreviewMarkers.forEach((m) => m.destroy())
    this.areaPreviewMarkers = []
  }

  private refreshSelectionVisuals() {
    this.unitSprites.forEach((visual, id) => {
      const state = this.unitState.get(id)
      const isSelected = id === this.selectedUnitId
      const isStunned  = (state?.stunTicks ?? 0) > 0
      const strokeW   = isSelected ? 5 : 3
      const strokeCol = isSelected ? 0xffffff : (isStunned ? 0xfbbf24 : 0xf8fafc)
      visual.body.setStrokeStyle(strokeW, strokeCol, isSelected || isStunned ? 1 : 0.9)
      visual.container.setScale(isSelected ? 1.08 : 1)
      visual.container.setAlpha(this.getUnitAlpha(id))
    })
  }

  private getUnitAlpha(unitId: string): number {
    const unit     = this.unitsById.get(unitId)
    const progress = this.unitProgress.get(unitId)
    const state    = this.unitState.get(unitId)
    if (!unit || !progress || !state) return 1
    if (!state.alive) return 0.15

    // During target selection: dim caster's own side so targets stand out
    if (this.pendingTargetSelection) {
      return unit.side === this.currentSide() ? 0.52 : 1
    }

    if (unit.side !== this.currentSide()) return 0.62   // inactive side — slightly faded
    const doneThisPhase = this.currentPhase === 'movement'
      ? progress.movedThisPhase
      : progress.actedThisPhase
    return doneThisPhase ? 0.42 : 1                      // already acted — grayed out
  }

  private refreshAllUnitVisuals() {
    this.unitSprites.forEach((visual, unitId) => {
      const state = this.unitState.get(unitId)
      const unit = this.unitsById.get(unitId)
      if (!state || !unit) return

      const ratio = Math.max(state.hp, 0) / state.maxHp
      visual.hpBar.width = 40 * ratio
      visual.hpBar.setFillStyle(ratio > 0.55 ? 0x22c55e : ratio > 0.25 ? 0xf59e0b : 0xef4444)

      // Shield bar: cyan segment proportional to shield vs maxHp, capped at full bar width
      if (state.shield > 0) {
        visual.shieldBar.width = Math.min(40, Math.round(40 * state.shield / state.maxHp))
        visual.shieldBar.setVisible(true)
      } else {
        visual.shieldBar.setVisible(false)
      }

      visual.hpText.setText(`${Math.max(0, state.hp)}/${state.maxHp}`)
      visual.container.setVisible(state.alive)

      // Remove old status dot badges
      visual.statusDots.forEach((obj) => visual.container.remove(obj, true))
      visual.statusDots = []

      type StatusDef = { label: string; bg: number }
      const defs: StatusDef[] = []
      if (state.stunTicks > 0)              defs.push({ label: 'ST', bg: 0xca8a04 })
      if (state.bleedTicks > 0)             defs.push({ label: `B${state.bleedTicks}`, bg: 0xdc2626 })
      if (state.shield > 0)                 defs.push({ label: `S${Math.min(state.shield, 99)}`, bg: 0x2563eb })
      if (state.evadeCharges > 0)           defs.push({ label: 'EV', bg: 0x0891b2 })
      if (state.reflectPower > 0)           defs.push({ label: 'RF', bg: 0x7c3aed })
      if (state.regenTicks > 0)             defs.push({ label: `R${state.regenTicks}`, bg: 0x16a34a })
      if (state.healReductionTicks > 0)     defs.push({ label: 'CR', bg: 0xea580c })
      // Passive aura badges
      if (unit.role === 'warrior' && state.alive) {
        const guardsCount = this.getSideUnits(unit.side).filter((ally) => {
          if (ally.id === unitId) return false
          const as = this.unitState.get(ally.id)
          if (!as?.alive) return false
          return Math.abs(ally.col - unit.col) + Math.abs(ally.row - unit.row) === 1
        }).length
        if (guardsCount > 0) defs.push({ label: 'GD', bg: 0x1d4ed8 })
      }
      if (unit.role === 'executor' && state.alive && MovementSystem.isIsolated(unitId, this.unitsById, this.unitState)) {
        defs.push({ label: 'ISO', bg: 0xc2410c })
      }

      if (defs.length > 0) {
        const bw = 17, bh = 11, gap = 2
        const total = defs.length * bw + (defs.length - 1) * gap
        let sx = -(total / 2) + bw / 2
        defs.forEach((def) => {
          const rect = this.add.rectangle(sx, 31, bw, bh, def.bg, 0.92).setStrokeStyle(1, 0xffffff, 0.25)
          const txt = this.add.text(sx, 31, def.label, {
            fontFamily: 'Arial', fontSize: '7px', color: '#ffffff', fontStyle: 'bold',
          }).setOrigin(0.5)
          visual.container.add([rect, txt])
          visual.statusDots.push(rect, txt)
          sx += bw + gap
        })
      }
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

    // First 2 of each queue = "in hand"; rest = waiting
    const atkHand  = deck.attackQueue.slice(0, 2).map((id) => getCardById(unit.role, id)?.name ?? id)
    const atkWait  = deck.attackQueue.slice(2).map((id) => getCardById(unit.role, id)?.name ?? id)
    const defHand  = deck.defenseQueue.slice(0, 2).map((id) => getCardById(unit.role, id)?.name ?? id)
    const defWait  = deck.defenseQueue.slice(2).map((id) => getCardById(unit.role, id)?.name ?? id)
    const attackNames  = `[${atkHand.join(' | ')}]${atkWait.length ? ' → ' + atkWait.join(' → ') : ''}`
    const defenseNames = `[${defHand.join(' | ')}]${defWait.length ? ' → ' + defWait.join(' → ') : ''}`
    const attackPick = progress.selectedAttackId ? getCardById(unit.role, progress.selectedAttackId)?.name ?? progress.selectedAttackId : '-'
    const defensePick = progress.selectedDefenseId ? getCardById(unit.role, progress.selectedDefenseId)?.name ?? progress.selectedDefenseId : '-'

    this.deckInfoText?.setText(
      `Passiva: ${ROLE_PASSIVE_SHORT[unit.role]}\n` +
      `Ataques na fila: ${attackNames}\n` +
      `Defesas na fila: ${defenseNames}\n` +
      `Escolhas atuais: ataque=${attackPick} | defesa=${defensePick}`
    )
  }

  // getRolePassiveText → ROLE_PASSIVE_SHORT[role] from data/rolePassives.ts
  // getCardById        → getCardById() from entities/Card.ts

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
    this.playSoundVictory()

    const roundText = `${this.roundNumber} rodada${this.roundNumber !== 1 ? 's' : ''}`

    // Build per-unit stats summary
    const allUnits = [...this.unitsById.values()]
    const topDmg   = allUnits.reduce((a, b) => (this.unitStats.get(a.id)?.damageDealt ?? 0) >= (this.unitStats.get(b.id)?.damageDealt ?? 0) ? a : b)
    const topHeal  = allUnits.reduce((a, b) => (this.unitStats.get(a.id)?.healsGiven  ?? 0) >= (this.unitStats.get(b.id)?.healsGiven  ?? 0) ? a : b)
    const topKills = allUnits.reduce((a, b) => (this.unitStats.get(a.id)?.kills       ?? 0) >= (this.unitStats.get(b.id)?.kills       ?? 0) ? a : b)
    const mvp = topDmg
    const statsLines = [
      `Duração: ${roundText}`,
      `MVP (+ dano): ${mvp.name}  ${this.unitStats.get(mvp.id)?.damageDealt ?? 0} dmg`,
      `Mais abates: ${topKills.name}  ×${this.unitStats.get(topKills.id)?.kills ?? 0}`,
      `Mais cura:   ${topHeal.name}  +${this.unitStats.get(topHeal.id)?.healsGiven ?? 0}`,
    ]

    const cx = this.scale.width / 2
    const cy = this.scale.height / 2

    const bg = this.add.rectangle(cx, cy, 600, 330, 0x060b14, 0.97)
      .setStrokeStyle(3, fill, 0.85)
    const banner = this.add.rectangle(cx, cy - 110, 520, 64, fill, 1)
    const title = this.add.text(cx, cy - 110, message, {
      fontFamily: 'Arial', fontSize: '36px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    const stats = this.add.text(cx, cy - 46, statsLines.join('\n'), {
      fontFamily: 'Arial', fontSize: '15px', color: '#94a3b8', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5)

    // Rematch button
    const rematchBtn = this.add.rectangle(cx - 150, cy + 110, 240, 50, 0x1d4ed8, 1)
      .setStrokeStyle(2, 0x93c5fd, 0.9)
      .setInteractive({ useHandCursor: true })
    const rematchLabel = this.add.text(cx - 150, cy + 110, 'Jogar Novamente', {
      fontFamily: 'Arial', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    rematchBtn.on('pointerover', () => rematchBtn.setFillStyle(0x2563eb))
    rematchBtn.on('pointerout',  () => rematchBtn.setFillStyle(0x1d4ed8))
    rematchBtn.on('pointerdown', () => this.scene.start('ArenaScene', {
      deckConfig: this.lastDeckConfig ?? undefined,
      difficulty: this.botDifficulty,
    }))

    // Back to deck builder button
    const backBtn = this.add.rectangle(cx + 150, cy + 110, 240, 50, 0x3a7a45, 1)
      .setStrokeStyle(2, 0x9ee6a9, 0.9)
      .setInteractive({ useHandCursor: true })
    const backLabel = this.add.text(cx + 150, cy + 110, 'Voltar ao Deck Builder', {
      fontFamily: 'Arial', fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    backBtn.on('pointerover', () => backBtn.setFillStyle(0x4a9155))
    backBtn.on('pointerout',  () => backBtn.setFillStyle(0x3a7a45))
    backBtn.on('pointerdown', () => this.scene.start('DeckBuildScene'))

    // Animate the overlay in
    const all = [bg, banner, title, stats, rematchBtn, rematchLabel, backBtn, backLabel]
    all.forEach((obj) => (obj as Phaser.GameObjects.Components.Alpha).setAlpha(0))
    this.tweens.add({ targets: all, alpha: 1, duration: 380 })

    this.overlayGroup = this.add.container(0, 0, all)
  }

  private spawnAreaPulse(col: number, row: number, color: number) {
    const x = this.boardX + col * GRID_SIZE + GRID_SIZE / 2
    const y = this.boardY + row * GRID_SIZE + GRID_SIZE / 2
    // Three staggered expanding rings
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(x, y, 10, color, i === 0 ? 0.4 : 0.18)
        .setStrokeStyle(2, color, 0.9)
        .setDepth(30)
      this.time.delayedCall(i * 80, () => {
        this.tweens.add({
          targets: ring,
          scale: 3.5 + i * 0.5,
          alpha: 0,
          duration: 400,
          ease: 'Sine.easeOut',
          onComplete: () => ring.destroy(),
        })
      })
    }
    // Central flash
    const flash = this.add.circle(x, y, 18, 0xffffff, 0.55).setDepth(31)
    this.tweens.add({ targets: flash, alpha: 0, scale: 0.3, duration: 200, onComplete: () => flash.destroy() })
  }

  private addLog(text: string) {
    this.battleLog.unshift(text)
    this.battleLog = this.battleLog.slice(0, 8)
    this.battleLogText?.setText(this.battleLog.map((line, index) => `${index + 1}. ${line}`).join('\n'))
  }

  private updateInfo(text: string) {
    this.infoText?.setText(text)
  }

  // ─── Bot AI ───────────────────────────────────────────────────────────────

  /**
   * Bot movement phase:
   * - King teleports toward the wall (col 8).
   * - Warriors move toward the nearest enemy.
   * - Executors move toward the nearest enemy.
   * - Specialists stay behind allies (stay back / toward wall).
   * Each unit moves to the best valid tile using a greedy strategy.
   */
  private runBotMovement() {
    if (this.battleEnded) return
    const botUnits = this.getSideUnits('right')

    botUnits.forEach((unit) => {
      const state    = this.unitState.get(unit.id)
      const progress = this.unitProgress.get(unit.id)
      if (!state?.alive || progress?.movedThisPhase || (state.stunTicks ?? 0) > 0) return

      const dest = BotSystem.findBestMoveDest(unit, this.unitsById, this.unitState)
      if (!dest) {
        // No valid move — mark as moved so phase can advance.
        if (progress) progress.movedThisPhase = true
        return
      }

      unit.col = dest.col
      unit.row = dest.row
      if (progress) progress.movedThisPhase = true

      const visual = this.unitSprites.get(unit.id)
      if (visual) {
        this.tweens.add({
          targets: visual.container,
          x: this.boardX + dest.col * GRID_SIZE + GRID_SIZE / 2,
          y: this.boardY + dest.row * GRID_SIZE + GRID_SIZE / 2,
          duration: 250,
          ease: 'Sine.easeOut',
        })
      }

      this.addLog(`Bot: ${unit.name} moveu para ${dest.col},${dest.row}.`)
    })

    this.refreshAllUnitVisuals()

    if (this.haveAllActiveUnitsMoved()) {
      this.time.delayedCall(300, () => this.startPhase('action'))
    }
  }

  // botPickMoveDest / botScoreMoveTile → BotSystem.findBestMoveDest (systems/BotSystem.ts)

  /**
   * Bot action phase:
   * For each unit, pick the first available attack card and defense card.
   * Attacks target the living enemy with the lowest HP (single target)
   * or a tile near the enemy cluster (area target).
   */
  private runBotActions() {
    if (this.battleEnded) return
    const botUnits = this.getSideUnits('right')

    botUnits.forEach((unit) => {
      const state    = this.unitState.get(unit.id)
      const progress = this.unitProgress.get(unit.id)
      const deck     = this.unitDecks.get(unit.id)
      if (!state?.alive || progress?.actedThisPhase || !progress || !deck) return
      if ((state.stunTicks ?? 0) > 0) return

      const enemies = this.getSideUnits('left').filter((u) => this.unitState.get(u.id)?.alive)
      if (enemies.length === 0) return

      // Easy mode: always pick first card in queue, target random living enemy
      if (this.botDifficulty === 'easy') {
        const atkCard = deck.attackQueue[0] ? getCardById(unit.role, deck.attackQueue[0]) : null
        const defCard = deck.defenseQueue[0] ? getCardById(unit.role, deck.defenseQueue[0]) : null
        const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)]
        if (atkCard) {
          progress.selectedAttackId = atkCard.id
          if (atkCard.targetType === 'single') {
            progress.selectedTargetUnitId = randomEnemy.id
            progress.selectedArea = null
          } else if (atkCard.targetType === 'area') {
            progress.selectedArea = { col: randomEnemy.col, row: randomEnemy.row }
            progress.selectedTargetUnitId = null
          }
        }
        if (defCard) progress.selectedDefenseId = defCard.id
        progress.actedThisPhase = true
        this.addLog(`Bot: ${unit.name} preparou ${atkCard?.name ?? '—'} + ${defCard?.name ?? '—'}.`)
        return
      }

      const hpRatio = state.hp / state.maxHp

      // ── Attack selection ────────────────────────────────────────────────
      // Try to pick a card that will finish off the weakest enemy.
      // Fall back to queue[0] if no kill-shot is available.
      const weakest = enemies.reduce((a, b) =>
        (this.unitState.get(a.id)?.hp ?? 9999) <= (this.unitState.get(b.id)?.hp ?? 9999) ? a : b)
      const weakestHp = this.unitState.get(weakest.id)?.hp ?? 9999

      const atkCards = deck.attackQueue
        .map((id) => getCardById(unit.role, id))
        .filter((c): c is CardData => !!c)

      const killShot = atkCards.find((c) =>
        Math.round(c.power * (state.attack / 50)) >= weakestHp)

      // Hard mode: prefer kill-shot on enemy king if available
      const enemyKing = enemies.find((e) => e.role === 'king')
      const enemyKingHp = enemyKing ? (this.unitState.get(enemyKing.id)?.hp ?? 9999) : 9999
      const kingKillShot = this.botDifficulty === 'hard' && enemyKing
        ? atkCards.find((c) => Math.round(c.power * (state.attack / 50)) >= enemyKingHp)
        : null

      const attackCard = kingKillShot ?? killShot ?? atkCards[0] ?? null

      // Target: king kill-shot > weakest kill-shot > nearest enemy
      const target = kingKillShot && enemyKing
        ? enemyKing
        : killShot
          ? weakest
          : enemies.reduce((a, b) => {
              const da = Math.abs(a.col - unit.col) + Math.abs(a.row - unit.row)
              const db = Math.abs(b.col - unit.col) + Math.abs(b.row - unit.row)
              return da <= db ? a : b
            })

      if (attackCard) {
        progress.selectedAttackId = attackCard.id
        if (attackCard.targetType === 'single') {
          progress.selectedTargetUnitId = target.id
          progress.selectedArea = null
        } else if (attackCard.targetType === 'area') {
          progress.selectedArea = { col: target.col, row: target.row }
          progress.selectedTargetUnitId = null
        }
      }

      // ── Defense selection ────────────────────────────────────────────────
      // Low HP → prefer regen/heal; no shield → prefer shield/evade; else queue[0].
      const defCards = deck.defenseQueue
        .map((id) => getCardById(unit.role, id))
        .filter((c): c is CardData => !!c)

      let defCard: CardData | null = null
      if (hpRatio < 0.35) {
        defCard = defCards.find((c) => c.effect === 'regen' || c.effect === 'heal') ?? defCards[0] ?? null
      } else if (state.shield === 0 && state.evadeCharges === 0) {
        defCard = defCards.find((c) => c.effect === 'shield' || c.effect === 'evade') ?? defCards[0] ?? null
      } else {
        defCard = defCards[0] ?? null
      }

      if (defCard) progress.selectedDefenseId = defCard.id

      progress.actedThisPhase = true
      this.addLog(`Bot: ${unit.name} preparou ${attackCard?.name ?? '—'} + ${defCard?.name ?? '—'}.`)
    })

    if (this.haveAllActiveUnitsActed()) {
      this.time.delayedCall(300, () => this.resolveCurrentSideActions())
    }
  }

  // ─── Audio ────────────────────────────────────────────────────────────────

  // Audio helpers — delegate to AudioManager (utils/audioUtils.ts)
  private playSoundHit()         { this.audio.playTone(280, 'sawtooth', 0.12, 0.13) }
  private playSoundHeavyHit()    { this.audio.playTone(180, 'sawtooth', 0.18, 0.18); this.audio.playTone(110, 'square', 0.22, 0.08, 0.05) }
  private playSoundShield()      { this.audio.playTone(600, 'sine', 0.1, 0.08); this.audio.playTone(800, 'sine', 0.1, 0.06, 0.05) }
  private playSoundHeal()        { this.audio.playTone(523, 'sine', 0.12, 0.1); this.audio.playTone(659, 'sine', 0.12, 0.08, 0.07); this.audio.playTone(784, 'sine', 0.14, 0.07, 0.14) }
  private playSoundStun()        { this.audio.playTone(220, 'square', 0.15, 0.15); this.audio.playTone(110, 'square', 0.2, 0.1, 0.08) }
  private playSoundDeath()       { this.audio.playTone(220, 'sawtooth', 0.08, 0.18); this.audio.playTone(160, 'sawtooth', 0.14, 0.12, 0.08); this.audio.playTone(100, 'sawtooth', 0.2, 0.1, 0.16) }
  private playSoundPhaseChange() { this.audio.playTone(440, 'sine', 0.1, 0.1); this.audio.playTone(550, 'sine', 0.1, 0.08, 0.1) }
  private playSoundVictory()     { [523, 659, 784, 1047].forEach((f, i) => this.audio.playTone(f, 'sine', 0.3, 0.15, i * 0.12)) }
  private playSoundCardSelect()  { this.audio.playTone(660, 'sine', 0.06, 0.07) }
  private playSoundEvade()       { this.audio.playTone(880, 'sine', 0.08, 0.09) }

  // ─── Ghost preview (movement hover) ───────────────────────────────────────

  private showGhostAt(col: number, row: number, unitColor: number) {
    this.clearGhostPreview()
    const x = this.boardX + col * GRID_SIZE + GRID_SIZE / 2
    const y = this.boardY + row * GRID_SIZE + GRID_SIZE / 2
    this.ghostPreview = this.add.circle(x, y, 21, unitColor, 0.35)
      .setStrokeStyle(2, 0xffffff, 0.5)
      .setDepth(10)
  }

  private clearGhostPreview() {
    this.ghostPreview?.destroy()
    this.ghostPreview = undefined
  }

  // ─── Tombstones ───────────────────────────────────────────────────────────

  private spawnTombstone(col: number, row: number, side: TeamSide) {
    const x = this.boardX + col * GRID_SIZE + GRID_SIZE / 2
    const y = this.boardY + row * GRID_SIZE + GRID_SIZE / 2
    const ring = this.add.circle(0, 0, 20, 0x000000, 0)
      .setStrokeStyle(2, side === 'left' ? 0x4f7cff : 0xff6b6b, 0.5)
    const mark = this.add.text(0, 0, '✕', {
      fontFamily: 'Arial', fontSize: '16px', color: side === 'left' ? '#4f7cff' : '#ff6b6b',
    }).setOrigin(0.5).setAlpha(0.5)
    const container = this.add.container(x, y, [ring, mark]).setDepth(5).setAlpha(0.6)
    this.tombstones.push(container)
  }

  // ─── King teleport burst ──────────────────────────────────────────────────

  private spawnTeleportBurst(col: number, row: number) {
    const x = this.boardX + col * GRID_SIZE + GRID_SIZE / 2
    const y = this.boardY + row * GRID_SIZE + GRID_SIZE / 2
    for (let i = 0; i < 6; i++) {
      const angle  = (i / 6) * Math.PI * 2
      const px     = x + Math.cos(angle) * 10
      const py     = y + Math.sin(angle) * 10
      const particle = this.add.circle(px, py, 4, 0xfde047, 0.9).setDepth(60)
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * 44,
        y: y + Math.sin(angle) * 44,
        alpha: 0,
        scale: 0.2,
        duration: 320,
        ease: 'Sine.easeOut',
        onComplete: () => particle.destroy(),
      })
    }
    const flash = this.add.circle(x, y, 26, 0xfde047, 0.6).setDepth(59)
    this.tweens.add({ targets: flash, scale: 1.8, alpha: 0, duration: 280, onComplete: () => flash.destroy() })
  }
}
