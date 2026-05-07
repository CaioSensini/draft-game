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
import { t } from '../i18n'
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

// Left column geometry — split into a compact stats panel up top and a
// taller sprite/detail panel below. The sprite panel hosts the hover
// detail card on click; both must share the same dimensions so the
// detail card fits the panel cleanly (ETAPA 6.10 addendum).
const LEFT_STATS_TOP    = TOP_BAR_H + 106
const LEFT_STATS_H      = 200
const LEFT_SPRITE_TOP   = LEFT_STATS_TOP + LEFT_STATS_H + 8   // 370
const LEFT_SPRITE_H     = SCREEN.H - LEFT_SPRITE_TOP - 8       // 342 with H=720

interface ClassMeta {
  role: UnitRole
  prefix: string
  color: number
  colorHex: string
}

const CLASSES: ClassMeta[] = [
  { role: 'king',       prefix: 'lk_', color: C2.class.king,       colorHex: '#' + C2.class.king.toString(16).padStart(6, '0') },
  { role: 'warrior',    prefix: 'lw_', color: C2.class.warrior,    colorHex: '#' + C2.class.warrior.toString(16).padStart(6, '0') },
  { role: 'executor',   prefix: 'le_', color: C2.class.executor,   colorHex: '#' + C2.class.executor.toString(16).padStart(6, '0') },
  { role: 'specialist', prefix: 'ls_', color: C2.class.specialist, colorHex: '#' + C2.class.specialist.toString(16).padStart(6, '0') },
]

function roleLabel(role: UnitRole): string {
  return t(`skills.roles.${role}`)
}

function roleAbbr(role: UnitRole): string {
  return t(`scenes.battle.role-abbr.${role}`)
}

const STAT_CFG = [
  { key: 'maxHp' as const,    label: 'HP',  color: state.error,   hex: state.errorHex,   max: 200 },
  { key: 'attack' as const,   label: 'ATK', color: accent.primary, hex: accent.primaryHex, max: 25 },
  { key: 'defense' as const,  label: 'DEF', color: state.info,    hex: state.infoHex,    max: 20 },
  { key: 'mobility' as const, label: 'MOB', color: state.success, hex: state.successHex, max: 4 },
]

// ── Scene ────────────────────────────────────────────────────────────────────

type InventoryTab = 'attack1' | 'attack2' | 'defense1' | 'defense2'

export default class SkillUpgradeScene extends Phaser.Scene {
  private activeRole: UnitRole = 'king'
  private activeInventoryTab: InventoryTab = 'attack1'
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
  private invCardPositions: { cx: number; cy: number; skill: OwnedSkill; origIdx: number; canUpgrade: boolean; canAfford: boolean; isEquipped: boolean; cardObj?: Phaser.GameObjects.Container }[] = []
  private deckCardPositions: { x: number; y: number; skillId: string; slotIdx: number; category: string; group: string; cardObj?: Phaser.GameObjects.Container }[] = []
  /** True while a Clash-Royale-style swap animation is playing — input is locked. */
  private _swapAnimating = false
  /** Tween tracking the "lifted" card so we can revert it cleanly when the
   *  user deselects or the redraw happens. */
  private _liftedCard: Phaser.GameObjects.Container | null = null
  private _liftedCardOrig: { x: number; y: number; sx: number; sy: number } | null = null
  /** Cards that were reparented from their container into the scene's
   *  display list for the swap animation. Tracked so we can guarantee
   *  cleanup if the tween is interrupted (otherwise they'd leak as
   *  visible "ghost cards" since redrawAll only destroys items inside
   *  invContainer / deckGroup, not arbitrary scene children). */
  private _floatingSwapCards: Phaser.GameObjects.Container[] = []
  private _deckCardClicked = false
  private _clickTooltip: Phaser.GameObjects.Container | null = null
  private _hoverTooltip: Phaser.GameObjects.Container | null = null
  // Drag-and-drop for swap was removed in the Clash-Royale-style refactor —
  // the scene is now click-only. Fields retained as `null` placeholders
  // would just be dead code; the previous fields have been deleted.

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
    this.add.text(70, TOP_BAR_H / 2, t('scenes.skill-upgrade.title'), {
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
      cont.add(this.add.text(0, tabW / 2 + 8, roleAbbr(cls.role), {
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
    const { x: px, w: pw } = this._leftPanelGeometry()

    // ── Stats panel — fixed compact height so the sprite/detail panel
    //    below has enough room to host the 320×360 hover detail card
    //    without overflowing (ETAPA 6.10 addendum).
    const py = TOP_BAR_H + 106
    const statsH = LEFT_STATS_H

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
    this.leftGroup.push(this.add.text(px + pw / 2, py + 26, roleLabel(cls.role), {
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

    // ── Character sprite panel (sized to host the click detail card) ──
    const { y: spriteY, h: spriteH } = this._spritePanelRect()

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
    this.leftGroup.push(this.add.text(spriteCx, spriteY + spriteH - 22, roleLabel(cls.role), {
      fontFamily: fontFamily.serif, fontSize: typeScale.h3,
      color: cls.colorHex, fontStyle: '600',
    }).setOrigin(0.5))
  }

  /** Unified deck panel height — used by both drawLeft and drawDeck
   *  to keep stats/sprite aligned with deck/inventory panels. */
  private _deckPanelHeight(): number {
    // header + rows — UPAR is now in the card footer so no extra reserve.
    return 36 + DECK_ROWS * DECK_CARD_H + (DECK_ROWS - 1) * DECK_GAP + 12
  }

  /** Left column dims — shared by the stats panel, the sprite/portrait
   *  panel, AND the click-to-show skill detail card so they all line up
   *  (ETAPA 6.10 addendum). */
  private _leftPanelGeometry() {
    return { x: 4, w: LEFT_W - 2 }
  }

  /** Sprite/detail panel rect inside the left column — also the click
   *  detail card target rect (matching dimensions, no overflow). */
  private _spritePanelRect() {
    const { x, w } = this._leftPanelGeometry()
    return { x, y: LEFT_SPRITE_TOP, w, h: LEFT_SPRITE_H }
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
    this.deckGroup.push(this.add.text(dx + 16, dy + 18, t('scenes.skill-upgrade.deck-section.header'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8))
    this.deckGroup.push(this.add.text(dx + dw - 16, dy + 18, t('scenes.skill-upgrade.deck-section.equipped-counter', { equipped: eq }), {
      fontFamily: fontFamily.mono, fontSize: typeScale.small,
      color: eq === 8 ? state.successHex : fg.tertiaryHex,
      fontStyle: '700',
    }).setOrigin(1, 0.5))

    // 2x4 grid of equipped cards — canonical 120x160 vertical cards
    const gridStartX = dx + (dw - (DECK_COLS * DECK_CARD_W + (DECK_COLS - 1) * DECK_GAP)) / 2
    const gridStartY = dy + 36
    const groups = [
      { label: t('scenes.skill-upgrade.deck-section.slots.atk1'), ids: cfg.attackCards,  start: 0, end: 2, cat: 'attack' },
      { label: t('scenes.skill-upgrade.deck-section.slots.atk2'), ids: cfg.attackCards,  start: 2, end: 4, cat: 'attack' },
      { label: t('scenes.skill-upgrade.deck-section.slots.def1'), ids: cfg.defenseCards, start: 0, end: 2, cat: 'defense' },
      { label: t('scenes.skill-upgrade.deck-section.slots.def2'), ids: cfg.defenseCards, start: 2, end: 4, cat: 'defense' },
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
            // UPAR data feeds the in-card footer chip (ETAPA 6.4 refactor
            // retired the external _buildUparChip helper).
            const canUp = owned.progress >= owned.level && owned.level < MAX_SKILL_LEVEL
            const costDeck = canUp ? playerData.getUpgradeCost(owned.level) : 0
            const affordDeck = canUp ? this.gold >= costDeck : false
            const card = UI.skillCard(this, cardX + DECK_CARD_W / 2, cy + DECK_CARD_H / 2, {
              name: def.name, effectType: def.effectType, power: def.power,
              group: def.group, unitClass: owned.unitClass, level: owned.level,
              progress: owned.progress, skillId: sid, description: def.description,
              targetType: def.targetType, areaShape: def.areaShape ?? null,
            }, {
              orientation: 'vertical',
              width: DECK_CARD_W, height: DECK_CARD_H,
              equipped: true, showTooltip: false,
              upgrade: canUp ? {
                canUpgrade: true,
                cost: costDeck,
                canAfford: affordDeck,
                onUpgrade: () => this.performUpgrade(sid),
              } : undefined,
            })
            this.deckGroup.push(card)

            // Register deck card position for click/tooltip/swap
            this.deckCardPositions.push({
              x: cardX, y: cy, skillId: sid, slotIdx: si, category: grp.cat, group: def.group,
              cardObj: card,
            })

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
              // Show detail card sized to the sprite panel rect so it
              // overlays the panel cleanly without overflowing.
              const clickDef = this.getSkillDef(capturedSid)
              if (clickDef) {
                this._clickTooltip?.destroy(true)
                const sp = this._spritePanelRect()
                this._clickTooltip = UI.skillDetailCard(this, sp.x + sp.w / 2, sp.y + sp.h / 2, {
                  skillId: capturedSid,
                  name: clickDef.name, effectType: clickDef.effectType, power: clickDef.power,
                  group: clickDef.group, unitClass: capturedOwned.unitClass, level: capturedOwned.level,
                  progress: capturedOwned.progress, description: clickDef.description,
                  longDescription: clickDef.longDescription,
                  targetType: clickDef.targetType, range: clickDef.range,
                  secondaryEffect: clickDef.secondaryEffect ?? null,
                }, { width: sp.w, height: sp.h })
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
          this.deckGroup.push(this.add.text(cardX + DECK_CARD_W / 2, cy + DECK_CARD_H / 2, t('scenes.skill-upgrade.deck-section.empty-slot'), {
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
    // Scroll model is gone — kept for backwards-compat with helpers that
    // still reference scrollY in their hover/click maths.
    this.scrollY = 0

    const cls = CLASSES.find(c => c.role === this.activeRole)!
    const deckH = this._deckPanelHeight()
    const ix = CONTENT_X; const iy = TOP_BAR_H + 8 + deckH + 6; const iw = CONTENT_W; const ih = H - iy - 8

    // ── Panel chrome ──
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

    // Title (left) + hint (right) — same band as before
    this.invGroup.push(this.add.text(ix + 16, iy + 18, t('scenes.skill-upgrade.inventory-section.header'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8))
    this.invGroup.push(this.add.text(ix + iw - 16, iy + 18, t('scenes.skill-upgrade.inventory-section.hint'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '500',
    }).setOrigin(1, 0.5))

    const filtered = this.getFilteredSkills()
    const equippedSet = this.getEquippedIds()

    // ── Tab bar (replaces vertical scroll) ──
    // Each tab = one of the 4 groups (attack1/attack2/defense1/defense2).
    // Active tab styled with the group's tone + a glow underline; inactive
    // tabs render as muted pills. The bar sits 36 px below the header.
    const groupLabels: Record<InventoryTab, string> = {
      attack1:  t('scenes.skill-upgrade.groups.attack1'),
      attack2:  t('scenes.skill-upgrade.groups.attack2'),
      defense1: t('scenes.skill-upgrade.groups.defense1'),
      defense2: t('scenes.skill-upgrade.groups.defense2'),
    }
    const groupTone: Record<InventoryTab, { hex: string; color: number }> = {
      attack1:  { hex: state.errorHex,   color: state.error   },
      attack2:  { hex: accent.hotHex,    color: accent.hot    },
      defense1: { hex: state.infoHex,    color: state.info    },
      defense2: { hex: state.successHex, color: state.success },
    }

    const tabs: InventoryTab[] = ['attack1', 'attack2', 'defense1', 'defense2']
    // Compact layout — pull tabs UP and shrink vertical footprint so the
    // 160 px cards + their accents fit cleanly inside the panel without
    // bleeding past the bottom edge.
    const tabBarY = iy + 38
    const tabBarH = 30
    const tabPadX = 14
    const tabAreaW = iw - tabPadX * 2
    const tabW = (tabAreaW - 10 * (tabs.length - 1)) / tabs.length
    const tabBarX = ix + tabPadX

    tabs.forEach((g, i) => {
      const tx = tabBarX + i * (tabW + 10)
      const tone = groupTone[g]
      const isActive = g === this.activeInventoryTab
      const ownedInGroup = filtered.filter((s) => {
        const d = this.getSkillDef(s.skill.skillId)
        return d && d.group === g
      }).length

      // ── AAA-grade tab pill ───────────────────────────────────────────
      // Pure-black drop shadow (NEVER tinted), gradient sheen for the
      // active state, faint tone-tinted hairline border for the inactive
      // state. The previous design had a colored underline that read as
      // a "colored shadow" — that's gone now.
      const tabG = this.add.graphics()

      // Drop shadow (pure black, 2-layer for soft edge)
      tabG.fillStyle(0x000000, 0.32)
      tabG.fillRoundedRect(tx + 1, tabBarY + 3, tabW, tabBarH, radii.md)
      tabG.fillStyle(0x000000, 0.5)
      tabG.fillRoundedRect(tx + 1, tabBarY + 1, tabW, tabBarH, radii.md)

      if (isActive) {
        // ACTIVE: solid tone fill with top sheen + bottom darken for
        // depth + bright tone-colored border + inner white rim.
        tabG.fillStyle(tone.color, 1)
        tabG.fillRoundedRect(tx, tabBarY, tabW, tabBarH, radii.md)
        // top highlight (sheen)
        tabG.fillStyle(0xffffff, 0.22)
        tabG.fillRoundedRect(tx + 2, tabBarY + 2, tabW - 4, tabBarH * 0.45,
          { tl: radii.md - 1, tr: radii.md - 1, bl: 0, br: 0 })
        // bottom darken
        tabG.fillStyle(0x000000, 0.18)
        tabG.fillRoundedRect(tx + 2, tabBarY + tabBarH * 0.6, tabW - 4, tabBarH * 0.4 - 2,
          { tl: 0, tr: 0, bl: radii.md - 1, br: radii.md - 1 })
        // outer tone border
        tabG.lineStyle(1.5, tone.color, 1)
        tabG.strokeRoundedRect(tx, tabBarY, tabW, tabBarH, radii.md)
        // 1-px inner light rim for that polished glass feel
        tabG.lineStyle(1, 0xffffff, 0.18)
        tabG.strokeRoundedRect(tx + 1.5, tabBarY + 1.5, tabW - 3, tabBarH - 3, radii.md - 1)
      } else {
        // INACTIVE: muted dark fill with very subtle sheen + faint
        // tone-tinted border. Reads "available, not selected".
        tabG.fillStyle(surface.deepest, 1)
        tabG.fillRoundedRect(tx, tabBarY, tabW, tabBarH, radii.md)
        // soft top sheen
        tabG.fillStyle(0xffffff, 0.05)
        tabG.fillRoundedRect(tx + 2, tabBarY + 2, tabW - 4, tabBarH * 0.4,
          { tl: radii.md - 1, tr: radii.md - 1, bl: 0, br: 0 })
        // faint tone border
        tabG.lineStyle(1, tone.color, 0.42)
        tabG.strokeRoundedRect(tx, tabBarY, tabW, tabBarH, radii.md)
      }
      this.invGroup.push(tabG)

      // Label centred — counter is offset to the right edge
      const labelColor = isActive ? '#ffffff' : tone.hex
      this.invGroup.push(this.add.text(tx + tabW / 2 - 12, tabBarY + tabBarH / 2,
        groupLabels[g], {
          fontFamily: fontFamily.body, fontSize: '11px',
          color: labelColor,
          fontStyle: '900',
          shadow: isActive ? { offsetX: 0, offsetY: 1, color: '#000000', blur: 2, fill: true } : undefined,
        }).setOrigin(0.5).setLetterSpacing(1.4))

      // Owned counter chip on the right side of the tab
      const counter = this.add.text(tx + tabW - 8, tabBarY + tabBarH / 2,
        `${ownedInGroup}/4`, {
          fontFamily: fontFamily.mono, fontSize: '9px',
          color: isActive ? '#ffffff' : fg.tertiaryHex, fontStyle: '700',
          backgroundColor: isActive ? '#00000055' : '#0a0f1d99',
          padding: { x: 4, y: 2 },
        }).setOrigin(1, 0.5)
      this.invGroup.push(counter)

      // Hit zone — depth 5 so it sits ABOVE the inventory click zone
      // (depth 4) which would otherwise eat the click before it reaches
      // the tab.
      const tabHit = this.add.rectangle(tx + tabW / 2, tabBarY + tabBarH / 2, tabW, tabBarH, 0, 0.001)
        .setInteractive({ useHandCursor: true }).setDepth(5)
      tabHit.on('pointerdown', () => {
        if (this.activeInventoryTab === g) return
        this.activeInventoryTab = g
        this.fusionSlot1 = null
        this.deckSelecting = null
        this.clearHighlights()
        this.redrawAll()
      })
      this.invGroup.push(tabHit)
    })

    // ── Card grid (single row, equipped + non-equipped both shown) ──
    // Card area is vertically centred between the bottom of the tab bar
    // and the bottom of the inventory panel — this puts the row visually
    // dead-centre in its available space (no top-heavy or bottom-heavy
    // feel).
    const cardAreaBoxTop = tabBarY + tabBarH
    const cardAreaBoxBottom = iy + ih
    const cardAreaTop = Math.floor((cardAreaBoxTop + cardAreaBoxBottom) / 2 - INV_CARD_H / 2)
    const allGroupSkills = filtered.filter((s) => {
      const d = this.getSkillDef(s.skill.skillId)
      return d && d.group === this.activeInventoryTab
    })

    const contentX = ix + 8; const contentY = cardAreaTop; const contentW = iw - 16
    const container = this.add.container(contentX, contentY)
    this.invContainer = container
    this.invCardPositions = []

    if (allGroupSkills.length === 0) {
      this.invGroup.push(this.add.text(ix + iw / 2, cardAreaTop + 60,
        t('scenes.skill-upgrade.inventory-section.all-equipped'), {
          fontFamily: fontFamily.serif, fontSize: '14px',
          color: fg.disabledHex, fontStyle: 'italic',
        }).setOrigin(0.5))
      // Helpful "abrir loja" hint in the empty state — purely decorative
      this.invGroup.push(this.add.text(ix + iw / 2, cardAreaTop + 86,
        t('scenes.skill-upgrade.inventory-section.hint'), {
          fontFamily: fontFamily.body, fontSize: '11px',
          color: fg.tertiaryHex, fontStyle: '500',
        }).setOrigin(0.5))
    } else {
      // Centre the row when fewer than INV_COLS cards exist.
      const COL_STRIDE = INV_CARD_W + INV_GAP
      const usedCols = Math.min(INV_COLS, allGroupSkills.length)
      const rowW = usedCols * INV_CARD_W + (usedCols - 1) * INV_GAP
      const rowStartX = (contentW - rowW) / 2 + INV_CARD_W / 2

      allGroupSkills.forEach((item, gi) => {
        const col = gi % INV_COLS; const row = Math.floor(gi / INV_COLS)
        const cx = rowStartX + col * COL_STRIDE
        const cy = row * (INV_CARD_H + INV_GAP) + INV_CARD_H / 2
        const isSelected = this.fusionSlot1?.idx === item.origIdx
        const isEquipped = equippedSet.has(item.skill.skillId)
        const def = this.getSkillDef(item.skill.skillId)
        if (!def) return

        const canUpgrade = !isEquipped
          && item.skill.progress >= item.skill.level
          && item.skill.level < MAX_SKILL_LEVEL
        const cost = playerData.getUpgradeCost(item.skill.level)
        const canAfford = this.gold >= cost

        const card = UI.skillCard(this, cx, cy, {
          name: def.name, effectType: def.effectType, power: def.power,
          group: def.group, unitClass: item.skill.unitClass, level: item.skill.level,
          progress: item.skill.progress, skillId: item.skill.skillId, description: def.description,
          targetType: def.targetType, areaShape: def.areaShape ?? null,
        }, {
          orientation: 'vertical',
          width: INV_CARD_W, height: INV_CARD_H,
          showTooltip: false,
          upgrade: canUpgrade ? {
            canUpgrade: true,
            cost,
            canAfford,
            onUpgrade: () => this.performUpgrade(item.skill.skillId),
          } : undefined,
        })

        // Stagger reveal — feels AAA without adding load
        card.setAlpha(0).setScale(0.96)
        this.tweens.add({
          targets: card,
          alpha: isEquipped ? 0.42 : 1,
          scaleX: 1, scaleY: 1,
          duration: 220,
          delay: gi * 35,
          ease: 'Back.Out',
        })

        // Equipped overlay — strong "already in your deck" visual:
        //   1. Card alpha 0.42 (much more washed out than the previous
        //      0.7 — clearly tells the eye "this is taken").
        //   2. Gray-out overlay rect on top of the card body, alpha 0.4.
        //      This pushes the colored class banner / icon / power
        //      number toward grayscale so they read as "muted, in
        //      use" instead of "fully active".
        //   3. A gold check disc at the top-right CORNER — the only
        //      bright element on the card, screams "EQUIPPED".
        //   4. A subtle gold rim around the card outline so the player
        //      can still scan the "equipped" state at a glance.
        if (isEquipped) {
          // (2) grayscale-feel overlay
          const gray = this.add.graphics()
          gray.fillStyle(0x1a1f2c, 0.55)
          gray.fillRoundedRect(-INV_CARD_W / 2 + 1, -INV_CARD_H / 2 + 1,
            INV_CARD_W - 2, INV_CARD_H - 2, radii.md - 1)
          card.add(gray)

          // (3) gold rim
          const rim = this.add.graphics()
          rim.lineStyle(2.5, accent.primary, 0.95)
          rim.strokeRoundedRect(-INV_CARD_W / 2, -INV_CARD_H / 2,
            INV_CARD_W, INV_CARD_H, radii.md)
          card.add(rim)

          // (4) corner check disc — sits HALF-OUTSIDE the top-right
          // corner so it never overlaps the class banner inside the
          // card body. 18 px disc with a 12 px gold check glyph.
          const discR = 9
          const discCx = INV_CARD_W / 2 - 2
          const discCy = -INV_CARD_H / 2 + 2
          const discG = this.add.graphics()
          discG.fillStyle(0x000000, 0.55)
          discG.fillCircle(discCx + 1, discCy + 1, discR)
          discG.fillStyle(accent.primary, 1)
          discG.fillCircle(discCx, discCy, discR)
          discG.lineStyle(1, 0x000000, 0.5)
          discG.strokeCircle(discCx, discCy, discR)
          card.add(discG)
          card.add(this.add.text(discCx, discCy + 0.5, '✓', {
            fontFamily: fontFamily.body, fontSize: '12px',
            color: '#1a1408', fontStyle: '900',
          }).setOrigin(0.5))
        }

        if (isSelected) {
          const glow = this.add.graphics()
          glow.lineStyle(2, accent.primary, 0.85)
          glow.strokeRoundedRect(-INV_CARD_W / 2 - 2, -INV_CARD_H / 2 - 2,
            INV_CARD_W + 4, INV_CARD_H + 4, radii.md)
          card.add(glow)
        }

        container.add(card)

        this.invCardPositions.push({
          cx: contentX + cx, cy: contentY + cy,
          skill: item.skill, origIdx: item.origIdx,
          canUpgrade, canAfford, isEquipped,
          cardObj: card,
        })
      })
    }

    // ── Global tooltip (for both inv and deck) ──
    const destroyClickTooltip = () => { this._clickTooltip?.destroy(true); this._clickTooltip = null }

    const showTooltipAt = (skillId: string, _anchorX: number, _anchorY: number) => {
      destroyClickTooltip()
      const def = this.getSkillDef(skillId)
      if (!def) return
      const owned = this.findOwnedSkill(skillId)
      // Show in left sprite/detail panel sized to its rect.
      const sp = this._spritePanelRect()
      this._clickTooltip = UI.skillDetailCard(this, sp.x + sp.w / 2, sp.y + sp.h / 2, {
        skillId,
        name: def.name, effectType: def.effectType, power: def.power,
        group: def.group, unitClass: owned?.unitClass ?? 'king', level: owned?.level ?? 1,
        progress: owned?.progress ?? 0, description: def.description,
        longDescription: def.longDescription,
        targetType: def.targetType, range: def.range,
        secondaryEffect: def.secondaryEffect ?? null,
      }, { width: sp.w, height: sp.h })
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
      if (this._swapAnimating) { destroyHover(); return }
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

    // Pure click-to-select / click-to-target flow (no drag) — matches
    // Clash-Royale's card-swap UX exactly: tap source, tap destination,
    // animation plays.
    invClickZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this._swapAnimating) return
      destroyHover()
      this._destroyAllHoverTooltips()
      const pos = findInvCard(pointer.x, pointer.y)

      if (pos) {
        // Deck-selecting mode: replace deck slot
        if (this.deckSelecting && !pos.isEquipped) {
          const posDef = this.getSkillDef(pos.skill.skillId)
          if (posDef && posDef.group === this.deckSelecting.group) {
            this.equipSkill(pos.skill, this.deckSelecting.slotIdx, this.deckSelecting.category)
            this.deckSelecting = null; return
          }
        }

        if (pos.isEquipped) {
          // Equipped cards are read-only in the inventory: clicking
          // them opens the skill detail in the left panel.
          this.fusionSlot1 = null
          this.deckSelecting = null
          this.clearHighlights()
          this._restoreLiftedCard()
          showTooltipAt(pos.skill.skillId, 0, 0)
          return
        }

        // Click-select on a non-equipped card → lift + highlight valid
        // deck slots so the user can tap one to swap.
        this.deckSelecting = null
        this.onInventoryClick(pos.skill, pos.origIdx)
        if (this.fusionSlot1) {
          showTooltipAt(pos.skill.skillId, 0, 0)
        } else {
          // Toggled off — make sure the detail card is gone
          destroyClickTooltip()
        }
        return
      }

      // Empty area → deselect + hide detail
      this.fusionSlot1 = null; this.deckSelecting = null
      destroyClickTooltip()
      this.clearHighlights(); this.redrawAll()
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private onInventoryClick(skill: OwnedSkill, idx: number) {
    if (this._swapAnimating) return
    this.clearHighlights()
    this._restoreLiftedCard()
    if (this.fusionSlot1?.idx === idx) { this.fusionSlot1 = null; this._clickTooltip?.destroy(true); this._clickTooltip = null; this.redrawAll(); return }
    this.fusionSlot1 = { skill, idx }
    this.redrawAll()

    // Accent glow on selected inventory card + Clash-Royale-style lift
    const pos = this.invCardPositions.find(p => p.origIdx === idx)
    if (pos) {
      const ay = pos.cy - this.scrollY
      const selGlow = this.add.graphics().setDepth(10)
      selGlow.lineStyle(3, accent.primary, 1)
      selGlow.strokeRoundedRect(pos.cx - INV_CARD_W / 2 - 3, ay - INV_CARD_H / 2 - 3, INV_CARD_W + 6, INV_CARD_H + 6, radii.md)
      this.highlightObjs.push(selGlow)
      this.highlightTweens.push(this.tweens.add({ targets: selGlow, alpha: { from: 0.6, to: 1 }, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut' }))
      if (pos.cardObj) this._liftCardForSelection(pos.cardObj)
    }

    // Gold glow on valid deck slots
    this.showEquipHighlight(skill)
  }

  /** Click on an equipped deck card → highlight compatible inventory cards + other deck slot for swap */
  private onDeckCardClick(_skillId: string, slotIdx: number, category: string, group: string) {
    if (this._swapAnimating) return
    this.clearHighlights()
    this._restoreLiftedCard()
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

    // Clash-Royale-style lift on the selected deck card
    const selDeckPos = this.deckCardPositions.find(p => p.slotIdx === slotIdx && p.category === category)
    if (selDeckPos?.cardObj) this._liftCardForSelection(selDeckPos.cardObj)

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
        if (this._swapAnimating) return
        // Swap the two slots within the deck — with Clash-Royale-style
        // animation on the two card containers.
        const performSwap = () => {
          const cfg = (playerData.getDeckConfig()[this.activeRole]) ?? { attackCards: [] as string[], defenseCards: [] as string[] }
          const cards = category === 'attack' ? [...cfg.attackCards] : [...cfg.defenseCards]
          const temp = cards[slotIdx]; cards[slotIdx] = cards[si]; cards[si] = temp
          if (category === 'attack') playerData.saveDeckConfig(this.activeRole, cards, cfg.defenseCards)
          else playerData.saveDeckConfig(this.activeRole, cfg.attackCards, cards)
          this._clickTooltip?.destroy(true); this._clickTooltip = null
          this.clearHighlights(); this.loadData(); this.redrawAll()
        }
        const srcPos = this.deckCardPositions.find(p => p.slotIdx === slotIdx && p.category === category)
        const dstPos = this.deckCardPositions.find(p => p.slotIdx === si && p.category === category)
        if (srcPos?.cardObj && dstPos?.cardObj) {
          this._animateCardSwap(srcPos.cardObj, dstPos.cardObj, performSwap)
        } else {
          performSwap()
        }
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
    const performDataSwap = () => {
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

    // ── Clash-Royale-style swap animation ──
    // If we still have refs to both card containers (inv source + deck
    // slot card), animate them flying past each other before the data
    // swap. If the slot is empty (nothing to swap with), the source
    // card flies into the slot solo.
    const srcInvPos = this.invCardPositions.find(p => p.skill.skillId === skill.skillId)
    const dstDeckPos = this.deckCardPositions.find(p => p.slotIdx === slotIdx && p.category === category)

    if (srcInvPos?.cardObj && dstDeckPos?.cardObj) {
      this._animateCardSwap(srcInvPos.cardObj, dstDeckPos.cardObj, performDataSwap)
      return
    }
    if (srcInvPos?.cardObj && !dstDeckPos) {
      // Empty slot — single-card fly-into-slot animation.
      const def = this.getSkillDef(skill.skillId)
      if (def) {
        const groupToCol: Record<string, number> = { attack1: 0, attack2: 1, defense1: 2, defense2: 3 }
        const col = groupToCol[def.group] ?? 0
        const startSlot = (def.group === 'attack1' || def.group === 'defense1') ? 0 : 2
        const row = slotIdx - startSlot
        const { gridStartX, gridStartY } = this._deckGridGeometry()
        const dstX = gridStartX + col * (DECK_CARD_W + DECK_GAP) + DECK_CARD_W / 2
        const dstY = gridStartY + row * (DECK_CARD_H + DECK_GAP) + DECK_CARD_H / 2
        this._animateCardFlyTo(srcInvPos.cardObj, { x: dstX, y: dstY }, performDataSwap)
        return
      }
    }
    // Fallback — no anim refs available, just commit the swap.
    performDataSwap()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASH-ROYALE-STYLE SWAP ANIMATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Lift a card in place — Clash-Royale "selected card" feedback. The
   *  card scales up slightly and nudges upward; depth is raised so the
   *  selection glow ring still sits above sibling cards. */
  private _liftCardForSelection(card: Phaser.GameObjects.Container) {
    this._restoreLiftedCard()
    this._liftedCard = card
    this._liftedCardOrig = { x: card.x, y: card.y, sx: card.scaleX, sy: card.scaleY }
    card.setDepth(50)
    this.tweens.killTweensOf(card)
    this.tweens.add({
      targets: card,
      scaleX: 1.06, scaleY: 1.06,
      y: card.y - 5,
      duration: 200,
      ease: 'Back.Out',
    })
  }

  /** Restore the previously lifted card. Safe to call when nothing is
   *  lifted (no-op). Called automatically by clearHighlights /
   *  redrawAll-equivalent paths. */
  private _restoreLiftedCard() {
    if (!this._liftedCard || !this._liftedCardOrig) return
    const c = this._liftedCard, o = this._liftedCardOrig
    this._liftedCard = null
    this._liftedCardOrig = null
    if (!c.scene) return  // already destroyed
    this.tweens.killTweensOf(c)
    this.tweens.add({
      targets: c, x: o.x, y: o.y, scaleX: o.sx, scaleY: o.sy,
      duration: 140, ease: 'Quad.Out',
      onComplete: () => { try { c.setDepth(0) } catch { /* noop */ } },
    })
  }

  /** Reparent a card from a Container into the scene's display list,
   *  preserving its world-space position. Used to animate inventory
   *  cards (which live inside `invContainer`) and deck cards (scene
   *  level) in the same coordinate space. Returns the world-space
   *  position the card now sits at. */
  private _detachCardToScene(card: Phaser.GameObjects.Container) {
    const parent = card.parentContainer
    const wx = (parent?.x ?? 0) + card.x
    const wy = (parent?.y ?? 0) + card.y
    if (parent) {
      parent.remove(card, false)
      this.add.existing(card)
      card.setPosition(wx, wy)
    }
    return { x: wx, y: wy }
  }

  /** Two-card cross-flight swap — both cards fly to each other's
   *  positions in parallel with a satisfying ease, then destroy
   *  themselves and trigger the data swap (which redraws). While the
   *  animation runs, _swapAnimating is true so other input is ignored. */
  private _animateCardSwap(
    srcCard: Phaser.GameObjects.Container,
    dstCard: Phaser.GameObjects.Container,
    onComplete: () => void,
  ) {
    this._swapAnimating = true
    this._restoreLiftedCard()
    this.clearHighlights()
    this._destroyAllHoverTooltips()
    this._clickTooltip?.destroy(true); this._clickTooltip = null

    const srcWorld = this._detachCardToScene(srcCard)
    const dstWorld = this._detachCardToScene(dstCard)
    srcCard.setDepth(60)
    dstCard.setDepth(60)
    // Track for guaranteed cleanup
    this._floatingSwapCards.push(srcCard, dstCard)
    this.tweens.killTweensOf(srcCard)
    this.tweens.killTweensOf(dstCard)

    let done = 0
    const finish = () => {
      if (++done < 2) return
      this._floatingSwapCards = this._floatingSwapCards.filter(c => c !== srcCard && c !== dstCard)
      try { srcCard.destroy(true) } catch { /* noop */ }
      try { dstCard.destroy(true) } catch { /* noop */ }
      this._swapAnimating = false
      onComplete()
    }
    this.tweens.add({
      targets: srcCard,
      x: dstWorld.x, y: dstWorld.y,
      scaleX: 1, scaleY: 1,
      duration: 380, ease: 'Cubic.InOut',
      onComplete: finish,
    })
    this.tweens.add({
      targets: dstCard,
      x: srcWorld.x, y: srcWorld.y,
      scaleX: 1, scaleY: 1,
      duration: 380, ease: 'Cubic.InOut',
      onComplete: finish,
    })
  }

  /** Single-card "fly into slot" — used when the destination slot is
   *  empty (no card to swap with). */
  private _animateCardFlyTo(
    srcCard: Phaser.GameObjects.Container,
    dstWorldPos: { x: number; y: number },
    onComplete: () => void,
  ) {
    this._swapAnimating = true
    this._restoreLiftedCard()
    this.clearHighlights()
    this._destroyAllHoverTooltips()
    this._clickTooltip?.destroy(true); this._clickTooltip = null

    this._detachCardToScene(srcCard)
    srcCard.setDepth(60)
    this._floatingSwapCards.push(srcCard)
    this.tweens.killTweensOf(srcCard)
    this.tweens.add({
      targets: srcCard,
      x: dstWorldPos.x, y: dstWorldPos.y,
      scaleX: 1, scaleY: 1,
      duration: 380, ease: 'Cubic.InOut',
      onComplete: () => {
        this._floatingSwapCards = this._floatingSwapCards.filter(c => c !== srcCard)
        try { srcCard.destroy(true) } catch { /* noop */ }
        this._swapAnimating = false
        onComplete()
      },
    })
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
    const lvUpText = this.add.text(cx, cy - 20, t('scenes.skill-upgrade.level-up-banner'), {
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

  private redrawAll() {
    // The lifted card belongs to the previous render — clear the ref so
    // _restoreLiftedCard doesn't try to tween a destroyed object.
    this._liftedCard = null
    this._liftedCardOrig = null
    // Safety: destroy any swap-animation ghost cards that might still
    // be reparented to the scene (e.g. if a tween was interrupted).
    // Without this they'd appear as stuck "description cards" on top
    // of the new render.
    this._floatingSwapCards.forEach(c => { try { c.destroy(true) } catch { /* noop */ } })
    this._floatingSwapCards = []
    // Click-detail card on the left panel must also be cleared, otherwise
    // it stays pinned through swaps and tab changes.
    this._clickTooltip?.destroy(true); this._clickTooltip = null
    this._destroyAllHoverTooltips(); this.clearHighlights()
    this.drawClassTabs(); this.drawLeft(); this.drawDeck(); this.drawInventory()
  }

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
