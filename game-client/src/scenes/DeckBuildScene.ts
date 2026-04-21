import Phaser from 'phaser'
import { getDefaultDeckForRole, getRoleCards, getRoleCardsByGroup } from '../data/cardTemplates'
import type { CardGroup, TeamDeckConfig, UnitRole } from '../types'
import { GameState, GameStateManager } from '../core/GameState'
import { UI } from '../utils/UIComponents'
import { playerData } from '../utils/PlayerDataManager'
import {
  surface, border, accent, fg, state,
  fontFamily, typeScale, radii,
  colors as C2,
} from '../utils/DesignTokens'
import { getClassSigilKey } from '../utils/AssetPaths'

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLES: UnitRole[] = ['king', 'warrior', 'specialist', 'executor']

const ROLE_LABELS: Record<UnitRole, string> = {
  king:       'Rei',
  warrior:    'Guerreiro',
  specialist: 'Especialista',
  executor:   'Executor',
}

const ROLE_CLASS_COLOR: Record<UnitRole, number> = {
  king:       C2.class.king,
  warrior:    C2.class.warrior,
  specialist: C2.class.specialist,
  executor:   C2.class.executor,
}

const ROLE_PASSIVES: Record<UnitRole, string> = {
  king:       'Passiva: Proteção Real — Escudo renovado a cada turno, -15% dano recebido.',
  warrior:    'Passiva: Protetor — Aliados adjacentes ganham -15% de mitigação de dano.',
  specialist: 'Passiva: Queimação — Ataques reduzem cura inimiga em 20% por 1 turno.',
  executor:   'Passiva: Isolado — +15% de dano quando sem ninguém adjacente.',
}

const GROUPS: CardGroup[] = ['attack1', 'attack2', 'defense1', 'defense2']

const GROUP_LABELS: Record<CardGroup, string> = {
  attack1:  'ATAQUE · DANO',
  attack2:  'ATAQUE · CONTROLE',
  defense1: 'DEFESA · FORTE',
  defense2: 'DEFESA · LEVE',
}

// Header tint by group — translucent wash over the column header bar.
const GROUP_HEADER_TINT: Record<CardGroup, number> = {
  attack1:  state.error,         // crimson for damage
  attack2:  accent.hot,          // amber for control
  defense1: state.info,          // blue for strong defense
  defense2: state.success,       // green for light defense
}

// ─── Layout (1280 × 720) ─────────────────────────────────────────────────────
//
//  y   0– 56  Header bar (title, subtitle, difficulty buttons)
//  y  56– 98  Role tabs (4 tabs)
//  y  98–118  Passive description
//  y 118–122  Divider
//  y 122–660  4 columns (one per group), each with header + 4 cards
//             in a 2x2 grid of canonical 120x160 vertical skill cards
//  y 660–720  Footer (progress, deck buttons, start button)

const W             = 1280
const SECTION_Y_START = 122
const SECTION_Y_END   = 660
const SECTION_H       = SECTION_Y_END - SECTION_Y_START          // 538
const COL_W           = Math.floor(W / 4)                        // 320
const SEC_HEADER_H    = 28

// Canonical vertical skill card — INTEGRATION_SPEC §2 / Print 15
const CARD_W   = 120
const CARD_H   = 160
const CARD_GAP = 10
// 2 cols × 2 rows inside each group column. Total grid width = 250, height = 330.
const CARDS_PER_ROW = 2

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
  private startBtnSetDisabled: ((v: boolean) => void) | null = null

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
    UI.background(this)
    UI.particles(this, 10)
    // Subtle column dividers
    for (let i = 1; i < 4; i++) {
      this.add.rectangle(i * COL_W, 360, 1, 720, border.subtle, 0.35)
    }
    this.add.rectangle(W / 2, SECTION_Y_START, W, 1, border.default, 0.4)
    this.add.rectangle(W / 2, SECTION_Y_END,   W, 1, border.default, 0.4)
  }

  private drawHeader() {
    // Top band — surface.panel with accent.primary thin rule underneath
    this.add.rectangle(W / 2, 28, W, 56, surface.panel)
    this.add.rectangle(W / 2, 56, W, 1, border.subtle)

    // Title (Cinzel h2) left-aligned; subtitle (Cormorant italic small)
    this.add.text(24, 18, 'MONTAGEM DE DECK', {
      fontFamily: fontFamily.display, fontSize: typeScale.h2,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(3)
    this.add.text(24, 41, 'Escolha 2 cartas por grupo para cada classe.', {
      fontFamily: fontFamily.serif, fontSize: typeScale.small,
      color: fg.tertiaryHex, fontStyle: 'italic',
    }).setOrigin(0, 0.5)

    // ── Difficulty buttons ───────────────────────────────────────────────────
    const diffs: Difficulty[] = ['easy', 'normal', 'hard']
    const dBtnW = 92
    const dStartX = W - 3 * (dBtnW + 8) - 16 + dBtnW / 2
    const dBtnActive: Record<Difficulty, number> = {
      easy:   state.success,
      normal: state.info,
      hard:   state.error,
    }

    this.add.text(dStartX - dBtnW / 2 - 16, 28, 'DIFICULDADE', {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '700',
    }).setOrigin(1, 0.5).setLetterSpacing(1.6)

    diffs.forEach((d, i) => {
      const x = dStartX + i * (dBtnW + 8)
      const isActive = d === this.difficulty
      const bg = this.add.rectangle(x, 28, dBtnW, 34,
        isActive ? surface.raised : surface.panel, 1)
        .setStrokeStyle(isActive ? 2 : 1,
          isActive ? dBtnActive[d] : border.default,
          isActive ? 1 : 0.7)
        .setInteractive({ useHandCursor: true })
      const label = this.add.text(x, 28, DIFFICULTY_LABELS[d], {
        fontFamily: fontFamily.body, fontSize: typeScale.small,
        color: isActive
          ? '#' + dBtnActive[d].toString(16).padStart(6, '0')
          : fg.secondaryHex,
        fontStyle: '700',
      }).setOrigin(0.5)

      bg.on('pointerover', () => { if (this.difficulty !== d) bg.setFillStyle(surface.raised) })
      bg.on('pointerout',  () => { if (this.difficulty !== d) bg.setFillStyle(surface.panel) })
      bg.on('pointerdown', () => this.setDifficulty(d))

      this.diffBtns.set(d, { bg, label })
    })
  }

  private drawTabs() {
    this.add.rectangle(W / 2, 77, W, 42, surface.deepest)

    const tabW = 280
    const gap  = 8
    const total = ROLES.length * tabW + (ROLES.length - 1) * gap
    let x = (W - total) / 2 + tabW / 2

    ROLES.forEach((role) => {
      const classColor = ROLE_CLASS_COLOR[role]
      const bg = this.add
        .rectangle(x, 77, tabW, 34, surface.panel, 1)
        .setStrokeStyle(1, border.default, 0.7)
        .setInteractive({ useHandCursor: true })

      // Class sigil 18×18 to the left of the label — tinted class color
      const sigilX = x - tabW / 2 + 18
      const sigil = this.add.image(sigilX, 77, getClassSigilKey(role))
        .setDisplaySize(18, 18)
        .setTintFill(classColor)
        .setAlpha(0.85)

      const txt = this.add.text(sigilX + 16, 77, ROLE_LABELS[role], {
        fontFamily: fontFamily.serif, fontSize: typeScale.h3,
        color: fg.secondaryHex, fontStyle: '600',
      }).setOrigin(0, 0.5)

      bg.on('pointerover', () => { if (this.activeRole !== role) bg.setFillStyle(surface.raised) })
      bg.on('pointerout',  () => { if (this.activeRole !== role) bg.setFillStyle(surface.panel) })
      bg.on('pointerdown', () => this.showRole(role))

      this.tabBgs.set(role, bg)
      this.tabTexts.set(role, txt)
      this.tabTexts.set(role, txt)
      // stash sigil on the bg's data for toggle
      bg.setData('sigil', sigil)
      x += tabW + gap
    })
  }

  private drawPassiveLine() {
    this.add.rectangle(W / 2, 108, W, 28, surface.primary)
    this.passiveText = this.add.text(W / 2, 108, '', {
      fontFamily: fontFamily.serif, fontSize: typeScale.small,
      color: fg.secondaryHex, fontStyle: 'italic',
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
    const cards   = getRoleCards(role).filter((c) => c.group === group)
    const tint    = GROUP_HEADER_TINT[group]
    const tintHex = '#' + tint.toString(16).padStart(6, '0')
    const sy      = SECTION_Y_START

    // Column background — surface.panel with a soft tinted glow at top
    const colW = COL_W - 8
    const colX = sx + (COL_W - colW) / 2
    const colBgG = this.add.graphics()
    colBgG.fillStyle(surface.panel, 0.92)
    colBgG.fillRoundedRect(colX, sy, colW, SECTION_H, radii.lg)
    colBgG.lineStyle(1, border.default, 0.8)
    colBgG.strokeRoundedRect(colX, sy, colW, SECTION_H, radii.lg)
    // Tinted top band (2px) signaling the group category
    colBgG.fillStyle(tint, 0.55)
    colBgG.fillRoundedRect(colX, sy, colW, 3, { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })
    container.add(colBgG)

    // Section header (group label + count counter)
    const hdrTxt = this.add.text(colX + 12, sy + SEC_HEADER_H / 2, GROUP_LABELS[group], {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: tintHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.6)
    container.add(hdrTxt)

    const counterTxt = this.add.text(colX + colW - 12, sy + SEC_HEADER_H / 2, '0 / 2', {
      fontFamily: fontFamily.mono, fontSize: typeScale.small,
      color: fg.tertiaryHex, fontStyle: '700',
    }).setOrigin(1, 0.5).setName(`counter_${role}_${group}`)
    container.add(counterTxt)

    // 2 × 2 grid of canonical 120 × 160 vertical skill cards centered in col
    const gridW = CARDS_PER_ROW * CARD_W + (CARDS_PER_ROW - 1) * CARD_GAP
    const gridStartX = sx + (COL_W - gridW) / 2 + CARD_W / 2
    const cardsStartY = sy + SEC_HEADER_H + 12 + CARD_H / 2

    cards.forEach((card, i) => {
      const col = i % CARDS_PER_ROW
      const row = Math.floor(i / CARDS_PER_ROW)
      const cx = gridStartX + col * (CARD_W + CARD_GAP)
      const cy = cardsStartY + row * (CARD_H + CARD_GAP)

      // Selection highlight (drawn first, behind the card) — invisible by default
      const classColor = ROLE_CLASS_COLOR[role]
      const highlightG = this.add.graphics()
      highlightG.fillStyle(classColor, 0.18)
      highlightG.fillRoundedRect(cx - CARD_W / 2 - 4, cy - CARD_H / 2 - 4,
        CARD_W + 8, CARD_H + 8, radii.lg)
      highlightG.lineStyle(2, classColor, 0.95)
      highlightG.strokeRoundedRect(cx - CARD_W / 2 - 4, cy - CARD_H / 2 - 4,
        CARD_W + 8, CARD_H + 8, radii.lg)
      highlightG.setVisible(false)
      highlightG.setName(`hl_${card.id}`)
      container.add(highlightG)

      // Canonical vertical card (UI.skillCard delegates to skillCardVertical
      // when orientation === 'vertical').
      const skillCard = UI.skillCard(this, cx, cy, {
        name:        card.name,
        effectType:  card.effect as string,
        power:       card.power,
        group:       card.group,
        unitClass:   role,           // UnitRole == unitClass key
        level:       1,              // mock data — no level progression here
        skillId:     card.id,
        description: card.shortDescription,
      }, {
        orientation: 'vertical',
        width:  CARD_W,
        height: CARD_H,
        showTooltip: false,
      })
      skillCard.setName(`cardbg_${card.id}`)
      container.add(skillCard)

      // Hit area covering the card — absolute coords (matches the cx/cy)
      const hit = this.add.rectangle(cx, cy, CARD_W + 6, CARD_H + 6, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true })
      container.add(hit)

      hit.on('pointerover', () => {
        if (!this.isCardSelected(role, group, card.id)) {
          this.tweens.add({ targets: skillCard, y: cy - 4, duration: 140, ease: 'Quad.Out' })
        }
        this.showTooltip(card, cx, cy - CARD_H / 2)
      })
      hit.on('pointerout', () => {
        if (!this.isCardSelected(role, group, card.id)) {
          this.tweens.add({ targets: skillCard, y: cy, duration: 140, ease: 'Quad.Out' })
        }
        this.hideTooltip()
      })
      hit.on('pointerdown', () => this.toggleCard(role, group, card.id, container, counterTxt))
    })
  }

  // ─── Tooltip ────────────────────────────────────────────────────────────────

  private showTooltip(card: import('../types').CardData, worldX: number, worldY: number) {
    this.hideTooltip()

    const TOOLTIP_W = 260
    const PAD = 12
    const typeLabel = GROUP_TYPE_LABELS[card.group] ?? card.category
    const targetLabel = TARGET_LABELS[card.targetType] ?? card.targetType
    const classColor = ROLE_CLASS_COLOR[this.activeRole]
    const classHex = '#' + classColor.toString(16).padStart(6, '0')

    const nameText = this.add.text(PAD, PAD, card.name, {
      fontFamily: fontFamily.serif, fontSize: typeScale.h3,
      color: classHex, fontStyle: '600',
      wordWrap: { width: TOOLTIP_W - PAD * 2 },
    })

    const typeText = this.add.text(PAD, nameText.y + nameText.height + 6, typeLabel.toUpperCase(), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '700',
    }).setLetterSpacing(1.6)

    const powerStr = card.power > 0 ? `Poder ${card.power}` : 'Poder —'
    const powerText = this.add.text(TOOLTIP_W - PAD, typeText.y, powerStr, {
      fontFamily: fontFamily.mono, fontSize: typeScale.small,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(1, 0)

    const dividerY = typeText.y + typeText.height + 8
    const divider = this.add.rectangle(TOOLTIP_W / 2, dividerY,
      TOOLTIP_W - PAD * 2, 1, border.subtle, 1)

    const descText = this.add.text(PAD, dividerY + 8, card.shortDescription, {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color: fg.secondaryHex,
      wordWrap: { width: TOOLTIP_W - PAD * 2 },
    })

    const targetText = this.add.text(PAD, descText.y + descText.height + 8,
      `ALVO · ${targetLabel.toUpperCase()}`, {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: fg.tertiaryHex, fontStyle: '700',
    }).setLetterSpacing(1.6)

    const totalH = targetText.y + targetText.height + PAD
    const bg = this.add.graphics()
    bg.fillStyle(0x000000, 0.55)
    bg.fillRoundedRect(2, 4, TOOLTIP_W, totalH, radii.md)
    bg.fillStyle(surface.raised, 1)
    bg.fillRoundedRect(0, 0, TOOLTIP_W, totalH, radii.md)
    bg.lineStyle(1, border.strong, 1)
    bg.strokeRoundedRect(0, 0, TOOLTIP_W, totalH, radii.md)

    const container = this.add.container(0, 0,
      [bg, nameText, typeText, powerText, divider, descText, targetText])
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

    // Refresh all highlight overlays for this group
    getRoleCards(role)
      .filter((c) => c.group === group)
      .forEach((c) => {
        const hl = container.getByName(`hl_${c.id}`) as Phaser.GameObjects.Graphics | null
        if (hl) hl.setVisible(sel.includes(c.id))
      })

    const done = sel.length === 2
    counterTxt.setText(`${sel.length} / 2`)
      .setColor(done ? state.successHex : fg.tertiaryHex)
    this.updateFooter()
  }

  // ─── Tab switching ─────────────────────────────────────────────────────────

  private showRole(role: UnitRole) {
    this.roleContainers.forEach((c, r) => c.setVisible(r === role))

    const classColor = ROLE_CLASS_COLOR[role]
    const classHex = '#' + classColor.toString(16).padStart(6, '0')

    this.tabBgs.forEach((bg, r) => {
      const active = r === role
      const rColor = ROLE_CLASS_COLOR[r]
      bg.setFillStyle(active ? surface.raised : surface.panel)
      bg.setStrokeStyle(active ? 2 : 1,
        active ? rColor : border.default,
        active ? 1 : 0.7)
    })
    this.tabTexts.forEach((t, r) => {
      const active = r === role
      t.setColor(active ? classHex : fg.secondaryHex)
    })

    this.activeRole = role
    this.passiveText.setText(ROLE_PASSIVES[role])
    this.passiveText.setColor(classHex)

    // Refresh highlights + counters for the newly visible container
    const container = this.roleContainers.get(role)
    if (container) {
      GROUPS.forEach((group) => {
        const sel = this.selections.get(role)?.get(group) ?? []
        const cTxt = container.getByName(`counter_${role}_${group}`) as Phaser.GameObjects.Text | null
        if (cTxt) cTxt.setText(`${sel.length} / 2`)
          .setColor(sel.length === 2 ? state.successHex : fg.tertiaryHex)

        getRoleCards(role)
          .filter((c) => c.group === group)
          .forEach((c) => {
            const hl = container.getByName(`hl_${c.id}`) as Phaser.GameObjects.Graphics | null
            if (hl) hl.setVisible(sel.includes(c.id))
          })
      })
    }

    // Refresh deck preview for the newly active role
    if (this.deckPreviewTexts.length > 0) this.updateDeckPreview()
  }

  // ─── Footer ────────────────────────────────────────────────────────────────

  private drawFooter() {
    // Footer band + top rule
    this.add.rectangle(W / 2, 690, W, 60, surface.panel)
    this.add.rectangle(W / 2, 660, W, 1, border.default, 0.7)

    // Progress counter (top-left)
    this.progressText = this.add.text(20, 672, '', {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.4)

    // ── Deck preview (compact row) ────────────────────────────────────────
    const previewY = 692
    this.add.text(20, previewY, 'DECK', {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '700',
    }).setOrigin(0, 0).setLetterSpacing(1.6)

    const atkLabel = this.add.text(70, previewY, 'ATK', {
      fontFamily: fontFamily.mono, fontSize: typeScale.meta,
      color: state.errorHex, fontStyle: '700',
    }).setOrigin(0, 0)
    const atkSlots: Phaser.GameObjects.Text[] = []
    for (let i = 0; i < 4; i++) {
      const t = this.add.text(70 + atkLabel.width + 6 + i * 70, previewY, '—', {
        fontFamily: fontFamily.mono, fontSize: typeScale.meta,
        color: fg.tertiaryHex,
      }).setOrigin(0, 0)
      atkSlots.push(t)
    }

    const defStartX = 70 + atkLabel.width + 6 + 4 * 70 + 8
    const defLabel = this.add.text(defStartX, previewY, 'DEF', {
      fontFamily: fontFamily.mono, fontSize: typeScale.meta,
      color: state.infoHex, fontStyle: '700',
    }).setOrigin(0, 0)
    const defSlots: Phaser.GameObjects.Text[] = []
    for (let i = 0; i < 4; i++) {
      const t = this.add.text(defStartX + defLabel.width + 6 + i * 70, previewY, '—', {
        fontFamily: fontFamily.mono, fontSize: typeScale.meta,
        color: fg.tertiaryHex,
      }).setOrigin(0, 0)
      defSlots.push(t)
    }

    this.deckPreviewTexts = [...atkSlots, ...defSlots]

    // Power total
    const powerX = defStartX + defLabel.width + 6 + 4 * 70 + 12
    this.deckPowerText = this.add.text(powerX, previewY, 'PWR 0', {
      fontFamily: fontFamily.mono, fontSize: typeScale.small,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0)

    // Shortcut hint
    this.add.text(20, 710, 'Atalhos · 1-4 selecionar · Tab trocar classe · Enter jogar', {
      fontFamily: fontFamily.body, fontSize: '10px',
      color: fg.disabledHex, fontStyle: '500',
    }).setOrigin(0, 0.5)

    // ── Deck utility buttons (right side) ─────────────────────────────────
    const btnY = 690
    const mkBtn = (x: number, label: string, onClick: () => void) => {
      const { container } = UI.buttonSecondary(this, x, btnY, label, {
        w: 124, h: 36, onPress: onClick,
      })
      return container
    }

    mkBtn(W - 462, 'Aleatório',  () => this.randomizeDeck())
    mkBtn(W - 332, 'Padrão',     () => this.fillDefaultDeck())
    mkBtn(W - 202, 'Restaurar',  () => {
      if (this.loadFromStorage()) {
        ROLES.forEach((role) => this.refreshRoleVisuals(role))
        this.updateFooter()
        this.showRole(this.activeRole)
      }
    })

    // ── Start button (primary gold, canonical CTA) ───────────────────────
    const { setDisabled } = UI.buttonPrimary(
      this, W - 72, btnY, 'INICIAR',
      {
        w: 128, h: 40,
        onPress: () => {
          if (this.isAllComplete()) this.startBattle()
        },
      },
    )
    this.startBtnSetDisabled = setDisabled

    this.updateFooter()
  }

  private updateFooter() {
    const completedCount = ROLES.filter((role) =>
      GROUPS.every((g) => (this.selections.get(role)?.get(g)?.length ?? 0) === 2)
    ).length

    this.progressText.setText(
      `UNIDADES PRONTAS · ${completedCount} / 4    SELECIONE 2 CARTAS POR COLUNA`,
    )

    const allDone = completedCount === 4
    this.startBtnSetDisabled?.(!allDone)

    // Tab "ready" indicator — class color when done, secondary otherwise
    ROLES.forEach((role) => {
      const done = GROUPS.every((g) => (this.selections.get(role)?.get(g)?.length ?? 0) === 2)
      const tabTxt = this.tabTexts.get(role)
      if (!tabTxt) return
      tabTxt.setText(done ? `${ROLE_LABELS[role]} ✓` : ROLE_LABELS[role])
      if (this.activeRole !== role) {
        const rHex = '#' + ROLE_CLASS_COLOR[role].toString(16).padStart(6, '0')
        tabTxt.setColor(done ? rHex : fg.secondaryHex)
      }
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
        txt.setText(card ? this.truncateName(card.name, 10) : '—')
        txt.setColor(card ? state.errorHex : fg.tertiaryHex)
        if (card) totalPower += card.power
      } else {
        txt.setText('—').setColor(fg.tertiaryHex)
      }
    }

    // Update defense slots (indices 4-7)
    for (let i = 0; i < 4; i++) {
      const txt = this.deckPreviewTexts[4 + i]
      if (!txt) continue
      if (i < defIds.length) {
        const card = allCards.find((c) => c.id === defIds[i])
        txt.setText(card ? this.truncateName(card.name, 10) : '—')
        txt.setColor(card ? state.infoHex : fg.tertiaryHex)
        if (card) totalPower += card.power
      } else {
        txt.setText('—').setColor(fg.tertiaryHex)
      }
    }

    if (this.deckPowerText) {
      this.deckPowerText.setText(`PWR ${totalPower}`)
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
      if (cTxt) cTxt.setText(`${sel.length} / 2`)
        .setColor(sel.length === 2 ? state.successHex : fg.tertiaryHex)
      getRoleCards(role).filter((c) => c.group === group).forEach((c) => {
        const hl = container.getByName(`hl_${c.id}`) as Phaser.GameObjects.Graphics | null
        if (hl) hl.setVisible(sel.includes(c.id))
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
      skinConfig: playerData.getSkinConfig(),
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
