/**
 * engine/types.ts — all pure type definitions for the game engine.
 *
 * No Phaser, no DOM, no external dependencies.
 * These types are the contract between the engine and any renderer.
 */

// ── Primitives ────────────────────────────────────────────────────────────────

export type TeamSide      = 'left' | 'right'
export type UnitRole      = 'king' | 'warrior' | 'specialist' | 'executor'
export type PhaseType     = 'movement' | 'action'
export type CardCategory  = 'attack' | 'defense'
export type CardGroup     = 'attack1' | 'attack2' | 'defense1' | 'defense2'
export type CardEffect    = 'damage' | 'heal' | 'shield' | 'bleed' | 'stun' | 'evade' | 'reflect' | 'regen' | 'area'
export type CardTargetType = 'single' | 'self' | 'lowest_ally' | 'all_allies' | 'area'
export type BotDifficulty = 'easy' | 'normal' | 'hard'

export type Position = { readonly col: number; readonly row: number }

// ── Static definitions (immutable, provided at game-start) ────────────────────

/** Unit identity and starting position. Never mutated during a battle. */
export interface UnitDef {
  readonly id:   string
  readonly name: string
  readonly role: UnitRole
  readonly side: TeamSide
  readonly col:  number
  readonly row:  number
}

/** Card definition loaded from the card registry. */
export interface CardDef {
  readonly id:         string
  readonly name:       string
  readonly category:   CardCategory
  readonly group:      CardGroup
  readonly effect:     CardEffect
  readonly targetType: CardTargetType
  readonly power:      number
}

/** Base stats for a role, applied when creating a unit's runtime state. */
export interface RoleStats {
  readonly maxHp:    number
  readonly attack:   number
  readonly defense:  number
  readonly mobility: number
}

// ── Mutable runtime types (exist only during a battle) ───────────────────────

/** All mutable stats and status effects for a unit in combat. */
export interface UnitRuntime {
  col:                 number
  row:                 number
  hp:                  number
  maxHp:               number
  attack:              number
  defense:             number
  mobility:            number
  shield:              number
  evadeCharges:        number
  reflectPower:        number
  bleedTicks:          number
  bleedPower:          number
  regenTicks:          number
  regenPower:          number
  stunTicks:           number
  healReductionTicks:  number
  healReductionFactor: number
  alive:               boolean
}

/** Action selections and phase-progress flags for a single unit's turn. */
export interface UnitTurn {
  movedThisPhase:      boolean
  actedThisPhase:      boolean
  selectedAttackId:    string | null
  selectedDefenseId:   string | null
  selectedTargetId:    string | null          // unit target (single/lowest_ally)
  selectedArea:        Position | null        // tile target (area)
}

/** Rotating card queues. Head of each queue = card shown to player. */
export interface UnitDeck {
  attackQueue:  string[]   // card IDs
  defenseQueue: string[]
}

/** Accumulated battle statistics, used for the end-game summary. */
export interface CombatStats {
  damageDealt:    number
  damageReceived: number
  healsGiven:     number
  kills:          number
}

// ── Configuration passed to GameEngine ───────────────────────────────────────

/** Deck choice for one unit: exactly 4 attack IDs + 4 defense IDs. */
export interface UnitDeckConfig {
  attackCards:  string[]
  defenseCards: string[]
}

/** Full team config — one entry per role. Partial because roles may use defaults. */
export type TeamDeckConfig = Partial<Record<UnitRole, UnitDeckConfig>>

/** Everything the engine needs to start a battle. */
export interface GameConfig {
  units:         UnitDef[]
  roleStats:     Record<UnitRole, RoleStats>
  cardRegistry:  ReadonlyMap<string, CardDef>
  deckConfig:    TeamDeckConfig
  botSide:       TeamSide
  botDifficulty: BotDifficulty
  /** Phase duration in seconds (default: movement=20, action=15). */
  phaseDurations?: { movement: number; action: number }
}

// ── Result monad ──────────────────────────────────────────────────────────────

export type Result<T, E = string> =
  | { ok: true;  value: T }
  | { ok: false; error: E }

export function Ok<T>(value: T): Result<T>         { return { ok: true, value } }
export function Err<T = never>(error: string): Result<T> { return { ok: false, error } }

// ── Engine events emitted to subscribers (renderer, sound, etc.) ──────────────

export type EngineEvent =
  // ── Movement ──
  | { type: 'unit_moved';        unitId: string; fromCol: number; fromRow: number; toCol: number; toRow: number }

  // ── Damage / HP ──
  | { type: 'damage_taken';      unitId: string; amount: number; newHp: number; sourceId: string | null }
  | { type: 'shield_absorbed';   unitId: string; shieldDamage: number; newShield: number }
  | { type: 'evade_triggered';   unitId: string }
  | { type: 'reflect_triggered'; unitId: string; amount: number; sourceId: string }
  | { type: 'unit_died';
      unitId:   string
      /** Who dealt the killing blow. Null when killed by a DoT tick. */
      killedBy: string | null
      /** Whether the dead unit was the king (triggers victory check). */
      wasKing:  boolean
      round:    number }

  // ── Healing / buffs ──
  | { type: 'heal_applied';      unitId: string; amount: number; newHp: number; sourceId: string | null }
  | { type: 'shield_applied';    unitId: string; amount: number }

  // ── Status effects ──
  | { type: 'status_applied';
      unitId: string
      status: 'bleed' | 'poison' | 'stun' | 'regen' | 'reflect' | 'evade'
            | 'def_down' | 'atk_down' | 'mov_down'
            | 'def_up'   | 'atk_up'
            | 'heal_reduction'
      value: number }
  | { type: 'bleed_tick';          unitId: string; damage: number; newHp: number }
  | { type: 'poison_tick';         unitId: string; damage: number; newHp: number }
  | { type: 'regen_tick';          unitId: string; heal: number;   newHp: number }
  | { type: 'stat_modifier_expired'; unitId: string
      effectType: 'def_down' | 'atk_down' | 'mov_down' | 'def_up' | 'atk_up' }

  // ── Passives ──
  /**
   * A passive ability fired automatically during combat.
   * Emitted by PassiveSystem.onDamageDealt (and future injection points).
   * Renderers can use this to display passive-activation indicators (sparkles, icons).
   */
  | { type: 'passive_triggered'
      /** Character whose passive fired. */
      unitId:    string
      /** Which passive definition was triggered (matches PassiveDefinition.id). */
      passiveId: string
      /** Target affected by the passive, when applicable. */
      targetId?: string }

  // ── Dispel ──
  /** Debuffs removed from an ally/self by a cleanse effect. */
  | { type: 'effects_cleansed'; unitId: string; removed: string[] }
  /** Buffs stripped from an enemy by a purge effect. */
  | { type: 'effects_purged';   unitId: string; removed: string[] }

  // ── Area ──
  | { type: 'area_resolved';     centerCol: number; centerRow: number; hitIds: string[] }

  // ── Push / knockback ──
  /**
   * A character was pushed in a direction.
   * `distanceMoved` may be less than `force` when blocked.
   */
  | { type: 'unit_pushed'
      unitId:        string
      fromCol:       number
      fromRow:       number
      toCol:         number
      toRow:         number
      /** Requested push magnitude in tiles. */
      force:         number
      /** Tiles actually moved (< force when blocked). */
      distanceMoved: number
      /** True when the push was stopped before completing the full distance. */
      blocked:       boolean
      /** ID of the unit that blocked the push (if blocked by a unit, not a wall). */
      collidedWith:  string | null }
  /**
   * A pushed unit collided with another unit and was stopped.
   * Emitted in addition to `unit_pushed` when collidedWith !== null.
   */
  | { type: 'push_collision'
      /** The unit that was pushed and stopped. */
      pushedId:  string
      /** The unit that blocked the push. */
      blockerId: string
      /** Tile where the collision occurred. */
      col:       number
      row:       number }

  // ── Card / selection ──
  | { type: 'card_selected';     unitId: string; cardId: string; category: CardCategory }
  | { type: 'target_selected';   unitId: string; targetId: string }
  | { type: 'area_target_set';   unitId: string; col: number; row: number }
  | { type: 'card_rotated';      unitId: string; cardId: string; category: CardCategory; nextCardId: string }

  // ── Per-character turn sequencing ──
  | { type: 'turn_started';
      unitId:       string
      /** 1-based position in the phase sequence. */
      order:        number
      total:        number
      timeBudgetMs: number }
  | { type: 'turn_committed';
      unitId:     string
      timeUsedMs: number }
  | { type: 'turn_skipped';
      unitId: string
      reason: 'stunned' | 'dead' | 'no_selection' | 'timed_out' }

  // ── Global combat rules ──
  /**
   * A battlefield-wide rule is currently in effect this round.
   * Emitted once per active rule per side at round start by CombatRuleSystem.
   * Renderers use this to show HUD indicators (e.g. "Wall Defense +10 %").
   *
   * `value` is the total computed bonus for this round
   * (e.g. 2 wall-touchers × 0.05 = 0.10).
   */
  | { type: 'combat_rule_active'
      ruleId: string
      /** The side this bonus applies to (or 'left'/'right' for ATK bonuses). */
      side:   TeamSide
      /** Effective bonus value for the current round state. */
      value:  number }

  // ── Phase / round lifecycle ──
  | { type: 'phase_started';     phase: PhaseType; side: TeamSide; duration: number }
  | { type: 'phase_ended';       phase: PhaseType; side: TeamSide }
  | { type: 'actions_resolved';  side: TeamSide }
  | { type: 'round_started';     round: number }
  | { type: 'battle_started' }
  | { type: 'battle_ended'
      /** Winning side, or null on draw (simultaneous kings / timeout / forfeit draw). */
      winner: TeamSide | null
      reason: 'king_slain' | 'simultaneous_kings' | 'timeout' | 'forfeit'
      round:  number }
