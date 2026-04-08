import Phaser from 'phaser'
import { getDefaultDeckForRole, getRoleCards, getRoleCardsByGroup } from '../data/cardTemplates'
import type { CardGroup, TeamDeckConfig, UnitRole } from '../types'
import { GameState, GameStateManager } from '../core/GameState'

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLES: UnitRole[] = ['king', 'warrior', 'specialist', 'executor']

const ROLE_LABELS: Record<UnitRole, string> = {
  king:       '👑 Rei',
  warrior:    '🛡 Guerreiro',
  specialist: '🔮 Especialista',
  executor:   '⚔️ Executor',
}

const ROLE_PASSIVES: Record<UnitRole, string> = {
  king:       'Passiva: Proteção Real — Escudo renovado a cada turno, -15% dano recebido.',
  warrior:    'Passiva: Protetor — Aliados adjacentes ganham -15% de mitigação de dano.',
  specialist: 'Passiva: Queimação — Ataques reduzem cura inimiga em 20% por 1 turno.',
  executor:   'Passiva: Isolado — +15% de dano quando sem ninguém adjacente.',
}

const GROUPS: CardGroup[] = ['attack1', 'attack2', 'defense1', 'defense2']

const GROUP_LABELS: Record<CardGroup, string> = {
  attack1:  'Ataque Tipo 1 — dano',
  attack2:  'Ataque Tipo 2 — controle',
  defense1: 'Defesa Tipo 1 — forte',
  defense2: 'Defesa Tipo 2 — leve',
}

const GROUP_HEADER_COLOR: Record<CardGroup, number> = {
  attack1:  0x3a1a1a,
  attack2:  0x3a2a10,
  defense1: 0x0e2a3a,
  defense2: 0x12203a,
}

const CARD_SELECTED_FILL: Record<CardGroup, number> = {
  attack1:  0x2a1212,
  attack2:  0x2a1f0e,
  defense1: 0x0c1e2e,
  defense2: 0x0e1a30,
}

const CARD_SELECTED_STROKE: Record<CardGroup, number> = {
  attack1:  0xef5350,
  attack2:  0xffa726,
  defense1: 0x4fc3f7,
  defense2: 0x4fc3f7,
}

// ─── Layout (1280 × 720) ─────────────────────────────────────────────────────
//
//  y   0– 56  Header bar (title, subtitle, difficulty buttons)
//  y  56– 98  Role tabs (4 tabs)
//  y  98–118  Passive description
//  y 118–122  Divider
//  y 122–660  4 columns (one per group), each with header + 4 cards
//  y 660–720  Footer (progress, deck buttons, start button)

const W             = 1280
const SECTION_Y_START = 122
const SECTION_Y_END   = 660
const SECTION_H       = SECTION_Y_END - SECTION_Y_START          // 538
const COL_W           = Math.floor(W / 4)                        // 320
const SEC_HEADER_H    = 26
const CARD_AREA_H     = SECTION_H - SEC_HEADER_H                 // 512
const CARD_H          = Math.floor((CARD_AREA_H - 4 * 4) / 4)   // ~124
const CARD_W          = COL_W - 12                               // 308
const CARD_GAP        = 4

// ─── Scene ───────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'normal' | 'hard'

const STORAGE_KEY = 'draft_last_deck'

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy:   'Fácil',
  normal: 'Normal',
  hard:   'Difícil',
}

// ─── Tooltip target-type labels ─────────────────────────────────────────────

const TARGET_LABELS: Record<string, string> = {
  single:     'Alvo: 1 Inimigo',
  self:       'Alvo: Proprio',
  lowest_ally:'Alvo: Aliado com Menos HP',
  all_allies: 'Alvo: Todos os Aliados',
  area:       'Alvo: Area 3x3',
}

const GROUP_TYPE_LABELS: Record<CardGroup, string> = {
  attack1:  'Ataque - Dano',
  attack2:  'Ataque - Controle',
  defense1: 'Defesa - Forte',
  defense2: 'Defesa - Leve',
}

export default class DeckBuildScene extends Phaser.Scene {
  private activeRole: UnitRole = 'king'
  private difficulty: Difficulty = 'normal'
  private pveMode: boolean = false
  private npcTeam: { name: string; levelMin: number; levelMax: number; goldReward: number; xpReward: number } | null = null

  /** Per role → per group → selected card IDs (max 2) */
  private selections = new Map<UnitRole, Map<CardGroup, string[]>>()

  /** Phaser containers holding card buttons, one per role */
  private roleContainers = new Map<UnitRole, Phaser.GameObjects.Container>()

  private tabBgs   = new Map<UnitRole, Phaser.GameObjects.Rectangle>()
  private tabTexts = new Map<UnitRole, Phaser.GameObjects.Text>()
  private diffBtns = new Map<Difficulty, { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>()

  private passiveText!: Phaser.GameObjects.Text
  private progressText!: Phaser.GameObjects.Text
  private startBtn!: Phaser.GameObjects.Rectangle
  private startBtnLabel!: Phaser.GameObjects.Text

  /** Skill tooltip container shown on hover */
  private tooltip: Phaser.GameObjects.Container | null = null

  /** Deck preview text objects */
  private deckPreviewTexts: Phaser.GameObjects.Text[] = []
  private deckPowerText!: Phaser.GameObjects.Text

  constructor() {
    super('DeckBuildScene')
  }

  create(data?: { pveMode?: boolean; npcTeam?: { name: string; levelMin: number; levelMax: number; goldReward: number; xpReward: number } }) {
    GameStateManager.set(GameState.MENU)

    // Capture PvE data if coming from PvESelectScene
    this.pveMode = data?.pveMode ?? false
    this.npcTeam = data?.npcTeam ?? null

    // Auto-set difficulty based on NPC team level
    if (this.pveMode && this.npcTeam) {
      if (this.npcTeam.levelMax <= 10) this.difficulty = 'easy'
      else if (this.npcTeam.levelMax <= 50) this.difficulty = 'normal'
      else this.difficulty = 'hard'
    }

    // Init empty selections
    ROLES.forEach((role) => {
      const map = new Map<CardGroup, string[]>()
      GROUPS.forEach((g) => map.set(g, []))
      this.selections.set(role, map)
    })

    this.drawBackground()
    this.drawHeader()
    this.drawTabs()
    this.drawPassiveLine()
    ROLES.forEach((role) => this.buildRoleContainer(role))
    this.drawFooter()

    // Restore last deck from localStorage if available
    if (this.loadFromStorage()) {
      ROLES.forEach((role) => this.refreshRoleVisuals(role))
      this.updateFooter()
    }

    this.showRole('king')

    // ── Keyboard shortcuts ───────────────────────────────────────────────────
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      // Number keys 1-4: quick-select card in each group for current role
      if (event.key >= '1' && event.key <= '4') {
        const cardIndex = parseInt(event.key, 10) - 1
        this.quickSelectCard(cardIndex)
      }

      // Tab: cycle to next role
      if (event.key === 'Tab') {
        event.preventDefault()
        const currentIdx = ROLES.indexOf(this.activeRole)
        const nextIdx = (currentIdx + 1) % ROLES.length
        this.showRole(ROLES[nextIdx])
      }

      // Enter: start battle if complete
      if (event.key === 'Enter') {
        if (this.isAllComplete()) this.startBattle()
      }
    })
  }

  /** Quick-select: toggle the (cardIndex+1)-th card in each group that still needs picks */
  private quickSelectCard(cardIndex: number) {
    const role = this.activeRole
    const container = this.roleContainers.get(role)
    if (!container) return

    // Find the first group that is not yet full (< 2 selected), or fall back to the first group
    let targetGroup: CardGroup | null = null
    for (const group of GROUPS) {
      const sel = this.selections.get(role)?.get(group) ?? []
      if (sel.length < 2) { targetGroup = group; break }
    }
    if (!targetGroup) targetGroup = GROUPS[0]

    const groupCards = getRoleCardsByGroup(role, targetGroup)
    if (cardIndex >= groupCards.length) return

    const card = groupCards[cardIndex]
    const counterTxt = container.getByName(`counter_${role}_${targetGroup}`) as Phaser.GameObjects.Text | null
    if (counterTxt) this.toggleCard(role, targetGroup, card.id, container, counterTxt)
  }

  // ─── Background ────────────────────────────────────────────────────────────

  private drawBackground() {
    this.add.rectangle(W / 2, 360, W, 720, 0x080a12)
    for (let i = 1; i < 4; i++) {
      this.add.rectangle(i * COL_W, 360, 1, 720, 0x3d2e14, 0.15)
    }
    this.add.rectangle(W / 2, SECTION_Y_START, W, 1, 0x3d2e14, 0.3)
    this.add.rectangle(W / 2, SECTION_Y_END,   W, 1, 0x3d2e14, 0.3)
  }

  private drawHeader() {
    this.add.rectangle(W / 2, 28, W, 56, 0x0e1118)

    // Title + subtitle (left-aligned to leave room for controls)
    this.add.text(200, 18, 'DRAFT \u2014 Montagem de Deck', {
      fontFamily: 'Arial', fontSize: '22px', color: '#f0c850', fontStyle: 'bold',
    }).setOrigin(0.5)
    this.add.text(200, 41, 'Selecione 2 cartas por grupo para cada unidade.', {
      fontFamily: 'Arial', fontSize: '11px', color: '#7a7062',
    }).setOrigin(0.5)

    // ── Difficulty buttons ───────────────────────────────────────────────────
    const diffs: Difficulty[] = ['easy', 'normal', 'hard']
    const dBtnW = 82
    const dStartX = W - 3 * (dBtnW + 6) - 10 + dBtnW / 2
    const dBtnColors: Record<Difficulty, number> = { easy: 0x1b3a1e, normal: 0x12203a, hard: 0x3a1515 }
    const dBtnStroke: Record<Difficulty, number> = { easy: 0x4caf50, normal: 0x4fc3f7, hard: 0xef5350 }

    this.add.text(dStartX - dBtnW / 2 - 12, 18, 'DIFICULDADE', {
      fontFamily: 'Arial', fontSize: '9px', color: '#7a7062', fontStyle: 'bold',
    }).setOrigin(1, 0.5)

    diffs.forEach((d, i) => {
      const x = dStartX + i * (dBtnW + 6)
      const isActive = d === this.difficulty
      const bg = this.add.rectangle(x, 28, dBtnW, 36, isActive ? dBtnColors[d] : 0x141a24)
        .setStrokeStyle(2, isActive ? dBtnStroke[d] : 0x3d2e14, isActive ? 1 : 0.3)
        .setInteractive({ useHandCursor: true })
      const label = this.add.text(x, 28, DIFFICULTY_LABELS[d], {
        fontFamily: 'Arial', fontSize: '13px',
        color: isActive ? '#e8e0d0' : '#7a7062', fontStyle: 'bold',
      }).setOrigin(0.5)

      bg.on('pointerover', () => { if (this.difficulty !== d) bg.setFillStyle(0x1a2230) })
      bg.on('pointerout',  () => { if (this.difficulty !== d) bg.setFillStyle(0x141a24) })
      bg.on('pointerdown', () => this.setDifficulty(d))

      this.diffBtns.set(d, { bg, label })
    })
  }

  private drawTabs() {
    this.add.rectangle(W / 2, 77, W, 42, 0x0a0e16)

    const tabW = 294
    const gap  = 6
    const total = ROLES.length * tabW + (ROLES.length - 1) * gap
    let x = (W - total) / 2 + tabW / 2

    ROLES.forEach((role) => {
      const bg = this.add
        .rectangle(x, 77, tabW, 36, 0x141a24)
        .setStrokeStyle(1, 0x3d2e14, 0.3)
        .setInteractive({ useHandCursor: true })

      const txt = this.add.text(x, 77, ROLE_LABELS[role], {
        fontFamily: 'Arial', fontSize: '15px', color: '#7a7062', fontStyle: 'bold',
      }).setOrigin(0.5)

      bg.on('pointerover', () => { if (this.activeRole !== role) bg.setFillStyle(0x1a2230) })
      bg.on('pointerout',  () => { if (this.activeRole !== role) bg.setFillStyle(0x141a24) })
      bg.on('pointerdown', () => this.showRole(role))

      this.tabBgs.set(role, bg)
      this.tabTexts.set(role, txt)
      x += tabW + gap
    })
  }

  private drawPassiveLine() {
    this.add.rectangle(W / 2, 108, W, 28, 0x0e1118)
    this.passiveText = this.add.text(W / 2, 108, '', {
      fontFamily: 'Arial', fontSize: '12px', color: '#4fc3f7',
    }).setOrigin(0.5)
  }

  // ─── Card sections ─────────────────────────────────────────────────────────

  private buildRoleContainer(role: UnitRole) {
    const container = this.add.container(0, 0)

    GROUPS.forEach((group, colIdx) => {
      const sx = colIdx * COL_W + 6       // left edge of this column
      this.buildGroupSection(container, role, group, sx)
    })

    container.setVisible(false)
    this.roleContainers.set(role, container)
  }

  private buildGroupSection(
    container: Phaser.GameObjects.Container,
    role: UnitRole,
    group: CardGroup,
    sx: number,
  ) {
    const cards    = getRoleCards(role).filter((c) => c.group === group)
    const hdrColor = GROUP_HEADER_COLOR[group]
    const sy       = SECTION_Y_START

    // Column bg (subtle)
    const colBg = this.add.rectangle(
      sx + CARD_W / 2, sy + SECTION_H / 2, CARD_W, SECTION_H, 0x0a0e16
    )
    container.add(colBg)

    // Section header bar
    const hdrBg = this.add.rectangle(
      sx + CARD_W / 2, sy + SEC_HEADER_H / 2, CARD_W, SEC_HEADER_H, hdrColor, 0.85
    )
    container.add(hdrBg)

    const hdrTxt = this.add.text(sx + 8, sy + SEC_HEADER_H / 2, GROUP_LABELS[group], {
      fontFamily: 'Arial', fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5)
    container.add(hdrTxt)

    // Counter top-right
    const counterTxt = this.add.text(sx + CARD_W - 6, sy + SEC_HEADER_H / 2, '0 / 2', {
      fontFamily: 'Arial', fontSize: '12px', color: '#c9a84c', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setName(`counter_${role}_${group}`)
    container.add(counterTxt)

    // Cards
    const cardsStartY = sy + SEC_HEADER_H + CARD_GAP
    cards.forEach((card, i) => {
      const cy = cardsStartY + i * (CARD_H + CARD_GAP) + CARD_H / 2
      const cx = sx + CARD_W / 2
      const isAtk = group.startsWith('attack')

      const cardBg = this.add
        .rectangle(cx, cy, CARD_W, CARD_H, 0x12161f)
        .setStrokeStyle(1, 0x3d2e14, 0.2)
        .setInteractive({ useHandCursor: true })
        .setName(`cardbg_${card.id}`)
      container.add(cardBg)

      // Card name
      const nameTxt = this.add.text(sx + 8, cy - CARD_H / 2 + 9, card.name, {
        fontFamily: 'Arial', fontSize: '12px', color: '#e8e0d0', fontStyle: 'bold',
      }).setOrigin(0, 0)
      container.add(nameTxt)

      // Effect badge top-right
      const effectColor = isAtk ? '#ef5350' : '#4fc3f7'
      const effectLabel = card.power > 0 ? `${card.effect.toUpperCase()} ${card.power}` : card.effect.toUpperCase()
      const effectTxt = this.add.text(sx + CARD_W - 6, cy - CARD_H / 2 + 9, effectLabel, {
        fontFamily: 'Arial', fontSize: '10px', color: effectColor, fontStyle: 'bold',
      }).setOrigin(1, 0)
      container.add(effectTxt)

      // Description — wraps inside the card
      const descTxt = this.add.text(sx + 8, cy - CARD_H / 2 + 26, card.shortDescription, {
        fontFamily: 'Arial', fontSize: '10px', color: '#7a7062',
        wordWrap: { width: CARD_W - 16 },
      }).setOrigin(0, 0)
      container.add(descTxt)

      // Interactions
      cardBg.on('pointerover', () => {
        if (!this.isCardSelected(role, group, card.id)) cardBg.setFillStyle(0x1a2230)
        this.showTooltip(card, cx, cy - CARD_H / 2)
      })
      cardBg.on('pointerout', () => {
        if (!this.isCardSelected(role, group, card.id)) cardBg.setFillStyle(0x12161f)
        this.hideTooltip()
      })
      cardBg.on('pointerdown', () => this.toggleCard(role, group, card.id, container, counterTxt))
    })
  }

  // ─── Tooltip ────────────────────────────────────────────────────────────────

  private showTooltip(card: import('../types').CardData, worldX: number, worldY: number) {
    this.hideTooltip()

    const TOOLTIP_W = 280
    const PAD = 10
    const typeLabel = GROUP_TYPE_LABELS[card.group] ?? card.category
    const targetLabel = TARGET_LABELS[card.targetType] ?? card.targetType

    const nameText = this.add.text(PAD, PAD, card.name, {
      fontFamily: 'Arial', fontSize: '15px', color: '#f0c850', fontStyle: 'bold',
      wordWrap: { width: TOOLTIP_W - PAD * 2 },
    })

    const typeText = this.add.text(PAD, nameText.y + nameText.height + 4, typeLabel, {
      fontFamily: 'Arial', fontSize: '11px', color: '#4fc3f7', fontStyle: 'bold',
    })

    const powerStr = card.power > 0 ? `Poder: ${card.power}` : 'Poder: --'
    const powerText = this.add.text(TOOLTIP_W - PAD, typeText.y, powerStr, {
      fontFamily: 'Arial', fontSize: '11px', color: '#c9a84c', fontStyle: 'bold',
    }).setOrigin(1, 0)

    const dividerY = typeText.y + typeText.height + 6
    const divider = this.add.rectangle(TOOLTIP_W / 2, dividerY, TOOLTIP_W - PAD * 2, 1, 0x3d2e14, 0.5)

    const descText = this.add.text(PAD, dividerY + 6, card.shortDescription, {
      fontFamily: 'Arial', fontSize: '11px', color: '#e8e0d0',
      wordWrap: { width: TOOLTIP_W - PAD * 2 },
    })

    const targetText = this.add.text(PAD, descText.y + descText.height + 6, targetLabel, {
      fontFamily: 'Arial', fontSize: '11px', color: '#c9a84c', fontStyle: 'bold',
    })

    const totalH = targetText.y + targetText.height + PAD
    const bg = this.add.rectangle(TOOLTIP_W / 2, totalH / 2, TOOLTIP_W, totalH, 0x12161f)
      .setStrokeStyle(2, 0x3d2e14)

    const container = this.add.container(0, 0, [bg, nameText, typeText, powerText, divider, descText, targetText])
    container.setDepth(1000)

    // Position: prefer above the card, fall back to below if off-screen
    let tx = worldX - TOOLTIP_W / 2
    let ty = worldY - totalH - 8
    if (tx < 4) tx = 4
    if (tx + TOOLTIP_W > W - 4) tx = W - TOOLTIP_W - 4
    if (ty < 4) ty = worldY + CARD_H / 2 + 8
    container.setPosition(tx, ty)

    this.tooltip = container
  }

  private hideTooltip() {
    if (this.tooltip) {
      this.tooltip.destroy()
      this.tooltip = null
    }
  }

  // ─── Selection logic ───────────────────────────────────────────────────────

  private isCardSelected(role: UnitRole, group: CardGroup, cardId: string): boolean {
    return this.selections.get(role)?.get(group)?.includes(cardId) ?? false
  }

  private toggleCard(
    role: UnitRole,
    group: CardGroup,
    cardId: string,
    container: Phaser.GameObjects.Container,
    counterTxt: Phaser.GameObjects.Text,
  ) {
    const sel = this.selections.get(role)?.get(group)
    if (!sel) return

    const idx = sel.indexOf(cardId)
    if (idx !== -1) {
      sel.splice(idx, 1)
    } else {
      if (sel.length >= 2) sel.shift() // Replace oldest when already full
      sel.push(cardId)
    }

    // Refresh all card backgrounds for this group
    getRoleCards(role)
      .filter((c) => c.group === group)
      .forEach((c) => {
        const bg = container.getByName(`cardbg_${c.id}`) as Phaser.GameObjects.Rectangle | null
        if (!bg) return
        const selected = sel.includes(c.id)
        if (selected) {
          bg.setFillStyle(CARD_SELECTED_FILL[group])
          bg.setStrokeStyle(2, CARD_SELECTED_STROKE[group], 1)
        } else {
          bg.setFillStyle(0x12161f)
          bg.setStrokeStyle(1, 0x3d2e14, 0.2)
        }
      })

    const done = sel.length === 2
    counterTxt.setText(`${sel.length} / 2`).setColor(done ? '#4caf50' : '#c9a84c')
    this.updateFooter()
  }

  // ─── Tab switching ─────────────────────────────────────────────────────────

  private showRole(role: UnitRole) {
    this.roleContainers.forEach((c, r) => c.setVisible(r === role))

    this.tabBgs.forEach((bg, r) => {
      const active = r === role
      bg.setFillStyle(active ? 0x1a2230 : 0x141a24)
      bg.setStrokeStyle(active ? 2 : 1, active ? 0xf0c850 : 0x3d2e14, active ? 0.8 : 0.3)
    })
    this.tabTexts.forEach((t, r) => t.setColor(r === role ? '#f0c850' : '#7a7062'))

    this.activeRole = role
    this.passiveText.setText(ROLE_PASSIVES[role])

    // Refresh card backgrounds and counters for the newly visible container
    const container = this.roleContainers.get(role)
    if (container) {
      GROUPS.forEach((group) => {
        const sel = this.selections.get(role)?.get(group) ?? []
        const cTxt = container.getByName(`counter_${role}_${group}`) as Phaser.GameObjects.Text | null
        if (cTxt) cTxt.setText(`${sel.length} / 2`).setColor(sel.length === 2 ? '#4caf50' : '#c9a84c')

        getRoleCards(role)
          .filter((c) => c.group === group)
          .forEach((c) => {
            const bg = container.getByName(`cardbg_${c.id}`) as Phaser.GameObjects.Rectangle | null
            if (!bg) return
            const selected = sel.includes(c.id)
            if (selected) {
              bg.setFillStyle(CARD_SELECTED_FILL[group])
              bg.setStrokeStyle(2, CARD_SELECTED_STROKE[group], 1)
            } else {
              bg.setFillStyle(0x12161f)
              bg.setStrokeStyle(1, 0x3d2e14, 0.2)
            }
          })
      })
    }

    // Refresh deck preview for the newly active role
    if (this.deckPreviewTexts.length > 0) this.updateDeckPreview()
  }

  // ─── Footer ────────────────────────────────────────────────────────────────

  private drawFooter() {
    // Expand footer area: 660-720 original -> now we use a deck preview row at 660-700, buttons at 700-740
    // Instead, let's use the existing space more cleverly: deck preview on the left half, buttons on the right
    this.add.rectangle(W / 2, 690, W, 60, 0x0a0e16)
    this.add.rectangle(W / 2, 660, W, 1, 0x3d2e14, 0.3)

    // Progress counter (top-left of footer)
    this.progressText = this.add.text(16, 670, '', {
      fontFamily: 'Arial', fontSize: '11px', color: '#7a7062',
    }).setOrigin(0, 0.5)

    // ── Deck preview (below progress text) ───────────────────────────────────
    const previewY = 686
    this.add.text(16, previewY, 'Deck Atual:', {
      fontFamily: 'Arial', fontSize: '10px', color: '#7a7062', fontStyle: 'bold',
    }).setOrigin(0, 0)

    // Attack slots (4)
    const atkLabel = this.add.text(90, previewY, 'ATK:', {
      fontFamily: 'Arial', fontSize: '10px', color: '#ef5350', fontStyle: 'bold',
    }).setOrigin(0, 0)
    const atkSlots: Phaser.GameObjects.Text[] = []
    for (let i = 0; i < 4; i++) {
      const t = this.add.text(90 + atkLabel.width + 4 + i * 68, previewY, '---', {
        fontFamily: 'Arial', fontSize: '9px', color: '#7a7062',
      }).setOrigin(0, 0)
      atkSlots.push(t)
    }

    // Defense slots (4)
    const defStartX = 90 + atkLabel.width + 4 + 4 * 68 + 8
    const defLabel = this.add.text(defStartX, previewY, 'DEF:', {
      fontFamily: 'Arial', fontSize: '10px', color: '#4fc3f7', fontStyle: 'bold',
    }).setOrigin(0, 0)
    const defSlots: Phaser.GameObjects.Text[] = []
    for (let i = 0; i < 4; i++) {
      const t = this.add.text(defStartX + defLabel.width + 4 + i * 68, previewY, '---', {
        fontFamily: 'Arial', fontSize: '9px', color: '#7a7062',
      }).setOrigin(0, 0)
      defSlots.push(t)
    }

    this.deckPreviewTexts = [...atkSlots, ...defSlots]

    // Total power text (at the end of the row)
    this.deckPowerText = this.add.text(defStartX + defLabel.width + 4 + 4 * 68 + 12, previewY, 'Poder: 0', {
      fontFamily: 'Arial', fontSize: '10px', color: '#c9a84c', fontStyle: 'bold',
    }).setOrigin(0, 0)

    // ── Shortcut hint (very bottom of footer) ────────────────────────────────
    this.add.text(16, 706, 'Atalhos: 1-4 selecionar, Tab trocar classe, Enter jogar', {
      fontFamily: 'Arial', fontSize: '9px', color: '#7a7062',
    }).setOrigin(0, 0.5)

    // ── Deck utility buttons ─────────────────────────────────────────────────
    const btnY = 690
    const mkBtn = (x: number, label: string, stroke: number, onClick: () => void) => {
      const bg = this.add.rectangle(x, btnY, 120, 30, 0x141a24)
        .setStrokeStyle(1, stroke, 0.5)
        .setInteractive({ useHandCursor: true })
      const txt = this.add.text(x, btnY, label, {
        fontFamily: 'Arial', fontSize: '11px', color: '#7a7062', fontStyle: 'bold',
      }).setOrigin(0.5)
      bg.on('pointerover', () => { bg.setFillStyle(0x1a2230); txt.setColor('#e8e0d0') })
      bg.on('pointerout',  () => { bg.setFillStyle(0x141a24); txt.setColor('#7a7062') })
      bg.on('pointerdown', onClick)
    }

    mkBtn(W - 460, 'Aleatorio', 0x4fc3f7, () => this.randomizeDeck())
    mkBtn(W - 330, 'Padrao',    0xc9a84c, () => this.fillDefaultDeck())
    mkBtn(W - 200, 'Restaurar', 0xffa726, () => {
      if (this.loadFromStorage()) {
        ROLES.forEach((role) => this.refreshRoleVisuals(role))
        this.updateFooter()
        this.showRole(this.activeRole)
      }
    })

    // ── Start button (right) ─────────────────────────────────────────────────
    this.startBtn = this.add
      .rectangle(W - 70, btnY, 120, 34, 0x141a24)
      .setStrokeStyle(2, 0x3d2e14, 0.3)
      .setInteractive({ useHandCursor: true })

    this.startBtnLabel = this.add.text(W - 70, btnY, 'Iniciar', {
      fontFamily: 'Arial', fontSize: '15px', color: '#7a7062', fontStyle: 'bold',
    }).setOrigin(0.5)

    this.startBtn.on('pointerover', () => {
      if (this.isAllComplete()) this.startBtn.setFillStyle(0x1b3a1e)
    })
    this.startBtn.on('pointerout', () => {
      this.startBtn.setFillStyle(this.isAllComplete() ? 0x162d1a : 0x141a24)
    })
    this.startBtn.on('pointerdown', () => {
      if (this.isAllComplete()) this.startBattle()
    })

    this.updateFooter()
  }

  private updateFooter() {
    const completedCount = ROLES.filter((role) =>
      GROUPS.every((g) => (this.selections.get(role)?.get(g)?.length ?? 0) === 2)
    ).length

    this.progressText.setText(`Unidades prontas: ${completedCount} / 4  |  Selecione 2 cartas por coluna para cada unidade`)

    const allDone = completedCount === 4
    this.startBtn.setFillStyle(allDone ? 0x162d1a : 0x141a24)
    this.startBtn.setStrokeStyle(2, allDone ? 0x4caf50 : 0x3d2e14, allDone ? 0.9 : 0.3)
    this.startBtnLabel.setColor(allDone ? '#4caf50' : '#7a7062')

    // Colored checkmarks on tabs
    ROLES.forEach((role) => {
      const done = GROUPS.every((g) => (this.selections.get(role)?.get(g)?.length ?? 0) === 2)
      const tabTxt = this.tabTexts.get(role)
      if (!tabTxt) return
      tabTxt.setText(done ? `${ROLE_LABELS[role]} \u2713` : ROLE_LABELS[role])
      if (this.activeRole !== role) tabTxt.setColor(done ? '#4caf50' : '#7a7062')
    })

    // Update deck preview for active role
    this.updateDeckPreview()
  }

  private updateDeckPreview() {
    const role = this.activeRole
    const allCards = getRoleCards(role)
    const atkIds = [...(this.selections.get(role)?.get('attack1') ?? []), ...(this.selections.get(role)?.get('attack2') ?? [])]
    const defIds = [...(this.selections.get(role)?.get('defense1') ?? []), ...(this.selections.get(role)?.get('defense2') ?? [])]

    let totalPower = 0

    // Update attack slots (indices 0-3)
    for (let i = 0; i < 4; i++) {
      const txt = this.deckPreviewTexts[i]
      if (!txt) continue
      if (i < atkIds.length) {
        const card = allCards.find((c) => c.id === atkIds[i])
        txt.setText(card ? this.truncateName(card.name, 10) : '---')
        txt.setColor(card ? '#ef5350' : '#7a7062')
        if (card) totalPower += card.power
      } else {
        txt.setText('---').setColor('#7a7062')
      }
    }

    // Update defense slots (indices 4-7)
    for (let i = 0; i < 4; i++) {
      const txt = this.deckPreviewTexts[4 + i]
      if (!txt) continue
      if (i < defIds.length) {
        const card = allCards.find((c) => c.id === defIds[i])
        txt.setText(card ? this.truncateName(card.name, 10) : '---')
        txt.setColor(card ? '#4fc3f7' : '#7a7062')
        if (card) totalPower += card.power
      } else {
        txt.setText('---').setColor('#7a7062')
      }
    }

    if (this.deckPowerText) {
      this.deckPowerText.setText(`Poder: ${totalPower}`)
    }
  }

  private truncateName(name: string, maxLen: number): string {
    return name.length > maxLen ? name.substring(0, maxLen - 1) + '..' : name
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private isAllComplete(): boolean {
    return ROLES.every((role) =>
      GROUPS.every((g) => (this.selections.get(role)?.get(g)?.length ?? 0) === 2)
    )
  }

  private setDifficulty(d: Difficulty) {
    this.difficulty = d
    const colors: Record<Difficulty, { fill: number; stroke: number }> = {
      easy:   { fill: 0x1b3a1e, stroke: 0x4caf50 },
      normal: { fill: 0x12203a, stroke: 0x4fc3f7 },
      hard:   { fill: 0x3a1515, stroke: 0xef5350 },
    }
    this.diffBtns.forEach(({ bg, label }, key) => {
      const active = key === d
      bg.setFillStyle(active ? colors[key].fill : 0x141a24)
      bg.setStrokeStyle(2, active ? colors[key].stroke : 0x3d2e14, active ? 1 : 0.3)
      label.setColor(active ? '#e8e0d0' : '#7a7062')
    })
  }

  private randomizeDeck() {
    ROLES.forEach((role) => {
      GROUPS.forEach((group) => {
        const cards = getRoleCardsByGroup(role, group)
        const shuffled = [...cards].sort(() => Math.random() - 0.5)
        this.selections.get(role)?.set(group, shuffled.slice(0, 2).map((c) => c.id))
      })
    })
    ROLES.forEach((role) => this.refreshRoleVisuals(role))
    this.showRole(this.activeRole)
    this.updateFooter()
  }

  private fillDefaultDeck() {
    ROLES.forEach((role) => {
      const def = getDefaultDeckForRole(role)
      const g1 = def.attackCards.slice(0, 2)
      const g2 = def.attackCards.slice(2, 4)
      const g3 = def.defenseCards.slice(0, 2)
      const g4 = def.defenseCards.slice(2, 4)
      this.selections.get(role)?.set('attack1',  g1)
      this.selections.get(role)?.set('attack2',  g2)
      this.selections.get(role)?.set('defense1', g3)
      this.selections.get(role)?.set('defense2', g4)
    })
    ROLES.forEach((role) => this.refreshRoleVisuals(role))
    this.showRole(this.activeRole)
    this.updateFooter()
  }

  /** Re-applies card highlight + counter state for a role without switching tabs. */
  private refreshRoleVisuals(role: UnitRole) {
    const container = this.roleContainers.get(role)
    if (!container) return
    GROUPS.forEach((group) => {
      const sel = this.selections.get(role)?.get(group) ?? []
      const cTxt = container.getByName(`counter_${role}_${group}`) as Phaser.GameObjects.Text | null
      if (cTxt) cTxt.setText(`${sel.length} / 2`).setColor(sel.length === 2 ? '#4caf50' : '#c9a84c')
      getRoleCards(role).filter((c) => c.group === group).forEach((c) => {
        const bg = container.getByName(`cardbg_${c.id}`) as Phaser.GameObjects.Rectangle | null
        if (!bg) return
        const selected = sel.includes(c.id)
        bg.setFillStyle(selected ? CARD_SELECTED_FILL[group] : 0x12161f)
        bg.setStrokeStyle(selected ? 2 : 1, selected ? CARD_SELECTED_STROKE[group] : 0x3d2e14, selected ? 1 : 0.2)
      })
    })
  }

  // ─── Persistence ───────────────────────────────────────────────────────────

  private saveToStorage() {
    try {
      const data: Record<string, Record<string, string[]>> = {}
      ROLES.forEach((role) => {
        data[role] = {}
        GROUPS.forEach((g) => { data[role][g] = this.selections.get(role)?.get(g) ?? [] })
      })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch { /* ignore — private browsing or quota exceeded */ }
  }

  private loadFromStorage(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const data = JSON.parse(raw) as Record<string, Record<string, string[]>>
      ROLES.forEach((role) => {
        GROUPS.forEach((g) => {
          const ids = data[role]?.[g]
          if (!Array.isArray(ids)) return
          const validCards = getRoleCardsByGroup(role, g as CardGroup)
          const validIds = ids.filter((id) => validCards.some((c) => c.id === id)).slice(0, 2)
          this.selections.get(role)?.set(g as CardGroup, validIds)
        })
      })
      return true
    } catch { return false }
  }

  // ─── Battle start ──────────────────────────────────────────────────────────

  private startBattle() {
    this.saveToStorage()
    const deckConfig: TeamDeckConfig = {
      king:       this.buildUnitDeck('king'),
      warrior:    this.buildUnitDeck('warrior'),
      specialist: this.buildUnitDeck('specialist'),
      executor:   this.buildUnitDeck('executor'),
    }
    this.scene.start('BattleScene', {
      deckConfig,
      difficulty: this.difficulty,
      pveMode: this.pveMode,
      npcTeam: this.npcTeam,
    })
  }

  private buildUnitDeck(role: UnitRole) {
    const sel = this.selections.get(role)!
    return {
      attackCards:  [...(sel.get('attack1') ?? []), ...(sel.get('attack2') ?? [])],
      defenseCards: [...(sel.get('defense1') ?? []), ...(sel.get('defense2') ?? [])],
    }
  }
}
