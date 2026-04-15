import Phaser from 'phaser'

/**
 * VFXManager — creates professional visual effects using Phaser primitives.
 * No sprite sheets needed — everything is generated with Graphics + Tweens.
 */
export class VFXManager {
  constructor(private scene: Phaser.Scene) {}

  /**
   * Explosion burst — expanding ring + scattered particles
   * Used for: area damage skills (Bola de Fogo, Impacto, Dominio Real)
   */
  explosion(x: number, y: number, color: number = 0xff6633, radius: number = 60): void {
    // Central flash
    const flash = this.scene.add.circle(x, y, 8, 0xffffff, 0.9).setDepth(1100)
    this.scene.tweens.add({
      targets: flash, scaleX: 3, scaleY: 3, alpha: 0,
      duration: 300, ease: 'Quad.Out',
      onComplete: () => flash.destroy(),
    })

    // Expanding ring
    const ring = this.scene.add.circle(x, y, 10, undefined).setDepth(1099)
    ring.setStrokeStyle(3, color, 0.8)
    ring.setFillStyle(color, 0.15)
    this.scene.tweens.add({
      targets: ring,
      scaleX: radius / 10, scaleY: radius / 10,
      alpha: 0, duration: 450, ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    })

    // Scattered particles (12-16 small circles flying outward)
    const particleCount = 14
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.4
      const dist = radius * (0.6 + Math.random() * 0.5)
      const size = 2 + Math.random() * 3
      const p = this.scene.add.circle(x, y, size, color, 0.8).setDepth(1098)
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 350 + Math.random() * 200,
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      })
    }
  }

  /**
   * Fire burst — orange/red explosion with ember particles
   * Used for: Bola de Fogo, burn effects
   */
  fireBurst(x: number, y: number, radius: number = 50): void {
    // Core explosion
    this.explosion(x, y, 0xff4400, radius)

    // Extra ember particles (small orange dots rising up)
    for (let i = 0; i < 8; i++) {
      const ox = x + (Math.random() - 0.5) * radius
      const oy = y + (Math.random() - 0.5) * radius * 0.5
      const ember = this.scene.add.circle(ox, oy, 1.5 + Math.random() * 2,
        Math.random() > 0.5 ? 0xff6600 : 0xffaa00, 0.9).setDepth(1097)
      this.scene.tweens.add({
        targets: ember,
        y: oy - 30 - Math.random() * 40,
        alpha: 0, duration: 600 + Math.random() * 400,
        ease: 'Quad.Out',
        onComplete: () => ember.destroy(),
      })
    }
  }

  /**
   * Ice/freeze effect — blue crystals expanding then shattering
   * Used for: Congelamento, stun
   */
  freezeEffect(x: number, y: number): void {
    // Central ice flash
    const flash = this.scene.add.circle(x, y, 6, 0x88ddff, 0.9).setDepth(1100)
    this.scene.tweens.add({
      targets: flash, scaleX: 2.5, scaleY: 2.5, alpha: 0,
      duration: 400, onComplete: () => flash.destroy(),
    })

    // Ice crystal shards (6 triangular shapes)
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6
      const shard = this.scene.add.star(x, y, 4, 2, 6, 0x66ccff, 0.8).setDepth(1098)
      shard.setRotation(angle)
      this.scene.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * 35,
        y: y + Math.sin(angle) * 35,
        alpha: 0, rotation: angle + 1.5,
        duration: 400 + Math.random() * 200,
        ease: 'Quad.Out',
        onComplete: () => shard.destroy(),
      })
    }
  }

  /**
   * Heal effect — green particles rising + soft glow
   * Used for: Cura Suprema, Campo de Cura, regen
   */
  healEffect(x: number, y: number, radius: number = 30): void {
    // Soft green glow
    const glow = this.scene.add.circle(x, y, radius, 0x44ff88, 0.2).setDepth(1095)
    this.scene.tweens.add({
      targets: glow, scaleX: 1.5, scaleY: 1.5, alpha: 0,
      duration: 600, ease: 'Quad.Out',
      onComplete: () => glow.destroy(),
    })

    // Rising sparkle particles
    for (let i = 0; i < 10; i++) {
      const ox = x + (Math.random() - 0.5) * radius
      const oy = y + Math.random() * 10
      const sparkle = this.scene.add.circle(ox, oy, 1.5 + Math.random() * 2,
        Math.random() > 0.5 ? 0x44ff88 : 0x88ffbb, 0.8).setDepth(1096)
      this.scene.tweens.add({
        targets: sparkle,
        y: oy - 30 - Math.random() * 30,
        alpha: 0, duration: 500 + Math.random() * 400,
        ease: 'Quad.Out',
        delay: Math.random() * 150,
        onComplete: () => sparkle.destroy(),
      })
    }

    // Plus sign (heal icon)
    const g = this.scene.add.graphics().setDepth(1097)
    g.fillStyle(0x44ff88, 0.7)
    g.fillRect(x - 2, y - 8, 4, 16)
    g.fillRect(x - 8, y - 2, 16, 4)
    this.scene.tweens.add({
      targets: g, alpha: 0, y: -20,
      duration: 600, ease: 'Quad.Out',
      onComplete: () => g.destroy(),
    })
  }

  /**
   * Shield effect — blue hexagonal barrier flash
   * Used for: Escudo, Fortaleza, Postura Defensiva
   */
  shieldEffect(x: number, y: number): void {
    // Hex barrier
    const hex = this.scene.add.star(x, y, 6, 20, 24, undefined).setDepth(1099)
    hex.setStrokeStyle(2.5, 0x4488ff, 0.9)
    hex.setFillStyle(0x4488ff, 0.15)
    this.scene.tweens.add({
      targets: hex, scaleX: 1.4, scaleY: 1.4, alpha: 0,
      duration: 500, ease: 'Quad.Out',
      onComplete: () => hex.destroy(),
    })

    // Inner glow
    const inner = this.scene.add.circle(x, y, 16, 0x4488ff, 0.3).setDepth(1098)
    this.scene.tweens.add({
      targets: inner, scaleX: 1.8, scaleY: 1.8, alpha: 0,
      duration: 400, ease: 'Quad.Out',
      onComplete: () => inner.destroy(),
    })
  }

  /**
   * Bleed effect — red droplets splattering
   * Used for: Corte Hemorragia, Bomba de Espinhos, bleed ticks
   */
  bleedEffect(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 10 + Math.random() * 25
      const drop = this.scene.add.circle(x, y, 2 + Math.random() * 2, 0xcc2244, 0.9).setDepth(1098)
      this.scene.tweens.add({
        targets: drop,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist + 10, // gravity
        alpha: 0, scaleX: 0.5, scaleY: 1.5,
        duration: 300 + Math.random() * 200,
        ease: 'Quad.Out',
        onComplete: () => drop.destroy(),
      })
    }
  }

  /**
   * Lightning/stun effect — electric zap lines
   * Used for: Congelamento, Correntes Rigidas, stun
   */
  lightningEffect(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const g = this.scene.add.graphics().setDepth(1100)
      g.lineStyle(2, 0xffff44, 0.9)
      const segments = 5
      let cx = x, cy = y - 25
      g.beginPath()
      g.moveTo(cx, cy)
      for (let s = 0; s < segments; s++) {
        cx += (Math.random() - 0.5) * 20
        cy += 10
        g.lineTo(cx, cy)
      }
      g.strokePath()

      this.scene.tweens.add({
        targets: g, alpha: 0,
        duration: 200 + Math.random() * 150,
        delay: i * 60,
        onComplete: () => g.destroy(),
      })
    }

    // Central flash
    const flash = this.scene.add.circle(x, y, 5, 0xffffaa, 0.8).setDepth(1101)
    this.scene.tweens.add({
      targets: flash, scaleX: 3, scaleY: 3, alpha: 0,
      duration: 250, onComplete: () => flash.destroy(),
    })
  }

  /**
   * Slash effect — quick diagonal line
   * Used for: Corte Mortal, Corte Preciso, single-target melee attacks
   */
  slashEffect(x: number, y: number, color: number = 0xffffff): void {
    const g = this.scene.add.graphics().setDepth(1100)
    g.lineStyle(3, color, 0.9)
    g.beginPath()
    g.moveTo(x - 20, y - 15)
    g.lineTo(x + 20, y + 15)
    g.strokePath()
    g.lineStyle(2, 0xffffff, 0.5)
    g.beginPath()
    g.moveTo(x - 18, y - 13)
    g.lineTo(x + 18, y + 13)
    g.strokePath()

    g.setAlpha(0)
    this.scene.tweens.add({
      targets: g, alpha: 1, duration: 80,
      yoyo: true, hold: 100,
      onComplete: () => g.destroy(),
    })
  }

  /**
   * Evade/dodge effect — quick ghost afterimage
   * Used for: Esquiva, Teleport, Fuga Sombria
   */
  evadeEffect(x: number, y: number): void {
    // Ghost afterimage
    const ghost = this.scene.add.circle(x, y, 20, 0xffffff, 0.3).setDepth(1095)
    this.scene.tweens.add({
      targets: ghost,
      x: x + 30, alpha: 0, scaleX: 0.5, scaleY: 1.2,
      duration: 300, ease: 'Quad.Out',
      onComplete: () => ghost.destroy(),
    })
    // Speed lines
    for (let i = 0; i < 3; i++) {
      const line = this.scene.add.rectangle(x - 5, y - 8 + i * 8, 20, 2, 0xffffff, 0.5).setDepth(1096)
      this.scene.tweens.add({
        targets: line, x: x + 25, alpha: 0, scaleX: 2,
        duration: 200, delay: i * 40,
        onComplete: () => line.destroy(),
      })
    }
  }

  /**
   * Reflect effect — mirror shine
   * Used for: Refletir
   */
  reflectEffect(x: number, y: number): void {
    const shine = this.scene.add.star(x, y, 4, 6, 18, 0xbb88ff, 0.7).setDepth(1100)
    this.scene.tweens.add({
      targets: shine, rotation: Math.PI, scaleX: 1.5, scaleY: 1.5, alpha: 0,
      duration: 500, ease: 'Quad.Out',
      onComplete: () => shine.destroy(),
    })
  }

  /**
   * Poison cloud — green misty particles
   * Used for: Nevoa, veneno
   */
  poisonCloud(x: number, y: number, radius: number = 40): void {
    for (let i = 0; i < 12; i++) {
      const ox = x + (Math.random() - 0.5) * radius
      const oy = y + (Math.random() - 0.5) * radius * 0.6
      const size = 6 + Math.random() * 10
      const cloud = this.scene.add.circle(ox, oy, size, 0x44cc44, 0.2 + Math.random() * 0.15).setDepth(1094)
      this.scene.tweens.add({
        targets: cloud,
        x: ox + (Math.random() - 0.5) * 20,
        y: oy - 10 - Math.random() * 15,
        scaleX: 1.5, scaleY: 1.5, alpha: 0,
        duration: 800 + Math.random() * 400,
        delay: Math.random() * 200,
        onComplete: () => cloud.destroy(),
      })
    }
  }

  /**
   * Buff/power up — upward energy swirl
   * Used for: Adrenalina, Ataque em Dobro, ATK up
   */
  buffEffect(x: number, y: number, color: number = 0xf0c850): void {
    // Upward energy column
    const col = this.scene.add.rectangle(x, y, 4, 40, color, 0.4).setDepth(1095)
    this.scene.tweens.add({
      targets: col, y: y - 30, alpha: 0, scaleY: 2,
      duration: 500, ease: 'Quad.Out',
      onComplete: () => col.destroy(),
    })
    // Sparkle ring
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6
      const s = this.scene.add.circle(
        x + Math.cos(angle) * 15, y + Math.sin(angle) * 15,
        2, color, 0.8,
      ).setDepth(1096)
      this.scene.tweens.add({
        targets: s,
        y: s.y - 25, alpha: 0,
        duration: 400 + i * 50, ease: 'Quad.Out',
        onComplete: () => s.destroy(),
      })
    }
  }

  /**
   * Line attack — beam traveling in a direction
   * Used for: Raio Purificador, Investida Brutal, Colisao Titanica
   */
  beamEffect(fromX: number, fromY: number, toX: number, toY: number, color: number = 0xff6633, width: number = 6): void {
    const g = this.scene.add.graphics().setDepth(1100)

    // Animate beam extending
    const dx = toX - fromX, dy = toY - fromY
    const steps = 10
    let step = 0
    const timer = this.scene.time.addEvent({
      delay: 30, repeat: steps, callback: () => {
        step++
        const t = step / steps
        g.clear()
        // Main beam
        g.lineStyle(width, color, 0.8 * (1 - t * 0.3))
        g.lineBetween(fromX, fromY, fromX + dx * t, fromY + dy * t)
        // Glow
        g.lineStyle(width + 4, color, 0.2 * (1 - t * 0.3))
        g.lineBetween(fromX, fromY, fromX + dx * t, fromY + dy * t)
      },
    })

    this.scene.time.delayedCall(steps * 30 + 200, () => {
      timer.destroy()
      this.scene.tweens.add({
        targets: g, alpha: 0, duration: 200,
        onComplete: () => g.destroy(),
      })
    })
  }

  /**
   * Death effect — dramatic dissolve
   */
  deathEffect(x: number, y: number): void {
    // Soul particles rising
    for (let i = 0; i < 12; i++) {
      const ox = x + (Math.random() - 0.5) * 30
      const oy = y + (Math.random() - 0.5) * 30
      const p = this.scene.add.circle(ox, oy, 2 + Math.random() * 3, 0xaaaacc, 0.6).setDepth(1100)
      this.scene.tweens.add({
        targets: p,
        y: oy - 40 - Math.random() * 30,
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 600 + Math.random() * 400,
        delay: Math.random() * 200,
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      })
    }
    // Red flash
    const flash = this.scene.add.circle(x, y, 25, 0xff2222, 0.5).setDepth(1099)
    this.scene.tweens.add({
      targets: flash, scaleX: 2, scaleY: 2, alpha: 0,
      duration: 400, onComplete: () => flash.destroy(),
    })
  }
}
