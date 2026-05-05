import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import { playerData, RAID_DAILY_LIMIT } from '../utils/PlayerDataManager'
import { transitionTo } from '../utils/SceneTransition'
import { soundManager } from '../utils/SoundManager'
import { UI } from '../utils/UIComponents'
import {
  C, S, SHADOW, SCREEN,
  accent, border, fg, fontFamily, motion, radii, surface, typeScale,
} from '../utils/DesignTokens'
import { PASS_XP_PER_TIER, PASS_MAX_TIER } from '../data/battlePass'
import { showPlayModesOverlay, type PlayModesOverlayHandle } from '../utils/PlayModesOverlay'
import { drawSwordIcon, drawShieldIcon } from '../utils/CombatIcons'
import { t } from '../i18n'

// ---- Layout constants (1280 x 720) -----------------------------------------

const W = SCREEN.W
const H = SCREEN.H

const PANEL_BORDER = border.default
const GOLD_ACCENT  = accent.primaryHex
const GOLD_HEX     = accent.primary
const GOLD_DIM     = accent.dimHex
const ICE_BLUE     = C.infoHex
const ICE_BLUE_HEX = C.info
const BTN_FILL     = surface.raised

// ---- Bottom icons data ------------------------------------------------------

type BottomIconId = 'shop' | 'skills' | 'training' | 'ranking'

interface BottomIcon {
  /** Internal stable id — used for nav-icon shape switch and route logic. */
  id: BottomIconId
  /** i18n key for the rendered label (translated at draw time). */
  labelKey: string
  target: string
  color: number
}

const BOTTOM_ICONS: BottomIcon[] = [
  { id: 'shop',     labelKey: 'scenes.lobby.nav.shop',     target: 'ShopScene',         color: 0xffa726 },
  { id: 'skills',   labelKey: 'scenes.lobby.nav.skills',   target: 'SkillUpgradeScene', color: 0x26c6da },
  { id: 'training', labelKey: 'scenes.lobby.nav.training', target: 'BattleScene',       color: 0x4ade80 },
  { id: 'ranking',  labelKey: 'scenes.lobby.nav.ranking',  target: 'RankingScene',      color: 0xf0c850 },
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

    // Gold pill (display-only — no ShopScene route, matching original behavior)
    const goldPill = UI.currencyPill(this, 0, avatarY, {
      kind: 'gold', amount: p.gold,
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
    const title = this.add.text(0, -panelH / 2 + 56, t('scenes.lobby.central-play-title'), {
      fontFamily: fontFamily.display, fontSize: '50px',
      color:      accent.primaryHex,
      fontStyle:  '900',
      shadow:     SHADOW.goldGlow,
    }).setOrigin(0.5)
    const anyTitle = title as unknown as { setLetterSpacing?: (n: number) => void }
    if (typeof anyTitle.setLetterSpacing === 'function') anyTitle.setLetterSpacing(4)
    container.add(title)

    const titleShimmer = UI.shimmer(this, panelX, panelY - panelH / 2 + 56, 250, 56, 4500)
    titleShimmer.setDepth(5)

    // Crossed swords → Lucide 'swords' icon, gold tint, large
    const swordsIcon = UI.lucideIcon(this, 'swords', 0, 28, 56, accent.primary)
    container.add(swordsIcon)

    // Swords glow pulse
    const swordsGlow = this.add.circle(0, 28, 58, accent.primary, 0)
    container.addAt(swordsGlow, container.list.indexOf(swordsIcon))
    this.tweens.add({
      targets: swordsGlow,
      alpha: { from: 0.05, to: 0.18 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })

    // Subtitle (Manrope body, fg.secondary) — bumped 15→17 px to scale with
    // the larger title and emblem above it.
    const subtitle = this.add.text(0, 102, t('scenes.lobby.central-play-subtitle'), {
      fontFamily: fontFamily.body, fontSize: '17px',
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
    const stdIconW = 156
    const stdIconH = 130
    const stdGap = 24
    const stdCount = BOTTOM_ICONS.length
    const stdTotalW = stdCount * stdIconW + (stdCount - 1) * stdGap
    const stdStartCenterX = (W - stdTotalW) / 2 + stdIconW / 2   // first icon center
    const stdFirstLeftX = stdStartCenterX - stdIconW / 2         // first icon left edge
    const centerY = 485 + stdIconH / 2                           // same Y as other icons

    // Battle pass button is slightly taller + wider for emphasis
    const btnW = 192
    const btnH = 150
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
    container.add(this.add.text(0, -btnH / 2 + 18, t('scenes.lobby.battlepass.line-1'), {
      fontFamily: fontFamily.display, fontSize: '15px', color: '#ffffff', fontStyle: '700',
      shadow: { offsetX: 0, offsetY: 1, color: '#2a0a4a', blur: 6, fill: true },
    }).setOrigin(0.5))
    container.add(this.add.text(0, -btnH / 2 + 34, t('scenes.lobby.battlepass.line-2'), {
      fontFamily: fontFamily.display, fontSize: '12px', color: '#cc88ff', fontStyle: '700',
      shadow: { offsetX: 0, offsetY: 1, color: '#2a0a4a', blur: 4, fill: true },
    }).setOrigin(0.5))

    // Divider under header
    const divGfx = this.add.graphics()
    divGfx.fillStyle(0xcc88ff, 0.4)
    divGfx.fillRect(-btnW / 2 + 14, -btnH / 2 + 44, btnW - 28, 1)
    container.add(divGfx)

    // ── Diamond/gem emblem in the middle ──
    const emblem = this.add.graphics()
    const ex = 0
    const ey = -2
    // Outer diamond (proportionally larger to match the bigger card)
    emblem.fillStyle(0xcc88ff, 0.9)
    emblem.beginPath()
    emblem.moveTo(ex, ey - 14)
    emblem.lineTo(ex + 11, ey)
    emblem.lineTo(ex, ey + 14)
    emblem.lineTo(ex - 11, ey)
    emblem.closePath()
    emblem.fillPath()
    // Inner highlight
    emblem.fillStyle(0xffffff, 0.55)
    emblem.beginPath()
    emblem.moveTo(ex, ey - 11)
    emblem.lineTo(ex + 6, ey - 2)
    emblem.lineTo(ex, ey)
    emblem.lineTo(ex - 6, ey - 2)
    emblem.closePath()
    emblem.fillPath()
    // Outer stroke
    emblem.lineStyle(1.5, 0xffffff, 0.8)
    emblem.beginPath()
    emblem.moveTo(ex, ey - 14)
    emblem.lineTo(ex + 11, ey)
    emblem.lineTo(ex, ey + 14)
    emblem.lineTo(ex - 11, ey)
    emblem.closePath()
    emblem.strokePath()
    container.add(emblem)

    // Gem glow
    const gemGlow = this.add.circle(ex, ey, 22, 0xcc88ff, 0.15)
    container.addAt(gemGlow, 3)  // behind the emblem but above background
    this.tweens.add({
      targets: gemGlow,
      alpha: { from: 0.08, to: 0.28 },
      scale: { from: 0.9, to: 1.15 },
      duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // ── Tier badge (right side of emblem) — Mono tabular (Nv) / Cinzel (MAX) ──
    const tierLabel = bp.tier >= PASS_MAX_TIER
      ? t('common.labels.level-cap-max')
      : t('common.labels.level-short', { level: bp.tier })
    container.add(this.add.text(0, 24, tierLabel, {
      fontFamily: bp.tier >= PASS_MAX_TIER ? fontFamily.display : fontFamily.mono,
      fontSize: '15px', color: '#ffffff', fontStyle: '700',
      shadow: { offsetX: 0, offsetY: 1, color: '#2a0a4a', blur: 5, fill: true },
    }).setOrigin(0.5))

    // ── XP progress bar (bottom interior) ──
    if (bp.tier < PASS_MAX_TIER) {
      const barW = btnW - 32
      const barH = 7
      const barX = -barW / 2
      const barY = btnH / 2 - 18
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
      container.add(this.add.text(0, btnH / 2 - 14, t('scenes.lobby.battlepass.rewards-max'), {
        fontFamily: fontFamily.body, fontSize: '11px', color: accent.primaryHex,
        fontStyle: '700', shadow: SHADOW.text,
      }).setOrigin(0.5))
    }

    // ── Unclaimed rewards gift badge (top-right corner) ──
    if (hasUnclaimed) {
      const badgeX = btnW / 2 - 12
      const badgeY = -btnH / 2 + 12

      const badgePulse = this.add.circle(badgeX, badgeY, 14, 0xff5252, 0)
      container.add(badgePulse)
      this.tweens.add({
        targets: badgePulse,
        alpha: { from: 0.15, to: 0.5 },
        scale: { from: 0.9, to: 1.2 },
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      })

      const badgeGfx = this.add.graphics()
      badgeGfx.fillStyle(0xff5252, 1)
      badgeGfx.fillCircle(badgeX, badgeY, 8)
      badgeGfx.lineStyle(1.5, 0xffffff, 0.9)
      badgeGfx.strokeCircle(badgeX, badgeY, 8)
      container.add(badgeGfx)

      container.add(this.add.text(badgeX, badgeY, '!', {
        fontFamily: fontFamily.display, fontSize: '12px', color: '#ffffff', fontStyle: '900',
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
  // OFFLINE ATTACK CARD — Portrait tile mirroring the BattlePass button
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Geometry mirrors drawBattlePassButton(): same 150 × 116 portrait card
  // and same Y center as the standard bottom-row icons. The BattlePass
  // sits on the LEFT of the icon row (purple/gem theme) and this card sits
  // on the RIGHT (crimson/raid theme) so the bar reads as
  //
  //   [BATTLEPASS] [SHOP] [SKILLS] [TRAINING] [RANKING] [OFFLINE-RAID]
  //
  // The visual language is bespoke for "Ataques às equipes":
  //   - Crimson + amber palette (warband / siege colours, NOT BattlePass purple)
  //   - Crossed swords emblem flanked by a shield silhouette
  //   - Iron rivets at the four corners (replacing battlepass's gem jewels)
  //   - Red→amber base gradient with double border
  //   - When locked (player level < 30): grey wash + Lv.30 lock pill bottom strip
  //   - When unlocked: ember pulse + "EM BREVE" status (feature still WIP)

  private drawOfflineAttackLink() {
    // The tile is always actionable now: a tap opens the explainer popup,
    // which in turn routes to the RaidHubScene where the player buys
    // fortifications and launches the raid. The bottom of the tile shows
    // two compact daily counters that climb from 0/10 to RAID_DAILY_LIMIT
    // (attacks fired today / defenses received today) — replacing the
    // older "DISPONÍVEL EM BREVE" strip + padlock pair.
    const raid = playerData.getRaid()
    const attacksUsed = raid.attacksUsedToday
    const defensesReceived = raid.defensesReceivedToday

    // ── Geometry — mirror drawBattlePassButton() so we hug the LAST icon ──
    const stdIconW = 156
    const stdIconH = 130
    const stdGap = 24
    const stdCount = BOTTOM_ICONS.length
    const stdTotalW = stdCount * stdIconW + (stdCount - 1) * stdGap
    const stdStartCenterX = (W - stdTotalW) / 2 + stdIconW / 2     // first icon center
    const stdLastRightX = stdStartCenterX - stdIconW / 2 + stdTotalW   // last icon right edge
    const centerY = 485 + stdIconH / 2                              // same Y as other icons

    // Same dimensions as the BattlePass button for visual symmetry
    const btnW = 192
    const btnH = 150
    const btnGap = 26
    const bx = stdLastRightX + btnGap + btnW / 2
    const by = centerY

    // ── Dual red/blue palette (matches the raid popup) ──
    // Red drives the ATTACK identity (top stripe, top rivets, sword glyph,
    // left halo). Blue drives DEFENSE (bottom stripe, bottom rivets, shield
    // glyph, right halo). Gold/amber is the neutral accent for headers and
    // status text — same vocabulary as the explainer modal.
    const ATTACK_C  = 0xef4444
    const DEFENSE_C = 0x3b82f6
    const ACCENT_C  = 0xfbbf24
    const NEUTRAL_BASE   = 0x101729
    const NEUTRAL_DEEP   = 0x0a0f1d
    const NEUTRAL_BORDER = 0x1e293b
    const TEXT_BODY_HEX  = '#cbd5e1'
    const SHADOW_DEEP    = '#000000'

    const container = this.add.container(bx, by).setAlpha(0).setScale(0.9)
    this.offlineContainer = container

    // ── Subtle backdrop aura — twin glows (red ◀ blue ▶) ──
    const auraRed = this.add.graphics()
    auraRed.fillStyle(ATTACK_C, 0.16)
    auraRed.fillRoundedRect(-btnW / 2 - 6, -btnH / 2 - 6, btnW / 2 + 6, btnH + 12, S.borderRadiusLarge + 3)
    container.add(auraRed)
    const auraBlue = this.add.graphics()
    auraBlue.fillStyle(DEFENSE_C, 0.16)
    auraBlue.fillRoundedRect(0, -btnH / 2 - 6, btnW / 2 + 6, btnH + 12, S.borderRadiusLarge + 3)
    container.add(auraBlue)
    this.tweens.add({
      targets: [auraRed, auraBlue],
      alpha: { from: 0.30, to: 0.65 },
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // ── Main background: solid neutral body with red/blue stripes ──
    const bgGfx = this.add.graphics()
    // Drop shadow
    bgGfx.fillStyle(0x000000, 0.35)
    bgGfx.fillRoundedRect(-btnW / 2 + 2, -btnH / 2 + 4, btnW, btnH, S.borderRadiusLarge)
    // Solid body (matches popup body so the two surfaces feel related)
    bgGfx.fillStyle(NEUTRAL_BASE, 0.98)
    bgGfx.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, S.borderRadiusLarge)
    // Top inset highlight (1 px line that catches the light)
    bgGfx.fillStyle(0xffffff, 0.05)
    bgGfx.fillRoundedRect(-btnW / 2 + 3, -btnH / 2 + 3, btnW - 6, 18,
      { tl: S.borderRadiusLarge - 2, tr: S.borderRadiusLarge - 2, bl: 0, br: 0 })
    // Outer neutral border
    bgGfx.lineStyle(2, NEUTRAL_BORDER, 1)
    bgGfx.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, S.borderRadiusLarge)
    container.add(bgGfx)

    // Top RED stripe (attack identity)
    const stripeRed = this.add.graphics()
    stripeRed.fillStyle(ATTACK_C, 0.85)
    stripeRed.fillRoundedRect(-btnW / 2 + 8, -btnH / 2 + 6, btnW - 16, 3,
      { tl: 1.5, tr: 1.5, bl: 0, br: 0 })
    stripeRed.fillStyle(ATTACK_C, 0.18)
    stripeRed.fillRect(-btnW / 2 + 8, -btnH / 2 + 9, btnW - 16, 4)
    container.add(stripeRed)

    // Bottom BLUE stripe (defense identity)
    const stripeBlue = this.add.graphics()
    stripeBlue.fillStyle(DEFENSE_C, 0.85)
    stripeBlue.fillRoundedRect(-btnW / 2 + 8, btnH / 2 - 9, btnW - 16, 3,
      { tl: 0, tr: 0, bl: 1.5, br: 1.5 })
    stripeBlue.fillStyle(DEFENSE_C, 0.18)
    stripeBlue.fillRect(-btnW / 2 + 8, btnH / 2 - 13, btnW - 16, 4)
    container.add(stripeBlue)

    // Iron rivets at the four corners — top red, bottom blue (matches popup)
    const rivetGfx = this.add.graphics()
    const rivets: Array<[number, number, number]> = [
      [-btnW / 2 + 9, -btnH / 2 + 9, ATTACK_C],
      [ btnW / 2 - 9, -btnH / 2 + 9, ATTACK_C],
      [-btnW / 2 + 9,  btnH / 2 - 9, DEFENSE_C],
      [ btnW / 2 - 9,  btnH / 2 - 9, DEFENSE_C],
    ]
    for (const [rx, ry, color] of rivets) {
      rivetGfx.fillStyle(color, 0.85)
      rivetGfx.fillCircle(rx, ry, 2.4)
      rivetGfx.fillStyle(0xffffff, 0.55)
      rivetGfx.fillCircle(rx - 0.6, ry - 0.6, 1.0)
      rivetGfx.fillStyle(0x000000, 0.4)
      rivetGfx.fillCircle(rx + 0.6, ry + 0.6, 0.5)
    }
    container.add(rivetGfx)

    // ── Header strip: line-1 / line-2 (Cinzel display) ──
    container.add(this.add.text(0, -btnH / 2 + 22, t('scenes.lobby.offline.line-1'), {
      fontFamily: fontFamily.display, fontSize: '15px', color: '#ffffff', fontStyle: '700',
      shadow: { offsetX: 0, offsetY: 1, color: SHADOW_DEEP, blur: 6, fill: true },
    }).setOrigin(0.5))
    container.add(this.add.text(0, -btnH / 2 + 38, t('scenes.lobby.offline.line-2'), {
      fontFamily: fontFamily.display, fontSize: '12px', color: '#ffffff', fontStyle: '700',
      shadow: { offsetX: 0, offsetY: 1, color: SHADOW_DEEP, blur: 4, fill: true },
    }).setOrigin(0.5))

    // Split divider — red half on the left, blue half on the right, gold dot
    // in the middle (same idiom as the popup's section divider).
    const divY = -btnH / 2 + 50
    const divHalfW = (btnW - 36) / 2
    const divGfx = this.add.graphics()
    divGfx.fillStyle(ATTACK_C, 0.55)
    divGfx.fillRect(-divHalfW, divY, divHalfW, 1)
    divGfx.fillStyle(DEFENSE_C, 0.55)
    divGfx.fillRect(0, divY, divHalfW, 1)
    divGfx.fillStyle(ACCENT_C, 0.9)
    divGfx.fillCircle(0, divY, 1.8)
    container.add(divGfx)

    // ── Hero emblem: shop's sword-in-shield combo (same as the popup) ──
    // Blue heater shield as backdrop, red medieval sword on top centred over
    // the boss. y-offset nudges the emblem ~6 px below the geometric centre
    // so it visually centres between the header strip above and the daily
    // counter pills below (which sit lower than the previous status strip).
    const ex = 0
    const ey = 5

    const emblemGlow = this.add.circle(ex, ey, 22, ACCENT_C, 0)
    container.add(emblemGlow)
    this.tweens.add({
      targets: emblemGlow,
      alpha: { from: 0.08, to: 0.28 },
      scale: { from: 0.9, to: 1.15 },
      duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Blue shield (defense) — backdrop layer
    const shieldGfx = this.add.graphics()
    drawShieldIcon(shieldGfx, ex, ey, DEFENSE_C, 0.85)
    container.add(shieldGfx)
    // Red sword (attack) — sits on top, slightly smaller, anchored 2 px
    // below the shield boss so the crossguard reads as a "joining" point.
    const swordGfx = this.add.graphics()
    drawSwordIcon(swordGfx, ex, ey - 1, ATTACK_C, 0.55)
    container.add(swordGfx)

    // ── Bottom strip: dual daily counters ──
    // The strip area is split in two: a red attack pill on the left
    // (sword icon + used/limit) and a blue defense pill on the right
    // (shield icon + received/limit). Lifted ~4 px from the very bottom
    // so the pills don't read as glued to the tile edge.
    const stripY = btnH / 2 - 26
    const pillBgY = stripY - 9
    const pillBgH = 18
    const pillW = (btnW - 36) / 2          // small gap between pills
    const pillGap = 4
    const leftPillCx  = -pillW / 2 - pillGap / 2
    const rightPillCx =  pillW / 2 + pillGap / 2

    const drawCounterPill = (
      cx: number,
      color: number,
      glyph: 'sword' | 'shield',
      value: number,
      limit: number,
    ) => {
      const pill = this.add.graphics()
      pill.fillStyle(NEUTRAL_DEEP, 0.9)
      pill.fillRoundedRect(cx - pillW / 2, pillBgY, pillW, pillBgH, pillBgH / 2)
      pill.lineStyle(1, color, 0.65)
      pill.strokeRoundedRect(cx - pillW / 2, pillBgY, pillW, pillBgH, pillBgH / 2)
      container.add(pill)

      const iconGfx = this.add.graphics()
      const iconX = cx - pillW / 2 + 11
      if (glyph === 'sword') drawSwordIcon(iconGfx, iconX, stripY, color, 0.36)
      else                   drawShieldIcon(iconGfx, iconX, stripY, color, 0.40)
      container.add(iconGfx)

      container.add(this.add.text(cx + 6, stripY, `${value}/${limit}`, {
        fontFamily: fontFamily.display, fontSize: '12px',
        color: '#ffffff', fontStyle: '900',
        shadow: { offsetX: 0, offsetY: 1, color: SHADOW_DEEP, blur: 3, fill: true },
      }).setOrigin(0.5).setLetterSpacing(0.6))
    }

    drawCounterPill(leftPillCx,  ATTACK_C,  'sword',  attacksUsed,      RAID_DAILY_LIMIT)
    drawCounterPill(rightPillCx, DEFENSE_C, 'shield', defensesReceived, RAID_DAILY_LIMIT)

    // Suppress "unused" warning — body text isn't rendered on the tile.
    void TEXT_BODY_HEX

    // ── Interaction ──
    const hit = this.add.rectangle(0, 0, btnW, btnH, 0, 0.001)
      .setInteractive({ useHandCursor: true })
    container.add(hit)

    const hoverGlow = this.add.graphics()
    hoverGlow.lineStyle(3, ACCENT_C, 0.85)
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
        onComplete: () => this.showOfflineAttackPopup(),
      })
    })

    // Entrance animation — staggered slide-up matching the bottom bar
    container.y = by + 50
    this.tweens.add({
      targets: container,
      y: by, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 500, delay: 350, ease: 'Back.easeOut',
    })
  }

  private showOfflineAttackPopup() {
    if (this.overlayOpen) return
    this.overlayOpen = true
    this.overlayElements = []

    // ── Backdrop ──
    const dimBg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0)
      .setDepth(100).setInteractive()
    dimBg.on('pointerdown', () => this.closePlayModes())
    this.overlayElements.push(dimBg)
    this.tweens.add({ targets: dimBg, fillAlpha: 0.78, duration: 220, ease: 'Quad.Out' })

    // Twin radial glows behind the modal — red on the left (attack identity),
    // blue on the right (defense identity). Together they set the dual mood.
    const glowL = this.add.circle(W / 2 - 180, H / 2, 280, 0xef4444, 0).setDepth(100)
    const glowR = this.add.circle(W / 2 + 180, H / 2, 280, 0x3b82f6, 0).setDepth(100)
    this.tweens.add({ targets: glowL, alpha: 0.10, duration: 320, ease: 'Quad.Out' })
    this.tweens.add({ targets: glowR, alpha: 0.10, duration: 320, ease: 'Quad.Out' })
    this.overlayElements.push(glowL, glowR)

    const popupContainer = this.add.container(W / 2, H / 2)
      .setDepth(101).setAlpha(0).setScale(0.9)
    this.overlayElements.push(popupContainer)

    // ── Modal geometry ──
    // Wider + taller so each font size can grow for mobile-screen
    // legibility while every band still gets clean breathing room.
    const popW = 620
    const popH = 740
    const HW = popW / 2
    const HH = popH / 2

    // ── Theme palettes ────────────────────────────────────────────────────
    // Red = ATTACK (offensive raids), Blue = DEFENSE (your kingdom defends),
    // Amber = TREASURE (shop / mastery currency). Mastery row uses a SPLIT
    // (red+blue) palette since it covers both sides.
    const ATTACK = {
      border:    0xef4444,
      borderHex: '#ef4444',
      glow:      0xef4444,
      titleHex:  '#fca5a5',
      iconBg:    0x991b1b,
    }
    const DEFENSE = {
      border:    0x3b82f6,
      borderHex: '#3b82f6',
      glow:      0x3b82f6,
      titleHex:  '#93c5fd',
      iconBg:    0x1e3a8a,
    }
    const TREASURE = {
      border:    0xfbbf24,
      borderHex: '#fbbf24',
      glow:      0xfbbf24,
      titleHex:  '#fde68a',
      iconBg:    0x854d0e,
    }
    const ROW_PALETTES = [ATTACK, DEFENSE, /* mastery split */ null, TREASURE] as const
    const NEUTRAL_DEEP   = 0x0a0f1d
    const NEUTRAL_BASE   = 0x101729
    const NEUTRAL_BORDER = 0x1e293b
    const TEXT_BODY_HEX  = '#cbd5e1'
    const SHADOW_DEEP    = '#000000'

    // ── Modal background — solid base + dual-edge accent stripes ──
    const bg = this.add.graphics()
    // Drop shadow
    bg.fillStyle(0x000000, 0.55)
    bg.fillRoundedRect(-HW + 4, -HH + 8, popW, popH, radii.xl)
    // Body (solid neutral, no gradient wash so feature rows read uniformly)
    bg.fillStyle(NEUTRAL_BASE, 0.985)
    bg.fillRoundedRect(-HW, -HH, popW, popH, radii.xl)
    // Top inset highlight
    bg.fillStyle(0xffffff, 0.05)
    bg.fillRoundedRect(-HW + 3, -HH + 3, popW - 6, 24,
      { tl: radii.xl - 3, tr: radii.xl - 3, bl: 0, br: 0 })
    // Outer border — neutral; stripes carry the colour identity instead
    bg.lineStyle(2, NEUTRAL_BORDER, 1)
    bg.strokeRoundedRect(-HW, -HH, popW, popH, radii.xl)
    popupContainer.add(bg)

    // Top RED stripe (attack identity), runs across the modal head.
    const stripeRed = this.add.graphics()
    stripeRed.fillStyle(ATTACK.border, 0.85)
    stripeRed.fillRoundedRect(-HW + 12, -HH + 10, popW - 24, 4,
      { tl: 2, tr: 2, bl: 0, br: 0 })
    // Glow below the stripe
    stripeRed.fillStyle(ATTACK.border, 0.18)
    stripeRed.fillRect(-HW + 12, -HH + 14, popW - 24, 6)
    popupContainer.add(stripeRed)

    // Bottom BLUE stripe (defense identity), runs across the modal foot.
    const stripeBlue = this.add.graphics()
    stripeBlue.fillStyle(DEFENSE.border, 0.85)
    stripeBlue.fillRoundedRect(-HW + 12, HH - 14, popW - 24, 4,
      { tl: 0, tr: 0, bl: 2, br: 2 })
    stripeBlue.fillStyle(DEFENSE.border, 0.18)
    stripeBlue.fillRect(-HW + 12, HH - 20, popW - 24, 6)
    popupContainer.add(stripeBlue)

    // Iron rivets at the four corners (top → red tint, bottom → blue tint)
    const rivetGfx = this.add.graphics()
    const rivets: Array<[number, number, number]> = [
      [-HW + 16, -HH + 16, ATTACK.border],
      [ HW - 16, -HH + 16, ATTACK.border],
      [-HW + 16,  HH - 16, DEFENSE.border],
      [ HW - 16,  HH - 16, DEFENSE.border],
    ]
    for (const [rx, ry, color] of rivets) {
      rivetGfx.fillStyle(color, 0.85)
      rivetGfx.fillCircle(rx, ry, 3)
      rivetGfx.fillStyle(0xffffff, 0.55)
      rivetGfx.fillCircle(rx - 0.7, ry - 0.7, 1.2)
      rivetGfx.fillStyle(0x000000, 0.4)
      rivetGfx.fillCircle(rx + 0.8, ry + 0.8, 0.6)
    }
    popupContainer.add(rivetGfx)

    // ── HERO STRIP (top): blue shield + red crossed swords ──
    const heroH = 130
    const heroTop = -HH + 22
    const heroCenterY = heroTop + heroH / 2

    // Mixed embers — half red, half blue, drifting upward.
    for (let i = 0; i < 10; i++) {
      const ex = (i - 4.5) * 26 + (Math.random() - 0.5) * 12
      const ey = heroCenterY - 30 + Math.random() * 14
      const color = i % 2 === 0 ? ATTACK.border : DEFENSE.border
      const ember = this.add.circle(ex, ey, 1.6 + Math.random() * 0.6, color, 0.35 + Math.random() * 0.3)
      popupContainer.add(ember)
      this.tweens.add({
        targets: ember,
        y: ey - 30 - Math.random() * 30,
        alpha: { from: 0.5, to: 0 },
        duration: 1800 + Math.random() * 1200,
        repeat: -1, ease: 'Sine.InOut',
        delay: Math.random() * 1200,
      })
    }

    // Hero emblem: shop's sword-in-shield combo. The blue heater shield
    // (defense) is drawn first as a backdrop, then the red medieval sword
    // (attack) sits in front, centred over the boss. Same shapes the shop
    // already uses for its attack/defense items, so the visual language
    // is consistent across the game.
    const ex = 0
    const ey = heroCenterY

    // Twin halos — red glows on the LEFT half, blue on the RIGHT, evoking
    // the dual identity at a glance.
    const haloRed = this.add.circle(ex - 22, ey, 52, ATTACK.border, 0)
    const haloBlue = this.add.circle(ex + 22, ey, 52, DEFENSE.border, 0)
    popupContainer.add(haloRed)
    popupContainer.add(haloBlue)
    this.tweens.add({
      targets: haloRed, alpha: { from: 0.05, to: 0.22 },
      scale: { from: 0.92, to: 1.10 },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })
    this.tweens.add({
      targets: haloBlue, alpha: { from: 0.05, to: 0.22 },
      scale: { from: 0.92, to: 1.10 },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      delay: 800,
    })

    // Blue shield (defense) — backdrop layer
    const shieldGfx = this.add.graphics()
    drawShieldIcon(shieldGfx, ex, ey, DEFENSE.border, 2.0)
    popupContainer.add(shieldGfx)

    // Red sword (attack) — drawn on top of the shield, slightly smaller
    // so the shield rim is fully visible on either side. The y-offset
    // pushes the sword's crossguard down to sit roughly over the shield
    // boss instead of floating above it.
    const swordGfx = this.add.graphics()
    drawSwordIcon(swordGfx, ex, ey - 4, ATTACK.border, 1.4)
    popupContainer.add(swordGfx)

    // ── Title (under hero) — white with deep drop shadow ──
    const titleY = heroTop + heroH + 18
    const titleText = this.add.text(0, titleY,
      t('scenes.lobby.offline.popup.title'), {
        fontFamily: fontFamily.display, fontSize: '42px',
        color: '#ffffff', fontStyle: '900',
        shadow: { offsetX: 0, offsetY: 2, color: SHADOW_DEEP, blur: 12, fill: true },
      }).setOrigin(0.5)
    const anyTitle = titleText as unknown as { setLetterSpacing?: (n: number) => void }
    if (typeof anyTitle.setLetterSpacing === 'function') anyTitle.setLetterSpacing(4)
    popupContainer.add(titleText)

    // Subtitle (italic flavour line)
    popupContainer.add(this.add.text(0, titleY + 40,
      t('scenes.lobby.offline.popup.subtitle'), {
        fontFamily: fontFamily.serif, fontSize: '19px',
        color: TEXT_BODY_HEX, fontStyle: 'italic',
      }).setOrigin(0.5))

    // Decorative split divider — red half on the left, blue half on the right.
    const dividerY = titleY + 72
    const dividerHalfW = (popW - 160) / 2
    const divGfx = this.add.graphics()
    divGfx.fillStyle(ATTACK.border, 0.55)
    divGfx.fillRect(-dividerHalfW, dividerY, dividerHalfW, 1)
    divGfx.fillStyle(DEFENSE.border, 0.55)
    divGfx.fillRect(0, dividerY, dividerHalfW, 1)
    // Tiny gold dot at the centre — the "joining" symbol.
    divGfx.fillStyle(TREASURE.border, 0.9)
    divGfx.fillCircle(0, dividerY, 3)
    popupContainer.add(divGfx)

    // ── Feature rows ───────────────────────────────────────────────────────
    // Row 0 -> ATTACK (red), Row 1 -> DEFENSE (blue), Row 2 -> MASTERY
    // (split palette: title gold, but the icon disc has a red→blue gradient
    // border drawn as two arcs), Row 3 -> TREASURE (gold).
    const featureKeys: Array<{
      icon: 'sword' | 'shield' | 'trophy' | 'gem'
      titleKey: string
      descKey: string
    }> = [
      { icon: 'sword',  titleKey: 'scenes.lobby.offline.popup.feature-1.title', descKey: 'scenes.lobby.offline.popup.feature-1.desc' },
      { icon: 'shield', titleKey: 'scenes.lobby.offline.popup.feature-2.title', descKey: 'scenes.lobby.offline.popup.feature-2.desc' },
      { icon: 'trophy', titleKey: 'scenes.lobby.offline.popup.feature-3.title', descKey: 'scenes.lobby.offline.popup.feature-3.desc' },
      { icon: 'gem',    titleKey: 'scenes.lobby.offline.popup.feature-4.title', descKey: 'scenes.lobby.offline.popup.feature-4.desc' },
    ]

    const featuresTopY = dividerY + 40   // clean gap below the divider
    const featureRowH  = 92              // extra room between rows so 2-line wraps don't crowd
    const iconDiscR    = 22              // larger disc to balance bigger fonts
    const iconX        = -HW + 46
    const textX        = iconX + 34
    const textBudget   = popW - (textX + HW) - 32    // wraps before reaching the right edge

    featureKeys.forEach((f, i) => {
      const rowY = featuresTopY + i * featureRowH
      const isMastery = i === 2
      const palette = ROW_PALETTES[i]

      // Icon disc — single colour for rows 0/1/3, split arcs for mastery (row 2)
      const iconBg = this.add.graphics()
      if (isMastery) {
        // Red half (left)
        iconBg.fillStyle(ATTACK.iconBg, 0.55)
        iconBg.beginPath()
        iconBg.arc(iconX, rowY, iconDiscR, Math.PI / 2, -Math.PI / 2, false)
        iconBg.lineTo(iconX, rowY)
        iconBg.closePath()
        iconBg.fillPath()
        // Blue half (right)
        iconBg.fillStyle(DEFENSE.iconBg, 0.55)
        iconBg.beginPath()
        iconBg.arc(iconX, rowY, iconDiscR, -Math.PI / 2, Math.PI / 2, false)
        iconBg.lineTo(iconX, rowY)
        iconBg.closePath()
        iconBg.fillPath()
        // Border arcs — red on left, blue on right
        iconBg.lineStyle(1.5, ATTACK.border, 0.85)
        iconBg.beginPath()
        iconBg.arc(iconX, rowY, iconDiscR, Math.PI / 2, -Math.PI / 2, false)
        iconBg.strokePath()
        iconBg.lineStyle(1.5, DEFENSE.border, 0.85)
        iconBg.beginPath()
        iconBg.arc(iconX, rowY, iconDiscR, -Math.PI / 2, Math.PI / 2, false)
        iconBg.strokePath()
      } else if (palette) {
        iconBg.fillStyle(palette.iconBg, 0.55)
        iconBg.fillCircle(iconX, rowY, iconDiscR)
        iconBg.lineStyle(1.5, palette.border, 0.85)
        iconBg.strokeCircle(iconX, rowY, iconDiscR)
      }
      popupContainer.add(iconBg)

      // Glyph colour: row palette (or gold for mastery to bridge red+blue)
      const glyphColor = isMastery ? TREASURE.border : (palette?.border ?? TREASURE.border)
      const glyphAlpha = 0.95
      const iconGfx = this.add.graphics()

      // Sword (attack) and shield (defense) reuse the shop's medieval
      // drawings so the iconography stays consistent across the game.
      // Trophy and gem stay inline since they have no shop equivalent.
      switch (f.icon) {
        case 'sword':
          drawSwordIcon(iconGfx, iconX, rowY, glyphColor, 0.7)
          break
        case 'shield':
          drawShieldIcon(iconGfx, iconX, rowY, glyphColor, 0.75)
          break
        case 'trophy':
          iconGfx.lineStyle(2.6, glyphColor, glyphAlpha)
          iconGfx.fillStyle(glyphColor, glyphAlpha)
          iconGfx.lineBetween(iconX - 7, rowY - 10, iconX + 7, rowY - 10)
          iconGfx.lineBetween(iconX - 7, rowY - 10, iconX - 6, rowY + 2)
          iconGfx.lineBetween(iconX + 7, rowY - 10, iconX + 6, rowY + 2)
          iconGfx.lineBetween(iconX - 6, rowY + 2, iconX + 6, rowY + 2)
          iconGfx.lineBetween(iconX, rowY + 2, iconX, rowY + 8)
          iconGfx.lineBetween(iconX - 6, rowY + 9, iconX + 6, rowY + 9)
          iconGfx.lineBetween(iconX - 7, rowY - 8, iconX - 11, rowY - 4)
          iconGfx.lineBetween(iconX + 7, rowY - 8, iconX + 11, rowY - 4)
          break
        case 'gem':
          iconGfx.lineStyle(2.6, glyphColor, glyphAlpha)
          iconGfx.fillStyle(glyphColor, glyphAlpha)
          iconGfx.beginPath()
          iconGfx.moveTo(iconX, rowY - 11)
          iconGfx.lineTo(iconX + 10, rowY - 1)
          iconGfx.lineTo(iconX, rowY + 11)
          iconGfx.lineTo(iconX - 10, rowY - 1)
          iconGfx.closePath()
          iconGfx.strokePath()
          iconGfx.lineBetween(iconX - 10, rowY - 1, iconX + 10, rowY - 1)
          iconGfx.lineBetween(iconX - 5, rowY - 6, iconX + 5, rowY - 6)
          break
      }
      popupContainer.add(iconGfx)

      // Title colour: row palette (mastery uses gold to suggest the union).
      const titleHex = isMastery ? TREASURE.borderHex : (palette?.titleHex ?? TREASURE.borderHex)

      // Text block is shifted ~3 px below the icon centre (title at rowY-13,
      // desc at rowY+15) so the row reads with a touch more breathing room
      // from the row above and the title-desc pair sits visually grounded
      // rather than aligned with the icon's exact midline.
      popupContainer.add(this.add.text(textX, rowY - 13, t(f.titleKey), {
        fontFamily: fontFamily.body, fontSize: '18px',
        color: titleHex, fontStyle: '700',
        shadow: { offsetX: 0, offsetY: 1, color: SHADOW_DEEP, blur: 2, fill: true },
      }).setOrigin(0, 0.5).setLetterSpacing(1.6))

      popupContainer.add(this.add.text(textX, rowY + 15, t(f.descKey), {
        fontFamily: fontFamily.body, fontSize: '16px',
        color: TEXT_BODY_HEX, fontStyle: '500',
        wordWrap: { width: textBudget },
      }).setOrigin(0, 0.5))
    })

    // (Preview-line block removed — the matchmaking utility still ships
    // for the future feature, but the explainer popup now relies on the
    // four feature rows alone, which keeps the modal less crowded and
    // pushes the CTA to a more comfortable thumb-reach position.)

    // ── CTA — single PARTICIPAR button ─────────────────────────────────
    // Tapping it closes the explainer popup and opens RaidHubScene, which
    // is the dedicated page where the player sets participation, sees
    // counters/mastery and buys fortifications. Drawn manually so the
    // 20 px label reads cleanly on mobile (UI.buttonPrimary clamps to
    // typeScale.meta = 11 px which is too small here).
    const ctaY = HH - 56
    const ctaW = 280
    const ctaH = 64

    const drawCta = () => {
      const left = -ctaW / 2
      const top  = ctaY - ctaH / 2

      const shadow = this.add.graphics()
      shadow.fillStyle(0x000000, 0.45)
      shadow.fillRoundedRect(left + 1, top + 4, ctaW, ctaH, 10)
      popupContainer.add(shadow)

      const bg = this.add.graphics()
      const renderBg = (hover: boolean, pressed = false) => {
        bg.clear()
        // Body — split fill: red half (attack identity) on the left,
        // blue half (defense identity) on the right, mirroring the
        // dual-theme of the whole popup.
        const dy = pressed ? 1 : 0
        bg.fillStyle(hover ? 0xf87171 : ATTACK.border, 1)
        bg.fillRoundedRect(left, top + dy, ctaW / 2, ctaH,
          { tl: 10, tr: 0, bl: 10, br: 0 })
        bg.fillStyle(hover ? 0x60a5fa : DEFENSE.border, 1)
        bg.fillRoundedRect(left + ctaW / 2, top + dy, ctaW / 2, ctaH,
          { tl: 0, tr: 10, bl: 0, br: 10 })
        // Top inset highlight
        bg.fillStyle(0xffffff, hover ? 0.14 : 0.10)
        bg.fillRoundedRect(left + 2, top + 2 + dy, ctaW - 4, 10,
          { tl: 8, tr: 8, bl: 0, br: 0 })
        // Outer rim
        bg.lineStyle(1, 0x000000, 0.4)
        bg.strokeRoundedRect(left, top + dy, ctaW, ctaH, 10)
      }
      renderBg(false)
      popupContainer.add(bg)

      const labelObj = this.add.text(0, ctaY, t('scenes.lobby.offline.popup.cta').toUpperCase(), {
        fontFamily: fontFamily.body, fontSize: '22px',
        color: '#ffffff', fontStyle: '900',
        shadow: { offsetX: 0, offsetY: 1, color: SHADOW_DEEP, blur: 4, fill: true },
      }).setOrigin(0.5).setLetterSpacing(3)
      popupContainer.add(labelObj)

      const hit = this.add.rectangle(0, ctaY, ctaW, ctaH, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true })
      popupContainer.add(hit)

      hit.on('pointerover', () => renderBg(true))
      hit.on('pointerout',  () => renderBg(false))
      hit.on('pointerdown', () => {
        renderBg(true, true)
        this.tweens.add({
          targets: labelObj, scaleX: 0.95, scaleY: 0.95,
          duration: 80, yoyo: true, ease: 'Sine.InOut',
          onComplete: () => {
            this.closePlayModes()
            transitionTo(this, 'RaidHubScene', {})
          },
        })
      })
    }
    drawCta()
    void TREASURE
    void NEUTRAL_DEEP

    // ── Modal entrance animation ──
    this.tweens.add({
      targets: popupContainer,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 280, ease: 'Back.Out',
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
      title: t('scenes.lobby.play-modes-title'),
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
    const iconW = 156
    const iconH = 130
    const gap = 24
    const totalW = BOTTOM_ICONS.length * iconW + (BOTTOM_ICONS.length - 1) * gap
    const startX = (W - totalW) / 2 + iconW / 2
    const centerY = 485 + iconH / 2

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
      const iconGlow = this.add.circle(0, -12, 32, cfg.color, 0.04)
      container.add(iconGlow)

      // Draw icon
      const iconGfx = this.drawBottomNavIcon(cfg.id, 0, -12, 24, cfg.color)
      container.add(iconGfx)

      // Label — Manrope small (13/700 uppercase) — bumped from meta(11)
      // because the larger card has more vertical room and the meta size
      // looks lost in the bigger surface.
      const label = this.add.text(0, iconH / 2 - 22, t(cfg.labelKey), {
        fontFamily: fontFamily.body, fontSize: typeScale.small,
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
            if (cfg.id === 'training') {
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
    this.add.text(W - 16, H - 16, `${t('common.studio-name')} · ${t('scenes.menu.version-tag')}`, {
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

    const label = this.add.text(bx + 4, by, t(muted ? 'scenes.lobby.sound-toggle.muted' : 'scenes.lobby.sound-toggle.on'), {
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
      label.setText(t(muted ? 'scenes.lobby.sound-toggle.muted' : 'scenes.lobby.sound-toggle.on'))
      speakerGfx.destroy()
      this.drawSpeakerIcon(bx - 22, by, 7, muted)
      soundManager.playClick()
    })
  }

  private drawNewsTicker() {
    const tickerY = H - 12
    const message = t('scenes.lobby.news-ticker')

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

  private drawBottomNavIcon(id: BottomIconId | 'deck', x: number, y: number, size: number, color: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics()
    const s = size

    switch (id) {
      case 'shop': {
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
      case 'deck': {
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
      case 'training': {
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
      case 'ranking': {
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
      case 'skills': {
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
