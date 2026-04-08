import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import type { TeamSide } from '../types'
import { playerData } from '../utils/PlayerDataManager'

// ── Layout constants (1280 x 720) ────────────────────────────────────────────

const W = 1280
const H = 720

// ── Incoming scene data ──────────────────────────────────────────────────────

interface NpcTeamData {
  name: string
  levelMin: number
  levelMax: number
  goldReward: number
  xpReward: number
}

interface ResultData {
  winner: TeamSide | null
  round: number
  reason: string
  pveMode: boolean
  npcTeam: NpcTeamData | null
  difficulty: string
  playerSide: TeamSide
}

// ── Skill drop pool (placeholder names) ──────────────────────────────────────

const SKILL_DROP_POOL = [
  'Golpe Arcano',
  'Lanca de Gelo',
  'Explosao Solar',
  'Escudo Sombrio',
  'Corte Fantasma',
  'Rajada de Vento',
  'Muralha de Ferro',
  'Toque Venenoso',
  'Flechada Trovejante',
  'Bendicao Sagrada',
  'Chuva de Meteoros',
  'Passo das Sombras',
]

// ── Reason labels ────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  king_slain:         'Rei abatido',
  simultaneous_kings: 'Empate simultaneo',
  timeout:            'Tempo esgotado',
  forfeit:            'Desistencia',
}

// ── Scene ────────────────────────────────────────────────────────────────────

export default class BattleResultScene extends Phaser.Scene {
  constructor() {
    super('BattleResultScene')
  }

  create(data: ResultData) {
    GameStateManager.set(GameState.MENU)

    const playerWon = data.winner === data.playerSide
    const isDraw    = data.winner === null

    // ── Background ──
    this.add.rectangle(W / 2, H / 2, W, H, 0x0c1018)

    // ── Central panel ──
    const panelW = 600
    const panelH = 520
    const panelX = W / 2
    const panelY = H / 2
    const panelBg = this.add.rectangle(panelX, panelY, panelW, panelH, 0x101827)
      .setStrokeStyle(2, 0x334155).setAlpha(0)
    this.tweens.add({ targets: panelBg, alpha: 1, duration: 400, ease: 'Quad.Out' })

    // ── Title ──
    let titleText: string
    let titleColor: string
    if (isDraw) {
      titleText  = 'EMPATE'
      titleColor = '#94a3b8'
    } else if (playerWon) {
      titleText  = 'VITORIA!'
      titleColor = '#fbbf24'
    } else {
      titleText  = 'DERROTA'
      titleColor = '#ef4444'
    }

    const title = this.add.text(panelX, panelY - 200, titleText, {
      fontFamily: 'Arial Black', fontSize: '48px', color: titleColor, fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setScale(0.5)
    this.tweens.add({
      targets: title, alpha: 1, scale: 1, duration: 500, ease: 'Back.Out', delay: 200,
    })

    // ── Battle stats ──
    let currentY = panelY - 120
    const lineDelay = 400

    const enemyName = data.pveMode && data.npcTeam
      ? data.npcTeam.name
      : 'Adversario'

    const statsLines = [
      `Rounds: ${data.round}`,
      `Inimigo: ${enemyName}`,
      `Motivo: ${REASON_LABELS[data.reason] ?? data.reason}`,
    ]

    statsLines.forEach((text, i) => {
      const line = this.add.text(panelX, currentY, text, {
        fontFamily: 'Arial', fontSize: '16px', color: '#94a3b8',
      }).setOrigin(0.5).setAlpha(0)
      this.tweens.add({
        targets: line, alpha: 1, y: currentY, duration: 350, ease: 'Quad.Out',
        delay: lineDelay + i * 150,
      })
      currentY += 30
    })

    // ── Rewards section (only if player won or draw with partial rewards) ──
    currentY += 20
    let rewardDelay = lineDelay + statsLines.length * 150 + 200

    if (playerWon) {
      // Divider
      const divider = this.add.rectangle(panelX, currentY, panelW - 80, 1, 0x334155).setAlpha(0)
      this.tweens.add({ targets: divider, alpha: 1, duration: 300, delay: rewardDelay - 100 })
      currentY += 20

      // Rewards header
      const rewardsHeader = this.add.text(panelX, currentY, 'RECOMPENSAS', {
        fontFamily: 'Arial', fontSize: '14px', color: '#64748b', fontStyle: 'bold',
      }).setOrigin(0.5).setAlpha(0)
      this.tweens.add({ targets: rewardsHeader, alpha: 1, duration: 300, delay: rewardDelay })
      currentY += 35
      rewardDelay += 200

      // Gold reward
      const goldAmount = data.pveMode && data.npcTeam ? data.npcTeam.goldReward : 100
      const goldText = this.add.text(panelX, currentY, `+${goldAmount} Gold`, {
        fontFamily: 'Arial', fontSize: '22px', color: '#fbbf24', fontStyle: 'bold',
      }).setOrigin(0.5).setAlpha(0).setScale(0.8)
      this.tweens.add({
        targets: goldText, alpha: 1, scale: 1, duration: 400, ease: 'Back.Out', delay: rewardDelay,
      })
      currentY += 38
      rewardDelay += 200

      // XP reward
      const xpAmount = data.pveMode && data.npcTeam ? data.npcTeam.xpReward : 50
      const xpText = this.add.text(panelX, currentY, `+${xpAmount} XP`, {
        fontFamily: 'Arial', fontSize: '22px', color: '#60a5fa', fontStyle: 'bold',
      }).setOrigin(0.5).setAlpha(0).setScale(0.8)
      this.tweens.add({
        targets: xpText, alpha: 1, scale: 1, duration: 400, ease: 'Back.Out', delay: rewardDelay,
      })
      currentY += 38
      rewardDelay += 200

      // Persist battle rewards
      playerData.addBattleRewards(goldAmount, xpAmount, true)
      playerData.addMastery('attack', 5)

      // Random skill drop chance (30%)
      if (Math.random() < 0.3) {
        const skillName = SKILL_DROP_POOL[Math.floor(Math.random() * SKILL_DROP_POOL.length)]
        const skillText = this.add.text(panelX, currentY, `Nova skill: ${skillName}!`, {
          fontFamily: 'Arial', fontSize: '18px', color: '#a78bfa', fontStyle: 'bold',
        }).setOrigin(0.5).setAlpha(0).setScale(0.8)
        this.tweens.add({
          targets: skillText, alpha: 1, scale: 1, duration: 500, ease: 'Back.Out', delay: rewardDelay,
        })
        currentY += 38
        rewardDelay += 200
      }
    } else {
      // Persist loss (no gold/xp on loss)
      playerData.addBattleRewards(0, 0, false)
    }

    // ── Buttons ──
    const btnY = panelY + panelH / 2 - 50
    const btnDelay = rewardDelay + 200

    // "Jogar Novamente" button
    const playAgainBtn = this.add.rectangle(panelX - 120, btnY, 200, 44, 0x1e3a5f)
      .setStrokeStyle(2, 0x60a5fa).setInteractive({ useHandCursor: true }).setAlpha(0)
    const playAgainLabel = this.add.text(panelX - 120, btnY, 'Jogar Novamente', {
      fontFamily: 'Arial', fontSize: '15px', color: '#60a5fa', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0)

    this.tweens.add({ targets: [playAgainBtn, playAgainLabel], alpha: 1, duration: 300, delay: btnDelay })

    playAgainBtn.on('pointerover', () => { playAgainBtn.setFillStyle(0x263f6a); playAgainLabel.setColor('#93c5fd') })
    playAgainBtn.on('pointerout',  () => { playAgainBtn.setFillStyle(0x1e3a5f); playAgainLabel.setColor('#60a5fa') })
    playAgainBtn.on('pointerdown', () => {
      if (data.pveMode && data.npcTeam) {
        this.scene.start('DeckBuildScene', { pveMode: true, npcTeam: data.npcTeam })
      } else {
        this.scene.start('DeckBuildScene')
      }
    })

    // "Menu Principal" button
    const menuBtn = this.add.rectangle(panelX + 120, btnY, 200, 44, 0x1e293b)
      .setStrokeStyle(2, 0x475569).setInteractive({ useHandCursor: true }).setAlpha(0)
    const menuLabel = this.add.text(panelX + 120, btnY, 'Menu Principal', {
      fontFamily: 'Arial', fontSize: '15px', color: '#94a3b8', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0)

    this.tweens.add({ targets: [menuBtn, menuLabel], alpha: 1, duration: 300, delay: btnDelay })

    menuBtn.on('pointerover', () => { menuBtn.setFillStyle(0x263548); menuLabel.setColor('#f1f5f9') })
    menuBtn.on('pointerout',  () => { menuBtn.setFillStyle(0x1e293b); menuLabel.setColor('#94a3b8') })
    menuBtn.on('pointerdown', () => this.scene.start('LobbyScene'))
  }
}
