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

// ── Event type constants ──────────────────────────────────────────────────────

/**
 * All engine event type strings, centralised as a single const object.
 *
 * Every emit site and every subscriber must reference these constants instead
 * of raw string literals, so a rename only ever touches one place.
 *
 * Usage:
 *   import { EventType } from './types'
 *   emit({ type: EventType.CHARACTER_MOVED, ... })
 *   engine.onType(EventType.DAMAGE_APPLIED, handler)
 */
export const EventType = {
  // ── Movement
  CHARACTER_MOVED:        'CHARACTER_MOVED',
  UNIT_PUSHED:            'UNIT_PUSHED',
  PUSH_COLLISION:         'PUSH_COLLISION',

  // ── Damage / HP
  DAMAGE_APPLIED:         'DAMAGE_APPLIED',
  SHIELD_ABSORBED:        'SHIELD_ABSORBED',
  EVADE_TRIGGERED:        'EVADE_TRIGGERED',
  REFLECT_TRIGGERED:      'REFLECT_TRIGGERED',
  CHARACTER_DIED:         'CHARACTER_DIED',

  // ── Healing / buffs
  HEAL_APPLIED:           'HEAL_APPLIED',
  SHIELD_APPLIED:         'SHIELD_APPLIED',

  // ── Status effects
  STATUS_APPLIED:         'STATUS_APPLIED',
  BLEED_TICK:             'BLEED_TICK',
  POISON_TICK:            'POISON_TICK',
  BURN_TICK:              'BURN_TICK',
  REGEN_TICK:             'REGEN_TICK',
  STAT_MODIFIER_EXPIRED:  'STAT_MODIFIER_EXPIRED',

  // ── New mechanics
  MARK_CONSUMED:          'MARK_CONSUMED',
  REVIVE_TRIGGERED:       'REVIVE_TRIGGERED',
  LIFESTEAL_HEAL:         'LIFESTEAL_HEAL',
  DOUBLE_ATTACK_READY:    'DOUBLE_ATTACK_READY',
  DEFENSE_SILENCED:       'DEFENSE_SILENCED',

  // ── Passives
  PASSIVE_TRIGGERED:      'PASSIVE_TRIGGERED',

  // ── Dispel
  EFFECTS_CLEANSED:       'EFFECTS_CLEANSED',
  EFFECTS_PURGED:         'EFFECTS_PURGED',

  // ── Area
  AREA_RESOLVED:          'AREA_RESOLVED',

  // ── Card / selection
  CARD_SELECTED:          'CARD_SELECTED',
  TARGET_SELECTED:        'TARGET_SELECTED',
  AREA_TARGET_SET:        'AREA_TARGET_SET',
  CARD_ROTATED:           'CARD_ROTATED',

  // ── Skill execution
  SKILL_USED:             'SKILL_USED',

  // ── Per-character turn sequencing
  TURN_STARTED:           'TURN_STARTED',
  TURN_COMMITTED:         'TURN_COMMITTED',
  TURN_SKIPPED:           'TURN_SKIPPED',

  // ── Global combat rules
  COMBAT_RULE_ACTIVE:     'COMBAT_RULE_ACTIVE',

  // ── Player action state (controller-level)
  CHARACTER_FOCUSED:        'CHARACTER_FOCUSED',
  AWAITING_TARGET:          'AWAITING_TARGET',
  SELECTION_READY:          'SELECTION_READY',
  SELECTION_CANCELLED:      'SELECTION_CANCELLED',
  MOVE_CHARACTER_SELECTED:  'MOVE_CHARACTER_SELECTED',
  MOVE_SELECTION_CLEARED:   'MOVE_SELECTION_CLEARED',

  // ── Phase / round lifecycle
  PHASE_STARTED:          'PHASE_STARTED',
  PHASE_ENDED:            'PHASE_ENDED',
  RESOLUTION_STARTED:     'RESOLUTION_STARTED',
  ACTIONS_RESOLVED:       'ACTIONS_RESOLVED',
  ROUND_STARTED:          'ROUND_STARTED',
  BATTLE_STARTED:         'BATTLE_STARTED',
  BATTLE_ENDED:           'BATTLE_ENDED',
} as const

/** Union of all valid event type strings — derived from EventType so they stay in sync. */
export type EventTypeName = typeof EventType[keyof typeof EventType]

// ── Engine events emitted to subscribers (renderer, sound, etc.) ──────────────

export type EngineEvent =
  // ── Movement ──
  | { type: 'CHARACTER_MOVED';      unitId: string; fromCol: number; fromRow: number; toCol: number; toRow: number }

  // ── Damage / HP ──
  | { type: 'DAMAGE_APPLIED';       unitId: string; amount: number; newHp: number; sourceId: string | null }
  | { type: 'SHIELD_ABSORBED';      unitId: string; shieldDamage: number; newShield: number }
  | { type: 'EVADE_TRIGGERED';      unitId: string }
  | { type: 'REFLECT_TRIGGERED';    unitId: string; amount: number; sourceId: string }
  | { type: 'CHARACTER_DIED';
      unitId:   string
      /** Who dealt the killing blow. Null when killed by a DoT tick. */
      killedBy: string | null
      /** Whether the dead unit was the king (triggers victory check). */
      wasKing:  boolean
      round:    number }

  // ── Healing / buffs ──
  | { type: 'HEAL_APPLIED';         unitId: string; amount: number; newHp: number; sourceId: string | null }
  | { type: 'SHIELD_APPLIED';       unitId: string; amount: number }

  // ── Status effects ──
  | { type: 'STATUS_APPLIED';
      unitId: string
      status: 'bleed' | 'poison' | 'burn' | 'stun' | 'snare' | 'regen' | 'reflect' | 'evade'
            | 'def_down' | 'atk_down' | 'mov_down'
            | 'def_up'   | 'atk_up'   | 'mov_up'
            | 'heal_reduction'
            | 'mark' | 'revive'
            | 'double_attack' | 'silence_defense' | 'silence_attack'
            | 'teleport_self' | 'teleport_target'
            | 'invisibility' | 'clone'
      value: number }
  | { type: 'BLEED_TICK';           unitId: string; damage: number; newHp: number }
  | { type: 'POISON_TICK';          unitId: string; damage: number; newHp: number }
  | { type: 'BURN_TICK';            unitId: string; damage: number; newHp: number }
  | { type: 'REGEN_TICK';           unitId: string; heal: number;   newHp: number }
  | { type: 'STAT_MODIFIER_EXPIRED'; unitId: string
      effectType: 'def_down' | 'atk_down' | 'mov_down' | 'def_up' | 'atk_up' }

  // ── New mechanics ──
  /** A mark was consumed on hit, dealing bonus damage. */
  | { type: 'MARK_CONSUMED';  unitId: string; bonusDamage: number; sourceId: string }
  /** A revive buffer triggered, preventing death. */
  | { type: 'REVIVE_TRIGGERED'; unitId: string; restoredHp: number }
  /** Lifesteal healed the caster after dealing damage. */
  | { type: 'LIFESTEAL_HEAL'; unitId: string; amount: number; newHp: number }
  /** Double-attack mode activated — character will use 2 attack skills next turn. */
  | { type: 'DOUBLE_ATTACK_READY'; unitId: string }
  /** A character's defense was silenced — they cannot use defense skills this turn. */
  | { type: 'DEFENSE_SILENCED'; unitId: string; sourceId: string }

  // ── Passives ──
  /**
   * A passive ability fired automatically during combat.
   * Emitted by PassiveSystem.onDamageDealt (and future injection points).
   * Renderers can use this to display passive-activation indicators (sparkles, icons).
   */
  | { type: 'PASSIVE_TRIGGERED'
      /** Character whose passive fired. */
      unitId:    string
      /** Which passive definition was triggered (matches PassiveDefinition.id). */
      passiveId: string
      /** Target affected by the passive, when applicable. */
      targetId?: string }

  // ── Dispel ──
  /** Debuffs removed from an ally/self by a cleanse effect. */
  | { type: 'EFFECTS_CLEANSED'; unitId: string; removed: string[] }
  /** Buffs stripped from an enemy by a purge effect. */
  | { type: 'EFFECTS_PURGED';   unitId: string; removed: string[] }

  // ── Area ──
  | { type: 'AREA_RESOLVED';        centerCol: number; centerRow: number; hitIds: string[] }

  // ── Push / knockback ──
  /**
   * A character was pushed in a direction.
   * `distanceMoved` may be less than `force` when blocked.
   */
  | { type: 'UNIT_PUSHED'
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
   * Emitted in addition to `UNIT_PUSHED` when collidedWith !== null.
   */
  | { type: 'PUSH_COLLISION'
      /** The unit that was pushed and stopped. */
      pushedId:  string
      /** The unit that blocked the push. */
      blockerId: string
      /** Tile where the collision occurred. */
      col:       number
      row:       number }

  // ── Card / selection ──
  | { type: 'CARD_SELECTED';        unitId: string; cardId: string; category: CardCategory }
  | { type: 'TARGET_SELECTED';      unitId: string; targetId: string }
  | { type: 'AREA_TARGET_SET';      unitId: string; col: number; row: number }
  | { type: 'CARD_ROTATED';         unitId: string; cardId: string; category: CardCategory; nextCardId: string }

  // ── Skill execution ──
  /**
   * A skill is about to be resolved in combat (fires BEFORE damage/effects events).
   * Phaser should use this as the trigger to start skill animations (projectile,
   * cast glow, etc.), before the outcome events arrive.
   *
   * Distinction from `CARD_SELECTED`:
   *   CARD_SELECTED  → player selected a card in the UI (selection phase)
   *   SKILL_USED     → the skill is actually executing this turn (resolution phase)
   *
   * For defense skills: targetId is the caster's own id.
   * For area skills:    areaCenter is set; targetId is absent.
   */
  | { type: 'SKILL_USED'
      /** Character executing the skill. */
      unitId:      string
      skillId:     string
      skillName:   string
      category:    CardCategory
      /** Target unit ID — set for single-target attacks and all defense skills. */
      targetId?:   string
      /** Center tile — set for area skills. */
      areaCenter?: { col: number; row: number } }

  // ── Per-character turn sequencing ──
  | { type: 'TURN_STARTED';
      unitId:       string
      /** 1-based position in the phase sequence. */
      order:        number
      total:        number
      timeBudgetMs: number }
  | { type: 'TURN_COMMITTED';
      unitId:     string
      timeUsedMs: number }
  | { type: 'TURN_SKIPPED';
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
  | { type: 'COMBAT_RULE_ACTIVE'
      ruleId: string
      /** The side this bonus applies to (or 'left'/'right' for ATK bonuses). */
      side:   TeamSide
      /** Effective bonus value for the current round state. */
      value:  number }

  // ── Player action state (controller-level) ──
  /**
   * The player focused a character during the action phase.
   * UI should highlight the character and show its available cards.
   */
  | { type: 'CHARACTER_FOCUSED'; unitId: string }
  /**
   * The player selected a character to move during the movement phase.
   * UI should highlight valid destination tiles (call ctrl.getValidMoves(unitId)).
   */
  | { type: 'MOVE_CHARACTER_SELECTED'; unitId: string }
  /**
   * The movement selection was cleared (character moved or phase ended).
   * UI should remove move-destination overlays.
   */
  | { type: 'MOVE_SELECTION_CLEARED' }
  /**
   * An attack skill requiring explicit targeting was selected.
   * UI should enter target-selection mode.
   *   targetMode 'unit' → player must call chooseTarget with a unitId
   *   targetMode 'tile' → player must call chooseTarget with a col/row
   */
  | { type: 'AWAITING_TARGET'
      unitId:     string
      skillId:    string
      targetMode: 'unit' | 'tile' }
  /**
   * Both attack and defense have been selected for the focused character.
   * UI can show a "confirm" indicator; the turn can be committed.
   */
  | { type: 'SELECTION_READY'; unitId: string }
  /**
   * The current action selection was cancelled (or the focused character changed).
   * unitId is null when no character was focused at the time of cancellation.
   */
  | { type: 'SELECTION_CANCELLED'; unitId: string | null }

  // ── Phase / round lifecycle ──
  | { type: 'PHASE_STARTED';     phase: PhaseType; side: TeamSide; duration: number }
  | { type: 'PHASE_ENDED';       phase: PhaseType; side: TeamSide }
  | { type: 'RESOLUTION_STARTED'; side: TeamSide }
  | { type: 'ACTIONS_RESOLVED';  side: TeamSide }
  | { type: 'ROUND_STARTED';     round: number }
  | { type: 'BATTLE_STARTED' }
  | { type: 'BATTLE_ENDED'
      /** Winning side, or null on draw (simultaneous kings / timeout / forfeit draw). */
      winner: TeamSide | null
      reason: 'king_slain' | 'simultaneous_kings' | 'timeout' | 'forfeit'
      round:  number }
