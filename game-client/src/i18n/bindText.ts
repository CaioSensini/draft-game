/**
 * i18n/bindText.ts — Phaser-coupled reactive helpers.
 *
 * Kept separate from i18n/index.ts so the core module remains importable in
 * a Node test environment (vitest config forbids Phaser imports in domain
 * tests). UI-side code uses these helpers; pure logic uses `t()` directly.
 */

import Phaser from 'phaser'
import { onLanguageChanged, t } from './index'

/**
 * Bind a Phaser.Text to a translation key. The text refreshes whenever
 * setLang() succeeds, and the listener is auto-removed when the owning scene
 * shuts down (so cycling through scenes does not leak listeners).
 *
 * Use this when the text must update WITHOUT restarting the scene
 * (e.g. SettingsScene's own labels while the user toggles language).
 * Otherwise, plain `text.setText(t('...'))` plus a `scene.scene.restart()`
 * after `setLang()` is simpler and equally effective.
 */
export function bindI18nText(
  scene: Phaser.Scene,
  text: Phaser.GameObjects.Text,
  key: string,
  params?: Record<string, string | number>,
): Phaser.GameObjects.Text {
  text.setText(t(key, params))

  const off = onLanguageChanged(() => {
    if (text.active) text.setText(t(key, params))
  })

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off)
  scene.events.once(Phaser.Scenes.Events.DESTROY, off)
  text.once(Phaser.GameObjects.Events.DESTROY, off)

  return text
}
