import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import {
  SCREEN,
  surface, border, accent, fg, state, currency,
  fontFamily, typeScale, radii,
} from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import type { BattlePassMission } from '../utils/PlayerDataManager'
import { SEASON_TIERS, PASS_XP_PER_TIER, PASS_MAX_TIER, PASS_PREMIUM_PRICE_LABEL, CURRENT_SEASON } from '../data/battlePass'
import type { TierReward, RewardType } from '../data/battlePass'
import { getCharacterKey } from '../utils/AssetPaths'
import { t } from '../i18n'

// ── Battle Pass violet identity (Decision C — preserved per Print 11) ──
//
// The pass keeps its distinct purple identity so it never reads like the
// gold accent or stat tints. The mapping aligns with the canonical DG
// gem currency tokens, so the pass and the DG balance pill share the
// same family of colors.
const BP = {
  primary:    currency.dgGem,         // 0xa78bfa — main violet
  primaryHex: currency.dgGemHex,
  light:      0xc4b5fd,               // lighter violet for highlights / current tier
  lightHex:   '#c4b5fd',
  edge:       currency.dgGemEdge,     // 0x5b21b6 — dark violet for borders / shadows
  edgeHex:    currency.dgGemEdgeHex,
  deep:       0x2e1065,               // deep purple for panel washes
  ink:        0x1a1030,               // very deep panel for inset surfaces
} as const

const W = SCREEN.W
const H = SCREEN.H
const TOP_H = 56
const MISSION_H = 220
const TRACK_Y = TOP_H + MISSION_H + 8
const TRACK_H = H - TRACK_Y - 8

// ── Tier slot dimensions ─────────────────────────────────────────────────────
// `TIER_W` is the slot stride width — it caps how wide a card can be AND
// drives how far apart adjacent tiers sit horizontally. `TIER_GAP` is the
// extra empty space between slots; bump it up to give every level its own
// breathing room instead of letting the cards crowd each other.
const TIER_W = 116
const TIER_GAP = 16

// Premium and free cards have DIFFERENT footprints so the premium track
// reads as the "headline" pass content. Premium spans the full slot and is
// taller; free is narrower (centered inside the slot) and shorter.
const PREMIUM_CARD_W = TIER_W
const PREMIUM_CARD_H = 178
const FREE_CARD_W = 100
const FREE_CARD_H = 158

export default class BattlePassScene extends Phaser.Scene {
  /** Reward track scrollable container (kept for future reference) */
  public trackContainer: Phaser.GameObjects.Container | null = null
  private scrollX = 0

  constructor() { super('BattlePassScene') }

  create() {
    this.scrollX = 0
    this.trackContainer = null

    UI.background(this)
    UI.particles(this, 12)

    this.drawTopBar()
    this.drawMissionsPanel()
    this.drawRewardTrack()

    UI.fadeIn(this)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOP BAR
  // ═══════════════════════════════════════════════════════════════════════════

  private drawTopBar() {
    const bp = playerData.getBattlePass()

    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 0.97)
    bg.fillRect(0, 0, W, TOP_H)
    // Bottom violet rule (subtle, identifies the pass screen)
    bg.fillStyle(BP.primary, 0.5)
    bg.fillRect(0, TOP_H - 1, W, 1)

    UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))

    // Title — Cinzel h2 violet
    this.add.text(70, TOP_H / 2 - 6, t('scenes.battle-pass.title'), {
      fontFamily: fontFamily.display, fontSize: typeScale.h2,
      color: BP.lightHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(2.4)

    // Season name — Cormorant italic
    this.add.text(70, TOP_H / 2 + 14, CURRENT_SEASON.name, {
      fontFamily: fontFamily.serif, fontSize: typeScale.small,
      color: fg.tertiaryHex, fontStyle: 'italic',
    }).setOrigin(0, 0.5)

    // Right: tier badge + XP bar
    const tierText = bp.tier >= PASS_MAX_TIER
      ? t('scenes.battle-pass.tier-max')
      : t('scenes.battle-pass.tier-current', { tier: bp.tier })
    this.add.text(W - 20, TOP_H / 2 - 8, tierText, {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: BP.lightHex, fontStyle: '700',
    }).setOrigin(1, 0.5).setLetterSpacing(1.8)

    if (bp.tier < PASS_MAX_TIER) {
      const barW = 140; const barH = 8
      const barX = W - 20 - barW; const barY = TOP_H / 2 + 8
      const ratio = bp.xp / PASS_XP_PER_TIER

      const barGfx = this.add.graphics()
      barGfx.fillStyle(surface.deepest, 1)
      barGfx.fillRoundedRect(barX, barY, barW, barH, barH / 2)
      barGfx.lineStyle(1, BP.edge, 0.6)
      barGfx.strokeRoundedRect(barX, barY, barW, barH, barH / 2)
      const fillW = Math.max(barH, barW * ratio)
      barGfx.fillStyle(BP.primary, 1)
      barGfx.fillRoundedRect(barX, barY, fillW, barH, barH / 2)
      barGfx.fillStyle(0xffffff, 0.20)
      barGfx.fillRoundedRect(barX, barY, fillW, barH * 0.4, { tl: barH / 2, tr: barH / 2, bl: 0, br: 0 })

      this.add.text(barX + barW / 2, barY + barH / 2, `${bp.xp}/${PASS_XP_PER_TIER} XP`, {
        fontFamily: fontFamily.mono, fontSize: typeScale.meta,
        color: fg.primaryHex, fontStyle: '700',
      }).setOrigin(0.5)
    }

    // Days remaining
    const endDate = new Date(CURRENT_SEASON.endDate).getTime()
    const daysLeft = Math.max(0, Math.ceil((endDate - Date.now()) / (24 * 60 * 60 * 1000)))
    this.add.text(W - 170, TOP_H / 2 + 8, `${daysLeft}d restantes`, {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color: fg.tertiaryHex, fontStyle: '500',
    }).setOrigin(1, 0.5)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MISSIONS PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  private drawMissionsPanel() {
    const bp = playerData.getBattlePass()
    const px = 12; const py = TOP_H + 6; const pw = W - 24; const ph = MISSION_H - 12

    // Panel — surface.panel + border.default + radii.lg + violet top rule
    const pg = this.add.graphics()
    pg.fillStyle(surface.panel, 0.92)
    pg.fillRoundedRect(px, py, pw, ph, radii.lg)
    pg.lineStyle(1, border.default, 1)
    pg.strokeRoundedRect(px, py, pw, ph, radii.lg)
    pg.fillStyle(0xffffff, 0.03)
    pg.fillRoundedRect(px + 2, py + 2, pw - 4, 18,
      { tl: radii.lg - 1, tr: radii.lg - 1, bl: 0, br: 0 })
    pg.fillStyle(BP.primary, 0.45)
    pg.fillRoundedRect(px, py, pw, 2, { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })

    // Title — Manrope meta letterSpacing 1.8 violet
    this.add.text(px + 16, py + 20, t('scenes.battle-pass.season-missions'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: BP.lightHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    // ── Mission grid (2 rows × 4 cols, fits the 8 chain slots) ──
    // Each card holds the CURRENT stage of an evolving chain — when the
    // player claims a stage the next stage just slides in to replace it,
    // so the slot count never grows past 8.
    //
    // ETAPA 6.2: cards grew 195×64 → 240×80 and the "Todas expiram…"
    // subtitle was dropped; the wider footprint stops the description from
    // crowding the stage indicator to its right.
    const gridX = px + 16
    const gridY = py + 36
    const colsPerRow = 4
    const cardW = 240
    const cardH = 80
    const cardGapX = 10
    const cardGapY = 10

    bp.seasonMissions.forEach((m, i) => {
      const row = Math.floor(i / colsPerRow)
      const col = i % colsPerRow
      const cx = gridX + col * (cardW + cardGapX)
      const cy = gridY + row * (cardH + cardGapY)
      this.drawMissionCard(cx, cy, cardW, cardH, m)
    })

    // ── Premium purchase / active badge (right column) ──
    if (!bp.isPremium) {
      const btnX = W - 110; const btnY = py + ph / 2
      const btnW = 180; const btnH = 88

      // Outer pulse glow
      const glow = this.add.rectangle(btnX, btnY, btnW + 10, btnH + 10, BP.primary, 0)
      this.tweens.add({
        targets: glow, alpha: { from: 0.08, to: 0.25 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      })

      const btnGfx = this.add.graphics()
      // Drop shadow
      btnGfx.fillStyle(0x000000, 0.45)
      btnGfx.fillRoundedRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 4, btnW, btnH, radii.lg)
      // Base
      btnGfx.fillStyle(BP.ink, 1)
      btnGfx.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radii.lg)
      // Violet wash top
      btnGfx.fillStyle(BP.primary, 0.22)
      btnGfx.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH / 2, {
        tl: radii.lg, tr: radii.lg, bl: 0, br: 0,
      })
      // Top gloss
      btnGfx.fillStyle(0xffffff, 0.05)
      btnGfx.fillRoundedRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 2, btnW - 4, 16,
        { tl: radii.lg - 1, tr: radii.lg - 1, bl: 0, br: 0 })
      // Border + inner ring
      btnGfx.lineStyle(2, BP.primary, 1)
      btnGfx.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, radii.lg)
      btnGfx.lineStyle(1, BP.light, 0.45)
      btnGfx.strokeRoundedRect(btnX - btnW / 2 + 3, btnY - btnH / 2 + 3, btnW - 6, btnH - 6, radii.md)

      this.add.text(btnX, btnY - 24, t('scenes.battle-pass.buy-premium'), {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: fg.primaryHex, fontStyle: '700',
      }).setOrigin(0.5).setLetterSpacing(1.8)
      this.add.text(btnX, btnY - 2, PASS_PREMIUM_PRICE_LABEL, {
        fontFamily: fontFamily.display, fontSize: typeScale.h3,
        color: accent.primaryHex, fontStyle: '700',
      }).setOrigin(0.5).setLetterSpacing(1.4)
      this.add.text(btnX, btnY + 22, t('scenes.battle-pass.premium-tagline'), {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: fg.tertiaryHex, fontStyle: '500',
      }).setOrigin(0.5)

      const hit = this.add.rectangle(btnX, btnY, btnW, btnH, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => {
        this.tweens.add({ targets: [glow], alpha: 0.4, duration: 140 })
      })
      hit.on('pointerout', () => {
        this.tweens.add({ targets: [glow], alpha: 0.18, duration: 140 })
      })
      hit.on('pointerdown', () => {
        // TODO: hook into the real-money IAP flow. For now unlocks the
        // premium track locally to validate UX.
        if (playerData.unlockPremiumPass()) {
          this.scene.restart()
        }
      })
    } else {
      // Premium active badge — violet pill
      const badgeX = W - 110; const badgeY = py + ph / 2
      const badgeW = 152; const badgeH = 50
      const badgeGfx = this.add.graphics()
      badgeGfx.fillStyle(BP.deep, 0.95)
      badgeGfx.fillRoundedRect(badgeX - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, radii.md)
      badgeGfx.lineStyle(2, BP.primary, 0.85)
      badgeGfx.strokeRoundedRect(badgeX - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, radii.md)
      badgeGfx.lineStyle(1, BP.light, 0.45)
      badgeGfx.strokeRoundedRect(badgeX - badgeW / 2 + 3, badgeY - badgeH / 2 + 3, badgeW - 6, badgeH - 6, radii.sm)
      this.add.text(badgeX, badgeY - 8, t('scenes.battle-pass.premium-active'), {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: BP.lightHex, fontStyle: '700',
      }).setOrigin(0.5).setLetterSpacing(2)
      this.add.text(badgeX, badgeY + 10, t('scenes.battle-pass.premium-thanks'), {
        fontFamily: fontFamily.serif, fontSize: typeScale.small,
        color: fg.tertiaryHex, fontStyle: 'italic',
      }).setOrigin(0.5)
    }
  }

  /**
   * Draw a single mission slot. Each slot represents an evolving CHAIN —
   * the card shows the chain's currently active stage (description, target,
   * XP). Once the player claims a stage the next stage replaces it, so the
   * card never disappears until the entire chain is fully done.
   *
   * Layout (195 × 64):
   *   ┌──────────────────────────────────────┐
   *   │ [PVE]                          2/5  │  ← category pill + stage X/N
   *   │ Vença 5 batalhas PvE                │  ← stage description
   *   │ ▰▰▰▰▰▱▱▱▱▱  3/5          +200      │  ← progress bar + count + claim
   *   └──────────────────────────────────────┘
   */
  private drawMissionCard(x: number, y: number, w: number, h: number, mission: BattlePassMission) {
    const g = this.add.graphics()
    const done = mission.completed
    const fullyDone = mission.fullyDone

    // ── Background — surface.raised default, success-tinted when fullyDone,
    //    violet-tinted when ready-to-claim ──
    const fillColor = fullyDone ? state.successDim : done ? BP.deep : surface.raised
    g.fillStyle(fillColor, 0.95)
    g.fillRoundedRect(x, y, w, h, radii.md)
    // Top highlight band
    g.fillStyle(0xffffff, 0.04)
    g.fillRoundedRect(x, y, w, h * 0.35, { tl: radii.md, tr: radii.md, bl: 0, br: 0 })

    // Border picks the state color
    const borderColor = fullyDone ? state.success : done ? BP.primary : border.default
    g.lineStyle(1.5, borderColor, fullyDone ? 0.85 : done ? 0.85 : 0.7)
    g.strokeRoundedRect(x, y, w, h, radii.md)

    // ── Category pill (top-left) ──
    if (mission.category) {
      const pillX = x + 8; const pillY = y + 12
      const pillTextW = mission.category.length * 6 + 12
      const pillH = 14
      const pillGfx = this.add.graphics()
      pillGfx.fillStyle(surface.deepest, 0.85)
      pillGfx.fillRoundedRect(pillX, pillY - pillH / 2, pillTextW, pillH, pillH / 2)
      pillGfx.lineStyle(1, borderColor, 0.7)
      pillGfx.strokeRoundedRect(pillX, pillY - pillH / 2, pillTextW, pillH, pillH / 2)
      this.add.text(pillX + pillTextW / 2, pillY, mission.category.toUpperCase(), {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: fullyDone ? state.successHex : done ? BP.lightHex : fg.tertiaryHex,
        fontStyle: '700',
      }).setOrigin(0.5).setLetterSpacing(1.4)
    }

    // ── Stage indicator (top-right) ──
    {
      const indicatorX = x + w - 8
      const indicatorY = y + 12
      const stageText = fullyDone
        ? `${mission.totalStages}/${mission.totalStages}`
        : `${mission.stageIndex + 1}/${mission.totalStages}`
      this.add.text(indicatorX, indicatorY, stageText, {
        fontFamily: fontFamily.mono, fontSize: typeScale.meta,
        color: fullyDone ? state.successHex : done ? BP.lightHex : fg.tertiaryHex,
        fontStyle: '700',
      }).setOrigin(1, 0.5)
    }

    // ── Description ──
    // Sits below the category/stage header so 2-line wraps never crowd
    // the stage indicator in the top-right corner (ETAPA 6.2 fix).
    this.add.text(x + 8, y + 38, mission.description, {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color: fullyDone ? state.successHex : done ? fg.primaryHex : fg.secondaryHex,
      fontStyle: '500',
      wordWrap: { width: w - 16 },
    }).setOrigin(0, 0.5)

    // ── Bottom row: progress/claim ──
    if (fullyDone) {
      const cy = y + h - 14
      const cGfx = this.add.graphics()
      cGfx.fillStyle(state.successDim, 0.7)
      cGfx.fillRoundedRect(x + 8, cy - 4, w - 16, 8, 4)
      this.add.text(x + 8, cy, t('scenes.battle-pass.complete-chain'), {
        fontFamily: fontFamily.body, fontSize: typeScale.meta,
        color: state.successHex, fontStyle: '700',
      }).setOrigin(0, 0.5).setLetterSpacing(1.4)
      this.add.text(x + w - 8, cy, '✓', {
        fontFamily: fontFamily.display, fontSize: typeScale.h3,
        color: state.successHex, fontStyle: '700',
      }).setOrigin(1, 0.5)
      return
    }

    const rightZone = 54
    const barX = x + 8
    const barY = y + h - 16
    const barH = 6
    const countTextW = 32
    const barW = Math.max(40, w - 16 - rightZone - countTextW - 4)

    const ratio = Math.min(mission.progress / mission.target, 1)
    const pGfx = this.add.graphics()
    pGfx.fillStyle(surface.deepest, 1)
    pGfx.fillRoundedRect(barX, barY, barW, barH, barH / 2)
    const fillW = Math.max(barH, barW * ratio)
    pGfx.fillStyle(done ? BP.primary : BP.edge, 0.95)
    pGfx.fillRoundedRect(barX, barY, fillW, barH, barH / 2)
    pGfx.fillStyle(0xffffff, 0.20)
    pGfx.fillRoundedRect(barX, barY, fillW, barH * 0.4, { tl: barH / 2, tr: barH / 2, bl: 0, br: 0 })

    const countX = barX + barW + 4
    this.add.text(countX, barY + barH / 2, `${Math.min(mission.progress, mission.target)}/${mission.target}`, {
      fontFamily: fontFamily.mono, fontSize: typeScale.meta,
      color: done ? BP.lightHex : fg.tertiaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5)

    const claimX = x + w - 26
    const claimY = barY + barH / 2
    if (done) {
      const claimGfx = this.add.graphics()
      claimGfx.fillStyle(BP.deep, 1)
      claimGfx.fillRoundedRect(claimX - 22, claimY - 9, 44, 18, 9)
      claimGfx.lineStyle(1, BP.primary, 1)
      claimGfx.strokeRoundedRect(claimX - 22, claimY - 9, 44, 18, 9)
      const pulse = this.add.rectangle(claimX, claimY, 48, 22, BP.primary, 0)
      this.tweens.add({
        targets: pulse, alpha: { from: 0.06, to: 0.25 },
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      })
      this.add.text(claimX, claimY, `+${mission.xpReward}`, {
        fontFamily: fontFamily.mono, fontSize: typeScale.small,
        color: BP.lightHex, fontStyle: '700',
      }).setOrigin(0.5)
      const claimHit = this.add.rectangle(claimX, claimY, 46, 20, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      claimHit.on('pointerdown', () => {
        playerData.claimMission(mission.id)
        this.scene.restart()
      })
    } else {
      this.add.text(claimX, claimY, `+${mission.xpReward} XP`, {
        fontFamily: fontFamily.mono, fontSize: typeScale.meta,
        color: fg.disabledHex, fontStyle: '700',
      }).setOrigin(0.5)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REWARD TRACK (horizontally scrollable)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawRewardTrack() {
    const bp = playerData.getBattlePass()
    const trackX = 12; const trackW = W - 24

    // Panel — surface.panel + border.default + radii.lg + violet top rule
    const panelGfx = this.add.graphics()
    panelGfx.fillStyle(surface.panel, 0.92)
    panelGfx.fillRoundedRect(trackX, TRACK_Y, trackW, TRACK_H, radii.lg)
    panelGfx.lineStyle(1, border.default, 1)
    panelGfx.strokeRoundedRect(trackX, TRACK_Y, trackW, TRACK_H, radii.lg)
    panelGfx.fillStyle(0xffffff, 0.03)
    panelGfx.fillRoundedRect(trackX + 2, TRACK_Y + 2, trackW - 4, 18,
      { tl: radii.lg - 1, tr: radii.lg - 1, bl: 0, br: 0 })
    panelGfx.fillStyle(BP.primary, 0.45)
    panelGfx.fillRoundedRect(trackX, TRACK_Y, trackW, 2, { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })

    // Title — Manrope meta accent letterSpacing 1.8
    this.add.text(trackX + 16, TRACK_Y + 18, t('scenes.battle-pass.rewards'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    // ── Vertical layout constants ──
    // PREMIUM on top, GRATIS on bottom, with the tier-number circle living
    // in the gap between the two rows. Premium card is taller AND wider so
    // it visually outranks the free card; the free track is pushed further
    // down to keep the tier circle perfectly centered between them.
    // ETAPA 6.8: trackGap 70 → 50 so the free row's bottom edge stays
    // within the panel. With TRACK_Y=284, PREMIUM_H=178, FREE_H=158 and
    // the old 70px gap, free bottom landed at world 720 (screen edge)
    // and overflowed the panel by 8px, clipping the value/label strip.
    const premCardY   = TRACK_Y + 30                                       // top of premium cards
    const trackGap    = 50                                                 // vertical breathing room between rows
    const freeCardY   = premCardY + PREMIUM_CARD_H + trackGap              // top of free cards
    const tierCircleY = premCardY + PREMIUM_CARD_H + trackGap / 2          // dead center of the gap

    // ── Track labels (left-rail "PREMIUM" / "GRATIS" pill stamps) ──
    this.drawTrackLabel(trackX + 10, premCardY + PREMIUM_CARD_H / 2, t('scenes.battle-pass.track-premium'), BP.primary)
    this.drawTrackLabel(trackX + 10, freeCardY + FREE_CARD_H / 2, t('scenes.battle-pass.track-free'), state.success)

    // Scrollable container for tiers
    const contentX = trackX + 72
    const contentW = trackW - 84
    const container = this.add.container(contentX, 0)
    this.trackContainer = container

    // Mask — covers from just above the tier circles to panel bottom.
    const maskTop = TRACK_Y + 30
    const maskH = TRACK_H - 38
    const maskG = this.add.graphics().setVisible(false)
    maskG.fillStyle(0xffffff)
    maskG.fillRect(contentX, maskTop, contentW, maskH)
    container.setMask(maskG.createGeometryMask())

    // Draw tiers
    const totalW = PASS_MAX_TIER * (TIER_W + TIER_GAP)

    SEASON_TIERS.forEach(st => {
      const tx = (st.tier - 1) * (TIER_W + TIER_GAP)
      const reached = bp.tier >= st.tier
      const isCurrent = bp.tier === st.tier - 1
      const freeClaimed = bp.claimedFree.includes(st.tier)
      const premClaimed = bp.claimedPremium.includes(st.tier)

      // ── Premium reward card (locked for non-premium players) ──
      // Spans the full slot width and uses the taller premium height.
      this.drawRewardCard(container, tx, premCardY, PREMIUM_CARD_W, PREMIUM_CARD_H,
        st.premiumReward, reached && bp.isPremium, premClaimed, !bp.isPremium, st.tier, true)

      // ── Free reward card ──
      // Narrower than premium → horizontally centered inside the same slot
      // so it visually aligns with the tier circle directly above it.
      const freeOffsetX = (TIER_W - FREE_CARD_W) / 2
      this.drawRewardCard(container, tx + freeOffsetX, freeCardY, FREE_CARD_W, FREE_CARD_H,
        st.freeReward, reached, freeClaimed, false, st.tier, false)

      // ── Connection line between tier circles ──
      if (st.tier > 1) {
        const lineGfx = this.add.graphics()
        lineGfx.fillStyle(reached ? BP.primary : border.subtle, reached ? 0.7 : 0.5)
        lineGfx.fillRect(tx - TIER_GAP, tierCircleY - 1.5, TIER_GAP, 3)
        container.add(lineGfx)
      }

      // ── Tier number circle ──
      const circleR = 15
      const circleGfx = this.add.graphics()
      if (isCurrent) {
        // Current tier: soft outer glow
        circleGfx.fillStyle(BP.primary, 0.28)
        circleGfx.fillCircle(tx + TIER_W / 2, tierCircleY, circleR + 6)
        circleGfx.fillStyle(BP.primary, 0.14)
        circleGfx.fillCircle(tx + TIER_W / 2, tierCircleY, circleR + 12)
      }
      // Solid backing so it occludes any card edge it overlaps
      circleGfx.fillStyle(surface.deepest, 1)
      circleGfx.fillCircle(tx + TIER_W / 2, tierCircleY, circleR + 1)
      // Inner fill
      circleGfx.fillStyle(reached ? BP.deep : surface.primary, 1)
      circleGfx.fillCircle(tx + TIER_W / 2, tierCircleY, circleR)
      // Double border ring
      circleGfx.lineStyle(1.8, reached ? BP.primary : border.strong, reached ? 1 : 0.6)
      circleGfx.strokeCircle(tx + TIER_W / 2, tierCircleY, circleR)
      circleGfx.lineStyle(1, reached ? BP.light : border.default, reached ? 0.55 : 0.3)
      circleGfx.strokeCircle(tx + TIER_W / 2, tierCircleY, circleR - 3)
      container.add(circleGfx)

      container.add(this.add.text(tx + TIER_W / 2, tierCircleY, `${st.tier}`, {
        fontFamily: fontFamily.mono, fontSize: typeScale.small,
        color: reached ? fg.primaryHex : fg.tertiaryHex, fontStyle: '700',
      }).setOrigin(0.5))
    })

    // ── Scroll ──
    const maxScroll = Math.max(0, totalW - contentW)

    // Scroll zone
    const scrollZone = this.add.rectangle(trackX + trackW / 2, TRACK_Y + TRACK_H / 2, trackW, TRACK_H, 0, 0.001)
      .setInteractive()

    scrollZone.on('wheel', (_p: Phaser.Input.Pointer, _gx: number, _gy: number, dx: number) => {
      this.scrollX = Phaser.Math.Clamp(this.scrollX + dx * 0.8, 0, maxScroll)
      container.x = contentX - this.scrollX
    })

    // Drag scroll
    let dragging = false; let dragStartX = 0; let dragScrollStart = 0
    scrollZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragging = true; dragStartX = p.x; dragScrollStart = this.scrollX
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!dragging) return
      this.scrollX = Phaser.Math.Clamp(dragScrollStart + (dragStartX - p.x), 0, maxScroll)
      container.x = contentX - this.scrollX
    })
    this.input.on('pointerup', () => { dragging = false })

    // Auto-scroll to current tier
    const currentTierX = Math.max(0, (bp.tier - 2) * (TIER_W + TIER_GAP))
    this.scrollX = Phaser.Math.Clamp(currentTierX, 0, maxScroll)
    container.x = contentX - this.scrollX
  }

  /**
   * Small "rail" label drawn on the left side of each track row (GRATIS /
   * PREMIUM). Rendered as a horizontal pill with colored border.
   *
   * Width is now measured from the rendered text instead of being a fixed
   * 56 px so that locales whose translation overflows (e.g. "PREMIUM" in
   * pt-BR, "PREMIUM" in en, "BESPLATNO" in ru, "プレミアム" in ja) still
   * sit cleanly inside the pill with consistent padding.
   */
  private drawTrackLabel(x: number, y: number, text: string, color: number) {
    const PAD_X = 12
    const MIN_W = 56
    const h = 24

    const label = this.add.text(0, y, text, {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: `#${color.toString(16).padStart(6, '0')}`,
      fontStyle: '700',
    }).setOrigin(0.5).setLetterSpacing(1.6)

    const w = Math.max(MIN_W, Math.ceil(label.width) + PAD_X * 2)
    label.setX(x + w / 2)

    const g = this.add.graphics()
    g.fillStyle(surface.deepest, 0.9)
    g.fillRoundedRect(x, y - h / 2, w, h, radii.sm)
    g.lineStyle(1.5, color, 0.85)
    g.strokeRoundedRect(x, y - h / 2, w, h, radii.sm)
    // Re-add the label on top of the pill background.
    label.setDepth(label.depth + 1)
  }

  /**
   * Render a single tier slot. `rewards` is always a non-empty array —
   * most tiers ship one reward, but tier 20 bundles (skin + skill pack) and
   * every premium gold tier bundles (gold + 10 DG), so the card has to
   * render 1 or 2 icons side-by-side (or, for skin bundles, a full-body
   * character sprite with a corner badge for the extra reward).
   *
   * Reward *application* is centralized in `PlayerDataManager._applyTierRewards`
   * so the click handler here only flags the tier as claimed and restarts the
   * scene — the manager materializes all bundled payouts in one shot.
   */
  private drawRewardCard(
    container: Phaser.GameObjects.Container,
    x: number, y: number, w: number, h: number,
    rewards: TierReward[], reached: boolean, claimed: boolean,
    locked: boolean, tier: number, isPremiumTrack: boolean,
  ) {
    const g = this.add.graphics()
    const alpha = reached ? 1 : 0.42

    // Determine the "primary" reward — it sets the card color scheme.
    // Priority: skin > skill_pack > dg > gold (most prestigious wins).
    const priorityOrder: RewardType[] = ['skin', 'skill_pack', 'dg', 'gold']
    const primaryType: RewardType =
      priorityOrder.find((t) => rewards.some((r) => r.type === t)) ?? 'gold'
    const isSpecial = primaryType === 'skin' || primaryType === 'skill_pack'

    // ── Card background — surface.panel (or violet-tinted for special) ──
    g.fillStyle(isSpecial ? BP.deep : surface.panel, alpha)
    g.fillRoundedRect(x, y, w, h, radii.md)
    // Top highlight band
    g.fillStyle(isSpecial ? BP.primary : surface.raised, alpha * 0.4)
    g.fillRoundedRect(x, y, w, h * 0.45, { tl: radii.md, tr: radii.md, bl: 0, br: 0 })

    // Diagonal shine accent for skin cards
    if (primaryType === 'skin' && reached) {
      g.fillStyle(BP.light, 0.06)
      g.fillTriangle(x, y, x + w, y, x, y + h * 0.6)
    }

    // Border follows the primary reward type. DG = violet (Decision C —
    // aligned with currency.dgGem), skill_pack = warn amber, skin = light
    // violet (premium track headline color), gold = neutral.
    const borderColor =
      primaryType === 'skin' ? BP.light :
      primaryType === 'skill_pack' ? state.warn :
      primaryType === 'dg' ? BP.primary :
      border.strong
    g.lineStyle(1.5, borderColor, reached ? 0.85 : 0.35)
    g.strokeRoundedRect(x, y, w, h, radii.md)

    // Outer glow for unclaimed "special" rewards (skin / skill_pack)
    if (isSpecial && reached && !claimed) {
      g.lineStyle(2, borderColor, 0.5)
      g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, radii.md + 2)
    }

    container.add(g)

    // ── Main display area: sprite (for skin) or icons ──
    // Top portion of the card (y → y + labelBoxTop) hosts the visual.
    const labelBoxH = 34
    const labelBoxTop = y + h - labelBoxH
    const displayCenterX = x + w / 2
    const displayCenterY = y + (h - labelBoxH) / 2 + 4

    const skinReward = rewards.find((r) => r.type === 'skin')
    const otherRewards = rewards.filter((r) => r.type !== 'skin')

    if (skinReward && skinReward.skinClass && skinReward.skinId) {
      // ── Character sprite ──
      // Compute the fit scale from the source texture's REAL dimensions
      // (so the aspect ratio is preserved — setDisplaySize would stretch
      // a wide warrior into a narrow rectangle). Pedestal size & position
      // are derived from the actual scaled display dimensions.
      // Premium cards get a slightly larger sprite envelope so the bigger
      // card has bigger art to match — otherwise the sprite would look
      // dwarfed by all the extra padding.
      const spriteKey = getCharacterKey(skinReward.skinClass, skinReward.skinId)
      const maxSpriteW = isPremiumTrack ? 100 : 86
      const maxSpriteH = isPremiumTrack ? 124 : 104

      let dispW = maxSpriteW
      let dispH = maxSpriteH
      let fitScale = 1
      let hasTexture = false
      if (this.textures.exists(spriteKey)) {
        const src = this.textures.get(spriteKey).getSourceImage() as HTMLImageElement
        const srcW = (src && src.width) || maxSpriteW
        const srcH = (src && src.height) || maxSpriteH
        fitScale = Math.min(maxSpriteW / srcW, maxSpriteH / srcH)
        dispW = srcW * fitScale
        dispH = srcH * fitScale
        hasTexture = true
      }

      // ── Radial pedestal (drawn first so sprite sits on top) ──
      const spriteCenterY = displayCenterY - 4
      const pedestalY = spriteCenterY + dispH * 0.42
      const platG = this.add.graphics()
      platG.fillStyle(borderColor, alpha * 0.18)
      platG.fillCircle(displayCenterX, pedestalY, Math.max(34, dispW * 0.5))
      platG.fillStyle(borderColor, alpha * 0.08)
      platG.fillCircle(displayCenterX, pedestalY, Math.max(46, dispW * 0.65))
      // Drop shadow ellipse at the feet
      platG.fillStyle(0x000000, alpha * 0.45)
      platG.fillEllipse(displayCenterX, pedestalY + 10, Math.max(50, dispW * 0.7), 9)
      container.add(platG)

      if (hasTexture) {
        const sprite = this.add.image(displayCenterX, spriteCenterY, spriteKey)
        sprite.setScale(fitScale)
        sprite.setAlpha(alpha)
        if (!reached) sprite.setTint(border.strong)
        container.add(sprite)
      } else {
        // Texture missing — fall back to the generic glyph
        this.drawRewardIcon(container, displayCenterX, displayCenterY, 'skin', alpha, 'large')
      }

      // ── Corner badge for any bundled non-skin reward (e.g. tier 20 pack) ──
      otherRewards.forEach((r, i) => {
        const bx = x + w - 16 - i * 22
        const by = y + 16
        // Badge backdrop
        const badgeG = this.add.graphics()
        badgeG.fillStyle(0x0a0e18, 0.92)
        badgeG.fillCircle(bx, by, 13)
        badgeG.lineStyle(1.5, borderColor, 0.9)
        badgeG.strokeCircle(bx, by, 13)
        badgeG.lineStyle(1, 0xffffff, alpha * 0.15)
        badgeG.strokeCircle(bx, by, 11)
        container.add(badgeG)
        this.drawRewardIcon(container, bx, by, r.type, alpha, 'small')
      })
    } else if (rewards.length > 1) {
      // Multi-reward without a skin (premium gold tiers 4/9/14/19: gold +
      // 10 DG bonus). Gold is the headline reward — same `large` size as
      // any single-reward gold tier — and the DG bonus is rendered at a
      // smaller `medium` size beside it so the size hierarchy makes the
      // primary reward obvious at a glance.
      const mainReward = rewards.find((r) => r.type === 'gold') ?? rewards[0]
      const bonusRewards = rewards.filter((r) => r !== mainReward)

      // Layout math (TIER_W = 100):
      //   gold:  large diameter ≈ 44, centered at displayCenterX - 18
      //   bonus: medium diameter ≈ 32, centered at displayCenterX + 24
      // → combined group is 80px wide, padded ~10px on each side.
      this.drawRewardIcon(container, displayCenterX - 18, displayCenterY,
        mainReward.type, alpha, 'large')

      bonusRewards.forEach((r, i) => {
        const bx = displayCenterX + 24 + i * 28
        this.drawRewardIcon(container, bx, displayCenterY, r.type, alpha, 'medium')
      })
    } else {
      // Single non-skin icon — rendered large
      this.drawRewardIcon(container, displayCenterX, displayCenterY, rewards[0].type, alpha, 'large')
    }

    // ── Label strip — surface.deepest pill ──
    const stripG = this.add.graphics()
    stripG.fillStyle(surface.deepest, alpha * 0.85)
    stripG.fillRoundedRect(x + 4, labelBoxTop + 2, w - 8, labelBoxH - 6, radii.sm)
    stripG.lineStyle(1, borderColor, alpha * 0.5)
    stripG.strokeRoundedRect(x + 4, labelBoxTop + 2, w - 8, labelBoxH - 6, radii.sm)
    container.add(stripG)

    // Each reward gets its own label line so bundles read cleanly.
    const labelText = rewards.map((r) => r.label).join('\n')
    const fontSize = rewards.length > 1 ? '9px' : typeScale.meta
    container.add(this.add.text(x + w / 2, labelBoxTop + labelBoxH / 2, labelText, {
      fontFamily: fontFamily.body,
      fontSize,
      color: reached ? fg.primaryHex : fg.disabledHex,
      fontStyle: '700',
      align: 'center',
      wordWrap: { width: w - 12 },
      lineSpacing: 1,
    }).setOrigin(0.5).setAlpha(alpha).setLetterSpacing(1.2))

    // ── Claimed checkmark ──
    if (claimed) {
      const checkG = this.add.graphics()
      checkG.fillStyle(state.successDim, 0.95)
      checkG.fillCircle(x + w - 14, y + 14, 10)
      checkG.lineStyle(2, state.success, 1)
      checkG.strokeCircle(x + w - 14, y + 14, 10)
      checkG.lineStyle(2.5, state.success, 1)
      checkG.beginPath()
      checkG.moveTo(x + w - 18, y + 14)
      checkG.lineTo(x + w - 14, y + 18)
      checkG.lineTo(x + w - 9, y + 10)
      checkG.strokePath()
      container.add(checkG)
    }

    // ── Lock overlay for premium locked ──
    if (locked) {
      const lockG = this.add.graphics()
      lockG.fillStyle(0x000000, 0.65)
      lockG.fillRoundedRect(x, y, w, h, radii.md)
      // Shackle + lock body using fg.tertiary
      const lockCx = x + w / 2
      const lockCy = y + h / 2 - 4
      lockG.lineStyle(2.5, fg.tertiary, 0.95)
      lockG.beginPath()
      lockG.arc(lockCx, lockCy, 8, Math.PI, 0, false)
      lockG.strokePath()
      lockG.fillStyle(fg.tertiary, 0.95)
      lockG.fillRoundedRect(lockCx - 10, lockCy, 20, 14, 2)
      lockG.fillStyle(surface.deepest, 1)
      lockG.fillCircle(lockCx, lockCy + 6, 1.5)
      container.add(lockG)
    }

    // ── Claimable hit area — calls into PlayerDataManager which applies
    //    ALL bundled rewards in one shot via _applyTierRewards. ──
    if (reached && !claimed && !locked) {
      const hitR = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      container.add(hitR)

      hitR.on('pointerdown', () => {
        if (isPremiumTrack) {
          playerData.claimPremiumReward(tier)
        } else {
          playerData.claimFreeReward(tier)
        }
        this.scene.restart()
      })
    }
  }

  /**
   * Draws a single reward-type icon at (x, y). Three size modes:
   *   - `small`  for corner badges / bundle sidekicks (tier-20 pack on skin)
   *   - `medium` for two-icon pairs (premium gold tier: gold + DG)
   *   - `large`  for single-reward "hero" display
   *
   * `gold` and `dg` use the SAME visual treatment as the lobby HUD
   * (`drawCoinIcon` and `drawDiamondIcon`) so the player recognizes them
   * as the in-game currencies they already know.
   */
  private drawRewardIcon(
    container: Phaser.GameObjects.Container,
    x: number, y: number, type: RewardType, alpha: number,
    size: 'small' | 'medium' | 'large',
  ) {
    const g = this.add.graphics()
    const r = size === 'small' ? 9 : size === 'medium' ? 16 : 22

    if (type === 'gold') {
      // ── Gold coin (currency.goldCoin) ──
      g.fillStyle(currency.goldCoin, alpha * 0.85)
      g.fillCircle(x, y, r)
      g.lineStyle(1.5, currency.goldCoinEdge, alpha)
      g.strokeCircle(x, y, r)
      g.lineStyle(1, 0xffffff, alpha * 0.2)
      g.strokeCircle(x, y, r * 0.55)
      if (size !== 'small') {
        g.lineStyle(1, 0xffe9a8, alpha * 0.55)
        g.strokeCircle(x, y, r - 2)
        g.fillStyle(0xffffff, alpha * 0.35)
        g.fillCircle(x - r * 0.35, y - r * 0.35, r * 0.22)
      }
    } else if (type === 'dg') {
      // ── DG gem — canonical SVG (ETAPA 6.1 consistency fix)
      // Same asset the lobby HUD uses via UI.currencyPill. Scales naturally
      // across small/medium/large size modes.
      const dgSize = r * 2.2
      const dgImg = this.add.image(x, y, 'currency-dg').setDisplaySize(dgSize, dgSize)
      dgImg.setTintFill(currency.dgGem)
      dgImg.setAlpha(alpha)
      container.add(dgImg)
    } else if (type === 'skill_pack') {
      // ── Skill pack — warn amber tome ──
      const sw = r * 1.7
      const sh = r * 1.5
      g.fillStyle(state.warn, alpha * 0.8)
      g.fillRoundedRect(x - sw / 2, y - sh / 2, sw, sh, radii.sm)
      g.lineStyle(1.8, state.warn, alpha)
      g.strokeRoundedRect(x - sw / 2, y - sh / 2, sw, sh, radii.sm)
      // Binding strap
      g.fillStyle(0x6a3a0a, alpha * 0.6)
      g.fillRect(x - sw / 2 + 1, y - 1.5, sw - 2, 3)
      g.lineStyle(1, 0x6a3a0a, alpha * 0.45)
      g.beginPath()
      g.moveTo(x, y - sh / 2 + 2)
      g.lineTo(x, y + sh / 2 - 2)
      g.strokePath()
      if (size !== 'small') {
        g.fillStyle(0xffffff, alpha * 0.6)
        g.fillCircle(x + sw / 2 - 3, y - sh / 2 + 3, 1.4)
      }
    } else if (type === 'skin') {
      // Fallback glyph when sprite texture is missing — light violet
      g.fillStyle(BP.light, alpha * 0.6)
      g.fillCircle(x, y, r)
      g.lineStyle(1.8, BP.primary, alpha)
      g.strokeCircle(x, y, r)
      g.fillStyle(0xffffff, alpha * 0.4)
      g.fillCircle(x, y, r * 0.35)
    }

    container.add(g)
  }

  shutdown() { this.tweens.killAll() }
}
