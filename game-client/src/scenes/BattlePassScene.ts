import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import { C, F, SHADOW, SCREEN } from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import type { BattlePassMission } from '../utils/PlayerDataManager'
import { SEASON_TIERS, PASS_XP_PER_TIER, PASS_MAX_TIER, PASS_PREMIUM_PRICE_LABEL, CURRENT_SEASON } from '../data/battlePass'
import type { TierReward, RewardType } from '../data/battlePass'
import { getCharacterKey } from '../utils/AssetPaths'

const W = SCREEN.W
const H = SCREEN.H
const TOP_H = 56
const MISSION_H = 200
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
    bg.fillStyle(0x0a0f18, 0.97)
    bg.fillRect(0, 0, W, TOP_H)
    // Bottom gradient line
    for (let i = 0; i < W; i++) {
      const d = Math.abs(i - W / 2) / (W / 2)
      bg.fillStyle(0x8844cc, 0.25 * (1 - d * d))
      bg.fillRect(i, TOP_H - 1, 1, 1)
    }

    UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))

    // Title
    this.add.text(70, TOP_H / 2 - 6, 'PASSE DE BATALHA', {
      fontFamily: F.title, fontSize: '20px', color: '#cc88ff', fontStyle: 'bold',
      shadow: { offsetX: 0, offsetY: 2, color: '#4a1a6a', blur: 8, fill: true },
    }).setOrigin(0, 0.5)

    // Season name
    this.add.text(70, TOP_H / 2 + 12, CURRENT_SEASON.name, {
      fontFamily: F.body, fontSize: '10px', color: '#886aaa', shadow: SHADOW.text,
    }).setOrigin(0, 0.5)

    // Right: tier + XP
    const tierText = bp.tier >= PASS_MAX_TIER ? 'MAX' : `Nivel ${bp.tier}`
    this.add.text(W - 20, TOP_H / 2 - 8, tierText, {
      fontFamily: F.title, fontSize: '16px', color: '#cc88ff', fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(1, 0.5)

    if (bp.tier < PASS_MAX_TIER) {
      // XP progress bar
      const barW = 120; const barH = 8
      const barX = W - 20 - barW; const barY = TOP_H / 2 + 8
      const ratio = bp.xp / PASS_XP_PER_TIER

      const barGfx = this.add.graphics()
      barGfx.fillStyle(0x1a1030, 1)
      barGfx.fillRoundedRect(barX, barY, barW, barH, barH / 2)
      const fillW = Math.max(barH, barW * ratio)
      barGfx.fillStyle(0x8844cc, 0.8)
      barGfx.fillRoundedRect(barX, barY, fillW, barH, barH / 2)
      barGfx.fillStyle(0xffffff, 0.15)
      barGfx.fillRoundedRect(barX, barY, fillW, barH * 0.4, { tl: barH / 2, tr: barH / 2, bl: 0, br: 0 })

      this.add.text(barX + barW / 2, barY + barH / 2, `${bp.xp}/${PASS_XP_PER_TIER} XP`, {
        fontFamily: F.body, fontSize: '11px', color: '#ffffff', fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5)
    }

    // Days remaining
    const endDate = new Date(CURRENT_SEASON.endDate).getTime()
    const daysLeft = Math.max(0, Math.ceil((endDate - Date.now()) / (24 * 60 * 60 * 1000)))
    this.add.text(W - 150, TOP_H / 2 + 8, `${daysLeft}d restantes`, {
      fontFamily: F.body, fontSize: '13px', color: '#665588', shadow: SHADOW.text,
    }).setOrigin(1, 0.5)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MISSIONS PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  private drawMissionsPanel() {
    const bp = playerData.getBattlePass()
    const px = 12; const py = TOP_H + 6; const pw = W - 24; const ph = MISSION_H - 12

    // Panel background
    const pg = this.add.graphics()
    pg.fillStyle(0x0c1019, 0.9)
    pg.fillRoundedRect(px, py, pw, ph, 10)
    pg.lineStyle(1, 0x8844cc, 0.15)
    pg.strokeRoundedRect(px, py, pw, ph, 10)

    // Title + subtitle ("expire with the season")
    this.add.text(px + 16, py + 16, 'MISSOES DA TEMPORADA', {
      fontFamily: F.title, fontSize: '14px', color: '#cc88ff', fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0, 0.5)
    this.add.text(px + 16, py + 32, 'Todas expiram junto com a temporada', {
      fontFamily: F.body, fontSize: '10px', color: '#666688', shadow: SHADOW.text,
    }).setOrigin(0, 0.5)

    // ── Mission grid (2 rows × 4 cols, fits the 8 chain slots) ──
    // Each card holds the CURRENT stage of an evolving chain — when the
    // player claims a stage the next stage just slides in to replace it,
    // so the slot count never grows past 8.
    const gridX = px + 16
    const gridY = py + 46
    const colsPerRow = 4
    const cardW = 195
    const cardH = 64
    const cardGapX = 10
    const cardGapY = 8

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
      const btnW = 170; const btnH = 84

      // Outer glow
      const glow = this.add.rectangle(btnX, btnY, btnW + 10, btnH + 10, 0x8844cc, 0)
      this.tweens.add({
        targets: glow, alpha: { from: 0.06, to: 0.2 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      })

      const btnGfx = this.add.graphics()
      // Shadow
      btnGfx.fillStyle(0x000000, 0.3)
      btnGfx.fillRoundedRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 3, btnW, btnH, 10)
      // Fill
      btnGfx.fillStyle(0x1a1030, 1)
      btnGfx.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 10)
      // Purple wash
      btnGfx.fillStyle(0x8844cc, 0.18)
      btnGfx.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH / 2, {
        tl: 10, tr: 10, bl: 0, br: 0,
      })
      // Top gloss
      btnGfx.fillStyle(0xffffff, 0.04)
      btnGfx.fillRoundedRect(btnX - btnW / 2 + 2, btnY - btnH / 2 + 2, btnW - 4, 16,
        { tl: 8, tr: 8, bl: 0, br: 0 })
      // Double border
      btnGfx.lineStyle(2, 0x8844cc, 0.85)
      btnGfx.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, 10)
      btnGfx.lineStyle(1, 0xcc88ff, 0.4)
      btnGfx.strokeRoundedRect(btnX - btnW / 2 + 3, btnY - btnH / 2 + 3, btnW - 6, btnH - 6, 8)

      this.add.text(btnX, btnY - 22, 'OBTER PREMIUM', {
        fontFamily: F.title, fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
        shadow: { offsetX: 0, offsetY: 1, color: '#2a0a4a', blur: 6, fill: true },
      }).setOrigin(0.5)
      this.add.text(btnX, btnY - 4, PASS_PREMIUM_PRICE_LABEL, {
        fontFamily: F.title, fontSize: '18px', color: '#f0c850', fontStyle: 'bold',
        shadow: { offsetX: 0, offsetY: 2, color: '#3a2a0a', blur: 6, fill: true },
      }).setOrigin(0.5)
      this.add.text(btnX, btnY + 18, 'Desbloqueia recompensas', {
        fontFamily: F.body, fontSize: '9px', color: '#886aaa', shadow: SHADOW.text,
      }).setOrigin(0.5)
      this.add.text(btnX, btnY + 30, 'premium do passe', {
        fontFamily: F.body, fontSize: '9px', color: '#886aaa', shadow: SHADOW.text,
      }).setOrigin(0.5)

      const hit = this.add.rectangle(btnX, btnY, btnW, btnH, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerover', () => {
        this.tweens.add({ targets: [glow], alpha: 0.3, duration: 140 })
      })
      hit.on('pointerout', () => {
        this.tweens.add({ targets: [glow], alpha: 0.15, duration: 140 })
      })
      hit.on('pointerdown', () => {
        // TODO: hook into the real-money IAP flow. For now the client just
        // unlocks the premium track to let designers validate the UX.
        if (playerData.unlockPremiumPass()) {
          this.scene.restart()
        }
      })
    } else {
      // Premium active badge
      const badgeX = W - 110; const badgeY = py + ph / 2
      const badgeGfx = this.add.graphics()
      badgeGfx.fillStyle(0x2a1a3a, 0.9)
      badgeGfx.fillRoundedRect(badgeX - 70, badgeY - 22, 140, 44, 10)
      badgeGfx.lineStyle(2, 0x8844cc, 0.7)
      badgeGfx.strokeRoundedRect(badgeX - 70, badgeY - 22, 140, 44, 10)
      badgeGfx.lineStyle(1, 0xcc88ff, 0.4)
      badgeGfx.strokeRoundedRect(badgeX - 67, badgeY - 19, 134, 38, 8)
      this.add.text(badgeX, badgeY - 6, 'PREMIUM ATIVO', {
        fontFamily: F.title, fontSize: '13px', color: '#cc88ff', fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5)
      this.add.text(badgeX, badgeY + 10, 'Obrigado por apoiar!', {
        fontFamily: F.body, fontSize: '9px', color: '#886aaa', shadow: SHADOW.text,
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

    // ── Background ──
    g.fillStyle(fullyDone ? 0x14241a : done ? 0x1a1a30 : 0x0e1420, 0.92)
    g.fillRoundedRect(x, y, w, h, 6)

    // Top highlight band — subtle shine on the upper third
    g.fillStyle(fullyDone ? 0x1f2f25 : done ? 0x252040 : 0x141a26, 0.6)
    g.fillRoundedRect(x, y, w, h * 0.35, { tl: 6, tr: 6, bl: 0, br: 0 })

    // Border picks the state color
    const borderColor = fullyDone ? C.success : done ? 0xcc88ff : 0x3a3a4a
    g.lineStyle(1.5, borderColor, fullyDone ? 0.7 : done ? 0.65 : 0.25)
    g.strokeRoundedRect(x, y, w, h, 6)
    // Inner ring (very subtle) to feel premium
    g.lineStyle(1, borderColor, fullyDone ? 0.25 : done ? 0.22 : 0.08)
    g.strokeRoundedRect(x + 2, y + 2, w - 4, h - 4, 5)

    // ── Category pill (top-left) ──
    if (mission.category) {
      const pillX = x + 8; const pillY = y + 10
      const pillTextW = mission.category.length * 6 + 10
      const pillH = 14
      const pillGfx = this.add.graphics()
      pillGfx.fillStyle(0x1a1030, 0.85)
      pillGfx.fillRoundedRect(pillX, pillY - pillH / 2, pillTextW, pillH, 7)
      pillGfx.lineStyle(1, borderColor, 0.6)
      pillGfx.strokeRoundedRect(pillX, pillY - pillH / 2, pillTextW, pillH, 7)
      this.add.text(pillX + pillTextW / 2, pillY, mission.category, {
        fontFamily: F.title, fontSize: '8px',
        color: fullyDone ? '#9be8aa' : done ? '#cc88ff' : '#666688',
        fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5)
    }

    // ── Stage indicator (top-right): "2/5" or "✓" if fully done ──
    {
      const indicatorX = x + w - 8
      const indicatorY = y + 10
      // When fullyDone we render the checkmark INSIDE the same slot the
      // claim button used to occupy on the bottom row, so the top-right
      // just shows "5/5". When mid-chain we show the active stage number.
      const stageText = fullyDone
        ? `${mission.totalStages}/${mission.totalStages}`
        : `${mission.stageIndex + 1}/${mission.totalStages}`
      this.add.text(indicatorX, indicatorY, stageText, {
        fontFamily: F.title, fontSize: '9px',
        color: fullyDone ? '#9be8aa' : done ? '#cc88ff' : '#666677',
        fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(1, 0.5)
    }

    // ── Description (middle row) ──
    this.add.text(x + 8, y + 26, mission.description, {
      fontFamily: F.body, fontSize: '10px',
      color: fullyDone ? '#9be8aa' : done ? '#ccbbee' : '#888888',
      fontStyle: 'bold', shadow: SHADOW.text,
      wordWrap: { width: w - 16 },
    }).setOrigin(0, 0.5)

    // ── Progress bar + count + claim/XP (bottom row) ──
    if (fullyDone) {
      // Replace the bar with a flat "concluído" line and a checkmark.
      const cy = y + h - 12
      const cGfx = this.add.graphics()
      cGfx.fillStyle(0x1a3a1a, 0.6)
      cGfx.fillRoundedRect(x + 8, cy - 4, w - 16, 8, 4)
      this.add.text(x + 8, cy, 'CADEIA COMPLETA', {
        fontFamily: F.title, fontSize: '8px', color: '#9be8aa',
        fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0, 0.5)
      this.add.text(x + w - 8, cy, '✓', {
        fontFamily: F.title, fontSize: '14px', color: '#4ade80',
        fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(1, 0.5)
      return
    }

    // Reserve right-side space for either the claim button (when done) or
    // the static "+xp" pill (otherwise). The progress bar fills whatever is
    // left of the card minus margins.
    const rightZone = 50 // width of XP/claim block
    const barX = x + 8
    const barY = y + h - 14
    const barH = 6
    const countTextW = 32 // room for "999/999"
    const barW = Math.max(40, w - 16 - rightZone - countTextW - 4)

    // Bar background
    const ratio = Math.min(mission.progress / mission.target, 1)
    const pGfx = this.add.graphics()
    pGfx.fillStyle(0x0a0e18, 1)
    pGfx.fillRoundedRect(barX, barY, barW, barH, barH / 2)
    // Fill
    const fillW = Math.max(barH, barW * ratio)
    pGfx.fillStyle(done ? 0xcc88ff : 0x554477, 0.85)
    pGfx.fillRoundedRect(barX, barY, fillW, barH, barH / 2)
    // Glossy highlight
    pGfx.fillStyle(0xffffff, 0.18)
    pGfx.fillRoundedRect(barX, barY, fillW, barH * 0.4, { tl: barH / 2, tr: barH / 2, bl: 0, br: 0 })

    // Progress count text
    const countX = barX + barW + 4
    this.add.text(countX, barY + barH / 2, `${Math.min(mission.progress, mission.target)}/${mission.target}`, {
      fontFamily: F.body, fontSize: '10px',
      color: done ? '#cc88ff' : '#666677',
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0, 0.5)

    // Claim pill (or static "+xp" preview)
    const claimX = x + w - 26
    const claimY = barY + barH / 2
    if (done) {
      const claimGfx = this.add.graphics()
      claimGfx.fillStyle(0x2a1a3a, 1)
      claimGfx.fillRoundedRect(claimX - 22, claimY - 9, 44, 18, 9)
      claimGfx.lineStyle(1, 0x8844cc, 0.85)
      claimGfx.strokeRoundedRect(claimX - 22, claimY - 9, 44, 18, 9)
      // Pulsing glow
      const pulse = this.add.rectangle(claimX, claimY, 48, 22, 0x8844cc, 0)
      this.tweens.add({
        targets: pulse, alpha: { from: 0.04, to: 0.2 },
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      })
      this.add.text(claimX, claimY, `+${mission.xpReward}`, {
        fontFamily: F.title, fontSize: '12px', color: '#cc88ff',
        fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5)
      // Hit zone
      const claimHit = this.add.rectangle(claimX, claimY, 46, 20, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      claimHit.on('pointerdown', () => {
        playerData.claimMission(mission.id)
        this.scene.restart()
      })
    } else {
      this.add.text(claimX, claimY, `+${mission.xpReward}xp`, {
        fontFamily: F.body, fontSize: '10px',
        color: '#555566', fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REWARD TRACK (horizontally scrollable)
  // ═══════════════════════════════════════════════════════════════════════════

  private drawRewardTrack() {
    const bp = playerData.getBattlePass()
    const trackX = 12; const trackW = W - 24

    // Panel background
    const panelGfx = this.add.graphics()
    panelGfx.fillStyle(0x0c1019, 0.9)
    panelGfx.fillRoundedRect(trackX, TRACK_Y, trackW, TRACK_H, 10)
    panelGfx.lineStyle(1, 0x8844cc, 0.15)
    panelGfx.strokeRoundedRect(trackX, TRACK_Y, trackW, TRACK_H, 10)

    // Title
    this.add.text(trackX + 16, TRACK_Y + 16, 'RECOMPENSAS', {
      fontFamily: F.title, fontSize: '14px', color: C.goldHex, fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0, 0.5)

    // ── Vertical layout constants ──
    // PREMIUM on top, GRATIS on bottom, with the tier-number circle living
    // in the gap between the two rows. Premium card is taller AND wider so
    // it visually outranks the free card; the free track is pushed further
    // down to keep the tier circle perfectly centered between them.
    const premCardY   = TRACK_Y + 30                                       // top of premium cards
    const trackGap    = 70                                                 // vertical breathing room between rows
    const freeCardY   = premCardY + PREMIUM_CARD_H + trackGap              // top of free cards
    const tierCircleY = premCardY + PREMIUM_CARD_H + trackGap / 2          // dead center of the gap

    // ── Track labels (left-rail "PREMIUM" / "GRATIS" pill stamps) ──
    this.drawTrackLabel(trackX + 10, premCardY + PREMIUM_CARD_H / 2, 'PREMIUM', 0xcc88ff)
    this.drawTrackLabel(trackX + 10, freeCardY + FREE_CARD_H / 2, 'GRATIS', 0x4ade80)

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

      // ── Connection line between tier circles (drawn after cards so it
      //    sits in the central gap between rows) ──
      if (st.tier > 1) {
        const lineGfx = this.add.graphics()
        lineGfx.fillStyle(reached ? 0x8844cc : 0x222233, reached ? 0.6 : 0.3)
        lineGfx.fillRect(tx - TIER_GAP, tierCircleY - 1.5, TIER_GAP, 3)
        container.add(lineGfx)
      }

      // ── Tier number circle (DRAWN LAST so it sits on top of cards) ──
      const circleR = 15
      const circleGfx = this.add.graphics()
      if (isCurrent) {
        // Current tier: soft outer glow
        circleGfx.fillStyle(0x8844cc, 0.22)
        circleGfx.fillCircle(tx + TIER_W / 2, tierCircleY, circleR + 6)
        circleGfx.fillStyle(0x8844cc, 0.12)
        circleGfx.fillCircle(tx + TIER_W / 2, tierCircleY, circleR + 12)
      }
      // Solid backing so it occludes any card edge it overlaps
      circleGfx.fillStyle(0x0a0e18, 1)
      circleGfx.fillCircle(tx + TIER_W / 2, tierCircleY, circleR + 1)
      // Inner fill
      circleGfx.fillStyle(reached ? 0x2a1a3a : 0x12161f, 1)
      circleGfx.fillCircle(tx + TIER_W / 2, tierCircleY, circleR)
      // Double border ring
      circleGfx.lineStyle(1.8, reached ? 0x8844cc : 0x444455, reached ? 0.95 : 0.5)
      circleGfx.strokeCircle(tx + TIER_W / 2, tierCircleY, circleR)
      circleGfx.lineStyle(1, reached ? 0xcc88ff : 0x666677, reached ? 0.5 : 0.25)
      circleGfx.strokeCircle(tx + TIER_W / 2, tierCircleY, circleR - 3)
      container.add(circleGfx)

      container.add(this.add.text(tx + TIER_W / 2, tierCircleY, `${st.tier}`, {
        fontFamily: F.title, fontSize: '13px',
        color: reached ? '#ffe6ff' : '#666677',
        fontStyle: 'bold', shadow: SHADOW.text,
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
   * PREMIUM). Rendered as a vertical pill with colored border.
   */
  private drawTrackLabel(x: number, y: number, text: string, color: number) {
    const w = 52; const h = 24
    const g = this.add.graphics()
    g.fillStyle(0x0e1018, 0.9)
    g.fillRoundedRect(x, y - h / 2, w, h, 6)
    g.lineStyle(1.5, color, 0.8)
    g.strokeRoundedRect(x, y - h / 2, w, h, 6)
    g.lineStyle(1, color, 0.3)
    g.strokeRoundedRect(x + 2, y - h / 2 + 2, w - 4, h - 4, 4)
    this.add.text(x + w / 2, y, text, {
      fontFamily: F.title, fontSize: '10px',
      color: `#${color.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)
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

    // ── Card background (vertical gradient via two rectangles) ──
    g.fillStyle(isSpecial ? 0x1a1430 : 0x0e1420, alpha)
    g.fillRoundedRect(x, y, w, h, 8)
    // Top highlight band
    g.fillStyle(isSpecial ? 0x2a1a50 : 0x1a2030, alpha * 0.5)
    g.fillRoundedRect(x, y, w, h * 0.45, { tl: 8, tr: 8, bl: 0, br: 0 })

    // Diagonal shine accent for skin cards
    if (primaryType === 'skin' && reached) {
      g.fillStyle(0xcc88ff, 0.05)
      g.fillTriangle(x, y, x + w, y, x, y + h * 0.6)
    }

    // Border follows the primary reward type. Note: DG owns the cyan blue
    // (matching the lobby HUD), so skill packs use a distinct warm orange.
    const borderColor =
      primaryType === 'skin' ? 0xcc88ff :
      primaryType === 'skill_pack' ? 0xffa726 :
      primaryType === 'dg' ? 0x4fc3f7 :
      0x3a3a4a
    g.lineStyle(1.5, borderColor, reached ? 0.65 : 0.18)
    g.strokeRoundedRect(x, y, w, h, 8)

    // Outer glow for unclaimed "special" rewards (skin / skill_pack)
    if (isSpecial && reached && !claimed) {
      g.lineStyle(2, borderColor, 0.35)
      g.strokeRoundedRect(x - 2, y - 2, w + 4, h + 4, 10)
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
        if (!reached) sprite.setTint(0x555566)
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

    // ── Label strip at the bottom of the card ──
    const stripG = this.add.graphics()
    stripG.fillStyle(0x000000, alpha * 0.45)
    stripG.fillRoundedRect(x + 4, labelBoxTop + 2, w - 8, labelBoxH - 6, 5)
    stripG.lineStyle(1, borderColor, alpha * 0.35)
    stripG.strokeRoundedRect(x + 4, labelBoxTop + 2, w - 8, labelBoxH - 6, 5)
    container.add(stripG)

    // Each reward gets its own label line so bundles read cleanly.
    const labelText = rewards.map((r) => r.label).join('\n')
    const fontSize = rewards.length > 1 ? '8px' : '10px'
    container.add(this.add.text(x + w / 2, labelBoxTop + labelBoxH / 2, labelText, {
      fontFamily: F.body,
      fontSize,
      color: reached ? '#e8e0f2' : '#555566',
      fontStyle: 'bold',
      shadow: SHADOW.text,
      align: 'center',
      wordWrap: { width: w - 12 },
      lineSpacing: 1,
    }).setOrigin(0.5).setAlpha(alpha))

    // ── Claimed checkmark ──
    if (claimed) {
      const checkG = this.add.graphics()
      checkG.fillStyle(0x1a3a1a, 0.9)
      checkG.fillCircle(x + w - 14, y + 14, 10)
      checkG.lineStyle(2, C.success, 0.95)
      checkG.strokeCircle(x + w - 14, y + 14, 10)
      checkG.lineStyle(2.5, C.success, 1)
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
      lockG.fillStyle(0x000000, 0.58)
      lockG.fillRoundedRect(x, y, w, h, 8)
      // Shackle
      const lockCx = x + w / 2
      const lockCy = y + h / 2 - 4
      lockG.lineStyle(2.5, 0x888899, 0.85)
      lockG.beginPath()
      lockG.arc(lockCx, lockCy, 8, Math.PI, 0, false)
      lockG.strokePath()
      // Body
      lockG.fillStyle(0x888899, 0.9)
      lockG.fillRoundedRect(lockCx - 10, lockCy, 20, 14, 2)
      // Keyhole
      lockG.fillStyle(0x0e1018, 1)
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
      // ── Standard gold coin (mirrors LobbyScene.drawCoinIcon) ──
      g.fillStyle(C.gold, alpha * 0.7)
      g.fillCircle(x, y, r)
      g.lineStyle(1.5, C.gold, alpha * 0.9)
      g.strokeCircle(x, y, r)
      g.lineStyle(1, 0xffffff, alpha * 0.18)
      g.strokeCircle(x, y, r * 0.55)
      // Larger sizes get an extra rim highlight + center shine
      if (size !== 'small') {
        g.lineStyle(1, 0xffdd88, alpha * 0.55)
        g.strokeCircle(x, y, r - 2)
        g.fillStyle(0xffffff, alpha * 0.32)
        g.fillCircle(x - r * 0.35, y - r * 0.35, r * 0.22)
      }
    } else if (type === 'dg') {
      // ── Standard DG diamond-coin (mirrors LobbyScene.drawDiamondIcon) ──
      // Outer coin
      g.fillStyle(C.info, alpha * 0.6)
      g.fillCircle(x, y, r)
      g.lineStyle(1.5, C.info, alpha * 0.9)
      g.strokeCircle(x, y, r)
      // Inner diamond
      const ds = r * 0.55
      g.fillStyle(0xffffff, alpha * 0.28)
      g.fillPoints([
        new Phaser.Geom.Point(x, y - ds),
        new Phaser.Geom.Point(x + ds * 0.7, y),
        new Phaser.Geom.Point(x, y + ds),
        new Phaser.Geom.Point(x - ds * 0.7, y),
      ], true)
      // Diamond outline (only for larger sizes)
      if (size !== 'small') {
        g.lineStyle(1, 0xffffff, alpha * 0.5)
        g.strokePoints([
          new Phaser.Geom.Point(x, y - ds),
          new Phaser.Geom.Point(x + ds * 0.7, y),
          new Phaser.Geom.Point(x, y + ds),
          new Phaser.Geom.Point(x - ds * 0.7, y),
        ], true)
      }
    } else if (type === 'skill_pack') {
      // ── Skill pack — orange tome/scroll ──
      const sw = r * 1.7
      const sh = r * 1.5
      // Outer pack body
      g.fillStyle(0xffa726, alpha * 0.7)
      g.fillRoundedRect(x - sw / 2, y - sh / 2, sw, sh, 4)
      g.lineStyle(1.8, 0xffa726, alpha * 0.95)
      g.strokeRoundedRect(x - sw / 2, y - sh / 2, sw, sh, 4)
      // Horizontal binding strap
      g.fillStyle(0x6a3a0a, alpha * 0.55)
      g.fillRect(x - sw / 2 + 1, y - 1.5, sw - 2, 3)
      // Vertical seam down the middle
      g.lineStyle(1, 0x6a3a0a, alpha * 0.4)
      g.beginPath()
      g.moveTo(x, y - sh / 2 + 2)
      g.lineTo(x, y + sh / 2 - 2)
      g.strokePath()
      // Top corner sparkle for "rare" feel
      if (size !== 'small') {
        g.fillStyle(0xffffff, alpha * 0.55)
        g.fillCircle(x + sw / 2 - 3, y - sh / 2 + 3, 1.4)
      }
    } else if (type === 'skin') {
      // Fallback glyph when sprite texture is missing
      g.fillStyle(0xcc88ff, alpha * 0.55)
      g.fillCircle(x, y, r)
      g.lineStyle(1.8, 0xcc88ff, alpha * 0.9)
      g.strokeCircle(x, y, r)
      g.fillStyle(0xffffff, alpha * 0.4)
      g.fillCircle(x, y, r * 0.35)
    }

    container.add(g)
  }

  shutdown() { this.tweens.killAll() }
}
