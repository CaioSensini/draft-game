import Phaser from 'phaser'
import { soundManager } from '../utils/SoundManager'
import { transitionTo } from '../utils/SceneTransition'
import { UI } from '../utils/UIComponents'
import {
  SCREEN,
  surface, border, accent, fg,
  fontFamily, typeScale, radii,
} from '../utils/DesignTokens'
import {
  t, setLang, getCurrentLang, getSupportedLangs, LANG_LABELS,
  type Lang,
} from '../i18n'

const W = SCREEN.W
const H = SCREEN.H

const TOP_BAR_H = 56

// ── Card geometry ────────────────────────────────────────────────────────────
// Three independent cards stacked vertically; each renders its own surface +
// border so the language picker is visually distinct from the audio toggle
// and the logout panel (the previous monolithic single-panel made the two
// segmented controls indistinguishable from each other).
const CARD_W       = 600
const CARD_PADDING = 24
const CARD_GAP     = 28
const SECTION_LABEL_GAP = 12   // gap between section eyebrow and card top
const FIRST_CARD_TOP = TOP_BAR_H + 36

const AUDIO_CARD_H   = 88
const LANG_CARD_H    = 96
const ACCOUNT_CARD_H = 92

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene')
  }

  create() {
    UI.background(this)
    UI.particles(this, 14)

    this._drawTopBar()
    this._drawCards()
    this._drawFooter()
    UI.fadeIn(this)
  }

  // ── Top bar ────────────────────────────────────────────────────────────────

  private _drawTopBar() {
    const bg = this.add.graphics()
    bg.fillStyle(surface.panel, 0.97)
    bg.fillRect(0, 0, W, TOP_BAR_H)
    bg.fillStyle(border.subtle, 1)
    bg.fillRect(0, TOP_BAR_H - 1, W, 1)

    UI.backArrow(this, () => {
      soundManager.playClick()
      transitionTo(this, 'LobbyScene')
    })

    this.add.text(70, TOP_BAR_H / 2, t('scenes.settings.title'), {
      fontFamily: fontFamily.display, fontSize: typeScale.h2,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(3)
  }

  // ── Card layout ────────────────────────────────────────────────────────────

  private _drawCards() {
    const cx = W / 2

    // Section eyebrow heights are folded into the cumulative offset so each
    // card pair (eyebrow + card) advances the cursor by the same amount.
    let cursorY = FIRST_CARD_TOP

    // Card 1 — ÁUDIO
    cursorY = this._drawSectionEyebrow(cx, cursorY, t('scenes.settings.sections.audio'))
    this._drawAudioCard(cx, cursorY)
    cursorY += AUDIO_CARD_H + CARD_GAP

    // Card 2 — IDIOMA (language)
    cursorY = this._drawSectionEyebrow(cx, cursorY, t('scenes.settings.sections.language'))
    this._drawLanguageCard(cx, cursorY)
    cursorY += LANG_CARD_H + CARD_GAP

    // Card 3 — CONTA (account)
    cursorY = this._drawSectionEyebrow(cx, cursorY, t('scenes.settings.sections.account'))
    this._drawAccountCard(cx, cursorY)
  }

  /**
   * Section eyebrow (uppercase meta + thin gold underline). Returns the y
   * coordinate where the corresponding card should start (eyebrow height +
   * gap already added).
   */
  private _drawSectionEyebrow(cx: number, y: number, label: string): number {
    this.add.text(cx, y, label, {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0.5, 0).setLetterSpacing(2)

    this.add.rectangle(cx, y + 22, 32, 1, accent.primary, 0.55)

    return y + 30 + SECTION_LABEL_GAP
  }

  /**
   * Card surface — surface.panel + border.default + radii.xl + drop shadow +
   * 1px inset top highlight. Matches ProfileScene/RankingScene panel style.
   */
  private _drawCardSurface(cx: number, top: number, h: number): void {
    const left = cx - CARD_W / 2

    const g = this.add.graphics()
    // Drop shadow (4 down)
    g.fillStyle(0x000000, 0.45)
    g.fillRoundedRect(left + 3, top + 6, CARD_W, h, radii.xl)
    // Main fill
    g.fillStyle(surface.panel, 1)
    g.fillRoundedRect(left, top, CARD_W, h, radii.xl)
    // Top inset highlight
    g.fillStyle(0xffffff, 0.045)
    g.fillRoundedRect(left + 2, top + 2, CARD_W - 4, 16,
      { tl: radii.xl, tr: radii.xl, bl: 0, br: 0 })
    // Border
    g.lineStyle(1, border.default, 1)
    g.strokeRoundedRect(left, top, CARD_W, h, radii.xl)
  }

  // ── Audio card ─────────────────────────────────────────────────────────────

  private _drawAudioCard(cx: number, top: number) {
    this._drawCardSurface(cx, top, AUDIO_CARD_H)
    soundManager.init()

    const cy = top + AUDIO_CARD_H / 2
    const left = cx - CARD_W / 2

    // Lucide speaker icon at left
    UI.lucideIcon(this, 'settings', left + CARD_PADDING + 14, cy, 24, fg.secondary)

    // Label + state text stacked vertically
    const textX = left + CARD_PADDING + 40
    this.add.text(textX, cy - 12, t('scenes.settings.audio.sound-label'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.6)

    const stateLabel = this.add.text(textX, cy + 12,
      t(soundManager.isEnabled() ? 'scenes.settings.audio.sound-on' : 'scenes.settings.audio.sound-off'), {
        fontFamily: fontFamily.body, fontSize: typeScale.small,
        color: fg.secondaryHex, fontStyle: '500',
      }).setOrigin(0, 0.5)

    // Toggle on the right
    UI.toggle(this, cx + CARD_W / 2 - CARD_PADDING - 28, cy, {
      value: soundManager.isEnabled(),
      onChange: (v) => {
        soundManager.toggle()
        stateLabel.setText(t(v ? 'scenes.settings.audio.sound-on' : 'scenes.settings.audio.sound-off'))
        soundManager.playClick()
      },
    })
  }

  // ── Language card ──────────────────────────────────────────────────────────
  // Volume sliders are intentionally not yet rendered — SoundManager doesn't
  // expose the volume API, so the audio card stays toggle-only for now.

  private _drawLanguageCard(cx: number, top: number) {
    this._drawCardSurface(cx, top, LANG_CARD_H)

    const left = cx - CARD_W / 2

    // In-card label (small uppercase) — describes what the segmented control
    // below does, so the picker is unambiguously the LANGUAGE picker.
    this.add.text(left + CARD_PADDING, top + 18, t('scenes.settings.language.field-label'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '700',
    }).setOrigin(0, 0).setLetterSpacing(1.6)

    // Segmented control with the 6 supported languages
    UI.segmentedControl<Lang>(this, cx, top + LANG_CARD_H - 28, {
      options: getSupportedLangs().map(l => ({ key: l, label: LANG_LABELS[l] })),
      value: getCurrentLang(),
      width: CARD_W - 2 * CARD_PADDING,
      height: 36,
      onChange: (lang) => {
        soundManager.playClick()
        // setLang persists, mutates SKILL_CATALOG via the registered listener,
        // then we restart the scene so every label re-renders in the new lang
        // (avoids wiring reactive bindings on every text object).
        void setLang(lang).then(() => {
          if (this.scene.isActive('SettingsScene')) this.scene.restart()
        })
      },
    })
  }

  // ── Account card ───────────────────────────────────────────────────────────

  private _drawAccountCard(cx: number, top: number) {
    this._drawCardSurface(cx, top, ACCOUNT_CARD_H)

    const cy = top + ACCOUNT_CARD_H / 2
    const left = cx - CARD_W / 2

    this.add.text(left + CARD_PADDING, cy - 12, t('scenes.settings.account.session-label'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '700',
    }).setOrigin(0, 0.5).setLetterSpacing(1.6)

    this.add.text(left + CARD_PADDING, cy + 12, t('scenes.settings.account.session-description'), {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color: fg.secondaryHex, fontStyle: '500',
    }).setOrigin(0, 0.5)

    UI.buttonDestructive(this, cx + CARD_W / 2 - CARD_PADDING - 70, cy,
      t('scenes.settings.account.logout-button'), {
        w: 140, h: 36,
        onPress: () => this._confirmLogout(),
      },
    )
  }

  // ── Footer credits ─────────────────────────────────────────────────────────

  private _drawFooter() {
    const cx = W / 2
    const cy = H - 32

    this.add.text(cx, cy, t('common.studio-name'), {
      fontFamily: fontFamily.display, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0.5).setLetterSpacing(2.4)

    this.add.text(cx, cy + 16, t('scenes.settings.footer.credits'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.disabledHex, fontStyle: '500',
    }).setOrigin(0.5)
  }

  // ── Logout confirmation via UI.modal ──────────────────────────────────────

  private _confirmLogout() {
    soundManager.playClick()
    const { close } = UI.modal(this, {
      eyebrow: t('common.actions.confirm'),
      title:   t('scenes.settings.logout-modal.title'),
      body:    t('scenes.settings.logout-modal.body'),
      actions: [
        {
          label: t('common.actions.cancel'), kind: 'secondary',
          onClick: () => {
            soundManager.playClick()
            close()
          },
        },
        {
          label: t('scenes.settings.logout-modal.confirm'), kind: 'destructive',
          onClick: async () => {
            soundManager.playClick()
            close()
            localStorage.removeItem('draft_token')
            const { playerData } = await import('../utils/PlayerDataManager')
            playerData.reset()
            transitionTo(this, 'LoginScene')
          },
        },
      ],
    })
  }

  shutdown() {
    this.tweens.killAll()
  }
}
