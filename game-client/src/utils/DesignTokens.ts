/**
 * DesignTokens.ts — Single source of truth for ALL visual constants.
 *
 * Every scene, component, and utility MUST import from here.
 * NO hardcoded colors, fonts, or sizes allowed in scene files.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════════════════

export const C = {
  // ── Gold palette (primary accent) ──
  gold:         0xf0c850,
  goldHex:      '#f0c850',
  goldDim:      0xc9a84c,
  goldDimHex:   '#c9a84c',
  goldDark:     0x8b6914,
  goldDarkHex:  '#8b6914',

  // ── Backgrounds ──
  bg:           0x04070d,
  bgHex:        '#04070d',
  panelBg:      0x12161f,
  panelBgAlt:   0x0e1420,
  panelBorder:  0x3d2e14,

  // ── Text ──
  bodyHex:      '#e8e0d0',
  mutedHex:     '#7a7062',
  dimHex:       '#5a4a30',

  // ── Team colors (Turquesa vs Roxo) ──
  blue:         0x00ccaa,
  blueHex:      '#00ccaa',
  red:          0x8844cc,
  redHex:       '#8844cc',

  // ── Semantic ──
  success:      0x4ade80,
  successHex:   '#4ade80',
  successDark:  0x1a3a1a,
  danger:       0xef5350,
  dangerHex:    '#ef5350',
  dangerDark:   0x3a1515,
  info:         0x4fc3f7,
  infoHex:      '#4fc3f7',
  infoDark:     0x0e2a3a,
  warning:      0xffa726,
  warningHex:   '#ffa726',
  purple:       0xab47bc,
  purpleHex:    '#ab47bc',

  // ── Class accents ──
  king:         0x4a90d9,
  warrior:      0x2255aa,
  specialist:   0x44aacc,
  executor:     0x7744cc,

  // ── Atmosphere ──
  fog:          0x1a2a3a,
  ash:          0xc9a060,

  // ── Misc ──
  white:        0xffffff,
  black:        0x000000,
  shadow:       0x000000,
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// FONTS
// ═══════════════════════════════════════════════════════════════════════════════

export const F = {
  title:  'Arial Black, Arial, sans-serif',
  body:   'Arial, sans-serif',
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// SIZES
// ═══════════════════════════════════════════════════════════════════════════════

export const S = {
  // Text sizes (mobile-friendly — large, bold, legible like Brawl Stars)
  titleHuge:    '42px',
  titleLarge:   '34px',
  titleMedium:  '26px',
  titleSmall:   '22px',
  body:         '18px',
  bodySmall:    '15px',
  small:        '14px',    // minimum — never go below 14px

  // Spacing
  borderRadius: 8,
  borderRadiusSmall: 5,
  borderRadiusLarge: 12,
  panelPadding: 16,
  buttonH:      48,
  buttonHSmall: 36,
  cardGap:      10,
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT SHADOW PRESETS
// ═══════════════════════════════════════════════════════════════════════════════

export const SHADOW = {
  /** Subtle shadow for body text */
  text: { offsetX: 1, offsetY: 1, color: '#000000', blur: 3, fill: true },
  /** Strong shadow for titles and important text */
  strong: { offsetX: 2, offsetY: 2, color: '#000000', blur: 6, fill: true },
  /** Gold glow for premium text */
  goldGlow: { offsetX: 0, offsetY: 2, color: '#8b6914', blur: 8, fill: true },
} as const

/** Global text outline — apply to all game text for readability on any background */
export const STROKE = {
  color: '#000000',
  thin: 3,
  normal: 4,
  thick: 5,
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export const SCREEN = {
  W: 1280,
  H: 720,
} as const
