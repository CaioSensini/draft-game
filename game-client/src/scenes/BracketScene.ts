/**
 * BracketScene.ts — Professional tournament bracket visualization.
 *
 * Displays an 8-team single-elimination bracket:
 *   Quartas (4 matches) -> Semifinal (2) -> Final (1) -> Campeao
 *
 * Flow:
 *   1. Reveal animation (bracket draws left to right, 200ms per column)
 *   2. Simulate non-player matches (random 50/50, 1.5s each)
 *   3. When player match arrives -> show JOGAR button
 *   4. Player clicks JOGAR -> transitionTo BattleScene
 *   5. After final -> champion celebration with rewards
 */

import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'
import {
  SCREEN, surface, border, fg, accent, state, currency,
  fontFamily, typeScale, radii,
} from '../utils/DesignTokens'

const W = SCREEN.W
const H = SCREEN.H

// ── Types ───────────────────────────────────────────────────────────────────

interface BracketData {
  type: 'pve' | 'ranked'
  bracketLevel?: number
  teamCount?: number  // 4 or 8
  returning?: boolean
  playerWon?: boolean
}

interface TeamInfo {
  name: string
  isPlayer: boolean
  eliminated: boolean
}

interface MatchInfo {
  round: number
  slot: number
  team1: number
  team2: number
  winner: number | null
  played: boolean
}

// ── Constants ───────────────────────────────────────────────────────────────

const NPC_NAMES = [
  'Guarda Real', 'Mercenários', 'Ordem Sombria', 'Cavaleiros',
  'Legião Imperial', 'Esquadrão Elite', 'Defensores', 'Arautos',
]

const CARD_W = 170
const CARD_H = 32
const CARD_GAP = 8
const ROUND_GAP_X = 190

const ROUND_LABELS = ['QUARTAS', 'SEMIFINAL', 'FINAL', 'CAMPEÃO']

const SPECTATE_LINES = [
  '{A} ataca com Bola de Fogo…',
  '{B} defende com Escudo Mágico…',
  '{A} lança Flecha Congelante…',
  '{B} contra-ataca com Investida…',
  '{A} usa Cura Divina…',
  '{B} invoca Tempestade Arcana…',
  '{A} prepara Golpe Devastador…',
  '{B} ativa Barreira de Vento…',
  '{A} desfere ataque crítico!',
  '{B} tenta esquivar mas falha…',
]

// ── Persisted bracket state (survives scene restart) ────────────────────────

interface SavedBracketState {
  teams: TeamInfo[]
  matches: MatchInfo[]
  currentRound: number
  pendingMatchIndex: number
  bracketData: BracketData
}
let _savedBracket: SavedBracketState | null = null

// ── Scene ───────────────────────────────────────────────────────────────────

export default class BracketScene extends Phaser.Scene {
  // State
  private teams: TeamInfo[] = []
  private matches: MatchInfo[] = []
  private currentRound = 0
  private phase: 'reveal' | 'simulating' | 'your_turn' | 'spectating' | 'complete' = 'reveal'
  private bracketData!: BracketData
  private _pendingMatchIndex = 0
  private _goldDeducted = false

  // UI containers
  private matchContainers: Map<string, Phaser.GameObjects.Container> = new Map()
  private lineGraphics!: Phaser.GameObjects.Graphics
  private bottomBarContainer!: Phaser.GameObjects.Container
  private spectateOverlay: Phaser.GameObjects.Container | null = null
  private championContainer: Phaser.GameObjects.Container | null = null
  private headerLabelObjs: Phaser.GameObjects.Text[] = []

  // Layout
  private baseX = 0
  private baseY = 0

  constructor() { super('BracketScene') }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  init(data?: BracketData): void {
    this.bracketData = data ?? { type: 'pve' }
  }

  create(): void {
    this.matchContainers = new Map()
    this.spectateOverlay = null
    this.championContainer = null
    this.headerLabelObjs = []
    this.phase = 'reveal'

    UI.background(this)

    const totalRounds = 3
    const totalW = totalRounds * ROUND_GAP_X + CARD_W
    this.baseX = (W - totalW) / 2
    this.baseY = 110

    if (this.bracketData.returning && _savedBracket) {
      this.teams = _savedBracket.teams
      this.matches = _savedBracket.matches
      this.currentRound = _savedBracket.currentRound
      this._pendingMatchIndex = _savedBracket.pendingMatchIndex
      this._goldDeducted = true

      this.drawHeader()
      this.lineGraphics = this.add.graphics().setDepth(1)
      this.bottomBarContainer = this.add.container(0, 0).setDepth(10)

      for (const m of this.matches) {
        if (m.team1 >= 0 || m.team2 >= 0) this.drawMatchCard(m)
      }
      this.drawConnectingLines()

      // Reveal headers instantly on return
      this.headerLabelObjs.forEach(h => h.setAlpha(1))

      const playerWon = this.bracketData.playerWon ?? false
      this._handleBattleReturn(playerWon)
      _savedBracket = null
    } else {
      this.currentRound = 0
      this._goldDeducted = false
      this.initBracket()
      this.drawHeader()
      this.lineGraphics = this.add.graphics().setDepth(1)
      this.bottomBarContainer = this.add.container(0, 0).setDepth(10)

      const cost = this._getEntryCost()
      if (cost > 0 && playerData.get().gold >= cost) {
        playerData.spendGold(cost)
        this._goldDeducted = true
      }

      this.revealBracket()
    }

    UI.fadeIn(this)
  }

  // ── Bracket init ──────────────────────────────────────────────────────────

  private initBracket(): void {
    const playerName = playerData.get().username || 'Jogador'
    const shuffled = Phaser.Utils.Array.Shuffle([...NPC_NAMES]).slice(0, 7)

    const playerSlot = Phaser.Math.Between(0, 7)
    const allNames: string[] = []
    let npcIdx = 0
    for (let i = 0; i < 8; i++) {
      if (i === playerSlot) {
        allNames.push(playerName)
      } else {
        allNames.push(shuffled[npcIdx++])
      }
    }

    this.teams = allNames.map((name, i) => ({
      name,
      isPlayer: i === playerSlot,
      eliminated: false,
    }))

    this.matches = []
    for (let s = 0; s < 4; s++) {
      this.matches.push({ round: 0, slot: s, team1: s * 2, team2: s * 2 + 1, winner: null, played: false })
    }
    for (let s = 0; s < 2; s++) {
      this.matches.push({ round: 1, slot: s, team1: -1, team2: -1, winner: null, played: false })
    }
    this.matches.push({ round: 2, slot: 0, team1: -1, team2: -1, winner: null, played: false })
  }

  // ── Header ────────────────────────────────────────────────────────────────

  private drawHeader(): void {
    const TOP_H = 56
    const bar = this.add.graphics()
    bar.fillStyle(surface.panel, 1)
    bar.fillRect(0, 0, W, TOP_H)
    bar.lineStyle(1, border.subtle, 1)
    bar.beginPath()
    bar.moveTo(0, TOP_H - 0.5)
    bar.lineTo(W, TOP_H - 0.5)
    bar.strokePath()

    UI.backArrow(this, () => {
      _savedBracket = null
      transitionTo(this, 'PvELobbyScene', { pveType: 'tournament' })
    })

    // Eyebrow + title
    const eyebrow = this.bracketData.type === 'ranked' ? 'TORNEIO RANKED' : 'TORNEIO PVE'
    this.add.text(W / 2, TOP_H / 2 - 10, eyebrow, {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8)

    const levelText = this.bracketData.bracketLevel
      ? `Lv.${this.bracketData.bracketLevel}`
      : 'CHAVEAMENTO'
    this.add.text(W / 2, TOP_H / 2 + 10, levelText, {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '600',
    }).setOrigin(0.5).setLetterSpacing(3)

    // Column headers (fade in on reveal)
    for (let r = 0; r < ROUND_LABELS.length; r++) {
      const colX = this.getColumnX(Math.min(r, 3))
      const lbl = this.add.text(colX, 88, ROUND_LABELS[r], {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      fg.tertiaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.8).setAlpha(0)
      this.headerLabelObjs.push(lbl)
    }
  }

  // ── Layout helpers ────────────────────────────────────────────────────────

  private getColumnX(round: number): number {
    return this.baseX + CARD_W / 2 + round * ROUND_GAP_X
  }

  private getMatchY(round: number, slot: number): number {
    const areaTop = this.baseY + 20
    const areaH = H - areaTop - 120

    if (round === 0) {
      const matchBlockH = CARD_H * 2 + CARD_GAP
      const totalH = 4 * matchBlockH + 3 * 30
      const startY = areaTop + (areaH - totalH) / 2
      return startY + slot * (matchBlockH + 30) + matchBlockH / 2
    }
    if (round === 1) {
      const y0 = this.getMatchY(0, slot * 2)
      const y1 = this.getMatchY(0, slot * 2 + 1)
      return (y0 + y1) / 2
    }
    const y0 = this.getMatchY(1, 0)
    const y1 = this.getMatchY(1, 1)
    return (y0 + y1) / 2
  }

  // ── Reveal animation ──────────────────────────────────────────────────────

  private revealBracket(): void {
    this.headerLabelObjs.forEach((h, i) => {
      this.tweens.add({
        targets: h, alpha: 1, duration: 300,
        delay: i * 200,
      })
    })

    for (let r = 0; r <= 2; r++) {
      const roundMatches = this.matches.filter(m => m.round === r)
      roundMatches.forEach((match, idx) => {
        this.time.delayedCall(r * 200 + idx * 80, () => {
          this.drawMatchCard(match)
        })
      })
    }

    const totalRevealTime = 2 * 200 + 200
    this.time.delayedCall(totalRevealTime + 400, () => {
      this.startRound(0)
    })
  }

  // ── Match card drawing ────────────────────────────────────────────────────

  private matchKey(round: number, slot: number): string {
    return `${round}-${slot}`
  }

  private drawMatchCard(match: MatchInfo): void {
    const key = this.matchKey(match.round, match.slot)
    const old = this.matchContainers.get(key)
    if (old) old.destroy()

    const cx = this.getColumnX(match.round)
    const my = this.getMatchY(match.round, match.slot)

    const container = this.add.container(cx, my).setDepth(2)
    container.setAlpha(0)

    this.drawTeamCard(container, match, true)
    this.drawTeamCard(container, match, false)

    this.tweens.add({
      targets: container, alpha: 1, duration: 250, ease: 'Quad.Out',
    })

    this.matchContainers.set(key, container)
    this.drawConnectingLines()
  }

  private drawTeamCard(
    parent: Phaser.GameObjects.Container,
    match: MatchInfo,
    isTop: boolean,
  ): void {
    const teamIdx = isTop ? match.team1 : match.team2
    const team = teamIdx >= 0 ? this.teams[teamIdx] : null
    const localY = isTop ? -(CARD_H / 2 + CARD_GAP / 2) : (CARD_H / 2 + CARD_GAP / 2)

    const g = this.add.graphics()

    const isWinner = match.played && match.winner === teamIdx && teamIdx >= 0
    const isLoser  = match.played && match.winner !== teamIdx && match.winner !== null && teamIdx >= 0
    const isPending = !match.played && teamIdx >= 0
    const isPlayer = team?.isPlayer ?? false
    const isEmpty  = teamIdx < 0

    // Card fill
    const fillColor = isLoser ? surface.deepest : surface.panel
    g.fillStyle(fillColor, 1)
    g.fillRoundedRect(-CARD_W / 2, localY - CARD_H / 2, CARD_W, CARD_H, radii.md)

    // Border color per state
    let borderColor: number = border.default
    let borderAlpha = 0.8
    if (isPlayer && !isLoser) {
      borderColor = accent.primary
      borderAlpha = 1
    } else if (isWinner) {
      borderColor = state.success
      borderAlpha = 1
    } else if (isLoser) {
      borderColor = state.error
      borderAlpha = 0.45
    } else if (isPending) {
      borderColor = border.strong
      borderAlpha = 0.7
    }

    g.lineStyle(1, borderColor, borderAlpha)
    g.strokeRoundedRect(-CARD_W / 2, localY - CARD_H / 2, CARD_W, CARD_H, radii.md)

    // Player gold left accent bar
    if (isPlayer && !isLoser) {
      g.fillStyle(accent.primary, 1)
      g.fillRoundedRect(-CARD_W / 2 + 2, localY - CARD_H / 2 + 4, 3, CARD_H - 8, 1)
    }

    parent.add(g)

    if (team) {
      const nameColor: string = isLoser
        ? fg.disabledHex
        : isPlayer
          ? accent.primaryHex
          : isWinner
            ? state.successHex
            : fg.primaryHex

      const nameX = isPlayer ? -CARD_W / 2 + 14 : -CARD_W / 2 + 10
      const nameText = this.add.text(nameX, localY, team.name, {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.small,
        color:      nameColor,
        fontStyle:  isPlayer ? '700' : '500',
      }).setOrigin(0, 0.5)

      if (isLoser) nameText.setAlpha(0.4)
      parent.add(nameText)

      // Status indicator
      let indicator = ''
      let indicatorColor: string = fg.tertiaryHex
      if (isWinner) { indicator = '✓'; indicatorColor = state.successHex }
      else if (isLoser) { indicator = '✕'; indicatorColor = state.errorHex }
      else if (isPending) { indicator = '•'; indicatorColor = fg.tertiaryHex }

      if (indicator) {
        const indText = this.add.text(CARD_W / 2 - 12, localY, indicator, {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.body,
          color:      indicatorColor,
          fontStyle:  '700',
        }).setOrigin(0.5)

        if (isLoser) indText.setAlpha(0.4)
        parent.add(indText)
      }
    } else if (isEmpty) {
      const emptyText = this.add.text(0, localY, '— A DEFINIR —', {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      fg.disabledHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.4)
      parent.add(emptyText)
    }
  }

  // ── Connecting lines ──────────────────────────────────────────────────────

  private drawConnectingLines(): void {
    this.lineGraphics.clear()

    for (const match of this.matches) {
      if (match.round === 0) continue

      const prevRound = match.round - 1
      const feederSlot1 = match.slot * 2
      const feederSlot2 = match.slot * 2 + 1

      const feeder1 = this.matches.find(m => m.round === prevRound && m.slot === feederSlot1)
      const feeder2 = this.matches.find(m => m.round === prevRound && m.slot === feederSlot2)

      if (!feeder1 || !feeder2) continue

      const fromX = this.getColumnX(prevRound) + CARD_W / 2 + 4
      const toX   = this.getColumnX(match.round) - CARD_W / 2 - 4
      const midX  = (fromX + toX) / 2

      const y1 = this.getMatchY(prevRound, feederSlot1)
      const y2 = this.getMatchY(prevRound, feederSlot2)
      const targetY = this.getMatchY(match.round, match.slot)

      // Top feeder
      if (feeder1.played && feeder1.winner !== null) {
        const wt = this.teams[feeder1.winner]
        if (wt?.isPlayer) this.lineGraphics.lineStyle(2, accent.primary, 0.9)
        else this.lineGraphics.lineStyle(1.5, border.strong, 0.6)
      } else {
        this.lineGraphics.lineStyle(1.5, border.default, 0.4)
      }
      this.lineGraphics.beginPath()
      this.lineGraphics.moveTo(fromX, y1)
      this.lineGraphics.lineTo(midX, y1)
      this.lineGraphics.lineTo(midX, targetY)
      this.lineGraphics.lineTo(toX, targetY)
      this.lineGraphics.strokePath()

      // Bottom feeder
      if (feeder2.played && feeder2.winner !== null) {
        const wt = this.teams[feeder2.winner]
        if (wt?.isPlayer) this.lineGraphics.lineStyle(2, accent.primary, 0.9)
        else this.lineGraphics.lineStyle(1.5, border.strong, 0.6)
      } else {
        this.lineGraphics.lineStyle(1.5, border.default, 0.4)
      }
      this.lineGraphics.beginPath()
      this.lineGraphics.moveTo(fromX, y2)
      this.lineGraphics.lineTo(midX, y2)
      this.lineGraphics.lineTo(midX, targetY)
      this.lineGraphics.lineTo(toX, targetY)
      this.lineGraphics.strokePath()
    }
  }

  // ── Round simulation ──────────────────────────────────────────────────────

  private startRound(round: number): void {
    this.currentRound = round
    const roundMatches = this.matches.filter(m => m.round === round && !m.played)

    if (roundMatches.length === 0) {
      this.phase = 'complete'
      this.showChampion()
      return
    }

    this.simulateRoundSequential(roundMatches, 0)
  }

  private simulateRoundSequential(roundMatches: MatchInfo[], index: number): void {
    if (index >= roundMatches.length) {
      this.advanceWinnersToNextRound()
      this.time.delayedCall(800, () => {
        this.startRound(this.currentRound + 1)
      })
      return
    }

    const match = roundMatches[index]
    const t1 = match.team1 >= 0 ? this.teams[match.team1] : null
    const t2 = match.team2 >= 0 ? this.teams[match.team2] : null
    const isPlayerMatch = (t1?.isPlayer || t2?.isPlayer) ?? false

    if (isPlayerMatch) {
      this.phase = 'your_turn'
      this._pendingMatchIndex = index
      this.updateBottomBar(match, () => {
        _savedBracket = {
          teams: [...this.teams],
          matches: this.matches.map(m => ({ ...m })),
          currentRound: this.currentRound,
          pendingMatchIndex: index,
          bracketData: { ...this.bracketData },
        }

        const opponentName = match.team1 >= 0 && !this.teams[match.team1].isPlayer
          ? this.teams[match.team1].name
          : match.team2 >= 0 ? this.teams[match.team2].name : 'Bot'
        const bracketLevel = this.bracketData.bracketLevel ?? playerData.getLevel()

        transitionTo(this, 'BattleScene', {
          deckConfig: playerData.getDeckConfig(),
          skinConfig: playerData.getSkinConfig(),
          pveMode: 'tournament',
          npcTeam: {
            name: opponentName,
            levelMin: bracketLevel,
            levelMax: bracketLevel,
            goldReward: 0,
            xpReward: 0,
          },
          botLevel: bracketLevel,
          difficulty: 'normal',
          tournamentReturn: true,
          bracketData: this.bracketData,
        }, 400, 'wipeRight')
      })
    } else {
      this.phase = 'simulating'
      this.updateBottomBar(match)

      this.time.delayedCall(1500, () => {
        const winner = Math.random() < 0.5 ? match.team1 : match.team2
        this.resolveMatch(match, winner)

        this.time.delayedCall(500, () => {
          this.simulateRoundSequential(roundMatches, index + 1)
        })
      })
    }
  }

  private resolveMatch(match: MatchInfo, winnerIdx: number): void {
    match.winner = winnerIdx
    match.played = true

    const loserIdx = match.team1 === winnerIdx ? match.team2 : match.team1
    if (loserIdx >= 0) this.teams[loserIdx].eliminated = true

    this.drawMatchCard(match)
  }

  private advanceWinnersToNextRound(): void {
    const nextRound = this.currentRound + 1
    const nextMatches = this.matches.filter(m => m.round === nextRound)
    const prevMatches = this.matches.filter(m => m.round === this.currentRound)

    for (const nm of nextMatches) {
      const feeder1 = prevMatches[nm.slot * 2]
      const feeder2 = prevMatches[nm.slot * 2 + 1]

      if (feeder1?.winner !== null && feeder1?.winner !== undefined) {
        nm.team1 = feeder1.winner
      }
      if (feeder2?.winner !== null && feeder2?.winner !== undefined) {
        nm.team2 = feeder2.winner
      }

      this.drawMatchCard(nm)
    }
  }

  // ── Bottom bar ────────────────────────────────────────────────────────────

  private updateBottomBar(match?: MatchInfo, onPlayPress?: () => void): void {
    this.bottomBarContainer.removeAll(true)

    const barY = H - 52
    const barH = 64
    const barBg = this.add.graphics()
    barBg.fillStyle(surface.panel, 1)
    barBg.fillRect(0, barY - barH / 2, W, barH)
    barBg.lineStyle(1, border.subtle, 1)
    barBg.lineBetween(0, barY - barH / 2, W, barY - barH / 2)
    this.bottomBarContainer.add(barBg)

    if (this.phase === 'simulating' && match) {
      const t1Name = match.team1 >= 0 ? this.teams[match.team1].name : '?'
      const t2Name = match.team2 >= 0 ? this.teams[match.team2].name : '?'

      const simText = this.add.text(W / 2 - 120, barY, `Simulando: ${t1Name} vs ${t2Name}…`, {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.body,
        color:      fg.secondaryHex,
        fontStyle:  'italic',
      }).setOrigin(0.5)
      this.bottomBarContainer.add(simText)

      const { container: specBtn } = UI.buttonSecondary(this, W / 2 + 140, barY, 'ASSISTIR', {
        w: 140, h: 34,
        onPress: () => this.showSpectateOverlay(match),
      })
      this.bottomBarContainer.add(specBtn)

    } else if (this.phase === 'your_turn' && match) {
      const opponent = match.team1 >= 0 && !this.teams[match.team1].isPlayer
        ? this.teams[match.team1].name
        : match.team2 >= 0 ? this.teams[match.team2].name : '?'

      const vsText = this.add.text(W / 2 - 140, barY, `SUA VEZ · vs ${opponent}`, {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.small,
        color:      fg.primaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setLetterSpacing(1.4)
      this.bottomBarContainer.add(vsText)

      const { container: playBtn } = UI.buttonPrimary(this, W / 2 + 140, barY, 'JOGAR', {
        w: 180, h: 40,
        onPress: () => {
          if (onPlayPress) onPlayPress()
        },
      })
      this.bottomBarContainer.add(playBtn)

      this.tweens.add({
        targets: playBtn,
        scaleX: 1.05, scaleY: 1.05,
        duration: 600, yoyo: true, repeat: -1,
        ease: 'Sine.InOut',
      })

    } else if (this.phase === 'complete') {
      const { container: resultBtn } = UI.buttonPrimary(this, W / 2, barY, 'RESULTADOS', {
        w: 240, h: 40,
        onPress: () => {
          transitionTo(this, 'PvELobbyScene', { pveType: 'tournament' })
        },
      })
      this.bottomBarContainer.add(resultBtn)
    }
  }

  // ── Spectate overlay ──────────────────────────────────────────────────────

  private showSpectateOverlay(match: MatchInfo): void {
    if (this.spectateOverlay) return

    const t1Name = match.team1 >= 0 ? this.teams[match.team1].name : 'Time A'
    const t2Name = match.team2 >= 0 ? this.teams[match.team2].name : 'Time B'

    this.spectateOverlay = this.add.container(0, 0).setDepth(50)

    const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setInteractive()
    this.spectateOverlay.add(bg)

    const panelW = 540
    const panelH = 400
    const panelG = this.add.graphics()
    panelG.fillStyle(surface.panel, 1)
    panelG.fillRoundedRect(W / 2 - panelW / 2, H / 2 - panelH / 2, panelW, panelH, radii.xl)
    panelG.lineStyle(1, border.default, 1)
    panelG.strokeRoundedRect(W / 2 - panelW / 2, H / 2 - panelH / 2, panelW, panelH, radii.xl)
    panelG.fillStyle(accent.primary, 0.45)
    panelG.fillRect(W / 2 - panelW / 2 + 16, H / 2 - panelH / 2, panelW - 32, 1)
    this.spectateOverlay.add(panelG)

    this.spectateOverlay.add(this.add.text(W / 2, H / 2 - panelH / 2 + 22, 'AO VIVO', {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      state.errorHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setLetterSpacing(1.8))

    this.spectateOverlay.add(this.add.text(W / 2, H / 2 - panelH / 2 + 46, `${t1Name} vs ${t2Name}`, {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      fg.primaryHex,
      fontStyle:  '600',
    }).setOrigin(0.5).setLetterSpacing(2.4))

    const logStartY = H / 2 - panelH / 2 + 88
    const lineH = 24
    const logTexts: Phaser.GameObjects.Text[] = []

    const lines = SPECTATE_LINES.map(line =>
      line.replace('{A}', t1Name).replace('{B}', t2Name)
    )

    let lineIdx = 0
    const addLine = () => {
      if (lineIdx >= lines.length || !this.spectateOverlay) return

      const roundNum = Math.floor(lineIdx / 2) + 1
      const txt = this.add.text(
        W / 2 - panelW / 2 + 24,
        logStartY + logTexts.length * lineH,
        `RD ${roundNum} · ${lines[lineIdx]}`,
        {
          fontFamily: fontFamily.body,
          fontSize:   typeScale.small,
          color:      fg.secondaryHex,
        },
      ).setOrigin(0, 0.5).setAlpha(0)

      if (this.spectateOverlay) this.spectateOverlay.add(txt)
      logTexts.push(txt)

      this.tweens.add({ targets: txt, alpha: 1, duration: 200 })

      lineIdx++
      if (lineIdx < lines.length) {
        this.time.delayedCall(1500, addLine)
      } else {
        this.time.delayedCall(1500, () => {
          if (!this.spectateOverlay) return
          const winnerName = match.winner !== null
            ? this.teams[match.winner].name
            : (Math.random() < 0.5 ? t1Name : t2Name)

          const victoryText = this.add.text(
            W / 2, logStartY + logTexts.length * lineH + 18,
            `VITÓRIA · ${winnerName.toUpperCase()}`,
            {
              fontFamily: fontFamily.display,
              fontSize:   typeScale.h3,
              color:      state.successHex,
              fontStyle:  '700',
            },
          ).setOrigin(0.5, 0.5).setLetterSpacing(1.8)

          if (this.spectateOverlay) this.spectateOverlay.add(victoryText)
        })
      }
    }
    this.time.delayedCall(500, addLine)

    const { container: closeBtn } = UI.buttonSecondary(this, W / 2, H / 2 + panelH / 2 - 32, 'FECHAR', {
      w: 140, h: 34, depth: 51,
      onPress: () => this.closeSpectateOverlay(),
    })
    this.spectateOverlay.add(closeBtn)
  }

  private closeSpectateOverlay(): void {
    if (this.spectateOverlay) {
      this.spectateOverlay.destroy()
      this.spectateOverlay = null
    }
  }

  // ── Champion celebration ──────────────────────────────────────────────────

  private showChampion(): void {
    const finalMatch = this.matches.find(m => m.round === 2)
    if (!finalMatch || finalMatch.winner === null) return

    const champion = this.teams[finalMatch.winner]
    const isPlayerChamp = champion.isPlayer

    this.championContainer = this.add.container(0, 0).setDepth(30)

    const glowX = this.getColumnX(2) + ROUND_GAP_X
    const glowY = this.getMatchY(2, 0)

    const glow = this.add.graphics()
    glow.fillStyle(accent.primary, 0.06)
    glow.fillCircle(glowX, glowY, 96)
    glow.fillStyle(accent.primary, 0.12)
    glow.fillCircle(glowX, glowY, 56)
    this.championContainer.add(glow)

    this.tweens.add({
      targets: glow, alpha: 0.55, duration: 1000,
      yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Champion card (scaled up)
    const cardG = this.add.graphics()
    cardG.fillStyle(surface.panel, 1)
    cardG.fillRoundedRect(glowX - 100, glowY - 30, 200, 60, radii.lg)
    cardG.lineStyle(2, accent.primary, 1)
    cardG.strokeRoundedRect(glowX - 100, glowY - 30, 200, 60, radii.lg)
    cardG.fillStyle(accent.primary, 1)
    cardG.fillRoundedRect(glowX - 97, glowY - 22, 4, 44, 2)
    this.championContainer.add(cardG)

    const champName = this.add.text(glowX, glowY, champion.name, {
      fontFamily: fontFamily.serif,
      fontSize:   typeScale.h3,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    this.championContainer.add(champName)

    const champTitle = this.add.text(glowX, glowY - 58, 'CAMPEÃO', {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.displayMd,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setAlpha(0).setScale(0.5).setLetterSpacing(4)
    this.championContainer.add(champTitle)

    this.tweens.add({
      targets: champTitle,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 600, ease: 'Back.Out',
    })

    if (isPlayerChamp) {
      const youWin = this.add.text(glowX, glowY + 52, 'VOCÊ VENCEU!', {
        fontFamily: fontFamily.display,
        fontSize:   typeScale.h2,
        color:      state.successHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setAlpha(0).setLetterSpacing(2.4)
      this.championContainer.add(youWin)

      this.tweens.add({ targets: youWin, alpha: 1, duration: 500, delay: 400 })

      this.spawnConfetti(glowX, glowY - 80)
      this.time.delayedCall(1200, () => this.showRewardsPopup(glowX, glowY + 108))
    }

    this.spawnSparkles(glowX, glowY)
    this.updateBottomBar()
  }

  private spawnConfetti(cx: number, cy: number): void {
    const palette = [accent.primary, state.success, state.info, state.error, 0xa78bfa, state.warn]
    for (let i = 0; i < 40; i++) {
      const color = palette[Phaser.Math.Between(0, palette.length - 1)]
      const size = Phaser.Math.Between(2, 5)
      const particle = this.add.rectangle(
        cx + Phaser.Math.Between(-20, 20),
        cy,
        size, size * Phaser.Math.FloatBetween(0.4, 1.5),
        color, 0.9,
      ).setDepth(31)

      this.tweens.add({
        targets: particle,
        x: cx + Phaser.Math.Between(-200, 200),
        y: cy + Phaser.Math.Between(80, 250),
        rotation: Phaser.Math.FloatBetween(-3, 3),
        alpha: 0,
        duration: Phaser.Math.Between(1500, 2500),
        delay: Phaser.Math.Between(0, 600),
        ease: 'Quad.Out',
        onComplete: () => particle.destroy(),
      })
    }
  }

  private spawnSparkles(cx: number, cy: number): void {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const dist = 60 + Math.random() * 30
      const sparkle = this.add.circle(
        cx + Math.cos(angle) * dist,
        cy + Math.sin(angle) * dist,
        1.5, accent.primary, 0.6,
      ).setDepth(31)

      this.tweens.add({
        targets: sparkle,
        alpha: 0, scaleX: 2, scaleY: 2,
        duration: 800 + Math.random() * 600,
        yoyo: true, repeat: -1,
        delay: Math.random() * 1000,
      })
    }
  }

  get isPaid(): boolean { return this._goldDeducted }
  get pendingIndex(): number { return this._pendingMatchIndex }

  private _getEntryCost(): number {
    const lvl = this.bracketData.bracketLevel ?? 1
    return 50 + Math.floor((lvl - 1) / 5) * 25
  }

  private _handleBattleReturn(playerWon: boolean): void {
    const roundMatches = this.matches.filter(m => m.round === this.currentRound)
    const match = roundMatches.find(m => {
      const t1 = m.team1 >= 0 ? this.teams[m.team1] : null
      const t2 = m.team2 >= 0 ? this.teams[m.team2] : null
      return (t1?.isPlayer || t2?.isPlayer) && !m.played
    })

    if (!match) return

    if (playerWon) {
      const playerIdx = match.team1 >= 0 && this.teams[match.team1].isPlayer ? match.team1 : match.team2
      this.resolveMatch(match, playerIdx)
    } else {
      const opponentIdx = match.team1 >= 0 && !this.teams[match.team1].isPlayer ? match.team1 : match.team2
      this.resolveMatch(match, opponentIdx)
    }

    const remainingIdx = roundMatches.indexOf(match)
    this.time.delayedCall(800, () => {
      this.simulateRoundSequential(roundMatches, remainingIdx + 1)
    })
  }

  private showRewardsPopup(cx: number, cy: number): void {
    const bracketLevel = this.bracketData.bracketLevel ?? playerData.getLevel()
    const goldReward = 200 + bracketLevel * 10
    const xpReward = 150 + bracketLevel * 8

    playerData.addBattleRewards(goldReward, xpReward, true)

    const rewardContainer = this.add.container(cx, cy).setDepth(32).setAlpha(0)

    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 1)
    bg.fillRoundedRect(-136, -28, 272, 56, radii.md)
    bg.lineStyle(1, accent.primary, 1)
    bg.strokeRoundedRect(-136, -28, 272, 56, radii.md)
    rewardContainer.add(bg)

    const goldText = this.add.text(-68, 0, `+${goldReward} GOLD`, {
      fontFamily: fontFamily.mono,
      fontSize:   typeScale.statMd,
      color:      currency.goldCoinHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    rewardContainer.add(goldText)

    const xpText = this.add.text(68, 0, `+${xpReward} XP`, {
      fontFamily: fontFamily.mono,
      fontSize:   typeScale.statMd,
      color:      state.infoHex,
      fontStyle:  '700',
    }).setOrigin(0.5)
    rewardContainer.add(xpText)

    this.tweens.add({
      targets: rewardContainer,
      alpha: 1, y: cy - 10,
      duration: 500, ease: 'Back.Out',
    })

    if (this.championContainer) {
      this.championContainer.add(rewardContainer)
    }
  }
}
