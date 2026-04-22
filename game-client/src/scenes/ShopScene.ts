import Phaser from 'phaser'
import { playerData } from '../utils/PlayerDataManager'
import { UI } from '../utils/UIComponents'
import {
  SCREEN,
  surface, border, accent, fg, state, currency,
  fontFamily, typeScale, radii,
} from '../utils/DesignTokens'
import { showPackOpen } from '../utils/PackOpenAnimation'
import { SKILL_CATALOG } from '../data/skillCatalog'
import { transitionTo } from '../utils/SceneTransition'
import {
  getPurchasableSkins,
  SKIN_RARITY_COLOR,
  SKIN_RARITY_HEX,
  SKIN_RARITY_LABEL,
  type SkinDef,
} from '../data/skinCatalog'
import { drawCharacterSprite, type SpriteRole } from '../utils/SpriteFactory'

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const W = SCREEN.W
const CARD_W = 220
const CARD_H = 280
const CARD_GAP = 14
const PREMIUM_W = CARD_W * 2 + CARD_GAP
const BANNER_H = 34
const TOP_BAR_H = 56
const TAB_Y = TOP_BAR_H + 8
const GRID_TOP = TAB_Y + 42

// ═══════════════════════════════════════════════════════════════════════════════
// Shop data
// ═══════════════════════════════════════════════════════════════════════════════

type Rarity = 'basic' | 'medium' | 'advanced' | 'premium'

interface ShopItem {
  id: string; name: string; desc: string
  goldPrice: number; dgPrice: number; rarity: Rarity
  dropCount: number; dropType: 'attack' | 'defense' | 'both'
  category: 'skills' | 'premium'
}

const ITEMS: ShopItem[] = [
  { id: 'basic_def',  name: 'Defesa',   desc: '1 skill aleatoria',    goldPrice: 100,  dgPrice: 5,   rarity: 'basic',    dropCount: 1, dropType: 'defense', category: 'skills' },
  { id: 'basic_atk',  name: 'Ataque',   desc: '1 skill aleatoria',    goldPrice: 100,  dgPrice: 5,   rarity: 'basic',    dropCount: 1, dropType: 'attack',  category: 'skills' },
  { id: 'medio_def',  name: 'Defesa',   desc: '2 skills aleatorias',  goldPrice: 300,  dgPrice: 12,  rarity: 'medium',   dropCount: 2, dropType: 'defense', category: 'skills' },
  { id: 'medio_atk',  name: 'Ataque',   desc: '2 skills aleatorias',  goldPrice: 300,  dgPrice: 12,  rarity: 'medium',   dropCount: 2, dropType: 'attack',  category: 'skills' },
  { id: 'adv_def',    name: 'Defesa',   desc: '3 skills aleatorias',  goldPrice: 600,  dgPrice: 25,  rarity: 'advanced', dropCount: 3, dropType: 'defense', category: 'skills' },
  { id: 'adv_atk',    name: 'Ataque',   desc: '3 skills aleatorias',  goldPrice: 600,  dgPrice: 25,  rarity: 'advanced', dropCount: 3, dropType: 'attack',  category: 'skills' },
  { id: 'premium',    name: 'Completo', desc: '3 defesa + 3 ataque',  goldPrice: 0,    dgPrice: 50,  rarity: 'premium',  dropCount: 6, dropType: 'both',    category: 'skills' },
]

const DG_ITEMS: ShopItem[] = [
  { id: 'dg_100', name: '100 DG',  desc: 'Dinheiro real', goldPrice: 0, dgPrice: 0, rarity: 'basic',    dropCount: 0, dropType: 'attack', category: 'premium' },
  { id: 'dg_500', name: '500 DG',  desc: 'Dinheiro real', goldPrice: 0, dgPrice: 0, rarity: 'advanced', dropCount: 0, dropType: 'attack', category: 'premium' },
]

// ═══════════════════════════════════════════════════════════════════════════════
// Skill drop logic
// ═══════════════════════════════════════════════════════════════════════════════

const ALL_SKILLS = SKILL_CATALOG.filter(s => s.id.startsWith('l'))
const ATK_SKILLS = ALL_SKILLS.filter(s => s.category === 'attack')
const DEF_SKILLS = ALL_SKILLS.filter(s => s.category === 'defense')
const CLASS_MAP: Record<string, string> = { lk: 'king', lw: 'warrior', ls: 'specialist', le: 'executor' }

function randomSkill(type: 'attack' | 'defense'): { skillId: string; unitClass: string } | null {
  const basePool = type === 'attack' ? ATK_SKILLS : DEF_SKILLS
  const pool = basePool.filter(s => playerData.canReceiveSkill(s.id))
  if (pool.length === 0) return null
  const s = pool[Math.floor(Math.random() * pool.length)]
  return { skillId: s.id, unitClass: CLASS_MAP[s.id.substring(0, 2)] ?? 'king' }
}

function hasAvailableSkills(type: 'attack' | 'defense' | 'both'): boolean {
  if (type === 'both') return hasAvailableSkills('attack') || hasAvailableSkills('defense')
  const basePool = type === 'attack' ? ATK_SKILLS : DEF_SKILLS
  return basePool.some(s => playerData.canReceiveSkill(s.id))
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const RARITY_LABEL: Record<string, string> = { basic: 'BÁSICO', medium: 'MÉDIO', advanced: 'AVANÇADO', premium: 'PREMIUM' }
// Tokens: basic=tertiary slate, medium=info blue, advanced=warn amber,
// premium=accent gold (matches the dual-currency Print 11 vocabulary).
const RARITY_COLORS: Record<string, number> = {
  basic:    border.strong,
  medium:   state.info,
  advanced: state.warn,
  premium:  accent.primary,
}
const RARITY_HEX: Record<string, string> = {
  basic:    fg.tertiaryHex,
  medium:   state.infoHex,
  advanced: state.warnHex,
  premium:  accent.primaryHex,
}

function getCardAccent(item: ShopItem): number {
  if (item.rarity === 'premium') return accent.primary
  return item.dropType === 'attack' ? state.error : state.info
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scene
// ═══════════════════════════════════════════════════════════════════════════════

export default class ShopScene extends Phaser.Scene {
  private activeTab: 'skills' | 'skins' | 'dg' = 'skills'
  private cardContainer!: Phaser.GameObjects.Container
  private balanceGoldPill!: Phaser.GameObjects.Container
  private balanceDgPill!: Phaser.GameObjects.Container

  constructor() { super('ShopScene') }

  create(data?: { tab?: string }) {
    if (data?.tab === 'dg') this.activeTab = 'dg'
    else if (data?.tab === 'skins') this.activeTab = 'skins'
    else this.activeTab = 'skills'

    UI.background(this)
    UI.particles(this, 12)

    this.drawTopBar()
    this.drawTabs()
    this.cardContainer = this.add.container(0, 0)
    this.drawCards()

    UI.fadeIn(this)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOP BAR
  // ═══════════════════════════════════════════════════════════════════════════

  private drawTopBar() {
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 0.97)
    bg.fillRect(0, 0, W, TOP_BAR_H)
    bg.fillStyle(border.subtle, 1)
    bg.fillRect(0, TOP_BAR_H - 1, W, 1)

    UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))

    this.add.text(70, TOP_BAR_H / 2, 'LOJA', {
      fontFamily: fontFamily.display, fontSize: typeScale.h2,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(3)

    // Gold + DG pills via UI.currencyPill kit (Print 11 canonical)
    this.balanceGoldPill = UI.currencyPill(this, W - 220, TOP_BAR_H / 2, {
      kind: 'gold', amount: playerData.getGold(),
    })
    this.balanceDgPill = UI.currencyPill(this, W - 90, TOP_BAR_H / 2, {
      kind: 'dg', amount: playerData.getDG(),
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TABS
  // ═══════════════════════════════════════════════════════════════════════════

  private drawTabs() {
    // Canonical UI.segmentedControl per Decision D — replaces the inline
    // 3-tab indicator + per-tab hit boxes + recolor handlers.
    UI.segmentedControl<'skills' | 'skins' | 'dg'>(this, W / 2, TAB_Y + 14, {
      options: [
        { key: 'skills', label: 'PACOTES' },
        { key: 'skins',  label: 'SKINS' },
        { key: 'dg',     label: 'DG' },
      ],
      value: this.activeTab,
      width: 480,
      height: 36,
      onChange: (key) => {
        if (key === this.activeTab) return
        this.activeTab = key
        this.drawCards()
      },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CARDS
  // ═══════════════════════════════════════════════════════════════════════════

  private drawCards() {
    this.cardContainer.removeAll(true)

    // Skins tab uses its own grid — 8 items arranged in 2 rows of 4.
    if (this.activeTab === 'skins') {
      this.drawSkinCards()
      return
    }

    const items = this.activeTab === 'skills' ? ITEMS : DG_ITEMS

    if (this.activeTab === 'dg') {
      const totalW = items.length * CARD_W + (items.length - 1) * CARD_GAP
      const sx = (W - totalW) / 2 + CARD_W / 2
      const cy = GRID_TOP + CARD_H / 2 + 40
      items.forEach((item, i) => {
        this.cardContainer.add(this.createCard(sx + i * (CARD_W + CARD_GAP), cy, CARD_W, CARD_H, item))
      })
      return
    }

    // Row 1: 4 basic+medium items
    const row1 = items.slice(0, 4)
    const row1TotalW = row1.length * CARD_W + (row1.length - 1) * CARD_GAP
    const row1StartX = (W - row1TotalW) / 2 + CARD_W / 2
    const row1Y = GRID_TOP + CARD_H / 2

    row1.forEach((item, i) => {
      this.cardContainer.add(this.createCard(row1StartX + i * (CARD_W + CARD_GAP), row1Y, CARD_W, CARD_H, item))
    })

    // Row 2: 2 advanced + 1 premium
    const row2 = items.slice(4)
    const row2TotalW = 2 * CARD_W + PREMIUM_W + 2 * CARD_GAP
    const row2StartX = (W - row2TotalW) / 2
    const row2Y = GRID_TOP + CARD_H + CARD_GAP + CARD_H / 2

    row2.forEach((item, i) => {
      const isPrem = item.rarity === 'premium'
      const cw = isPrem ? PREMIUM_W : CARD_W
      let cx: number
      if (i === 0) cx = row2StartX + CARD_W / 2
      else if (i === 1) cx = row2StartX + CARD_W + CARD_GAP + CARD_W / 2
      else cx = row2StartX + 2 * (CARD_W + CARD_GAP) + PREMIUM_W / 2
      this.cardContainer.add(this.createCard(cx, row2Y, cw, CARD_H, item))
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SINGLE CARD — AAA Premium Rendering
  // ═══════════════════════════════════════════════════════════════════════════

  private createCard(cx: number, cy: number, cw: number, ch: number, item: ShopItem): Phaser.GameObjects.Container {
    const accentColor = getCardAccent(item)
    const accentHex = '#' + accentColor.toString(16).padStart(6, '0')
    const rarityColor = RARITY_COLORS[item.rarity] ?? border.strong
    const rarityHex = RARITY_HEX[item.rarity] ?? fg.tertiaryHex
    const isPremium = item.rarity === 'premium'
    const locked = item.dropCount > 0 && !hasAvailableSkills(item.dropType)
    const hw = cw / 2; const hh = ch / 2

    // ── Card Background (multi-layer depth) ──
    const bg = this.add.graphics()
    // Drop shadow
    bg.fillStyle(0x000000, 0.45)
    bg.fillRoundedRect(-hw + 4, -hh + 5, cw, ch, radii.lg)
    // Main body — surface.panel
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(-hw, -hh, cw, ch, radii.lg)
    // Inner gradient (darker bottom for 3D depth)
    bg.fillStyle(0x000000, 0.18)
    bg.fillRoundedRect(-hw + 2, 0, cw - 4, hh - 2, { tl: 0, tr: 0, bl: radii.lg - 2, br: radii.lg - 2 })
    // Top highlight (glass effect)
    bg.fillStyle(0xffffff, 0.04)
    bg.fillRoundedRect(-hw + 3, -hh + 3, cw - 6, 22, { tl: radii.lg - 1, tr: radii.lg - 1, bl: 0, br: 0 })
    // Outer border tinted by rarity
    bg.lineStyle(1.5, rarityColor, isPremium ? 0.85 : 0.55)
    bg.strokeRoundedRect(-hw, -hh, cw, ch, radii.lg)

    // ── Rarity banner — tinted top wash by category ──
    if (item.dropType === 'attack' && !isPremium) {
      bg.fillStyle(state.error, 0.18)
      bg.fillRect(-hw + 3, -hh + 3, cw - 6, BANNER_H)
    } else if (item.dropType === 'defense' && !isPremium) {
      bg.fillStyle(state.info, 0.18)
      bg.fillRect(-hw + 3, -hh + 3, cw - 6, BANNER_H)
    } else if (isPremium) {
      bg.fillStyle(accent.primary, 0.14)
      bg.fillRoundedRect(-hw + 3, -hh + 3, cw - 6, BANNER_H,
        { tl: radii.lg - 1, tr: radii.lg - 1, bl: 0, br: 0 })
    }
    // Banner separator
    bg.lineStyle(1, rarityColor, 0.25)
    bg.lineBetween(-hw + 14, -hh + BANNER_H + 4, hw - 14, -hh + BANNER_H + 4)

    // Rarity label — Manrope meta letterSpacing 1.6
    const rLabel = this.add.text(0, -hh + BANNER_H / 2 + 2, RARITY_LABEL[item.rarity] ?? '', {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: rarityHex, fontStyle: '700',
    }).setOrigin(0.5).setLetterSpacing(1.6)

    // ── Icon (3D-style with glow) ──
    const iconY = -hh + 100
    const iconG = this.add.graphics()

    // Icon glow circle behind
    const iconGlow = this.add.circle(0, iconY, isPremium ? 36 : 30, accentColor, 0)
    this.tweens.add({ targets: iconGlow, alpha: { from: 0.05, to: 0.16 }, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.InOut' })

    if (item.category === 'premium' && item.dropCount === 0) {
      // DG tab items — show DG coin icon
      this.drawDGCoinIcon(iconG, 0, iconY, 22)
    } else if (isPremium) {
      // Premium skill pack — sword + shield
      this.drawSwordIcon(iconG, -20, iconY, accentColor, 1.4)
      this.drawShieldIcon(iconG, 20, iconY, accentColor, 1.4)
    } else if (item.dropType === 'attack') {
      this.drawSwordIcon(iconG, 0, iconY, accentColor, 1.6)
    } else {
      this.drawShieldIcon(iconG, 0, iconY, accentColor, 1.6)
    }

    // ── Name — Cormorant h3 ──
    const nameText = this.add.text(0, -hh + 158, item.name, {
      fontFamily: fontFamily.serif, fontSize: typeScale.h3,
      color: fg.primaryHex, fontStyle: '600',
    }).setOrigin(0.5)

    // ── Description — Manrope small ──
    const descText = this.add.text(0, -hh + 184, item.desc, {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color: fg.tertiaryHex, fontStyle: '500',
    }).setOrigin(0.5)

    // ── Drop count badge ──
    const badgeEls: Phaser.GameObjects.GameObject[] = []
    if (item.dropCount > 0) {
      const badgeY = -hh + 206
      const badgeGfx = this.add.graphics()
      badgeGfx.fillStyle(accentColor, 0.16)
      badgeGfx.fillRoundedRect(-32, badgeY - 9, 64, 18, 9)
      badgeGfx.lineStyle(1, accentColor, 0.5)
      badgeGfx.strokeRoundedRect(-32, badgeY - 9, 64, 18, 9)
      badgeEls.push(badgeGfx)

      badgeEls.push(this.add.text(0, badgeY, `×${item.dropCount} SKILLS`, {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: accentHex, fontStyle: '700',
      }).setOrigin(0.5).setLetterSpacing(1.2))
    }

    // ── Price area — surface.deepest pill bar with token-driven prices ──
    const priceY = -hh + 242
    const priceElements: Phaser.GameObjects.GameObject[] = []
    const priceBgW = cw - 24
    const priceBgH = 28

    const priceBg = this.add.graphics()
    priceBg.fillStyle(surface.deepest, 0.92)
    priceBg.fillRoundedRect(-priceBgW / 2, priceY - priceBgH / 2, priceBgW, priceBgH, priceBgH / 2)
    priceBg.lineStyle(1, border.subtle, 1)
    priceBg.strokeRoundedRect(-priceBgW / 2, priceY - priceBgH / 2, priceBgW, priceBgH, priceBgH / 2)
    priceElements.push(priceBg)

    if (item.goldPrice > 0 && item.dgPrice > 0) {
      // Gold (left) + DG (right) split
      const goldCoin = this.add.graphics()
      goldCoin.fillStyle(currency.goldCoin, 0.85)
      goldCoin.fillCircle(-priceBgW / 4 - 14, priceY, 5)
      goldCoin.lineStyle(1, currency.goldCoinEdge, 1)
      goldCoin.strokeCircle(-priceBgW / 4 - 14, priceY, 5)
      priceElements.push(goldCoin)
      priceElements.push(this.add.text(-priceBgW / 4 + 4, priceY, `${item.goldPrice}`, {
        fontFamily: fontFamily.mono, fontSize: typeScale.small,
        color: currency.goldCoinHex, fontStyle: '700',
      }).setOrigin(0.5))

      // Divider
      const divG = this.add.graphics()
      divG.fillStyle(border.default, 0.5); divG.fillRect(-0.5, priceY - 8, 1, 16)
      priceElements.push(divG)

      // DG
      const dgCoin = this.add.graphics()
      dgCoin.fillStyle(currency.dgGem, 0.85)
      dgCoin.fillCircle(priceBgW / 4 - 14, priceY, 5)
      dgCoin.lineStyle(1, currency.dgGemEdge, 1)
      dgCoin.strokeCircle(priceBgW / 4 - 14, priceY, 5)
      priceElements.push(dgCoin)
      priceElements.push(this.add.text(priceBgW / 4 + 4, priceY, `${item.dgPrice}`, {
        fontFamily: fontFamily.mono, fontSize: typeScale.small,
        color: currency.dgGemHex, fontStyle: '700',
      }).setOrigin(0.5))
    } else if (item.dgPrice > 0) {
      const dgCoin = this.add.graphics()
      dgCoin.fillStyle(currency.dgGem, 0.85)
      dgCoin.fillCircle(-22, priceY, 6)
      dgCoin.lineStyle(1, currency.dgGemEdge, 1)
      dgCoin.strokeCircle(-22, priceY, 6)
      priceElements.push(dgCoin)
      priceElements.push(this.add.text(2, priceY, `${item.dgPrice} DG`, {
        fontFamily: fontFamily.mono, fontSize: typeScale.small,
        color: currency.dgGemHex, fontStyle: '700',
      }).setOrigin(0.5))
    } else if (item.goldPrice > 0) {
      const goldCoin = this.add.graphics()
      goldCoin.fillStyle(currency.goldCoin, 0.85)
      goldCoin.fillCircle(-22, priceY, 6)
      goldCoin.lineStyle(1, currency.goldCoinEdge, 1)
      goldCoin.strokeCircle(-22, priceY, 6)
      priceElements.push(goldCoin)
      priceElements.push(this.add.text(2, priceY, `${item.goldPrice}`, {
        fontFamily: fontFamily.mono, fontSize: typeScale.small,
        color: currency.goldCoinHex, fontStyle: '700',
      }).setOrigin(0.5))
    }

    // ── Hover glow ──
    const glowG = this.add.graphics().setAlpha(0)
    if (!locked) {
      glowG.lineStyle(2, rarityColor, 0.6)
      glowG.strokeRoundedRect(-hw - 2, -hh - 2, cw + 4, ch + 4, radii.lg + 2)
    }

    // ── Hit area ──
    const hit = this.add.rectangle(0, 0, cw, ch, 0, 0.001)
    if (!locked) hit.setInteractive({ useHandCursor: true })

    // ── Lock overlay ──
    const lockElements: Phaser.GameObjects.GameObject[] = []
    if (locked) {
      const lockOverlay = this.add.graphics()
      lockOverlay.fillStyle(0x000000, 0.55)
      lockOverlay.fillRoundedRect(-hw, -hh, cw, ch, radii.lg)
      lockElements.push(lockOverlay)
      // Lucide lock icon — 32px tinted fg.tertiary, centered
      const lockIcon = UI.lucideIcon(this, 'x', 0, -16, 32, fg.tertiary)
      lockElements.push(lockIcon)
      lockElements.push(this.add.text(0, 22, 'JÁ POSSUI TODAS', {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: fg.tertiaryHex, fontStyle: '700',
      }).setOrigin(0.5).setLetterSpacing(1.6))
    }

    // ── Premium special effects ──
    const premElements: Phaser.GameObjects.GameObject[] = []
    if (isPremium && !locked) {
      // Pulsing outer accent glow
      const pulseGlow = this.add.graphics()
      pulseGlow.lineStyle(2, accent.primary, 0.4)
      pulseGlow.strokeRoundedRect(-hw - 3, -hh - 3, cw + 6, ch + 6, radii.lg + 3)
      premElements.push(pulseGlow)
      this.tweens.add({ targets: pulseGlow, alpha: { from: 0.4, to: 0.9 }, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.InOut' })

      // Corner ornaments
      premElements.push(UI.cornerOrnaments(this, 0, 0, cw - 16, ch - 16, accent.primary, 0.25, 16))
    }

    // ── Assemble ──
    const children: Phaser.GameObjects.GameObject[] = [
      ...premElements, bg, glowG, iconGlow, rLabel, iconG, nameText, descText,
      ...badgeEls, ...priceElements, ...lockElements, hit,
    ]
    const container = this.add.container(cx, cy, children)
    if (locked) container.setAlpha(0.6)

    // ── Hover effects ──
    if (!locked) {
      hit.on('pointerover', () => {
        glowG.setAlpha(1)
        this.tweens.add({ targets: container, scaleX: 1.04, scaleY: 1.04, duration: 120, ease: 'Quad.Out' })
      })
      hit.on('pointerout', () => {
        glowG.setAlpha(0)
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.Out' })
      })
      hit.on('pointerdown', () => {
        this.tweens.add({
          targets: container, scaleX: 0.96, scaleY: 0.96, duration: 60,
          yoyo: true, ease: 'Quad.InOut',
          onComplete: () => this.showPurchasePopup(item),
        })
      })
    }

    return container
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SKIN CARDS — rendered grid for the SKINS tab
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Lay out every purchasable skin on a 4x2 grid. 'idle' skins are excluded
   * because they are granted free to every account — the shop only sells
   * the alternates (epic + legendary per class = 8 items total).
   */
  private drawSkinCards() {
    const skins = getPurchasableSkins()
    const SKIN_CARD_W = 220
    const SKIN_CARD_H = 300
    const SKIN_GAP = 18
    const COLS = 4
    const rows = Math.ceil(skins.length / COLS)
    const rowWidth = COLS * SKIN_CARD_W + (COLS - 1) * SKIN_GAP
    const startX = (W - rowWidth) / 2 + SKIN_CARD_W / 2

    for (let i = 0; i < skins.length; i++) {
      const row = Math.floor(i / COLS)
      const col = i % COLS
      const cx = startX + col * (SKIN_CARD_W + SKIN_GAP)
      // Stagger rows so we fit both rows inside the available area under the
      // tabs without overlapping the bottom of the screen.
      const cy = GRID_TOP + SKIN_CARD_H / 2 + row * (SKIN_CARD_H + SKIN_GAP - 14)
      // Last row only has what's left — if 8 skins, second row also has 4
      this.cardContainer.add(this.createSkinCard(cx, cy, SKIN_CARD_W, SKIN_CARD_H, skins[i]))
    }

    // If there's exactly one row we'd center it vertically (8 skins always fit
    // in 2 rows with current catalog, so no special case needed today).
    void rows
  }

  /**
   * Renders a single skin card with live character preview, class tag,
   * rarity label, DG price + buy button. Owned skins show a green
   * "ADQUIRIDO" badge instead of the buy button.
   */
  private createSkinCard(
    cx: number,
    cy: number,
    cw: number,
    ch: number,
    skin: SkinDef,
  ): Phaser.GameObjects.Container {
    const hw = cw / 2
    const hh = ch / 2
    const rarityColor = SKIN_RARITY_COLOR[skin.rarity]
    const rarityHex   = SKIN_RARITY_HEX[skin.rarity]
    const rarityLabel = SKIN_RARITY_LABEL[skin.rarity]
    const owned       = playerData.ownsSkin(skin.classId, skin.id)
    const equipped    = playerData.getEquippedSkin(skin.classId) === skin.id

    const container = this.add.container(cx, cy)

    // ── Card background (multi-layer for depth) ──
    const bg = this.add.graphics()
    // Drop shadow
    bg.fillStyle(0x000000, 0.45)
    bg.fillRoundedRect(-hw + 4, -hh + 5, cw, ch, radii.lg + 2)
    // Body
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(-hw, -hh, cw, ch, radii.lg + 2)
    // Vertical colour wash keyed to rarity
    bg.fillStyle(rarityColor, 0.10)
    bg.fillRoundedRect(-hw, -hh, cw, ch * 0.55, { tl: radii.lg + 2, tr: radii.lg + 2, bl: 0, br: 0 })
    // Glass sheen
    bg.fillStyle(0xffffff, 0.05)
    bg.fillRoundedRect(-hw + 3, -hh + 3, cw - 6, 24, { tl: radii.lg + 1, tr: radii.lg + 1, bl: 0, br: 0 })
    // Darker bottom half for readability
    bg.fillStyle(0x000000, 0.20)
    bg.fillRoundedRect(-hw + 2, 10, cw - 4, hh - 12, { tl: 0, tr: 0, bl: radii.lg, br: radii.lg })
    // Rarity border (thicker than skill cards — skins are the showcase)
    bg.lineStyle(2, rarityColor, 0.7)
    bg.strokeRoundedRect(-hw, -hh, cw, ch, radii.lg + 2)
    container.add(bg)

    // ── Rarity badge (top) ──
    const rBadge = this.add.graphics()
    const rw = 92
    const rh = 20
    rBadge.fillStyle(rarityColor, 0.18)
    rBadge.fillRoundedRect(-rw / 2, -hh + 8, rw, rh, rh / 2)
    rBadge.lineStyle(1, rarityColor, 0.6)
    rBadge.strokeRoundedRect(-rw / 2, -hh + 8, rw, rh, rh / 2)
    container.add(rBadge)
    container.add(
      this.add.text(0, -hh + 8 + rh / 2, rarityLabel.toUpperCase(), {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: rarityHex, fontStyle: '700',
      }).setOrigin(0.5).setLetterSpacing(1.6),
    )

    // ── Character sprite preview (centered "hero shot") ──
    // drawCharacterSprite returns a Container centred at 0,0, so we can
    // nest it directly and offset to the card's top half. We let the
    // character dominate the frame — skins are the showcase here.
    const previewY = -hh + 120
    const sprite = drawCharacterSprite(
      this,
      skin.classId as SpriteRole,
      'left',
      128,
      skin.id,
    )
    sprite.setPosition(0, previewY)
    container.add(sprite)

    // Soft pedestal glow under the preview
    const pedestal = this.add.graphics()
    pedestal.fillStyle(rarityColor, 0.1)
    pedestal.fillEllipse(0, previewY + 80, 150, 18)
    pedestal.fillStyle(rarityColor, 0.2)
    pedestal.fillEllipse(0, previewY + 80, 86, 10)
    container.add(pedestal)
    // Make sure the sprite stays above the pedestal
    container.bringToTop(sprite)

    // ── Skin name — Cormorant h3 ──
    container.add(
      this.add.text(0, -hh + 236, skin.displayName, {
        fontFamily: fontFamily.serif, fontSize: typeScale.h3,
        color: fg.primaryHex, fontStyle: '600',
      }).setOrigin(0.5),
    )

    // ── Action area (buy button OR owned/equipped status) ──
    const actionY = hh - 30
    const actionW = cw - 24
    const actionH = 34

    if (owned) {
      // Owned state — token-driven status badge
      const badgeBg = this.add.graphics()
      const statusColor = equipped ? state.success : state.info
      const statusColorHex = equipped ? state.successHex : state.infoHex
      badgeBg.fillStyle(statusColor, 0.16)
      badgeBg.fillRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, actionH / 2)
      badgeBg.lineStyle(1.5, statusColor, 0.7)
      badgeBg.strokeRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, actionH / 2)
      container.add(badgeBg)

      container.add(
        this.add.text(0, actionY, equipped ? 'EQUIPADA' : 'ADQUIRIDA', {
          fontFamily: fontFamily.body, fontSize: typeScale.meta,
          color: statusColorHex, fontStyle: '700',
        }).setOrigin(0.5).setLetterSpacing(1.8),
      )
    } else {
      // Buy state — DG price + touch button (currency-themed pill)
      const canAfford = playerData.getDG() >= skin.dgPrice
      const btnFill   = canAfford ? surface.deepest : surface.primary
      const btnBorder = canAfford ? currency.dgGemEdge : border.subtle
      const priceHex  = canAfford ? currency.dgGemHex : fg.disabledHex

      const btnBg = this.add.graphics()
      btnBg.fillStyle(btnFill, 1)
      btnBg.fillRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, actionH / 2)
      btnBg.lineStyle(1.5, btnBorder, canAfford ? 1 : 0.4)
      btnBg.strokeRoundedRect(-actionW / 2, actionY - actionH / 2, actionW, actionH, actionH / 2)
      container.add(btnBg)

      // Mini DG coin
      const coin = this.add.graphics()
      coin.fillStyle(currency.dgGem, canAfford ? 0.85 : 0.3)
      coin.fillCircle(-34, actionY, 7)
      coin.lineStyle(1.2, currency.dgGemEdge, canAfford ? 1 : 0.4)
      coin.strokeCircle(-34, actionY, 7)
      container.add(coin)

      container.add(
        this.add.text(-16, actionY, `${skin.dgPrice}`, {
          fontFamily: fontFamily.mono, fontSize: typeScale.small,
          color: priceHex, fontStyle: '700',
        }).setOrigin(0, 0.5),
      )

      container.add(
        this.add.text(actionW / 2 - 12, actionY, 'COMPRAR', {
          fontFamily: fontFamily.body, fontSize: typeScale.meta,
          color: priceHex, fontStyle: '700',
        }).setOrigin(1, 0.5).setLetterSpacing(1.6),
      )

      // Hit area for the buy button
      const hit = this.add.rectangle(0, actionY, actionW, actionH, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      container.add(hit)
      if (canAfford) {
        hit.on('pointerover', () => {
          this.tweens.add({ targets: container, scaleX: 1.03, scaleY: 1.03, duration: 120, ease: 'Quad.Out' })
        })
        hit.on('pointerout', () => {
          this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.Out' })
        })
        hit.on('pointerdown', () => {
          this.tweens.add({
            targets: container, scaleX: 0.96, scaleY: 0.96, duration: 60,
            yoyo: true, ease: 'Quad.InOut',
            onComplete: () => this.showSkinPurchasePopup(skin),
          })
        })
      }
    }

    // ── Entrance animation (stagger across the grid) ──
    container.setAlpha(0).setScale(0.92)
    this.tweens.add({
      targets: container,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 260,
      delay: 40 * (skin.classId === 'king' ? 0 : skin.classId === 'warrior' ? 1 : skin.classId === 'specialist' ? 2 : 3),
      ease: 'Back.Out',
    })

    return container
  }

  /** Confirmation modal for skin purchase via UI.modal kit. */
  private showSkinPurchasePopup(skin: SkinDef) {
    const canAfford = playerData.getDG() >= skin.dgPrice
    let modalClose: () => void = () => {}
    const actions: Array<{ label: string; kind: 'primary' | 'secondary' | 'destructive' | 'ghost'; onClick: () => void }> = [
      {
        label: 'CANCELAR', kind: 'secondary',
        onClick: () => modalClose(),
      },
    ]
    if (canAfford) {
      actions.push({
        label: `COMPRAR · ${skin.dgPrice} DG`, kind: 'primary',
        onClick: () => {
          modalClose()
          const ok = playerData.purchaseSkin(skin.classId, skin.id)
          if (ok) {
            this.refreshBalance()
            this.drawCards()
            this.showPurchasedToast(skin.displayName, SKIN_RARITY_COLOR[skin.rarity], SKIN_RARITY_HEX[skin.rarity])
          }
        },
      })
    } else {
      actions.push({
        label: 'SALDO INSUFICIENTE', kind: 'ghost',
        onClick: () => modalClose(),
      })
    }
    const { close } = UI.modal(this, {
      eyebrow: SKIN_RARITY_LABEL[skin.rarity],
      title:   `Comprar ${skin.displayName}?`,
      body:    skin.subtitle,
      actions,
    }, { width: 460 })
    modalClose = close
  }

  /** Brief tokenized toast — works for both skin and skill pack purchases. */
  private showPurchasedToast(name: string, accentColor: number, accentHex: string) {
    const d = 6000
    const bg = this.add.graphics().setDepth(d)
    const tw = 360
    const th = 56
    bg.fillStyle(surface.panel, 0.96)
    bg.fillRoundedRect(W / 2 - tw / 2, 80, tw, th, radii.lg)
    bg.lineStyle(2, accentColor, 0.85)
    bg.strokeRoundedRect(W / 2 - tw / 2, 80, tw, th, radii.lg)

    const txt = this.add.text(W / 2, 80 + th / 2 - 8, 'DESBLOQUEADO', {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: accentHex, fontStyle: '700',
    }).setOrigin(0.5).setDepth(d + 1).setLetterSpacing(2)

    const sub = this.add.text(W / 2, 80 + th / 2 + 10, name, {
      fontFamily: fontFamily.serif, fontSize: typeScale.small,
      color: fg.primaryHex, fontStyle: '600',
    }).setOrigin(0.5).setDepth(d + 1)

    this.tweens.add({
      targets: [bg, txt, sub],
      alpha: 0,
      duration: 600,
      delay: 1800,
      onComplete: () => { bg.destroy(); txt.destroy(); sub.destroy() },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PURCHASE POPUP — Premium modal
  // ═══════════════════════════════════════════════════════════════════════════

  private showPurchasePopup(item: ShopItem) {
    const canAffordGold = item.goldPrice > 0 && playerData.getGold() >= item.goldPrice
    const canAffordDG   = item.dgPrice   > 0 && playerData.getDG()   >= item.dgPrice
    let modalClose: () => void = () => {}

    const actions: Array<{ label: string; kind: 'primary' | 'secondary' | 'destructive' | 'ghost'; onClick: () => void }> = [
      { label: 'CANCELAR', kind: 'secondary', onClick: () => modalClose() },
    ]
    if (canAffordGold) {
      actions.push({
        label: `COMPRAR · ${item.goldPrice} GOLD`, kind: 'primary',
        onClick: () => { modalClose(); this.executePurchase(item, false) },
      })
    }
    if (canAffordDG) {
      actions.push({
        label: `COMPRAR · ${item.dgPrice} DG`, kind: 'primary',
        onClick: () => { modalClose(); this.executePurchase(item, true) },
      })
    }
    if (!canAffordGold && !canAffordDG) {
      actions.push({
        label: 'SALDO INSUFICIENTE', kind: 'ghost',
        onClick: () => modalClose(),
      })
    }

    const { close } = UI.modal(this, {
      eyebrow: RARITY_LABEL[item.rarity] ?? '',
      title:   `Comprar ${item.name}?`,
      body:    item.dropCount > 0
        ? `${item.desc}  ·  ${item.dropCount} skill${item.dropCount > 1 ? 's' : ''} aleatória${item.dropCount > 1 ? 's' : ''}.`
        : item.desc,
      actions,
    }, { width: 480 })
    modalClose = close
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PURCHASE EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  private executePurchase(item: ShopItem, useDG: boolean) {
    if (useDG) { if (!playerData.spendDG(item.dgPrice)) return }
    else { if (!playerData.spendGold(item.goldPrice)) return }

    const dropped: { skillId: string; unitClass: string; isNew: boolean }[] = []
    for (let i = 0; i < item.dropCount; i++) {
      const type = item.dropType === 'both'
        ? (i < item.dropCount / 2 ? 'defense' : 'attack')
        : item.dropType
      const sk = randomSkill(type)
      if (!sk) continue
      const existing = playerData.getSkills().find(s => s.skillId === sk.skillId)
      if (existing) {
        playerData.addSkillProgress(sk.skillId)
        dropped.push({ skillId: sk.skillId, unitClass: sk.unitClass, isNew: false })
      } else {
        playerData.addSkill(sk.skillId, sk.unitClass)
        dropped.push({ skillId: sk.skillId, unitClass: sk.unitClass, isNew: true })
      }
    }

    this.refreshBalance()

    if (dropped.length > 0) {
      const updatedSkills = playerData.getSkills()
      const drops = dropped.map(d => {
        const entry = SKILL_CATALOG.find(s => s.id === d.skillId)
        const owned = updatedSkills.find(s => s.skillId === d.skillId)
        return {
          name: entry?.name ?? d.skillId,
          unitClass: d.unitClass,
          effectType: entry?.effectType ?? 'damage',
          power: entry?.power ?? 0,
          description: entry?.description ?? '',
          skillId: d.skillId,
          group: entry?.group ?? 'attack1',
          level: owned?.level ?? 1,
          progress: owned?.progress ?? 0,
          isProgressGain: !d.isNew,
        }
      })
      showPackOpen(this, drops)
    }

    // Redraw cards (lock state may have changed)
    this.drawCards()
  }

  private refreshBalance() {
    // currencyPill autosizes by content — destroy + rebuild on amount change
    this.balanceGoldPill?.destroy(true)
    this.balanceDgPill?.destroy(true)
    this.balanceGoldPill = UI.currencyPill(this, W - 220, TOP_BAR_H / 2, {
      kind: 'gold', amount: playerData.getGold(),
    })
    this.balanceDgPill = UI.currencyPill(this, W - 90, TOP_BAR_H / 2, {
      kind: 'dg', amount: playerData.getDG(),
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ICONS — 3D-style drawn
  // ═══════════════════════════════════════════════════════════════════════════

  /** Attack icon — realistic medieval sword */
  private drawSwordIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, scale = 1) {
    const s = scale

    // ── Blade (double-edged, tapered with beveled center) ──
    // Right half of blade (lighter — simulates light catching edge)
    g.fillStyle(color, 0.65)
    g.beginPath()
    g.moveTo(x, y - 26 * s)          // tip
    g.lineTo(x + 4.5 * s, y - 4 * s) // right edge widens
    g.lineTo(x + 3.5 * s, y + 4 * s) // slight taper at base
    g.lineTo(x, y + 4 * s)           // center bottom
    g.closePath()
    g.fillPath()
    // Left half (darker — shadow side)
    g.fillStyle(color, 0.45)
    g.beginPath()
    g.moveTo(x, y - 26 * s)
    g.lineTo(x - 4.5 * s, y - 4 * s)
    g.lineTo(x - 3.5 * s, y + 4 * s)
    g.lineTo(x, y + 4 * s)
    g.closePath()
    g.fillPath()
    // Blade outline
    g.lineStyle(1 * s, color, 0.9)
    g.beginPath()
    g.moveTo(x, y - 26 * s)
    g.lineTo(x + 4.5 * s, y - 4 * s)
    g.lineTo(x + 3.5 * s, y + 4 * s)
    g.lineTo(x - 3.5 * s, y + 4 * s)
    g.lineTo(x - 4.5 * s, y - 4 * s)
    g.closePath()
    g.strokePath()
    // Central fuller (groove in blade)
    g.lineStyle(1.5 * s, 0x000000, 0.15)
    g.lineBetween(x, y - 22 * s, x, y + 2 * s)
    // Edge highlight (specular reflection on right edge)
    g.lineStyle(0.8, 0xffffff, 0.25)
    g.lineBetween(x + 3.5 * s, y - 20 * s, x + 4 * s, y - 6 * s)

    // ── Crossguard (curved, substantial) ──
    g.fillStyle(color, 0.8)
    g.beginPath()
    g.moveTo(x - 15 * s, y + 3 * s)
    g.lineTo(x - 14 * s, y + 7 * s)
    g.lineTo(x + 14 * s, y + 7 * s)
    g.lineTo(x + 15 * s, y + 3 * s)
    g.closePath()
    g.fillPath()
    g.lineStyle(1, color, 0.9)
    g.strokePath()
    // Guard center accent
    g.fillStyle(0xffffff, 0.15)
    g.fillRect(x - 2 * s, y + 4 * s, 4 * s, 2 * s)

    // ── Grip (leather-wrapped) ──
    g.fillStyle(color, 0.35)
    g.fillRect(x - 2.5 * s, y + 7 * s, 5 * s, 14 * s)
    g.lineStyle(0.8, color, 0.6)
    g.strokeRect(x - 2.5 * s, y + 7 * s, 5 * s, 14 * s)
    // Leather wraps
    for (let i = 0; i < 5; i++) {
      const gy = y + (8 + i * 2.8) * s
      g.lineStyle(0.7, 0xffffff, 0.06)
      g.lineBetween(x - 2.5 * s, gy, x + 2.5 * s, gy)
    }

    // ── Pommel (round, substantial) ──
    g.fillStyle(color, 0.7)
    g.fillCircle(x, y + 23 * s, 4 * s)
    g.lineStyle(1, color, 0.9)
    g.strokeCircle(x, y + 23 * s, 4 * s)
    // Pommel gem highlight
    g.fillStyle(0xffffff, 0.2)
    g.fillCircle(x - 1.2 * s, y + 22 * s, 1.5 * s)
  }

  /** Defense icon — realistic heater shield with heraldry */
  private drawShieldIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, scale = 1) {
    const s = scale

    // ── Shield body (heater shape — flat top, pointed bottom) ──
    // Right half (lighter side)
    g.fillStyle(color, 0.2)
    g.beginPath()
    g.moveTo(x, y - 22 * s)          // top center
    g.lineTo(x + 18 * s, y - 20 * s) // top right
    g.lineTo(x + 17 * s, y + 2 * s)  // mid right
    g.lineTo(x, y + 24 * s)          // bottom point
    g.closePath()
    g.fillPath()
    // Left half (slightly darker for depth)
    g.fillStyle(color, 0.13)
    g.beginPath()
    g.moveTo(x, y - 22 * s)
    g.lineTo(x - 18 * s, y - 20 * s)
    g.lineTo(x - 17 * s, y + 2 * s)
    g.lineTo(x, y + 24 * s)
    g.closePath()
    g.fillPath()

    // ── Shield outline (thick, solid) ──
    g.lineStyle(2.5 * s, color, 0.85)
    g.beginPath()
    g.moveTo(x - 18 * s, y - 20 * s)
    g.lineTo(x + 18 * s, y - 20 * s) // top edge
    g.lineTo(x + 17 * s, y + 2 * s)  // right edge
    g.lineTo(x, y + 24 * s)          // bottom point
    g.lineTo(x - 17 * s, y + 2 * s)  // left edge
    g.closePath()
    g.strokePath()

    // ── Shield rim (inner border) ──
    g.lineStyle(1 * s, color, 0.3)
    g.beginPath()
    g.moveTo(x - 14 * s, y - 16 * s)
    g.lineTo(x + 14 * s, y - 16 * s)
    g.lineTo(x + 13 * s, y + 0 * s)
    g.lineTo(x, y + 18 * s)
    g.lineTo(x - 13 * s, y + 0 * s)
    g.closePath()
    g.strokePath()

    // ── Central vertical band (heraldry stripe) ──
    g.fillStyle(color, 0.25)
    g.beginPath()
    g.moveTo(x - 3 * s, y - 20 * s)
    g.lineTo(x + 3 * s, y - 20 * s)
    g.lineTo(x + 2 * s, y + 20 * s)
    g.lineTo(x, y + 24 * s)
    g.lineTo(x - 2 * s, y + 20 * s)
    g.closePath()
    g.fillPath()

    // ── Center boss (round metal piece) ──
    g.fillStyle(color, 0.55)
    g.fillCircle(x, y - 2 * s, 5 * s)
    g.lineStyle(1, color, 0.8)
    g.strokeCircle(x, y - 2 * s, 5 * s)
    // Boss inner ring
    g.lineStyle(0.8, 0xffffff, 0.12)
    g.strokeCircle(x, y - 2 * s, 3 * s)
    // Boss highlight
    g.fillStyle(0xffffff, 0.15)
    g.fillCircle(x - 1.5 * s, y - 3.5 * s, 2 * s)

    // ── Top edge highlight (light glint) ──
    g.lineStyle(1, 0xffffff, 0.1)
    g.lineBetween(x - 14 * s, y - 19 * s, x + 14 * s, y - 19 * s)
  }

  /** DG coin icon — large violet gem coin (Print 11 vocabulary) */
  private drawDGCoinIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
    // Outer glow
    g.fillStyle(currency.dgGem, 0.10)
    g.fillCircle(x, y, r + 4)
    // Coin body
    g.fillStyle(currency.dgGem, 0.6)
    g.fillCircle(x, y, r)
    g.lineStyle(2, currency.dgGemEdge, 1)
    g.strokeCircle(x, y, r)
    // Inner ring
    g.lineStyle(1, 0xffffff, 0.1)
    g.strokeCircle(x, y, r * 0.7)
    // Diamond emblem
    const ds = r * 0.45
    g.fillStyle(0xffffff, 0.3)
    g.fillPoints([
      new Phaser.Geom.Point(x, y - ds),
      new Phaser.Geom.Point(x + ds * 0.7, y),
      new Phaser.Geom.Point(x, y + ds),
      new Phaser.Geom.Point(x - ds * 0.7, y),
    ], true)
    // Diamond highlight
    g.fillStyle(0xffffff, 0.15)
    g.fillPoints([
      new Phaser.Geom.Point(x, y - ds),
      new Phaser.Geom.Point(x + ds * 0.35, y - ds * 0.2),
      new Phaser.Geom.Point(x, y),
      new Phaser.Geom.Point(x - ds * 0.35, y - ds * 0.2),
    ], true)
    // Top shine
    g.fillStyle(0xffffff, 0.08)
    g.fillCircle(x - r * 0.2, y - r * 0.3, r * 0.2)
  }

  shutdown() { this.tweens.killAll() }
}
