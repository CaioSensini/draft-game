import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import { C, F, SHADOW, SCREEN } from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import type { RankedTier } from '../data/tournaments'
import { RANKED_TIERS } from '../data/tournaments'

const W = SCREEN.W
const H = SCREEN.H
const TOP_H = 90
const FILTER_Y = 96
const TABLE_Y = 136
const ROW_H = 44
const MAX_ROWS = 10

const COL = { rank: 55, name: 200, elo: 400, atkM: 600, defM: 750, region: 920 }

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

// ── Scene ────────────────────────────────────────────────────────────────────

export default class RankingScene extends Phaser.Scene {
  private sortKey: 'elo' | 'atk_mastery' | 'def_mastery' = 'elo'
  private regionFilter: 'all' | 'BR' | 'US' | 'EU' = 'all'
  private tableGroup: Phaser.GameObjects.GameObject[] = []

  constructor() { super('RankingScene') }

  create(data?: { sortKey?: string; regionFilter?: string }) {
    this.sortKey = (data?.sortKey as typeof this.sortKey) ?? 'elo'
    this.regionFilter = (data?.regionFilter as typeof this.regionFilter) ?? 'all'
    this.tableGroup = []

    UI.background(this)
    UI.particles(this, 10)

    this.drawHeader()
    this.drawFilters()
    this.drawTable()
    this.drawPlayerFooter()

    UI.fadeIn(this)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════

  private drawHeader() {
    const bg = this.add.graphics()
    bg.fillStyle(0x0a0f18, 0.97)
    bg.fillRect(0, 0, W, TOP_H)
    for (let i = 0; i < W; i++) {
      const d = Math.abs(i - W / 2) / (W / 2)
      bg.fillStyle(C.goldDim, 0.15 * (1 - d * d))
      bg.fillRect(i, TOP_H - 1, 1, 1)
    }

    UI.backArrow(this, () => transitionTo(this, 'LobbyScene'))

    this.add.text(W / 2, 30, 'RANKING GLOBAL', {
      fontFamily: F.title, fontSize: '26px', color: C.goldHex, fontStyle: 'bold',
      shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)

    UI.shimmer(this, W / 2, 30, 280, 30, 6000).setDepth(5)

    this.add.text(W / 2, 58, 'Os melhores jogadores do mundo', {
      fontFamily: F.body, fontSize: '12px', color: C.mutedHex, shadow: SHADOW.text,
    }).setOrigin(0.5)

    // Gold divider
    const divG = this.add.graphics()
    for (let i = 0; i < 260; i++) {
      const t = 1 - Math.abs(i - 130) / 130
      divG.fillStyle(C.goldDim, 0.3 * t)
      divG.fillRect(W / 2 - 130 + i, 74, 1, 1)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTERS
  // ═══════════════════════════════════════════════════════════════════════════

  private drawFilters() {
    const sorts: { key: 'elo' | 'atk_mastery' | 'def_mastery'; label: string }[] = [
      { key: 'elo', label: 'Elo' },
      { key: 'atk_mastery', label: 'M. Ataque' },
      { key: 'def_mastery', label: 'M. Defesa' },
    ]

    const sortStartX = 60
    sorts.forEach((s, i) => {
      const bx = sortStartX + i * 118
      const active = s.key === this.sortKey

      const g = this.add.graphics()
      if (active) {
        g.fillStyle(0x000000, 0.2)
        g.fillRoundedRect(bx + 1, FILTER_Y + 2, 108, 30, 8)
      }
      g.fillStyle(active ? 0x1a1a0e : 0x0e1420, active ? 1 : 0.8)
      g.fillRoundedRect(bx, FILTER_Y, 108, 30, 8)
      if (active) {
        g.fillStyle(0xffffff, 0.03)
        g.fillRoundedRect(bx + 2, FILTER_Y + 2, 104, 10, { tl: 6, tr: 6, bl: 0, br: 0 })
      }
      g.lineStyle(1, active ? C.gold : C.panelBorder, active ? 0.7 : 0.2)
      g.strokeRoundedRect(bx, FILTER_Y, 108, 30, 8)

      this.add.text(bx + 54, FILTER_Y + 15, s.label, {
        fontFamily: F.title, fontSize: '11px', color: active ? C.goldHex : '#666666',
        fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5)

      const hit = this.add.rectangle(bx + 54, FILTER_Y + 15, 108, 30, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => { this.scene.restart({ sortKey: s.key, regionFilter: this.regionFilter }) })
    })

    // Region filters
    const regions: { key: 'all' | 'BR' | 'US' | 'EU'; label: string; color: number }[] = [
      { key: 'all', label: 'Global', color: C.gold },
      { key: 'BR', label: 'BR', color: 0x22cc44 },
      { key: 'US', label: 'US', color: 0x4488ff },
      { key: 'EU', label: 'EU', color: 0xcc8822 },
    ]

    this.add.text(W - 340, FILTER_Y + 15, 'Regiao:', {
      fontFamily: F.body, fontSize: '10px', color: '#666666', fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0, 0.5)

    regions.forEach((r, i) => {
      const rx = W - 280 + i * 66
      const active = r.key === this.regionFilter
      const colorHex = '#' + r.color.toString(16).padStart(6, '0')

      const rg = this.add.graphics()
      rg.fillStyle(active ? 0x1a2a3a : 0x0e1420, active ? 1 : 0.7)
      rg.fillRoundedRect(rx, FILTER_Y + 3, 56, 24, 6)
      rg.lineStyle(1, active ? r.color : C.panelBorder, active ? 0.6 : 0.15)
      rg.strokeRoundedRect(rx, FILTER_Y + 3, 56, 24, 6)

      this.add.text(rx + 28, FILTER_Y + 15, r.label, {
        fontFamily: F.body, fontSize: '11px', color: active ? colorHex : '#555555',
        fontStyle: active ? 'bold' : 'normal', shadow: SHADOW.text,
      }).setOrigin(0.5)

      const hit = this.add.rectangle(rx + 28, FILTER_Y + 15, 56, 24, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => { this.scene.restart({ sortKey: this.sortKey, regionFilter: r.key }) })
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE
  // ═══════════════════════════════════════════════════════════════════════════

  private drawTable() {
    const headerY = TABLE_Y - 18
    const hg = this.add.graphics()
    hg.fillStyle(0x080c14, 0.85)
    hg.fillRoundedRect(30, headerY, W - 60, 26, { tl: 8, tr: 8, bl: 0, br: 0 })
    hg.lineStyle(1, C.goldDim, 0.12)
    hg.lineBetween(30, headerY + 26, W - 30, headerY + 26)

    const hcy = headerY + 13
    const hs = { fontFamily: F.body, fontSize: '10px', fontStyle: 'bold' as const, shadow: SHADOW.text }
    this.add.text(COL.rank, hcy, '#', { ...hs, color: C.goldDimHex }).setOrigin(0.5)
    this.add.text(COL.name, hcy, 'JOGADOR', { ...hs, color: C.goldDimHex }).setOrigin(0, 0.5)
    this.add.text(COL.elo + 16, hcy, 'ELO', { ...hs, color: C.goldDimHex }).setOrigin(0, 0.5)
    this.add.text(COL.atkM, hcy, 'M. ATAQUE', { ...hs, color: '#cc6666' }).setOrigin(0.5)
    this.add.text(COL.defM, hcy, 'M. DEFESA', { ...hs, color: '#6688cc' }).setOrigin(0.5)
    this.add.text(COL.region, hcy, 'REGIAO', { ...hs, color: C.goldDimHex }).setOrigin(0.5)

    this.drawRows()
  }

  private drawRows() {
    this.tableGroup.forEach(o => o.destroy())
    this.tableGroup = []

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

    if (visible.length === 0) {
      this.tableGroup.push(this.add.text(W / 2, TABLE_Y + 80, 'Nenhum jogador encontrado', {
        fontFamily: F.body, fontSize: '14px', color: '#555555', shadow: SHADOW.text,
      }).setOrigin(0.5))
      return
    }

    visible.forEach((p, i) => {
      const ry = TABLE_Y + i * ROW_H
      const isTop3 = p.rank <= 3
      const medalColors = [C.gold, 0xc0c0c0, 0xcd7f32]
      const rankHexes = ['#f0c850', '#c0c0c0', '#cd7f32']

      // Row background
      const rowG = this.add.graphics()
      if (isTop3) {
        rowG.fillStyle(0x000000, 0.15)
        rowG.fillRoundedRect(31, ry + 2, W - 62, ROW_H - 4, 6)
      }
      rowG.fillStyle(i % 2 === 0 ? 0x0e1420 : 0x0a0e18, isTop3 ? 0.7 : 0.5)
      rowG.fillRoundedRect(30, ry, W - 60, ROW_H - 4, 6)
      this.tableGroup.push(rowG)

      // Medal glow + accent bar
      if (isTop3) {
        const mg = this.add.graphics()
        mg.fillStyle(medalColors[p.rank - 1], 0.06)
        mg.fillRoundedRect(30, ry, W - 60, ROW_H - 4, 6)
        mg.fillStyle(medalColors[p.rank - 1], 0.5)
        mg.fillRoundedRect(30, ry + 2, 4, ROW_H - 8, { tl: 6, bl: 6, tr: 0, br: 0 })
        this.tableGroup.push(mg)
      }

      // Hover
      const hoverG = this.add.graphics().setAlpha(0)
      hoverG.fillStyle(0x1a2a3a, 0.4)
      hoverG.fillRoundedRect(30, ry, W - 60, ROW_H - 4, 6)
      this.tableGroup.push(hoverG)

      const rowHit = this.add.rectangle(W / 2, ry + (ROW_H - 4) / 2, W - 60, ROW_H - 4, 0, 0.001)
        .setInteractive({ useHandCursor: true })
      this.tableGroup.push(rowHit)
      rowHit.on('pointerover', () => hoverG.setAlpha(1))
      rowHit.on('pointerout', () => hoverG.setAlpha(0))

      const textColor = isTop3 ? rankHexes[p.rank - 1] : C.bodyHex
      const fontSize = isTop3 ? '15px' : '13px'
      const cellY = ry + (ROW_H - 4) / 2

      // Rank
      const rankLabel = p.rank <= 3 ? ['I', 'II', 'III'][p.rank - 1] : `${p.rank}`
      this.tableGroup.push(this.add.text(COL.rank, cellY, rankLabel, {
        fontFamily: F.title, fontSize, color: textColor, fontStyle: 'bold',
        shadow: isTop3 ? SHADOW.goldGlow : SHADOW.text,
      }).setOrigin(0.5))

      // Username
      this.tableGroup.push(this.add.text(COL.name, cellY, p.username, {
        fontFamily: F.title, fontSize, color: textColor, fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0, 0.5))

      // Elo tier
      const tierData = RANKED_TIERS[p.tier]
      if (tierData) {
        this.tableGroup.push(UI.tierIcon(this, COL.elo, cellY, p.tier, 10))
        this.tableGroup.push(this.add.text(COL.elo + 16, cellY, tierData.name, {
          fontFamily: F.body, fontSize: this.sortKey === 'elo' ? '13px' : '11px',
          color: tierData.colorHex, fontStyle: this.sortKey === 'elo' ? 'bold' : 'normal',
          shadow: SHADOW.text,
        }).setOrigin(0, 0.5))
      }

      // ATK mastery
      const atkEm = this.sortKey === 'atk_mastery'
      this.tableGroup.push(this.add.text(COL.atkM, cellY, `${p.attackMastery}`, {
        fontFamily: atkEm ? F.title : F.body, fontSize: atkEm ? '14px' : '12px',
        color: '#cc6666', fontStyle: atkEm ? 'bold' : 'normal', shadow: SHADOW.text,
      }).setOrigin(0.5))

      // DEF mastery
      const defEm = this.sortKey === 'def_mastery'
      this.tableGroup.push(this.add.text(COL.defM, cellY, `${p.defenseMastery}`, {
        fontFamily: defEm ? F.title : F.body, fontSize: defEm ? '14px' : '12px',
        color: '#6688cc', fontStyle: defEm ? 'bold' : 'normal', shadow: SHADOW.text,
      }).setOrigin(0.5))

      // Region
      const regColors: Record<string, string> = { BR: '#22cc44', US: '#4488ff', EU: '#cc8822' }
      this.tableGroup.push(this.add.text(COL.region, cellY, p.region, {
        fontFamily: F.body, fontSize: '11px', color: regColors[p.region] ?? '#888888',
        fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5))
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYER FOOTER
  // ═══════════════════════════════════════════════════════════════════════════

  private drawPlayerFooter() {
    const p = playerData.get()
    const fy = H - 60
    const fw = W - 60
    const fh = 46

    const footerG = this.add.graphics()
    footerG.fillStyle(0x000000, 0.3)
    footerG.fillRoundedRect(31, fy + 3, fw, fh, 8)
    footerG.fillStyle(0x0e1420, 0.95)
    footerG.fillRoundedRect(30, fy, fw, fh, 8)
    footerG.fillStyle(0xffffff, 0.02)
    footerG.fillRoundedRect(32, fy + 2, fw - 4, 14, { tl: 6, tr: 6, bl: 0, br: 0 })
    footerG.lineStyle(1.5, C.gold, 0.35)
    footerG.strokeRoundedRect(30, fy, fw, fh, 8)
    footerG.fillStyle(C.gold, 0.5)
    footerG.fillRoundedRect(30, fy + 4, 4, fh - 8, { tl: 8, bl: 8, tr: 0, br: 0 })

    const cellY = fy + fh / 2

    this.add.text(COL.rank, cellY, 'VOCE', {
      fontFamily: F.title, fontSize: '10px', color: C.goldHex, fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)

    this.add.text(COL.name, cellY, p.username, {
      fontFamily: F.title, fontSize: '14px', color: C.goldHex, fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0, 0.5)

    const ranked = playerData.getRanked()
    const myTier = ranked['4v4']?.tier ?? 'desconhecido'
    const tierData = RANKED_TIERS[myTier]
    if (tierData) {
      UI.tierIcon(this, COL.elo, cellY, myTier, 10)
      this.add.text(COL.elo + 16, cellY, tierData.name, {
        fontFamily: F.body, fontSize: '12px', color: tierData.colorHex, fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0, 0.5)
    }

    this.add.text(COL.atkM, cellY, `${p.attackMastery}`, {
      fontFamily: F.title, fontSize: '13px', color: C.goldHex, fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)

    this.add.text(COL.defM, cellY, `${p.defenseMastery}`, {
      fontFamily: F.title, fontSize: '13px', color: C.goldHex, fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)
  }

  shutdown() { this.tweens.killAll() }
}
