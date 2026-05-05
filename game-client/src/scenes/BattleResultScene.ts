import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import type { TeamSide } from '../types'
import { playerData, RAID_VICTORY_GOLD } from '../utils/PlayerDataManager'
import { transitionTo } from '../utils/SceneTransition'
import { UI } from '../utils/UIComponents'
import {
  SCREEN,
  surface, border, accent, fg, state, hpState,
  fontFamily, typeScale, radii,
} from '../utils/DesignTokens'
import { showPackOpen, type DroppedSkill } from '../utils/PackOpenAnimation'
import { SKILL_CATALOG } from '../data/skillCatalog'
import { getXPForLevel } from '../data/progression'
import { t } from '../i18n'

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
  pveMode: boolean | string
  npcTeam: NpcTeamData | null
  difficulty: string
  playerSide: TeamSide
  /**
   * Set when the battle was launched as an Offline Raid. The standard
   * gold/XP loot still flows through `npcTeam`; the raid-specific
   * Mastery bonus (Attack on win) is applied here using these numbers.
   */
  raidTarget?: {
    id: string
    ownerName: string
    ownerLevel: number
    rewardEstimate: { masteryAttack: number; masteryDefense: number; gold: number }
  }
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

// Mapping from internal reason ids to i18n keys (translated at draw time so
// the UI updates when the user switches languages between battles).
const REASON_KEYS: Record<string, string> = {
  king_slain:         'scenes.battle-result.reasons.king-slain',
  simultaneous_kings: 'scenes.battle-result.reasons.simultaneous-kings',
  timeout:            'scenes.battle-result.reasons.timeout',
  forfeit:            'scenes.battle-result.reasons.forfeit',
}

// ── Shared confetti ─────────────────────────────────────────────────────────

function spawnConfetti(scene: Phaser.Scene, count = 40) {
  const { width } = scene.scale
  const colors = [accent.primary, state.success, accent.hot, state.info, hpState.shield]
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

    // Snapshot XP state BEFORE applying rewards so we can animate the bar
    // from pre → post with a real before/after.
    const levelBefore = playerData.getLevel()
    const xpBefore    = playerData.getXP()

    // ── Background ──
    UI.background(this)
    UI.particles(this, 18)

    // Dim veil for contrast against particles
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.28).setDepth(1)

    // ── Central panel — surface.panel + border.default + radii.xl ──
    const panelW = 640
    const panelH = 560
    const panelX = W / 2
    const panelY = H / 2

    const panelBg = this.add.graphics().setDepth(2)
    panelBg.fillStyle(0x000000, 0.55)
    panelBg.fillRoundedRect(panelX - panelW / 2 + 4, panelY - panelH / 2 + 8, panelW, panelH, radii.xl)
    panelBg.fillStyle(surface.panel, 1)
    panelBg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, radii.xl)
    panelBg.fillStyle(0xffffff, 0.05)
    panelBg.fillRoundedRect(panelX - panelW / 2 + 2, panelY - panelH / 2 + 2, panelW - 4, 22,
      { tl: radii.xl - 1, tr: radii.xl - 1, bl: 0, br: 0 })
    panelBg.lineStyle(1, border.default, 1)
    panelBg.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, radii.xl)
    panelBg.setAlpha(0)
    this.tweens.add({ targets: panelBg, alpha: 1, duration: 400, ease: 'Quad.Out' })

    // Victory confetti
    if (playerWon) {
      this.time.delayedCall(300, () => spawnConfetti(this, 50))
      this.time.delayedCall(800, () => spawnConfetti(this, 30))
    }

    // ── Title — Cinzel display, colored by outcome ──
    let titleText: string
    let titleColor: string
    if (isDraw) {
      titleText  = t('scenes.battle-result.title.draw')
      titleColor = fg.tertiaryHex
    } else if (playerWon) {
      titleText  = t('scenes.battle-result.title.victory')
      titleColor = accent.primaryHex
    } else {
      titleText  = t('scenes.battle-result.title.defeat')
      titleColor = state.errorHex
    }

    const titleSize = playerWon ? typeScale.displayLg : typeScale.displayMd
    const title = this.add.text(panelX, panelY - 220, titleText, {
      fontFamily: fontFamily.display,
      fontSize:   titleSize,
      color:      titleColor,
      fontStyle:  '900',
    }).setOrigin(0.5).setDepth(3).setAlpha(0).setScale(0.3).setLetterSpacing(4)

    if (playerWon) {
      this.tweens.add({
        targets: title, alpha: 1, scale: 1, duration: 700, ease: 'Back.Out', delay: 200,
        onComplete: () => {
          this.tweens.add({
            targets: title, scale: 1.04, duration: 600, yoyo: true, repeat: 2, ease: 'Sine.InOut',
          })
          // Golden sparkles around the title
          for (let i = 0; i < 12; i++) {
            const sx = panelX + (Math.random() - 0.5) * 320
            const sy = panelY - 220 + (Math.random() - 0.5) * 48
            const spark = this.add.circle(sx, sy, 2, accent.primary, 0.9).setDepth(40)
            this.tweens.add({
              targets: spark,
              y: sy - 30 - Math.random() * 40,
              x: sx + (Math.random() - 0.5) * 60,
              alpha: 0, scale: 0,
              duration: 600 + Math.random() * 400,
              delay: i * 50,
              onComplete: () => spark.destroy(),
            })
          }
        },
      })
    } else if (!isDraw) {
      this.tweens.add({
        targets: title, alpha: 1, scale: 1, duration: 500, ease: 'Back.Out', delay: 200,
        onComplete: () => {
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

    // Subtitle meta — rounds + reason
    const subMetaY = panelY - 180
    const enemyName = data.pveMode && data.npcTeam
      ? data.npcTeam.name
      : t('scenes.battle-result.opponent-fallback')
    const reasonKey = REASON_KEYS[data.reason]
    const reasonLabel = reasonKey ? t(reasonKey) : data.reason
    const subMeta = this.add.text(panelX, subMetaY,
      t('scenes.battle-result.sub-meta', { round: data.round, enemy: enemyName, reason: reasonLabel }), {
        fontFamily: fontFamily.serif,
        fontSize:   typeScale.small,
        color:      fg.tertiaryHex,
        fontStyle:  'italic',
    }).setOrigin(0.5).setDepth(3).setAlpha(0)
    this.tweens.add({ targets: subMeta, alpha: 1, duration: 400, delay: 600 })

    // ── Stats row (mini chips) — just the round cards ──
    // kept minimal: the meta row above already conveys the same info, but
    // we include a subtle divider as visual separation
    let currentY = panelY - 140

    const divider1 = this.add.graphics().setDepth(3)
    divider1.fillStyle(border.subtle, 0.8)
    divider1.fillRect(panelX - panelW / 2 + 40, currentY, panelW - 80, 1)
    divider1.setAlpha(0)
    this.tweens.add({ targets: divider1, alpha: 1, duration: 300, delay: 650 })
    currentY += 26

    // ── Rewards section ──
    let rewardDelay = 900

    if (playerWon) {
      // Header
      const rewardsHeader = this.add.text(panelX, currentY, t('scenes.battle-result.rewards-header'), {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.meta,
        color:      fg.tertiaryHex,
        fontStyle:  '700',
      }).setOrigin(0.5).setDepth(3).setAlpha(0).setLetterSpacing(1.8)
      this.tweens.add({ targets: rewardsHeader, alpha: 1, duration: 300, delay: rewardDelay })
      currentY += 34
      rewardDelay += 300

      // ── XP panel (560 × 96, INTEGRATION_SPEC §S4) ──
      const xpAmount = data.pveMode && data.npcTeam ? data.npcTeam.xpReward : 50
      const xpPanelW = 480
      const xpPanelH = 86
      this._drawXpPanel(
        panelX, currentY + xpPanelH / 2, xpPanelW, xpPanelH,
        levelBefore, xpBefore, xpAmount, rewardDelay,
      )
      currentY += xpPanelH + 14
      rewardDelay += 420

      // ── Gold pill (currencyPill kit) ──
      // Offline raids award a fixed 100 gold "stolen" from the defender
      // (per the standardised raid rules), regardless of the target's
      // level — keeps the economy predictable across players. Standard
      // PvE keeps its scaled goldReward.
      const isRaid = !!data.raidTarget
      const goldAmount = isRaid
        ? RAID_VICTORY_GOLD
        : (data.pveMode && data.npcTeam ? data.npcTeam.goldReward : 100)
      const goldPill = UI.currencyPill(this, panelX, currentY + 16, {
        kind: 'gold', amount: goldAmount,
      }).setDepth(3).setAlpha(0)
      this.tweens.add({ targets: goldPill, alpha: 1, duration: 300, delay: rewardDelay })

      // "+N" chip to the right of the pill (success green)
      const plusLabel = this.add.text(panelX + 80, currentY + 16, `+${goldAmount}`, {
        fontFamily: fontFamily.mono,
        fontSize:   typeScale.small,
        color:      state.successHex,
        fontStyle:  '700',
      }).setOrigin(0, 0.5).setDepth(3).setAlpha(0)
      this.tweens.add({ targets: plusLabel, alpha: 1, duration: 300, delay: rewardDelay })
      currentY += 44
      rewardDelay += 300

      // Persist rewards. Raid victories ride the standardised
      // applyRaidAttackVictory helper (+1 Attack Mastery + 100 gold);
      // we still pump XP through addBattleRewards so the level-up flow
      // fires. Standard PvE keeps the legacy +5 mastery.
      if (isRaid) {
        playerData.addBattleRewards(0, xpAmount, true)
        playerData.applyRaidAttackVictory()
      } else {
        playerData.addBattleRewards(goldAmount, xpAmount, true)
        playerData.addMastery('attack', 5)
      }

      // Random skill drop chance (30%) — unchanged logic
      if (Math.random() < 0.3) {
        const skillName = SKILL_DROP_POOL[Math.floor(Math.random() * SKILL_DROP_POOL.length)]

        const catalogEntry = SKILL_CATALOG.find(s => s.name === skillName)
        const classPrefix = catalogEntry ? catalogEntry.id.substring(0, 2) : 'ls'
        const classMap: Record<string, string> = { lk: 'king', lw: 'warrior', ls: 'specialist', le: 'executor' }
        const droppedSkillClass = classMap[classPrefix] ?? 'specialist'
        const droppedSkillId = catalogEntry?.id ?? ''

        const existingSkill = playerData.getSkills().find(s => s.skillId === droppedSkillId)
        if (existingSkill) {
          playerData.addSkillProgress(droppedSkillId)
        } else if (droppedSkillId) {
          playerData.addSkill(droppedSkillId, droppedSkillClass)
        }

        const updatedOwned = playerData.getSkills().find(s => s.skillId === droppedSkillId)

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

        // "Nova skill!" chip before the pack-open animation fires
        const chipY = currentY + 12
        const chipW = 240
        const chipH = 32
        const chipG = this.add.graphics().setDepth(3)
        chipG.fillStyle(surface.raised, 1)
        chipG.fillRoundedRect(panelX - chipW / 2, chipY - chipH / 2, chipW, chipH, radii.md)
        chipG.lineStyle(1, accent.primary, 0.7)
        chipG.strokeRoundedRect(panelX - chipW / 2, chipY - chipH / 2, chipW, chipH, radii.md)
        chipG.setAlpha(0).setScale(0, 1)

        const chipText = this.add.text(panelX, chipY, t('scenes.battle-result.new-skill', { name: skillName }), {
          fontFamily: fontFamily.serif,
          fontSize:   typeScale.small,
          color:      accent.primaryHex,
          fontStyle:  '600',
        }).setOrigin(0.5).setDepth(3).setAlpha(0).setScale(0, 1)

        this.tweens.add({
          targets: [chipG, chipText],
          scaleX: 1, alpha: 1,
          duration: 500, ease: 'Back.Out',
          delay: rewardDelay,
          onComplete: () => {
            // Sparkle burst
            for (let i = 0; i < 8; i++) {
              const sx = panelX + (Math.random() - 0.5) * chipW
              const sy = chipY + (Math.random() - 0.5) * chipH
              const spark = this.add.circle(sx, sy, 2, accent.primary, 0.9).setDepth(40)
              this.tweens.add({
                targets: spark,
                y: sy - 20 - Math.random() * 20,
                alpha: 0,
                duration: 500,
                delay: i * 40,
                onComplete: () => spark.destroy(),
              })
            }
            showPackOpen(this.scene.scene, [droppedSkill])
          },
        })
        currentY += chipH + 12
        rewardDelay += 300
      }
    } else {
      // On loss, no gold/xp awarded. Keep record for win/loss streak.
      playerData.addBattleRewards(0, 0, false)
    }

    // ── Buttons — already migrated ──
    // Sub 9.8: keep at least 64 px between the bottom-most reward element
    // (xp fraction "X / max XP" line, gold pill, or "Nova skill" chip)
    // and the action buttons. The previous panelY + panelH/2 - 46 anchor
    // could put the button row inches below the gold/chip when a skill
    // drop appeared — the 64 px floor restores breathing room.
    const minBtnY = currentY + 64
    const anchoredBtnY = panelY + panelH / 2 - 38
    const btnY = Math.max(minBtnY, anchoredBtnY)
    const btnDelay = rewardDelay + 200

    const playAgainLabel = playerWon
      ? t('scenes.battle-result.next-match')
      : !isDraw
        ? t('scenes.battle-result.try-again')
        : t('scenes.battle-result.play-again')
    const { container: playAgainC } = UI.buttonPrimary(
      this, panelX - 120, btnY, playAgainLabel,
      {
        w: 220, h: 48,
        onPress: () => {
          if (data.pveMode && data.npcTeam) {
            transitionTo(this, 'DeckBuildScene', { pveMode: true, npcTeam: data.npcTeam })
          } else {
            transitionTo(this, 'DeckBuildScene')
          }
        },
      },
    )
    playAgainC.setDepth(3).setAlpha(0)
    this.tweens.add({
      targets: playAgainC, alpha: 1, duration: 300, delay: btnDelay,
      onComplete: () => {
        this.tweens.add({
          targets: playAgainC, scaleX: 1.03, scaleY: 1.03,
          duration: 800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
        })
      },
    })

    const { container: menuC } = UI.buttonSecondary(
      this, panelX + 120, btnY, t('scenes.battle-result.back-to-lobby'),
      {
        w: 200, h: 48,
        onPress: () => transitionTo(this, 'LobbyScene'),
      },
    )
    menuC.setDepth(3).setAlpha(0)
    this.tweens.add({ targets: menuC, alpha: 1, duration: 300, delay: btnDelay })

    UI.fadeIn(this)
  }

  /**
   * XP panel — INTEGRATION_SPEC §S4 style (560 × 96).
   * Shows "NÍVEL N → N+1" with an animated progress bar + "+XP" chip.
   */
  private _drawXpPanel(
    cx: number, cy: number, w: number, h: number,
    levelBefore: number, xpBefore: number, xpGained: number, delay: number,
  ) {
    const hw = w / 2
    const hh = h / 2

    // Panel frame
    const g = this.add.graphics().setDepth(3)
    g.fillStyle(surface.raised, 1)
    g.fillRoundedRect(cx - hw, cy - hh, w, h, radii.md)
    g.lineStyle(1, border.default, 1)
    g.strokeRoundedRect(cx - hw, cy - hh, w, h, radii.md)
    g.setAlpha(0)
    this.tweens.add({ targets: g, alpha: 1, duration: 300, delay })

    // Compute bar targets
    const xpForThisLevel = getXPForLevel(levelBefore)
    const startRatio = Math.max(0, Math.min(1, xpBefore / xpForThisLevel))
    // If reward pushes past 100%, clip at 1.0 — the actual level-up is
    // handled by addBattleRewards and the next scene will reflect it. Here
    // we animate "fill to max" as the level-up cue.
    const endRatio = Math.max(startRatio, Math.min(1, (xpBefore + xpGained) / xpForThisLevel))
    const willLevelUp = xpBefore + xpGained >= xpForThisLevel

    // Header — "NÍVEL N → N+1" or "NÍVEL N"
    const headerY = cy - hh + 16
    const headerText = willLevelUp
      ? t('scenes.battle-result.xp.level-up', { from: levelBefore, to: levelBefore + 1 })
      : t('scenes.battle-result.xp.level-current', { level: levelBefore })
    const header = this.add.text(cx - hw + 16, headerY, headerText, {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      willLevelUp ? accent.primaryHex : fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 0.5).setDepth(3).setAlpha(0).setLetterSpacing(1.8)
    this.tweens.add({ targets: header, alpha: 1, duration: 300, delay: delay + 80 })

    // "+XP" chip top-right
    const plus = this.add.text(cx + hw - 16, headerY, t('scenes.battle-result.xp.gain-suffix', { xp: xpGained }), {
      fontFamily: fontFamily.mono,
      fontSize:   typeScale.statMd,
      color:      state.successHex,
      fontStyle:  '700',
    }).setOrigin(1, 0.5).setDepth(3).setAlpha(0)
    this.tweens.add({ targets: plus, alpha: 1, duration: 300, delay: delay + 80 })

    // Track bar (pill) — 452 × 12
    const barY = cy + 4
    const barW = w - 40
    const barH = 12
    const trackG = this.add.graphics().setDepth(3)
    trackG.fillStyle(surface.deepest, 1)
    trackG.fillRoundedRect(cx - barW / 2, barY - barH / 2, barW, barH, barH / 2)
    trackG.lineStyle(1, border.subtle, 1)
    trackG.strokeRoundedRect(cx - barW / 2, barY - barH / 2, barW, barH, barH / 2)
    trackG.setAlpha(0)
    this.tweens.add({ targets: trackG, alpha: 1, duration: 300, delay: delay + 80 })

    // Fill — animated from startRatio to endRatio
    const fillG = this.add.graphics().setDepth(4)
    fillG.setAlpha(0)
    const drawFill = (ratio: number) => {
      fillG.clear()
      const fw = Math.max(4, barW * ratio)
      fillG.fillStyle(accent.primary, 1)
      fillG.fillRoundedRect(cx - barW / 2, barY - barH / 2, fw, barH, barH / 2)
      // top highlight
      fillG.fillStyle(0xffffff, 0.18)
      fillG.fillRoundedRect(cx - barW / 2 + 1, barY - barH / 2 + 1, fw - 2, barH * 0.4,
        { tl: barH / 2 - 1, tr: 0, bl: barH / 2 - 1, br: 0 })
    }
    drawFill(startRatio)
    this.tweens.add({ targets: fillG, alpha: 1, duration: 300, delay: delay + 80 })

    const progressProxy = { r: startRatio }
    this.tweens.add({
      targets: progressProxy,
      r: endRatio,
      duration: 1100,
      ease: 'Quad.Out',
      delay: delay + 300,
      onUpdate: () => drawFill(progressProxy.r),
      onComplete: () => {
        if (willLevelUp) {
          // Pulse a gold halo behind the bar to cue the level-up
          const halo = this.add.graphics().setDepth(3)
          halo.fillStyle(accent.primary, 0.22)
          halo.fillRoundedRect(cx - barW / 2 - 4, barY - barH / 2 - 4, barW + 8, barH + 8, barH / 2 + 2)
          this.tweens.add({
            targets: halo, alpha: { from: 0.6, to: 0 },
            duration: 700, repeat: 1,
            onComplete: () => halo.destroy(),
          })
        }
      },
    })

    // Fractional label centered under the bar
    const fracText = this.add.text(cx, cy + hh - 14,
      t('scenes.battle-result.xp.fraction', { current: xpBefore, max: xpForThisLevel }), {
        fontFamily: fontFamily.mono,
        fontSize:   typeScale.meta,
        color:      fg.tertiaryHex,
        fontStyle:  '700',
    }).setOrigin(0.5, 0.5).setDepth(3).setAlpha(0)
    this.tweens.add({ targets: fracText, alpha: 1, duration: 300, delay: delay + 80 })
    // Update label as the bar animates
    this.tweens.add({
      targets: progressProxy,
      duration: 1100,
      delay: delay + 300,
      onUpdate: () => {
        const shown = Math.round(xpForThisLevel * progressProxy.r)
        fracText.setText(t('scenes.battle-result.xp.fraction', { current: shown, max: xpForThisLevel }))
      },
    })
  }

  shutdown() {
    this.tweens.killAll()
  }
}
