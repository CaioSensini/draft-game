import Phaser from 'phaser'
import { gameConfig } from './core/gameConfig'

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

new Phaser.Game(gameConfig)
