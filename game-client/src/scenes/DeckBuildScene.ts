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
  king:       'Passiva: Teleporte livre no próprio lado durante a fase de movimento.',
  warrior:    'Passiva: Aliados adjacentes recebem −25% de dano.',
  specialist: 'Passiva: Todo ataque aplica −50% de cura no inimigo atingido por 2 turnos.',
  executor:   'Passiva: +8 de dano extra quando sem aliados adjacentes (isolado).',
}

const GROUPS: CardGroup[] = ['attack1', 'attack2', 'defense1', 'defense2']

const GROUP_LABELS: Record<CardGroup, string> = {
  attack1:  'Ataque Tipo 1 — dano',
  attack2:  'Ataque Tipo 2 — controle',
  defense1: 'Defesa Tipo 1 — forte',
  defense2: 'Defesa Tipo 2 — leve',
}

const GROUP_HEADER_COLOR: Record<CardGroup, number> = {
  attack1:  0x7c2d12,
  attack2:  0x78350f,
  defense1: 0x164e63,
  defense2: 0x1e3a5f,
}

const CARD_SELECTED_FILL: Record<CardGroup, number> = {
  attack1:  0x3b1515,
  attack2:  0x3b2a10,
  defense1: 0x0f2a3a,
  defense2: 0x0e2040,
}

const CARD_SELECTED_STROKE: Record<CardGroup, number> = {
  attack1:  0xfca5a5,
  attack2:  0xfbbf24,
  defense1: 0x67e8f9,
  defense2: 0x818cf8,
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

export default class DeckBuildScene extends Phaser.Scene {
  private activeRole: UnitRole = 'king'
  private difficulty: Difficulty = 'normal'

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

  constructor() {
    super('DeckBuildScene')
  }

  create() {
    GameStateManager.set(GameState.MENU)
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
  }

  // ─── Background ────────────────────────────────────────────────────────────

  private drawBackground() {
    this.add.rectangle(W / 2, 360, W, 720, 0x0c1018)
    for (let i = 1; i < 4; i++) {
      this.add.rectangle(i * COL_W, 360, 1, 720, 0x1e293b)
    }
    this.add.rectangle(W / 2, SECTION_Y_START, W, 1, 0x1e293b)
    this.add.rectangle(W / 2, SECTION_Y_END,   W, 1, 0x1e293b)
  }

  private drawHeader() {
    this.add.rectangle(W / 2, 28, W, 56, 0x101827)

    // Title + subtitle (left-aligned to leave room for controls)
    this.add.text(200, 18, 'DRAFT — Montagem de Deck', {
      fontFamily: 'Arial', fontSize: '22px', color: '#f8e7b9', fontStyle: 'bold',
    }).setOrigin(0.5)
    this.add.text(200, 41, 'Selecione 2 cartas por grupo para cada unidade.', {
      fontFamily: 'Arial', fontSize: '11px', color: '#64748b',
    }).setOrigin(0.5)

    // ── Difficulty buttons ───────────────────────────────────────────────────
    const diffs: Difficulty[] = ['easy', 'normal', 'hard']
    const dBtnW = 82
    const dStartX = W - 3 * (dBtnW + 6) - 10 + dBtnW / 2
    const dBtnColors: Record<Difficulty, number> = { easy: 0x166534, normal: 0x1e3a5f, hard: 0x7f1d1d }
    const dBtnStroke: Record<Difficulty, number> = { easy: 0x4ade80, normal: 0x60a5fa, hard: 0xf87171 }

    this.add.text(dStartX - dBtnW / 2 - 12, 18, 'DIFICULDADE', {
      fontFamily: 'Arial', fontSize: '9px', color: '#475569', fontStyle: 'bold',
    }).setOrigin(1, 0.5)

    diffs.forEach((d, i) => {
      const x = dStartX + i * (dBtnW + 6)
      const isActive = d === this.difficulty
      const bg = this.add.rectangle(x, 28, dBtnW, 36, isActive ? dBtnColors[d] : 0x1e293b)
        .setStrokeStyle(2, isActive ? dBtnStroke[d] : 0x334155, isActive ? 1 : 0.5)
        .setInteractive({ useHandCursor: true })
      const label = this.add.text(x, 28, DIFFICULTY_LABELS[d], {
        fontFamily: 'Arial', fontSize: '13px',
        color: isActive ? '#f1f5f9' : '#64748b', fontStyle: 'bold',
      }).setOrigin(0.5)

      bg.on('pointerover', () => { if (this.difficulty !== d) bg.setFillStyle(0x263548) })
      bg.on('pointerout',  () => { if (this.difficulty !== d) bg.setFillStyle(0x1e293b) })
      bg.on('pointerdown', () => this.setDifficulty(d))

      this.diffBtns.set(d, { bg, label })
    })
  }

  private drawTabs() {
    this.add.rectangle(W / 2, 77, W, 42, 0x0d1520)

    const tabW = 294
    const gap  = 6
    const total = ROLES.length * tabW + (ROLES.length - 1) * gap
    let x = (W - total) / 2 + tabW / 2

    ROLES.forEach((role) => {
      const bg = this.add
        .rectangle(x, 77, tabW, 36, 0x1e293b)
        .setStrokeStyle(1, 0x334155)
        .setInteractive({ useHandCursor: true })

      const txt = this.add.text(x, 77, ROLE_LABELS[role], {
        fontFamily: 'Arial', fontSize: '15px', color: '#94a3b8', fontStyle: 'bold',
      }).setOrigin(0.5)

      bg.on('pointerover', () => { if (this.activeRole !== role) bg.setFillStyle(0x263548) })
      bg.on('pointerout',  () => { if (this.activeRole !== role) bg.setFillStyle(0x1e293b) })
      bg.on('pointerdown', () => this.showRole(role))

      this.tabBgs.set(role, bg)
      this.tabTexts.set(role, txt)
      x += tabW + gap
    })
  }

  private drawPassiveLine() {
    this.add.rectangle(W / 2, 108, W, 28, 0x111827)
    this.passiveText = this.add.text(W / 2, 108, '', {
      fontFamily: 'Arial', fontSize: '12px', color: '#7dd3fc',
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
      sx + CARD_W / 2, sy + SECTION_H / 2, CARD_W, SECTION_H, 0x0d1520
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
      fontFamily: 'Arial', fontSize: '12px', color: '#fde68a', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setName(`counter_${role}_${group}`)
    container.add(counterTxt)

    // Cards
    const cardsStartY = sy + SEC_HEADER_H + CARD_GAP
    cards.forEach((card, i) => {
      const cy = cardsStartY + i * (CARD_H + CARD_GAP) + CARD_H / 2
      const cx = sx + CARD_W / 2
      const isAtk = group.startsWith('attack')

      const cardBg = this.add
        .rectangle(cx, cy, CARD_W, CARD_H, 0x111827)
        .setStrokeStyle(1, 0x1e293b)
        .setInteractive({ useHandCursor: true })
        .setName(`cardbg_${card.id}`)
      container.add(cardBg)

      // Card name
      const nameTxt = this.add.text(sx + 8, cy - CARD_H / 2 + 9, card.name, {
        fontFamily: 'Arial', fontSize: '12px', color: '#f1f5f9', fontStyle: 'bold',
      }).setOrigin(0, 0)
      container.add(nameTxt)

      // Effect badge top-right
      const effectColor = isAtk ? '#fca5a5' : '#86efac'
      const effectLabel = card.power > 0 ? `${card.effect.toUpperCase()} ${card.power}` : card.effect.toUpperCase()
      const effectTxt = this.add.text(sx + CARD_W - 6, cy - CARD_H / 2 + 9, effectLabel, {
        fontFamily: 'Arial', fontSize: '10px', color: effectColor, fontStyle: 'bold',
      }).setOrigin(1, 0)
      container.add(effectTxt)

      // Description — wraps inside the card
      const descTxt = this.add.text(sx + 8, cy - CARD_H / 2 + 26, card.shortDescription, {
        fontFamily: 'Arial', fontSize: '10px', color: '#94a3b8',
        wordWrap: { width: CARD_W - 16 },
      }).setOrigin(0, 0)
      container.add(descTxt)

      // Interactions
      cardBg.on('pointerover', () => {
        if (!this.isCardSelected(role, group, card.id)) cardBg.setFillStyle(0x1a2535)
      })
      cardBg.on('pointerout', () => {
        if (!this.isCardSelected(role, group, card.id)) cardBg.setFillStyle(0x111827)
      })
      cardBg.on('pointerdown', () => this.toggleCard(role, group, card.id, container, counterTxt))
    })
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
          bg.setFillStyle(0x111827)
          bg.setStrokeStyle(1, 0x1e293b, 1)
        }
      })

    const done = sel.length === 2
    counterTxt.setText(`${sel.length} / 2`).setColor(done ? '#4ade80' : '#fde68a')
    this.updateFooter()
  }

  // ─── Tab switching ─────────────────────────────────────────────────────────

  private showRole(role: UnitRole) {
    this.roleContainers.forEach((c, r) => c.setVisible(r === role))

    this.tabBgs.forEach((bg, r) => {
      const active = r === role
      bg.setFillStyle(active ? 0x334155 : 0x1e293b)
      bg.setStrokeStyle(active ? 2 : 1, active ? 0x60a5fa : 0x334155, 1)
    })
    this.tabTexts.forEach((t, r) => t.setColor(r === role ? '#f8fafc' : '#94a3b8'))

    this.activeRole = role
    this.passiveText.setText(ROLE_PASSIVES[role])

    // Refresh card backgrounds and counters for the newly visible container
    const container = this.roleContainers.get(role)
    if (container) {
      GROUPS.forEach((group) => {
        const sel = this.selections.get(role)?.get(group) ?? []
        const cTxt = container.getByName(`counter_${role}_${group}`) as Phaser.GameObjects.Text | null
        if (cTxt) cTxt.setText(`${sel.length} / 2`).setColor(sel.length === 2 ? '#4ade80' : '#fde68a')

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
              bg.setFillStyle(0x111827)
              bg.setStrokeStyle(1, 0x1e293b, 1)
            }
          })
      })
    }
  }

  // ─── Footer ────────────────────────────────────────────────────────────────

  private drawFooter() {
    this.add.rectangle(W / 2, 690, W, 60, 0x0d1520)
    this.add.rectangle(W / 2, 660, W, 1, 0x1e293b)

    // Progress counter (left)
    this.progressText = this.add.text(16, 690, '', {
      fontFamily: 'Arial', fontSize: '13px', color: '#94a3b8',
    }).setOrigin(0, 0.5)

    // ── Deck utility buttons ─────────────────────────────────────────────────
    const mkBtn = (x: number, label: string, stroke: number, onClick: () => void) => {
      const bg = this.add.rectangle(x, 690, 148, 36, 0x111827)
        .setStrokeStyle(1, stroke, 0.7)
        .setInteractive({ useHandCursor: true })
      const txt = this.add.text(x, 690, label, {
        fontFamily: 'Arial', fontSize: '13px', color: '#94a3b8', fontStyle: 'bold',
      }).setOrigin(0.5)
      bg.on('pointerover', () => { bg.setFillStyle(0x1c2b3a); txt.setColor('#f1f5f9') })
      bg.on('pointerout',  () => { bg.setFillStyle(0x111827); txt.setColor('#94a3b8') })
      bg.on('pointerdown', onClick)
    }

    mkBtn(310, 'Deck Aleatório', 0x7dd3fc, () => this.randomizeDeck())
    mkBtn(468, 'Deck Padrão',    0xa78bfa, () => this.fillDefaultDeck())
    mkBtn(626, 'Restaurar Salvo', 0xfbbf24, () => {
      if (this.loadFromStorage()) {
        ROLES.forEach((role) => this.refreshRoleVisuals(role))
        this.updateFooter()
        this.showRole(this.activeRole)
      }
    })

    // ── Start button (right) ─────────────────────────────────────────────────
    this.startBtn = this.add
      .rectangle(W - 170, 690, 300, 40, 0x111827)
      .setStrokeStyle(2, 0x334155)
      .setInteractive({ useHandCursor: true })

    this.startBtnLabel = this.add.text(W - 170, 690, 'Iniciar Batalha', {
      fontFamily: 'Arial', fontSize: '18px', color: '#4b5563', fontStyle: 'bold',
    }).setOrigin(0.5)

    this.startBtn.on('pointerover', () => {
      if (this.isAllComplete()) this.startBtn.setFillStyle(0x1e3a2e)
    })
    this.startBtn.on('pointerout', () => {
      this.startBtn.setFillStyle(this.isAllComplete() ? 0x162d22 : 0x111827)
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
    this.startBtn.setFillStyle(allDone ? 0x162d22 : 0x111827)
    this.startBtn.setStrokeStyle(2, allDone ? 0x4ade80 : 0x334155, allDone ? 1 : 0.6)
    this.startBtnLabel.setColor(allDone ? '#4ade80' : '#4b5563')

    // Colored checkmarks on tabs
    ROLES.forEach((role) => {
      const done = GROUPS.every((g) => (this.selections.get(role)?.get(g)?.length ?? 0) === 2)
      const tabTxt = this.tabTexts.get(role)
      if (!tabTxt) return
      tabTxt.setText(done ? `${ROLE_LABELS[role]} ✓` : ROLE_LABELS[role])
      if (this.activeRole !== role) tabTxt.setColor(done ? '#4ade80' : '#94a3b8')
    })
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
      easy:   { fill: 0x166534, stroke: 0x4ade80 },
      normal: { fill: 0x1e3a5f, stroke: 0x60a5fa },
      hard:   { fill: 0x7f1d1d, stroke: 0xf87171 },
    }
    this.diffBtns.forEach(({ bg, label }, key) => {
      const active = key === d
      bg.setFillStyle(active ? colors[key].fill : 0x1e293b)
      bg.setStrokeStyle(2, active ? colors[key].stroke : 0x334155, active ? 1 : 0.5)
      label.setColor(active ? '#f1f5f9' : '#64748b')
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
      if (cTxt) cTxt.setText(`${sel.length} / 2`).setColor(sel.length === 2 ? '#4ade80' : '#fde68a')
      getRoleCards(role).filter((c) => c.group === group).forEach((c) => {
        const bg = container.getByName(`cardbg_${c.id}`) as Phaser.GameObjects.Rectangle | null
        if (!bg) return
        const selected = sel.includes(c.id)
        bg.setFillStyle(selected ? CARD_SELECTED_FILL[group] : 0x111827)
        bg.setStrokeStyle(selected ? 2 : 1, selected ? CARD_SELECTED_STROKE[group] : 0x1e293b, 1)
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
    this.scene.start('ArenaScene', { deckConfig, difficulty: this.difficulty })
  }

  private buildUnitDeck(role: UnitRole) {
    const sel = this.selections.get(role)!
    return {
      attackCards:  [...(sel.get('attack1') ?? []), ...(sel.get('attack2') ?? [])],
      defenseCards: [...(sel.get('defense1') ?? []), ...(sel.get('defense2') ?? [])],
    }
  }
}
