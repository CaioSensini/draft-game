/**
 * utils/CombatIcons.ts — shared sword + shield drawings.
 *
 * Originally lived as private methods on ShopScene; pulled into a util so
 * the same emblems can be reused in any scene that needs the combat
 * iconography (raid popups, achievement reveals, mastery breakdowns, etc.).
 *
 * Both functions render directly into a Phaser Graphics object the caller
 * supplies — no allocations, easy to compose with other layers.
 */

import Phaser from 'phaser'

/**
 * Attack icon — realistic medieval sword with bevelled blade, fuller,
 * crossguard, leather-wrapped grip and round pommel. Drawn pointing up.
 *
 * Footprint at scale = 1: roughly 30 × 54 px (centred on x, y).
 */
export function drawSwordIcon(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number,
  color: number,
  scale = 1,
): void {
  const s = scale

  // ── Blade (double-edged, tapered with bevelled centre) ──
  // Right half of blade (lighter — simulates light catching the edge)
  g.fillStyle(color, 0.65)
  g.beginPath()
  g.moveTo(x, y - 26 * s)
  g.lineTo(x + 4.5 * s, y - 4 * s)
  g.lineTo(x + 3.5 * s, y + 4 * s)
  g.lineTo(x, y + 4 * s)
  g.closePath()
  g.fillPath()
  // Left half (darker — shadow side)
  g.fillStyle(color, 0.45)
  g.beginPath()
  g.moveTo(x, y - 26 * s)
  g.lineTo(x - 4.5 * s, y - 4 * s)
  g.lineTo(x - 3.5 * s, y + 4 * s)
  g.lineTo(x, y + 4 * s)
  g.closePath()
  g.fillPath()
  // Blade outline
  g.lineStyle(1 * s, color, 0.9)
  g.beginPath()
  g.moveTo(x, y - 26 * s)
  g.lineTo(x + 4.5 * s, y - 4 * s)
  g.lineTo(x + 3.5 * s, y + 4 * s)
  g.lineTo(x - 3.5 * s, y + 4 * s)
  g.lineTo(x - 4.5 * s, y - 4 * s)
  g.closePath()
  g.strokePath()
  // Central fuller (groove in the blade)
  g.lineStyle(1.5 * s, 0x000000, 0.15)
  g.lineBetween(x, y - 22 * s, x, y + 2 * s)
  // Edge highlight (specular reflection on right edge)
  g.lineStyle(0.8, 0xffffff, 0.25)
  g.lineBetween(x + 3.5 * s, y - 20 * s, x + 4 * s, y - 6 * s)

  // ── Crossguard (curved, substantial) ──
  g.fillStyle(color, 0.8)
  g.beginPath()
  g.moveTo(x - 15 * s, y + 3 * s)
  g.lineTo(x - 14 * s, y + 7 * s)
  g.lineTo(x + 14 * s, y + 7 * s)
  g.lineTo(x + 15 * s, y + 3 * s)
  g.closePath()
  g.fillPath()
  g.lineStyle(1, color, 0.9)
  g.strokePath()
  // Guard centre accent
  g.fillStyle(0xffffff, 0.15)
  g.fillRect(x - 2 * s, y + 4 * s, 4 * s, 2 * s)

  // ── Grip (leather-wrapped) ──
  g.fillStyle(color, 0.35)
  g.fillRect(x - 2.5 * s, y + 7 * s, 5 * s, 14 * s)
  g.lineStyle(0.8, color, 0.6)
  g.strokeRect(x - 2.5 * s, y + 7 * s, 5 * s, 14 * s)
  // Leather wraps
  for (let i = 0; i < 5; i++) {
    const gy = y + (8 + i * 2.8) * s
    g.lineStyle(0.7, 0xffffff, 0.06)
    g.lineBetween(x - 2.5 * s, gy, x + 2.5 * s, gy)
  }

  // ── Pommel (round, substantial) ──
  g.fillStyle(color, 0.7)
  g.fillCircle(x, y + 23 * s, 4 * s)
  g.lineStyle(1, color, 0.9)
  g.strokeCircle(x, y + 23 * s, 4 * s)
  // Pommel gem highlight
  g.fillStyle(0xffffff, 0.2)
  g.fillCircle(x - 1.2 * s, y + 22 * s, 1.5 * s)
}

/**
 * Defense icon — heater shield with central boss, vertical heraldic stripe,
 * inner rim and a top-edge specular highlight. Drawn flat-top, point-down.
 *
 * Footprint at scale = 1: roughly 36 × 46 px (centred on x, y).
 */
export function drawShieldIcon(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number,
  color: number,
  scale = 1,
): void {
  const s = scale

  // ── Shield body (heater shape — flat top, pointed bottom) ──
  // Right half (lighter side)
  g.fillStyle(color, 0.2)
  g.beginPath()
  g.moveTo(x, y - 22 * s)
  g.lineTo(x + 18 * s, y - 20 * s)
  g.lineTo(x + 17 * s, y + 2 * s)
  g.lineTo(x, y + 24 * s)
  g.closePath()
  g.fillPath()
  // Left half (slightly darker for depth)
  g.fillStyle(color, 0.13)
  g.beginPath()
  g.moveTo(x, y - 22 * s)
  g.lineTo(x - 18 * s, y - 20 * s)
  g.lineTo(x - 17 * s, y + 2 * s)
  g.lineTo(x, y + 24 * s)
  g.closePath()
  g.fillPath()

  // ── Shield outline (thick, solid) ──
  g.lineStyle(2.5 * s, color, 0.85)
  g.beginPath()
  g.moveTo(x - 18 * s, y - 20 * s)
  g.lineTo(x + 18 * s, y - 20 * s)
  g.lineTo(x + 17 * s, y + 2 * s)
  g.lineTo(x, y + 24 * s)
  g.lineTo(x - 17 * s, y + 2 * s)
  g.closePath()
  g.strokePath()

  // ── Shield rim (inner border) ──
  g.lineStyle(1 * s, color, 0.3)
  g.beginPath()
  g.moveTo(x - 14 * s, y - 16 * s)
  g.lineTo(x + 14 * s, y - 16 * s)
  g.lineTo(x + 13 * s, y + 0 * s)
  g.lineTo(x, y + 18 * s)
  g.lineTo(x - 13 * s, y + 0 * s)
  g.closePath()
  g.strokePath()

  // ── Central vertical band (heraldry stripe) ──
  g.fillStyle(color, 0.25)
  g.beginPath()
  g.moveTo(x - 3 * s, y - 20 * s)
  g.lineTo(x + 3 * s, y - 20 * s)
  g.lineTo(x + 2 * s, y + 20 * s)
  g.lineTo(x, y + 24 * s)
  g.lineTo(x - 2 * s, y + 20 * s)
  g.closePath()
  g.fillPath()

  // ── Centre boss (round metal piece) ──
  g.fillStyle(color, 0.55)
  g.fillCircle(x, y - 2 * s, 5 * s)
  g.lineStyle(1, color, 0.8)
  g.strokeCircle(x, y - 2 * s, 5 * s)
  // Boss inner ring
  g.lineStyle(0.8, 0xffffff, 0.12)
  g.strokeCircle(x, y - 2 * s, 3 * s)
  // Boss highlight
  g.fillStyle(0xffffff, 0.15)
  g.fillCircle(x - 1.5 * s, y - 3.5 * s, 2 * s)

  // ── Top edge highlight (light glint) ──
  g.lineStyle(1, 0xffffff, 0.1)
  g.lineBetween(x - 14 * s, y - 19 * s, x + 14 * s, y - 19 * s)
}
