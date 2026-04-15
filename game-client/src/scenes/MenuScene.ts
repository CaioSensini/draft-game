import Phaser from 'phaser'
import { GameState, GameStateManager } from '../core/GameState'
import { UI } from '../utils/UIComponents'
import { C, F, SHADOW, SCREEN } from '../utils/DesignTokens'
import { transitionTo } from '../utils/SceneTransition'

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene')
  }

  create() {
    GameStateManager.set(GameState.MENU)
    const { W, H } = SCREEN
    const cx = W / 2

    // =========================================================================
    // LAYER 0 — Deep cinematic base (darker than standard bg)
    // =========================================================================
    this.add.rectangle(cx, H / 2, W, H, 0x020409)

    // Subtle radial spotlight from upper center (warm golden)
    const spotGfx = this.add.graphics()
    for (let r = 400; r > 0; r -= 2) {
      const a = 0.008 * (r / 400)
      spotGfx.fillStyle(0xc9a84c, a)
      spotGfx.fillCircle(cx, H * 0.28, r)
    }

    // =========================================================================
    // LAYER 1 — Distant landscape silhouettes
    // =========================================================================
    this._drawLandscape(cx, H)

    // =========================================================================
    // LAYER 2 — God rays from upper-right (diagonal beams)
    // =========================================================================
    this._drawGodRays(W, H)

    // =========================================================================
    // LAYER 3 — Volumetric fog (3 animated layers at different depths)
    // =========================================================================
    this._createFogBank(W, H)

    // =========================================================================
    // LAYER 4 — Two armies facing each other (mid-ground)
    // =========================================================================
    this._drawArmies(cx, H)

    // =========================================================================
    // LAYER 5 — Foreground particles (embers, gold dust, sparks)
    // =========================================================================
    this._createEmbers(W, H, 16)
    this._createGoldDust(W, H, 35)
    this._createSparks(W, H, 6)

    // =========================================================================
    // LAYER 6 — Screen-wide decorative frame (thin golden border)
    // =========================================================================
    const frameGfx = this._drawScreenFrame(W, H)
    frameGfx.setAlpha(0)

    // =========================================================================
    // LAYER 7 — Crown ornament (integrated with title)
    // =========================================================================
    const crownY = 155
    const crownGfx = this._drawElaborateCrown(cx, crownY, 56, 32)
    crownGfx.setAlpha(0).setScale(0.4)

    // =========================================================================
    // LAYER 8 — Title "DRAFT" with metallic multi-layer rendering
    // =========================================================================
    const titleY = 210

    // Back glow (warm bloom behind the letters)
    const titleBloom = this.add.circle(cx, titleY, 180, C.goldDark, 0)
    this.tweens.add({
      targets: titleBloom,
      alpha: { from: 0.04, to: 0.09 },
      scaleX: { from: 1, to: 1.05 },
      scaleY: { from: 1, to: 1.05 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })

    // Shadow layer (offset, darker)
    const titleShadow = this.add.text(cx + 2, titleY + 4, 'DRAFT', {
      fontFamily: F.title, fontSize: '88px', color: '#1a0e00', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0)

    // Main title
    const title = this.add.text(cx, titleY, 'DRAFT', {
      fontFamily: F.title,
      fontSize: '88px',
      color: '#e8c340',
      fontStyle: 'bold',
      shadow: {
        offsetX: 0,
        offsetY: 6,
        color: '#6b4a00',
        blur: 18,
        fill: true,
      },
    }).setOrigin(0.5).setAlpha(0)

    // Top highlight layer (lighter gold, offset up — simulates metallic bevel)
    const titleHighlight = this.add.text(cx, titleY - 1, 'DRAFT', {
      fontFamily: F.title, fontSize: '88px', fontStyle: 'bold',
      color: '#fff0a0',
    }).setOrigin(0.5).setAlpha(0)

    // Animated shimmer sweep
    const shimmer = UI.shimmer(this, cx, titleY, 380, 80, 5000)
    shimmer.setDepth(8)

    // =========================================================================
    // LAYER 9 — "G  A  M  E" subtitle
    // =========================================================================
    const subY = titleY + 72
    const subtitle = this.add.text(cx, subY, 'G  A  M  E', {
      fontFamily: F.title, fontSize: '28px', fontStyle: 'bold',
      color: '#a08840',
      shadow: { offsetX: 0, offsetY: 2, color: '#3a2800', blur: 6, fill: true },
    }).setOrigin(0.5).setAlpha(0)

    // Small accent dots between letters
    const dotGfx = this.add.graphics().setAlpha(0)
    const dotPositions = [-50, -16, 18, 52]
    dotPositions.forEach(dx => {
      dotGfx.fillStyle(C.goldDim, 0.3)
      dotGfx.fillCircle(cx + dx, subY + 16, 1.5)
    })

    // Studio credit
    const studioText = this.add.text(cx, subY + 35, 'by Codeforje VIO', {
      fontFamily: F.body, fontSize: '12px',
      color: '#4a3d28',
      shadow: SHADOW.text,
    }).setOrigin(0.5).setAlpha(0)

    // =========================================================================
    // LAYER 10 — Elaborate divider (wider, more ornate)
    // =========================================================================
    const dividerY = subY + 55
    const dividerGfx = this._drawElaborateDivider(cx, dividerY, 320)
    dividerGfx.setAlpha(0)

    // =========================================================================
    // LAYER 11 — Tagline (two lines, key phrase stands out)
    // =========================================================================
    const tagY = dividerY + 28
    const tag1 = this.add.text(cx, tagY, 'Estrategia. Tatica. Conquista.', {
      fontFamily: F.title, fontSize: '18px', fontStyle: 'bold',
      color: '#c8b880',
      shadow: SHADOW.text,
    }).setOrigin(0.5).setAlpha(0)

    const tag2 = this.add.text(cx, tagY + 26, 'Monte seu deck e derrote o Rei inimigo em batalhas 4v4', {
      fontFamily: F.body, fontSize: '13px',
      color: '#6a6050',
      wordWrap: { width: 480 },
      align: 'center',
      shadow: SHADOW.text,
    }).setOrigin(0.5).setAlpha(0)

    // =========================================================================
    // LAYER 13 — "JOGAR" button (epic, artifact-like)
    // =========================================================================
    const btnY = tagY + 80
    const btnW = 340
    const btnH = 72

    // Energy field behind button (pulsing)
    const energyField = this.add.graphics()
    for (let r = 100; r > 0; r -= 3) {
      const a = 0.006 * (r / 100)
      energyField.fillStyle(C.success, a)
      energyField.fillEllipse(cx, btnY, btnW + r, btnH + r * 0.6)
    }
    energyField.setAlpha(0)
    this.tweens.add({
      targets: energyField,
      alpha: { from: 0.5, to: 1 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })

    // Orbiting rune particles (8 particles in elliptical orbit)
    const orbitParticles: Phaser.GameObjects.Arc[] = []
    for (let i = 0; i < 10; i++) {
      const p = this.add.circle(cx, btnY, 1.5 + Math.random(), C.success, 0)
      orbitParticles.push(p)
      const angle = (Math.PI * 2 * i) / 10
      const rx = btnW / 2 + 22
      const ry = btnH / 2 + 16
      const speed = 5500 + Math.random() * 1500
      this.tweens.add({
        targets: { a: angle },
        a: angle + Math.PI * 2,
        duration: speed,
        repeat: -1,
        onUpdate: (_tw: Phaser.Tweens.Tween, target: { a: number }) => {
          p.setPosition(cx + Math.cos(target.a) * rx, btnY + Math.sin(target.a) * ry)
        },
      })
    }

    // Button shadow
    const btnShadowGfx = this.add.graphics()
    btnShadowGfx.fillStyle(0x000000, 0.45)
    btnShadowGfx.fillRoundedRect(cx - btnW / 2 + 4, btnY - btnH / 2 + 6, btnW, btnH, 16)

    // Button body (layered)
    const btnBg = this.add.graphics()
    // Main dark green
    btnBg.fillStyle(0x0e2a12, 1)
    btnBg.fillRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 16)
    // Inner gradient (brighter center)
    btnBg.fillStyle(0x1a4a22, 0.5)
    btnBg.fillRoundedRect(cx - btnW / 2 + 20, btnY - btnH / 2 + 8, btnW - 40, btnH - 16, 10)
    // Top glass
    btnBg.fillStyle(0xffffff, 0.04)
    btnBg.fillRoundedRect(cx - btnW / 2 + 4, btnY - btnH / 2 + 3, btnW - 8, btnH * 0.4,
      { tl: 13, tr: 13, bl: 0, br: 0 })
    // Bottom darkening
    btnBg.fillStyle(0x000000, 0.15)
    btnBg.fillRoundedRect(cx - btnW / 2 + 4, btnY + 2, btnW - 8, btnH / 2 - 5,
      { tl: 0, tr: 0, bl: 13, br: 13 })
    // Inner gold border
    btnBg.lineStyle(1, C.goldDim, 0.12)
    btnBg.strokeRoundedRect(cx - btnW / 2 + 3, btnY - btnH / 2 + 3, btnW - 6, btnH - 6, 13)
    // Outer green border
    btnBg.lineStyle(2, C.success, 0.65)
    btnBg.strokeRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 16)

    // Rune decorations on button border (4 small marks)
    const runeGfx = this.add.graphics()
    runeGfx.lineStyle(1.5, C.success, 0.3)
    const runePositions = [
      { x: cx - btnW / 2 + 30, y: btnY - btnH / 2 - 1 },
      { x: cx + btnW / 2 - 30, y: btnY - btnH / 2 - 1 },
      { x: cx - btnW / 2 + 30, y: btnY + btnH / 2 + 1 },
      { x: cx + btnW / 2 - 30, y: btnY + btnH / 2 + 1 },
    ]
    runePositions.forEach(rp => {
      runeGfx.lineBetween(rp.x - 8, rp.y, rp.x + 8, rp.y)
      runeGfx.fillStyle(C.success, 0.4)
      runeGfx.fillCircle(rp.x, rp.y, 2)
    })

    // Shield+sword icon
    const swordGfx = this.add.graphics()
    const sX = cx - 72, sY = btnY
    // Shield
    swordGfx.fillStyle(C.success, 0.15)
    swordGfx.lineStyle(2, C.success, 0.5)
    swordGfx.beginPath()
    swordGfx.moveTo(sX, sY - 16)
    swordGfx.lineTo(sX + 13, sY - 9)
    swordGfx.lineTo(sX + 13, sY + 5)
    swordGfx.lineTo(sX, sY + 16)
    swordGfx.lineTo(sX - 13, sY + 5)
    swordGfx.lineTo(sX - 13, sY - 9)
    swordGfx.closePath()
    swordGfx.fillPath()
    swordGfx.strokePath()
    // Sword
    swordGfx.lineStyle(2.5, C.success, 0.75)
    swordGfx.lineBetween(sX, sY - 20, sX, sY + 12)
    swordGfx.lineStyle(2, C.success, 0.5)
    swordGfx.lineBetween(sX - 7, sY - 7, sX + 7, sY - 7)

    // "JOGAR" text
    const btnLabel = this.add.text(cx + 10, btnY, 'JOGAR', {
      fontFamily: F.title, fontSize: '32px', fontStyle: 'bold',
      color: '#5ae890',
      shadow: { offsetX: 0, offsetY: 3, color: '#0a2a0a', blur: 10, fill: true },
    }).setOrigin(0.5)

    // Button shimmer
    const btnShimmer = UI.shimmer(this, cx + 10, btnY, 170, 36, 3500)
    btnShimmer.setDepth(8)

    // Hit area
    const hitArea = this.add.rectangle(cx, btnY, btnW, btnH, 0, 0.001)
      .setInteractive({ useHandCursor: true })

    hitArea.on('pointerover', () => {
      this.tweens.add({
        targets: [btnBg, btnShadowGfx, btnLabel, hitArea, swordGfx, runeGfx],
        scaleX: 1.06, scaleY: 1.06, duration: 160, ease: 'Quad.Out',
      })
      btnLabel.setColor('#aaffcc')
      orbitParticles.forEach(p => p.setAlpha(0.6))
    })
    hitArea.on('pointerout', () => {
      this.tweens.add({
        targets: [btnBg, btnShadowGfx, btnLabel, hitArea, swordGfx, runeGfx],
        scaleX: 1, scaleY: 1, duration: 160, ease: 'Quad.Out',
      })
      btnLabel.setColor('#5ae890')
      orbitParticles.forEach(p => p.setAlpha(0.3))
    })
    hitArea.on('pointerdown', () => {
      btnLabel.setColor('#2a8a4a')
      this.tweens.add({
        targets: [btnBg, btnShadowGfx, btnLabel, hitArea, swordGfx, runeGfx],
        scaleX: 0.96, scaleY: 0.96, duration: 80, yoyo: true, ease: 'Quad.InOut',
        onComplete: () => transitionTo(this, 'LobbyScene', undefined, 400, 'zoomIn'),
      })
    })

    // =========================================================================
    // LAYER 14 — Hint text + version
    // =========================================================================
    const hintText = this.add.text(cx, btnY + 55, 'Clique para entrar', {
      fontFamily: F.body, fontSize: '11px', color: '#3a5a3a',
      shadow: SHADOW.text,
    }).setOrigin(0.5).setAlpha(0)

    this.tweens.add({
      targets: hintText,
      alpha: { from: 0.25, to: 0.7 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
      delay: 2500,
    })

    // Footer line
    const footerGfx = this.add.graphics()
    for (let i = 0; i < W; i++) {
      const d = Math.abs(i - cx) / cx
      footerGfx.fillStyle(C.goldDim, 0.08 * (1 - d * d))
      footerGfx.fillRect(i, H - 32, 1, 1)
    }

    UI.badge(this, W - 50, H - 14, 'v1.0', C.goldDark, '#4a3d28')

    this.add.text(16, H - 14, 'Codeforje VIO', {
      fontFamily: F.body, fontSize: '10px', color: '#3a3020',
      shadow: SHADOW.text,
    }).setOrigin(0, 0.5)

    // =========================================================================
    // CINEMATIC ENTRANCE — Dramatic reveal sequence
    // =========================================================================

    // Black overlay fade
    UI.fadeIn(this, 700)

    // Light flash on title landing
    const flash = this.add.rectangle(cx, titleY, 600, 150, 0xffffff, 0).setDepth(12)

    // 0ms — Background and fog already visible
    // 200ms — God rays slowly brighten
    // 400ms — Title drops with impact
    titleShadow.setY(titleY - 50)
    title.setY(titleY - 50)
    titleHighlight.setY(titleY - 51)
    this.tweens.add({
      targets: [title, titleShadow],
      y: (_t: unknown, _k: unknown, _v: unknown, i: number) => i === 0 ? titleY : titleY + 4,
      alpha: (_t: unknown, _k: unknown, _v: unknown, i: number) => i === 0 ? 1 : 0.4,
      duration: 900,
      delay: 400,
      ease: 'Back.Out',
      onComplete: () => {
        // Impact flash
        this.tweens.add({
          targets: flash,
          alpha: 0.18,
          duration: 80,
          yoyo: true,
          onComplete: () => flash.destroy(),
        })
      },
    })

    // Title highlight (slightly delayed for layered feel)
    this.tweens.add({
      targets: titleHighlight,
      y: titleY - 1,
      alpha: 0.12,
      duration: 900,
      delay: 420,
      ease: 'Back.Out',
    })

    // 500ms — Crown scales in
    this.tweens.add({
      targets: crownGfx,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 600,
      delay: 550,
      ease: 'Back.Out',
    })

    // 600ms — Subtitle + dots
    subtitle.setY(subY + 15)
    this.tweens.add({
      targets: subtitle,
      y: subY, alpha: 1,
      duration: 500,
      delay: 650,
      ease: 'Quad.Out',
    })
    this.tweens.add({
      targets: dotGfx, alpha: 1,
      duration: 400, delay: 750, ease: 'Quad.Out',
    })

    // 700ms — Studio credit
    this.tweens.add({
      targets: studioText, alpha: 0.7,
      duration: 400, delay: 800, ease: 'Quad.Out',
    })

    // 800ms — Divider draws in
    this.tweens.add({
      targets: dividerGfx, alpha: 1,
      duration: 400, delay: 850, ease: 'Quad.Out',
    })

    // 900ms — Screen frame fades in
    this.tweens.add({
      targets: frameGfx, alpha: 1,
      duration: 500, delay: 900, ease: 'Quad.Out',
    })

    // 1000ms — Tagline reveals
    tag1.setY(tagY + 10)
    this.tweens.add({
      targets: tag1, y: tagY, alpha: 1,
      duration: 400, delay: 1000, ease: 'Quad.Out',
    })
    this.tweens.add({
      targets: tag2, alpha: 0.8,
      duration: 400, delay: 1100, ease: 'Quad.Out',
    })

    // 1700ms — Button materializes
    const btnElements = [energyField, btnShadowGfx, btnBg, btnLabel, hitArea, swordGfx, runeGfx, btnShimmer]
    btnElements.forEach(el => el.setAlpha(0).setScale(0.7))
    this.tweens.add({
      targets: btnElements,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 600,
      delay: 1700,
      ease: 'Back.Out',
      onComplete: () => {
        energyField.setAlpha(0.5)
      },
    })

    // 1900ms — Orbiting particles appear
    orbitParticles.forEach(p => p.setAlpha(0))
    this.tweens.add({
      targets: orbitParticles,
      alpha: 0.3,
      duration: 500,
      delay: 1900,
      ease: 'Quad.Out',
    })
  }

  // =========================================================================
  // PRIVATE — Atmospheric layer builders
  // =========================================================================

  /** Distant mountain/castle silhouette landscape */
  private _drawLandscape(cx: number, h: number) {
    const g = this.add.graphics()
    const baseY = h * 0.78

    // Mountains (layered, darker = further)
    // Far mountains
    g.fillStyle(0x040810, 0.7)
    g.beginPath()
    g.moveTo(0, h)
    g.lineTo(0, baseY + 20)
    g.lineTo(cx * 0.3, baseY - 40)
    g.lineTo(cx * 0.6, baseY)
    g.lineTo(cx, baseY - 65)
    g.lineTo(cx * 1.4, baseY - 10)
    g.lineTo(cx * 1.7, baseY - 50)
    g.lineTo(cx * 2, baseY + 10)
    g.lineTo(cx * 2, h)
    g.closePath()
    g.fillPath()

    // Near mountains (slightly lighter)
    g.fillStyle(0x060c16, 0.8)
    g.beginPath()
    g.moveTo(0, h)
    g.lineTo(0, baseY + 40)
    g.lineTo(cx * 0.4, baseY + 5)
    g.lineTo(cx * 0.7, baseY + 30)
    g.lineTo(cx * 1.1, baseY - 15)
    g.lineTo(cx * 1.5, baseY + 20)
    g.lineTo(cx * 1.8, baseY + 5)
    g.lineTo(cx * 2, baseY + 30)
    g.lineTo(cx * 2, h)
    g.closePath()
    g.fillPath()

    // Castle towers on distant mountain peaks
    const towerColor = 0x070d18
    const towerAlpha = 0.6
    // Left tower
    g.fillStyle(towerColor, towerAlpha)
    g.fillRect(cx * 0.3 - 5, baseY - 55, 10, 15)
    g.fillRect(cx * 0.3 - 7, baseY - 58, 14, 3)
    // Right tower
    g.fillRect(cx * 1.7 - 6, baseY - 66, 12, 16)
    g.fillRect(cx * 1.7 - 8, baseY - 70, 16, 4)
    // Center castle
    g.fillRect(cx - 8, baseY - 82, 16, 17)
    g.fillRect(cx - 10, baseY - 86, 20, 4)
    // Castle flag
    g.fillStyle(C.goldDim, 0.15)
    g.fillRect(cx + 5, baseY - 94, 8, 5)
    g.lineStyle(1, C.goldDim, 0.1)
    g.lineBetween(cx + 5, baseY - 96, cx + 5, baseY - 82)
  }

  /** Diagonal light beams (god rays) */
  private _drawGodRays(w: number, h: number) {
    const g = this.add.graphics()
    const rays = [
      { x: w * 0.6, angle: 0.15, width: 60, alpha: 0.012 },
      { x: w * 0.7, angle: 0.12, width: 40, alpha: 0.008 },
      { x: w * 0.45, angle: 0.18, width: 50, alpha: 0.01 },
      { x: w * 0.8, angle: 0.1, width: 35, alpha: 0.006 },
    ]

    rays.forEach(ray => {
      g.fillStyle(C.goldDim, ray.alpha)
      g.beginPath()
      g.moveTo(ray.x, 0)
      g.lineTo(ray.x + ray.width, 0)
      g.lineTo(ray.x + ray.width + h * ray.angle, h)
      g.lineTo(ray.x + h * ray.angle, h)
      g.closePath()
      g.fillPath()
    })

    // Animate rays fading in and out subtly
    this.tweens.add({
      targets: g,
      alpha: { from: 0.5, to: 1 },
      duration: 5000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })
  }

  /** Volumetric fog layers */
  private _createFogBank(w: number, h: number) {
    for (let i = 0; i < 4; i++) {
      const fogY = h * (0.6 + i * 0.1)
      const fogH = 20 + i * 12
      const fog = this.add.rectangle(w / 2, fogY, w * 1.8, fogH, C.fog, 0.01 + i * 0.004)

      this.tweens.add({
        targets: fog,
        x: fog.x + (i % 2 === 0 ? 90 : -70),
        alpha: { from: fog.alpha, to: fog.alpha * 0.2 },
        duration: 10000 + i * 2500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
        delay: i * 1500,
      })
    }
  }

  /** Two army formations facing each other */
  private _drawArmies(cx: number, h: number) {
    const g = this.add.graphics()
    const baseY = h - 80
    const soldierColor = 0x0a1420
    const alpha = 0.5

    // Left army (blue-tinted)
    const leftFormation = [
      { x: cx - 380, h2: 36, w: 14 },  // King (tallest)
      { x: cx - 340, h2: 28, w: 12 },
      { x: cx - 300, h2: 24, w: 11 },
      { x: cx - 265, h2: 20, w: 10 },
      { x: cx - 350, h2: 22, w: 10 },  // Second row
      { x: cx - 310, h2: 19, w: 9 },
    ]

    leftFormation.forEach(s => {
      g.fillStyle(soldierColor, alpha)
      g.fillRoundedRect(s.x - s.w / 2, baseY - s.h2, s.w, s.h2, 2)
      g.fillCircle(s.x, baseY - s.h2 - s.w * 0.3, s.w * 0.3)
    })
    // Spears
    g.lineStyle(1, soldierColor, alpha * 0.7)
    g.lineBetween(cx - 340, baseY - 40, cx - 340, baseY - 70)
    g.lineBetween(cx - 300, baseY - 36, cx - 300, baseY - 60)
    // Banner
    g.fillStyle(0x1a3a6a, 0.2)
    g.fillRect(cx - 384, baseY - 62, 10, 7)

    // Right army (red-tinted, mirrored)
    const rightFormation = [
      { x: cx + 380, h2: 36, w: 14 },
      { x: cx + 340, h2: 28, w: 12 },
      { x: cx + 300, h2: 24, w: 11 },
      { x: cx + 265, h2: 20, w: 10 },
      { x: cx + 350, h2: 22, w: 10 },
      { x: cx + 310, h2: 19, w: 9 },
    ]

    rightFormation.forEach(s => {
      g.fillStyle(soldierColor, alpha)
      g.fillRoundedRect(s.x - s.w / 2, baseY - s.h2, s.w, s.h2, 2)
      g.fillCircle(s.x, baseY - s.h2 - s.w * 0.3, s.w * 0.3)
    })
    g.lineStyle(1, soldierColor, alpha * 0.7)
    g.lineBetween(cx + 340, baseY - 40, cx + 340, baseY - 70)
    g.lineBetween(cx + 300, baseY - 36, cx + 300, baseY - 60)
    g.fillStyle(0x6a1a1a, 0.2)
    g.fillRect(cx + 378, baseY - 62, 10, 7)

    // Ground gradient (fades army into darkness)
    g.fillStyle(0x020409, 0.6)
    g.fillRect(0, baseY + 5, cx * 2, h - baseY)
  }

  /** Rising ember particles */
  private _createEmbers(w: number, h: number, count: number) {
    for (let i = 0; i < count; i++) {
      const px = Math.random() * w
      const size = 1 + Math.random() * 2.5
      const baseAlpha = 0.06 + Math.random() * 0.12
      // Warm ember colors (orange to red)
      const color = Math.random() > 0.5 ? C.ash : 0xd06030
      const ember = this.add.circle(px, h + 20, size, color, baseAlpha)

      this.tweens.add({
        targets: ember,
        y: h * 0.15 + Math.random() * h * 0.5,
        x: px + (Math.random() - 0.5) * 80,
        alpha: 0,
        duration: 4500 + Math.random() * 5000,
        repeat: -1,
        delay: Math.random() * 5000,
        ease: 'Quad.Out',
        onRepeat: () => {
          ember.setPosition(Math.random() * w, h + 20)
          ember.setAlpha(baseAlpha)
        },
      })
    }
  }

  /** Floating gold dust particles */
  private _createGoldDust(w: number, h: number, count: number) {
    for (let i = 0; i < count; i++) {
      const px = Math.random() * w
      const py = Math.random() * h
      const size = 0.5 + Math.random() * 1.5
      const baseAlpha = 0.03 + Math.random() * 0.07
      const p = this.add.circle(px, py, size, C.goldDim, baseAlpha)

      this.tweens.add({
        targets: p,
        y: py - 25 - Math.random() * 40,
        x: px + (Math.random() - 0.5) * 20,
        alpha: 0,
        duration: 3000 + Math.random() * 4000,
        repeat: -1,
        delay: Math.random() * 4000,
        onRepeat: () => {
          p.setPosition(Math.random() * w, Math.random() * h * 0.7 + h * 0.3)
          p.setAlpha(baseAlpha)
        },
      })
    }
  }

  /** Occasional bright spark flashes */
  private _createSparks(w: number, h: number, count: number) {
    for (let i = 0; i < count; i++) {
      const spark = this.add.circle(0, 0, 2, 0xffe080, 0)

      const sparkle = () => {
        spark.setPosition(Math.random() * w, h * 0.5 + Math.random() * h * 0.4)
        this.tweens.add({
          targets: spark,
          alpha: { from: 0, to: 0.4 + Math.random() * 0.3 },
          scaleX: { from: 0.5, to: 1.5 },
          scaleY: { from: 0.5, to: 1.5 },
          duration: 200 + Math.random() * 200,
          yoyo: true,
          onComplete: () => {
            this.time.delayedCall(3000 + Math.random() * 6000, sparkle)
          },
        })
      }

      this.time.delayedCall(Math.random() * 5000, sparkle)
    }
  }

  /** Full-screen decorative golden frame */
  private _drawScreenFrame(w: number, h: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics()
    const inset = 16
    const cornerLen = 40

    // Thin border lines (gradient from center outward)
    g.lineStyle(1, C.goldDim, 0.15)
    g.strokeRect(inset, inset, w - inset * 2, h - inset * 2)

    // Corner L-shapes (brighter)
    g.lineStyle(1.5, C.goldDim, 0.3)
    // Top-left
    g.beginPath()
    g.moveTo(inset, inset + cornerLen)
    g.lineTo(inset, inset)
    g.lineTo(inset + cornerLen, inset)
    g.strokePath()
    // Top-right
    g.beginPath()
    g.moveTo(w - inset - cornerLen, inset)
    g.lineTo(w - inset, inset)
    g.lineTo(w - inset, inset + cornerLen)
    g.strokePath()
    // Bottom-left
    g.beginPath()
    g.moveTo(inset, h - inset - cornerLen)
    g.lineTo(inset, h - inset)
    g.lineTo(inset + cornerLen, h - inset)
    g.strokePath()
    // Bottom-right
    g.beginPath()
    g.moveTo(w - inset - cornerLen, h - inset)
    g.lineTo(w - inset, h - inset)
    g.lineTo(w - inset, h - inset - cornerLen)
    g.strokePath()

    // Corner diamonds
    const dSize = 4
    const drawCornerDiamond = (dx: number, dy: number) => {
      g.fillStyle(C.goldDim, 0.4)
      g.fillPoints([
        new Phaser.Geom.Point(dx, dy - dSize),
        new Phaser.Geom.Point(dx + dSize, dy),
        new Phaser.Geom.Point(dx, dy + dSize),
        new Phaser.Geom.Point(dx - dSize, dy),
      ], true)
    }
    drawCornerDiamond(inset, inset)
    drawCornerDiamond(w - inset, inset)
    drawCornerDiamond(inset, h - inset)
    drawCornerDiamond(w - inset, h - inset)

    return g
  }

  /** Elaborate crown with jewels and filigree */
  private _drawElaborateCrown(x: number, y: number, w: number, h: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics()

    // Crown body (5 points for more elaborate shape)
    g.fillStyle(C.gold, 0.65)
    g.beginPath()
    g.moveTo(x - w / 2, y + h / 2)
    g.lineTo(x - w / 2, y - h / 4)
    g.lineTo(x - w / 3, y + h / 8)
    g.lineTo(x - w / 6, y - h / 2 + 2)
    g.lineTo(x, y + h / 8)
    g.lineTo(x + w / 6, y - h / 2 + 2)
    g.lineTo(x + w / 3, y + h / 8)
    g.lineTo(x + w / 2, y - h / 4)
    g.lineTo(x + w / 2, y + h / 2)
    g.closePath()
    g.fillPath()

    // Crown outline
    g.lineStyle(2, C.goldDim, 0.9)
    g.strokePath()

    // Gold rim band at bottom
    g.fillStyle(C.goldDim, 0.7)
    g.fillRect(x - w / 2 + 3, y + h / 2 - 5, w - 6, 5)
    g.lineStyle(1, C.gold, 0.5)
    g.lineBetween(x - w / 2 + 3, y + h / 2 - 5, x + w / 2 - 3, y + h / 2 - 5)

    // Jewels at tips
    g.fillStyle(0xff3344, 0.95)
    g.fillCircle(x - w / 6, y - h / 2 + 2, 3.5) // left ruby
    g.fillCircle(x + w / 6, y - h / 2 + 2, 3.5) // right ruby
    g.fillStyle(0x44aaff, 0.95)
    g.fillCircle(x, y + h / 8, 3)                // center sapphire
    g.fillStyle(0xffe050, 0.9)
    g.fillCircle(x - w / 2, y - h / 4, 2.5)      // left tip
    g.fillCircle(x + w / 2, y - h / 4, 2.5)      // right tip

    // Jewel highlights
    g.fillStyle(0xffffff, 0.3)
    g.fillCircle(x - w / 6 - 1, y - h / 2 + 1, 1.5)
    g.fillCircle(x + w / 6 - 1, y - h / 2 + 1, 1.5)

    // Inner filigree (subtle curved lines)
    g.lineStyle(1, 0xffffff, 0.08)
    g.beginPath()
    g.arc(x, y + 2, w * 0.25, Math.PI * 0.8, Math.PI * 0.2, true)
    g.strokePath()

    return g
  }

  /** Ornate divider with central diamond and extending lines */
  private _drawElaborateDivider(cx: number, y: number, totalW: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics()

    // Center diamond (larger)
    g.fillStyle(C.goldDim, 0.55)
    g.fillPoints([
      new Phaser.Geom.Point(cx, y - 5),
      new Phaser.Geom.Point(cx + 5, y),
      new Phaser.Geom.Point(cx, y + 5),
      new Phaser.Geom.Point(cx - 5, y),
    ], true)

    // Smaller diamonds flanking
    const smallD = 3
    const flankDist = 20
    ;[cx - flankDist, cx + flankDist].forEach(dx => {
      g.fillStyle(C.goldDim, 0.35)
      g.fillPoints([
        new Phaser.Geom.Point(dx, y - smallD),
        new Phaser.Geom.Point(dx + smallD, y),
        new Phaser.Geom.Point(dx, y + smallD),
        new Phaser.Geom.Point(dx - smallD, y),
      ], true)
    })

    // Lines extending from center outward (double line — gold + white)
    const lineStart = flankDist + 8
    const lineEnd = totalW / 2
    for (let i = lineStart; i < lineEnd; i++) {
      const t = 1 - (i - lineStart) / (lineEnd - lineStart)
      g.fillStyle(C.goldDim, 0.35 * t)
      g.fillRect(cx + i, y, 1, 1.5)
      g.fillRect(cx - i, y, 1, 1.5)
      // White highlight line below
      g.fillStyle(0xffffff, 0.04 * t)
      g.fillRect(cx + i, y + 2, 1, 0.5)
      g.fillRect(cx - i, y + 2, 1, 0.5)
    }

    // End circles
    g.fillStyle(C.goldDim, 0.2)
    g.fillCircle(cx - lineEnd, y, 2)
    g.fillCircle(cx + lineEnd, y, 2)

    return g
  }

  shutdown() {
    this.tweens.killAll()
  }
}
