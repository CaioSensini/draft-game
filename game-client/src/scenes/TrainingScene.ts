/**
 * scenes/TrainingScene.ts — free-play sandbox for testing skills.
 *
 * No engine, no turns, no timers. The player selects a character,
 * moves freely, picks any skill, and resolves it against training
 * dummies whose HP resets after each hit.
 */

import Phaser from 'phaser'
import { SKILL_CATALOG } from '../data/skillCatalog'
import type { SkillDefinition } from '../domain/Skill'
import type { UnitRole } from '../engine/types'
import type { AreaShape, CardinalDirection } from '../domain/Grid'
import { transitionTo } from '../utils/SceneTransition'
import { UI } from '../utils/UIComponents'
import { C, F, S, SHADOW, SCREEN } from '../utils/DesignTokens'
import { playerData } from '../utils/PlayerDataManager'

// ── Dark Fantasy palette ────────────────────────────────────────────────────

const TILE_LIGHT  = 0x141a24
const TILE_DARK   = 0x0f1420
const WALL_COLOR  = 0x1a1028

const W = SCREEN.W, H = SCREEN.H
const TILE = 64, COLS = 16, ROWS = 6
const GRID_X = (W - COLS * TILE) / 2   // 128
const GRID_Y = 72


// ── Character setup ─────────────────────────────────────────────────────────

interface TrainingUnit {
  id:      string
  name:    string
  role:    UnitRole
  col:     number
  row:     number
  color:   number
  isDummy: boolean
  hp:      number
  maxHp:   number
}

const ROLE_COLORS: Record<string, number> = {
  warrior:    0x2255aa,
  king:       0x4a90d9,
  specialist: 0x44aacc,
  executor:   0x7744cc,
  dummy:      0x555555,
}

const ROLE_LABELS: Record<string, string> = {
  warrior:    'GUE',
  king:       'REI',
  specialist: 'ESP',
  executor:   'EXE',
  dummy:      '\uD83C\uDFAF',
}

// ── Scene ───────────────────────────────────────────────────────────────────

export default class TrainingScene extends Phaser.Scene {
  private units: TrainingUnit[] = []
  private initialPositions: Array<{ id: string; col: number; row: number }> = []
  private selectedUnit: TrainingUnit | null = null
  private selectedSkill: SkillDefinition | null = null
  private mode: 'idle' | 'moving' | 'targeting' = 'idle'

  // Visual objects
  private unitSprites: Map<string, Phaser.GameObjects.Container> = new Map()
  private moveOverlays: Phaser.GameObjects.Rectangle[] = []
  private targetOverlays: Phaser.GameObjects.Rectangle[] = []
  private skillButtons: Phaser.GameObjects.Container[] = []
  private selectedRing: Phaser.GameObjects.Rectangle | null = null
  private panelBg: Phaser.GameObjects.Rectangle | null = null
  private hintText: Phaser.GameObjects.Text | null = null

  // Skill tooltip
  private skillTooltip: Phaser.GameObjects.Container | null = null

  // Deck / Todas toggle
  private showAllSkills = false
  private toggleContainer: Phaser.GameObjects.Container | null = null

  // Dummy damage tracking
  private dummyDamage: Record<string, number> = {}
  private dummyDamageTexts: Map<string, Phaser.GameObjects.Text> = new Map()

  constructor() { super('TrainingScene') }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  create() {
    // Reset state from previous entry
    this.unitSprites.clear()
    this.moveOverlays = []
    this.targetOverlays = []
    this.skillButtons = []
    this.selectedUnit = null
    this.selectedSkill = null
    this.mode = 'idle'
    this.skillTooltip = null
    this.showAllSkills = false
    this.toggleContainer = null
    this.dummyDamage = {}
    this.dummyDamageTexts = new Map()

    this.units = [
      { id: 'tw', name: 'Guerreiro',    role: 'warrior',    col: 1, row: 1, color: ROLE_COLORS.warrior,    isDummy: false, hp: 180, maxHp: 180 },
      { id: 'tk', name: 'Rei',          role: 'king',       col: 1, row: 2, color: ROLE_COLORS.king,       isDummy: false, hp: 150, maxHp: 150 },
      { id: 'ts', name: 'Especialista', role: 'specialist', col: 1, row: 3, color: ROLE_COLORS.specialist, isDummy: false, hp: 130, maxHp: 130 },
      { id: 'te', name: 'Executor',     role: 'executor',   col: 1, row: 4, color: ROLE_COLORS.executor,   isDummy: false, hp: 120, maxHp: 120 },
      { id: 'd1', name: 'Boneco 1',     role: 'warrior',    col: 11, row: 2, color: ROLE_COLORS.dummy,     isDummy: true,  hp: 999, maxHp: 999 },
      { id: 'd2', name: 'Boneco 2',     role: 'warrior',    col: 11, row: 3, color: ROLE_COLORS.dummy,     isDummy: true,  hp: 999, maxHp: 999 },
    ]

    // Save initial positions for reset
    this.initialPositions = this.units.map(u => ({ id: u.id, col: u.col, row: u.row }))

    UI.background(this)
    UI.particles(this, 15)
    this.drawGrid()
    this.drawUnits()
    this.drawHUD()
    this.setupInput()

    UI.fadeIn(this)
  }

  // ── Grid ──────────────────────────────────────────────────────────────────

  private drawGrid() {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const x = GRID_X + c * TILE + TILE / 2
        const y = GRID_Y + r * TILE + TILE / 2

        // Wall column at col 8
        if (c === 8) {
          this.add.rectangle(x, y, TILE - 1, TILE - 1, WALL_COLOR, 0.9)
          continue
        }

        // Checkerboard + left-blue / right-gray tint
        const isEven = (c + r) % 2 === 0
        let base = isEven ? TILE_LIGHT : TILE_DARK
        if (c < 8) {
          // Slight blue tint for left side
          base = isEven ? 0x141a28 : 0x0f1424
        }

        this.add.rectangle(x, y, TILE - 1, TILE - 1, base, 0.95)
      }
    }
  }

  // ── Units ─────────────────────────────────────────────────────────────────

  private drawUnits() {
    this.units.forEach(u => {
      const container = this.createUnitSprite(u)
      this.unitSprites.set(u.id, container)

      // Add cumulative damage counter below each dummy
      if (u.isDummy) {
        this.dummyDamage[u.id] = 0
        const px = GRID_X + u.col * TILE + TILE / 2
        const py = GRID_Y + u.row * TILE + TILE / 2
        const dmgText = this.add.text(px, py + 38, 'Dano Total: 0', {
          fontFamily: F.body,
          fontSize: S.small,
          color: C.dangerHex,
          fontStyle: 'bold',
          shadow: SHADOW.text,
        }).setOrigin(0.5).setAlpha(0.8)
        this.dummyDamageTexts.set(u.id, dmgText)
      }
    })
  }

  private createUnitSprite(u: TrainingUnit): Phaser.GameObjects.Container {
    const px = GRID_X + u.col * TILE + TILE / 2
    const py = GRID_Y + u.row * TILE + TILE / 2

    const bg = this.add.rectangle(0, 0, 48, 48, u.color, 0.95)
      .setStrokeStyle(1, 0x333333, 0.6)

    const roleKey = u.isDummy ? 'dummy' : u.role
    const label = this.add.text(0, -2, ROLE_LABELS[roleKey], {
      fontFamily: F.body,
      fontSize: u.isDummy ? S.titleSmall : S.body,
      color: '#ffffff',
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    const hpText = this.add.text(0, 30, `${u.hp}`, {
      fontFamily: F.body,
      fontSize: S.small,
      color: u.isDummy ? C.mutedHex : C.infoHex,
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    const children: Phaser.GameObjects.GameObject[] = [bg, label, hpText]

    // "BONECO" floating label above dummies
    if (u.isDummy) {
      const bonecoLabel = this.add.text(0, -30, 'BONECO', {
        fontFamily: F.body,
        fontSize: S.small,
        color: C.mutedHex,
        fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(0.5)
      children.push(bonecoLabel)
    }

    const container = this.add.container(px, py, children)
    container.setSize(48, 48)
    container.setData('unitId', u.id)
    container.setData('hpText', hpText)

    return container
  }

  private updateUnitPosition(u: TrainingUnit) {
    const sprite = this.unitSprites.get(u.id)
    if (!sprite) return
    const px = GRID_X + u.col * TILE + TILE / 2
    const py = GRID_Y + u.row * TILE + TILE / 2
    this.tweens.add({
      targets: sprite,
      x: px,
      y: py,
      duration: 200,
      ease: 'Power2',
    })

    // Move damage counter text with the dummy
    const dmgText = this.dummyDamageTexts.get(u.id)
    if (dmgText) {
      this.tweens.add({
        targets: dmgText,
        x: px,
        y: py + 38,
        duration: 200,
        ease: 'Power2',
      })
    }
  }

  private updateUnitHpDisplay(u: TrainingUnit) {
    const sprite = this.unitSprites.get(u.id)
    if (!sprite) return
    const hpText = sprite.getData('hpText') as Phaser.GameObjects.Text
    if (hpText) hpText.setText(`${u.hp}`)
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private drawHUD() {
    // Title
    this.add.text(W / 2, 30, 'CAMPO DE TREINAMENTO', {
      fontFamily: F.title,
      fontSize: S.titleLarge,
      color: C.goldHex,
      fontStyle: 'bold',
      shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)

    // Gold decorative line
    this.add.rectangle(W / 2, 52, 240, 2, C.gold, 0.3)

    // Instruction hint (always visible)
    this.add.text(W / 2, 62, 'Clique em um personagem \u2192 Escolha uma skill \u2192 Selecione o alvo', {
      fontFamily: F.body,
      fontSize: S.small,
      color: C.mutedHex,
      shadow: SHADOW.text,
    }).setOrigin(0.5).setAlpha(0.7)

    // Back arrow (top-left)
    UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))

    // "Resetar Posicoes" button (top-right)
    const resetX = W - 100
    const resetY = 30
    this.add.rectangle(resetX, resetY + 2, 130, S.buttonHSmall, C.shadow, 0.2)
    const resetBg = this.add.rectangle(resetX, resetY, 130, S.buttonHSmall, 0x141a24, 1)
      .setStrokeStyle(1, C.panelBorder, 0.4)
      .setInteractive({ useHandCursor: true })

    const resetLbl = this.add.text(resetX, resetY, 'Resetar Posicoes', {
      fontFamily: F.body,
      fontSize: S.small,
      color: C.goldHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    resetBg.on('pointerover', () => { resetBg.setFillStyle(0x1a2230); resetLbl.setColor(C.bodyHex) })
    resetBg.on('pointerout', () => { resetBg.setFillStyle(0x141a24); resetLbl.setColor(C.goldHex) })
    resetBg.on('pointerdown', () => {
      this.initialPositions.forEach(pos => {
        const unit = this.units.find(u => u.id === pos.id)
        if (unit) {
          unit.col = pos.col
          unit.row = pos.row
          unit.hp = unit.maxHp
          this.updateUnitPosition(unit)
          this.updateUnitHpDisplay(unit)
        }
      })
      // Reset dummy damage counters
      for (const key of Object.keys(this.dummyDamage)) {
        this.dummyDamage[key] = 0
      }
      this.dummyDamageTexts.forEach(txt => txt.setText('Dano Total: 0'))

      this.setHint('Posicoes resetadas!')
      // Clear selection
      this.selectedUnit = null
      this.selectedSkill = null
      this.mode = 'idle'
      this.clearSkillPanel()
      this.clearTargetOverlays()
      if (this.selectedRing) { this.selectedRing.destroy(); this.selectedRing = null }
    })

    // Dynamic hint text at bottom
    this.hintText = this.add.text(W / 2, H - 16, 'Clique em um personagem para selecionar', {
      fontFamily: F.body,
      fontSize: S.bodySmall,
      color: C.mutedHex,
      shadow: SHADOW.text,
    }).setOrigin(0.5)
  }

  private setHint(text: string) {
    if (this.hintText) this.hintText.setText(text)
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private setupInput() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const col = Math.floor((pointer.x - GRID_X) / TILE)
      const row = Math.floor((pointer.y - GRID_Y) / TILE)

      // Out of grid bounds
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return
      // Wall column
      if (col === 8) return

      const clickedUnit = this.units.find(u => u.col === col && u.row === row)

      // Targeting mode: resolve skill on click
      if (this.mode === 'targeting' && this.selectedSkill && this.selectedUnit) {
        this.resolveSkill(this.selectedSkill, this.selectedUnit, { col, row })
        return
      }

      // Clicked on a player character -> select it
      if (clickedUnit && !clickedUnit.isDummy) {
        this.selectUnit(clickedUnit)
        return
      }

      // Clicked on empty tile with a unit selected -> move there
      if (!clickedUnit && this.selectedUnit) {
        const unit = this.selectedUnit
        const mobility = { king: 3, executor: 3, warrior: 2, specialist: 2 }[unit.role] ?? 2
        const distance = Math.abs(unit.col - col) + Math.abs(unit.row - row)
        if (distance > mobility) {
          this.setHint(`Muito longe! ${unit.name} so pode mover ${mobility} tiles.`)
          return
        }
        // Must stay on own side (cols 0-7 for left side)
        if (col > 7) {
          this.setHint(`${unit.name} nao pode ir para o lado inimigo!`)
          return
        }
        unit.col = col
        unit.row = row
        this.updateUnitPosition(unit)
        this.setHint(`${unit.name} moveu para (${col}, ${row})`)
        return
      }
    })
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  private selectUnit(u: TrainingUnit) {
    this.selectedUnit = u
    this.selectedSkill = null
    this.mode = 'idle'
    this.clearTargetOverlays()
    this.clearMoveOverlays()

    // Draw selection ring
    if (this.selectedRing) this.selectedRing.destroy()
    const px = GRID_X + u.col * TILE + TILE / 2
    const py = GRID_Y + u.row * TILE + TILE / 2
    this.selectedRing = this.add.rectangle(px, py, 54, 54)
      .setStrokeStyle(2, C.gold, 0.9)
      .setFillStyle(C.black, 0)

    // Show skill panel for this role
    this.showSkillPanel(u.role)
    this.setHint(`${u.name} selecionado — escolha uma skill`)
  }

  // ── Skill panel ───────────────────────────────────────────────────────────

  private showSkillPanel(role: UnitRole) {
    this.clearSkillPanel()

    let attacks: SkillDefinition[]
    let defenses: SkillDefinition[]

    if (this.showAllSkills) {
      // Show all 16 skills for this role (for testing)
      const prefix = { king: 'lk', warrior: 'lw', specialist: 'ls', executor: 'le' }[role]
      const skills = SKILL_CATALOG.filter(s => s.id.startsWith(prefix + '_'))
      attacks  = skills.filter(s => s.category === 'attack')
      defenses = skills.filter(s => s.category === 'defense')
    } else {
      // Show only equipped deck (4 ATK + 4 DEF)
      const deck = playerData.getDeckConfig()[role]
      if (deck) {
        const atkIds = deck.attackCards.filter(id => id)
        const defIds = deck.defenseCards.filter(id => id)
        attacks  = atkIds.map(id => SKILL_CATALOG.find(s => s.id === id)).filter(Boolean) as SkillDefinition[]
        defenses = defIds.map(id => SKILL_CATALOG.find(s => s.id === id)).filter(Boolean) as SkillDefinition[]
      } else {
        attacks  = []
        defenses = []
      }
    }

    // Panel background
    const panelY = H - 140
    const panelH = 130
    this.panelBg = this.add.rectangle(W / 2, panelY + panelH / 2, W - 20, panelH, C.panelBg, 0.92)
      .setStrokeStyle(1, C.panelBorder, 0.6)

    // Deck/Todas toggle
    this.drawSkillToggle(role, panelY)

    // Attack row label
    const atkLabel = this.add.text(GRID_X + 2, panelY + 6, 'ATK', {
      fontFamily: F.body, fontSize: S.small, color: C.dangerHex, fontStyle: 'bold',
      shadow: SHADOW.text,
    })
    this.skillButtons.push(this.add.container(0, 0, [atkLabel]))

    // Defense row label
    const defLabel = this.add.text(GRID_X + 2, panelY + 58, 'DEF', {
      fontFamily: F.body, fontSize: S.small, color: C.infoHex, fontStyle: 'bold',
      shadow: SHADOW.text,
    })
    this.skillButtons.push(this.add.container(0, 0, [defLabel]))

    // Attack buttons
    const btnStartX = GRID_X + 32
    attacks.forEach((skill, i) => {
      this.createSkillButton(skill, btnStartX + i * 130, panelY + 18, C.dangerDark, C.dangerHex)
    })

    // Defense buttons
    defenses.forEach((skill, i) => {
      this.createSkillButton(skill, btnStartX + i * 130, panelY + 68, C.infoDark, C.infoHex)
    })
  }

  private drawSkillToggle(_role: UnitRole, panelY: number) {
    if (this.toggleContainer) {
      this.toggleContainer.destroy(true)
      this.toggleContainer = null
    }

    const tX = W - 90, tY = panelY - 14
    const deckActive = !this.showAllSkills
    const todasActive = this.showAllSkills

    const deckBg = this.add.rectangle(-30, 0, 56, 20, deckActive ? 0x1a2a3a : 0x0e1420, 0.95)
      .setStrokeStyle(1, deckActive ? C.gold : C.panelBorder, deckActive ? 0.7 : 0.3)
      .setInteractive({ useHandCursor: true })
    const deckLbl = this.add.text(-30, 0, 'Deck', {
      fontFamily: F.body, fontSize: S.small, color: deckActive ? C.goldHex : C.mutedHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)

    const todasBg = this.add.rectangle(30, 0, 56, 20, todasActive ? 0x1a2a3a : 0x0e1420, 0.95)
      .setStrokeStyle(1, todasActive ? C.gold : C.panelBorder, todasActive ? 0.7 : 0.3)
      .setInteractive({ useHandCursor: true })
    const todasLbl = this.add.text(30, 0, 'Todas', {
      fontFamily: F.body, fontSize: S.small, color: todasActive ? C.goldHex : C.mutedHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)

    deckBg.on('pointerdown', () => {
      if (this.showAllSkills) {
        this.showAllSkills = false
        if (this.selectedUnit) this.showSkillPanel(this.selectedUnit.role)
      }
    })
    todasBg.on('pointerdown', () => {
      if (!this.showAllSkills) {
        this.showAllSkills = true
        if (this.selectedUnit) this.showSkillPanel(this.selectedUnit.role)
      }
    })

    this.toggleContainer = this.add.container(tX, tY, [deckBg, deckLbl, todasBg, todasLbl])
  }

  private createSkillButton(skill: SkillDefinition, x: number, y: number, bgColor: number, textColor: string) {
    const btnW = 122
    const btnH = 46

    // Shadow for 3D feel
    const shadow = this.add.rectangle(1, 2, btnW, btnH, C.shadow, 0.25)

    // Card background with rounded-corner look
    const bg = this.add.rectangle(0, 0, btnW, btnH, bgColor, 0.9)
      .setStrokeStyle(1, C.panelBorder, 0.5)
      .setInteractive({ useHandCursor: true })

    // Gold trim
    const trim = this.add.rectangle(0, 0, btnW + 2, btnH + 2, C.black, 0)
      .setStrokeStyle(1, C.goldDim, 0.08)

    const nameText = this.add.text(0, -10, skill.name, {
      fontFamily: F.body,
      fontSize: S.small,
      color: textColor,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    // Truncate if too long
    if (nameText.width > btnW - 8) {
      nameText.setFontSize(9)
    }

    // Power badge (small pill)
    const pwrBadgeW = 42
    const pwrBadge = this.add.rectangle(0, 12, pwrBadgeW, 16, C.shadow, 0.3)
      .setStrokeStyle(1, C.gold, 0.3)
    const powerText = this.add.text(0, 12, `${skill.power}`, {
      fontFamily: F.body,
      fontSize: S.small,
      color: C.goldHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    const container = this.add.container(x + btnW / 2, y + btnH / 2, [shadow, trim, bg, nameText, pwrBadge, powerText])
    container.setSize(btnW, btnH)

    bg.on('pointerover', () => {
      bg.setStrokeStyle(1, C.gold, 0.8)
      bg.setFillStyle(bgColor === 0x3a1515 ? 0x4a2020 : 0x153545, 0.95)
      this.showSkillTooltip(skill, x + btnW / 2, y)
    })
    bg.on('pointerout', () => {
      bg.setStrokeStyle(1, C.panelBorder, 0.5)
      bg.setFillStyle(bgColor, 0.9)
      this.hideSkillTooltip()
    })
    bg.on('pointerdown', () => {
      this.hideSkillTooltip()
      this.onSkillSelected(skill)
    })

    this.skillButtons.push(container)
  }

  private clearSkillPanel() {
    this.hideSkillTooltip()
    this.skillButtons.forEach(b => b.destroy())
    this.skillButtons = []
    if (this.panelBg) {
      this.panelBg.destroy()
      this.panelBg = null
    }
    if (this.toggleContainer) {
      this.toggleContainer.destroy(true)
      this.toggleContainer = null
    }
  }

  // ── Skill selection ───────────────────────────────────────────────────────

  private onSkillSelected(skill: SkillDefinition) {
    if (!this.selectedUnit) return

    this.selectedSkill = skill
    this.clearTargetOverlays()

    // Self-targeting skills resolve immediately
    if (skill.targetType === 'self' || skill.targetType === 'lowest_ally' || skill.targetType === 'all_allies') {
      this.resolveSkill(skill, this.selectedUnit, { col: this.selectedUnit.col, row: this.selectedUnit.row })
      return
    }

    // Enter targeting mode
    this.mode = 'targeting'
    this.setHint(`Alvo para ${skill.name} — clique em um boneco ou tile`)

    if (skill.targetType === 'single') {
      // Highlight dummies
      this.units.filter(u => u.isDummy).forEach(u => {
        const px = GRID_X + u.col * TILE + TILE / 2
        const py = GRID_Y + u.row * TILE + TILE / 2
        const ring = this.add.rectangle(px, py, 56, 56)
          .setStrokeStyle(2, C.gold, 0.8)
          .setFillStyle(C.gold, 0.1)
        this.targetOverlays.push(ring)
      })
    } else if (skill.targetType === 'area') {
      // Highlight valid tiles on enemy side (cols 9-15)
      for (let c = 9; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const px = GRID_X + c * TILE + TILE / 2
          const py = GRID_Y + r * TILE + TILE / 2
          const ov = this.add.rectangle(px, py, TILE - 2, TILE - 2)
            .setStrokeStyle(1, C.gold, 0.3)
            .setFillStyle(C.gold, 0.05)
          this.targetOverlays.push(ov)
        }
      }
    }
  }

  // ── Skill resolution (no engine) ──────────────────────────────────────────

  private resolveSkill(skill: SkillDefinition, caster: TrainingUnit, targetPos: { col: number; row: number }) {
    // Calculate simple damage
    const baseDamage = skill.power * (caster.role === 'executor' ? 1.3 : 1.0)

    // Find targets based on area shape
    const targets = this.getTargetsInArea(skill, targetPos)

    if (targets.length === 0) {
      // Show "miss" or "no target" feedback
      const px = GRID_X + targetPos.col * TILE + TILE / 2
      const py = GRID_Y + targetPos.row * TILE + TILE / 2
      this.showFloatingText(px, py, 'SEM ALVO', C.mutedHex)
    }

    targets.forEach(target => {
      const px = GRID_X + target.col * TILE + TILE / 2
      const py = GRID_Y + target.row * TILE + TILE / 2

      // Determine if it is a defensive/buff skill
      const isDefensive = skill.category === 'defense'
      const dmg = Math.round(baseDamage)

      if (isDefensive) {
        // Show positive effect number
        this.showFloatingText(px, py, `+${dmg}`, C.infoHex)
      } else {
        // Show damage number
        this.showDamageNumber(px, py, dmg)
      }

      // Flash the target
      const sprite = this.unitSprites.get(target.id)
      if (sprite) {
        this.tweens.add({
          targets: sprite,
          alpha: 0.3,
          yoyo: true,
          duration: 100,
          repeat: 2,
        })
      }

      // Subtract HP temporarily for display
      if (!isDefensive && target.isDummy) {
        target.hp = Math.max(0, target.hp - dmg)
        this.updateUnitHpDisplay(target)

        // Accumulate total damage
        this.dummyDamage[target.id] = (this.dummyDamage[target.id] || 0) + dmg
        const dmgText = this.dummyDamageTexts.get(target.id)
        if (dmgText) dmgText.setText(`Dano Total: ${this.dummyDamage[target.id]}`)

        // Reset dummy HP after 1 second
        this.time.delayedCall(1000, () => {
          target.hp = target.maxHp
          this.updateUnitHpDisplay(target)
        })
      }
    })

    // Clear targeting state
    this.clearTargetOverlays()
    this.selectedSkill = null
    this.mode = 'idle'
    this.setHint(`${skill.name} usada! Escolha outra skill ou mova.`)
  }

  // ── Target resolution ─────────────────────────────────────────────────────

  private getTargetsInArea(skill: SkillDefinition, center: { col: number; row: number }): TrainingUnit[] {
    if (skill.targetType === 'single') {
      return this.units.filter(u => u.col === center.col && u.row === center.row)
    }
    if (skill.targetType === 'self') {
      return this.selectedUnit ? [this.selectedUnit] : []
    }
    if (skill.targetType === 'lowest_ally' || skill.targetType === 'all_allies') {
      // Treat as self-buff for training purposes
      return this.selectedUnit ? [this.selectedUnit] : []
    }

    // For area skills, compute affected tiles based on areaShape
    const affected: Array<{ col: number; row: number }> = []
    const shape = skill.areaShape as AreaShape | undefined

    if (!shape) {
      // Fallback: use areaRadius as diamond
      const radius = skill.areaRadius ?? 1
      for (let dc = -radius; dc <= radius; dc++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if (Math.abs(dc) + Math.abs(dr) <= radius) {
            affected.push({ col: center.col + dc, row: center.row + dr })
          }
        }
      }
    } else if (shape.type === 'single') {
      affected.push(center)
    } else if (shape.type === 'square') {
      for (let dc = -shape.radius; dc <= shape.radius; dc++) {
        for (let dr = -shape.radius; dr <= shape.radius; dr++) {
          affected.push({ col: center.col + dc, row: center.row + dr })
        }
      }
    } else if (shape.type === 'diamond') {
      for (let dc = -shape.radius; dc <= shape.radius; dc++) {
        for (let dr = -shape.radius; dr <= shape.radius; dr++) {
          if (Math.abs(dc) + Math.abs(dr) <= shape.radius) {
            affected.push({ col: center.col + dc, row: center.row + dr })
          }
        }
      }
    } else if (shape.type === 'line') {
      const dir: CardinalDirection = shape.direction
      for (let i = 0; i <= shape.length; i++) {
        const dc = dir === 'east' ? i : dir === 'west' ? -i : 0
        const dr = dir === 'south' ? i : dir === 'north' ? -i : 0
        affected.push({ col: center.col + dc, row: center.row + dr })
      }
    } else if (shape.type === 'ring') {
      for (let dc = -shape.radius; dc <= shape.radius; dc++) {
        for (let dr = -shape.radius; dr <= shape.radius; dr++) {
          if (Math.abs(dc) + Math.abs(dr) === shape.radius) {
            affected.push({ col: center.col + dc, row: center.row + dr })
          }
        }
      }
    } else if (shape.type === 'cone') {
      const dir: CardinalDirection = shape.direction
      for (let i = 0; i <= shape.length; i++) {
        for (let spread = -i; spread <= i; spread++) {
          let dc = 0, dr = 0
          if (dir === 'east')  { dc = i; dr = spread }
          if (dir === 'west')  { dc = -i; dr = spread }
          if (dir === 'south') { dr = i; dc = spread }
          if (dir === 'north') { dr = -i; dc = spread }
          affected.push({ col: center.col + dc, row: center.row + dr })
        }
      }
    }

    return this.units.filter(u => affected.some(a => a.col === u.col && a.row === u.row))
  }

  // ── Visual feedback ───────────────────────────────────────────────────────

  private showDamageNumber(x: number, y: number, damage: number) {
    const txt = this.add.text(x, y - 10, `-${damage}`, {
      fontFamily: F.title,
      fontSize: S.titleMedium,
      color: C.dangerHex,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
      shadow: SHADOW.strong,
    }).setOrigin(0.5)

    this.tweens.add({
      targets: txt,
      y: y - 50,
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    })
  }

  private showFloatingText(x: number, y: number, text: string, color: string) {
    const txt = this.add.text(x, y - 10, text, {
      fontFamily: F.body,
      fontSize: S.titleSmall,
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
      shadow: SHADOW.strong,
    }).setOrigin(0.5)

    this.tweens.add({
      targets: txt,
      y: y - 50,
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    })
  }

  // ── Skill tooltip ─────────────────────────────────────────────────────────

  private showSkillTooltip(skill: SkillDefinition, x: number, y: number): void {
    this.hideSkillTooltip()

    const ttW = 230, pad = 10
    const name = skill.name ?? 'Skill'
    const desc = skill.description ?? ''
    const power = skill.power > 0 ? `Poder: ${skill.power}` : ''
    const effect = _effectLabel(skill.effectType ?? 'damage')
    const targeting = skill.targetType === 'single' ? 'Alvo: 1 inimigo'
      : skill.targetType === 'area' ? 'Alvo: Area'
      : skill.targetType === 'self' ? 'Alvo: Proprio'
      : skill.targetType === 'lowest_ally' ? 'Alvo: Aliado mais fraco'
      : skill.targetType === 'all_allies' ? 'Alvo: Todos aliados'
      : ''

    const nameText = this.add.text(0, 0, name, {
      fontFamily: F.title, fontSize: '13px', color: C.goldHex, fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setDepth(201)

    const detailText = this.add.text(0, 18, `${effect}  ${power}`, {
      fontFamily: F.body, fontSize: '10px', color: C.bodyHex,
      shadow: SHADOW.text,
    }).setDepth(201)

    const targetText = this.add.text(0, 32, targeting, {
      fontFamily: F.body, fontSize: '9px', color: C.mutedHex,
      shadow: SHADOW.text,
    }).setDepth(201)

    const descText = this.add.text(0, 48, desc, {
      fontFamily: F.body, fontSize: '9px', color: C.mutedHex,
      wordWrap: { width: ttW - pad * 2 },
      shadow: SHADOW.text,
    }).setDepth(201)

    const ttH = 56 + descText.height + pad

    const g = this.add.graphics().setDepth(200)
    g.fillStyle(0x0a0e18, 0.95)
    g.fillRoundedRect(-pad, -pad, ttW, ttH, 6)
    g.lineStyle(1, C.goldDim, 0.5)
    g.strokeRoundedRect(-pad, -pad, ttW, ttH, 6)

    const ttX = Math.max(pad, Math.min(x - ttW / 2, W - ttW - pad))
    const ttY = Math.max(pad, y - ttH - 5)

    this.skillTooltip = this.add.container(ttX, ttY, [g, nameText, detailText, targetText, descText])
      .setDepth(200)
  }

  private hideSkillTooltip(): void {
    if (this.skillTooltip) {
      this.skillTooltip.destroy(true)
      this.skillTooltip = null
    }
  }

  // ── Cleanup helpers ───────────────────────────────────────────────────────

  private clearMoveOverlays() {
    this.moveOverlays.forEach(o => o.destroy())
    this.moveOverlays = []
  }

  private clearTargetOverlays() {
    this.targetOverlays.forEach(o => o.destroy())
    this.targetOverlays = []
  }

  shutdown() {
    this.hideSkillTooltip()
    this.tweens.killAll()
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _effectLabel(effectType: string): string {
  const labels: Record<string, string> = {
    damage: 'Dano', area: 'Area', heal: 'Cura', shield: 'Escudo',
    stun: 'Stun', snare: 'Snare', bleed: 'Sangramento',
    burn: 'Queimacao', poison: 'Veneno', evade: 'Esquiva',
    reflect: 'Refletir', regen: 'Regen', mark: 'Marca',
    revive: 'Revive', lifesteal: 'Roubo', true_damage: 'Dano Puro',
    cleanse: 'Purificar', purge: 'Purgar', def_up: '+DEF',
    atk_up: '+ATK', def_down: '-DEF', atk_down: '-ATK',
    double_attack: 'Duplo', silence_defense: 'Silencio', push: 'Empurrao',
    mov_down: '-MOV', advance_allies: 'Avanco', retreat_allies: 'Recuar',
  }
  return labels[effectType] ?? effectType
}
