import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import { playerData } from '../utils/PlayerDataManager'
import type { PlayerData } from '../utils/PlayerDataManager'
import { UI } from '../utils/UIComponents'
import { transitionTo } from '../utils/SceneTransition'
import {
  SCREEN, surface, border, fg, accent, state,
  fontFamily, typeScale, radii, motion,
} from '../utils/DesignTokens'

const W = SCREEN.W

const TOP_H = 56
const HERO_Y = 88
const HERO_W = 640
const HERO_H = 180

const STATS_Y = HERO_Y + HERO_H + 24
const STAT_CARD_W = 200
const STAT_CARD_H = 72
const STAT_GAP = 12

const MASTERY_Y = STATS_Y + (STAT_CARD_H + STAT_GAP) * 2 + 12
const MASTERY_W = 640
const MASTERY_H = 140

export default class ProfileScene extends Phaser.Scene {
  private profile!: PlayerData

  constructor() { super('ProfileScene') }

  create() {
    GameStateManager.set(GameState.MENU)
    this.profile = playerData.get()

    UI.background(this)

    this.drawHeader()
    this.drawHeroPanel()
    this.drawStatsGrid()
    this.drawMasteryPanel()
    UI.fadeIn(this)
  }

  // ── Header ────────────────────────────────────────────────────────────────

  private drawHeader() {
    const bar = this.add.graphics()
    bar.fillStyle(surface.panel, 1)
    bar.fillRect(0, 0, W, TOP_H)
    bar.lineStyle(1, border.subtle, 1)
    bar.beginPath()
    bar.moveTo(0, TOP_H - 0.5)
    bar.lineTo(W, TOP_H - 0.5)
    bar.strokePath()

    UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))

    this.add.text(W / 2, TOP_H / 2, 'PERFIL', {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      accent.primaryHex,
      fontStyle:  '600',
    }).setOrigin(0.5).setLetterSpacing(3)
  }

  // ── Hero panel (avatar + name + level + XP) ──────────────────────────────

  private drawHeroPanel() {
    const p = this.profile
    const px = W / 2
    const py = HERO_Y + HERO_H / 2

    // Panel bg
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(px - HERO_W / 2, HERO_Y, HERO_W, HERO_H, radii.xl)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(px - HERO_W / 2, HERO_Y, HERO_W, HERO_H, radii.xl)
    // Top inset highlight
    bg.fillStyle(0xffffff, 0.04)
    bg.fillRoundedRect(px - HERO_W / 2 + 2, HERO_Y + 2, HERO_W - 4, 16,
      { tl: radii.xl, tr: radii.xl, bl: 0, br: 0 })

    // Avatar — big, classy corner
    const avatarR = 44
    const avatarX = px - HERO_W / 2 + 28 + avatarR
    const avatarY = py
    UI.avatarBadge(this, avatarX, avatarY, {
      initial: p.username,
      size:    avatarR * 2,
    })

    // Right side stack: name / level row / XP bar
    const rightX = avatarX + avatarR + 28

    // Username (Cinzel h1)
    this.add.text(rightX, py - 52, p.username, {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h1,
      color:      fg.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5)

    // Tagline
    this.add.text(rightX, py - 22, 'INVOCADOR DO REINO', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    // Level + XP row
    const xpForNext = Math.max(1, p.level * 100)
    const xpRatio = Math.min(1, p.xp / xpForNext)

    this.add.text(rightX, py + 14, `NÍVEL ${p.level}`, {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.6)

    const barW = 320
    const barX = rightX + barW / 2 + 12
    const barY = py + 40
    UI.progressBarV2(this, barX, barY, {
      width:  barW,
      height: 10,
      ratio:  xpRatio,
    })

    this.add.text(rightX + barW + 24, barY, `${p.xp} / ${xpForNext} XP`, {
      fontFamily: fontFamily.mono,
      fontSize:   typeScale.statMd,
      color:      fg.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5)
  }

  // ── Stats grid (3×2) ──────────────────────────────────────────────────────

  private drawStatsGrid() {
    const p = this.profile
    const totalGames = p.wins + p.losses
    const winRate = totalGames > 0 ? ((p.wins / totalGames) * 100).toFixed(1) : '0.0'

    const cols = 3
    const totalW = STAT_CARD_W * cols + STAT_GAP * (cols - 1)
    const startX = (W - totalW) / 2

    const stats: Array<{ label: string; value: string; color: string }> = [
      { label: 'VITÓRIAS',     value: String(p.wins),       color: state.successHex },
      { label: 'DERROTAS',     value: String(p.losses),     color: state.errorHex },
      { label: 'WIN RATE',     value: `${winRate}%`,        color: fg.primaryHex },
      { label: 'GOLD',         value: String(p.gold),       color: accent.primaryHex },
      { label: 'DG',           value: String(p.dg),         color: '#a78bfa' },
      { label: 'PONTOS RANKED', value: String(p.rankPoints), color: state.infoHex },
    ]

    stats.forEach((stat, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = startX + col * (STAT_CARD_W + STAT_GAP) + STAT_CARD_W / 2
      const cy = STATS_Y + row * (STAT_CARD_H + STAT_GAP) + STAT_CARD_H / 2

      const card = this.add.container(cx, cy)
      card.setAlpha(0)

      const g = this.add.graphics()
      g.fillStyle(surface.panel, 1)
      g.fillRoundedRect(-STAT_CARD_W / 2, -STAT_CARD_H / 2, STAT_CARD_W, STAT_CARD_H, radii.lg)
      g.lineStyle(1, border.default, 1)
      g.strokeRoundedRect(-STAT_CARD_W / 2, -STAT_CARD_H / 2, STAT_CARD_W, STAT_CARD_H, radii.lg)
      card.add(g)

      // Label (top)
      const label = this.add.text(0, -STAT_CARD_H / 2 + 16, stat.label, {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      fg.tertiaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.8)
      card.add(label)

      // Value (big Mono)
      const value = this.add.text(0, STAT_CARD_H / 2 - 20, stat.value, {
        fontFamily: fontFamily.mono,
        fontSize:   typeScale.statLg,
        color:      stat.color,
        fontStyle:  '700',
      }).setOrigin(0.5)
      card.add(value)

      // Stagger entry
      this.tweens.add({
        targets:  card,
        alpha:    1,
        duration: 260,
        delay:    140 + i * 70,
        ease:     motion.easeOut,
      })
    })
  }

  // ── Mastery panel ─────────────────────────────────────────────────────────

  private drawMasteryPanel() {
    const p = this.profile
    const px = W / 2
    const panelX = px - MASTERY_W / 2
    const panelY = MASTERY_Y

    // Panel
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(panelX, panelY, MASTERY_W, MASTERY_H, radii.lg)
    bg.lineStyle(1, border.default, 1)
    bg.strokeRoundedRect(panelX, panelY, MASTERY_W, MASTERY_H, radii.lg)
    // Accent top rule
    bg.fillStyle(accent.primary, 0.55)
    bg.fillRect(panelX + 16, panelY, MASTERY_W - 32, 1)

    // Eyebrow label
    this.add.text(panelX + 24, panelY + 18, 'MAESTRIA', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.8)

    const maxMastery = 100
    const labelX = panelX + 24
    const barW = 320
    const barCenterX = panelX + MASTERY_W / 2 - 40
    const valueX = panelX + MASTERY_W - 24
    const atkY = panelY + 58
    const defY = panelY + 100

    this.drawMasteryRow(labelX, barCenterX, valueX, atkY, 'ATAQUE', p.attackMastery, maxMastery, state.error, state.errorHex, barW)
    this.drawMasteryRow(labelX, barCenterX, valueX, defY, 'DEFESA', p.defenseMastery, maxMastery, state.info,  state.infoHex,  barW)
  }

  private drawMasteryRow(
    labelX: number, barX: number, valueX: number, y: number,
    label: string, current: number, max: number,
    fillColor: number, textColor: string, barW: number,
  ) {
    const ratio = Math.min(1, current / max)

    this.add.text(labelX, y, label, {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.small,
      color:      fg.secondaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.4)

    UI.progressBarV2(this, barX, y, {
      width: barW,
      height: 8,
      ratio,
      color: fillColor,
    })

    this.add.text(valueX, y, `${current}/${max}`, {
      fontFamily: fontFamily.mono,
      fontSize:   typeScale.statMd,
      color:      textColor,
      fontStyle:  '700',
    }).setOrigin(1, 0.5)
  }

  shutdown() { this.tweens.killAll() }
}
