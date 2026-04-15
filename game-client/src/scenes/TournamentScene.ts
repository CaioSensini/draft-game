import Phaser from 'phaser'
import { playerData } from '../utils/PlayerDataManager'
import type { Tournament } from '../data/tournaments'
import { TIER_COLORS } from '../data/tournaments'
import { transitionTo } from '../utils/SceneTransition'
import { UI } from '../utils/UIComponents'

const W = 1280

interface SceneData {
  tournament: Tournament
}

export default class TournamentScene extends Phaser.Scene {
  private _tournament!: Tournament
  private _currentRound = 0
  private _wins = 0
  private _eliminated = false

  constructor() { super('TournamentScene') }

  create(data: SceneData) {
    this._tournament = data.tournament
    this._currentRound = 0
    this._wins = 0
    this._eliminated = false

    // Background + particles
    UI.background(this)
    UI.particles(this, 15)

    // Fade in
    UI.fadeIn(this)

    // Title
    const tierColor = TIER_COLORS[this._tournament.id] ?? 0xf0c850
    const tierHex = '#' + tierColor.toString(16).padStart(6, '0')
    this.add.text(W/2, 40, this._tournament.name.toUpperCase(), {
      fontFamily: 'Arial Black', fontSize: '32px', color: tierHex, fontStyle: 'bold',
      shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 6, fill: true },
    }).setOrigin(0.5)

    UI.mutedText(this, W/2, 78, this._tournament.description)

    // Entry fee + rewards panel
    const panelG = this.add.graphics()
    panelG.fillStyle(0x12161f, 0.9)
    panelG.fillRoundedRect(W/2 - 300, 100, 600, 50, 8)
    panelG.lineStyle(1, tierColor, 0.4)
    panelG.strokeRoundedRect(W/2 - 300, 100, 600, 50, 8)

    this.add.text(W/2 - 280, 125, `Taxa: ${this._tournament.entryFee} Gold`, {
      fontFamily: 'Arial', fontSize: '13px', color: '#ffa726', fontStyle: 'bold',
    }).setOrigin(0, 0.5)

    const r = this._tournament.rewards.first
    const dgInfo = this._tournament.dgDrop.amount > 0 ? ` (${this._tournament.dgDrop.chance * 100}% de ${this._tournament.dgDrop.amount}DG)` : ''
    this.add.text(W/2 + 280, 125, `1o: ${r.gold}g + ${r.xp}xp${dgInfo}`, {
      fontFamily: 'Arial', fontSize: '13px', color: tierHex, fontStyle: 'bold',
    }).setOrigin(1, 0.5)

    // Bracket display
    this.drawBracket()

    // Back arrow
    UI.backArrow(this, () => transitionTo(this, 'PvESelectScene'))
  }

  private drawBracket() {
    const t = this._tournament
    const startY = 170
    const matchH = 60
    const colW = 300

    // Round labels
    const roundLabels = ['Quartas', 'Semifinal', 'Final']

    // Generate bracket (7 NPCs + player)
    const teams = [...t.npcTeams.slice(0, 7).map(n => n.name), `Voce (Lv.${playerData.getLevel()})`]
    // Shuffle player into random position
    const playerIdx = Math.floor(Math.random() * 8)
    const bracket = [...teams]
    bracket.splice(playerIdx, 0, bracket.splice(7, 1)[0])

    // Draw each round
    for (let round = 0; round < 3; round++) {
      const matches = round === 0 ? 4 : round === 1 ? 2 : 1
      const x = 80 + round * colW

      this.add.text(x + colW/2 - 40, startY - 20, roundLabels[round], {
        fontFamily: 'Arial', fontSize: '12px', color: '#c9a84c', fontStyle: 'bold',
      })

      for (let m = 0; m < matches; m++) {
        const y = startY + m * matchH * (round === 0 ? 1.2 : round === 1 ? 2.4 : 4.8) + round * 15
        const isCurrentMatch = round === this._currentRound && !this._eliminated

        // Match card
        const cardG = this.add.graphics()
        cardG.fillStyle(isCurrentMatch ? 0x1a2a1a : 0x141a24, 1)
        cardG.fillRoundedRect(x, y, colW - 20, matchH - 5, 6)
        if (isCurrentMatch) {
          cardG.lineStyle(1.5, 0x4ade80, 0.7)
        } else {
          cardG.lineStyle(1, 0x3d2e14, 0.3)
        }
        cardG.strokeRoundedRect(x, y, colW - 20, matchH - 5, 6)

        if (round === 0) {
          // Show team names for first round
          const t1 = bracket[m * 2] ?? '???'
          const t2 = bracket[m * 2 + 1] ?? '???'
          this.add.text(x + 10, y + 14, t1, {
            fontFamily: 'Arial', fontSize: '11px', color: '#e8e0d0',
          })
          this.add.text(x + 10, y + 32, t2, {
            fontFamily: 'Arial', fontSize: '11px', color: '#e8e0d0',
          })
          this.add.text(x + colW/2 - 10, y + 23, 'vs', {
            fontFamily: 'Arial', fontSize: '10px', color: '#5a5040',
          }).setOrigin(0.5)
        } else {
          this.add.text(x + (colW - 20)/2, y + (matchH - 5)/2, '?', {
            fontFamily: 'Arial', fontSize: '16px', color: '#5a5040',
          }).setOrigin(0.5)
        }

        // Fight button for current match
        if (isCurrentMatch && m === 0) {
          const btnG = this.add.graphics()
          btnG.fillStyle(0x1a3a1a, 1)
          btnG.fillRoundedRect(x + colW - 90, y + 12, 60, 30, 6)
          btnG.lineStyle(1, 0x4ade80, 0.7)
          btnG.strokeRoundedRect(x + colW - 90, y + 12, 60, 30, 6)
          this.add.text(x + colW - 60, y + 27, 'Lutar', {
            fontFamily: 'Arial', fontSize: '12px', color: '#4ade80', fontStyle: 'bold',
          }).setOrigin(0.5)

          this.add.rectangle(x + colW - 60, y + 27, 60, 30, 0x000000, 0.001)
            .setInteractive({ useHandCursor: true })
            .on('pointerdown', () => {
              const npc = t.npcTeams[Math.min(this._currentRound * 2, t.npcTeams.length - 1)]
              transitionTo(this, 'BattleScene', {
                deckConfig: playerData.getDeckConfig(),
                skinConfig: playerData.getSkinConfig(),
                pveMode: true,
                npcTeam: { name: npc.name, levelMin: npc.level - 3, levelMax: npc.level, goldReward: 0, xpReward: 0 },
                tournamentData: { id: t.id, round: this._currentRound, wins: this._wins },
              })
            })
        }
      }
    }
  }

  shutdown() {
    this.tweens.killAll()
  }
}
