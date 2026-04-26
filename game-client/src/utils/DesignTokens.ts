/**
 * DesignTokens.ts — Single source of truth for ALL visual and layout constants.
 *
 * Every scene, component, and utility MUST import from here.
 * NO hardcoded colors, fonts, sizes, or magic numbers allowed in scene files.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STRUCTURE
 *
 * Semantic (preferred for new code):
 *   colors.team.ally | colors.team.enemy
 *   colors.class.king | colors.class.warrior | ...
 *   colors.ui.*, colors.status.*, colors.semantic.*
 *   fonts.heading | fonts.body
 *   sizes.board | sizes.hud | sizes.unit | sizes.button
 *   spacing.xs | sm | md | lg | xl
 *   timings.movementPhase | actionPhase | ...
 *   hpThresholds.*, gameRules.*, turnTimesPerMode.*
 *
 * Legacy (preserved for backward compatibility):
 *   C (colors object), F (fonts), S (sizes), SHADOW, STROKE, SCREEN
 *   BOARD, UI, UNIT_VISUAL, COLORS, TIMINGS, HP_THRESHOLDS, GAME_RULES,
 *   TURN_TIMES_PER_MODE
 *
 * All legacy exports are preserved to avoid mass refactor; new code should
 * prefer the semantic namespaces above.
 *
 * Sprint 0 consolidation (2026-04-20):
 *   - src/data/constants.ts was merged into this file and deleted.
 *   - Team/class color values use the constants.ts palette (blue/red + gold/violet/green/red)
 *     per design decision in DECISIONS.md (readability on grid > earlier turquesa/roxo draft).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SEMANTIC NAMESPACE (preferred)
// ═══════════════════════════════════════════════════════════════════════════════

export const colors = {
  // ── Team (readability-first palette) ──
  team: {
    ally:     0x3b82f6,   // blue — left side
    allyHex:  '#3b82f6',
    enemy:    0xef4444,   // red — right side
    enemyHex: '#ef4444',
  },

  // ── Class (distinct across the board) ──
  class: {
    king:       0xfbbf24,   // amber/gold
    kingHex:    '#fbbf24',
    warrior:    0x8b5cf6,   // violet
    warriorHex: '#8b5cf6',
    specialist:    0x10b981,   // green
    specialistHex: '#10b981',
    executor:    0xdc2626,   // deep red
    executorHex: '#dc2626',
  },

  // ── UI shells ──
  ui: {
    bg:          0x04070d,   bgHex:          '#04070d',
    panel:       0x12161f,   panelHex:       '#12161f',
    panelAlt:    0x0e1420,   panelAltHex:    '#0e1420',
    panelBorder: 0x3d2e14,
    hudBg:       0x0f172a,   hudBgHex:       '#0f172a',
    hudText:     0xdbeafe,   hudTextHex:     '#dbeafe',
    hudBorder:   0x475569,
    wall:        0x4b5563,
    gold:        0xf0c850,   goldHex:        '#f0c850',
    goldDim:     0xc9a84c,   goldDimHex:     '#c9a84c',
    goldDark:    0x8b6914,   goldDarkHex:    '#8b6914',
    bodyHex:     '#e8e0d0',
    mutedHex:    '#7a7062',
    dimHex:      '#5a4a30',
    white:       0xffffff,
    black:       0x000000,
    gray:        0x6b7280,
  },

  // ── Card slot colors ──
  card: {
    attackBg:      0x7c2d12,
    attackBorder:  0xdc2626,
    defenseBg:     0x164e63,
    defenseBorder: 0x0284c7,
  },

  // ── Status effects ──
  status: {
    bleed:  0xdc2626,
    stun:   0xeab308,
    shield: 0x0ea5e9,
    regen:  0x10b981,
  },

  // ── Semantic ──
  semantic: {
    success:      0x4ade80,  successHex:   '#4ade80',  successDark: 0x1a3a1a,
    danger:       0xef5350,  dangerHex:    '#ef5350',  dangerDark:  0x3a1515,
    info:         0x4fc3f7,  infoHex:      '#4fc3f7',  infoDark:    0x0e2a3a,
    warning:      0xffa726,  warningHex:   '#ffa726',
    purple:       0xab47bc,  purpleHex:    '#ab47bc',
  },

  // ── HP bar gradient ──
  hp: {
    full:   0x22c55e,
    medium: 0xef4444,
    low:    0xf59e0b,
  },

  // ── Targeting / markers ──
  marker: {
    validMove:        0x3b82f6,
    validMoveAlpha:   0.3,
    target:           0xef4444,
    targetAlpha:      0.3,
  },

  // ── Floating text ──
  text: {
    damage: 0xef4444,
    heal:   0x10b981,
    stun:   0xeab308,
  },

  // ── Atmosphere ──
  atmosphere: {
    fog: 0x1a2a3a,
    ash: 0xc9a060,
  },

  // ── Shadow tones (for text-shadow presets; not part of the main palette) ──
  shadow: {
    blackHex:    '#000000',
    darkGoldHex: '#5a3a00',  // deep-gold glow used by BootScene logo
    deepBgHex:   '#04070d',
    // Dark accents reused across login/menu HTML fragments
    bgGradStartHex: '#141a2a',
    bgGradEndHex:   '#0e1320',
    inputBgHex:     '#080c16',
    inputBorderHex: '#1e1a14',
    formBorderHex:  '#3d2e14',
    mutedTabHex:    '#5a4a38',
    bodyMutedHex:   '#c0b8a8',
    // Green action button
    buttonFromHex:      '#2a4e1e',
    buttonToHex:        '#1e3a16',
    buttonBorderHex:    '#4a8a3a',
    buttonBorderHoverHex: '#6aaa5a',
    buttonTextHex:      '#b8e8a0',
    // Blue action button
    blueFromHex:        '#1e3a5a',
    blueToHex:          '#162a4a',
    blueBorderHex:      '#3a6a9a',
    blueBorderHoverHex: '#5a8aba',
    blueTextHex:        '#80c8f7',
    // Info / link
    infoHoverHex:       '#81d4fa',
    // Success alt (monospace verification code)
    successAltHex:      '#4caf50',
    // Error red
    errorHex:           '#e05555',
  },
} as const

export const fonts = {
  heading: 'Arial Black, Arial, sans-serif',
  body:    'Arial, sans-serif',
} as const

export const sizes = {
  // Board (grid world coordinates)
  board: {
    cols:     16,
    rows:     6,
    tileSize: 64,
    width:    16 * 64,   // 1024 px
    height:   6 * 64,    // 384 px
    wallCol:  8,
  },

  // HUD layout
  hud: {
    topBarSmallHeight: 48,
    topBarTotalHeight: 96,
    bottomOffset:      110,
    bottomBarHeight:   220,
    framePadding:      28,
    phaseTextX:        320,
    timerTextX:        600,
    sideBannerOffsetX: 90,
    sideBannerY:       104,
    sideBannerWidth:   170,
    sideBannerHeight:  48,
    actionButtonX:     950,
    actionButtonWidth: 240,
    actionButtonHeight:48,
    cardButtonSpacingX:250,
    cardButtonSpacingY:72,
    cardButtonWidth:   220,
    cardButtonHeight:  56,
  },

  // Unit rendering
  unit: {
    outerRadius:       24,
    bodyRadius:        21,
    symbolFontSize:    22,
    hpBarOffsetY:      33,
    hpBarWidth:        42,
    hpBarFillWidth:    40,
    hpBarHeight:       4,
    hpTextOffsetY:     45,
    statusTextOffsetY: 33,
  },

  // Text sizes (mobile-friendly)
  text: {
    titleHuge:   '42px',
    titleLarge:  '34px',
    titleMedium: '26px',
    titleSmall:  '22px',
    body:        '18px',
    bodySmall:   '15px',
    small:       '14px',
  },

  // Buttons
  button: {
    sm: { h: 36, minTouch: 44 },
    md: { h: 48, minTouch: 48 },
    lg: { h: 60, minTouch: 60 },
  },

  // Border radii
  radius: {
    sm: 5,
    md: 8,
    lg: 12,
  },

  panelPadding: 16,
  cardGap:      10,
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const

export const timings = {
  movementPhaseMs:  20000,
  actionPhaseMs:    20000,     // v3: 15s → 20s default
  unitMoveTween:    180,
  projectileTween:  400,
  areaPulse:        450,
  floatText:        800,
  actionResolution: 900,
  battleEnd:        1000,
  bleedTickInterval: 1000,
  stunTickInterval:  1000,
} as const

// v3 §10 — Tempos de turno por modo
export const turnTimesPerMode = {
  '1v1': { perCharacterMs: 20000, charactersPerPlayer: 4 },
  '2v2': { perCharacterMs: 20000, charactersPerPlayer: 2 },
  '4v4': { perCharacterMs: 25000, charactersPerPlayer: 1 },
} as const

export const hpThresholds = {
  critical: 0.25,   // < 25% = critical
  danger:   0.55,   // < 55% = danger
  healthy:  0.55,   // >= 55% = healthy
} as const

export const gameRules = {
  teamSize: 4,
  rolesPerTeam: ['king', 'warrior', 'specialist', 'executor'] as const,
  cardsPerRole: 4,
  attackCardsPerRole: 2,
  defenseCardsPerRole: 2,
  warriorGuardReduction: 0.25,
  wallTouchReduction:    0.10,
  isolationBonus:        1.25,
  healReductionDuration: 2,
  bleedTicks:            3,
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY NAMESPACE (preserved — do not expand, prefer semantic exports above)
// ═══════════════════════════════════════════════════════════════════════════════

export const C = {
  // ── Gold palette (primary accent) ──
  gold:         colors.ui.gold,
  goldHex:      colors.ui.goldHex,
  goldDim:      colors.ui.goldDim,
  goldDimHex:   colors.ui.goldDimHex,
  goldDark:     colors.ui.goldDark,
  goldDarkHex:  colors.ui.goldDarkHex,

  // ── Backgrounds ──
  bg:           colors.ui.bg,
  bgHex:        colors.ui.bgHex,
  panelBg:      colors.ui.panel,
  panelBgAlt:   colors.ui.panelAlt,
  panelBorder:  colors.ui.panelBorder,

  // ── Text ──
  bodyHex:      colors.ui.bodyHex,
  mutedHex:     colors.ui.mutedHex,
  dimHex:       colors.ui.dimHex,

  // ── Team colors (per Sprint 0 decision — readability palette) ──
  blue:         colors.team.ally,
  blueHex:      colors.team.allyHex,
  red:          colors.team.enemy,
  redHex:       colors.team.enemyHex,

  // ── Semantic ──
  success:      colors.semantic.success,
  successHex:   colors.semantic.successHex,
  successDark:  colors.semantic.successDark,
  danger:       colors.semantic.danger,
  dangerHex:    colors.semantic.dangerHex,
  dangerDark:   colors.semantic.dangerDark,
  info:         colors.semantic.info,
  infoHex:      colors.semantic.infoHex,
  infoDark:     colors.semantic.infoDark,
  warning:      colors.semantic.warning,
  warningHex:   colors.semantic.warningHex,
  purple:       colors.semantic.purple,
  purpleHex:    colors.semantic.purpleHex,

  // ── Class accents (Sprint 0 palette) ──
  king:         colors.class.king,
  warrior:      colors.class.warrior,
  specialist:   colors.class.specialist,
  executor:     colors.class.executor,

  // ── Atmosphere ──
  fog:          colors.atmosphere.fog,
  ash:          colors.atmosphere.ash,

  // ── Misc ──
  white:        colors.ui.white,
  black:        colors.ui.black,
  shadow:       colors.ui.black,
} as const

export const F = {
  title: fonts.heading,
  body:  fonts.body,
} as const

export const S = {
  titleHuge:         sizes.text.titleHuge,
  titleLarge:        sizes.text.titleLarge,
  titleMedium:       sizes.text.titleMedium,
  titleSmall:        sizes.text.titleSmall,
  body:              sizes.text.body,
  bodySmall:         sizes.text.bodySmall,
  small:             sizes.text.small,
  borderRadius:      sizes.radius.md,
  borderRadiusSmall: sizes.radius.sm,
  borderRadiusLarge: sizes.radius.lg,
  panelPadding:      sizes.panelPadding,
  buttonH:           sizes.button.md.h,
  buttonHSmall:      sizes.button.sm.h,
  cardGap:           sizes.cardGap,
} as const

export const SHADOW = {
  text:     { offsetX: 1, offsetY: 1, color: '#000000', blur: 3, fill: true },
  strong:   { offsetX: 2, offsetY: 2, color: '#000000', blur: 6, fill: true },
  goldGlow: { offsetX: 0, offsetY: 2, color: '#8b6914', blur: 8, fill: true },
} as const

export const STROKE = {
  color:  '#000000',
  thin:   3,
  normal: 4,
  thick:  5,
} as const

export const SCREEN = {
  W: 1280,
  H: 720,
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// MIGRATED FROM data/constants.ts (2026-04-20)
// ═══════════════════════════════════════════════════════════════════════════════

export const BOARD = {
  COLS:     sizes.board.cols,
  ROWS:     sizes.board.rows,
  TILE_SIZE: sizes.board.tileSize,
  WIDTH:    sizes.board.width,
  HEIGHT:   sizes.board.height,
  WALL_COL: sizes.board.wallCol,
} as const

export const UI = {
  TOP_BAR_SMALL_HEIGHT: sizes.hud.topBarSmallHeight,
  TOP_BAR_TOTAL_HEIGHT: sizes.hud.topBarTotalHeight,
  BOTTOM_OFFSET:        sizes.hud.bottomOffset,
  BOTTOM_BAR_HEIGHT:    sizes.hud.bottomBarHeight,
  FRAME_PADDING:        sizes.hud.framePadding,
  PHASE_TEXT_X:         sizes.hud.phaseTextX,
  TIMER_TEXT_X:         sizes.hud.timerTextX,
  SIDE_BANNER_OFFSET_X: sizes.hud.sideBannerOffsetX,
  SIDE_BANNER_Y:        sizes.hud.sideBannerY,
  SIDE_BANNER_WIDTH:    sizes.hud.sideBannerWidth,
  SIDE_BANNER_HEIGHT:   sizes.hud.sideBannerHeight,
  ACTION_BUTTON_X:      sizes.hud.actionButtonX,
  ACTION_BUTTON_WIDTH:  sizes.hud.actionButtonWidth,
  ACTION_BUTTON_HEIGHT: sizes.hud.actionButtonHeight,
  CARD_BUTTON_SPACING_X: sizes.hud.cardButtonSpacingX,
  CARD_BUTTON_SPACING_Y: sizes.hud.cardButtonSpacingY,
  CARD_BUTTON_WIDTH:     sizes.hud.cardButtonWidth,
  CARD_BUTTON_HEIGHT:    sizes.hud.cardButtonHeight,
} as const

export const UNIT_VISUAL = {
  OUTER_RADIUS:       sizes.unit.outerRadius,
  BODY_RADIUS:        sizes.unit.bodyRadius,
  SYMBOL_FONT_SIZE:   sizes.unit.symbolFontSize,
  HP_BAR_OFFSET_Y:    sizes.unit.hpBarOffsetY,
  HP_BAR_WIDTH:       sizes.unit.hpBarWidth,
  HP_BAR_FILL_WIDTH:  sizes.unit.hpBarFillWidth,
  HP_BAR_HEIGHT:      sizes.unit.hpBarHeight,
  HP_TEXT_OFFSET_Y:   sizes.unit.hpTextOffsetY,
  STATUS_TEXT_OFFSET_Y: sizes.unit.statusTextOffsetY,
} as const

export const COLORS = {
  TEAM_LEFT:       colors.team.ally,
  TEAM_RIGHT:      colors.team.enemy,
  KING:            colors.class.king,
  WARRIOR:         colors.class.warrior,
  SPECIALIST:      colors.class.specialist,
  EXECUTOR:        colors.class.executor,
  WALL:            colors.ui.wall,
  HUD_BG:          colors.ui.hudBg,
  HUD_TEXT:        colors.ui.hudText,
  HUD_BORDER:      colors.ui.hudBorder,
  ATTACK_BG:       colors.card.attackBg,
  DEFENSE_BG:      colors.card.defenseBg,
  ATTACK_BORDER:   colors.card.attackBorder,
  DEFENSE_BORDER:  colors.card.defenseBorder,
  BLEED:           colors.status.bleed,
  STUN:            colors.status.stun,
  SHIELD:          colors.status.shield,
  REGEN:           colors.status.regen,
  HP_FULL:         colors.hp.full,
  HP_MEDIUM:       colors.hp.medium,
  HP_LOW:          colors.hp.low,
  VALID_MOVE:      colors.marker.validMove,
  VALID_MOVE_ALPHA: colors.marker.validMoveAlpha,
  TARGET:          colors.marker.target,
  TARGET_ALPHA:    colors.marker.targetAlpha,
  DAMAGE_TEXT:     colors.text.damage,
  HEAL_TEXT:       colors.text.heal,
  STUN_TEXT:       colors.text.stun,
  WHITE:           colors.ui.white,
  BLACK:           colors.ui.black,
  GRAY:            colors.ui.gray,
} as const

export const TIMINGS = {
  MOVEMENT_PHASE_DURATION: timings.movementPhaseMs,
  ACTION_PHASE_DURATION:   timings.actionPhaseMs,
  UNIT_MOVE_TWEEN:         timings.unitMoveTween,
  PROJECTILE_TWEEN:        timings.projectileTween,
  AREA_PULSE:              timings.areaPulse,
  FLOAT_TEXT_DURATION:     timings.floatText,
  ACTION_RESOLUTION_DELAY: timings.actionResolution,
  BATTLE_END_DELAY:        timings.battleEnd,
  BLEED_TICK_INTERVAL:     timings.bleedTickInterval,
  STUN_TICK_INTERVAL:      timings.stunTickInterval,
} as const

export const TURN_TIMES_PER_MODE = turnTimesPerMode

export const HP_THRESHOLDS = {
  CRITICAL_RATIO: hpThresholds.critical,
  DANGER_RATIO:   hpThresholds.danger,
  HEALTHY_RATIO:  hpThresholds.healthy,
} as const

export const GAME_RULES = {
  TEAM_SIZE: gameRules.teamSize,
  ROLES_PER_TEAM: gameRules.rolesPerTeam,
  CARDS_PER_ROLE: gameRules.cardsPerRole,
  ATTACK_CARDS_PER_ROLE: gameRules.attackCardsPerRole,
  DEFENSE_CARDS_PER_ROLE: gameRules.defenseCardsPerRole,
  WARRIOR_GUARD_REDUCTION: gameRules.warriorGuardReduction,
  WALL_TOUCH_REDUCTION:    gameRules.wallTouchReduction,
  ISOLATION_BONUS:         gameRules.isolationBonus,
  HEAL_REDUCTION_DURATION: gameRules.healReductionDuration,
  BLEED_TICKS:             gameRules.bleedTicks,
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM PHASE 1 (2026-04-21) — parallel namespaces
// ═══════════════════════════════════════════════════════════════════════════════
//
// These namespaces encode the tokens from `design-system-handoff/colors_and_type.css`
// into Phaser-friendly shapes. They live ALONGSIDE the legacy namespaces above —
// no legacy value is modified, so all existing callers keep working.
//
// New components should prefer these tokens. Migration of legacy code is organic,
// per component, and will happen as scenes are redesigned in Phase 2.
//
// Reference: design-system-handoff/INTEGRATION_SPEC.md and colors_and_type.css.
// Conversion rules:
//   #RRGGBB       → 0xRRGGBB
//   rgba(...)     → { color: 0xRRGGBB, alpha: number }
//   Ndpi durations → plain ms numbers
//   cubic-bezier  → Phaser easing name (approximate if no exact match)
// ═══════════════════════════════════════════════════════════════════════════════

/** Color with optional alpha channel — preferred shape for translucent tokens. */
export type TokenRgba = { color: number; alpha: number }

// ── Class aura glows (4 new tokens) ──
export const classGlow = {
  rei:          { color: 0xfbbf24, alpha: 0.40 } as TokenRgba,
  guerreiro:    { color: 0x8b5cf6, alpha: 0.40 } as TokenRgba,
  executor:     { color: 0xdc2626, alpha: 0.40 } as TokenRgba,
  especialista: { color: 0x10b981, alpha: 0.40 } as TokenRgba,
  teamAlly:     { color: 0x3b82f6, alpha: 0.35 } as TokenRgba,
  teamEnemy:    { color: 0xef4444, alpha: 0.35 } as TokenRgba,
} as const

// ── Surface layers — CSS --bg-0..4 (navy palette, NOT the legacy deep-black) ──
export const surface = {
  deepest: 0x0a0f1c,  // --bg-0 : cloth behind parchment
  primary: 0x0f172a,  // --bg-1 : primary app bg
  panel:   0x1e293b,  // --bg-2 : panels, cards, modals
  raised:  0x273449,  // --bg-3 : raised panel, hover surface
  input:   0x334155,  // --bg-4 : top-of-stack, input fill
} as const

// ── Border weights ──
export const border = {
  subtle:    0x1e293b,
  default:   0x334155,
  strong:    0x475569,
  royal:     0x78562a,
  royalLit:  0xa97b2e,
} as const

// ── Foreground (text) palette ──
export const fg = {
  primary:   0xf1f5f9,  primaryHex:   '#f1f5f9',
  secondary: 0xcbd5e1,  secondaryHex: '#cbd5e1',
  tertiary:  0x94a3b8,  tertiaryHex:  '#94a3b8',
  disabled:  0x64748b,  disabledHex:  '#64748b',
  inverse:   0x0f172a,  inverseHex:   '#0f172a',
} as const

// ── Accents (gold CTA family) ──
export const accent = {
  primary: 0xfbbf24,  primaryHex: '#fbbf24',
  hot:     0xf59e0b,  hotHex:     '#f59e0b',
  dim:     0x78562a,  dimHex:     '#78562a',
} as const

// ── Stateful colors (success/error/warn/info) ──
// NOTE: values differ from legacy `colors.semantic.*` — use these for any new UI.
export const state = {
  success:      0x10b981,  successHex:      '#10b981',
  successDim:   0x065f46,  successDimHex:   '#065f46',
  error:        0xef4444,  errorHex:        '#ef4444',
  errorDim:     0x7f1d1d,  errorDimHex:     '#7f1d1d',
  warn:         0xf59e0b,  warnHex:         '#f59e0b',
  warnCritical: 0xdc2626,  warnCriticalHex: '#dc2626',
  info:         0x3b82f6,  infoHex:         '#3b82f6',
} as const

// ── Currency ──
export const currency = {
  goldCoin:     0xfbbf24,  goldCoinHex:     '#fbbf24',
  goldCoinEdge: 0x78562a,  goldCoinEdgeHex: '#78562a',
  dgGem:        0xa78bfa,  dgGemHex:        '#a78bfa',
  dgGemEdge:    0x5b21b6,  dgGemEdgeHex:    '#5b21b6',
} as const

// ── HP state aliases (CSS-compliant nomenclature) ──
// Legacy `colors.hp.full/medium/low` kept intact. New code uses these names.
export const hpState = {
  full:     0x22c55e,  fullHex:     '#22c55e',
  wounded:  0xf59e0b,  woundedHex:  '#f59e0b',
  critical: 0xef4444,  criticalHex: '#ef4444',
  shield:   0x94a3b8,  shieldHex:   '#94a3b8',
} as const

// ── HP threshold (CSS-compliant rules, alias to legacy hpThresholds) ──
export const hpBreakpoint = {
  wounded:  0.55, // <= 0.55 & > 0.25 → wounded (amber)
  critical: 0.25, // <= 0.25 → critical (red)
} as const

// ── Tactical board tile states ──
//
// Per-side alts (`allySideAlt` / `enemySideAlt`) intentionally read brighter
// than the base wash so the checker pattern is visible. The spec's single
// `defaultAlt` value (#1f2a42) is kept for non-sided contexts, but on the
// arena it was too close to `allySide` to register as a separate stripe —
// the explicit per-side alts fix that contrast without touching the rest
// of the palette.
export const tile = {
  default:         0x1b2438,
  defaultAlt:      0x1f2a42,
  allySide:        0x1a2a4a,
  allySideAlt:     0x22385c,   // brighter navy — visible checker vs allySide
  enemySide:       0x3a1a22,
  enemySideAlt:    0x4a1c26,   // brighter crimson — spec text value
  hover:           { color: 0xffffff, alpha: 0.08 } as TokenRgba,
  validMove:       { color: 0x10b981, alpha: 0.28 } as TokenRgba,
  validMoveBorder: 0x10b981,
  validSkill:      { color: 0xfbbf24, alpha: 0.22 } as TokenRgba,
  validSkillBorder:0xfbbf24,
  areaPreview:     { color: 0xef4444, alpha: 0.22 } as TokenRgba,
  areaBorder:      0xef4444,
  wall:            0x4b5563,
  wallShine:       0x94a3b8,
} as const

// ── Typography: new font stacks (Google Fonts + generic fallbacks) ──
export const fontFamily = {
  display: "'Cinzel', 'Trajan Pro', serif",
  serif:   "'Cormorant Garamond', 'Cinzel', serif",
  body:    "'Manrope', 'Inter', system-ui, sans-serif",
  mono:    "'JetBrains Mono', ui-monospace, monospace",
} as const

// ── Type scale (CSS --fs-*). Values in px as numeric strings for Phaser. ──
export const typeScale = {
  displayXl: '56px',
  displayLg: '40px',
  displayMd: '32px',
  h1:        '28px',
  h2:        '22px',
  h3:        '18px',
  body:      '15px',
  small:     '13px',
  meta:      '11px',
  statLg:    '22px',
  statMd:    '16px',
} as const

export const lineHeight = {
  tight: 1.1,
  body:  1.5,
} as const

export const letterSpacing = {
  display: '0.08em',
  label:   '0.14em',
  body:    '0.005em',
} as const

// ── Radii (CSS --r-*). NOTE: numerically different from legacy sizes.radius.*. ──
//
// ⚠️ FOOTGUN: `radii.pill` is the CSS idiom for "fully rounded" but Phaser's
// Graphics.fillRoundedRect / strokeRoundedRect does NOT clamp the radius to
// half the smallest dimension. Passing 999 to a small rect makes the corner
// arcs extend across the canvas, drawing the fill color in unintended areas.
//
// For Phaser pill shapes, ALWAYS pass `Math.floor(rectHeight / 2)` or a
// concrete number ≤ rectHeight/2 instead of `radii.pill`. This token is kept
// only for CSS / DOM-side consumers (UI.inputField, etc.) where it works.
export const radii = {
  sm:   4,
  md:   6,
  lg:   8,
  xl:   12,
  pill: 999,
} as const

// ── Spacing extension (legacy `spacing` missed 12/48/64) ──
export const spacingScale = {
  sp1:  4,   // --sp-1
  sp2:  8,   // --sp-2
  sp3:  12,  // --sp-3
  sp4:  16,  // --sp-4
  sp5:  24,  // --sp-5
  sp6:  32,  // --sp-6
  sp8:  48,  // --sp-8
  sp10: 64,  // --sp-10
} as const

// ── Motion curves & durations ──
// Phaser easing names approximated to CSS cubic-beziers.
export const motion = {
  easeOut:   'Cubic.easeOut',     // cubic-bezier(0.22, 1, 0.36, 1)
  easeInOut: 'Cubic.easeInOut',   // cubic-bezier(0.65, 0, 0.35, 1)
  durFast:   120,                 // --dur-fast  (ms)
  durBase:   200,                 // --dur-base  (ms)
  durSlow:   360,                 // --dur-slow  (ms)
} as const

// ── Elevation (CSS shadows interpreted as Phaser-friendly specs) ──
// Phaser can't render box-shadow; Graphics must emulate. These specs provide
// enough parameters for a consumer to draw an offset drop-shadow rect and
// optionally an inset highlight.
export type ElevationSpec = {
  offsetY: number
  blur:    number
  color:   number
  alpha:   number
  inset?:  { color: number; alpha: number } | null
}

export const elevation = {
  sm:   { offsetY: 1,  blur: 2,  color: 0x000000, alpha: 0.35, inset: null } as ElevationSpec,
  md:   { offsetY: 4,  blur: 12, color: 0x000000, alpha: 0.45, inset: { color: 0xffffff, alpha: 0.04 } } as ElevationSpec,
  lg:   { offsetY: 16, blur: 40, color: 0x000000, alpha: 0.55, inset: { color: 0xffffff, alpha: 0.05 } } as ElevationSpec,
  gold: { offsetY: 6,  blur: 18, color: 0xfbbf24, alpha: 0.18, inset: null } as ElevationSpec,
  inset:{ offsetY: -1, blur: 0,  color: 0xffffff, alpha: 0.05, inset: { color: 0x000000, alpha: 0.5 } } as ElevationSpec,
  focusRing: { offsetY: 0, blur: 4, color: 0xfbbf24, alpha: 1.0, inset: null } as ElevationSpec,
} as const
