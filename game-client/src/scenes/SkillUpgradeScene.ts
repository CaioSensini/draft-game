import Phaser from 'phaser'
import { SKILL_CATALOG } from '../data/skillCatalog'
import type { SkillDefinition } from '../domain/Skill'
import { playerData } from '../utils/PlayerDataManager'
import type { OwnedSkill } from '../utils/PlayerDataManager'

// ---- Layout constants (1280 x 720) -----------------------------------------

const W = 1280
const H = 720

const BG_COLOR     = 0x0f1117
const PANEL_COLOR  = 0x171b26
const PANEL_STROKE = 0x39435c
const GOLD_TEXT    = '#f8e7b9'
const LIGHT_TEXT   = '#cfd7ea'
const MUTED_TEXT   = '#8ea0c9'

const BTN_GREEN     = 0x3a7a45
const BTN_GREEN_HOV = 0x4a9155
const BTN_GREEN_STR = 0x9ee6a9

// ---- Fusion costs per level upgrade -----------------------------------------

const FUSION_COST: Record<number, number> = {
  1: 100,   // 1 -> 2
  2: 300,   // 2 -> 3
  3: 700,   // 3 -> 4
  4: 1500,  // 4 -> 5
}

const MAX_LEVEL = 5

// ---- Class metadata for display ---------------------------------------------

interface ClassInfo {
  key: string
  label: string
  prefix: string
  color: number
  textColor: string
}

const CLASSES: ClassInfo[] = [
  { key: 'king',       label: 'Rei',          prefix: 'lk_', color: 0x78350f, textColor: '#fbbf24' },
  { key: 'warrior',    label: 'Guerreiro',    prefix: 'lw_', color: 0x1e3a5f, textColor: '#60a5fa' },
  { key: 'executor',   label: 'Executor',     prefix: 'le_', color: 0x7f1d1d, textColor: '#f87171' },
  { key: 'specialist', label: 'Especialista', prefix: 'ls_', color: 0x4c1d95, textColor: '#a78bfa' },
]

// ---- Helper: skill definition lookup ----------------------------------------

function getSkillDef(skillId: string): SkillDefinition | undefined {
  return SKILL_CATALOG.find((s) => s.id === skillId)
}

// ---- Scene ------------------------------------------------------------------

export default class SkillUpgradeScene extends Phaser.Scene {
  private skills: OwnedSkill[] = []
  private gold = 500
  private activeClass = 0  // index into CLASSES

  // Selection state
  private selected: number[] = []  // indices into filtered skill list

  // Dynamic UI containers
  private gridContainer!: Phaser.GameObjects.Container
  private goldText!: Phaser.GameObjects.Text
  private fusionPanel!: Phaser.GameObjects.Container
  private tabBgs: Phaser.GameObjects.Rectangle[] = []
  private tabLabels: Phaser.GameObjects.Text[] = []

  // Popup overlay
  private popupOverlay: Phaser.GameObjects.Rectangle | null = null
  private popupBox: Phaser.GameObjects.Rectangle | null = null
  private popupText: Phaser.GameObjects.Text | null = null
  private popupBtn: Phaser.GameObjects.Rectangle | null = null
  private popupBtnLabel: Phaser.GameObjects.Text | null = null

  constructor() {
    super('SkillUpgradeScene')
  }

  create() {
    this.selected = []
    this.loadData()

    this.drawBackground()
    this.drawHeader()
    this.drawGoldBar()
    this.drawClassTabs()

    this.gridContainer = this.add.container(0, 0)
    this.fusionPanel = this.add.container(0, 0)
    this.renderGrid()

    this.drawBackButton()
  }

  // ---- Data loading ----------------------------------------------------------

  private loadData() {
    this.gold = playerData.getGold()
    this.skills = playerData.getSkills()
  }

  // ---- Background -----------------------------------------------------------

  private drawBackground() {
    this.add.rectangle(W / 2, H / 2, W, H, BG_COLOR)
    this.add.rectangle(W / 2, H / 2, 1100, 650, PANEL_COLOR, 0.96)
      .setStrokeStyle(2, PANEL_STROKE, 1)
  }

  // ---- Header ---------------------------------------------------------------

  private drawHeader() {
    this.add.text(W / 2, 65, 'UPGRADE DE SKILLS', {
      fontFamily: 'Arial',
      fontSize: '38px',
      color: GOLD_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0.5)

    this.add.text(W / 2, 100, 'Funda 2 skills identicas do mesmo nivel para evoluir', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: MUTED_TEXT,
    }).setOrigin(0.5)
  }

  // ---- Gold bar -------------------------------------------------------------

  private drawGoldBar() {
    const barY = 128
    this.add.rectangle(W / 2, barY, 300, 28, 0x111827, 0.9)
      .setStrokeStyle(1, 0x1e293b)

    this.goldText = this.add.text(W / 2, barY, `Gold: ${this.gold}`, {
      fontFamily: 'Arial',
      fontSize: '15px',
      color: '#fde68a',
      fontStyle: 'bold',
    }).setOrigin(0.5)
  }

  // ---- Class tabs -----------------------------------------------------------

  private drawClassTabs() {
    const tabW = 150
    const tabH = 32
    const gap = 10
    const totalW = CLASSES.length * tabW + (CLASSES.length - 1) * gap
    const startX = (W - totalW) / 2 + tabW / 2
    const tabY = 162

    this.tabBgs = []
    this.tabLabels = []

    CLASSES.forEach((cls, i) => {
      const x = startX + i * (tabW + gap)
      const isActive = i === this.activeClass

      const bg = this.add.rectangle(x, tabY, tabW, tabH, isActive ? 0x334155 : 0x1e293b)
        .setStrokeStyle(1, isActive ? 0x60a5fa : 0x334155)
        .setInteractive({ useHandCursor: true })

      const label = this.add.text(x, tabY, cls.label, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: isActive ? '#f8fafc' : '#94a3b8',
        fontStyle: 'bold',
      }).setOrigin(0.5)

      bg.on('pointerover', () => { if (this.activeClass !== i) bg.setFillStyle(0x263548) })
      bg.on('pointerout', () => { if (this.activeClass !== i) bg.setFillStyle(0x1e293b) })
      bg.on('pointerdown', () => {
        this.activeClass = i
        this.selected = []
        this.refreshTabs()
        this.renderGrid()
      })

      this.tabBgs.push(bg)
      this.tabLabels.push(label)
    })
  }

  private refreshTabs() {
    this.tabBgs.forEach((bg, i) => {
      const active = i === this.activeClass
      bg.setFillStyle(active ? 0x334155 : 0x1e293b)
      bg.setStrokeStyle(1, active ? 0x60a5fa : 0x334155)
    })
    this.tabLabels.forEach((label, i) => {
      label.setColor(i === this.activeClass ? '#f8fafc' : '#94a3b8')
    })
  }

  // ---- Skill grid -----------------------------------------------------------

  private getFilteredSkills(): OwnedSkill[] {
    const prefix = CLASSES[this.activeClass].prefix
    return this.skills.filter((s) => s.skillId.startsWith(prefix))
  }

  private renderGrid() {
    this.gridContainer.removeAll(true)
    this.fusionPanel.removeAll(true)

    const filtered = this.getFilteredSkills()
    const cls = CLASSES[this.activeClass]

    const cardW = 240
    const cardH = 54
    const cols = 4
    const gapX = 12
    const gapY = 8
    const totalGridW = cols * cardW + (cols - 1) * gapX
    const startX = (W - totalGridW) / 2 + cardW / 2
    const startY = 200

    filtered.forEach((owned, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const cx = startX + col * (cardW + gapX)
      const cy = startY + row * (cardH + gapY) + cardH / 2

      const def = getSkillDef(owned.skillId)
      if (!def) return

      const isSelected = this.selected.includes(idx)

      // Card background
      const cardBg = this.add.rectangle(cx, cy, cardW, cardH,
        isSelected ? 0x334155 : 0x111827
      ).setStrokeStyle(1, isSelected ? 0x60a5fa : 0x1e293b)
        .setInteractive({ useHandCursor: true })
      this.gridContainer.add(cardBg)

      // Skill name
      const nameTxt = this.add.text(cx - cardW / 2 + 10, cy - 14, def.name, {
        fontFamily: 'Arial',
        fontSize: '13px',
        color: isSelected ? '#f1f5f9' : LIGHT_TEXT,
        fontStyle: 'bold',
      }).setOrigin(0, 0)
      this.gridContainer.add(nameTxt)

      // Level stars
      const stars = this.renderStars(owned.level)
      const starTxt = this.add.text(cx - cardW / 2 + 10, cy + 6, stars, {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: cls.textColor,
      }).setOrigin(0, 0)
      this.gridContainer.add(starTxt)

      // Category badge
      const catLabel = def.category === 'attack' ? 'ATK' : 'DEF'
      const catColor = def.category === 'attack' ? '#f87171' : '#60a5fa'
      const catTxt = this.add.text(cx + cardW / 2 - 10, cy - 14, catLabel, {
        fontFamily: 'Arial',
        fontSize: '11px',
        color: catColor,
        fontStyle: 'bold',
      }).setOrigin(1, 0)
      this.gridContainer.add(catTxt)

      // Level number
      const lvlTxt = this.add.text(cx + cardW / 2 - 10, cy + 6, `Lv.${owned.level}`, {
        fontFamily: 'Arial',
        fontSize: '11px',
        color: MUTED_TEXT,
      }).setOrigin(1, 0)
      this.gridContainer.add(lvlTxt)

      // Click handler for selection
      cardBg.on('pointerdown', () => this.onSkillClick(idx))
    })

    // Draw fusion panel if 2 skills are selected
    this.renderFusionPanel()
  }

  private renderStars(level: number): string {
    let result = ''
    for (let i = 0; i < MAX_LEVEL; i++) {
      result += i < level ? '*' : '-'
    }
    return result
  }

  // ---- Skill selection logic ------------------------------------------------

  private onSkillClick(idx: number) {
    const filtered = this.getFilteredSkills()
    const clicked = filtered[idx]

    if (this.selected.includes(idx)) {
      // Deselect
      this.selected = this.selected.filter((i) => i !== idx)
    } else if (this.selected.length < 2) {
      // Can we select this? Must be same skillId and same level as first selection, and not max level
      if (clicked.level >= MAX_LEVEL) return

      if (this.selected.length === 0) {
        this.selected.push(idx)
      } else {
        const firstIdx = this.selected[0]
        const first = filtered[firstIdx]
        if (first.skillId === clicked.skillId && first.level === clicked.level) {
          this.selected.push(idx)
        } else {
          // Switch selection
          this.selected = [idx]
        }
      }
    } else {
      // Already have 2 selected, start new selection
      this.selected = [idx]
    }

    this.renderGrid()
  }

  // ---- Fusion panel ---------------------------------------------------------

  private renderFusionPanel() {
    this.fusionPanel.removeAll(true)

    if (this.selected.length !== 2) return

    const filtered = this.getFilteredSkills()
    const skill1 = filtered[this.selected[0]]
    const skill2 = filtered[this.selected[1]]

    // Validate they are the same skill at the same level
    if (skill1.skillId !== skill2.skillId || skill1.level !== skill2.level) {
      this.selected = []
      return
    }
    if (skill1.level >= MAX_LEVEL) return

    const def = getSkillDef(skill1.skillId)
    if (!def) return

    const cost = FUSION_COST[skill1.level] ?? 0
    const canAfford = this.gold >= cost
    const panelY = 590
    const panelW = 700
    const panelH = 60

    // Panel background
    const bg = this.add.rectangle(W / 2, panelY, panelW, panelH, 0x111827, 0.95)
      .setStrokeStyle(1, canAfford ? 0x60a5fa : 0x991b1b)
    this.fusionPanel.add(bg)

    // Fusion description
    const desc = `Fundir 2x ${def.name} Lv.${skill1.level}  -->  ${def.name} Lv.${skill1.level + 1}    Custo: ${cost} Gold`
    const descTxt = this.add.text(W / 2 - 130, panelY, desc, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: canAfford ? LIGHT_TEXT : '#f87171',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    this.fusionPanel.add(descTxt)

    if (canAfford) {
      // Fundir button
      const btnX = W / 2 + panelW / 2 - 70
      const btnBg = this.add.rectangle(btnX, panelY, 100, 36, BTN_GREEN)
        .setStrokeStyle(1, BTN_GREEN_STR, 0.7)
        .setInteractive({ useHandCursor: true })
      this.fusionPanel.add(btnBg)

      const btnLabel = this.add.text(btnX, panelY, 'Fundir', {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5)
      this.fusionPanel.add(btnLabel)

      btnBg.on('pointerover', () => btnBg.setFillStyle(BTN_GREEN_HOV))
      btnBg.on('pointerout', () => btnBg.setFillStyle(BTN_GREEN))
      btnBg.on('pointerdown', () => this.performFusion())
    } else {
      const warnTxt = this.add.text(W / 2 + panelW / 2 - 70, panelY, 'Gold insuficiente', {
        fontFamily: 'Arial',
        fontSize: '13px',
        color: '#f87171',
        fontStyle: 'italic',
      }).setOrigin(0.5)
      this.fusionPanel.add(warnTxt)
    }
  }

  // ---- Perform fusion -------------------------------------------------------

  private performFusion() {
    if (this.selected.length !== 2) return

    const filtered = this.getFilteredSkills()
    const skill1 = filtered[this.selected[0]]

    if (skill1.level >= MAX_LEVEL) return

    // Use PlayerDataManager to handle all fusion logic + persistence
    const success = playerData.fuseSkills(skill1.skillId, skill1.level)
    if (!success) return

    // Reload data from PlayerDataManager
    this.skills = playerData.getSkills()
    this.gold = playerData.getGold()

    // Clear selection
    this.selected = []

    // Update gold display
    this.goldText.setText(`Gold: ${this.gold}`)

    // Show success
    const def = getSkillDef(skill1.skillId)
    const name = def ? def.name : skill1.skillId
    this.showSparkleEffect()
    this.showPopup(`Fusao concluida!\n\n${name} evoluiu para Lv.${skill1.level + 1}!`)

    // Re-render grid
    this.renderGrid()
  }

  // ---- Sparkle effect -------------------------------------------------------

  private showSparkleEffect() {
    const particles: Phaser.GameObjects.Arc[] = []
    const cx = W / 2
    const cy = H / 2

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const radius = 40 + Math.random() * 60
      const px = cx + Math.cos(angle) * radius
      const py = cy + Math.sin(angle) * radius
      const size = 2 + Math.random() * 4

      const particle = this.add.circle(px, py, size, 0xfde68a)
        .setAlpha(1)
        .setDepth(150)
      particles.push(particle)

      this.tweens.add({
        targets: particle,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        y: py - 30 - Math.random() * 40,
        duration: 600 + Math.random() * 400,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      })
    }
  }

  // ---- Popup ----------------------------------------------------------------

  private showPopup(message: string) {
    this.popupOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6)
      .setInteractive()
      .setDepth(100)

    this.popupBox = this.add.rectangle(W / 2, H / 2, 420, 200, PANEL_COLOR)
      .setStrokeStyle(2, 0x60a5fa)
      .setDepth(101)

    this.popupText = this.add.text(W / 2, H / 2 - 30, message, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#f1f5f9',
      align: 'center',
      wordWrap: { width: 380 },
    }).setOrigin(0.5).setDepth(102)

    this.popupBtn = this.add.rectangle(W / 2, H / 2 + 60, 120, 36, BTN_GREEN)
      .setStrokeStyle(1, BTN_GREEN_STR)
      .setInteractive({ useHandCursor: true })
      .setDepth(102)

    this.popupBtnLabel = this.add.text(W / 2, H / 2 + 60, 'OK', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(103)

    this.popupBtn.on('pointerdown', () => this.closePopup())
  }

  private closePopup() {
    this.popupOverlay?.destroy()
    this.popupBox?.destroy()
    this.popupText?.destroy()
    this.popupBtn?.destroy()
    this.popupBtnLabel?.destroy()
    this.popupOverlay = null
    this.popupBox = null
    this.popupText = null
    this.popupBtn = null
    this.popupBtnLabel = null
  }

  // ---- Back button ----------------------------------------------------------

  private drawBackButton() {
    const y = H - 45

    const bg = this.add.rectangle(W / 2, y, 200, 42, 0x1e293b, 1)
      .setStrokeStyle(1, 0x334155, 0.7)
      .setInteractive({ useHandCursor: true })

    const label = this.add.text(W / 2, y, 'Voltar', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#94a3b8',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    bg.on('pointerover', () => { bg.setFillStyle(0x263548); label.setColor('#f1f5f9') })
    bg.on('pointerout', () => { bg.setFillStyle(0x1e293b); label.setColor('#94a3b8') })
    bg.on('pointerdown', () => this.scene.start('LobbyScene'))
  }
}
