import Phaser from 'phaser'
import { UI } from '../utils/UIComponents'
import { transitionTo } from '../utils/SceneTransition'
import {
  SCREEN,
  surface, border, accent, fg, state,
  fontFamily, typeScale, radii,
} from '../utils/DesignTokens'
import { getClassSigilKey } from '../utils/AssetPaths'
import { t } from '../i18n'

// ─── Layout ─────────────────────────────────────────────────────────────────

const W = SCREEN.W
const H = SCREEN.H

// ─── Scene data ─────────────────────────────────────────────────────────────

/**
 * Incoming config for the matchmaking scene.
 *
 * `returnTo` is the scene key to bounce back to on cancel — the lobby
 * where the player pressed "INICIAR BATALHA". Origin scenes MUST supply a
 * `returnTo` so we never orphan the player.
 *
 * `returnData` carries whatever state the origin scene needs to restore on
 * its own — room config, last tab, etc. We don't touch it; just forward.
 */
export interface MatchmakingData {
  mode:        'ranked' | 'casual' | 'pve'
  playerCount: 1 | 2 | 4
  returnTo:    string
  returnData?: Record<string, unknown>
}

// ─── Tips (flavor rotating during the wait) ─────────────────────────────────

const TIPS: string[] = [
  'O Rei vivo é sua condição de vitória. Proteja-o acima de tudo.',
  'Cura é limitada a 2 por turno — use o terceiro slot com intenção.',
  'Dano a partir do turno 12 ganha +10% por turno em overtime.',
  'Sangramento dobra o valor de Corte Mortal e Tempestade de Lâminas.',
  'Um Executor isolado bate mais forte, mas toma 10% mais de dano.',
  'Especialistas removem até três debuffs de aliados num único turno.',
  'Escudos stackam até 100 HP — acima disso, sobrescrevem o mais fraco.',
  'Cartas na mão rodam após usar: planeje a sequência, não só a jogada.',
]

// ─── Mode labels ────────────────────────────────────────────────────────────

const MODE_TITLE: Record<MatchmakingData['mode'], string> = {
  ranked: 'RANQUEADA',
  casual: 'CASUAL',
  pve:    'TREINO',
}

const COUNT_LABEL: Record<1 | 2 | 4, string> = {
  1: '1v1',
  2: '2v2',
  4: '4v4',
}

// ─── Scene ──────────────────────────────────────────────────────────────────

export default class MatchmakingScene extends Phaser.Scene {
  private returnTo:   string = 'LobbyScene'
  private returnData: Record<string, unknown> = {}
  private mode:       MatchmakingData['mode'] = 'casual'
  private playerCount: 1 | 2 | 4 = 1

  // UI refs
  private sigilImg: Phaser.GameObjects.Image | null = null
  private timerText: Phaser.GameObjects.Text | null = null
  private progressFill: Phaser.GameObjects.Graphics | null = null
  private queueCountText: Phaser.GameObjects.Text | null = null
  private tipText: Phaser.GameObjects.Text | null = null

  // State
  private elapsed = 0
  private tickEvent: Phaser.Time.TimerEvent | null = null
  private tipRotator: Phaser.Time.TimerEvent | null = null
  private queuePulse:  Phaser.Time.TimerEvent | null = null
  private tipIndex = 0

  constructor() {
    super('MatchmakingScene')
  }

  create(data: MatchmakingData) {
    this.mode = data?.mode ?? 'casual'
    this.playerCount = data?.playerCount ?? 1
    this.returnTo = data?.returnTo ?? 'LobbyScene'
    this.returnData = data?.returnData ?? {}
    this.elapsed = 0
    this.tipIndex = Math.floor(Math.random() * TIPS.length)

    this._drawBackground()
    this._drawHeaderBand()
    this._drawCentralCard()
    this._drawTipRow()
    this._drawCancelButton()
    this._startTicker()

    UI.fadeIn(this)
  }

  // ── Background ──

  private _drawBackground() {
    // Deep backdrop + subtle particles (reuses UI.particles helper, same
    // visual vocabulary as Lobby / Menu scenes)
    this.add.rectangle(W / 2, H / 2, W, H, surface.deepest).setDepth(0)
    UI.particles(this, 14)
    // Very subtle radial-ish vignette using 2 overlapping rectangles
    const veil = this.add.graphics().setDepth(1)
    veil.fillStyle(0x000000, 0.35)
    veil.fillRect(0, 0, W, H)
  }

  // ── Header band (top): mode + player count ──

  private _drawHeaderBand() {
    const bandH = 56
    const bandY = 0

    const bandG = this.add.graphics().setDepth(2)
    bandG.fillStyle(surface.panel, 0.95)
    bandG.fillRect(0, bandY, W, bandH)
    bandG.fillStyle(border.subtle, 1)
    bandG.fillRect(0, bandY + bandH - 1, W, 1)

    const modeTitle = `${MODE_TITLE[this.mode]}  ·  ${COUNT_LABEL[this.playerCount]}`
    this.add.text(W / 2, bandY + bandH / 2, modeTitle, {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h2,
      color:      accent.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setDepth(3).setLetterSpacing(3)
  }

  // ── Central card: sigil + title + progress + info ──

  private _drawCentralCard() {
    const cardW = 560
    const cardH = 360
    const cardX = W / 2
    const cardY = H / 2 - 20

    // Glow halo behind the card
    const halo = this.add.graphics().setDepth(2)
    halo.fillStyle(accent.primary, 0.08)
    halo.fillRoundedRect(cardX - cardW / 2 - 18, cardY - cardH / 2 - 18,
      cardW + 36, cardH + 36, radii.xl + 6)
    this.tweens.add({
      targets: halo,
      alpha: { from: 0.4, to: 1 },
      duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Card frame
    const cardG = this.add.graphics().setDepth(3)
    cardG.fillStyle(0x000000, 0.55)
    cardG.fillRoundedRect(cardX - cardW / 2 + 4, cardY - cardH / 2 + 8, cardW, cardH, radii.xl)
    cardG.fillStyle(surface.panel, 1)
    cardG.fillRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, radii.xl)
    cardG.fillStyle(0xffffff, 0.04)
    cardG.fillRoundedRect(cardX - cardW / 2 + 2, cardY - cardH / 2 + 2, cardW - 4, 20,
      { tl: radii.xl - 1, tr: radii.xl - 1, bl: 0, br: 0 })
    cardG.lineStyle(1, border.default, 1)
    cardG.strokeRoundedRect(cardX - cardW / 2, cardY - cardH / 2, cardW, cardH, radii.xl)

    // Rotating sigil — chooses class based on mode so Ranked feels royal (rei),
    // PvE feels training-ish (especialista), Casual keeps the warrior ethos.
    const sigilClass = this.mode === 'ranked' ? 'king'
      : this.mode === 'pve' ? 'specialist' : 'warrior'
    const sigilKey = getClassSigilKey(sigilClass as never)
    const sigilY = cardY - cardH / 2 + 90
    const sigilSize = 96
    this.sigilImg = this.add.image(cardX, sigilY, sigilKey)
      .setDisplaySize(sigilSize, sigilSize)
      .setTintFill(accent.primary)
      .setDepth(4)
      .setAlpha(0.95)

    // Gold glow ring behind the sigil
    const ring = this.add.graphics().setDepth(3)
    ring.fillStyle(accent.primary, 0.14)
    ring.fillCircle(cardX, sigilY, sigilSize / 2 + 12)

    // Rotate sigil + pulse ring
    this.tweens.add({
      targets: this.sigilImg,
      angle: 360, duration: 6000, repeat: -1, ease: 'Linear',
    })
    this.tweens.add({
      targets: ring,
      alpha: { from: 0.4, to: 1 },
      scale: { from: 1, to: 1.06 },
      duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })

    // Title (h1 Cinzel) — "PROCURANDO ADVERSÁRIO"
    const titleY = sigilY + sigilSize / 2 + 26
    this.add.text(cardX, titleY, t('scenes.matchmaking.searching'), {
      fontFamily: fontFamily.display,
      fontSize:   typeScale.h1,
      color:      fg.primaryHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setDepth(4).setLetterSpacing(3)

    // Progress bar + queue timer
    const barY = titleY + 44
    const barW = 360
    const barH = 6
    const track = this.add.graphics().setDepth(4)
    track.fillStyle(surface.deepest, 1)
    track.fillRoundedRect(cardX - barW / 2, barY - barH / 2, barW, barH, barH / 2)
    track.lineStyle(1, border.subtle, 1)
    track.strokeRoundedRect(cardX - barW / 2, barY - barH / 2, barW, barH, barH / 2)

    // Fill — indeterminate progress (ease back to 70% on every 3s loop,
    // classic "fake progress" feel used by most queue screens).
    this.progressFill = this.add.graphics().setDepth(5)
    const redrawFill = (ratio: number) => {
      this.progressFill!.clear()
      const fw = Math.max(6, barW * ratio)
      this.progressFill!.fillStyle(accent.primary, 1)
      this.progressFill!.fillRoundedRect(cardX - barW / 2, barY - barH / 2, fw, barH, barH / 2)
    }
    const progressProxy = { r: 0 }
    redrawFill(0)
    this.tweens.add({
      targets: progressProxy,
      r: 0.98,
      duration: 3200, ease: 'Cubic.Out', yoyo: false, repeat: -1,
      onUpdate: () => redrawFill(progressProxy.r),
      onRepeat: () => { progressProxy.r = 0.55 },
    })

    // Timer label above the bar, right-aligned
    this.timerText = this.add.text(cardX + barW / 2, barY - 22, '00:00', {
      fontFamily: fontFamily.mono,
      fontSize:   typeScale.statMd,
      color:      fg.primaryHex,
      fontStyle:  '700',
    }).setOrigin(1, 1).setDepth(5)
    this.add.text(cardX - barW / 2, barY - 22, t('scenes.matchmaking.queue-time'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      fg.tertiaryHex,
      fontStyle:  '700',
    }).setOrigin(0, 1).setDepth(5).setLetterSpacing(1.6)

    // Info row: fake queue population (visual; does not drive backend)
    const infoY = barY + 34
    this.queueCountText = this.add.text(cardX, infoY,
      'Jogadores na fila: 1.248   ·   Ping: 38 ms', {
        fontFamily: fontFamily.body,
        fontSize:   typeScale.small,
        color:      fg.tertiaryHex,
        fontStyle:  '500',
      }).setOrigin(0.5).setDepth(5)

    // Slow pulse on queue count (simulates updates)
    this.queuePulse = this.time.addEvent({
      delay: 3500, loop: true,
      callback: () => {
        if (!this.queueCountText) return
        const players = 1200 + Math.floor(Math.random() * 150)
        const ping = 30 + Math.floor(Math.random() * 20)
        this.queueCountText.setText(
          `Jogadores na fila: ${players.toLocaleString('pt-BR')}   ·   Ping: ${ping} ms`,
        )
      },
    })
  }

  // ── Flavor tips row (below the card) ──

  private _drawTipRow() {
    const y = H - 130
    this.add.text(W / 2, y - 16, t('scenes.matchmaking.tip-eyebrow'), {
      fontFamily: fontFamily.body,
      fontSize:   typeScale.meta,
      color:      accent.dimHex,
      fontStyle:  '700',
    }).setOrigin(0.5).setDepth(3).setLetterSpacing(1.6)

    this.tipText = this.add.text(W / 2, y + 10, TIPS[this.tipIndex], {
      fontFamily: fontFamily.serif,
      fontSize:   typeScale.body,
      color:      fg.secondaryHex,
      fontStyle:  'italic',
      wordWrap:   { width: 780 },
      align:      'center',
    }).setOrigin(0.5).setDepth(3)

    this.tipRotator = this.time.addEvent({
      delay: 5200, loop: true,
      callback: () => this._rotateTip(),
    })
  }

  private _rotateTip() {
    if (!this.tipText) return
    this.tweens.add({
      targets: this.tipText, alpha: 0, duration: 240, ease: 'Quad.Out',
      onComplete: () => {
        if (!this.tipText) return
        this.tipIndex = (this.tipIndex + 1) % TIPS.length
        this.tipText.setText(TIPS[this.tipIndex])
        this.tweens.add({ targets: this.tipText, alpha: 1, duration: 240 })
      },
    })
  }

  // ── Cancel button ──

  private _drawCancelButton() {
    const { container } = UI.buttonSecondary(this, W / 2, H - 44, 'CANCELAR', {
      w: 200, h: 44,
      onPress: () => this._cancel(),
    })
    container.setDepth(5)
  }

  // ── Ticker ──

  private _startTicker() {
    this.tickEvent = this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        this.elapsed += 1
        const mm = Math.floor(this.elapsed / 60).toString().padStart(2, '0')
        const ss = (this.elapsed % 60).toString().padStart(2, '0')
        this.timerText?.setText(`${mm}:${ss}`)
        // Shift timer color to warn amber past 60s, then error red past 120s
        if (this.elapsed >= 120) this.timerText?.setColor(state.errorHex)
        else if (this.elapsed >= 60) this.timerText?.setColor(state.warnHex)
      },
    })
  }

  // ── Cancel → return to origin lobby ──

  private _cancel() {
    this.tickEvent?.destroy()
    this.tipRotator?.destroy()
    this.queuePulse?.destroy()
    transitionTo(this, this.returnTo, this.returnData)
  }

  shutdown() {
    this.tickEvent?.destroy()
    this.tipRotator?.destroy()
    this.queuePulse?.destroy()
    this.tweens.killAll()
  }
}
