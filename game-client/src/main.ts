import Phaser from 'phaser'
import { gameConfig } from './core/gameConfig'
import { rerenderActiveTextObjects } from './utils/PhaserTextRerender'
import { LANGUAGE_CHANGE_BLOCKING_SCENES } from './i18n/bindText'

// ── Mobile orientation lock (Sprint 0.6) ────────────────────────────────────
// Android + PWAs: Screen Orientation API locks landscape. iOS Safari doesn't
// implement .lock() but will still render landscape correctly via FIT scaling
// and the viewport meta tags in index.html. Wrapped in try/catch because
// .lock() throws in insecure contexts and on unsupported browsers.
function lockLandscape(): void {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: 'landscape' | 'portrait' | 'any' | 'natural' | 'landscape-primary' | 'landscape-secondary' | 'portrait-primary' | 'portrait-secondary') => Promise<void>
    }
    if (typeof orientation?.lock === 'function') {
      void orientation.lock('landscape').catch(() => {
        // Silently ignore — unsupported platform, user gesture required, or
        // document not fullscreen. Viewport meta already handles the
        // fallback via FIT scaling.
      })
    }
  } catch {
    // Some environments (older iOS, embedded webviews) throw on property
    // access. Safe to ignore — we fall back to the meta-tag hint.
  }
}

lockLandscape()

const game = new Phaser.Game(gameConfig)

if (typeof window !== 'undefined') {
  window.addEventListener('draft:i18n-language-changed', () => {
    // Force a canvas redraw so glyphs that were warmed-up post-init render
    // correctly with the new font cascade (S5 fix).
    rerenderActiveTextObjects(game)

    // For each active non-Boot scene, re-render translated content. Texts
    // bound via bindI18nText() update in place via their own listener — the
    // scene.restart() below catches every other text that was created with
    // a one-shot t(...) call. We skip blocking scenes so live gameplay is
    // not nuked; SettingsScene gates the language switch on those, but if
    // setLang() ever fires while one is active (e.g. dev console), we
    // protect the user's match anyway.
    for (const scene of game.scene.getScenes(true)) {
      const key = scene.scene.key
      if (key === 'BootScene') continue
      if (LANGUAGE_CHANGE_BLOCKING_SCENES.has(key)) continue
      scene.scene.restart(scene.scene.settings.data)
    }
  })
}
