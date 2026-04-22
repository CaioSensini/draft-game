import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import {
  SCREEN,
  colors as C2,
  surface, border, accent, fg, state,
  fontFamily, typeScale, radii,
} from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import type { OwnedSkill } from '../utils/PlayerDataManager'
import { SKILL_CATALOG } from '../data/skillCatalog'
import type { SkillDefinition } from '../domain/Skill'
import type { UnitRole } from '../engine/types'
import { unitStatsByRole } from '../data/unitStats'
import { getCharacterKey, hasCharacterSprite, getClassSigilKey } from '../utils/AssetPaths'
import type { CharClass } from '../utils/AssetPaths'

// ── Layout ──────────────────────────────────────────────────────────────────

const W = SCREEN.W
const H = SCREEN.H
const TOP_BAR_H = 56
const LEFT_W = 330
const CONTENT_X = LEFT_W + 8
const CONTENT_W = W - CONTENT_X - 8

// Canonical vertical skill card — INTEGRATION_SPEC §2 / Print 15
const DECK_CARD_W = 120
const DECK_CARD_H = 160
const DECK_GAP = 14
// 4 cols x 2 rows — deck has 8 slots total (attack1/2 + defense1/2 x 2)
const DECK_COLS = 4
const DECK_ROWS = 2

// Inventory grid — decision C: 4 cols. Fits 4x120 + 3 x 10 = 510, plenty
// of room in the ~920 content width with scroll below to handle overflow.
const INV_COLS = 4
const INV_GAP = 14
const INV_CARD_W = DECK_CARD_W
const INV_CARD_H = DECK_CARD_H

const MAX_SKILL_LEVEL = 5
const GROUP_ORDER = ['attack1', 'attack2', 'defense1', 'defense2']

// UPAR chip — drawn OUTSIDE the 120x160 card to avoid squeezing the
// canonical footer. Chip lives 4px below the card and is 80x20.
const UPAR_CHIP_W = 86
const UPAR_CHIP_H = 20
const UPAR_CHIP_OFFSET_Y = DECK_CARD_H / 2 + 14

interface ClassMeta {
  role: UnitRole
  label: string
  abbrev: string
  prefix: string
  color: number
  colorHex: string
}

const CLASSES: ClassMeta[] = [
  { role: 'king',       label: 'Rei',          abbrev: 'REI', prefix: 'lk_', color: C2.class.king,       colorHex: '#' + C2.class.king.toString(16).padStart(6, '0') },
  { role: 'warrior',    label: 'Guerreiro',    abbrev: 'GUE', prefix: 'lw_', color: C2.class.warrior,    colorHex: '#' + C2.class.warrior.toString(16).padStart(6, '0') },
  { role: 'executor',   label: 'Executor',     abbrev: 'EXE', prefix: 'le_', color: C2.class.executor,   colorHex: '#' + C2.class.executor.toString(16).padStart(6, '0') },
  { role: 'specialist', label: 'Especialista', abbrev: 'ESP', prefix: 'ls_', color: C2.class.specialist, colorHex: '#' + C2.class.specialist.toString(16).padStart(6, '0') },
]

const STAT_CFG = [
  { key: 'maxHp' as const,    label: 'HP',  color: state.error,   hex: state.errorHex,   max: 200 },
  { key: 'attack' as const,   label: 'ATK', color: accent.primary, hex: accent.primaryHex, max: 25 },
  { key: 'defense' as const,  label: 'DEF', color: state.info,    hex: state.infoHex,    max: 20 },
  { key: 'mobility' as const, label: 'MOB', color: state.success, hex: state.successHex, max: 4 },
]

// ── Scene ────────────────────────────────────────────────────────────────────

export default class SkillUpgradeScene extends Phaser.Scene {
  private activeRole: UnitRole = 'king'
  private allSkills: OwnedSkill[] = []
  private gold = 0
  private fusionSlot1: { skill: OwnedSkill; idx: number } | null = null
  private deckSelecting: { skillId: string; slotIdx: number; category: string; group: string } | null = null
  private highlightObjs: Phaser.GameObjects.GameObject[] = []
  private highlightTweens: Phaser.Tweens.Tween[] = []
  private tabGroup: Phaser.GameObjects.GameObject[] = []
  private leftGroup: Phaser.GameObjects.GameObject[] = []
  private deckGroup: Phaser.GameObjects.GameObject[] = []
  private invGroup: Phaser.GameObjects.GameObject[] = []
  private invContainer: Phaser.GameObjects.Container | null = null
  private scrollY = 0
  private invCardPositions: { cx: number; cy: number; skill: OwnedSkill; origIdx: number; canUpgrade: boolean; canAfford: boolean; isEquipped: boolean }[] = []
  private deckCardPositions: { x: number; y: number; skillId: string; slotIdx: number; category: string; group: string }[] = []
  private _deckCardClicked = false
  private _clickTooltip: Phaser.GameObjects.Container | null = null
  private _hoverTooltip: Phaser.GameObjects.Container | null = null
  private dragCard: Phaser.GameObjects.Container | null = null
  private dragOrigX = 0; private dragOrigY = 0; private dragOrigDepth = 0
  private dragSource: { skill: OwnedSkill; origIdx: number; fromDeck: boolean; slotIdx?: number; category?: string; group?: string } | null = null

  constructor() { super('SkillUpgradeScene') }

  create() {
    this.activeRole = 'king'
    this.fusionSlot1 = null; this.deckSelecting = null
    this.highlightObjs = []; this.highlightTweens = []
    this.leftGroup = []; this.deckGroup = []; this.invGroup = []
    this.invContainer = null; this.scrollY = 0
    this.loadData()

    UI.background(this)
    UI.particles(this, 15)

    this.drawTopBar()
    this.drawClassTabs()
    this.drawLeft()
    this.drawDeck()
    this.drawInventory()

    UI.fadeIn(this)
  }

  private loadData() {
    this.allSkills = playerData.getSkills()
    this.gold = playerData.getGold()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOP BAR
  // ═══════════════════════════════════════════════════════════════════════════

  private drawTopBar() {
    // Band (surface.panel + border.subtle rule underneath — matches Lobby)
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 0.97)
    bg.fillRect(0, 0, W, TOP_BAR_H)
    bg.fillStyle(border.subtle, 1)
    bg.fillRect(0, TOP_BAR_H - 1, W, 1)

    UI.backArrow(this, () => { this._fillEmptySlots(); transitionTo(this, 'LobbyScene') })

    // Title — Cinzel h2 accent, letterSpacing 3
    this.add.text(70, TOP_BAR_H / 2, 'GERENCIAR SKILLS', {
      fontFamily: fontFamily.display, fontSize: typeScale.h2,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(3)

    // Gold pill (UI.currencyPill canonical)
    UI.currencyPill(this, W - 90, TOP_BAR_H / 2, {
      kind: 'gold', amount: this.gold,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASS TABS (horizontal row in left panel area)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawClassTabs() {
    this.tabGroup.forEach(o => o.destroy()); this.tabGroup = []
    const tabW = 76; const gap = 6
    const startX = LEFT_W / 2 - ((CLASSES.length * (tabW + gap) - gap) / 2)
    const tabY = TOP_BAR_H + 8

    CLASSES.forEach((cls, i) => {
      const tx = startX + i * (tabW + gap) + tabW / 2
      const isActive = cls.role === this.activeRole
      const cont = this.add.container(tx, tabY + tabW / 2)
      this.tabGroup.push(cont)

      const hexGfx = this.add.graphics()
      const hexR = tabW / 2
      hexGfx.fillStyle(isActive ? surface.raised : surface.panel, 1)
      hexGfx.lineStyle(1.5, isActive ? cls.color : border.default, isActive ? 1 : 0.7)
      const pts: Phaser.Geom.Point[] = []
      for (let h = 0; h < 6; h++) {
        const a = (Math.PI * 2 * h) / 6 - Math.PI / 2
        pts.push(new Phaser.Geom.Point(Math.cos(a) * hexR, Math.sin(a) * hexR))
      }
      hexGfx.fillPoints(pts, true); hexGfx.strokePoints(pts, true)
      cont.add(hexGfx)

      if (isActive) {
        const glow = this.add.circle(0, 0, hexR + 4, cls.color, 0)
        cont.addAt(glow, 0)
        this.tweens.add({ targets: glow, alpha: { from: 0.08, to: 0.22 }, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
      }

      // Character sprite — sized to match arena (~66px tall at scale used in BattleScene)
      const charClass = cls.role as CharClass
      const skin = playerData.getEquippedSkin?.(charClass) ?? 'idle'
      if (hasCharacterSprite(this, charClass, skin)) {
        const sprite = this.add.image(0, -2, getCharacterKey(charClass, skin))
        // Target visual box: fits inside hexagon with a bit of padding
        const maxW = tabW - 14
        const maxH = tabW - 8
        const scale = Math.min(maxW / sprite.width, maxH / sprite.height)
        sprite.setScale(scale)
        if (!isActive) sprite.setAlpha(0.55)
        cont.add(sprite)
      } else {
        cont.add(UI.classIcon(this, 0, -2, cls.role, 28, isActive ? cls.color : border.default))
      }
      cont.add(this.add.text(0, tabW / 2 + 8, cls.abbrev, {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        fontStyle: '700',
        color: isActive ? cls.colorHex : fg.disabledHex,
      }).setOrigin(0.5).setLetterSpacing(1.6))

      const hit = this.add.circle(0, 0, hexR + 2, 0, 0.001).setInteractive({ useHandCursor: true })
      cont.add(hit)
      hit.on('pointerdown', () => {
        if (cls.role !== this.activeRole) {
          this.activeRole = cls.role; this.fusionSlot1 = null; this.scrollY = 0
          this.clearHighlights(); this.redrawAll()
        }
      })
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEFT PANEL — Stats only (no upgrade panel)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawLeft() {
    this.leftGroup.forEach(o => o.destroy()); this.leftGroup = []
    const cls = CLASSES.find(c => c.role === this.activeRole)!
    const stats = unitStatsByRole[this.activeRole]
    const px = 4; const pw = LEFT_W - 2

    // ── Stats panel — aligned with SKILLS EQUIPADAS deck panel ──
    const deckTop = TOP_BAR_H + 8
    const deckH2 = this._deckPanelHeight()
    const py = TOP_BAR_H + 106      // below enlarged hex tabs
    const statsH = (deckTop + deckH2) - py

    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 0.92); bg.fillRoundedRect(px, py, pw, statsH, radii.lg)
    bg.lineStyle(1, border.default, 1); bg.strokeRoundedRect(px, py, pw, statsH, radii.lg)
    // Top inset highlight
    bg.fillStyle(0xffffff, 0.04)
    bg.fillRoundedRect(px + 2, py + 2, pw - 4, 18, { tl: radii.lg - 1, tr: radii.lg - 1, bl: 0, br: 0 })
    // Class accent left rule (4px)
    bg.fillStyle(cls.color, 0.85)
    bg.fillRoundedRect(px, py + 4, 4, statsH - 8, { tl: radii.sm, bl: radii.sm, tr: 0, br: 0 })
    this.leftGroup.push(bg)

    // Class name — Cormorant h3 class-color
    this.leftGroup.push(this.add.text(px + pw / 2, py + 26, cls.label, {
      fontFamily: fontFamily.serif, fontSize: typeScale.h3,
      color: cls.colorHex, fontStyle: '600',
    }).setOrigin(0.5))

    // Class sigil tinted
    const sigilKey = getClassSigilKey(cls.role as CharClass)
    const sigil = this.add.image(px + 26, py + 26, sigilKey)
      .setDisplaySize(20, 20).setTintFill(cls.color).setAlpha(0.85)
    this.leftGroup.push(sigil)

    // Decorative divider
    const lineY = py + 48
    const lineG = this.add.graphics()
    for (let li = 0; li < pw - 30; li++) {
      const t = 1 - Math.abs(li - (pw - 30) / 2) / ((pw - 30) / 2)
      lineG.fillStyle(cls.color, 0.25 * t); lineG.fillRect(px + 15 + li, lineY, 1, 1)
    }
    this.leftGroup.push(lineG)

    // Stat bars centered vertically
    const bx = px + 14; const bw = pw - 28; const bh = 8; const bGap = 24
    const statsBlockH = STAT_CFG.length * bGap
    const bStartY = py + 64 + (statsH - 64 - 12 - statsBlockH) / 2

    STAT_CFG.forEach((s, i) => {
      const sy = bStartY + i * bGap
      const val = stats[s.key]; const ratio = val / s.max
      const barTrackW = bw - 62

      // Label — Manrope meta uppercase
      this.leftGroup.push(this.add.text(bx, sy, s.label, {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: s.hex, fontStyle: '700',
      }).setOrigin(0, 0.5).setLetterSpacing(1.6))

      // Bar track
      const barX = bx + 34
      const barY = sy - bh / 2
      const g = this.add.graphics()
      g.fillStyle(surface.deepest, 1); g.fillRoundedRect(barX, barY, barTrackW, bh, bh / 2)
      const fw = Math.max(bh, barTrackW * ratio)
      g.fillStyle(s.color, 1); g.fillRoundedRect(barX, barY, fw, bh, bh / 2)
      g.fillStyle(0xffffff, 0.14); g.fillRoundedRect(barX, barY, fw, bh * 0.4,
        { tl: bh / 2, tr: bh / 2, bl: 0, br: 0 })
      this.leftGroup.push(g)

      // Value — Mono tabular
      this.leftGroup.push(this.add.text(bx + bw, sy, `${val}`, {
        fontFamily: fontFamily.mono, fontSize: typeScale.small,
        color: fg.primaryHex, fontStyle: '700',
      }).setOrigin(1, 0.5))
    })

    // ── Character sprite panel (aligned with INVENTARIO panel below) ──
    const invTopY = TOP_BAR_H + 8 + deckH2 + 6
    const spriteY = invTopY
    const spriteH = H - spriteY - 8

    const spriteBg = this.add.graphics()
    spriteBg.fillStyle(surface.panel, 0.88)
    spriteBg.fillRoundedRect(px, spriteY, pw, spriteH, radii.lg)
    spriteBg.lineStyle(1, border.default, 1)
    spriteBg.strokeRoundedRect(px, spriteY, pw, spriteH, radii.lg)
    // Top inset + class accent left rule
    spriteBg.fillStyle(0xffffff, 0.03)
    spriteBg.fillRoundedRect(px + 2, spriteY + 2, pw - 4, 16,
      { tl: radii.lg - 1, tr: radii.lg - 1, bl: 0, br: 0 })
    spriteBg.fillStyle(cls.color, 0.55)
    spriteBg.fillRoundedRect(px, spriteY + 4, 4, spriteH - 8,
      { tl: radii.sm, bl: radii.sm, tr: 0, br: 0 })
    this.leftGroup.push(spriteBg)

    // Character sprite large + name label
    const spriteCx = px + pw / 2
    const spriteCy = spriteY + spriteH / 2

    // Soft colored glow behind the sprite
    const glowRadius = Math.min(pw, spriteH) * 0.38
    const iconGlow = this.add.circle(spriteCx, spriteCy - 18, glowRadius, cls.color, 0)
    this.leftGroup.push(iconGlow)
    this.tweens.add({
      targets: iconGlow,
      alpha: { from: 0.04, to: 0.14 },
      duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Character sprite — fills most of the panel, leaving room for the name below
    const charClass = cls.role as CharClass
    const skin = playerData.getEquippedSkin?.(charClass) ?? 'idle'
    const nameReserve = 32  // space below sprite for the class name
    const spriteMaxW = pw - 40
    const spriteMaxH = spriteH - nameReserve - 24

    if (hasCharacterSprite(this, charClass, skin)) {
      const sprite = this.add.image(spriteCx, spriteCy - nameReserve / 2, getCharacterKey(charClass, skin))
      const scale = Math.min(spriteMaxW / sprite.width, spriteMaxH / sprite.height)
      sprite.setScale(scale)
      this.leftGroup.push(sprite)
    } else {
      // Fallback: larger vector class icon
      const fallbackSize = Math.min(spriteMaxW, spriteMaxH) * 0.55
      const largeIcon = UI.classIcon(this, spriteCx, spriteCy - nameReserve / 2, cls.role, fallbackSize, cls.color)
      this.leftGroup.push(largeIcon)
    }

    // Character name under sprite — Cormorant h3 class-color
    this.leftGroup.push(this.add.text(spriteCx, spriteY + spriteH - 22, cls.label, {
      fontFamily: fontFamily.serif, fontSize: typeScale.h3,
      color: cls.colorHex, fontStyle: '600',
    }).setOrigin(0.5))
  }

  /** Unified deck panel height — used by both drawLeft and drawDeck
   *  to keep stats/sprite aligned with deck/inventory panels. */
  private _deckPanelHeight(): number {
    return 36 + DECK_ROWS * DECK_CARD_H + (DECK_ROWS - 1) * DECK_GAP + 28 // header + rows + UPAR chip room
  }

  /** Deck grid origin — shared source of truth for drawDeck + highlight helpers */
  private _deckGridGeometry() {
    const dx = CONTENT_X
    const dy = TOP_BAR_H + 8
    const dw = CONTENT_W
    const gridW = DECK_COLS * DECK_CARD_W + (DECK_COLS - 1) * DECK_GAP
    return {
      gridStartX: dx + (dw - gridW) / 2,
      gridStartY: dy + 36,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DECK SECTION — Uses UI.skillCard for equipped skills
  // ═══════════════════════════════════════════════════════════════════════════

  private drawDeck() {
    this.deckGroup.forEach(o => o.destroy()); this.deckGroup = []
    this.deckCardPositions = []
    const cfg = (playerData.getDeckConfig()[this.activeRole]) ?? { attackCards: [] as string[], defenseCards: [] as string[] }
    const cls = CLASSES.find(c => c.role === this.activeRole)!
    const dx = CONTENT_X; const dy = TOP_BAR_H + 8; const dw = CONTENT_W
    const deckH = this._deckPanelHeight()

    // Panel — surface.panel + border.default + radii.lg
    const pg = this.add.graphics()
    pg.fillStyle(surface.panel, 0.92); pg.fillRoundedRect(dx, dy, dw, deckH, radii.lg)
    pg.lineStyle(1, border.default, 1); pg.strokeRoundedRect(dx, dy, dw, deckH, radii.lg)
    // Top inset highlight
    pg.fillStyle(0xffffff, 0.03)
    pg.fillRoundedRect(dx + 2, dy + 2, dw - 4, 18,
      { tl: radii.lg - 1, tr: radii.lg - 1, bl: 0, br: 0 })
    // Class accent top rule (3px)
    pg.fillStyle(cls.color, 0.55)
    pg.fillRoundedRect(dx, dy, dw, 3, { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })
    this.deckGroup.push(pg)

    // Click on deck panel background → deselect
    const deckBgHit = this.add.rectangle(dx + dw / 2, dy + deckH / 2, dw, deckH, 0, 0.001)
      .setInteractive().setDepth(1)
    this.deckGroup.push(deckBgHit)
    deckBgHit.on('pointerdown', () => {
      // Delay slightly so card hits process first and can set the flag
      this.time.delayedCall(30, () => {
        if (this._deckCardClicked) { this._deckCardClicked = false; return }
        if (this.fusionSlot1 || this.deckSelecting) {
          this.fusionSlot1 = null; this.deckSelecting = null
          this._clickTooltip?.destroy(true); this._clickTooltip = null
          this.clearHighlights(); this.redrawAll()
        }
      })
    })

    // Deck card hover tooltip uses the global showTooltipAt (defined in drawInventory)
    // We handle it via the deck card hit areas below

    // Title — Manrope meta letterSpacing 1.6, accent.primary
    const eq = cfg.attackCards.filter(Boolean).length + cfg.defenseCards.filter(Boolean).length
    this.deckGroup.push(this.add.text(dx + 16, dy + 18, 'SKILLS EQUIPADAS', {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8))
    this.deckGroup.push(this.add.text(dx + dw - 16, dy + 18, `${eq} / 8`, {
      fontFamily: fontFamily.mono, fontSize: typeScale.small,
      color: eq === 8 ? state.successHex : fg.tertiaryHex,
      fontStyle: '700',
    }).setOrigin(1, 0.5))

    // 2x4 grid of equipped cards — canonical 120x160 vertical cards
    const gridStartX = dx + (dw - (DECK_COLS * DECK_CARD_W + (DECK_COLS - 1) * DECK_GAP)) / 2
    const gridStartY = dy + 36
    const groups = [
      { label: 'ATK 1', ids: cfg.attackCards, start: 0, end: 2, cat: 'attack' },
      { label: 'ATK 2', ids: cfg.attackCards, start: 2, end: 4, cat: 'attack' },
      { label: 'DEF 1', ids: cfg.defenseCards, start: 0, end: 2, cat: 'defense' },
      { label: 'DEF 2', ids: cfg.defenseCards, start: 2, end: 4, cat: 'defense' },
    ]

    groups.forEach((grp, gi) => {
      const col = gi % DECK_COLS
      const cardX = gridStartX + col * (DECK_CARD_W + DECK_GAP)
      const cardY = gridStartY

      for (let si = grp.start; si < grp.end; si++) {
        const row = si - grp.start
        const cy = cardY + row * (DECK_CARD_H + DECK_GAP)
        const sid = grp.ids[si]

        if (sid) {
          const def = this.getSkillDef(sid)
          const owned = this.findOwnedSkill(sid)
          if (def && owned) {
            const card = UI.skillCard(this, cardX + DECK_CARD_W / 2, cy + DECK_CARD_H / 2, {
              name: def.name, effectType: def.effectType, power: def.power,
              group: def.group, unitClass: owned.unitClass, level: owned.level,
              progress: owned.progress, skillId: sid, description: def.description,
            }, {
              orientation: 'vertical',
              width: DECK_CARD_W, height: DECK_CARD_H,
              equipped: true, showTooltip: false,
            })
            this.deckGroup.push(card)

            // Register deck card position for click/tooltip/swap
            this.deckCardPositions.push({
              x: cardX, y: cy, skillId: sid, slotIdx: si, category: grp.cat, group: def.group,
            })

            // UPAR chip — floats BELOW the card (Decision B)
            const canUp = owned.progress >= owned.level && owned.level < MAX_SKILL_LEVEL
            if (canUp) {
              const costDeck = playerData.getUpgradeCost(owned.level)
              const affordDeck = this.gold >= costDeck
              const chipCx = cardX + DECK_CARD_W / 2
              const chipCy = cy + DECK_CARD_H / 2 + UPAR_CHIP_OFFSET_Y
              const chip = this._buildUparChip(chipCx, chipCy, costDeck, affordDeck, sid)
              chip.setDepth(4)
              this.deckGroup.push(chip)
            }

            // Click on deck card → select for swap + drag + tooltip
            const deckCardHit = this.add.rectangle(cardX + DECK_CARD_W / 2, cy + DECK_CARD_H / 2, DECK_CARD_W, DECK_CARD_H, 0, 0.001)
              .setInteractive({ useHandCursor: true }).setDepth(3)
            this.deckGroup.push(deckCardHit)
            const capturedSid = sid
            const capturedSlot = si
            const capturedCat = grp.cat
            const capturedGroup = def.group
            const capturedOwned = owned

            // Tooltip on hover
            // Hover — show detail NEXT TO the card (floating)
            deckCardHit.on('pointerover', () => {
              const dDef = this.getSkillDef(capturedSid)
              if (dDef) {
                const ttX = Math.min(cardX + DECK_CARD_W + 165, W - 165)
                const ttY = Phaser.Math.Clamp(cy + DECK_CARD_H / 2, 195, H - 195)
                const ttCont = UI.skillDetailCard(this, ttX, ttY, {
                  skillId: capturedSid,
                  name: dDef.name, effectType: dDef.effectType, power: dDef.power,
                  group: dDef.group, unitClass: capturedOwned.unitClass, level: capturedOwned.level,
                  progress: capturedOwned.progress, description: dDef.description,
                  longDescription: dDef.longDescription,
                  targetType: dDef.targetType, range: dDef.range,
                  secondaryEffect: dDef.secondaryEffect ?? null,
                })
                deckCardHit.setData('tooltip', ttCont)
              }
            })
            deckCardHit.on('pointerout', () => {
              const tt = deckCardHit.getData('tooltip') as Phaser.GameObjects.Container | undefined
              tt?.destroy(true); deckCardHit.setData('tooltip', null)
            })

            deckCardHit.on('pointerdown', (_p: Phaser.Input.Pointer) => {
              this._deckCardClicked = true
              // Destroy tooltip
              const tt = deckCardHit.getData('tooltip') as Phaser.GameObjects.Container | undefined
              tt?.destroy(true); deckCardHit.setData('tooltip', null)
              // UPAR chip handles its own click — no in-card area to guard

              // Click-select with highlight + show detail (no drag from deck)
              this.onDeckCardClick(capturedSid, capturedSlot, capturedCat, capturedGroup)
              // Show detail card
              const clickDef = this.getSkillDef(capturedSid)
              if (clickDef) {
                this._clickTooltip?.destroy(true)
                const dkH2 = this._deckPanelHeight()
                const spY2 = TOP_BAR_H + 8 + dkH2 + 6
                const spH2 = H - spY2 - 8
                this._clickTooltip = UI.skillDetailCard(this, LEFT_W / 2, spY2 + spH2 / 2, {
                  skillId: capturedSid,
                  name: clickDef.name, effectType: clickDef.effectType, power: clickDef.power,
                  group: clickDef.group, unitClass: capturedOwned.unitClass, level: capturedOwned.level,
                  progress: capturedOwned.progress, description: clickDef.description,
                  longDescription: clickDef.longDescription,
                  targetType: clickDef.targetType, range: clickDef.range,
                  secondaryEffect: clickDef.secondaryEffect ?? null,
                })
              }
            })
          }
        } else {
          // Empty slot — dashed border in accent dim + "Vazio" placeholder
          const eg = this.add.graphics()
          eg.fillStyle(surface.deepest, 0.55)
          eg.fillRoundedRect(cardX, cy, DECK_CARD_W, DECK_CARD_H, radii.md)
          // Dashed border (drawn as a series of short segments)
          for (let di = 0; di < DECK_CARD_W; di += 6) {
            eg.fillStyle(accent.dim, 0.55)
            eg.fillRect(cardX + di, cy, 3, 1)
            eg.fillRect(cardX + di, cy + DECK_CARD_H - 1, 3, 1)
          }
          for (let di = 0; di < DECK_CARD_H; di += 6) {
            eg.fillStyle(accent.dim, 0.55)
            eg.fillRect(cardX, cy + di, 1, 3)
            eg.fillRect(cardX + DECK_CARD_W - 1, cy + di, 1, 3)
          }
          this.deckGroup.push(eg)
          this.deckGroup.push(this.add.text(cardX + DECK_CARD_W / 2, cy + DECK_CARD_H / 2, 'Vazio', {
            fontFamily: fontFamily.body, fontSize: typeScale.meta,
            color: fg.disabledHex, fontStyle: '700',
          }).setOrigin(0.5).setLetterSpacing(1.6))
        }
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INVENTORY — Scrollable grid using UI.skillCard, with inline UPAR button
  // ═══════════════════════════════════════════════════════════════════════════

  private drawInventory() {
    this.invGroup.forEach(o => o.destroy()); this.invGroup = []
    this.invContainer?.destroy(true); this.invContainer = null

    const cls = CLASSES.find(c => c.role === this.activeRole)!
    const deckH = this._deckPanelHeight()
    const ix = CONTENT_X; const iy = TOP_BAR_H + 8 + deckH + 6; const iw = CONTENT_W; const ih = H - iy - 8

    // Panel — surface.panel + border.default + radii.lg + top inset
    const pg = this.add.graphics()
    pg.fillStyle(surface.panel, 0.92); pg.fillRoundedRect(ix, iy, iw, ih, radii.lg)
    pg.lineStyle(1, border.default, 1); pg.strokeRoundedRect(ix, iy, iw, ih, radii.lg)
    pg.fillStyle(0xffffff, 0.03)
    pg.fillRoundedRect(ix + 2, iy + 2, iw - 4, 18,
      { tl: radii.lg - 1, tr: radii.lg - 1, bl: 0, br: 0 })
    // Subtle class-tinted top rule
    pg.fillStyle(cls.color, 0.3)
    pg.fillRoundedRect(ix, iy, iw, 2, { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })
    this.invGroup.push(pg)

    // Title — Manrope meta + hint on the right
    this.invGroup.push(this.add.text(ix + 16, iy + 18, 'INVENTÁRIO', {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8))
    this.invGroup.push(this.add.text(ix + iw - 16, iy + 18, 'Clique ou arraste para equipar', {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '500',
    }).setOrigin(1, 0.5))

    const filtered = this.getFilteredSkills()
    const equippedSet = this.getEquippedIds()
    const contentX = ix + 8; const contentY = iy + 36; const contentW = iw - 16; const contentH = ih - 44

    const container = this.add.container(contentX, contentY - this.scrollY)
    this.invContainer = container
    this.invCardPositions = []

    // Scroll mask
    const maskG = this.add.graphics().setVisible(false)
    maskG.fillStyle(0xffffff); maskG.fillRect(contentX, contentY, contentW, contentH)
    container.setMask(maskG.createGeometryMask())
    this.invGroup.push(maskG)

    const groupLabels: Record<string, string> = {
      attack1: 'ATAQUE · DANO', attack2: 'ATAQUE · CONTROLE',
      defense1: 'DEFESA · FORTE', defense2: 'DEFESA · LEVE',
    }
    // Group header tint aligned with DeckBuildScene (state-based semantic)
    const groupTint: Record<string, string> = {
      attack1: state.errorHex,
      attack2: accent.hotHex,
      defense1: state.infoHex,
      defense2: state.successHex,
    }

    let cursorY = 0

    GROUP_ORDER.forEach(group => {
      // All skills of this group (for counting total owned)
      const allGroupSkills = filtered.filter(s => { const d = this.getSkillDef(s.skill.skillId); return d && d.group === group })
      // Only NON-equipped skills shown in inventory
      const skills = allGroupSkills.filter(s => !equippedSet.has(s.skill.skillId))
      const totalOwned = allGroupSkills.length
      const maxPerGroup = 4 // each group has 4 possible skills

      // Group header: "ATAQUE · DANO   2/4"
      container.add(this.add.text(4, cursorY, groupLabels[group] ?? group, {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: groupTint[group] ?? accent.primaryHex,
        fontStyle: '700',
      }).setLetterSpacing(1.6))
      container.add(this.add.text(contentW - 8, cursorY, `${totalOwned} / ${maxPerGroup}`, {
        fontFamily: fontFamily.mono, fontSize: typeScale.meta,
        color: fg.tertiaryHex, fontStyle: '700',
      }).setOrigin(1, 0))
      cursorY += 20

      if (skills.length === 0) {
        // No unequipped skills in this group
        container.add(this.add.text(4, cursorY + 6, 'Todas equipadas', {
          fontFamily: fontFamily.body, fontSize: typeScale.small,
          color: fg.disabledHex, fontStyle: '500',
        }))
        cursorY += 26
        return
      }

      // Stride per row = card + chip space below (so chip never overlaps next row)
      const ROW_STRIDE = INV_CARD_H + INV_GAP + 18
      const COL_STRIDE = INV_CARD_W + INV_GAP

      skills.forEach((item, gi) => {
        const col = gi % INV_COLS; const row = Math.floor(gi / INV_COLS)
        const cx = col * COL_STRIDE + INV_CARD_W / 2
        const cy = cursorY + row * ROW_STRIDE + INV_CARD_H / 2
        const isSelected = this.fusionSlot1?.idx === item.origIdx
        const def = this.getSkillDef(item.skill.skillId)
        if (!def) return

        const canUpgrade = item.skill.progress >= item.skill.level && item.skill.level < MAX_SKILL_LEVEL
        const cost = playerData.getUpgradeCost(item.skill.level)
        const canAfford = this.gold >= cost

        // Canonical 120x160 vertical skill card
        const card = UI.skillCard(this, cx, cy, {
          name: def.name, effectType: def.effectType, power: def.power,
          group: def.group, unitClass: item.skill.unitClass, level: item.skill.level,
          progress: item.skill.progress, skillId: item.skill.skillId, description: def.description,
        }, {
          orientation: 'vertical',
          width: INV_CARD_W, height: INV_CARD_H,
          showTooltip: false,
        })

        if (isSelected) {
          const glow = this.add.graphics()
          glow.lineStyle(2, accent.primary, 0.85)
          glow.strokeRoundedRect(-INV_CARD_W / 2 - 2, -INV_CARD_H / 2 - 2,
            INV_CARD_W + 4, INV_CARD_H + 4, radii.md)
          card.add(glow)
        }

        container.add(card)

        // UPAR chip below the card (kept OUTSIDE the card container so it
        // scrolls with the inventory mask and can receive its own clicks).
        if (canUpgrade) {
          const chipCy = cy + INV_CARD_H / 2 + 14
          const chip = this._buildUparChip(cx, chipCy, cost, canAfford, item.skill.skillId)
          container.add(chip)
        }

        // Register position for click detection
        this.invCardPositions.push({
          cx: contentX + cx, cy: contentY + cy,
          skill: item.skill, origIdx: item.origIdx,
          canUpgrade, canAfford, isEquipped: false,
        })
      })

      const rows = Math.ceil(skills.length / INV_COLS)
      cursorY += rows * ROW_STRIDE + 10
    })

    // Scroll — use scene-level wheel event so it doesn't block card clicks
    const maxScroll = Math.max(0, cursorY - contentH)
    const invBounds = new Phaser.Geom.Rectangle(ix, iy, iw, ih)

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _go: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (!invBounds.contains(_p.x, _p.y)) return
      this.scrollY = Phaser.Math.Clamp(this.scrollY + dy * 0.4, 0, maxScroll)
      container.y = contentY - this.scrollY
    })

    // ── Global tooltip (for both inv and deck) ──
    const destroyClickTooltip = () => { this._clickTooltip?.destroy(true); this._clickTooltip = null }

    const showTooltipAt = (skillId: string, _anchorX: number, _anchorY: number) => {
      destroyClickTooltip()
      const def = this.getSkillDef(skillId)
      if (!def) return
      const owned = this.findOwnedSkill(skillId)
      // Show in left panel — below stats, centered in sprite area
      const deckH2 = 32 + 2 * DECK_CARD_H + DECK_GAP + 10
      const spriteAreaY = TOP_BAR_H + 8 + deckH2 + 6
      const spriteAreaH = H - spriteAreaY - 8
      const ttX = LEFT_W / 2
      const ttY = spriteAreaY + spriteAreaH / 2
      this._clickTooltip = UI.skillDetailCard(this, ttX, ttY, {
        skillId,
        name: def.name, effectType: def.effectType, power: def.power,
        group: def.group, unitClass: owned?.unitClass ?? 'king', level: owned?.level ?? 1,
        progress: owned?.progress ?? 0, description: def.description,
        longDescription: def.longDescription,
        targetType: def.targetType, range: def.range,
        secondaryEffect: def.secondaryEffect ?? null,
      })
    }

    // ── Interaction zone for inventory ──
    const invClickZone = this.add.rectangle(ix + iw / 2, iy + ih / 2, iw, ih, 0, 0.001)
      .setInteractive({ useHandCursor: true }).setDepth(4)
    this.invGroup.push(invClickZone)

    // Helper: find inv card at pointer
    const findInvCard = (mx: number, my: number) => {
      const hw = INV_CARD_W / 2; const hh = INV_CARD_H / 2
      for (const pos of this.invCardPositions) {
        const ay = pos.cy - this.scrollY
        if (mx >= pos.cx - hw && mx <= pos.cx + hw && my >= ay - hh && my <= ay + hh) return pos
      }
      return null
    }

    // Hover tooltip — show NEXT TO the card (floating)
    const destroyHover = () => { this._hoverTooltip?.destroy(true); this._hoverTooltip = null }

    invClickZone.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragCard) { destroyHover(); return }
      const pos = findInvCard(p.x, p.y)
      if (pos) {
        destroyHover()
        const def = this.getSkillDef(pos.skill.skillId)
        if (!def) return
        const owned = this.findOwnedSkill(pos.skill.skillId)
        const ttX = Math.min(pos.cx + INV_CARD_W / 2 + 165, W - 165)
        const ttY = Phaser.Math.Clamp(pos.cy - this.scrollY, 195, H - 195)
        this._hoverTooltip = UI.skillDetailCard(this, ttX, ttY, {
          skillId: pos.skill.skillId,
          name: def.name, effectType: def.effectType, power: def.power,
          group: def.group, unitClass: owned?.unitClass ?? 'king', level: owned?.level ?? 1,
          progress: owned?.progress ?? 0, description: def.description,
          longDescription: def.longDescription,
          targetType: def.targetType, range: def.range,
          secondaryEffect: def.secondaryEffect ?? null,
        })
      } else { destroyHover() }
    })
    invClickZone.on('pointerout', destroyHover)

    // Click + drag start
    invClickZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      destroyClickTooltip()
      destroyHover()
      this._destroyAllHoverTooltips()
      const pos = findInvCard(pointer.x, pointer.y)

      if (pos) {
        // UPAR chip handles its own click below each card — no in-card guard
        // needed. The chip's hit area stopPropagation prevents the event
        // from bubbling into this zone when the user clicks it directly.

        // Deck-selecting mode: replace deck slot
        if (this.deckSelecting && !pos.isEquipped) {
          const posDef = this.getSkillDef(pos.skill.skillId)
          if (posDef && posDef.group === this.deckSelecting.group) {
            this.equipSkill(pos.skill, this.deckSelecting.slotIdx, this.deckSelecting.category)
            this.deckSelecting = null; return
          }
        }

        if (pos.isEquipped) return

        // Start drag — create visual card at screen position
        this.dragSource = { skill: pos.skill, origIdx: pos.origIdx, fromDeck: false }
        const dragAy = pos.cy - this.scrollY
        const dragDef = this.getSkillDef(pos.skill.skillId)
        if (dragDef) {
          const dragCard = UI.skillCard(this, pos.cx, dragAy, {
            name: dragDef.name, effectType: dragDef.effectType, power: dragDef.power,
            group: dragDef.group, unitClass: pos.skill.unitClass, level: pos.skill.level,
            progress: pos.skill.progress, description: dragDef.description,
          }, { width: INV_CARD_W, height: INV_CARD_H })
          dragCard.setDepth(200).setAlpha(0.9)
          this.dragCard = dragCard
          this.dragOrigX = pos.cx
          this.dragOrigY = dragAy
          this.dragOrigDepth = 0
        }

        // Also do normal select + show detail in left panel (only if actually selected)
        this.deckSelecting = null
        this.onInventoryClick(pos.skill, pos.origIdx)
        // Only show tooltip if the card is now selected (not if it was toggled off)
        if (this.fusionSlot1) {
          showTooltipAt(pos.skill.skillId, 0, 0)
        }
        return
      }

      // Empty area → deselect + hide detail
      this.fusionSlot1 = null; this.deckSelecting = null
      destroyClickTooltip()
      this.clearHighlights(); this.redrawAll()
    })

    // ── Global drag move + drop ──
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragCard) {
        this.dragCard.setPosition(p.x, p.y)
      }
    })

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.dragCard || !this.dragSource) return
      const card = this.dragCard
      const src = this.dragSource
      this.dragCard = null
      this.dragSource = null

      // Check if dropped on a deck slot
      for (const dp of this.deckCardPositions) {
        if (p.x >= dp.x && p.x <= dp.x + DECK_CARD_W && p.y >= dp.y && p.y <= dp.y + DECK_CARD_H) {
          const srcDef = this.getSkillDef(src.skill.skillId)
          if (!srcDef || srcDef.group !== dp.group) continue  // try next slot

          if (src.fromDeck && src.slotIdx !== undefined && src.category) {
            // Deck → Deck swap
            const cfg2 = (playerData.getDeckConfig()[this.activeRole]) ?? { attackCards: [] as string[], defenseCards: [] as string[] }
            const cards2 = src.category === 'attack' ? [...cfg2.attackCards] : [...cfg2.defenseCards]
            const tmp = cards2[src.slotIdx]; cards2[src.slotIdx] = cards2[dp.slotIdx]; cards2[dp.slotIdx] = tmp
            if (src.category === 'attack') playerData.saveDeckConfig(this.activeRole, cards2, cfg2.defenseCards)
            else playerData.saveDeckConfig(this.activeRole, cfg2.attackCards, cards2)
          } else {
            // Inventory → Deck equip
            card.destroy(true)
            this.equipSkill(src.skill, dp.slotIdx, dp.category)
            return
          }
          card.destroy(true)
          this._clickTooltip?.destroy(true); this._clickTooltip = null
          this.clearHighlights(); this.fusionSlot1 = null; this.loadData(); this.redrawAll()
          return
        }
      }

      // Dropped elsewhere → animate card back to original position
      card.setAlpha(1)
      this.tweens.add({
        targets: card,
        x: this.dragOrigX, y: this.dragOrigY,
        duration: 250, ease: 'Back.Out',
        onComplete: () => {
          if (src.fromDeck) {
            card.setDepth(this.dragOrigDepth)
          } else {
            card.destroy(true) // inventory card copy → destroy after snap back
          }
        },
      })
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private onInventoryClick(skill: OwnedSkill, idx: number) {
    this.clearHighlights()
    if (this.fusionSlot1?.idx === idx) { this.fusionSlot1 = null; this._clickTooltip?.destroy(true); this._clickTooltip = null; this.redrawAll(); return }
    this.fusionSlot1 = { skill, idx }
    this.redrawAll()

    // Accent glow on selected inventory card
    const pos = this.invCardPositions.find(p => p.origIdx === idx)
    if (pos) {
      const ay = pos.cy - this.scrollY
      const selGlow = this.add.graphics().setDepth(10)
      selGlow.lineStyle(3, accent.primary, 1)
      selGlow.strokeRoundedRect(pos.cx - INV_CARD_W / 2 - 3, ay - INV_CARD_H / 2 - 3, INV_CARD_W + 6, INV_CARD_H + 6, radii.md)
      this.highlightObjs.push(selGlow)
      this.highlightTweens.push(this.tweens.add({ targets: selGlow, alpha: { from: 0.6, to: 1 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' }))
    }

    // Gold glow on valid deck slots
    this.showEquipHighlight(skill)
  }

  /** Click on an equipped deck card → highlight compatible inventory cards + other deck slot for swap */
  private onDeckCardClick(_skillId: string, slotIdx: number, category: string, group: string) {
    this.clearHighlights()
    this.fusionSlot1 = null

    const { gridStartX, gridStartY } = this._deckGridGeometry()
    const groupToCol: Record<string, number> = { attack1: 0, attack2: 1, defense1: 2, defense2: 3 }
    const col = groupToCol[group] ?? 0
    const baseX = gridStartX + col * (DECK_CARD_W + DECK_GAP)

    let startSlot: number; let endSlot: number
    if (group === 'attack1' || group === 'defense1') { startSlot = 0; endSlot = 2 }
    else { startSlot = 2; endSlot = 4 }

    // ── ACCENT glow on SELECTED deck card (different from swap target) ──
    const selRow = slotIdx - startSlot
    const selY = gridStartY + selRow * (DECK_CARD_H + DECK_GAP)
    const selGlow = this.add.graphics().setDepth(10)
    selGlow.lineStyle(3, accent.primary, 1)
    selGlow.strokeRoundedRect(baseX - 3, selY - 3, DECK_CARD_W + 6, DECK_CARD_H + 6, radii.md)
    this.highlightObjs.push(selGlow)
    this.highlightTweens.push(this.tweens.add({ targets: selGlow, alpha: { from: 0.6, to: 1 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' }))

    // ── INFO glow on OTHER deck slot (swap within deck) ──
    for (let si = startSlot; si < endSlot; si++) {
      if (si === slotIdx) continue
      const row = si - startSlot
      const cardY = gridStartY + row * (DECK_CARD_H + DECK_GAP)

      const glow = this.add.graphics().setDepth(10)
      glow.lineStyle(2.5, state.info, 0.9)
      glow.strokeRoundedRect(baseX - 3, cardY - 3, DECK_CARD_W + 6, DECK_CARD_H + 6, radii.md)
      this.highlightObjs.push(glow)
      this.highlightTweens.push(this.tweens.add({ targets: glow, alpha: { from: 0.4, to: 1 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' }))

      const hit = this.add.rectangle(baseX + DECK_CARD_W / 2, cardY + DECK_CARD_H / 2, DECK_CARD_W, DECK_CARD_H, 0, 0.001)
        .setInteractive({ useHandCursor: true }).setDepth(11)
      this.highlightObjs.push(hit)

      // Hover on cyan slot → show floating detail of the skill in that slot
      const swapCfg = (playerData.getDeckConfig()[this.activeRole]) ?? { attackCards: [] as string[], defenseCards: [] as string[] }
      const swapCards = category === 'attack' ? swapCfg.attackCards : swapCfg.defenseCards
      const swapSkillId = swapCards[si]
      if (swapSkillId) {
        hit.on('pointerover', () => {
          const sDef = this.getSkillDef(swapSkillId)
          if (!sDef) return
          const sOwned = this.findOwnedSkill(swapSkillId)
          const ttX2 = Math.min(baseX + DECK_CARD_W + 165, W - 165)
          const ttY2 = Phaser.Math.Clamp(cardY + DECK_CARD_H / 2, 195, H - 195)
          this._hoverTooltip = UI.skillDetailCard(this, ttX2, ttY2, {
            skillId: swapSkillId,
            name: sDef.name, effectType: sDef.effectType, power: sDef.power,
            group: sDef.group, unitClass: sOwned?.unitClass ?? 'king', level: sOwned?.level ?? 1,
            progress: sOwned?.progress ?? 0, description: sDef.description,
            longDescription: sDef.longDescription,
            targetType: sDef.targetType, range: sDef.range,
            secondaryEffect: sDef.secondaryEffect ?? null,
          })
        })
        hit.on('pointerout', () => { this._hoverTooltip?.destroy(true); this._hoverTooltip = null })
      }

      hit.on('pointerdown', () => {
        // Swap the two slots within the deck
        const cfg = (playerData.getDeckConfig()[this.activeRole]) ?? { attackCards: [] as string[], defenseCards: [] as string[] }
        const cards = category === 'attack' ? [...cfg.attackCards] : [...cfg.defenseCards]
        const temp = cards[slotIdx]; cards[slotIdx] = cards[si]; cards[si] = temp
        if (category === 'attack') playerData.saveDeckConfig(this.activeRole, cards, cfg.defenseCards)
        else playerData.saveDeckConfig(this.activeRole, cfg.attackCards, cards)
        this._clickTooltip?.destroy(true); this._clickTooltip = null
        this.clearHighlights(); this.loadData(); this.redrawAll()
      })
    }

    // Deck selection only allows swap within deck — no deck→inventory
    this.deckSelecting = null
  }

  private showEquipHighlight(skill: OwnedSkill) {
    const def = this.getSkillDef(skill.skillId)
    if (!def) return

    // Map group to column index (must match drawDeck layout exactly)
    // drawDeck groups: [ATK1=col0, ATK2=col1, DEF1=col2, DEF2=col3]
    const groupToCol: Record<string, number> = {
      attack1: 0, attack2: 1, defense1: 2, defense2: 3,
    }
    const targetCol = groupToCol[def.group] ?? 0

    // Slot indices within the group (each group has 2 slots: start..end)
    let startSlot: number; let endSlot: number
    if (def.group === 'attack1' || def.group === 'defense1') { startSlot = 0; endSlot = 2 }
    else { startSlot = 2; endSlot = 4 }

    // Match exact positions from drawDeck via the shared geometry helper
    const { gridStartX, gridStartY } = this._deckGridGeometry()
    const baseX = gridStartX + targetCol * (DECK_CARD_W + DECK_GAP)

    for (let si = startSlot; si < endSlot; si++) {
      const row = si - startSlot
      const cardY = gridStartY + row * (DECK_CARD_H + DECK_GAP)

      const glow = this.add.graphics().setDepth(10)
      glow.lineStyle(2.5, accent.primary, 0.9)
      glow.strokeRoundedRect(baseX - 3, cardY - 3, DECK_CARD_W + 6, DECK_CARD_H + 6, radii.md)
      this.highlightObjs.push(glow)
      const tw = this.tweens.add({ targets: glow, alpha: { from: 0.4, to: 1 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
      this.highlightTweens.push(tw)

      const hit = this.add.rectangle(baseX + DECK_CARD_W / 2, cardY + DECK_CARD_H / 2, DECK_CARD_W, DECK_CARD_H, 0, 0.001)
        .setInteractive({ useHandCursor: true }).setDepth(11)
      this.highlightObjs.push(hit)
      hit.on('pointerdown', () => this.equipSkill(skill, si, def.category))

      // Hover on highlighted slot → show floating detail card next to it
      const cfg2 = (playerData.getDeckConfig()[this.activeRole]) ?? { attackCards: [] as string[], defenseCards: [] as string[] }
      const slotCards = def.category === 'attack' ? cfg2.attackCards : cfg2.defenseCards
      const slotSkillId = slotCards[si]
      if (slotSkillId) {
        hit.on('pointerover', () => {
          const slotDef = this.getSkillDef(slotSkillId)
          if (!slotDef) return
          const slotOwned = this.findOwnedSkill(slotSkillId)
          const ttX = Math.min(baseX + DECK_CARD_W + 165, W - 165)
          const ttY = Phaser.Math.Clamp(cardY + DECK_CARD_H / 2, 195, H - 195)
          const ttCont = UI.skillDetailCard(this, ttX, ttY, {
            skillId: slotSkillId,
            name: slotDef.name, effectType: slotDef.effectType, power: slotDef.power,
            group: slotDef.group, unitClass: slotOwned?.unitClass ?? 'king', level: slotOwned?.level ?? 1,
            progress: slotOwned?.progress ?? 0, description: slotDef.description,
            longDescription: slotDef.longDescription,
            targetType: slotDef.targetType, range: slotDef.range,
            secondaryEffect: slotDef.secondaryEffect ?? null,
          })
          hit.setData('hoverTT', ttCont)
        })
        hit.on('pointerout', () => {
          const tt = hit.getData('hoverTT') as Phaser.GameObjects.Container | undefined
          tt?.destroy(true); hit.setData('hoverTT', null)
        })
      }
    }
  }

  private equipSkill(skill: OwnedSkill, slotIdx: number, category: string) {
    const cfg = (playerData.getDeckConfig()[this.activeRole]) ?? { attackCards: [] as string[], defenseCards: [] as string[] }
    const atkCards = [...cfg.attackCards]
    const defCards = [...cfg.defenseCards]

    // Ensure arrays are exactly 4 elements
    while (atkCards.length < 4) atkCards.push('')
    while (defCards.length < 4) defCards.push('')
    atkCards.length = 4
    defCards.length = 4

    const cards = category === 'attack' ? atkCards : defCards

    // Remove this skill from any other slot it might be in (prevent duplicates)
    for (let i = 0; i < atkCards.length; i++) {
      if (atkCards[i] === skill.skillId) atkCards[i] = ''
    }
    for (let i = 0; i < defCards.length; i++) {
      if (defCards[i] === skill.skillId) defCards[i] = ''
    }

    // Place skill in the target slot (swap: old skill goes back to inventory)
    cards[slotIdx] = skill.skillId

    playerData.saveDeckConfig(this.activeRole, atkCards, defCards)
    this._clickTooltip?.destroy(true); this._clickTooltip = null
    this._destroyAllHoverTooltips()
    this.clearHighlights(); this.fusionSlot1 = null; this.loadData(); this.redrawAll()
  }

  private performUpgrade(skillId: string) {
    if (playerData.upgradeSkill(skillId)) {
      this.playUpgradeAnimation()
      this.fusionSlot1 = null; this.loadData(); this.redrawAll()
    }
  }

  private playUpgradeAnimation() {
    const cx = W / 2; const cy = H / 2

    // Screen flash
    const flash = this.add.rectangle(cx, cy, W, H, 0xffffff, 0).setDepth(200)
    this.tweens.add({ targets: flash, alpha: 0.15, duration: 100, yoyo: true, onComplete: () => flash.destroy() })

    // Central burst — gold + success particles exploding outward
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 40 + Math.random() * 80
      const size = 1.5 + Math.random() * 2.5
      const color = Math.random() > 0.3 ? accent.primary : state.success
      const p = this.add.circle(cx, cy, size, color, 0.9).setDepth(201)
      this.tweens.add({
        targets: p,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: 600 + Math.random() * 400,
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      })
    }

    // Rising gold stars
    for (let i = 0; i < 8; i++) {
      const sx = cx - 60 + Math.random() * 120
      const star = this.add.circle(sx, cy + 20, 2, accent.primary, 0.85).setDepth(201)
      this.tweens.add({
        targets: star,
        y: cy - 80 - Math.random() * 40,
        alpha: 0,
        duration: 800 + Math.random() * 400,
        delay: i * 50,
        ease: 'Quad.Out',
        onComplete: () => star.destroy(),
      })
    }

    // "LEVEL UP!" text flash — Cinzel display, success-green
    const lvUpText = this.add.text(cx, cy - 20, 'LEVEL UP!', {
      fontFamily: fontFamily.display, fontSize: typeScale.displayMd,
      color: state.successHex, fontStyle: '900',
    }).setOrigin(0.5).setDepth(202).setAlpha(0).setScale(0.5).setLetterSpacing(4)
    this.tweens.add({
      targets: lvUpText,
      alpha: 1, scaleX: 1.2, scaleY: 1.2,
      duration: 300, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: lvUpText,
          alpha: 0, y: cy - 50,
          duration: 600, delay: 400, ease: 'Quad.In',
          onComplete: () => lvUpText.destroy(),
        })
      },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private getSkillDef(sid: string): SkillDefinition | undefined { return SKILL_CATALOG.find(s => s.id === sid) }
  private findOwnedSkill(sid: string): OwnedSkill | undefined { return this.allSkills.find(s => s.skillId === sid) }

  private getFilteredSkills(): { skill: OwnedSkill; origIdx: number }[] {
    const prefix = CLASSES.find(c => c.role === this.activeRole)!.prefix
    const result: { skill: OwnedSkill; origIdx: number }[] = []
    this.allSkills.forEach((s, i) => { if (s.skillId.startsWith(prefix)) result.push({ skill: s, origIdx: i }) })
    result.sort((a, b) => {
      const da = this.getSkillDef(a.skill.skillId); const db = this.getSkillDef(b.skill.skillId)
      if (!da || !db) return 0
      const ga = GROUP_ORDER.indexOf(da.group); const gb = GROUP_ORDER.indexOf(db.group)
      if (ga !== gb) return ga - gb
      return da.name.localeCompare(db.name)
    })
    return result
  }

  private getEquippedIds(): Set<string> {
    const cfg = (playerData.getDeckConfig()[this.activeRole]) ?? { attackCards: [] as string[], defenseCards: [] as string[] }
    return new Set([...cfg.attackCards, ...cfg.defenseCards].filter(Boolean))
  }

  private clearHighlights() {
    this.highlightTweens.forEach(t => t.destroy()); this.highlightTweens = []
    this.highlightObjs.forEach(o => o.destroy()); this.highlightObjs = []
  }

  /**
   * UPAR chip — floats BELOW the canonical 120x160 card so the card's own
   * footer (DMG/CD per INTEGRATION_SPEC §2) stays untouched. Self-contained
   * interactive container; click invokes performUpgrade(skillId) directly.
   *
   * @returns Container at (cx, cy) sized UPAR_CHIP_W x UPAR_CHIP_H.
   */
  private _buildUparChip(
    cx: number, cy: number, cost: number, canAfford: boolean, skillId?: string,
  ): Phaser.GameObjects.Container {
    const w = UPAR_CHIP_W; const h = UPAR_CHIP_H
    const hw = w / 2; const hh = h / 2
    const els: Phaser.GameObjects.GameObject[] = []

    // Background
    const g = this.add.graphics()
    if (canAfford) {
      // Soft success-tinted halo
      g.fillStyle(state.success, 0.10)
      g.fillRoundedRect(-hw - 2, -hh - 2, w + 4, h + 4, radii.md)
      // Drop shadow
      g.fillStyle(0x000000, 0.35)
      g.fillRoundedRect(-hw + 1, -hh + 2, w, h, radii.md)
      // Base dark surface
      g.fillStyle(surface.deepest, 1)
      g.fillRoundedRect(-hw, -hh, w, h, radii.md)
      // Inner gradient — success dim glow
      g.fillStyle(state.successDim, 0.85)
      g.fillRoundedRect(-hw + 2, -hh + 1, w - 4, h - 2, radii.sm)
      // Top gloss
      g.fillStyle(0xffffff, 0.10)
      g.fillRoundedRect(-hw + 3, -hh + 1, w - 6, h * 0.4,
        { tl: radii.sm, tr: radii.sm, bl: 0, br: 0 })
      // Border
      g.lineStyle(1, state.success, 1)
      g.strokeRoundedRect(-hw, -hh, w, h, radii.md)
    } else {
      g.fillStyle(surface.panel, 1)
      g.fillRoundedRect(-hw, -hh, w, h, radii.md)
      g.lineStyle(1, border.subtle, 0.7)
      g.strokeRoundedRect(-hw, -hh, w, h, radii.md)
    }
    els.push(g)

    // Arrow ↑ icon (only when affordable)
    if (canAfford) {
      const arrow = this.add.graphics()
      const arrowX = -hw + 14
      arrow.fillStyle(0xffffff, 0.95)
      arrow.beginPath()
      arrow.moveTo(arrowX, -5)
      arrow.lineTo(arrowX + 4, -1)
      arrow.lineTo(arrowX - 4, -1)
      arrow.closePath()
      arrow.fillPath()
      arrow.fillRect(arrowX - 1.5, -1, 3, 5)
      els.push(arrow)
    }

    // Label — Mono tabular, white when affordable / disabled when not
    const label = canAfford ? `UPAR ${cost}g` : `${cost}g`
    els.push(this.add.text(canAfford ? 8 : 0, 0, label, {
      fontFamily: fontFamily.mono, fontSize: typeScale.meta,
      color: canAfford ? fg.primaryHex : fg.disabledHex, fontStyle: '700',
    }).setOrigin(0.5))

    const container = this.add.container(cx, cy, els)

    // Pulsing halo when affordable
    if (canAfford) {
      const pulse = this.add.rectangle(0, 0, w + 6, h + 6, state.success, 0)
      container.addAt(pulse, 0)
      this.tweens.add({
        targets: pulse, alpha: { from: 0.04, to: 0.18 },
        duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      })
    }

    // Hit area only when affordable — chip handles its own click
    if (canAfford && skillId) {
      const hit = this.add.rectangle(0, 0, w + 6, h + 6, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
        ev.stopPropagation()
        this.performUpgrade(skillId)
      })
      container.add(hit)
    }

    return container
  }

  /** Destroy any floating hover tooltips (from deck highlights or inv hover) */
  private _destroyAllHoverTooltips() {
    this._hoverTooltip?.destroy(true); this._hoverTooltip = null
    // Also destroy tooltips stored on highlight hit areas
    for (const obj of this.highlightObjs) {
      if ('getData' in obj) {
        const tt = (obj as Phaser.GameObjects.Rectangle).getData?.('hoverTT') as Phaser.GameObjects.Container | undefined
        tt?.destroy(true)
      }
    }
  }

  private redrawAll() { this._destroyAllHoverTooltips(); this.clearHighlights(); this.drawClassTabs(); this.drawLeft(); this.drawDeck(); this.drawInventory() }

  /** Fill any empty deck slots with starter skills so player never enters battle with gaps */
  private _fillEmptySlots() {
    const roles: UnitRole[] = ['king', 'warrior', 'executor', 'specialist']
    const prefixes: Record<string, string> = { king: 'lk_', warrior: 'lw_', executor: 'le_', specialist: 'ls_' }

    for (const role of roles) {
      const cfg = playerData.getDeckConfig()[role]
      if (!cfg) continue

      const atk = [...cfg.attackCards]
      const def = [...cfg.defenseCards]
      while (atk.length < 4) atk.push('')
      while (def.length < 4) def.push('')

      const prefix = prefixes[role]
      const owned = playerData.getSkills().filter(s => s.skillId.startsWith(prefix))
      const equipped = new Set([...atk, ...def].filter(Boolean))

      // Fill empty attack slots
      for (let i = 0; i < 4; i++) {
        if (atk[i]) continue
        const group = i < 2 ? 'attack1' : 'attack2'
        const available = owned.find(s => {
          if (equipped.has(s.skillId)) return false
          const d = SKILL_CATALOG.find(c => c.id === s.skillId)
          return d && d.group === group
        })
        if (available) { atk[i] = available.skillId; equipped.add(available.skillId) }
      }

      // Fill empty defense slots
      for (let i = 0; i < 4; i++) {
        if (def[i]) continue
        const group = i < 2 ? 'defense1' : 'defense2'
        const available = owned.find(s => {
          if (equipped.has(s.skillId)) return false
          const d = SKILL_CATALOG.find(c => c.id === s.skillId)
          return d && d.group === group
        })
        if (available) { def[i] = available.skillId; equipped.add(available.skillId) }
      }

      playerData.saveDeckConfig(role, atk, def)
    }
  }

  shutdown() { this.tweens.killAll() }
}
