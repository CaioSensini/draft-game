import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import type { TeamSide } from '../types'
import { playerData } from '../utils/PlayerDataManager'
import { transitionTo } from '../utils/SceneTransition'
import { UI } from '../utils/UIComponents'
import { C, F, S, SHADOW, SCREEN } from '../utils/DesignTokens'
import { showPackOpen, type DroppedSkill } from '../utils/PackOpenAnimation'
import { SKILL_CATALOG } from '../data/skillCatalog'

// ── Layout constants ─────────────────────────────────────────────────────────

const W = SCREEN.W
const H = SCREEN.H

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

// ── Shared particles (now delegated to UI.particles) ─────────────────────────

function spawnConfetti(scene: Phaser.Scene, count = 40) {
  const { width } = scene.scale
  const colors = [C.gold, C.success, C.gold, C.info, C.purple]
  for (let i = 0; i < count; i++) {
    const px = Math.random() * width
    const py = -20 - Math.random() * 100
    const size = 2 + Math.random() * 4
    const color = colors[Math.floor(Math.random() * colors.length)]
    const p = scene.add.rectangle(px, py, size, size * 1.5, color, 0.8 + Math.random() * 0.2)
      .setDepth(50)
    scene.tweens.add({
      targets: p,
      y: 750 + Math.random() * 100,
      x: px + (Math.random() - 0.5) * 200,
      angle: Math.random() * 720,
      alpha: 0,
      duration: 2500 + Math.random() * 2000,
      delay: Math.random() * 1000,
      ease: 'Quad.In',
      onComplete: () => p.destroy(),
    })
  }
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
    UI.background(this)
    UI.particles(this, 18)

    // ── Central panel with shadow + gold trim ──
    const panelW = 600
    const panelH = 520
    const panelX = W / 2
    const panelY = H / 2

    const panelGfx = UI.panel(this, panelX, panelY, panelW, panelH, { radius: 10 })
    panelGfx.setAlpha(0)
    this.tweens.add({ targets: panelGfx, alpha: 1, duration: 400, ease: 'Quad.Out' })

    // ── Victory confetti ──
    if (playerWon) {
      this.time.delayedCall(300, () => spawnConfetti(this, 50))
      this.time.delayedCall(800, () => spawnConfetti(this, 30))
    }

    // ── Title ──
    let titleText: string
    let titleColor: string
    let titleShadow: { offsetX: number; offsetY: number; color: string; blur: number; fill: boolean }
    if (isDraw) {
      titleText  = 'EMPATE'
      titleColor = C.mutedHex
      titleShadow = { ...SHADOW.strong }
    } else if (playerWon) {
      titleText  = 'VITORIA!'
      titleColor = C.goldHex
      titleShadow = { ...SHADOW.goldGlow }
    } else {
      titleText  = 'DERROTA'
      titleColor = C.dangerHex
      titleShadow = { offsetX: 0, offsetY: 2, color: '#3a1515', blur: 10, fill: true }
    }

    const title = this.add.text(panelX, panelY - 200, titleText, {
      fontFamily: F.title, fontSize: playerWon ? '48px' : '42px', color: titleColor, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: playerWon ? 4 : 2,
      shadow: titleShadow,
    }).setOrigin(0.5).setAlpha(0).setScale(0.3)

    if (playerWon) {
      // Bounce-in with golden sparkle
      this.tweens.add({
        targets: title, alpha: 1, scale: 1, duration: 700, ease: 'Back.Out', delay: 200,
        onComplete: () => {
          // Scale pulse
          this.tweens.add({
            targets: title, scale: 1.04, duration: 600, yoyo: true, repeat: 2, ease: 'Sine.InOut',
          })
          // Golden sparkle particles around title
          for (let i = 0; i < 12; i++) {
            const sx = panelX + (Math.random() - 0.5) * 300
            const sy = panelY - 200 + (Math.random() - 0.5) * 40
            const spark = this.add.circle(sx, sy, 2, 0xfbbf24, 0.9).setDepth(40)
            this.tweens.add({
              targets: spark,
              y: sy - 30 - Math.random() * 40,
              x: sx + (Math.random() - 0.5) * 60,
              alpha: 0,
              scale: 0,
              duration: 600 + Math.random() * 400,
              delay: i * 50,
              onComplete: () => spark.destroy(),
            })
          }
        },
      })
    } else if (!isDraw) {
      // Defeat: dramatic red glow pulse
      this.tweens.add({
        targets: title, alpha: 1, scale: 1, duration: 500, ease: 'Back.Out', delay: 200,
        onComplete: () => {
          // Red glow pulsing (simulate with alpha)
          this.tweens.add({
            targets: title, alpha: 0.6, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
          })
        },
      })
    } else {
      this.tweens.add({
        targets: title, alpha: 1, scale: 1, duration: 500, ease: 'Back.Out', delay: 200,
      })
    }

    // ── Battle stats with slide + fade stagger ──
    let currentY = panelY - 110
    const lineDelay = 500

    const enemyName = data.pveMode && data.npcTeam
      ? data.npcTeam.name
      : 'Adversario'

    const statsLines = [
      `Rounds: ${data.round}`,
      `Inimigo: ${enemyName}`,
      `Motivo: ${REASON_LABELS[data.reason] ?? data.reason}`,
    ]

    statsLines.forEach((text, i) => {
      const startX = panelX - 40
      const line = this.add.text(startX, currentY, text, {
        fontFamily: F.body, fontSize: S.body, color: C.mutedHex,
        shadow: SHADOW.text,
      }).setOrigin(0.5).setAlpha(0)
      this.tweens.add({
        targets: line, alpha: 1, x: panelX, duration: 350, ease: 'Quad.Out',
        delay: lineDelay + i * 300,
      })
      currentY += 30
    })

    // ── Rewards section (only if player won) ──
    currentY += 20
    let rewardDelay = lineDelay + statsLines.length * 300 + 300

    if (playerWon) {
      // Divider
      const divider = this.add.rectangle(panelX, currentY, panelW - 80, 1, C.panelBorder, 0.4).setAlpha(0)
      this.tweens.add({ targets: divider, alpha: 1, duration: 300, delay: rewardDelay - 100 })
      currentY += 20

      // Rewards header
      const rewardsHeader = this.add.text(panelX, currentY, 'RECOMPENSAS', {
        fontFamily: F.title, fontSize: S.titleSmall, color: C.goldDimHex, fontStyle: 'bold',
        shadow: SHADOW.text,
      }).setOrigin(0.5).setAlpha(0)
      this.tweens.add({ targets: rewardsHeader, alpha: 1, duration: 300, delay: rewardDelay })
      currentY += 35
      rewardDelay += 300

      // Gold reward - slide in from left
      const goldAmount = data.pveMode && data.npcTeam ? data.npcTeam.goldReward : 100
      const goldText = this.add.text(panelX - 60, currentY, `\uD83E\uDE99 +${goldAmount} Gold`, {
        fontFamily: F.title, fontSize: '24px', color: C.goldHex, fontStyle: 'bold',
        shadow: SHADOW.goldGlow,
      }).setOrigin(0.5).setAlpha(0)
      this.tweens.add({
        targets: goldText, alpha: 1, x: panelX, duration: 400, ease: 'Back.Out', delay: rewardDelay,
      })
      currentY += 42
      rewardDelay += 300

      // XP reward - slide in from left
      const xpAmount = data.pveMode && data.npcTeam ? data.npcTeam.xpReward : 50
      const xpText = this.add.text(panelX - 60, currentY, `\u2B50 +${xpAmount} XP`, {
        fontFamily: F.title, fontSize: '24px', color: C.infoHex, fontStyle: 'bold',
        shadow: SHADOW.strong,
      }).setOrigin(0.5).setAlpha(0)
      this.tweens.add({
        targets: xpText, alpha: 1, x: panelX, duration: 400, ease: 'Back.Out', delay: rewardDelay,
      })
      currentY += 42
      rewardDelay += 300

      // Persist battle rewards
      playerData.addBattleRewards(goldAmount, xpAmount, true)
      playerData.addMastery('attack', 5)

      // Random skill drop chance (30%) with pack-open animation
      if (Math.random() < 0.3) {
        const skillName = SKILL_DROP_POOL[Math.floor(Math.random() * SKILL_DROP_POOL.length)]

        // Determine unit class from skill catalog if possible
        const catalogEntry = SKILL_CATALOG.find(s => s.name === skillName)
        const classPrefix = catalogEntry ? catalogEntry.id.substring(0, 2) : 'ls'
        const classMap: Record<string, string> = { lk: 'king', lw: 'warrior', ls: 'specialist', le: 'executor' }
        const droppedSkillClass = classMap[classPrefix] ?? 'specialist'
        const droppedSkillId = catalogEntry?.id ?? ''

        // Add to inventory: increment progress if owned, otherwise add new
        const existingSkill = playerData.getSkills().find(s => s.skillId === droppedSkillId)
        if (existingSkill) {
          playerData.addSkillProgress(droppedSkillId)
        } else if (droppedSkillId) {
          playerData.addSkill(droppedSkillId, droppedSkillClass)
        }

        // Read UPDATED state for correct progress display
        const updatedOwned = playerData.getSkills().find(s => s.skillId === droppedSkillId)

        // Build DroppedSkill for the pack animation with real progress
        const droppedSkill: DroppedSkill = {
          name: skillName,
          unitClass: droppedSkillClass,
          effectType: catalogEntry?.effectType ?? 'damage',
          power: catalogEntry?.power ?? 0,
          description: catalogEntry?.description ?? '',
          group: catalogEntry?.group ?? 'attack1',
          level: updatedOwned?.level ?? 1,
          progress: updatedOwned?.progress ?? 0,
          skillId: droppedSkillId,
          isProgressGain: !!existingSkill,
        }

        // Skill card background
        const cardW = 240
        const cardH = 44
        const cardBg = this.add.rectangle(panelX, currentY, cardW, cardH, 0x1a1030)
          .setStrokeStyle(2, 0xa78bfa, 0.7).setAlpha(0).setScale(0, 1)

        const skillText = this.add.text(panelX, currentY, `Nova skill: ${skillName}!`, {
          fontFamily: F.body, fontSize: S.body, color: C.purpleHex, fontStyle: 'bold',
          shadow: SHADOW.strong,
        }).setOrigin(0.5).setAlpha(0).setScale(0, 1)

        // Card flip animation: scaleX 0 -> 1, then trigger pack open
        this.tweens.add({
          targets: [cardBg, skillText],
          scaleX: 1,
          alpha: 1,
          duration: 500,
          ease: 'Back.Out',
          delay: rewardDelay,
          onComplete: () => {
            // Sparkle after reveal
            for (let i = 0; i < 8; i++) {
              const sx = panelX + (Math.random() - 0.5) * cardW
              const sy = currentY + (Math.random() - 0.5) * cardH
              const spark = this.add.circle(sx, sy, 2, 0xa78bfa, 0.9)
              this.tweens.add({
                targets: spark,
                y: sy - 20 - Math.random() * 20,
                alpha: 0,
                duration: 500,
                delay: i * 40,
                onComplete: () => spark.destroy(),
              })
            }
            // Pack open animation with full skill card
            showPackOpen(this.scene.scene, [droppedSkill])
          },
        })
        currentY += 48
        rewardDelay += 300
      }
    } else {
      // Persist loss (no gold/xp on loss)
      playerData.addBattleRewards(0, 0, false)
    }

    // ── Buttons ──
    const btnY = panelY + panelH / 2 - 50
    const btnDelay = rewardDelay + 200

    // "Jogar Novamente" — Primary gold CTA (INTEGRATION_SPEC §1.1).
    const { container: playAgainC } = UI.buttonPrimary(
      this, panelX - 120, btnY, 'Jogar Novamente',
      {
        w: 200, h: S.buttonH,
        onPress: () => {
          if (data.pveMode && data.npcTeam) {
            transitionTo(this, 'DeckBuildScene', { pveMode: true, npcTeam: data.npcTeam })
          } else {
            transitionTo(this, 'DeckBuildScene')
          }
        },
      },
    )
    playAgainC.setAlpha(0)
    this.tweens.add({
      targets: playAgainC, alpha: 1, duration: 300, delay: btnDelay,
      onComplete: () => {
        this.tweens.add({
          targets: playAgainC, scaleX: 1.03, scaleY: 1.03,
          duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
        })
      },
    })

    // "Menu Principal" — Secondary outline (§1.2).
    const { container: menuC } = UI.buttonSecondary(
      this, panelX + 120, btnY, 'Menu Principal',
      {
        w: 200, h: S.buttonH,
        onPress: () => transitionTo(this, 'LobbyScene'),
      },
    )
    menuC.setAlpha(0)
    this.tweens.add({ targets: menuC, alpha: 1, duration: 300, delay: btnDelay })

    // Fade-in from black
    UI.fadeIn(this)
  }

  shutdown() {
    this.tweens.killAll()
  }
}
