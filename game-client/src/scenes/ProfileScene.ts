import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import { playerData } from '../utils/PlayerDataManager'
import type { PlayerData } from '../utils/PlayerDataManager'
import { UI } from '../utils/UIComponents'
import { C, F, S, SHADOW, SCREEN } from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'

// ---- Layout (from DesignTokens) -----------------------------------------------

const W = SCREEN.W

// Aliases kept for values not in C.* (semantic colors specific to this scene)
const GREEN_VAL      = '#86efac'
const GREEN_HEX      = 0x86efac
const RED_VAL        = '#f87171'
const RED_HEX        = 0xf87171

// ---- Scene ------------------------------------------------------------------

export default class ProfileScene extends Phaser.Scene {
  private profile!: PlayerData

  constructor() {
    super('ProfileScene')
  }

  create() {
    GameStateManager.set(GameState.MENU)
    this.profile = playerData.get()

    this.drawBackground()
    this.drawParticles()
    this.drawTitle()
    this.drawAvatarCircle()
    this.drawMainPanel()
    this.drawMasteryPanel()
    this.drawBackButton()

    // Fade in from black
    UI.fadeIn(this)
  }

  // ---- Drawing helpers ------------------------------------------------------

  private drawBackground() {
    UI.background(this)
  }

  private drawParticles() {
    UI.particles(this, 16)
  }

  private drawTitle() {
    UI.goldText(this, W / 2, 38, 'PERFIL', '40px')

    // Gold decorative line
    this.add.rectangle(W / 2, 66, 180, 2, C.gold, 0.35)
  }

  private drawAvatarCircle() {
    const p = this.profile
    const cx = W / 2
    const cy = 112
    const outerR = 30
    const innerR = 26

    // Outer gold ring with glow
    const glow = this.add.graphics()
    glow.fillStyle(C.gold, 0.08)
    glow.fillCircle(cx, cy, outerR + 8)

    const ring = this.add.graphics()
    ring.lineStyle(3, C.gold, 0.9)
    ring.strokeCircle(cx, cy, outerR)
    ring.fillStyle(0x0e1219, 1)
    ring.fillCircle(cx, cy, innerR)

    // Username first letter
    const initial = p.username ? p.username.charAt(0).toUpperCase() : 'P'
    this.add.text(cx, cy, initial, {
      fontFamily: F.title,
      fontSize: '26px',
      color: C.goldHex,
      fontStyle: 'bold',
      shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)

    // Username text below
    this.add.text(cx, cy + outerR + 14, p.username, {
      fontFamily: F.title,
      fontSize: '20px',
      color: C.goldHex,
      fontStyle: 'bold',
      shadow: SHADOW.strong,
    }).setOrigin(0.5)

    // Level badge (circular indicator)
    const badgeX = cx + outerR + 4
    const badgeY = cy + outerR - 4
    const badgeR = 13

    const badgeBg = this.add.graphics()
    badgeBg.fillStyle(C.info, 0.2)
    badgeBg.fillCircle(badgeX, badgeY, badgeR)
    badgeBg.lineStyle(1.5, C.info, 0.8)
    badgeBg.strokeCircle(badgeX, badgeY, badgeR)

    this.add.text(badgeX, badgeY, `${p.level}`, {
      fontFamily: F.body,
      fontSize: S.small,
      color: C.infoHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)
  }

  private drawMainPanel() {
    const p = this.profile
    const totalGames = p.wins + p.losses
    const winRate = totalGames > 0 ? ((p.wins / totalGames) * 100).toFixed(1) : '0.0'

    // XP calculations
    const xpForNext = Math.max(1, p.level * 100)
    const xpPercent = Math.min(1, p.xp / xpForNext)

    const panelW = 700
    const panelH = 340
    const panelX = W / 2
    const panelY = 180 + panelH / 2

    // Central panel (using UI.panel for multi-layer depth)
    UI.panel(this, panelX, panelY, panelW, panelH, { radius: 10 })

    // Gold divider at top of panel
    this.add.rectangle(panelX, panelY - panelH / 2 + 2, panelW - 20, 2, C.gold, 0.15)

    // ===== XP Progress Bar (top of panel, full width) =====
    const xpBarX = panelX - panelW / 2 + 30
    const xpBarY = panelY - panelH / 2 + 30
    const xpBarW = panelW - 60
    const xpBarH = 22

    // Bar track
    const xpTrack = this.add.graphics()
    xpTrack.fillStyle(0x0a0d14, 1)
    xpTrack.fillRoundedRect(xpBarX, xpBarY - xpBarH / 2, xpBarW, xpBarH, 5)
    xpTrack.lineStyle(1, C.panelBorder, 0.4)
    xpTrack.strokeRoundedRect(xpBarX, xpBarY - xpBarH / 2, xpBarW, xpBarH, 5)

    if (xpPercent > 0) {
      const fillW = Math.max(10, xpBarW * xpPercent)

      // XP fill with glow effect
      const xpFill = this.add.graphics()
      xpFill.fillStyle(C.gold, 0.85)
      xpFill.fillRoundedRect(xpBarX, xpBarY - xpBarH / 2 + 1, fillW, xpBarH - 2, 4)

      // Highlight on top of fill (gloss)
      const xpHighlight = this.add.graphics()
      xpHighlight.fillStyle(0xffffff, 0.12)
      xpHighlight.fillRoundedRect(xpBarX + 2, xpBarY - xpBarH / 2 + 2, fillW - 4, (xpBarH - 4) / 2, 3)

      // Sparkle particle at the edge of the fill
      const sparkleX = xpBarX + fillW - 2
      const sparkleY = xpBarY

      for (let s = 0; s < 3; s++) {
        const sparkle = this.add.circle(
          sparkleX,
          sparkleY + Phaser.Math.Between(-6, 6),
          Phaser.Math.FloatBetween(1, 2.5),
          0xffffff,
          0.8,
        )

        this.tweens.add({
          targets: sparkle,
          alpha: 0,
          y: sparkleY + Phaser.Math.Between(-20, -10),
          x: sparkleX + Phaser.Math.Between(-8, 8),
          scale: 0,
          duration: Phaser.Math.Between(600, 1200),
          repeat: -1,
          delay: Phaser.Math.Between(0, 800),
          onRepeat: () => {
            sparkle.setPosition(sparkleX + Phaser.Math.Between(-4, 4), sparkleY + Phaser.Math.Between(-4, 4))
            sparkle.setAlpha(0.8)
            sparkle.setScale(1)
          },
        })
      }
    }

    // XP text overlay
    this.add.text(xpBarX + xpBarW / 2, xpBarY, `${p.xp} / ${xpForNext} XP`, {
      fontFamily: F.body,
      fontSize: S.small,
      color: C.bodyHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    // ===== Stat cards grid (2 rows x 2 cols) =====
    const cardW = 300
    const cardH = 72
    const cardGapX = 20
    const cardGapY = 12
    const gridStartX = panelX - (cardW + cardGapX / 2)
    const gridStartY = xpBarY + 36

    const stats: Array<{ icon: string; label: string; value: string; color: string }> = [
      { icon: '\u269C', label: 'Gold', value: `${p.gold}`, color: C.goldHex },
      { icon: '\uD83D\uDC8E', label: 'DG', value: `${p.dg}`, color: C.infoHex },
      { icon: '\u2694', label: 'Rank', value: `${p.rankPoints}`, color: C.infoHex },
      { icon: '\uD83C\uDFAF', label: 'Win Rate', value: `${winRate}%`, color: C.bodyHex },
    ]

    stats.forEach((stat, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const cx = gridStartX + col * (cardW + cardGapX) + cardW / 2
      const cy = gridStartY + row * (cardH + cardGapY) + cardH / 2

      // Card shadow
      this.add.graphics()
        .fillStyle(0x000000, 0.25)
        .fillRoundedRect(cx - cardW / 2 + 2, cy - cardH / 2 + 2, cardW, cardH, 6)

      // Card background
      const cardGfx = this.add.graphics()
      cardGfx.fillStyle(C.panelBgAlt, 0.9)
      cardGfx.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6)
      cardGfx.lineStyle(1, C.panelBorder, 0.3)
      cardGfx.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 6)

      // Icon
      this.add.text(cx - cardW / 2 + 16, cy, stat.icon, {
        fontFamily: F.body,
        fontSize: '22px',
        color: stat.color,
        shadow: SHADOW.strong,
      }).setOrigin(0, 0.5)

      // Label
      this.add.text(cx - cardW / 2 + 48, cy - 10, stat.label, {
        fontFamily: F.body,
        fontSize: S.small,
        color: C.mutedHex,
        shadow: SHADOW.text,
      }).setOrigin(0, 0.5)

      // Value
      this.add.text(cx - cardW / 2 + 48, cy + 10, stat.value, {
        fontFamily: F.title,
        fontSize: S.titleSmall,
        color: stat.color,
        fontStyle: 'bold',
        shadow: SHADOW.strong,
      }).setOrigin(0, 0.5)
    })

    // ===== Win/Loss visual ratio bar =====
    const ratioY = gridStartY + 2 * (cardH + cardGapY) + 16
    const ratioW = panelW - 60
    const ratioH = 20
    const ratioX = panelX - ratioW / 2

    // Label
    this.add.text(panelX, ratioY - 16, 'VITORIAS vs DERROTAS', {
      fontFamily: F.body,
      fontSize: S.small,
      color: C.mutedHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    // Track
    const ratioTrack = this.add.graphics()
    ratioTrack.fillStyle(0x0a0d14, 1)
    ratioTrack.fillRoundedRect(ratioX, ratioY, ratioW, ratioH, 4)
    ratioTrack.lineStyle(1, C.panelBorder, 0.3)
    ratioTrack.strokeRoundedRect(ratioX, ratioY, ratioW, ratioH, 4)

    if (totalGames > 0) {
      const winFrac = p.wins / totalGames
      const winW = Math.max(4, ratioW * winFrac)
      const lossW = ratioW - winW

      // Green (wins) side
      if (winW > 0) {
        const winBar = this.add.graphics()
        winBar.fillStyle(GREEN_HEX, 0.7)
        winBar.fillRoundedRect(ratioX, ratioY + 1, winW, ratioH - 2,
          { tl: 3, bl: 3, tr: 0, br: 0 })
      }

      // Red (losses) side
      if (lossW > 0) {
        const lossBar = this.add.graphics()
        lossBar.fillStyle(RED_HEX, 0.5)
        lossBar.fillRoundedRect(ratioX + winW, ratioY + 1, lossW, ratioH - 2,
          { tl: 0, bl: 0, tr: 3, br: 3 })
      }

      // Win count on left
      this.add.text(ratioX + 8, ratioY + ratioH / 2, `${p.wins}W`, {
        fontFamily: F.body,
        fontSize: '10px',
        color: GREEN_VAL,
        fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(0, 0.5)

      // Loss count on right
      this.add.text(ratioX + ratioW - 8, ratioY + ratioH / 2, `${p.losses}L`, {
        fontFamily: F.body,
        fontSize: '10px',
        color: RED_VAL,
        fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(1, 0.5)
    } else {
      this.add.text(panelX, ratioY + ratioH / 2, 'Sem partidas', {
        fontFamily: F.body,
        fontSize: '10px',
        color: C.mutedHex,
        shadow: SHADOW.text,
      }).setOrigin(0.5)
    }
  }

  private drawMasteryPanel() {
    const p = this.profile

    const panelW = 700
    const panelH = 120
    const panelX = W / 2
    const panelY = 565

    // Mastery panel (using UI.panel for consistent depth)
    UI.panel(this, panelX, panelY, panelW, panelH, { radius: 10 })

    // Section title
    this.add.text(panelX, panelY - panelH / 2 + 20, 'MAESTRIA', {
      fontFamily: F.title,
      fontSize: S.titleSmall,
      color: C.goldDimHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0.5)

    // Gold divider
    this.add.rectangle(panelX, panelY - panelH / 2 + 36, panelW - 80, 1, C.gold, 0.15)

    // Mastery progress bars
    const barW = 260
    const barH = 16
    const maxMastery = 100

    // Attack mastery bar (left)
    const atkX = panelX - panelW / 2 + 50
    const barY = panelY + 12

    this.drawMasteryBar(
      atkX, barY, barW, barH,
      '\u2694 Ataque', p.attackMastery, maxMastery,
      C.gold, C.goldHex,
    )

    // Defense mastery bar (right)
    const defX = panelX + 30
    this.drawMasteryBar(
      defX, barY, barW, barH,
      '\uD83D\uDEE1 Defesa', p.defenseMastery, maxMastery,
      C.info, C.infoHex,
    )
  }

  private drawMasteryBar(
    x: number, y: number, w: number, h: number,
    label: string, current: number, max: number,
    fillColor: number, textColor: string,
  ) {
    const pct = Math.min(1, current / max)

    // Label above bar
    this.add.text(x, y - 14, label, {
      fontFamily: F.body,
      fontSize: S.small,
      color: C.mutedHex,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(0, 0.5)

    // Value on the right of label
    this.add.text(x + w, y - 14, `${current}/${max}`, {
      fontFamily: F.body,
      fontSize: S.small,
      color: textColor,
      fontStyle: 'bold',
      shadow: SHADOW.text,
    }).setOrigin(1, 0.5)

    // Track
    const track = this.add.graphics()
    track.fillStyle(0x0a0d14, 1)
    track.fillRoundedRect(x, y - h / 2, w, h, 4)
    track.lineStyle(1, C.panelBorder, 0.3)
    track.strokeRoundedRect(x, y - h / 2, w, h, 4)

    // Fill
    if (pct > 0) {
      const fillW = Math.max(6, w * pct)
      const fill = this.add.graphics()
      fill.fillStyle(fillColor, 0.75)
      fill.fillRoundedRect(x, y - h / 2 + 1, fillW, h - 2, 3)

      // Gloss highlight
      const gloss = this.add.graphics()
      gloss.fillStyle(0xffffff, 0.08)
      gloss.fillRoundedRect(x + 2, y - h / 2 + 2, fillW - 4, (h - 4) / 2, 2)
    }
  }

  // ---- Back button ----------------------------------------------------------

  private drawBackButton() {
    UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))
  }

  shutdown() {
    this.tweens.killAll()
  }
}
