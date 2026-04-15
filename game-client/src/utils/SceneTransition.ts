import Phaser from 'phaser'

export type TransitionType = 'fade' | 'wipeRight' | 'zoomIn' | 'flash'

/**
 * Smooth scene transition with multiple visual styles.
 * 'fade'      — classic fade to black (default)
 * 'wipeRight' — black bar sweeps from left to right
 * 'zoomIn'    — camera zooms in while fading
 * 'flash'     — white flash then scene change
 */
export function transitionTo(
  scene: Phaser.Scene,
  targetScene: string,
  data?: object,
  duration: number = 350,
  type: TransitionType = 'fade',
): void {
  const { width, height } = scene.scale

  switch (type) {
    case 'wipeRight': {
      const wipe = scene.add.rectangle(0, height / 2, 0, height, 0x000000, 1)
        .setOrigin(0, 0.5).setDepth(9999)
      scene.tweens.add({
        targets: wipe, displayWidth: width * 1.2,
        duration, ease: 'Quad.In',
        onComplete: () => {
            const key = scene.scene.key
            scene.scene.start(targetScene, data)
            scene.scene.stop(key)
          },
      })
      break
    }
    case 'zoomIn': {
      const overlay = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
        .setDepth(9999)
      scene.cameras.main.zoomTo(1.3, duration, 'Quad.In')
      scene.tweens.add({
        targets: overlay, alpha: 1, duration,
        onComplete: () => {
          scene.cameras.main.resetFX()
          scene.cameras.main.setZoom(1)
          const key = scene.scene.key
          scene.scene.start(targetScene, data)
          scene.scene.stop(key)
        },
      })
      break
    }
    case 'flash': {
      const overlay = scene.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0)
        .setDepth(9999)
      scene.tweens.add({
        targets: overlay, alpha: 1, duration: duration / 2,
        yoyo: true,
        onComplete: () => {
            const key = scene.scene.key
            scene.scene.start(targetScene, data)
            scene.scene.stop(key)
          },
      })
      break
    }
    default: {
      const overlay = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
        .setDepth(9999)
      scene.tweens.add({
        targets: overlay, alpha: 1, duration,
        onComplete: () => {
            const key = scene.scene.key
            scene.scene.start(targetScene, data)
            scene.scene.stop(key)
          },
      })
    }
  }
}
