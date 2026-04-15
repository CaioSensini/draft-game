/**
 * utils/SpriteFactory.ts -- generates character sprites for the arena.
 *
 * Renders real PNG sprites from /assets/characters/ when the texture is loaded
 * (via BootScene preload), with a procedural fallback using the Phaser Graphics
 * API for dummies, placeholders, or when an asset is missing.
 *
 * The fallback renders a colour-coded avatar with a class icon, giving a
 * consistent look while AAA sprites are being produced.
 */

import Phaser from 'phaser'
import { getCharacterKey, hasCharacterSprite, type CharClass } from './AssetPaths'

export type SpriteRole = 'king' | 'warrior' | 'specialist' | 'executor'
export type SpriteSide = 'left' | 'right'

// Team background colours keyed by side then role
const TEAM_BG: Record<SpriteSide, Record<SpriteRole, number>> = {
  left: {
    king:       0x3366cc,
    warrior:    0x2244aa,
    specialist: 0x2299aa,
    executor:   0x6633bb,
  },
  right: {
    king:       0xcc3333,
    warrior:    0xaa2222,
    specialist: 0xaa6633,
    executor:   0xbb3366,
  },
}

// Lighter accent per role (used for borders and icons)
const ROLE_ACCENT: Record<SpriteRole, number> = {
  king:       0xf0c850,  // gold
  warrior:    0x88aadd,  // steel blue
  specialist: 0x66ddbb,  // teal
  executor:   0xcc77ff,  // purple
}

/**
 * Draw a character sprite and return it as a Container centred at (0,0).
 *
 * If a real PNG sprite is loaded for the given role+skin (via BootScene),
 * it renders that with a subtle team-coloured glow ring behind it.
 * Otherwise, falls back to the procedural drawing (colour-coded square + icon).
 *
 * The returned container exposes, via `setData`, references that the
 * CharacterAnimator uses for AAA procedural animation:
 *   - `shadow`: ground shadow graphics (ellipse)
 *   - `glow`:   team-colour ring graphics (may be null)
 *   - `img`:    actual PNG image (may be null in fallback mode)
 *   - `facing`: +1 for left-side characters, -1 for right-side
 *
 * @param skin  — optional skin identifier (default: 'idle'). Pass 'crimson_idle',
 *                'radiant_idle', etc. to use alternate skins when available.
 */
export function drawCharacterSprite(
  scene: Phaser.Scene,
  role: SpriteRole,
  side: SpriteSide,
  size: number = 48,
  skin: string = 'idle',
): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0)

  // ── Ground shadow ──
  // An ellipse drawn at the sprite's feet that scales/fades as the character
  // "hops" during movement. Lives inside the sprite container so it moves
  // with world position automatically.
  const shadow = scene.add.graphics()
  shadow.fillStyle(0x000000, 0.45)
  shadow.fillEllipse(0, size * 0.42, size * 0.62, size * 0.18)
  container.add(shadow)
  container.setData('shadow', shadow)
  container.setData('facing', side === 'right' ? -1 : 1)

  // ── PNG path: use real sprite if the texture is loaded ──
  if (hasCharacterSprite(scene, role as CharClass, skin)) {
    const teamColor = TEAM_BG[side][role]

    // Soft team-coloured glow ring behind the sprite — this is how players
    // identify team at a glance (turquoise vs purple) without coloring the art.
    const glow = scene.add.graphics()
    glow.fillStyle(teamColor, 0.18)
    glow.fillCircle(0, 0, size * 0.55)
    glow.lineStyle(2, teamColor, 0.6)
    glow.strokeCircle(0, 0, size * 0.55)
    container.add(glow)
    container.setData('glow', glow)

    // The actual PNG sprite, scaled to fit the requested size.
    // Sprites are 1024x1024 portrait 2:3, so we scale height to size and let
    // width follow proportionally.
    const img = scene.add.image(0, -size * 0.05, getCharacterKey(role as CharClass, skin))
    const scale = (size * 1.4) / img.height
    img.setScale(scale)

    // Mirror horizontally for the right side so characters face the enemy.
    if (side === 'right') img.setFlipX(true)

    container.add(img)
    container.setData('img', img)
    return container
  }

  // ── Fallback path: procedural cartoon sprite ──
  const half = size / 2
  const g = scene.add.graphics()
  const accent = ROLE_ACCENT[role]
  const teamColor = TEAM_BG[side][role]

  // === BODY -- rounded rectangle with gradient feel ===

  // Outer glow / shadow
  g.fillStyle(teamColor, 0.3)
  g.fillRoundedRect(-half - 3, -half - 3, size + 6, size + 6, 10)

  // Main body
  g.fillStyle(teamColor, 1)
  g.fillRoundedRect(-half, -half, size, size, 8)

  // Inner highlight (top half lighter)
  g.fillStyle(0xffffff, 0.12)
  g.fillRoundedRect(-half + 2, -half + 2, size - 4, size / 2 - 2, { tl: 6, tr: 6, bl: 0, br: 0 })

  // Bottom darker
  g.fillStyle(0x000000, 0.15)
  g.fillRoundedRect(-half + 2, 2, size - 4, half - 4, { tl: 0, tr: 0, bl: 6, br: 6 })

  // Border
  g.lineStyle(2, accent, 0.8)
  g.strokeRoundedRect(-half, -half, size, size, 8)

  // === CLASS ICON ===
  _drawClassIcon(g, role, accent)

  container.add(g)
  return container
}

// ── Class icon drawing ──────────────────────────────────────────────────────

function _drawClassIcon(
  g: Phaser.GameObjects.Graphics,
  role: SpriteRole,
  color: number,
) {
  const cx = 0
  const cy = -2
  g.lineStyle(2.5, color, 1)

  switch (role) {
    case 'king': {
      // Crown shape
      const w = 20, h = 14, base = cy + 4
      g.fillStyle(color, 0.9)
      g.beginPath()
      g.moveTo(cx - w / 2, base)
      g.lineTo(cx - w / 2, base - h)
      g.lineTo(cx - w / 4, base - h / 2)
      g.lineTo(cx, base - h - 2)
      g.lineTo(cx + w / 4, base - h / 2)
      g.lineTo(cx + w / 2, base - h)
      g.lineTo(cx + w / 2, base)
      g.closePath()
      g.fillPath()
      g.strokePath()
      // Jewel dots
      g.fillStyle(0xff4444, 1)
      g.fillCircle(cx, base - h - 2, 2)
      g.fillStyle(0x4488ff, 1)
      g.fillCircle(cx - w / 4, base - h / 2, 1.5)
      g.fillCircle(cx + w / 4, base - h / 2, 1.5)
      break
    }

    case 'warrior': {
      // Shield shape
      const w = 18, h = 20
      g.fillStyle(color, 0.8)
      g.beginPath()
      g.moveTo(cx, cy - h / 2)
      g.lineTo(cx + w / 2, cy - h / 4)
      g.lineTo(cx + w / 2, cy + h / 6)
      g.lineTo(cx, cy + h / 2)
      g.lineTo(cx - w / 2, cy + h / 6)
      g.lineTo(cx - w / 2, cy - h / 4)
      g.closePath()
      g.fillPath()
      g.strokePath()
      // Cross on shield
      g.lineStyle(2, 0xffffff, 0.6)
      g.lineBetween(cx, cy - 6, cx, cy + 6)
      g.lineBetween(cx - 5, cy, cx + 5, cy)
      break
    }

    case 'specialist': {
      // Magic orb with sparkles
      g.fillStyle(color, 0.7)
      g.fillCircle(cx, cy, 9)
      g.lineStyle(2, color, 1)
      g.strokeCircle(cx, cy, 9)
      // Inner glow
      g.fillStyle(0xffffff, 0.3)
      g.fillCircle(cx - 2, cy - 2, 4)
      // Sparkle lines
      g.lineStyle(1.5, color, 0.8)
      g.lineBetween(cx, cy - 14, cx, cy - 10)
      g.lineBetween(cx, cy + 10, cx, cy + 14)
      g.lineBetween(cx - 14, cy, cx - 10, cy)
      g.lineBetween(cx + 10, cy, cx + 14, cy)
      break
    }

    case 'executor': {
      // Single drawn dagger, vertical, blade pointing up
      const bladeH = 14
      const bladeW = 3
      const guardW = 12
      const guardH = 2
      const gripH  = 5

      // Blade (role-tinted triangle)
      g.fillStyle(color, 0.85)
      g.beginPath()
      g.moveTo(cx, cy - bladeH)
      g.lineTo(cx + bladeW, cy)
      g.lineTo(cx - bladeW, cy)
      g.closePath()
      g.fillPath()
      g.lineStyle(1.5, color, 1)
      g.strokePath()

      // Cross-guard (horizontal bar at the base of the blade)
      g.fillStyle(color, 1)
      g.fillRect(cx - guardW / 2, cy, guardW, guardH)

      // Grip (vertical rectangle below the guard)
      g.fillStyle(color, 0.55)
      g.fillRect(cx - bladeW * 0.7, cy + guardH, bladeW * 1.4, gripH)

      // Pommel — red gem accent
      g.fillStyle(0xff3366, 1)
      g.fillCircle(cx, cy + guardH + gripH + 2, 2.2)
      break
    }
  }
}
