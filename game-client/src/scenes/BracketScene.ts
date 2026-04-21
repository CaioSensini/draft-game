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
import { C, F, S, SHADOW, SCREEN } from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'
import { playerData } from '../utils/PlayerDataManager'

const W = SCREEN.W
const H = SCREEN.H

// ── Types ───────────────────────────────────────────────────────────────────

interface BracketData {
  type: 'pve' | 'ranked'
  bracketLevel?: number
  teamCount?: number  // 4 or 8
  /** Passed back from BattleResultScene after a real battle */
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
  'Guarda Real', 'Mercenarios', 'Ordem Sombria', 'Cavaleiros',
  'Legiao Imperial', 'Esquadrao Elite', 'Defensores', 'Arautos',
]

/** Match card dimensions */
const CARD_W = 150
const CARD_H = 32
const CARD_GAP = 8
const ROUND_GAP_X = 180

/** Column labels */
const ROUND_LABELS = ['QUARTAS', 'SEMIFINAL', 'FINAL', 'CAMPEAO']

/** Spectate battle log lines */
const SPECTATE_LINES = [
  '{A} ataca com Bola de Fogo...',
  '{B} defende com Escudo Magico...',
  '{A} lanca Flecha Congelante...',
  '{B} contra-ataca com Investida...',
  '{A} usa Cura Divina...',
  '{B} invoca Tempestade Arcana...',
  '{A} prepara Golpe Devastador...',
  '{B} ativa Barreira de Vento...',
  '{A} desfere ataque critico!',
  '{B} tenta esquivar mas falha...',
]

// ── Persisted bracket state (survives scene restart) ────────────────────────

interface SavedBracketState {
  teams: TeamInfo[]
  matches: MatchInfo[]
  currentRound: number
  pendingMatchIndex: number  // which match in the round the player was fighting
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

  // Layout
  private baseX = 0
  private baseY = 0

  constructor() { super('BracketScene') }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  init(data?: BracketData): void {
    this.bracketData = data ?? { type: 'pve' }
  }

  create(): void {
    this.matchContainers = new Map()
    this.spectateOverlay = null
    this.championContainer = null
    this.phase = 'reveal'

    UI.background(this)
    UI.particles(this, 12)

    // Compute layout origin so bracket is centered
    const totalRounds = 3 // quartas, semi, final
    const totalW = totalRounds * ROUND_GAP_X + CARD_W
    this.baseX = (W - totalW) / 2
    this.baseY = 110

    // Check if returning from a battle
    if (this.bracketData.returning && _savedBracket) {
      this.teams = _savedBracket.teams
      this.matches = _savedBracket.matches
      this.currentRound = _savedBracket.currentRound
      this._pendingMatchIndex = _savedBracket.pendingMatchIndex
      this._goldDeducted = true

      this.drawHeader()
      this.lineGraphics = this.add.graphics().setDepth(1)
      this.bottomBarContainer = this.add.container(0, 0).setDepth(10)

      // Draw all existing match cards (already resolved)
      for (const m of this.matches) {
        if (m.team1 >= 0 || m.team2 >= 0) this.drawMatchCard(m)
      }
      this.drawConnectingLines()

      // Process the battle result
      const playerWon = this.bracketData.playerWon ?? false
      this._handleBattleReturn(playerWon)
      _savedBracket = null
    } else {
      // Fresh tournament
      this.currentRound = 0
      this._goldDeducted = false
      this.initBracket()
      this.drawHeader()
      this.lineGraphics = this.add.graphics().setDepth(1)
      this.bottomBarContainer = this.add.container(0, 0).setDepth(10)

      // Deduct gold entry fee
      const cost = this._getEntryCost()
      if (cost > 0 && playerData.get().gold >= cost) {
        playerData.spendGold(cost)
        this._goldDeducted = true
      }

      this.revealBracket()
    }

    UI.fadeIn(this)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BRACKET INIT
  // ═══════════════════════════════════════════════════════════════════════════

  private initBracket(): void {
    // Create 8 teams: player + 7 NPCs
    const playerName = playerData.get().username || 'Jogador'
    const shuffled = Phaser.Utils.Array.Shuffle([...NPC_NAMES]).slice(0, 7)

    // Insert player at random position
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

    // Create quarter-final matches (round 0)
    this.matches = []
    for (let s = 0; s < 4; s++) {
      this.matches.push({
        round: 0, slot: s,
        team1: s * 2, team2: s * 2 + 1,
        winner: null, played: false,
      })
    }
    // Semifinal slots (round 1)
    for (let s = 0; s < 2; s++) {
      this.matches.push({
        round: 1, slot: s,
        team1: -1, team2: -1,
        winner: null, played: false,
      })
    }
    // Final (round 2)
    this.matches.push({
      round: 2, slot: 0,
      team1: -1, team2: -1,
      winner: null, played: false,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════

  private drawHeader(): void {
    const title = this.bracketData.type === 'ranked' ? 'TORNEIO RANKED' : 'TORNEIO PVE'
    UI.goldText(this, W / 2, 30, title, S.titleLarge)

    const levelText = this.bracketData.bracketLevel
      ? `Lv.${this.bracketData.bracketLevel}`
      : ''
    if (levelText) {
      UI.mutedText(this, W / 2, 55, levelText, S.body)
    }

    // Back arrow — always works (exits tournament)
    UI.backArrow(this, () => {
      _savedBracket = null  // clear saved state
      transitionTo(this, 'PvELobbyScene', { pveType: 'tournament' })
    })

    // Column headers
    for (let r = 0; r < ROUND_LABELS.length; r++) {
      const colX = this.getColumnX(Math.min(r, 3))
      this.add.text(colX, 85, ROUND_LABELS[r], {
        fontFamily: F.body, fontSize: S.small, color: C.mutedHex,
        fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5).setAlpha(0)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private getColumnX(round: number): number {
    return this.baseX + CARD_W / 2 + round * ROUND_GAP_X
  }

  /**
   * Returns Y center for a match card.
   * Round 0: 4 matches evenly spaced
   * Round 1: 2 matches centered between their feeder matches
   * Round 2: 1 match centered
   */
  private getMatchY(round: number, slot: number): number {
    const areaTop = this.baseY + 20
    const areaH = H - areaTop - 120 // leave room for bottom bar

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
    // round 2 (final)
    const y0 = this.getMatchY(1, 0)
    const y1 = this.getMatchY(1, 1)
    return (y0 + y1) / 2
  }

  // Team card Y is computed inline relative to match center

  // ═══════════════════════════════════════════════════════════════════════════
  // REVEAL ANIMATION
  // ═══════════════════════════════════════════════════════════════════════════

  private revealBracket(): void {
    // Reveal column headers
    const headers = this.children.getAll().filter(
      c => c instanceof Phaser.GameObjects.Text && ROUND_LABELS.includes((c as Phaser.GameObjects.Text).text)
    ) as Phaser.GameObjects.Text[]

    headers.forEach((h, i) => {
      this.tweens.add({
        targets: h, alpha: 1, duration: 300,
        delay: i * 200,
      })
    })

    // Draw match cards round by round
    for (let r = 0; r <= 2; r++) {
      const roundMatches = this.matches.filter(m => m.round === r)
      roundMatches.forEach((match, idx) => {
        this.time.delayedCall(r * 200 + idx * 80, () => {
          this.drawMatchCard(match)
        })
      })
    }

    // After reveal, start simulation
    const totalRevealTime = 2 * 200 + 200
    this.time.delayedCall(totalRevealTime + 400, () => {
      this.startRound(0)
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MATCH CARD DRAWING
  // ═══════════════════════════════════════════════════════════════════════════

  private matchKey(round: number, slot: number): string {
    return `${round}-${slot}`
  }

  private drawMatchCard(match: MatchInfo): void {
    const key = this.matchKey(match.round, match.slot)
    // Remove old container if exists
    const old = this.matchContainers.get(key)
    if (old) old.destroy()

    const cx = this.getColumnX(match.round)
    const my = this.getMatchY(match.round, match.slot)

    const container = this.add.container(cx, my).setDepth(2)
    container.setAlpha(0)

    // Draw the two team cards
    this.drawTeamCard(container, match, true)
    this.drawTeamCard(container, match, false)

    // Fade in
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

    // Determine card state
    const isWinner = match.played && match.winner === teamIdx && teamIdx >= 0
    const isLoser = match.played && match.winner !== teamIdx && match.winner !== null && teamIdx >= 0
    const isPending = !match.played && teamIdx >= 0
    const isPlayer = team?.isPlayer ?? false
    const isEmpty = teamIdx < 0

    // Card fill
    const fillColor = isLoser ? 0x0a0c12 : 0x12161f
    g.fillStyle(fillColor, 1)
    g.fillRoundedRect(-CARD_W / 2, localY - CARD_H / 2, CARD_W, CARD_H, 4)

    // Border color
    let borderColor = 0x3d2e14
    let borderAlpha = 0.4
    if (isPlayer && !isLoser) {
      borderColor = C.gold
      borderAlpha = 0.7
    } else if (isWinner) {
      borderColor = C.success
      borderAlpha = 0.7
    } else if (isLoser) {
      borderColor = C.danger
      borderAlpha = 0.3
    } else if (isPending) {
      borderColor = 0x555555
      borderAlpha = 0.4
    }

    g.lineStyle(1.5, borderColor, borderAlpha)
    g.strokeRoundedRect(-CARD_W / 2, localY - CARD_H / 2, CARD_W, CARD_H, 4)

    // Player gold left accent
    if (isPlayer && !isLoser) {
      g.fillStyle(C.gold, 0.8)
      g.fillRoundedRect(-CARD_W / 2 + 2, localY - CARD_H / 2 + 4, 3, CARD_H - 8, 1)
    }

    parent.add(g)

    // Team name
    if (team) {
      const nameColor: string = isLoser ? C.dimHex : isPlayer ? C.goldHex : C.bodyHex
      const nameX = isPlayer ? -CARD_W / 2 + 14 : -CARD_W / 2 + 8
      const nameText = this.add.text(nameX, localY, team.name, {
        fontFamily: F.body,
        fontSize: S.small,
        color: nameColor,
        fontStyle: isPlayer ? 'bold' : 'normal',
        shadow: SHADOW.text,
      }).setOrigin(0, 0.5)

      if (isLoser) nameText.setAlpha(0.3)
      parent.add(nameText)

      // Status indicator
      let indicator = ''
      let indicatorColor: string = C.mutedHex
      if (isWinner) { indicator = '\u2713'; indicatorColor = C.successHex }
      else if (isLoser) { indicator = '\u2717'; indicatorColor = C.dangerHex }
      else if (isPending) { indicator = '?'; indicatorColor = C.mutedHex }

      if (indicator) {
        const indText = this.add.text(CARD_W / 2 - 12, localY, indicator, {
          fontFamily: F.body,
          fontSize: S.bodySmall,
          color: indicatorColor,
          fontStyle: 'bold',
          shadow: SHADOW.text,
        }).setOrigin(0.5)

        if (isLoser) indText.setAlpha(0.3)
        parent.add(indText)
      }
    } else if (isEmpty) {
      const emptyText = this.add.text(0, localY, '---', {
        fontFamily: F.body, fontSize: S.small, color: C.dimHex,
        shadow: SHADOW.text,
      }).setOrigin(0.5)
      parent.add(emptyText)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTING LINES
  // ═══════════════════════════════════════════════════════════════════════════

  private drawConnectingLines(): void {
    this.lineGraphics.clear()
    this.lineGraphics.lineStyle(1.5, C.goldDim, 0.2)

    for (const match of this.matches) {
      if (match.round === 0) continue // no incoming lines for first round

      const prevRound = match.round - 1
      const feederSlot1 = match.slot * 2
      const feederSlot2 = match.slot * 2 + 1

      const feeder1 = this.matches.find(m => m.round === prevRound && m.slot === feederSlot1)
      const feeder2 = this.matches.find(m => m.round === prevRound && m.slot === feederSlot2)

      if (!feeder1 || !feeder2) continue

      const fromX = this.getColumnX(prevRound) + CARD_W / 2 + 4
      const toX = this.getColumnX(match.round) - CARD_W / 2 - 4
      const midX = (fromX + toX) / 2

      const y1 = this.getMatchY(prevRound, feederSlot1)
      const y2 = this.getMatchY(prevRound, feederSlot2)
      const targetY = this.getMatchY(match.round, match.slot)

      // Highlight lines for resolved matches
      if (feeder1.played && feeder1.winner !== null) {
        const winnerTeam = this.teams[feeder1.winner]
        if (winnerTeam?.isPlayer) {
          this.lineGraphics.lineStyle(2, C.gold, 0.5)
        } else {
          this.lineGraphics.lineStyle(1.5, C.goldDim, 0.35)
        }
      } else {
        this.lineGraphics.lineStyle(1.5, C.goldDim, 0.15)
      }

      // Top feeder line
      this.lineGraphics.beginPath()
      this.lineGraphics.moveTo(fromX, y1)
      this.lineGraphics.lineTo(midX, y1)
      this.lineGraphics.lineTo(midX, targetY)
      this.lineGraphics.lineTo(toX, targetY)
      this.lineGraphics.strokePath()

      // Reset style for bottom feeder
      if (feeder2.played && feeder2.winner !== null) {
        const winnerTeam = this.teams[feeder2.winner]
        if (winnerTeam?.isPlayer) {
          this.lineGraphics.lineStyle(2, C.gold, 0.5)
        } else {
          this.lineGraphics.lineStyle(1.5, C.goldDim, 0.35)
        }
      } else {
        this.lineGraphics.lineStyle(1.5, C.goldDim, 0.15)
      }

      // Bottom feeder line
      this.lineGraphics.beginPath()
      this.lineGraphics.moveTo(fromX, y2)
      this.lineGraphics.lineTo(midX, y2)
      this.lineGraphics.lineTo(midX, targetY)
      this.lineGraphics.lineTo(toX, targetY)
      this.lineGraphics.strokePath()
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND SIMULATION
  // ═══════════════════════════════════════════════════════════════════════════

  private startRound(round: number): void {
    this.currentRound = round
    const roundMatches = this.matches.filter(m => m.round === round && !m.played)

    if (roundMatches.length === 0) {
      // Tournament complete
      this.phase = 'complete'
      this.showChampion()
      return
    }

    this.simulateRoundSequential(roundMatches, 0)
  }

  private simulateRoundSequential(roundMatches: MatchInfo[], index: number): void {
    if (index >= roundMatches.length) {
      // Round done, advance
      this.advanceWinnersToNextRound()
      this.time.delayedCall(800, () => {
        this.startRound(this.currentRound + 1)
      })
      return
    }

    const match = roundMatches[index]

    // Check if this is the player's match
    const t1 = match.team1 >= 0 ? this.teams[match.team1] : null
    const t2 = match.team2 >= 0 ? this.teams[match.team2] : null
    const isPlayerMatch = (t1?.isPlayer || t2?.isPlayer) ?? false

    if (isPlayerMatch) {
      // Show JOGAR button
      this.phase = 'your_turn'
      this._pendingMatchIndex = index
      this.updateBottomBar(match, () => {
        // Save bracket state and transition to BattleScene
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
            goldReward: 0,  // rewards handled by bracket, not battle result
            xpReward: 0,
          },
          botLevel: bracketLevel,
          difficulty: 'normal',
          tournamentReturn: true,
          bracketData: this.bracketData,
        }, 400, 'wipeRight')
      })
    } else {
      // NPC vs NPC: simulate with delay
      this.phase = 'simulating'
      this.updateBottomBar(match)

      this.time.delayedCall(1500, () => {
        // 50/50 random winner
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

    // Mark loser as eliminated
    const loserIdx = match.team1 === winnerIdx ? match.team2 : match.team1
    if (loserIdx >= 0) this.teams[loserIdx].eliminated = true

    // Redraw the match card
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

      // Redraw next round card
      this.drawMatchCard(nm)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BOTTOM BAR
  // ═══════════════════════════════════════════════════════════════════════════

  private updateBottomBar(match?: MatchInfo, onPlayPress?: () => void): void {
    this.bottomBarContainer.removeAll(true)

    const barY = H - 50
    const barBg = this.add.graphics()
    barBg.fillStyle(0x0a0e14, 0.9)
    barBg.fillRect(0, barY - 30, W, 60)
    barBg.lineStyle(1, C.goldDim, 0.15)
    barBg.lineBetween(0, barY - 30, W, barY - 30)
    this.bottomBarContainer.add(barBg)

    if (this.phase === 'simulating' && match) {
      const t1Name = match.team1 >= 0 ? this.teams[match.team1].name : '?'
      const t2Name = match.team2 >= 0 ? this.teams[match.team2].name : '?'

      const simText = this.add.text(W / 2 - 120, barY, `Simulando: ${t1Name} vs ${t2Name}...`, {
        fontFamily: F.body, fontSize: S.body, color: C.mutedHex,
        shadow: SHADOW.text,
      }).setOrigin(0.5)
      this.bottomBarContainer.add(simText)

      // Spectate button — Secondary outline (§1.2).
      const { container: specBtn } = UI.buttonSecondary(this, W / 2 + 140, barY, 'Assistir', {
        w: 140, h: 34,
        onPress: () => this.showSpectateOverlay(match),
      })
      this.bottomBarContainer.add(specBtn)

    } else if (this.phase === 'your_turn' && match) {
      const opponent = match.team1 >= 0 && !this.teams[match.team1].isPlayer
        ? this.teams[match.team1].name
        : match.team2 >= 0 ? this.teams[match.team2].name : '?'

      const vsText = this.add.text(W / 2 - 140, barY, `Sua vez! vs ${opponent}`, {
        fontFamily: F.body, fontSize: S.body, color: C.bodyHex,
        fontStyle: 'bold', shadow: SHADOW.text,
      }).setOrigin(0.5)
      this.bottomBarContainer.add(vsText)

      // JOGAR button — Primary gold CTA with pulse (§1.1).
      const { container: playBtn } = UI.buttonPrimary(this, W / 2 + 120, barY, 'Jogar', {
        w: 160, h: 38,
        onPress: () => {
          if (onPlayPress) onPlayPress()
        },
      })
      this.bottomBarContainer.add(playBtn)

      // Pulse animation
      this.tweens.add({
        targets: playBtn,
        scaleX: 1.05, scaleY: 1.05,
        duration: 600, yoyo: true, repeat: -1,
        ease: 'Sine.InOut',
      })

    } else if (this.phase === 'complete') {
      // Final "Resultados" — Primary gold (§1.1).
      const { container: resultBtn } = UI.buttonPrimary(this, W / 2, barY, 'Resultados', {
        w: 240, h: 38,
        onPress: () => {
          transitionTo(this, 'PvELobbyScene', { pveType: 'tournament' })
        },
      })
      this.bottomBarContainer.add(resultBtn)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPECTATE OVERLAY
  // ═══════════════════════════════════════════════════════════════════════════

  private showSpectateOverlay(match: MatchInfo): void {
    if (this.spectateOverlay) return

    const t1Name = match.team1 >= 0 ? this.teams[match.team1].name : 'Time A'
    const t2Name = match.team2 >= 0 ? this.teams[match.team2].name : 'Time B'

    this.spectateOverlay = this.add.container(0, 0).setDepth(50)

    // Semi-transparent background
    const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75)
      .setInteractive()
    this.spectateOverlay.add(bg)

    // Log panel
    const panelW = 500
    const panelH = 380
    const panelG = this.add.graphics()
    panelG.fillStyle(C.panelBg, 1)
    panelG.fillRoundedRect(W / 2 - panelW / 2, H / 2 - panelH / 2, panelW, panelH, S.borderRadius)
    panelG.lineStyle(1.5, C.goldDim, 0.4)
    panelG.strokeRoundedRect(W / 2 - panelW / 2, H / 2 - panelH / 2, panelW, panelH, S.borderRadius)
    this.spectateOverlay.add(panelG)

    // Title
    const titleText = this.add.text(W / 2, H / 2 - panelH / 2 + 25, `${t1Name} vs ${t2Name}`, {
      fontFamily: F.title, fontSize: S.titleSmall, color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)
    this.spectateOverlay.add(titleText)

    // Divider
    const divider = this.add.rectangle(W / 2, H / 2 - panelH / 2 + 48, panelW - 40, 1, C.goldDim, 0.2)
    this.spectateOverlay.add(divider)

    // Battle log lines (auto-advancing)
    const logStartY = H / 2 - panelH / 2 + 70
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
        W / 2 - panelW / 2 + 20,
        logStartY + logTexts.length * lineH,
        `Round ${roundNum}: ${lines[lineIdx]}`,
        {
          fontFamily: F.body, fontSize: S.bodySmall, color: C.bodyHex,
          shadow: SHADOW.text,
        },
      ).setOrigin(0, 0.5).setAlpha(0)

      if (this.spectateOverlay) {
        this.spectateOverlay.add(txt)
      }
      logTexts.push(txt)

      this.tweens.add({
        targets: txt, alpha: 1, duration: 200,
      })

      lineIdx++
      if (lineIdx < lines.length) {
        this.time.delayedCall(1500, addLine)
      } else {
        // Show winner after all lines
        this.time.delayedCall(1500, () => {
          if (!this.spectateOverlay) return
          const winnerName = match.winner !== null ? this.teams[match.winner].name
            : (Math.random() < 0.5 ? t1Name : t2Name)

          const victoryText = this.add.text(
            W / 2, logStartY + logTexts.length * lineH + 15,
            `VITORIA: ${winnerName}!`,
            {
              fontFamily: F.title, fontSize: S.titleMedium, color: C.successHex,
              fontStyle: 'bold', shadow: SHADOW.strong,
            },
          ).setOrigin(0.5, 0.5)

          if (this.spectateOverlay) {
            this.spectateOverlay.add(victoryText)
          }
        })
      }
    }
    this.time.delayedCall(500, addLine)

    // Close button — Secondary outline (§1.2).
    const { container: closeBtn } = UI.buttonSecondary(this, W / 2, H / 2 + panelH / 2 - 30, 'Fechar', {
      w: 120, h: 32, depth: 51,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAMPION CELEBRATION
  // ═══════════════════════════════════════════════════════════════════════════

  private showChampion(): void {
    const finalMatch = this.matches.find(m => m.round === 2)
    if (!finalMatch || finalMatch.winner === null) return

    const champion = this.teams[finalMatch.winner]
    const isPlayerChamp = champion.isPlayer

    this.championContainer = this.add.container(0, 0).setDepth(30)

    // Gold glow behind champion
    const glowX = this.getColumnX(2) + ROUND_GAP_X
    const glowY = this.getMatchY(2, 0)

    const glow = this.add.graphics()
    glow.fillStyle(C.gold, 0.05)
    glow.fillCircle(glowX, glowY, 80)
    glow.fillStyle(C.gold, 0.08)
    glow.fillCircle(glowX, glowY, 50)
    this.championContainer.add(glow)

    // Pulsing glow animation
    this.tweens.add({
      targets: glow, alpha: 0.5, duration: 1000,
      yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Champion card (scaled up)
    const cardG = this.add.graphics()
    cardG.fillStyle(C.panelBg, 1)
    cardG.fillRoundedRect(glowX - 90, glowY - 30, 180, 60, S.borderRadius)
    cardG.lineStyle(2, C.gold, 0.8)
    cardG.strokeRoundedRect(glowX - 90, glowY - 30, 180, 60, S.borderRadius)
    // Gold accent bar
    cardG.fillStyle(C.gold, 0.8)
    cardG.fillRoundedRect(glowX - 87, glowY - 22, 4, 44, 2)
    this.championContainer.add(cardG)

    // Champion name
    const champName = this.add.text(glowX, glowY, champion.name, {
      fontFamily: F.title, fontSize: S.titleSmall, color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0.5)
    this.championContainer.add(champName)

    // "CAMPEAO!" title
    const champTitle = this.add.text(glowX, glowY - 55, 'CAMPEAO!', {
      fontFamily: F.title, fontSize: S.titleHuge, color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.goldGlow,
    }).setOrigin(0.5).setAlpha(0).setScale(0.5)
    this.championContainer.add(champTitle)

    this.tweens.add({
      targets: champTitle,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 600, ease: 'Back.Out',
    })

    if (isPlayerChamp) {
      // "VOCE VENCEU!" text
      const youWin = this.add.text(glowX, glowY + 50, 'VOCE VENCEU!', {
        fontFamily: F.title, fontSize: S.titleMedium, color: C.successHex,
        fontStyle: 'bold', shadow: SHADOW.strong,
      }).setOrigin(0.5).setAlpha(0)
      this.championContainer.add(youWin)

      this.tweens.add({
        targets: youWin, alpha: 1, duration: 500, delay: 400,
      })

      // Confetti particles
      this.spawnConfetti(glowX, glowY - 80)

      // Rewards popup
      this.time.delayedCall(1200, () => this.showRewardsPopup(glowX, glowY + 100))
    }

    // Sparkle particles around champion
    this.spawnSparkles(glowX, glowY)

    // Update bottom bar
    this.updateBottomBar()
  }

  private spawnConfetti(cx: number, cy: number): void {
    const colors = [C.gold, C.success, C.info, C.danger, C.purple, C.warning]
    for (let i = 0; i < 40; i++) {
      const color = colors[Phaser.Math.Between(0, colors.length - 1)]
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
        1.5, C.gold, 0.6,
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

  /** Check if tournament entry has been paid. */
  get isPaid(): boolean { return this._goldDeducted }
  /** Current pending match index. */
  get pendingIndex(): number { return this._pendingMatchIndex }

  /** Get the entry fee for this tournament bracket level. */
  private _getEntryCost(): number {
    const lvl = this.bracketData.bracketLevel ?? 1
    return 50 + Math.floor((lvl - 1) / 5) * 25
  }

  /** Handle return from BattleScene — resolve the player's match and continue. */
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
      // Player lost — opponent wins
      const opponentIdx = match.team1 >= 0 && !this.teams[match.team1].isPlayer ? match.team1 : match.team2
      this.resolveMatch(match, opponentIdx)
    }

    // Continue simulating remaining matches in this round, then advance
    const remainingIdx = roundMatches.indexOf(match)
    this.time.delayedCall(800, () => {
      this.simulateRoundSequential(roundMatches, remainingIdx + 1)
    })
  }

  private showRewardsPopup(cx: number, cy: number): void {
    const bracketLevel = this.bracketData.bracketLevel ?? playerData.getLevel()
    const goldReward = 200 + bracketLevel * 10
    const xpReward = 150 + bracketLevel * 8

    // Apply rewards to player data
    playerData.addBattleRewards(goldReward, xpReward, true)

    const rewardContainer = this.add.container(cx, cy).setDepth(32).setAlpha(0)

    const bg = this.add.graphics()
    bg.fillStyle(C.panelBg, 0.95)
    bg.fillRoundedRect(-120, -30, 240, 60, S.borderRadiusSmall)
    bg.lineStyle(1, C.gold, 0.5)
    bg.strokeRoundedRect(-120, -30, 240, 60, S.borderRadiusSmall)
    rewardContainer.add(bg)

    const goldText = this.add.text(-60, 0, `+${goldReward} Gold`, {
      fontFamily: F.body, fontSize: S.body, color: C.goldHex,
      fontStyle: 'bold', shadow: SHADOW.text,
    }).setOrigin(0.5)
    rewardContainer.add(goldText)

    const xpText = this.add.text(60, 0, `+${xpReward} XP`, {
      fontFamily: F.body, fontSize: S.body, color: C.infoHex,
      fontStyle: 'bold', shadow: SHADOW.text,
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
