import Phaser from 'phaser'
import { getAllCharacterAssets, getAllDesignSvgAssets, getAllSkillAssets } from '../utils/AssetPaths'
import { colors, fonts, fontFamily, sizes } from '../utils/DesignTokens'

/**
 * Pre-instantiate one short Text object per design-system font family.
 * Phaser only triggers glyph rasterization when a given family is first used
 * inside a Scene; without this warm-up the first real render in MenuScene /
 * LobbyScene flashes with the fallback face for ~200ms. We create the probes
 * off-screen with alpha 0, then destroy them — the browser's font cache keeps
 * the glyphs hot for every subsequent scene.
 */
function warmUpDesignSystemFonts(scene: Phaser.Scene): void {
  const probes: Phaser.GameObjects.Text[] = []
  const families = [fontFamily.display, fontFamily.serif, fontFamily.body, fontFamily.mono]
  for (const family of families) {
    const t = scene.add.text(-9999, -9999, 'Ag', {
      fontFamily: family,
      fontSize: '16px',
      color: '#000000',
    })
    t.setAlpha(0)
    probes.push(t)
  }
  // Destroy on next tick so Phaser's text-metric cache retains the family entry.
  scene.time.delayedCall(0, () => probes.forEach((p) => p.destroy()))
}

export default class BootScene extends Phaser.Scene {
  /** Promise resolved once browser fonts are loaded; transitions await it. */
  private _fontsReady: Promise<void> = Promise.resolve()

  constructor() {
    super('BootScene')
  }

  /**
   * Preloads all static game assets (character sprites, skill icons, etc.)
   * Phaser runs preload() before create(), so every texture below is ready
   * by the time any scene tries to use it.
   */
  preload() {
    // Character sprites — /assets/characters/{class}/{skin}.png
    for (const { key, path } of getAllCharacterAssets()) {
      this.load.image(key, path)
    }

    // Skill icons — /assets/skills/{skillId}.png
    for (const { key, path } of getAllSkillAssets()) {
      this.load.image(key, path)
    }

    // Design-system SVGs (Phase 1) — wordmark, class sigils, currency icons
    for (const { key, path, width, height } of getAllDesignSvgAssets()) {
      this.load.svg(key, path, { width, height })
    }
  }

  create() {
    const { width, height } = this.scale

    // === FONT READINESS GATE ===
    // Kicks off as soon as BootScene is created; the scene-transition block
    // below awaits this promise so the next scene never renders with the
    // fallback face. Fails open (resolves) if the API is unavailable.
    if (typeof document !== 'undefined' && 'fonts' in document) {
      this._fontsReady = document.fonts.ready
        .then(() => {
          warmUpDesignSystemFonts(this)
          console.log('[BootScene] design fonts ready')
        })
        .catch((err: unknown) => {
          console.warn('[BootScene] document.fonts.ready failed, falling back', err)
        })
    }

    // === LAYER 1: Solid dark base ===
    this.add.rectangle(width / 2, height / 2, width, height, colors.ui.bg)

    // === LAYER 2: Subtle radial vignette (darker edges) ===
    const vignette = this.add.graphics()
    vignette.fillStyle(colors.ui.black, 0.35)
    vignette.fillRect(0, 0, width * 0.15, height)
    vignette.fillRect(width * 0.85, 0, width * 0.15, height)
    vignette.fillStyle(colors.ui.black, 0.25)
    vignette.fillRect(0, 0, width, height * 0.12)
    vignette.fillRect(0, height * 0.88, width, height * 0.12)

    // === LAYER 3: Floating gold particles ===
    for (let i = 0; i < 15; i++) {
      const px = Math.random() * width
      const py = Math.random() * height
      const size = 0.8 + Math.random() * 1.5
      const particle = this.add.circle(px, py, size, colors.ui.goldDim, 0.06 + Math.random() * 0.1)
      this.tweens.add({
        targets: particle,
        y: py - 30 - Math.random() * 50,
        alpha: 0,
        duration: 3000 + Math.random() * 3000,
        repeat: -1,
        delay: Math.random() * 2000,
        onRepeat: () => {
          particle.setPosition(Math.random() * width, height + 10)
          particle.setAlpha(0.06 + Math.random() * 0.1)
        },
      })
    }

    // === DECORATIVE: Thin gold horizontal lines (ambient) ===
    const lineTop = this.add.rectangle(width / 2, height / 2 - 50, 180, 1, colors.ui.goldDim, 0).setAlpha(0)
    const lineBot = this.add.rectangle(width / 2, height / 2 + 50, 180, 1, colors.ui.goldDim, 0).setAlpha(0)

    // === STUDIO LOGO ===
    const logo = this.add
      .text(width / 2, height / 2 - 14, 'CODEFORJE VIO', {
        fontFamily: fonts.heading,
        fontSize: '28px',
        color: colors.ui.goldDimHex,
        fontStyle: 'bold',
        shadow: {
          offsetX: 0,
          offsetY: 2,
          color: colors.shadow.darkGoldHex,
          blur: 6,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setAlpha(0)

    const sub = this.add
      .text(width / 2, height / 2 + 22, 'presents', {
        fontFamily: fonts.body,
        fontSize: sizes.text.small,
        color: colors.ui.dimHex,
        shadow: {
          offsetX: 0,
          offsetY: 1,
          color: colors.shadow.blackHex,
          blur: 2,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setAlpha(0)

    // === ENTRANCE ANIMATIONS ===
    // Fade in decorative lines
    this.tweens.add({
      targets: lineTop,
      alpha: 0.3,
      scaleX: 1,
      duration: 500,
      delay: 100,
      ease: 'Quad.Out',
    })
    this.tweens.add({
      targets: lineBot,
      alpha: 0.3,
      scaleX: 1,
      duration: 500,
      delay: 100,
      ease: 'Quad.Out',
    })

    // Fade in logo with slight upward drift
    logo.setY(height / 2 - 6)
    this.tweens.add({
      targets: logo,
      alpha: 1,
      y: height / 2 - 14,
      duration: 600,
      delay: 200,
      ease: 'Quad.Out',
    })

    // Fade in subtitle
    this.tweens.add({
      targets: sub,
      alpha: 1,
      duration: 600,
      delay: 500,
      ease: 'Quad.Out',
    })

    // === AFTER 1.5s: Fade to black and navigate ===
    this.time.delayedCall(1500, () => {
      const overlay = this.add
        .rectangle(width / 2, height / 2, width, height, colors.ui.black, 0)
        .setDepth(999)

      this.tweens.add({
        targets: overlay,
        alpha: 1,
        duration: 400,
        onComplete: async () => {
          // Block transition until design-system fonts are cached. Resolves
          // quickly in normal conditions (fonts loaded well under 1.5s intro).
          await this._fontsReady

          const token = localStorage.getItem('draft_token')
          if (token) {
            try {
              const { authService } = await import('../services')
              const user = await authService.getProfile()
              const { playerData } = await import('../utils/PlayerDataManager')
              playerData.syncFromServer(user)
              this.scene.start('LobbyScene')
            } catch {
              localStorage.removeItem('draft_token')
              this.scene.start('LoginScene')
            }
          } else {
            this.scene.start('LoginScene')
          }
        },
      })
    })
  }
}
