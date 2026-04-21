import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import { playerData } from '../utils/PlayerDataManager'
import { transitionTo } from '../utils/SceneTransition'
import { soundManager } from '../utils/SoundManager'
import { UI } from '../utils/UIComponents'
import {
  C, S, SHADOW, SCREEN,
  accent, border, fg, fontFamily, motion, radii, surface, typeScale,
} from '../utils/DesignTokens'
import { PASS_XP_PER_TIER, PASS_MAX_TIER } from '../data/battlePass'
import { showPlayModesOverlay, type PlayModesOverlayHandle } from '../utils/PlayModesOverlay'

// ---- Layout constants (1280 x 720) -----------------------------------------

const W = SCREEN.W
const H = SCREEN.H

const PANEL_BORDER = border.default
const GOLD_ACCENT  = accent.primaryHex
const GOLD_HEX     = accent.primary
const GOLD_DIM     = accent.dimHex
const ICE_BLUE     = C.infoHex
const ICE_BLUE_HEX = C.info
const TEXT_MUTED   = fg.tertiaryHex
const BTN_FILL     = surface.raised

// ---- Bottom icons data ------------------------------------------------------

interface BottomIcon {
  label: string
  target: string
  color: number
}

const BOTTOM_ICONS: BottomIcon[] = [
  { label: 'LOJA',    target: 'ShopScene',         color: 0xffa726 },
  { label: 'SKILLS',  target: 'SkillUpgradeScene', color: 0x26c6da },
  { label: 'TREINO',  target: 'BattleScene',        color: 0x4ade80 },
  { label: 'RANKING', target: 'RankingScene',       color: 0xf0c850 },
]

// ---- Scene ------------------------------------------------------------------

export default class LobbyScene extends Phaser.Scene {
  private overlayElements: Phaser.GameObjects.GameObject[] = []
  private overlayOpen = false
  private playModesHandle: PlayModesOverlayHandle | null = null
  private bottomIconContainers: Phaser.GameObjects.Container[] = []
  private offlineContainer: Phaser.GameObjects.Container | null = null
  private centralPlayContainer: Phaser.GameObjects.Container | null = null
  private battlePassContainer: Phaser.GameObjects.Container | null = null

  constructor() {
    super('LobbyScene')
  }

  create() {
    GameStateManager.set(GameState.MENU)

    // ── Atmosphere ──
    UI.background(this)
    UI.particles(this, 30)
    this._createFogLayers()
    this._createEmberParticles(10)

    this.drawTopBar()
    this.drawCentralPlayArea()
    this.drawOfflineAttackLink()
    this.drawBottomIconBar()
    this.drawBattlePassButton()
    this.drawFooter()

    UI.fadeIn(this)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ATMOSPHERE
  // ═══════════════════════════════════════════════════════════════════════════

  private _createFogLayers() {
    for (let i = 0; i < 3; i++) {
      const fogY = H * (0.55 + i * 0.15)
      const fogH = 25 + i * 12
      const fog = this.add.rectangle(W / 2, fogY, W * 1.5, fogH, C.fog, 0.012 + i * 0.004)
      this.tweens.add({
        targets: fog,
        x: fog.x + 70 - i * 35,
        alpha: { from: fog.alpha, to: fog.alpha * 0.3 },
        duration: 9000 + i * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
        delay: i * 1200,
      })
    }
  }

  private _createEmberParticles(count: number) {
    for (let i = 0; i < count; i++) {
      const px = Math.random() * W
      const size = 1 + Math.random() * 2
      const baseAlpha = 0.04 + Math.random() * 0.08
      const ember = this.add.circle(px, H + 15, size, C.ash, baseAlpha)
      this.tweens.add({
        targets: ember,
        y: H * 0.3 + Math.random() * H * 0.4,
        x: px + (Math.random() - 0.5) * 50,
        alpha: 0,
        duration: 5000 + Math.random() * 5000,
        repeat: -1,
        delay: Math.random() * 4000,
        ease: 'Quad.Out',
        onRepeat: () => {
          ember.setPosition(Math.random() * W, H + 15)
          ember.setAlpha(baseAlpha)
        },
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOP BAR (Y: 0-65) — Premium gradient with animated avatar
  // ═══════════════════════════════════════════════════════════════════════════

  private drawTopBar() {
    const p = playerData.get()
    const barH = 56

    // ── Background: surface.panel + 1px border-subtle bottom (per §S2 spec) ──
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 0.98)
    bg.fillRect(0, 0, W, barH)
    bg.fillStyle(border.subtle, 1)
    bg.fillRect(0, barH - 1, W, 1)

    // ── LEFT: Avatar badge + username + XP bar ──
    const avatarX = 36
    const avatarY = barH / 2

    const avatar = UI.avatarBadge(this, avatarX, avatarY, {
      initial: p.username ? p.username.charAt(0) : 'P',
      level:   p.level,
      size:    40,
      onClick: () => transitionTo(this, 'ProfileScene'),
    })

    // Username (Cormorant h3)
    const nameX = avatarX + 28
    this.add.text(nameX, avatarY - 8, p.username, {
      fontFamily: fontFamily.serif, fontSize: typeScale.h3,
      color:      fg.primaryHex,
      fontStyle:  '600',
    }).setOrigin(0, 0.5)

    // XP progress bar (thin, under name)
    const xpRatio = p.xp / (50 * Math.pow(p.level + 1, 1.8))
    const xpBarW = 110
    const xpBarH = 4
    const xpBarX = nameX
    const xpBarY = avatarY + 12
    const xpBg = this.add.graphics()
    xpBg.fillStyle(surface.deepest, 1)
    xpBg.fillRoundedRect(xpBarX, xpBarY - xpBarH / 2, xpBarW, xpBarH, 2)
    const xpFillW = Math.max(3, xpBarW * Math.min(xpRatio, 1))
    this.add.rectangle(xpBarX + xpFillW / 2, xpBarY, xpFillW, xpBarH - 1, C.info, 0.8)

    // ── RIGHT: Currency pills + Lucide settings gear ──
    const rightEdge = W - 20

    // Settings gear (Lucide)
    const gearX = rightEdge
    const gearY = avatarY
    const gearIcon = UI.lucideIcon(this, 'settings', gearX, gearY, 20, fg.tertiary)
    const gearHit = this.add.circle(gearX, gearY, 20, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    gearHit.on('pointerover', () => gearIcon.setTintFill(fg.primary))
    gearHit.on('pointerout',  () => gearIcon.setTintFill(fg.tertiary))
    gearHit.on('pointerdown', () => transitionTo(this, 'SettingsScene'))

    // DG pill (clickable → Shop DG tab)
    const dgPill = UI.currencyPill(this, 0, avatarY, {
      kind: 'dg', amount: p.dg,
      onClick: () => transitionTo(this, 'ShopScene', { tab: 'dg' }),
    })
    // Place relative to gear
    const dgBounds = dgPill.getBounds()
    dgPill.setX(gearX - 24 - dgBounds.width / 2)

    // Gold pill
    const goldPill = UI.currencyPill(this, 0, avatarY, {
      kind: 'gold', amount: p.gold,
      onClick: () => transitionTo(this, 'ShopScene', { tab: 'gold' }),
    })
    const goldBounds = goldPill.getBounds()
    goldPill.setX(dgPill.x - dgBounds.width / 2 - 12 - goldBounds.width / 2)

    // ── Entrance: top bar fades + slides down ──
    const topBarElements = [bg, avatar, xpBg, gearIcon, gearHit, dgPill, goldPill]
    topBarElements.forEach(el => {
      if ('setAlpha' in el) (el as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0)
    })
    this.tweens.add({
      targets: topBarElements.filter(el => 'alpha' in el),
      alpha: 1,
      duration: motion.durBase, delay: 100, ease: motion.easeOut,
    })
    // Silence legacy identifiers kept for backward compat (icon, hit zones).
    void GOLD_ACCENT; void GOLD_HEX; void GOLD_DIM; void ICE_BLUE; void ICE_BLUE_HEX
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CENTRAL PLAY AREA (Y: 80-470) — Epic panel with multi-layer depth
  // ═══════════════════════════════════════════════════════════════════════════

  private drawCentralPlayArea() {
    const panelW = 720
    const panelH = 365
    const panelX = W / 2
    const panelY = 85 + panelH / 2

    const container = this.add.container(panelX, panelY).setAlpha(0).setScale(0.85)
    this.centralPlayContainer = container

    // ── Panel background: surface.panel + border.default + radii.xl (spec §12) ──
    const panelGfx = this.add.graphics()
    // Outer soft gold glow halo
    panelGfx.fillStyle(accent.primary, 0.05)
    panelGfx.fillRoundedRect(-panelW / 2 - 6, -panelH / 2 - 6, panelW + 12, panelH + 12, radii.xl + 3)
    // Main fill
    panelGfx.fillStyle(surface.panel, 1)
    panelGfx.fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, radii.xl)
    // Top inset highlight (1px)
    panelGfx.fillStyle(0xffffff, 0.05)
    panelGfx.fillRoundedRect(-panelW / 2 + 2, -panelH / 2 + 2, panelW - 4, 1,
      { tl: radii.xl - 2, tr: radii.xl - 2, bl: 0, br: 0 })
    // Default border (design-system subtle) + outer gold accent
    panelGfx.lineStyle(1, border.default, 1)
    panelGfx.strokeRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, radii.xl)
    panelGfx.lineStyle(2, accent.primary, 0.55)
    panelGfx.strokeRoundedRect(-panelW / 2 - 2, -panelH / 2 - 2, panelW + 4, panelH + 4, radii.xl + 1)
    container.add(panelGfx)

    // Corner ornaments (kept for premium feel)
    const corners = UI.cornerOrnaments(this, 0, 0, panelW - 20, panelH - 20, accent.primary, 0.22, 26)
    container.add(corners)

    // Internal battle grid (very subtle accent lines)
    const gridGfx = this.add.graphics()
    gridGfx.lineStyle(1, accent.primary, 0.03)
    const gridCols = 12
    const gridRows = 5
    const gridW = panelW - 80
    const gridH = panelH - 60
    const cellW = gridW / gridCols
    const cellH = gridH / gridRows
    for (let c = 0; c <= gridCols; c++) {
      const gx = -gridW / 2 + c * cellW
      gridGfx.lineBetween(gx, -gridH / 2, gx, gridH / 2)
    }
    for (let r = 0; r <= gridRows; r++) {
      const gy = -gridH / 2 + r * cellH
      gridGfx.lineBetween(-gridW / 2, gy, gridW / 2, gy)
    }
    container.add(gridGfx)

    // Pulsing outer glow
    const outerGlow = this.add.graphics()
    outerGlow.lineStyle(4, accent.primary, 0.1)
    outerGlow.strokeRoundedRect(-panelW / 2 - 4, -panelH / 2 - 4, panelW + 8, panelH + 8, radii.xl + 2)
    container.add(outerGlow)
    this.tweens.add({
      targets: outerGlow,
      alpha: { from: 0.3, to: 1 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })

    // "JOGAR" title — Cinzel h1 via typeScale, accent.primary + letter-spacing
    const title = this.add.text(0, -panelH / 2 + 52, 'JOGAR', {
      fontFamily: fontFamily.display, fontSize: '44px',
      color:      accent.primaryHex,
      fontStyle:  '900',
      shadow:     SHADOW.goldGlow,
    }).setOrigin(0.5)
    const anyTitle = title as unknown as { setLetterSpacing?: (n: number) => void }
    if (typeof anyTitle.setLetterSpacing === 'function') anyTitle.setLetterSpacing(3.5)
    container.add(title)

    const titleShimmer = UI.shimmer(this, panelX, panelY - panelH / 2 + 52, 220, 50, 4500)
    titleShimmer.setDepth(5)

    // Crossed swords → Lucide 'swords' icon, gold tint, large
    const swordsIcon = UI.lucideIcon(this, 'swords', 0, 22, 48, accent.primary)
    container.add(swordsIcon)

    // Swords glow pulse
    const swordsGlow = this.add.circle(0, 22, 50, accent.primary, 0)
    container.addAt(swordsGlow, container.list.indexOf(swordsIcon))
    this.tweens.add({
      targets: swordsGlow,
      alpha: { from: 0.05, to: 0.18 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })

    // Subtitle (Manrope body, fg.secondary)
    const subtitle = this.add.text(0, 92, 'Escolha seu modo de batalha', {
      fontFamily: fontFamily.body, fontSize: typeScale.body,
      color:      fg.secondaryHex,
      fontStyle:  '500',
    }).setOrigin(0.5)
    container.add(subtitle)

    // Floating gold particles inside panel
    for (let i = 0; i < 8; i++) {
      const px = (Math.random() - 0.5) * (panelW - 60)
      const py = (Math.random() - 0.5) * (panelH - 40)
      const dot = this.add.circle(px, py, 1 + Math.random() * 1.5, C.goldDim, 0.04 + Math.random() * 0.06)
      container.add(dot)
      this.tweens.add({
        targets: dot,
        y: py - 20 - Math.random() * 30,
        alpha: 0,
        duration: 3000 + Math.random() * 3000,
        repeat: -1,
        delay: Math.random() * 3000,
        onRepeat: () => {
          dot.setPosition((Math.random() - 0.5) * (panelW - 60), (Math.random() - 0.5) * (panelH - 40))
          dot.setAlpha(0.04 + Math.random() * 0.06)
        },
      })
    }

    // Clickable hit zone
    const hitZone = this.add.rectangle(0, 0, panelW, panelH, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })
    container.add(hitZone)

    hitZone.on('pointerover', () => {
      this.tweens.add({ targets: container, scaleX: 1.025, scaleY: 1.025, duration: 180, ease: 'Sine.Out' })
      title.setColor('#ffe680')
    })
    hitZone.on('pointerout', () => {
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 180, ease: 'Sine.Out' })
      title.setColor(GOLD_ACCENT)
    })
    hitZone.on('pointerdown', () => {
      if (!this.overlayOpen) this.showPlayModes()
    })

    // Entrance animation
    this.tweens.add({
      targets: container,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 550, delay: 200, ease: 'Back.easeOut',
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BATTLE PASS BANNER (hidden — under review)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Special, ornate "Passe de Batalha" button sitting to the LEFT of the
   * standard bottom icon bar. Intentionally different from the 4 standard
   * icons (larger, purple gradient, pulsing aura, inline tier + XP badge,
   * unclaimed gift indicator) so it reads as a featured call-to-action
   * rather than a generic nav tile.
   *
   * Positioning is relative to the existing bar layout computed in
   * drawBottomIconBar(): we place ourselves just to the left of the first
   * standard icon without moving any of them.
   */
  public drawBattlePassButton() {
    const bp = playerData.getBattlePass()
    const hasUnclaimed = playerData.hasUnclaimedRewards()

    // ── Geometry — mirror drawBottomIconBar() so we hug the first icon ──
    const stdIconW = 120
    const stdIconH = 100
    const stdGap = 24
    const stdCount = BOTTOM_ICONS.length
    const stdTotalW = stdCount * stdIconW + (stdCount - 1) * stdGap
    const stdStartCenterX = (W - stdTotalW) / 2 + stdIconW / 2   // first icon center
    const stdFirstLeftX = stdStartCenterX - stdIconW / 2         // first icon left edge
    const centerY = 525 + stdIconH / 2                           // same Y as other icons

    // Battle pass button is slightly taller + wider for emphasis
    const btnW = 150
    const btnH = 116
    const btnLeftGap = 26                                        // gap between this and first icon
    const bx = stdFirstLeftX - btnLeftGap - btnW / 2
    const by = centerY

    const container = this.add.container(bx, by).setAlpha(0).setScale(0.9)
    // Track the BP container as a class property so showPlayModes() can
    // dim it together with the other bottom-bar buttons when the modes
    // overlay opens.
    this.battlePassContainer = container

    // ── Pulsing aura (behind everything) ──
    const aura = this.add.graphics()
    aura.fillStyle(0x8844cc, 0.18)
    aura.fillRoundedRect(-btnW / 2 - 6, -btnH / 2 - 6, btnW + 12, btnH + 12, S.borderRadiusLarge + 3)
    container.add(aura)
    this.tweens.add({
      targets: aura,
      alpha: { from: 0.35, to: 0.85 },
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // ── Main background: purple gradient w/ double border ──
    const bgGfx = this.add.graphics()
    // Outer soft shadow
    bgGfx.fillStyle(0x000000, 0.3)
    bgGfx.fillRoundedRect(-btnW / 2 + 2, -btnH / 2 + 4, btnW, btnH, S.borderRadiusLarge)
    // Dark violet base
    bgGfx.fillStyle(0x1a0f2e, 0.98)
    bgGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, S.borderRadiusLarge)
    // Purple gradient top-down (simulate with two strips)
    bgGfx.fillStyle(0x8844cc, 0.22)
    bgGfx.fillRoundedRect(-btnW / 2 + 1, -btnH / 2 + 1, btnW - 2, btnH / 2,
      { tl: S.borderRadiusLarge - 1, tr: S.borderRadiusLarge - 1, bl: 0, br: 0 })
    bgGfx.fillStyle(0x4a1a6a, 0.25)
    bgGfx.fillRoundedRect(-btnW / 2 + 1, 0, btnW - 2, btnH / 2 - 1,
      { tl: 0, tr: 0, bl: S.borderRadiusLarge - 1, br: S.borderRadiusLarge - 1 })
    // Top gloss
    bgGfx.fillStyle(0xffffff, 0.05)
    bgGfx.fillRoundedRect(-btnW / 2 + 3, -btnH / 2 + 3, btnW - 6, 20,
      { tl: S.borderRadiusLarge - 2, tr: S.borderRadiusLarge - 2, bl: 0, br: 0 })
    // Double border — outer violet + inner bright violet
    bgGfx.lineStyle(2, 0x8844cc, 0.9)
    bgGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, S.borderRadiusLarge)
    bgGfx.lineStyle(1, 0xcc88ff, 0.5)
    bgGfx.strokeRoundedRect(-btnW / 2 + 3, -btnH / 2 + 3, btnW - 6, btnH - 6, S.borderRadiusLarge - 2)
    container.add(bgGfx)

    // ── Ornate corner jewels (4 cantos) ──
    const jewelGfx = this.add.graphics()
    const jewels: Array<[number, number]> = [
      [-btnW / 2 + 8, -btnH / 2 + 8],
      [ btnW / 2 - 8, -btnH / 2 + 8],
      [-btnW / 2 + 8,  btnH / 2 - 8],
      [ btnW / 2 - 8,  btnH / 2 - 8],
    ]
    for (const [jx, jy] of jewels) {
      jewelGfx.fillStyle(0xcc88ff, 0.85)
      jewelGfx.fillCircle(jx, jy, 2.2)
      jewelGfx.fillStyle(0xffffff, 0.6)
      jewelGfx.fillCircle(jx - 0.6, jy - 0.6, 0.9)
    }
    container.add(jewelGfx)

    // ── Header strip: "PASSE DE BATALHA" — Cinzel display ──
    container.add(this.add.text(0, -btnH / 2 + 16, 'PASSE', {
      fontFamily: fontFamily.display, fontSize: '13px', color: '#ffffff', fontStyle: '700',
      shadow: { offsetX: 0, offsetY: 1, color: '#2a0a4a', blur: 6, fill: true },
    }).setOrigin(0.5))
    container.add(this.add.text(0, -btnH / 2 + 30, 'DE BATALHA', {
      fontFamily: fontFamily.display, fontSize: '10px', color: '#cc88ff', fontStyle: '700',
      shadow: { offsetX: 0, offsetY: 1, color: '#2a0a4a', blur: 4, fill: true },
    }).setOrigin(0.5))

    // Divider under header
    const divGfx = this.add.graphics()
    divGfx.fillStyle(0xcc88ff, 0.4)
    divGfx.fillRect(-btnW / 2 + 14, -btnH / 2 + 38, btnW - 28, 1)
    container.add(divGfx)

    // ── Diamond/gem emblem in the middle ──
    const emblem = this.add.graphics()
    const ex = 0
    const ey = -4
    // Outer diamond
    emblem.fillStyle(0xcc88ff, 0.9)
    emblem.beginPath()
    emblem.moveTo(ex, ey - 12)
    emblem.lineTo(ex + 9, ey)
    emblem.lineTo(ex, ey + 12)
    emblem.lineTo(ex - 9, ey)
    emblem.closePath()
    emblem.fillPath()
    // Inner highlight
    emblem.fillStyle(0xffffff, 0.55)
    emblem.beginPath()
    emblem.moveTo(ex, ey - 9)
    emblem.lineTo(ex + 5, ey - 2)
    emblem.lineTo(ex, ey)
    emblem.lineTo(ex - 5, ey - 2)
    emblem.closePath()
    emblem.fillPath()
    // Outer stroke
    emblem.lineStyle(1.5, 0xffffff, 0.8)
    emblem.beginPath()
    emblem.moveTo(ex, ey - 12)
    emblem.lineTo(ex + 9, ey)
    emblem.lineTo(ex, ey + 12)
    emblem.lineTo(ex - 9, ey)
    emblem.closePath()
    emblem.strokePath()
    container.add(emblem)

    // Gem glow
    const gemGlow = this.add.circle(ex, ey, 18, 0xcc88ff, 0.15)
    container.addAt(gemGlow, 3)  // behind the emblem but above background
    this.tweens.add({
      targets: gemGlow,
      alpha: { from: 0.08, to: 0.28 },
      scale: { from: 0.9, to: 1.15 },
      duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // ── Tier badge (right side of emblem) — Mono tabular (Nv) / Cinzel (MAX) ──
    const tierLabel = bp.tier >= PASS_MAX_TIER ? 'MAX' : `Nv${bp.tier}`
    container.add(this.add.text(0, 18, tierLabel, {
      fontFamily: bp.tier >= PASS_MAX_TIER ? fontFamily.display : fontFamily.mono,
      fontSize: '13px', color: '#ffffff', fontStyle: '700',
      shadow: { offsetX: 0, offsetY: 1, color: '#2a0a4a', blur: 5, fill: true },
    }).setOrigin(0.5))

    // ── XP progress bar (bottom interior) ──
    if (bp.tier < PASS_MAX_TIER) {
      const barW = btnW - 30
      const barH = 6
      const barX = -barW / 2
      const barY = btnH / 2 - 16
      const barGfx = this.add.graphics()
      // Track
      barGfx.fillStyle(0x0a0818, 1)
      barGfx.fillRoundedRect(barX, barY, barW, barH, barH / 2)
      // Fill
      const ratio = bp.xp / PASS_XP_PER_TIER
      const fillW = Math.max(barH, barW * ratio)
      barGfx.fillStyle(0xcc88ff, 0.9)
      barGfx.fillRoundedRect(barX, barY, fillW, barH, barH / 2)
      // Top gloss on fill
      barGfx.fillStyle(0xffffff, 0.25)
      barGfx.fillRoundedRect(barX, barY, fillW, barH * 0.4, { tl: barH / 2, tr: barH / 2, bl: 0, br: 0 })
      // Track border
      barGfx.lineStyle(1, 0x8844cc, 0.55)
      barGfx.strokeRoundedRect(barX, barY, barW, barH, barH / 2)
      container.add(barGfx)
    } else {
      // MAX label replaces bar
      container.add(this.add.text(0, btnH / 2 - 13, 'RECOMPENSAS MAX', {
        fontFamily: fontFamily.body, fontSize: '9px', color: accent.primaryHex,
        fontStyle: '700', shadow: SHADOW.text,
      }).setOrigin(0.5))
    }

    // ── Unclaimed rewards gift badge (top-right corner) ──
    if (hasUnclaimed) {
      const badgeX = btnW / 2 - 10
      const badgeY = -btnH / 2 + 10

      const badgePulse = this.add.circle(badgeX, badgeY, 12, 0xff5252, 0)
      container.add(badgePulse)
      this.tweens.add({
        targets: badgePulse,
        alpha: { from: 0.15, to: 0.5 },
        scale: { from: 0.9, to: 1.2 },
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      })

      const badgeGfx = this.add.graphics()
      badgeGfx.fillStyle(0xff5252, 1)
      badgeGfx.fillCircle(badgeX, badgeY, 7)
      badgeGfx.lineStyle(1.5, 0xffffff, 0.9)
      badgeGfx.strokeCircle(badgeX, badgeY, 7)
      container.add(badgeGfx)

      container.add(this.add.text(badgeX, badgeY, '!', {
        fontFamily: fontFamily.display, fontSize: '10px', color: '#ffffff', fontStyle: '900',
      }).setOrigin(0.5))
    }

    // ── Interaction ──
    const hit = this.add.rectangle(0, 0, btnW, btnH, 0, 0.001)
      .setInteractive({ useHandCursor: true })
    container.add(hit)

    const hoverGlow = this.add.graphics()
    hoverGlow.lineStyle(3, 0xe0b0ff, 0.85)
    hoverGlow.strokeRoundedRect(-btnW / 2 - 1, -btnH / 2 - 1, btnW + 2, btnH + 2, S.borderRadiusLarge + 1)
    hoverGlow.setAlpha(0)
    container.add(hoverGlow)

    hit.on('pointerover', () => {
      hoverGlow.setAlpha(1)
      this.tweens.add({ targets: container, scaleX: 1.06, scaleY: 1.06, duration: 140, ease: 'Sine.Out' })
    })
    hit.on('pointerout', () => {
      hoverGlow.setAlpha(0)
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 140, ease: 'Sine.Out' })
    })
    hit.on('pointerdown', () => {
      this.tweens.add({
        targets: container, scaleX: 0.94, scaleY: 0.94, duration: 70,
        yoyo: true, ease: 'Sine.InOut',
        onComplete: () => transitionTo(this, 'BattlePassScene'),
      })
    })

    // Entrance animation — matches the bottom bar staggered slide-up
    container.y = by + 50
    this.tweens.add({
      targets: container,
      y: by, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 500, delay: 350, ease: 'Back.easeOut',
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OFFLINE ATTACK LINK — Mini-panel with icon
  // ═══════════════════════════════════════════════════════════════════════════

  private drawOfflineAttackLink() {
    const p = playerData.get()
    const btnY = 488
    const available = p.level >= 30
    const accentColor = available ? 0xffa726 : 0x555555
    const accentHex = available ? '#ffa726' : TEXT_MUTED

    const btnW = 280
    const btnH = 44
    const container = this.add.container(W / 2, btnY).setAlpha(0)
    this.offlineContainer = container

    // Button background with depth
    const bgGfx = this.add.graphics()
    // Shadow
    bgGfx.fillStyle(0x000000, 0.2)
    bgGfx.fillRoundedRect(-btnW / 2 + 2, -btnH / 2 + 3, btnW, btnH, 8)
    // Main fill
    bgGfx.fillStyle(available ? 0x1a1408 : 0x0e1018, 0.9)
    bgGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8)
    // Top gloss
    bgGfx.fillStyle(0xffffff, 0.02)
    bgGfx.fillRoundedRect(-btnW / 2 + 2, -btnH / 2 + 2, btnW - 4, btnH * 0.35,
      { tl: 6, tr: 6, bl: 0, br: 0 })
    // Left accent bar
    bgGfx.fillStyle(accentColor, available ? 0.8 : 0.3)
    bgGfx.fillRoundedRect(-btnW / 2, -btnH / 2, 4, btnH,
      { tl: 8, bl: 8, tr: 0, br: 0 })
    // Border
    bgGfx.lineStyle(1, accentColor, available ? 0.4 : 0.2)
    bgGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8)
    container.add(bgGfx)

    // Sword + castle icon (larger, better drawn)
    const iconGfx = this.add.graphics()
    const iX = -btnW / 2 + 30
    // Sword blade
    iconGfx.lineStyle(2.5, accentColor, available ? 0.85 : 0.4)
    iconGfx.lineBetween(iX - 2, -12, iX + 4, 10)
    // Crossguard
    iconGfx.lineStyle(2, accentColor, available ? 0.7 : 0.3)
    iconGfx.lineBetween(iX - 6, 0, iX + 10, -4)
    // Pommel
    iconGfx.fillStyle(accentColor, available ? 0.7 : 0.3)
    iconGfx.fillCircle(iX - 3, -13, 2.5)
    // Castle
    const cX = iX + 20
    iconGfx.fillStyle(accentColor, available ? 0.5 : 0.2)
    iconGfx.fillRect(cX - 8, -6, 16, 12)
    // Battlements
    iconGfx.fillRect(cX - 8, -10, 4, 4)
    iconGfx.fillRect(cX + 4, -10, 4, 4)
    // Door
    iconGfx.fillStyle(0x000000, 0.4)
    iconGfx.fillRect(cX - 2, 1, 4, 5)
    container.add(iconGfx)

    // Label (Cormorant h3)
    const label = this.add.text(10, available ? -5 : -5, 'Ataque Equipes', {
      fontFamily: fontFamily.serif, fontSize: '14px',
      color:      accentHex,
      fontStyle:  '600',
      shadow:     SHADOW.text,
    }).setOrigin(0, 0.5)
    container.add(label)

    // Description (Manrope body)
    const desc = this.add.text(10, 10, available ? 'Ataque bases inimigas' : 'Desafie equipes rivais', {
      fontFamily: fontFamily.body, fontSize: '11px',
      color:      available ? fg.tertiaryHex : fg.disabledHex,
      shadow:     SHADOW.text,
    }).setOrigin(0, 0.5)
    container.add(desc)

    // Lock pill badge — positioned between the icon area (left) and text area (right)
    if (!available) {
      const pillCx = -28  // between icon (~x=-40) and text (~x=10)
      const pillCy = 0
      const pillW = 60
      const pillH = 18

      const pillGfx = this.add.graphics()
      pillGfx.fillStyle(0x1a1a2a, 0.9)
      pillGfx.fillRoundedRect(pillCx - pillW / 2, pillCy - pillH / 2, pillW, pillH, pillH / 2)
      pillGfx.lineStyle(1, 0x777777, 0.45)
      pillGfx.strokeRoundedRect(pillCx - pillW / 2, pillCy - pillH / 2, pillW, pillH, pillH / 2)
      container.add(pillGfx)

      // Padlock (left side of pill)
      const lockGfx = this.add.graphics()
      const lkX = pillCx - 13
      const lkY = pillCy + 1
      lockGfx.lineStyle(1.5, 0x999999, 0.8)
      lockGfx.beginPath()
      lockGfx.arc(lkX, lkY - 4, 3, Math.PI, 0, false)
      lockGfx.strokePath()
      lockGfx.fillStyle(0x999999, 0.8)
      lockGfx.fillRoundedRect(lkX - 4, lkY - 4, 8, 6, 1)
      lockGfx.fillStyle(0x000000, 0.5)
      lockGfx.fillCircle(lkX, lkY - 2, 1)
      container.add(lockGfx)

      // "Lv.30" text (right side of pill) — Mono tabular for stat feel
      container.add(this.add.text(pillCx + 3, pillCy, 'Lv.30', {
        fontFamily: fontFamily.mono, fontSize: '12px',
        color:      fg.disabledHex, fontStyle: '700',
        shadow:     SHADOW.text,
      }).setOrigin(0, 0.5))
    }

    // Arrow indicator if available
    if (available) {
      const arrowGfx = this.add.graphics()
      arrowGfx.lineStyle(2, accentColor, 0.5)
      arrowGfx.beginPath()
      arrowGfx.moveTo(btnW / 2 - 24, -6)
      arrowGfx.lineTo(btnW / 2 - 16, 0)
      arrowGfx.lineTo(btnW / 2 - 24, 6)
      arrowGfx.strokePath()
      container.add(arrowGfx)

      // Subtle glow pulse
      const glowRect = this.add.rectangle(0, 0, btnW + 8, btnH + 8, accentColor, 0)
      container.addAt(glowRect, 0)
      this.tweens.add({
        targets: glowRect,
        alpha: { from: 0.02, to: 0.06 },
        duration: 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      })
    }

    // Hit area
    const hitZone = this.add.rectangle(0, 0, btnW, btnH, 0, 0.001)
      .setInteractive({ useHandCursor: true })
    container.add(hitZone)

    // Hover glow
    const hoverGlow = this.add.graphics()
    hoverGlow.fillStyle(accentColor, 0.06)
    hoverGlow.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8)
    hoverGlow.setAlpha(0)
    container.add(hoverGlow)

    const hoverBorder = this.add.graphics()
    hoverBorder.lineStyle(1.5, accentColor, 0.5)
    hoverBorder.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8)
    hoverBorder.setAlpha(0)
    container.add(hoverBorder)

    hitZone.on('pointerover', () => {
      hoverGlow.setAlpha(1)
      hoverBorder.setAlpha(1)
      if (available) label.setColor('#ffe0a0')
      this.tweens.add({ targets: container, scaleX: 1.03, scaleY: 1.03, duration: 120, ease: 'Sine.Out' })
    })
    hitZone.on('pointerout', () => {
      hoverGlow.setAlpha(0)
      hoverBorder.setAlpha(0)
      label.setColor(accentHex)
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 120, ease: 'Sine.Out' })
    })
    hitZone.on('pointerdown', () => {
      this.tweens.add({
        targets: container, scaleX: 0.97, scaleY: 0.97, duration: 60,
        yoyo: true, ease: 'Sine.InOut',
        onComplete: () => this.showOfflineAttackPopup(),
      })
    })

    // Entrance animation
    container.setY(btnY + 20)
    this.tweens.add({
      targets: container,
      y: btnY, alpha: 1,
      duration: 400, delay: 350, ease: 'Quad.Out',
    })
  }

  private showOfflineAttackPopup() {
    if (this.overlayOpen) return
    this.overlayOpen = true
    this.overlayElements = []

    const dimBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7)
      .setDepth(100).setInteractive()
    dimBg.on('pointerdown', () => this.closePlayModes())
    this.overlayElements.push(dimBg)

    const popupContainer = this.add.container(W / 2, H / 2).setDepth(101).setAlpha(0).setScale(0.9)
    this.overlayElements.push(popupContainer)

    const popW = 380
    const popH = 140
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 0.98)
    bg.fillRoundedRect(-popW / 2, -popH / 2, popW, popH, radii.xl)
    bg.fillStyle(0xffffff, 0.04)
    bg.fillRoundedRect(-popW / 2 + 2, -popH / 2 + 2, popW - 4, 1,
      { tl: radii.xl - 2, tr: radii.xl - 2, bl: 0, br: 0 })
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(-popW / 2, -popH / 2, popW, popH, radii.xl)
    popupContainer.add(bg)

    popupContainer.add(this.add.text(0, -26, 'EM BREVE', {
      fontFamily: fontFamily.display, fontSize: typeScale.h2,
      color:      accent.primaryHex, fontStyle: '700',
      shadow:     SHADOW.goldGlow,
    }).setOrigin(0.5))

    popupContainer.add(this.add.text(0, 4, 'Sistema de ataque equipes', {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color:      fg.secondaryHex,
    }).setOrigin(0.5))

    // Confirm via UI.buttonPrimary (size sm)
    const okBtn = UI.buttonPrimary(this, 0, popH / 2 - 28, 'OK', {
      size: 'sm', w: 100, h: 32, depth: 102,
      onPress: () => this.closePlayModes(),
    })
    popupContainer.add(okBtn.container)

    this.tweens.add({
      targets: popupContainer,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 200, ease: 'Back.easeOut',
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAY MODE OVERLAY — delegates to shared utility (same panel as room scenes)
  // ═══════════════════════════════════════════════════════════════════════════

  private showPlayModes() {
    if (this.overlayOpen) return
    this.overlayOpen = true

    // Dim every UI element on the lobby so the overlay cards have full focus.
    const dimTargets: Phaser.GameObjects.GameObject[] = [...this.bottomIconContainers]
    if (this.offlineContainer)     dimTargets.push(this.offlineContainer)
    if (this.centralPlayContainer) dimTargets.push(this.centralPlayContainer)
    if (this.battlePassContainer)  dimTargets.push(this.battlePassContainer)

    this.playModesHandle = showPlayModesOverlay(this, {
      title: 'MODOS DE JOGO',
      dimTargets,
      onClose: () => {
        this.overlayOpen      = false
        this.playModesHandle  = null
      },
    })
  }

  private closePlayModes() {
    if (!this.overlayOpen) return

    // Shared overlay path
    if (this.playModesHandle) {
      this.playModesHandle.close()
      return
    }

    // Legacy "Em breve" popup path — uses overlayElements directly
    this.overlayOpen = false
    const targets = this.overlayElements.filter(el => 'alpha' in el)
    this.tweens.add({
      targets,
      alpha: 0,
      duration: 150,
      ease: 'Quad.In',
      onComplete: () => {
        this.overlayElements.forEach(el => el.destroy())
        this.overlayElements = []
      },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BOTTOM ICON BAR (Y: 520-640) — Premium cards with accent, glow & bob
  // ═══════════════════════════════════════════════════════════════════════════

  private drawBottomIconBar() {
    const iconW = 120
    const iconH = 100
    const gap = 24
    const totalW = BOTTOM_ICONS.length * iconW + (BOTTOM_ICONS.length - 1) * gap
    const startX = (W - totalW) / 2 + iconW / 2
    const centerY = 525 + iconH / 2

    BOTTOM_ICONS.forEach((cfg, i) => {
      const x = startX + i * (iconW + gap)
      const y = centerY

      const container = this.add.container(x, y).setAlpha(0).setScale(0.9)
      this.bottomIconContainers.push(container)

      // Dark panel with depth — design-system surface.panel + border.default
      const bgGfx = this.add.graphics()
      // Shadow
      bgGfx.fillStyle(0x000000, 0.30)
      bgGfx.fillRoundedRect(-iconW / 2 + 2, -iconH / 2 + 4, iconW, iconH, radii.lg)
      // Main fill
      bgGfx.fillStyle(surface.panel, 0.98)
      bgGfx.fillRoundedRect(-iconW / 2, -iconH / 2, iconW, iconH, radii.lg)
      // Top gloss inset highlight
      bgGfx.fillStyle(0xffffff, 0.04)
      bgGfx.fillRoundedRect(-iconW / 2 + 2, -iconH / 2 + 2, iconW - 4, 1,
        { tl: radii.lg - 1, tr: radii.lg - 1, bl: 0, br: 0 })
      // Border (default, with subtle state)
      bgGfx.lineStyle(1, border.default, 1)
      bgGfx.strokeRoundedRect(-iconW / 2, -iconH / 2, iconW, iconH, radii.lg)
      container.add(bgGfx)

      // Top accent bar (color of the section)
      const accentGfx = this.add.graphics()
      accentGfx.fillStyle(cfg.color, 0.85)
      accentGfx.fillRoundedRect(-iconW / 2 + 4, -iconH / 2, iconW - 8, 3,
        { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })
      container.add(accentGfx)

      // Subtle glow behind icon
      const iconGlow = this.add.circle(0, -8, 22, cfg.color, 0.04)
      container.add(iconGlow)

      // Draw icon
      const iconGfx = this.drawBottomNavIcon(cfg.label, 0, -8, 16, cfg.color)
      container.add(iconGfx)

      // Label — Manrope meta (11/700 uppercase)
      const label = this.add.text(0, iconH / 2 - 18, cfg.label, {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color:      fg.tertiaryHex, fontStyle: '700',
        shadow:     SHADOW.text,
      }).setOrigin(0.5)
      const anyLbl = label as unknown as { setLetterSpacing?: (n: number) => void }
      if (typeof anyLbl.setLetterSpacing === 'function') anyLbl.setLetterSpacing(1.6)
      container.add(label)

      // Hit area
      const hitZone = this.add.rectangle(0, 0, iconW, iconH, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true })
      container.add(hitZone)

      // Hover glow border
      const hoverGlow = this.add.graphics()
      hoverGlow.lineStyle(2, cfg.color, 0.75)
      hoverGlow.strokeRoundedRect(-iconW / 2, -iconH / 2, iconW, iconH, radii.lg)
      hoverGlow.setAlpha(0)
      container.add(hoverGlow)

      hitZone.on('pointerover', () => {
        this.tweens.add({ targets: container, scaleX: 1.08, scaleY: 1.08, duration: 120, ease: 'Sine.Out' })
        hoverGlow.setAlpha(1)
        iconGlow.setAlpha(0.12)
        label.setColor(fg.primaryHex)
      })
      hitZone.on('pointerout', () => {
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 120, ease: 'Sine.Out' })
        hoverGlow.setAlpha(0)
        iconGlow.setAlpha(0.04)
        label.setColor(fg.tertiaryHex)
      })
      hitZone.on('pointerdown', () => {
        this.tweens.add({
          targets: container, scaleX: 0.95, scaleY: 0.95, duration: 60,
          yoyo: true, ease: 'Sine.InOut',
          onComplete: () => {
            if (cfg.label === 'TREINO') {
              transitionTo(this, cfg.target, {
                deckConfig: playerData.getDeckConfig(),
                skinConfig: playerData.getSkinConfig(),
                trainingMode: true,
              })
            } else {
              transitionTo(this, cfg.target)
            }
          },
        })
      })

      // Staggered entrance (slide up from below)
      container.y = y + 50
      this.tweens.add({
        targets: container,
        y, alpha: 1, scaleX: 1, scaleY: 1,
        duration: 450, delay: 400 + i * 120, ease: 'Back.easeOut',
      })
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOOTER (Y: 650-720) — Enhanced with separator
  // ═══════════════════════════════════════════════════════════════════════════

  private drawFooter() {
    // Decorative separator line — accent.primary gradient
    const sepY = 650
    const sepGfx = this.add.graphics()
    for (let i = 0; i < W; i++) {
      const distFromCenter = Math.abs(i - W / 2) / (W / 2)
      const a = 0.08 * (1 - distFromCenter * distFromCenter)
      sepGfx.fillStyle(accent.primary, a)
      sepGfx.fillRect(i, sepY, 1, 1)
    }

    // Sound toggle
    this.drawSoundToggle()

    // Version text — Manrope meta, fg.disabled
    this.add.text(W - 16, H - 16, 'Codeforje VIO · v1.0', {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color:      fg.disabledHex, fontStyle: '700',
      shadow:     SHADOW.text,
    }).setOrigin(1, 1)

    // News ticker
    this.drawNewsTicker()
  }

  private drawSoundToggle() {
    soundManager.init()
    let muted = !soundManager.isEnabled()

    const btnW = 80
    const btnH = 28
    const bx = 56
    const by = H - 38

    const bgGfx = this.add.graphics()
    const renderBg = (hovered: boolean) => {
      bgGfx.clear()
      bgGfx.fillStyle(BTN_FILL, hovered ? 0.9 : 0.7)
      bgGfx.fillRoundedRect(bx - btnW / 2, by - btnH / 2, btnW, btnH, btnH / 2)
      bgGfx.lineStyle(1, PANEL_BORDER, hovered ? 0.6 : 0.3)
      bgGfx.strokeRoundedRect(bx - btnW / 2, by - btnH / 2, btnW, btnH, btnH / 2)
    }
    renderBg(false)

    const label = this.add.text(bx + 4, by, muted ? 'Mudo' : 'Som', {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color:      fg.tertiaryHex, fontStyle: '500',
      shadow:     SHADOW.text,
    }).setOrigin(0.5)

    const speakerGfx = this.drawSpeakerIcon(bx - 22, by, 7, muted)

    const hitZone = this.add.rectangle(bx, by, btnW, btnH, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true })

    hitZone.on('pointerover', () => {
      renderBg(true)
      label.setColor(accent.primaryHex)
    })
    hitZone.on('pointerout', () => {
      renderBg(false)
      label.setColor(fg.tertiaryHex)
    })
    hitZone.on('pointerdown', () => {
      muted = !soundManager.toggle()
      label.setText(muted ? 'Mudo' : 'Som')
      speakerGfx.destroy()
      this.drawSpeakerIcon(bx - 22, by, 7, muted)
      soundManager.playClick()
    })
  }

  private drawNewsTicker() {
    const tickerY = H - 12
    const message = '     Boas vindas ao Draft Game!  \u2022  Novos pacotes na loja!  \u2022  Batalha PvP liberada!  \u2022  Treinamento dispon\u00EDvel!     '

    // Subtle background strip for ticker
    this.add.rectangle(W / 2, tickerY, W, 16, 0x000000, 0.2)

    const tickerText = this.add.text(W + 20, tickerY, message, {
      fontFamily: fontFamily.body, fontSize: '11px',
      color:      accent.dimHex, fontStyle: '500',
      shadow:     SHADOW.text,
    }).setOrigin(0, 0.5).setAlpha(0.65)

    const textWidth = tickerText.width

    this.tweens.add({
      targets: tickerText,
      x: -textWidth,
      duration: 22000,
      repeat: -1,
      ease: 'Linear',
      onRepeat: () => { tickerText.x = W + 20 },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DRAWN ICONS (speaker + bottom-nav custom icons preserved for scene identity;
  // crossed-swords/gear/coin/diamond deprecated in Sub 2.4 — replaced by Lucide
  // 'swords'/'settings' and UI.currencyPill SVGs.)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawSpeakerIcon(x: number, y: number, size: number, muted: boolean): Phaser.GameObjects.Graphics {
    const g = this.add.graphics()
    const s = size

    g.fillStyle(C.goldDim, 0.6)
    g.fillRect(x - s * 0.3, y - s * 0.3, s * 0.4, s * 0.6)
    g.fillPoints([
      new Phaser.Geom.Point(x + s * 0.1, y - s * 0.3),
      new Phaser.Geom.Point(x + s * 0.6, y - s * 0.7),
      new Phaser.Geom.Point(x + s * 0.6, y + s * 0.7),
      new Phaser.Geom.Point(x + s * 0.1, y + s * 0.3),
    ], true)

    if (muted) {
      g.lineStyle(2, 0xff5555, 0.8)
      g.lineBetween(x + s * 0.8, y - s * 0.4, x + s * 1.4, y + s * 0.4)
      g.lineBetween(x + s * 1.4, y - s * 0.4, x + s * 0.8, y + s * 0.4)
    } else {
      g.lineStyle(1.5, C.goldDim, 0.4)
      g.beginPath()
      g.arc(x + s * 0.7, y, s * 0.5, -Math.PI * 0.35, Math.PI * 0.35)
      g.strokePath()
      g.beginPath()
      g.arc(x + s * 0.7, y, s * 0.85, -Math.PI * 0.35, Math.PI * 0.35)
      g.strokePath()
    }

    return g
  }

  private drawBottomNavIcon(label: string, x: number, y: number, size: number, color: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics()
    const s = size

    switch (label) {
      case 'LOJA': {
        g.fillStyle(color, 0.7)
        g.beginPath()
        g.moveTo(x - s * 0.7, y + s)
        g.lineTo(x - s * 0.5, y - s * 0.2)
        g.lineTo(x + s * 0.5, y - s * 0.2)
        g.lineTo(x + s * 0.7, y + s)
        g.closePath()
        g.fillPath()
        g.lineStyle(2, color, 0.9)
        g.strokePath()
        g.lineStyle(2.5, color, 0.8)
        g.beginPath()
        g.arc(x, y - s * 0.2, s * 0.35, Math.PI, 0, false)
        g.strokePath()
        break
      }
      case 'DECK': {
        const cw = s * 0.8, ch = s * 1.2
        g.fillStyle(color, 0.4)
        g.fillRoundedRect(x - cw / 2 - 4, y - ch / 2 - 2, cw, ch, 3)
        g.lineStyle(1.5, color, 0.6)
        g.strokeRoundedRect(x - cw / 2 - 4, y - ch / 2 - 2, cw, ch, 3)
        g.fillStyle(color, 0.7)
        g.fillRoundedRect(x - cw / 2 + 4, y - ch / 2 + 2, cw, ch, 3)
        g.lineStyle(2, color, 0.9)
        g.strokeRoundedRect(x - cw / 2 + 4, y - ch / 2 + 2, cw, ch, 3)
        g.fillStyle(0xffffff, 0.3)
        g.fillCircle(x + 4, y + 2, 3)
        break
      }
      case 'TREINO': {
        g.lineStyle(2, color, 0.9)
        g.strokeCircle(x, y, s * 0.8)
        g.lineStyle(1.5, color, 0.7)
        g.strokeCircle(x, y, s * 0.45)
        g.fillStyle(color, 0.8)
        g.fillCircle(x, y, s * 0.15)
        g.lineStyle(1.5, color, 0.6)
        g.lineBetween(x, y - s * 1.1, x, y + s * 1.1)
        g.lineBetween(x - s * 1.1, y, x + s * 1.1, y)
        break
      }
      case 'RANKING': {
        const barW = s * 0.35, gapR = s * 0.1, baseY = y + s * 0.7
        g.fillStyle(color, 0.6)
        g.fillRoundedRect(x - barW * 1.5 - gapR, baseY - s, barW, s, 2)
        g.lineStyle(1.5, color, 0.7)
        g.strokeRoundedRect(x - barW * 1.5 - gapR, baseY - s, barW, s, 2)
        g.fillStyle(color, 0.85)
        g.fillRoundedRect(x - barW / 2, baseY - s * 1.5, barW, s * 1.5, 2)
        g.lineStyle(2, color, 0.9)
        g.strokeRoundedRect(x - barW / 2, baseY - s * 1.5, barW, s * 1.5, 2)
        g.fillStyle(color, 0.45)
        g.fillRoundedRect(x + barW / 2 + gapR, baseY - s * 0.7, barW, s * 0.7, 2)
        g.lineStyle(1.5, color, 0.6)
        g.strokeRoundedRect(x + barW / 2 + gapR, baseY - s * 0.7, barW, s * 0.7, 2)
        g.lineStyle(2, color, 0.5)
        g.lineBetween(x - s, baseY, x + s, baseY)
        break
      }
      case 'SKILLS': {
        // Book/spellbook icon
        const bw = s * 0.9, bh = s * 1.2
        g.fillStyle(color, 0.6)
        g.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 3)
        g.lineStyle(2, color, 0.9)
        g.strokeRoundedRect(x - bw / 2, y - bh / 2, bw, bh, 3)
        // Spine
        g.lineStyle(2, color, 0.5)
        g.lineBetween(x - bw / 2 + 4, y - bh / 2 + 3, x - bw / 2 + 4, y + bh / 2 - 3)
        // Star emblem
        g.fillStyle(0xffffff, 0.3)
        g.fillCircle(x + 1, y, 3)
        break
      }
    }

    return g
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  shutdown() {
    this.tweens.killAll()
  }
}
