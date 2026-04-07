/**
 * Game Constants
 * Centralized configuration for UI dimensions, colors, timings, and game rules
 */

// ============================================================================
// BOARD & GRID DIMENSIONS
// ============================================================================
export const BOARD = {
  COLS: 16,
  ROWS: 6,
  TILE_SIZE: 64,
  WIDTH: 16 * 64, // 1024px
  HEIGHT: 6 * 64, // 384px
  WALL_COL: 8, // Divider between left (0-7) and right (8-15) teams
} as const

// ============================================================================
// HUD & UI DIMENSIONS
// ============================================================================
export const UI = {
  // Top HUD bar
  TOP_BAR_SMALL_HEIGHT: 48,
  TOP_BAR_TOTAL_HEIGHT: 96,
  
  // Bottom HUD area
  BOTTOM_OFFSET: 110,
  BOTTOM_BAR_HEIGHT: 220,
  
  // Board frame
  FRAME_PADDING: 28,
  
  // Phase/Timer display
  PHASE_TEXT_X: 320,
  TIMER_TEXT_X: 600,
  
  // Side banner (top-right)
  SIDE_BANNER_OFFSET_X: 90,
  SIDE_BANNER_Y: 104,
  SIDE_BANNER_WIDTH: 170,
  SIDE_BANNER_HEIGHT: 48,
  
  // Action button (end phase)
  ACTION_BUTTON_X: 950,
  ACTION_BUTTON_WIDTH: 240,
  ACTION_BUTTON_HEIGHT: 48,
  
  // Card buttons (action selection)
  CARD_BUTTON_SPACING_X: 250,
  CARD_BUTTON_SPACING_Y: 72,
  CARD_BUTTON_WIDTH: 220,
  CARD_BUTTON_HEIGHT: 56,
} as const

// ============================================================================
// UNIT VISUAL DIMENSIONS
// ============================================================================
export const UNIT_VISUAL = {
  // Circle sizes
  OUTER_RADIUS: 24,
  BODY_RADIUS: 21,
  
  // Symbol (text inside body)
  SYMBOL_FONT_SIZE: 22,
  
  // HP bar
  HP_BAR_OFFSET_Y: 33,
  HP_BAR_WIDTH: 42,
  HP_BAR_FILL_WIDTH: 40,
  HP_BAR_HEIGHT: 4,
  HP_TEXT_OFFSET_Y: 45,
  
  // Status indicators
  STATUS_TEXT_OFFSET_Y: 33,
} as const

// ============================================================================
// COLORS
// ============================================================================
export const COLORS = {
  // Team colors
  TEAM_LEFT: 0x3b82f6,   // Blue
  TEAM_RIGHT: 0xef4444,  // Red
  
  // Role colors
  KING: 0xfbbf24,        // Amber
  WARRIOR: 0x8b5cf6,     // Violet
  SPECIALIST: 0x10b981,  // Green
  EXECUTOR: 0xdc2626,    // Red
  
  // UI elements
  WALL: 0x4b5563,        // Gray
  HUD_BG: 0x0f172a,      // Dark slate
  HUD_TEXT: 0xdbeafe,    // Light blue
  HUD_BORDER: 0x475569,  // Slate
  
  // Card buttons
  ATTACK_BG: 0x7c2d12,   // Orange-brown
  DEFENSE_BG: 0x164e63,  // Cyan-dark
  ATTACK_BORDER: 0xdc2626, // Red
  DEFENSE_BORDER: 0x0284c7, // Blue
  
  // Status effects
  BLEED: 0xdc2626,       // Red
  STUN: 0xeab308,        // Yellow
  SHIELD: 0x0ea5e9,      // Sky
  REGEN: 0x10b981,       // Green
  
  // HP bar gradient
  HP_FULL: 0x22c55e,     // Green
  HP_MEDIUM: 0xef4444,   // Red
  HP_LOW: 0xf59e0b,      // Amber
  
  // Markers
  VALID_MOVE: 0x3b82f6,  // Blue
  VALID_MOVE_ALPHA: 0.3,
  TARGET: 0xef4444,      // Red
  TARGET_ALPHA: 0.3,
  
  // Effects
  DAMAGE_TEXT: 0xef4444, // Red
  HEAL_TEXT: 0x10b981,   // Green
  STUN_TEXT: 0xeab308,   // Yellow
  
  // General
  WHITE: 0xffffff,
  BLACK: 0x000000,
  GRAY: 0x6b7280,
} as const

// ============================================================================
// TIMINGS (in milliseconds)
// ============================================================================
export const TIMINGS = {
  // Phase durations
  MOVEMENT_PHASE_DURATION: 20000,  // 20 seconds
  ACTION_PHASE_DURATION: 15000,    // 15 seconds
  
  // Animation durations
  UNIT_MOVE_TWEEN: 180,            // Unit movement animation
  PROJECTILE_TWEEN: 400,           // Projectile travel
  AREA_PULSE: 450,                 // Area effect pulse
  FLOAT_TEXT_DURATION: 800,        // Floating damage/heal text
  
  // Phase transitions
  ACTION_RESOLUTION_DELAY: 900,    // Wait before showing action results
  BATTLE_END_DELAY: 1000,          // Delay before showing victory screen
  
  // Effect durations
  BLEED_TICK_INTERVAL: 1000,       // Bleed damage per second
  STUN_TICK_INTERVAL: 1000,        // Stun lasts 1 second per tick
} as const

// ============================================================================
// HP THRESHOLDS & RATIOS
// ============================================================================
export const HP_THRESHOLDS = {
  CRITICAL_RATIO: 0.25,    // < 25% = critical (orange)
  DANGER_RATIO: 0.55,      // < 55% = danger (red)
  HEALTHY_RATIO: 0.55,     // >= 55% = healthy (green)
} as const

// ============================================================================
// GAME RULES & MECHANICS
// ============================================================================
export const GAME_RULES = {
  // Team configuration
  TEAM_SIZE: 4,
  ROLES_PER_TEAM: ['king', 'warrior', 'specialist', 'executor'] as const,
  
  // Card mechanics
  CARDS_PER_ROLE: 4,
  ATTACK_CARDS_PER_ROLE: 2,
  DEFENSE_CARDS_PER_ROLE: 2,
  
  // Passive bonuses
  WARRIOR_GUARD_REDUCTION: 0.25,     // Warriors reduce 25% damage to allies
  WALL_TOUCH_REDUCTION: 0.1,         // Wall touch units reduce 10% damage
  ISOLATION_BONUS: 1.25,             // Isolated units do 25% more damage
  
  // Status effect mechanics
  HEAL_REDUCTION_DURATION: 2,        // Turns heal is reduced
  BLEED_TICKS: 3,                    // Bleed lasts 3 ticks
} as const

// ============================================================================
// STROKE STYLES
// ============================================================================
export const STROKE = {
  WIDTH: 2,
  ALPHA: 0.9,
} as const
