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

const TOP_BAR_H = 56

export default class SettingsScene extends Phaser.Scene {
  constructor() {
    super('SettingsScene')
  }

  create() {
    UI.background(this)
    UI.particles(this, 14)

    this._drawTopBar()
    this._drawCentralPanel()
    UI.fadeIn(this)
  }

  // ── Top bar ──

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

  // ── Central panel containing all sections ──

  private _drawCentralPanel() {
    const panelW = 600
    // i18n.5: panel grew from 540 to 620 to fit the new "IDIOMA" section
    // between GAMEPLAY and CONTA. Layout below is incremental, so adding a
    // section just pushes everything after it down by its height.
    const panelH = 620
    const panelX = W / 2
    const panelY = TOP_BAR_H + 8 + panelH / 2

    // Panel — surface.panel + border.default + radii.xl + drop shadow
    const panelBg = this.add.graphics()
    panelBg.fillStyle(0x000000, 0.5)
    panelBg.fillRoundedRect(panelX - panelW / 2 + 4, panelY - panelH / 2 + 8, panelW, panelH, radii.xl)
    panelBg.fillStyle(surface.panel, 1)
    panelBg.fillRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, radii.xl)
    panelBg.fillStyle(0xffffff, 0.04)
    panelBg.fillRoundedRect(panelX - panelW / 2 + 2, panelY - panelH / 2 + 2, panelW - 4, 22,
      { tl: radii.xl - 1, tr: radii.xl - 1, bl: 0, br: 0 })
    panelBg.lineStyle(1, border.default, 1)
    panelBg.strokeRoundedRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH, radii.xl)

    // ── Section: ÁUDIO (sound toggle only — sliders pending volume API) ──
    let cursorY = panelY - panelH / 2 + 36

    this._drawSectionHeader(panelX, cursorY, t('scenes.settings.sections.audio'))
    cursorY += 30

    soundManager.init()
    const soundCardH = 64
    this._drawCard(panelX, cursorY + soundCardH / 2, panelW - 48, soundCardH)

    // Sound icon + label on the left
    const soundIcon = UI.lucideIcon(this, 'settings', panelX - panelW / 2 + 36, cursorY + soundCardH / 2, 22, fg.secondary)
    void soundIcon
    this.add.text(panelX - panelW / 2 + 64, cursorY + soundCardH / 2 - 8, t('scenes.settings.audio.sound-label'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '700',
    }).setLetterSpacing(1.6)
    const soundStateLabel = this.add.text(panelX - panelW / 2 + 64, cursorY + soundCardH / 2 + 10,
      t(soundManager.isEnabled() ? 'scenes.settings.audio.sound-on' : 'scenes.settings.audio.sound-off'), {
        fontFamily: fontFamily.body, fontSize: typeScale.small,
        color: fg.secondaryHex, fontStyle: '500',
      })

    UI.toggle(this, panelX + panelW / 2 - 60, cursorY + soundCardH / 2, {
      value: soundManager.isEnabled(),
      onChange: (v) => {
        soundManager.toggle()  // soundManager.toggle returns bool but we already have v
        soundStateLabel.setText(t(v ? 'scenes.settings.audio.sound-on' : 'scenes.settings.audio.sound-off'))
        soundManager.playClick()
      },
    })

    // Volume sliders are not yet exposed by SoundManager — keep the audio
    // section to just the on/off toggle until the slider API lands.
    cursorY += soundCardH + 28

    // ── Section: IDIOMA ──
    this._drawSectionHeader(panelX, cursorY, t('scenes.settings.sections.language'))
    cursorY += 30

    const langCardH = 56
    this._drawCard(panelX, cursorY + langCardH / 2, panelW - 48, langCardH)

    UI.segmentedControl<Lang>(this, panelX, cursorY + langCardH / 2, {
      options: getSupportedLangs().map(l => ({ key: l, label: LANG_LABELS[l] })),
      value: getCurrentLang(),
      width: panelW - 96,
      height: 32,
      onChange: (lang) => {
        soundManager.playClick()
        // setLang persists, mutates SKILL_CATALOG via the registered listener,
        // and notifies any bound texts. We restart the scene so all visible
        // labels (sections, cards, footer) are re-rendered in the new lang
        // without trying to wire reactive bindings on every text object.
        void setLang(lang).then(() => {
          if (this.scene.isActive('SettingsScene')) this.scene.restart()
        })
      },
    })

    // ── Section: CONTA ──
    cursorY += langCardH + 24
    this._drawSectionHeader(panelX, cursorY, t('scenes.settings.sections.account'))
    cursorY += 30

    const accountCardH = 64
    this._drawCard(panelX, cursorY + accountCardH / 2, panelW - 48, accountCardH)
    this.add.text(panelX - panelW / 2 + 36, cursorY + accountCardH / 2 - 8, t('scenes.settings.account.session-label'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.tertiaryHex, fontStyle: '700',
    }).setLetterSpacing(1.6)
    this.add.text(panelX - panelW / 2 + 36, cursorY + accountCardH / 2 + 10,
      t('scenes.settings.account.session-description'), {
        fontFamily: fontFamily.body, fontSize: typeScale.small,
        color: fg.secondaryHex, fontStyle: '500',
      })

    UI.buttonDestructive(this, panelX + panelW / 2 - 90, cursorY + accountCardH / 2,
      t('scenes.settings.account.logout-button'), {
        w: 140, h: 36,
        onPress: () => this._confirmLogout(),
      },
    )

    // ── Footer credits ──
    cursorY = panelY + panelH / 2 - 50
    this.add.text(panelX, cursorY, t('common.studio-name'), {
      fontFamily: fontFamily.display, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0.5).setLetterSpacing(2.4)
    this.add.text(panelX, cursorY + 16, t('scenes.settings.footer.credits'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.disabledHex, fontStyle: '500',
    }).setOrigin(0.5)
  }

  // ── Section header — UPPER eyebrow with thin gold underline ──

  private _drawSectionHeader(cx: number, y: number, text: string) {
    this.add.text(cx, y, text, {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: '700',
    }).setOrigin(0.5).setLetterSpacing(2)

    const ruleW = 24
    this.add.rectangle(cx, y + 14, ruleW, 1, accent.primary, 0.5)
  }

  // ── Card — surface.raised + border.default + radii.md ──

  private _drawCard(cx: number, cy: number, w: number, h: number) {
    const g = this.add.graphics()
    g.fillStyle(surface.raised, 1)
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, radii.md)
    g.lineStyle(1, border.default, 1)
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, radii.md)
    // Top inset highlight
    g.fillStyle(0xffffff, 0.025)
    g.fillRoundedRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, 14,
      { tl: radii.md - 1, tr: radii.md - 1, bl: 0, br: 0 })
  }

  // ── Logout confirmation via UI.modal ──

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
