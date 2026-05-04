import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import type { RankedTier } from '../data/tournaments'
import { RANKED_TIERS } from '../data/tournaments'
import {
  SCREEN, surface, border, fg, accent, state,
  fontFamily, typeScale, radii, motion,
} from '../utils/DesignTokens'
import { t } from '../i18n'

const W = SCREEN.W
const H = SCREEN.H

// Layout
const TOP_H = 56
const FILTER_Y = 96
const TABLE_TOP = 156
const ROW_H = 44
const TABLE_SIDE_PAD = 40
const HEADER_H = 32
const MAX_ROWS = 10

const COL = { rank: 72, name: 210, elo: 440, atkM: 650, defM: 790, region: 928 }

// ── Mock data ────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number; username: string; level: number; tier: RankedTier
  attackMastery: number; defenseMastery: number; region: string
}

const ALL_PLAYERS: LeaderboardEntry[] = [
  { rank: 1,  username: 'DragonSlayer',   level: 87, tier: 'comandante', attackMastery: 342, defenseMastery: 289, region: 'BR' },
  { rank: 2,  username: 'ShadowKing',     level: 82, tier: 'comandante', attackMastery: 310, defenseMastery: 305, region: 'BR' },
  { rank: 3,  username: 'IronFist',       level: 79, tier: 'veterano',   attackMastery: 298, defenseMastery: 312, region: 'US' },
  { rank: 4,  username: 'BlazeMaster',    level: 75, tier: 'veterano',   attackMastery: 275, defenseMastery: 260, region: 'EU' },
  { rank: 5,  username: 'NightHawk',      level: 73, tier: 'veterano',   attackMastery: 260, defenseMastery: 280, region: 'BR' },
  { rank: 6,  username: 'StormBlade',     level: 70, tier: 'soldado',    attackMastery: 240, defenseMastery: 255, region: 'US' },
  { rank: 7,  username: 'PhoenixRise',    level: 68, tier: 'soldado',    attackMastery: 230, defenseMastery: 245, region: 'EU' },
  { rank: 8,  username: 'VoidWalker',     level: 65, tier: 'soldado',    attackMastery: 215, defenseMastery: 220, region: 'BR' },
  { rank: 9,  username: 'CrimsonKnight',  level: 60, tier: 'aprendiz',   attackMastery: 195, defenseMastery: 200, region: 'US' },
  { rank: 10, username: 'TitanForge',     level: 55, tier: 'aprendiz',   attackMastery: 180, defenseMastery: 185, region: 'EU' },
  { rank: 11, username: 'EagleEye',       level: 50, tier: 'aprendiz',   attackMastery: 160, defenseMastery: 170, region: 'BR' },
  { rank: 12, username: 'SteelWarden',    level: 45, tier: 'recruta',    attackMastery: 140, defenseMastery: 155, region: 'US' },
  { rank: 13, username: 'FrostBite',      level: 40, tier: 'recruta',    attackMastery: 120, defenseMastery: 130, region: 'EU' },
  { rank: 14, username: 'ThunderBolt',    level: 35, tier: 'recruta',    attackMastery: 100, defenseMastery: 110, region: 'BR' },
  { rank: 15, username: 'MysticWolf',     level: 30, tier: 'desconhecido', attackMastery: 80, defenseMastery: 90, region: 'US' },
]

// Medal colors for top 3 (CSS-compliant tokens)
const MEDAL = [accent.primary, 0xcbd5e1, 0xcd7f32] as const
const MEDAL_HEX = [accent.primaryHex, '#cbd5e1', '#cd7f32'] as const

// Region colors — align with state tokens where possible
const REGION_COLOR_HEX: Record<string, string> = {
  BR: state.successHex,
  US: state.infoHex,
  EU: state.warnHex,
}

// ── Scene ────────────────────────────────────────────────────────────────────

type SortKey = 'elo' | 'atk_mastery' | 'def_mastery'
type RegionKey = 'all' | 'BR' | 'US' | 'EU'

export default class RankingScene extends Phaser.Scene {
  private sortKey: SortKey = 'elo'
  private regionFilter: RegionKey = 'all'

  constructor() { super('RankingScene') }

  create(data?: { sortKey?: string; regionFilter?: string }) {
    this.sortKey = (data?.sortKey as SortKey) ?? 'elo'
    this.regionFilter = (data?.regionFilter as RegionKey) ?? 'all'

    UI.background(this)

    this.drawHeader()
    this.drawFilters()
    this.drawTable()
    this.drawPlayerFooter()

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

    this.add.text(W / 2, TOP_H / 2, t('scenes.ranking.title'), {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      accent.primaryHex,
      fontStyle:  '600',
    }).setOrigin(0.5).setLetterSpacing(3)

    this.add.text(W / 2, TOP_H + 10, t('scenes.ranking.subtitle'), {
      fontFamily: fontFamily.serif,
      fontSize:   typeScale.small,
      color:      fg.tertiaryHex,
      fontStyle:  'italic',
    }).setOrigin(0.5)
  }

  // ── Filters ───────────────────────────────────────────────────────────────

  private drawFilters() {
    const sortOptions: Array<{ key: SortKey; label: string }> = [
      { key: 'elo', label: 'ELO' },
      { key: 'atk_mastery', label: 'ATAQUE' },
      { key: 'def_mastery', label: 'DEFESA' },
    ]

    this.add.text(40, FILTER_Y - 16, t('scenes.ranking.sort-label'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.6)

    UI.segmentedControl<SortKey>(this, 40 + 216, FILTER_Y + 4, {
      options: sortOptions,
      value:   this.sortKey,
      width:   360,
      height:  32,
      onChange: (k) => this.scene.restart({ sortKey: k, regionFilter: this.regionFilter }),
    })

    const regionOptions: Array<{ key: RegionKey; label: string }> = [
      { key: 'all', label: 'GLOBAL' },
      { key: 'BR',  label: 'BR' },
      { key: 'US',  label: 'US' },
      { key: 'EU',  label: 'EU' },
    ]

    this.add.text(W - 40, FILTER_Y - 16, t('scenes.ranking.region-label'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(1, 0.5).setLetterSpacing(1.6)

    UI.segmentedControl<RegionKey>(this, W - 40 - 172, FILTER_Y + 4, {
      options: regionOptions,
      value:   this.regionFilter,
      width:   344,
      height:  32,
      onChange: (k) => this.scene.restart({ sortKey: this.sortKey, regionFilter: k }),
    })
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  private drawTable() {
    const tableW = W - TABLE_SIDE_PAD * 2

    // Header row (surface.deepest)
    const hg = this.add.graphics()
    hg.fillStyle(surface.deepest, 1)
    hg.fillRoundedRect(TABLE_SIDE_PAD, TABLE_TOP, tableW, HEADER_H, { tl: radii.lg, tr: radii.lg, bl: 0, br: 0 })
    hg.lineStyle(1, border.default, 1)
    hg.lineBetween(TABLE_SIDE_PAD, TABLE_TOP + HEADER_H, TABLE_SIDE_PAD + tableW, TABLE_TOP + HEADER_H)

    const headerStyle = {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700' as const,
    }
    const hy = TABLE_TOP + HEADER_H / 2

    this.add.text(COL.rank, hy, '#', headerStyle).setOrigin(0.5).setLetterSpacing(1.6)
    this.add.text(COL.name, hy, t('scenes.ranking.table.player'), headerStyle).setOrigin(0, 0.5).setLetterSpacing(1.6)
    this.add.text(COL.elo + 18, hy, t('scenes.ranking.table.elo'), headerStyle).setOrigin(0, 0.5).setLetterSpacing(1.6)
    this.add.text(COL.atkM, hy, t('scenes.ranking.table.atk-mastery'), headerStyle).setOrigin(0.5).setLetterSpacing(1.6)
    this.add.text(COL.defM, hy, t('scenes.ranking.table.def-mastery'), headerStyle).setOrigin(0.5).setLetterSpacing(1.6)
    this.add.text(COL.region, hy, t('scenes.ranking.table.region'), headerStyle).setOrigin(0.5).setLetterSpacing(1.6)

    this.drawRows()
  }

  private drawRows() {
    let players = [...ALL_PLAYERS]

    if (this.regionFilter !== 'all') {
      players = players.filter(p => p.region === this.regionFilter)
    }

    switch (this.sortKey) {
      case 'atk_mastery': players.sort((a, b) => b.attackMastery - a.attackMastery); break
      case 'def_mastery': players.sort((a, b) => b.defenseMastery - a.defenseMastery); break
      default: {
        const tierOrder: RankedTier[] = ['rei', 'comandante', 'veterano', 'soldado', 'aprendiz', 'recruta', 'desconhecido']
        players.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier))
      }
    }

    players.forEach((p, i) => { p.rank = i + 1 })
    const visible = players.slice(0, Math.min(MAX_ROWS, 100))

    const rowsStartY = TABLE_TOP + HEADER_H + 4

    if (visible.length === 0) {
      this.add.text(W / 2, rowsStartY + 80, t('scenes.ranking.no-players'), {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.body,
        color:      fg.disabledHex,
        fontStyle:  'italic',
      }).setOrigin(0.5)
      return
    }

    const tableW = W - TABLE_SIDE_PAD * 2

    visible.forEach((p, i) => {
      const ry = rowsStartY + i * ROW_H
      const isTop3 = p.rank <= 3
      const cellY = ry + (ROW_H - 6) / 2
      const rowFill = i % 2 === 0 ? surface.panel : surface.raised

      const rowG = this.add.graphics()
      rowG.fillStyle(rowFill, 1)
      rowG.fillRoundedRect(TABLE_SIDE_PAD, ry, tableW, ROW_H - 6, radii.md)

      if (isTop3) {
        // Medal left accent bar
        rowG.fillStyle(MEDAL[p.rank - 1], 1)
        rowG.fillRoundedRect(TABLE_SIDE_PAD, ry, 4, ROW_H - 6, { tl: radii.md, bl: radii.md, tr: 0, br: 0 })
        // Subtle medal halo inside row
        rowG.fillStyle(MEDAL[p.rank - 1], 0.06)
        rowG.fillRoundedRect(TABLE_SIDE_PAD, ry, tableW, ROW_H - 6, radii.md)
      }

      // Hover overlay (optional, subtle)
      const hoverG = this.add.graphics().setAlpha(0)
      hoverG.fillStyle(border.default, 0.35)
      hoverG.fillRoundedRect(TABLE_SIDE_PAD, ry, tableW, ROW_H - 6, radii.md)

      const rowHit = this.add.rectangle(W / 2, ry + (ROW_H - 6) / 2, tableW, ROW_H - 6, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true })
      rowHit.on('pointerover', () => hoverG.setAlpha(1))
      rowHit.on('pointerout',  () => hoverG.setAlpha(0))

      // Rank number — top 3 uses medal color, others use fg.primary Mono
      const rankColor = isTop3 ? MEDAL_HEX[p.rank - 1] : fg.primaryHex
      this.add.text(COL.rank, cellY, String(p.rank), {
        fontFamily: fontFamily.mono,
        fontSize:   isTop3 ? typeScale.statLg : typeScale.statMd,
        color:      rankColor,
        fontStyle:  '700',
      }).setOrigin(0.5)

      // Username — Cormorant h3 serif, top 3 gets medal color
      this.add.text(COL.name, cellY, p.username, {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.h3,
        color:      isTop3 ? MEDAL_HEX[p.rank - 1] : fg.primaryHex,
        fontStyle:  '600',
      }).setOrigin(0, 0.5)

      // Elo tier icon + name
      const tierData = RANKED_TIERS[p.tier]
      if (tierData) {
        UI.tierIcon(this, COL.elo, cellY, p.tier, 10)
        this.add.text(COL.elo + 18, cellY, tierData.name, {
          fontFamily: fontFamily.body,
          fontSize:   this.sortKey === 'elo' ? typeScale.body : typeScale.small,
          color:      tierData.colorHex,
          fontStyle:  this.sortKey === 'elo' ? '700' : '500',
        }).setOrigin(0, 0.5)
      }

      // Mastery values — Mono tabular, emphasized when sort column matches
      const atkEm = this.sortKey === 'atk_mastery'
      this.add.text(COL.atkM, cellY, `${p.attackMastery}`, {
        fontFamily: fontFamily.mono,
        fontSize:   atkEm ? typeScale.statLg : typeScale.statMd,
        color:      atkEm ? state.errorHex : fg.secondaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5)

      const defEm = this.sortKey === 'def_mastery'
      this.add.text(COL.defM, cellY, `${p.defenseMastery}`, {
        fontFamily: fontFamily.mono,
        fontSize:   defEm ? typeScale.statLg : typeScale.statMd,
        color:      defEm ? state.infoHex : fg.secondaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5)

      // Region chip
      const regColor = REGION_COLOR_HEX[p.region] ?? fg.tertiaryHex
      this.add.text(COL.region, cellY, p.region, {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      regColor,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.4)
    })
  }

  // ── Player footer (your row, fixed) ───────────────────────────────────────

  private drawPlayerFooter() {
    const p = playerData.get()
    const fh = 52
    const fy = H - fh - 20
    const fw = W - TABLE_SIDE_PAD * 2

    // Pulsating gold accent ring (behind panel)
    const ring = this.add.graphics()
    ring.lineStyle(2, accent.primary, 1)
    ring.strokeRoundedRect(TABLE_SIDE_PAD - 2, fy - 2, fw + 4, fh + 4, radii.lg)

    this.tweens.add({
      targets: ring,
      alpha:   { from: 1, to: 0.4 },
      duration: 1400,
      yoyo:     true,
      repeat:   -1,
      ease:     motion.easeInOut,
    })

    // Panel
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(TABLE_SIDE_PAD, fy, fw, fh, radii.lg)
    bg.lineStyle(1, accent.primary, 1)
    bg.strokeRoundedRect(TABLE_SIDE_PAD, fy, fw, fh, radii.lg)
    // Left accent bar
    bg.fillStyle(accent.primary, 1)
    bg.fillRoundedRect(TABLE_SIDE_PAD, fy, 4, fh, { tl: radii.lg, bl: radii.lg, tr: 0, br: 0 })

    const cellY = fy + fh / 2

    this.add.text(COL.rank, cellY, t('scenes.lobby-shared.your-badge'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.6)

    this.add.text(COL.name, cellY, p.username, {
      fontFamily: fontFamily.serif,
      fontSize:   typeScale.h3,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5)

    const ranked = playerData.getRanked()
    const myTier = ranked['4v4']?.tier ?? 'desconhecido'
    const tierData = RANKED_TIERS[myTier]
    if (tierData) {
      UI.tierIcon(this, COL.elo, cellY, myTier, 10)
      this.add.text(COL.elo + 18, cellY, tierData.name, {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.body,
        color:      tierData.colorHex,
        fontStyle:  '700',
      }).setOrigin(0, 0.5)
    }

    this.add.text(COL.atkM, cellY, `${p.attackMastery}`, {
      fontFamily: fontFamily.mono,
      fontSize:   typeScale.statLg,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5)

    this.add.text(COL.defM, cellY, `${p.defenseMastery}`, {
      fontFamily: fontFamily.mono,
      fontSize:   typeScale.statLg,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5)

    this.add.text(COL.region, cellY, 'BR', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      REGION_COLOR_HEX.BR,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.4)
  }

  shutdown() { this.tweens.killAll() }
}
