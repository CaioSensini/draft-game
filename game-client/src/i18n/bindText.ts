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
 * Scenes that may NOT be soft-restarted when the language changes — restarting
 * them would destroy live gameplay state (HP / turn / queue / pack animation).
 *
 * SettingsScene reads this set before calling setLang() and offers a friendly
 * "finish the current match before changing language" modal instead.
 */
export const LANGUAGE_CHANGE_BLOCKING_SCENES: ReadonlySet<string> = new Set([
  'BattleScene',
  'MatchmakingScene',
])

/**
 * Returns the keys of any active scene that blocks language switching.
 * Empty array = safe to switch.
 *
 * PackOpenAnimation is not a scene — it's an overlay container created by
 * ShopScene. ShopScene exposes `isPackOpenAnimationActive()` so the
 * SettingsScene can poll it directly when needed.
 */
export function blockingScenes(game: Phaser.Game): string[] {
  const out: string[] = []
  for (const scene of game.scene.getScenes(true)) {
    if (LANGUAGE_CHANGE_BLOCKING_SCENES.has(scene.scene.key)) {
      out.push(scene.scene.key)
    }
  }
  return out
}

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
  text.setData('i18nKey', key)

  const off = onLanguageChanged(() => {
    if (text.active) text.setText(t(key, params))
  })

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off)
  scene.events.once(Phaser.Scenes.Events.DESTROY, off)
  text.once(Phaser.GameObjects.Events.DESTROY, off)

  return text
}

/**
 * Create a Phaser.Text and bind it to a translation key in one call.
 * Convenience for new UI code so each translated label refreshes in place
 * without forcing a scene restart on `setLang()`.
 */
export function addI18nText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
  params?: Record<string, string | number>,
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, '', style)
  return bindI18nText(scene, text, key, params)
}
