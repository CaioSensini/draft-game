/**
 * scenes/BattleScene.ts — event-driven battle renderer + player input.
 *
 * Strict separation of concerns:
 *   - NO game logic. All combat math lives in the engine layer.
 *   - NO state mutation. Character state is owned by the engine.
 *   - NO orchestration. Phase advancement / turn sequencing → BattleDriver.
 *
 * This scene:
 *   1. Builds the engine stack and passes it to BattleDriver.
 *   2. Draws a static grid and character squares.
 *   3. Reacts to EngineEvents with purely visual responses.
 *   4. Captures player input and forwards commands to GameController.
 *
 * Player input flow (left side = human):
 *   TURN_STARTED (player actor)
 *     → ctrl.selectCharacter(actorId)        [auto-called by scene]
 *     → CHARACTER_FOCUSED → show skill panel
 *   Player clicks skill card
 *     → ctrl.useSkill(skillId)
 *     → CARD_SELECTED (immediate) OR AWAITING_TARGET (needs explicit target)
 *   Player clicks target highlight
 *     → ctrl.chooseTarget(spec)
 *     → CARD_SELECTED + maybe SELECTION_READY
 *   Player clicks Confirm
 *     → ctrl.commitTurn()
 *   Player clicks Cancel
 *     → ctrl.cancelAction() → ctrl.selectCharacter(actorId)
 *
 * All input goes through GameController. CombatEngine is never touched here.
 */

import Phaser from 'phaser'
import { Character }          from '../domain/Character'
import type { CharacterSide } from '../domain/Character'
import type { Skill }         from '../domain/Skill'
import { SkillRegistry }      from '../domain/SkillRegistry'
import { Team }               from '../domain/Team'
import { Battle }             from '../domain/Battle'
import { areaOffsets }         from '../domain/Grid'
import { transitionTo }       from '../utils/SceneTransition'
import { GameController }     from '../engine/GameController'
import { PhaserBridge }       from '../engine/PhaserBridge'
import { EventType }          from '../engine/types'
import type { EngineEvent }   from '../engine/types'
import { AutoPlayer }         from '../engine/AutoPlayer'
import { BattleDriver }       from '../engine/BattleDriver'
import { SKILL_CATALOG }      from '../data/skillCatalog'
import { DECK_ASSIGNMENTS }   from '../data/deckAssignments'
import { PASSIVE_CATALOG }    from '../data/passiveCatalog'
import { GLOBAL_RULES }       from '../data/globalRules'
import { GameState, GameStateManager } from '../core/GameState'
import { soundManager } from '../utils/SoundManager'
import { UI, hpStatusColor } from '../utils/UIComponents'
import {
  accent, border, colors as dsColors, state as dsState, fg, fontFamily, hpState,
  radii, surface, tile as dsTile, typeScale,
} from '../utils/DesignTokens'
import { VFXManager } from '../utils/VFXManager'
import { drawCharacterSprite } from '../utils/SpriteFactory'
import type { SpriteRole, SpriteSide } from '../utils/SpriteFactory'
import { getClassSigilKey } from '../utils/AssetPaths'
import { CharacterAnimator } from '../utils/CharacterAnimator'
import type { UnitDeckConfig, UnitRole } from '../types'
import { t } from '../i18n'

// ── Layout constants ──────────────────────────────────────────────────────────

const W         = 1280
const H         = 720
const COLS      = 16
const ROWS      = 6
// Skill column is wider to host 2×120 vertical cards with 8-px gap + side
// padding (6px each = 260 total). INTEGRATION_SPEC §2 canonical shape.
const SKILL_COL_W = 260
const TOP_BAR_H2 = 44
// Calculate tile to fill exactly from skill column to right edge
const AVAILABLE_W = W - SKILL_COL_W - 4     // total arena width available
const TILE      = Math.floor(AVAILABLE_W / COLS)
const GRID_W    = TILE * COLS               // actual grid pixel width
const GRID_X    = SKILL_COL_W + 2 + Math.floor((AVAILABLE_W - GRID_W) / 2) // center any remainder
const GRID_Y    = TOP_BAR_H2 + 2
const CHAR_SIZE = Math.floor(TILE * 0.72)

// ── Status area (below arena, full arena width) ───────────────────────────────

const ARENA_RIGHT = GRID_X + COLS * TILE; void ARENA_RIGHT
const STATUS_X = GRID_X
const STATUS_W = W - STATUS_X - 4; void STATUS_W
const TRK_X  = -200; const TRK_CX = -200; const TRK_W = 1; const TRK_Y = -200

// ── Player panel layout (left column — 2×2 vertical hand) ─────────────────────
// INTEGRATION_SPEC §2 canonical card = 120×160. Hand is 2 cols × 2 rows:
// row 1 = atk1/atk2, row 2 = def1/def2. Gap 8.

const CARD_W     = 120
const CARD_H     = 160
const CARD_GAP   = 8
const HAND_COLS  = 2
const HAND_ROWS  = 2
const HAND_PAD_X = 6                    // horizontal padding from column edge
const PANEL_Y    = 2                    // cards start from top
const PANEL_H    = H - 4; void PANEL_H
const BTN_BAR_H  = 36                   // button bar BELOW cards
const HAND_TOTAL_H = HAND_ROWS * CARD_H + (HAND_ROWS - 1) * CARD_GAP   // 328
const ATK_ROW_Y  = PANEL_Y + CARD_H / 2; void ATK_ROW_Y
const DEF_ROW_Y  = PANEL_Y + CARD_H / 2 + CARD_H + CARD_GAP; void DEF_ROW_Y
// First-column card center. Second-column shifts by CARD_W + CARD_GAP.
const CARDS_X    = HAND_PAD_X + CARD_W / 2; void CARDS_X
const BTN_W      = SKILL_COL_W - 20

// ── Unit setup ────────────────────────────────────────────────────────────────

type UnitSetup = { id: string; name: string; role: UnitRole; col: number; row: number }

const LEFT_UNITS: UnitSetup[] = [
  { id: 'lwarrior',    name: 'Wren',  role: 'warrior',    col: 1,  row: 1 },
  { id: 'lking',       name: 'Leo',   role: 'king',       col: 1,  row: 2 },
  { id: 'lspecialist', name: 'Sage',  role: 'specialist', col: 1,  row: 3 },
  { id: 'lexecutor',   name: 'Edge',  role: 'executor',   col: 1,  row: 4 },
]
const RIGHT_UNITS: UnitSetup[] = [
  { id: 'rwarrior',    name: 'Reva',  role: 'warrior',    col: 14, row: 1 },
  { id: 'rking',       name: 'Rex',   role: 'king',       col: 14, row: 2 },
  { id: 'rspecialist', name: 'Sable', role: 'specialist', col: 14, row: 3 },
  { id: 'rexecutor',   name: 'Echo',  role: 'executor',   col: 14, row: 4 },
]

const ROLE_STATS: Record<UnitRole, { maxHp: number; attack: number; defense: number; mobility: number }> = {
  king:       { maxHp: 180, attack: 15, defense: 15, mobility: 3 },
  warrior:    { maxHp: 180, attack: 16, defense: 18, mobility: 2 },
  specialist: { maxHp: 130, attack: 20, defense: 10, mobility: 2 },
  executor:   { maxHp: 120, attack: 18, defense: 8,  mobility: 3 },
}

// ── Colour palette ────────────────────────────────────────────────────────────

const TEAM_COLOR: Record<CharacterSide, Record<UnitRole, number>> = {
  left:  { king: 0x00ccaa, warrior: 0x00bb99, specialist: 0x22ddbb, executor: 0x009988 },
  right: { king: 0x8844cc, warrior: 0x7733bb, specialist: 0x9955dd, executor: 0x6622aa },
}

function roleFull(role: string): string {
  return t(`skills.roles.${role}`)
}

function roleAbbr(role: string): string {
  return t(`scenes.battle.role-abbr.${role}`)
}

// ── Sprite shape ──────────────────────────────────────────────────────────────

interface UnitSprite {
  container:    Phaser.GameObjects.Container
  /**
   * Inner sprite subcontainer returned by drawCharacterSprite/_drawDummySprite.
   * Target of all local animation (squash/stretch, rotation, hop arc) while the
   * outer container keeps world position so HP bars and rings stay steady.
   */
  charGraphics: Phaser.GameObjects.Container
  /**
   * AAA procedural animator driving idle/hop/attack/defend/hurt/death for the
   * inner charGraphics container. Null for dummies (they stay still).
   */
  animator:     CharacterAnimator | null
  rect:       Phaser.GameObjects.Rectangle
  baseColor:  number                          // original fill colour (restored after flash)
  flashRect:  Phaser.GameObjects.Rectangle   // damage / heal flash overlay
  hpBar:      Phaser.GameObjects.Rectangle
  hpBarBg:    Phaser.GameObjects.Rectangle   // HP bar background (for border)
  shieldBar:  Phaser.GameObjects.Rectangle   // blue shield overlay on HP bar
  hpText:     Phaser.GameObjects.Text
  focusRing:  Phaser.GameObjects.Rectangle   // action-selection highlight (white)
  moveRing:   Phaser.GameObjects.Rectangle   // movement-selection highlight (cyan)
  activeRing: Phaser.GameObjects.Rectangle   // turn-active highlight (green, pulsing)
  posText:    Phaser.GameObjects.Text        // grid coords "(col,row)"
  roleLabel:  Phaser.GameObjects.Text        // role abbreviation above unit
  statusDots: Phaser.GameObjects.Container   // persistent status icons below HP text
  maxHp:      number
}

// ── Turn tracker entry ────────────────────────────────────────────────────────

interface TurnEntry {
  unitId: string
  name:   string
  role:   string
  order:  number
  total:  number
  status: 'active' | 'done' | 'skipped'
}

// ── Incoming scene data ───────────────────────────────────────────────────────

interface NpcTeamData {
  name: string
  levelMin: number
  levelMax: number
  goldReward: number
  xpReward: number
}

interface SceneData {
  deckConfig?: Record<UnitRole, UnitDeckConfig>
  /**
   * Per-class equipped skin map, e.g. `{ king: 'crimson_idle', warrior: 'idle', ... }`.
   * Lobbies pull this from `playerData.getSkinConfig()` right before launching the
   * battle so that any skin swap done in the lobby (or after a shop purchase) is
   * picked up immediately. When omitted, every character defaults to 'idle'.
   *
   * Skins are PLAYER-owned, not slot-owned: when slots are reassigned in the
   * lobby, each player's own skin map travels with them — no per-slot state to
   * track here.
   */
  skinConfig?: Record<UnitRole, string>
  difficulty?: string
  pveMode?: boolean | string
  npcTeam?: NpcTeamData
  /** Average level of all players in the room (rounded up). Used for PvP stat scaling. */
  battleLevel?: number
  /** If true, return to BracketScene after battle instead of BattleResultScene */
  tournamentReturn?: boolean
  bracketData?: object
  /**
   * Training mode: reuses the SAME BattleScene with these differences:
   *  - Dummies on right side (isDummy=true, can't die, HP min 1)
   *  - No timer (phaseDurations 0/0, per-turn timer skipped)
   *  - Dummies auto-skip turns (no AI actions)
   *  - Dummies reset HP/position/effects each round
   *  - Back button instead of surrender
   * All other arena features (grid, VFX, skills, status panels, etc.)
   * are shared and stay in sync automatically.
   */
  trainingMode?: boolean
  /** Players per side: 1=solo, 2=duo, 4=squad. Affects surrender threshold. */
  playersPerSide?: number
  /** Which side the player controls: 'left' (default) or 'right'. */
  playerSide?: 'left' | 'right'
  /** Specific character IDs the player controls (for duo/squad). If omitted, controls all on playerSide. */
  playerCharIds?: string[]
}

// ── BattleScene ───────────────────────────────────────────────────────────────

export default class BattleScene extends Phaser.Scene {
  // ── Engine objects ──────────────────────────────────────────────────────────
  private _ctrl!:   GameController
  private _bridge!: PhaserBridge
  private _driver!: BattleDriver
  private _vfx!:    VFXManager

  // ── Static visual objects ───────────────────────────────────────────────────
  private _sprites:    Map<string, UnitSprite>   = new Map()
  private _roundText!: Phaser.GameObjects.Text
  private _phaseText!: Phaser.GameObjects.Text
  private _logLines:   Phaser.GameObjects.Text[] = []
  private _logMsgs:    Array<{ msg: string; type: string }> = []
  /** Mini log entries: compact actor + skill icons for current action phase */
  private _miniLogEntries: Array<{ unitId: string; name: string; side: string; atkIcon: boolean; defIcon: boolean; atkSkip: boolean; defSkip: boolean; done: boolean }> = []
  private _miniLogObjs: Phaser.GameObjects.GameObject[] = []
  private _miniLogContainer: Phaser.GameObjects.Container | null = null
  private _miniLogRoundText: Phaser.GameObjects.Text | null = null
  private _miniLogY = 0
  private _miniLogW = 0
  private _miniLogRound = 0
  /** Structured action history for popup — organized by round */
  private _actionHistory: Array<{
    round: number
    actor: string
    actorName: string
    actorSide: string
    atkSkill?: string
    atkGroup?: string    // 'attack1' | 'attack2'
    atkTargets?: string
    defSkill?: string
    defGroup?: string    // 'defense1' | 'defense2'
    defTarget?: string
  }> = []
  private _currentRound = 1
  private _pendingAction: { actor: string; actorName: string; actorSide: string; atkSkill?: string; atkGroup?: string; atkTargets?: string; defSkill?: string; defGroup?: string; defTarget?: string } | null = null

  // ── Turn tracker (right sidebar) ────────────────────────────────────────────
  private _turnEntries:     TurnEntry[]                     = []
  private _trackerObjs:     Phaser.GameObjects.GameObject[] = []
  private _trackerHeader!:  Phaser.GameObjects.Text

  // ── Phase banner (transient overlay) ────────────────────────────────────────
  private _bannerObjs:      Phaser.GameObjects.GameObject[] = []

  // ── Actor nameplate (above acting unit) ─────────────────────────────────────
  private _actorLabel:      Phaser.GameObjects.Container | null = null

  // ── Status panel dynamic elements ──────────────────────────────────────────
  private _statusStatTexts: Map<string, { atk: Phaser.GameObjects.Text; def: Phaser.GameObjects.Text; mov: Phaser.GameObjects.Text }> = new Map()
  private _statusCardBgs: Map<string, Phaser.GameObjects.Graphics> = new Map()
  private _statusCardBounds: Map<string, { x: number; y: number; w: number; h: number; teamColor: number }> = new Map()
  private _statusEffectContainers: Map<string, { container: Phaser.GameObjects.Container; lx: number; rx: number; startY: number; availH: number }> = new Map()
  /**
   * Per-card HP bar + number + shield overlay. Rebuilt by _refreshStatusPanels
   * on HP/shield events — keeps the bottom panel in sync with damage/heal
   * without a full redraw.
   */
  private _statusHpElems: Map<string, {
    hpText:       Phaser.GameObjects.Text
    hpBarFill:    Phaser.GameObjects.Graphics
    shieldStripes:Phaser.GameObjects.Graphics
    shieldLabel:  Phaser.GameObjects.Text
    barX: number; barY: number; barW: number; barH: number
  }> = new Map()
  /**
   * Per-card "MURO +X%" line — surfaces the team-wide wall-touch buff that
   * is otherwise invisible in the per-character stat deltas (the bonus is a
   * global rule in CombatRuleSystem, not stored on the entity).
   * Hidden whenever the team has zero allies on the wall column.
   */
  private _statusWallTexts: Map<string, Phaser.GameObjects.Text> = new Map()

  // ── Timer display ───────────────────────────────────────────────────────────
  private _timerText!:  Phaser.GameObjects.Text
  private _timerBar!:   Phaser.GameObjects.Rectangle
  private _timerBarW    = 0  // cached total width of the bar (set in _drawHUD)
  private _timerTotal   = 15
  private _timerEvent:  Phaser.Time.TimerEvent | null = null
  private _timerSecs    = 0
  /** Pulse tween on the timer label, active only when ≤5s remain (critical). */
  private _timerPulseTween: Phaser.Tweens.Tween | null = null

  // ── HUD team indicator dot ─────────────────────────────────────────────────
  /** Team phase dot (hidden in new layout) */
  public _teamDot!: Phaser.GameObjects.Arc

  /** Check if a character is controlled by the local player. */
  private _isPlayerChar(unitId: string): boolean {
    if (this._playerCharIds) return this._playerCharIds.has(unitId)
    const char = this._ctrl.getCharacter(unitId)
    return char?.side === this._playerSide
  }

  // ── Surrender voting ───────────────────────────────────────────────────────
  private _surrenderVotes = 0
  private _surrenderRequired = 1  // solo=1, duo=2, squad=3
  private _surrenderCountText: Phaser.GameObjects.Text | null = null

  // ── Persistent status dots per unit ────────────────────────────────────────
  /** Maps unitId → Set of active status names → used to rebuild dots. */
  private _unitStatuses: Map<string, Set<string>> = new Map()

  // ── PvE data ────────────────────────────────────────────────────────────────
  private _pveMode: boolean | string = false
  private _npcTeam: NpcTeamData | null = null
  private _difficulty: string = 'normal'
  private _tournamentReturn: boolean = false
  private _bracketData: object | null = null
  private _isTrainingMode: boolean = false
  /**
   * Per-class equipped skin map passed in from the lobby. When null we fall
   * back to 'idle' for every character. See SceneData.skinConfig for details.
   */
  private _skinConfig: Record<UnitRole, string> | null = null
  private _playerCharIds: Set<string> | null = null  // null = all on playerSide

  // ── PvP battle level (average of all players, rounded up) ──────────────────
  private _battleLevel: number = 0
  /** Average level of all players in the room. 0 = not set (PvE). */
  get battleLevel(): number { return this._battleLevel }

  // ── Player input state ──────────────────────────────────────────────────────
  private _playerSide: CharacterSide  = 'left'
  private _currentActorId: string | null        = null
  private _awaitingMode: 'unit' | 'tile' | null = null
  private _awaitingSkillId: string | null       = null
  private _selReady     = false

  // ── Animation timing (stagger damage after projectile) ─────────────────────
  private _lastSkillAnimMs: number = 0
  private _lastSkillTime:   number = 0

  // ── Movement phase state ─────────────────────────────────────────────────────
  private _isPlayerMovementPhase = false
  private _moveSelectedId: string | null        = null
  private _movedThisPhase: Set<string> = new Set()
  private _moveOverlays: Phaser.GameObjects.Rectangle[] = []
  private _endMovementBtn!: Phaser.GameObjects.Container
  private _movePhaseLabel: Phaser.GameObjects.Container | null = null
  private _teamTurnOverlay: Phaser.GameObjects.Container | null = null

  // ── Player panel — persistent shell ────────────────────────────────────────
  private _panelBg!:    Phaser.GameObjects.Rectangle
  private _confirmBtn!: Phaser.GameObjects.Container
  private _cancelBtn!:  Phaser.GameObjects.Container

  // ── Player panel — recreated each turn ─────────────────────────────────────
  /** All dynamically-created card button containers (destroyed on each turn end). */
  private _cardBtns:  Phaser.GameObjects.Container[] = []
  /** Maps skillId → card graphics info for visual highlight updates. */
  private _cardBgMap: Map<string, {
    gfx: Phaser.GameObjects.Graphics
    hitArea: Phaser.GameObjects.Rectangle
    redraw: (selected: boolean, hovered: boolean) => void
  }> = new Map()
  /** The last card ID selected (for highlight). */
  private _selectedCardId: string | null = null

  /** Skill tooltip container (shown on card hover). */
  private _skillTooltip: Phaser.GameObjects.Container | null = null

  // ── Target overlays — recreated on AWAITING_TARGET ─────────────────────────
  /** Interactive overlays shown when player must pick a target or tile. */
  private _targetOverlays: Phaser.GameObjects.GameObject[] = []

  /** Tile rectangles showing area-of-effect preview on hover. */
  private _areaPreviewRects: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super('BattleScene')
  }

  // ── Scene lifecycle ─────────────────────────────────────────────────────────

  create(data: SceneData) {
    GameStateManager.set(GameState.PLAYING)

    // ── Reset all collections from previous battle (scene instance reused) ──
    this._sprites.clear()
    this._logLines = []
    this._logMsgs = []; this._actionHistory = []; this._pendingAction = null; this._currentRound = 1
    this._miniLogObjs = []; this._miniLogEntries = []; this._miniLogContainer = null; this._miniLogRoundText = null; this._miniLogRound = 0
    this._turnEntries = []
    this._trackerObjs = []
    this._bannerObjs = []
    this._unitStatuses.clear()
    this._statusStatTexts.clear(); this._statusCardBgs.clear(); this._statusCardBounds.clear()
    this._statusEffectContainers.clear()
    this._statusHpElems.clear()
    this._statusWallTexts.clear()
    this._highlightedStatusId = null
    this._cardBtns = []
    this._moveOverlays = []
    this._targetOverlays = []
    this._areaPreviewRects = []
    this._currentActorId = null
    this._awaitingMode = null
    this._awaitingSkillId = null
    this._selReady = false
    this._moveSelectedId = null
    this._isPlayerMovementPhase = false
    this._selectedCardId = null
    this._skillTooltip = null
    this._timerSecs = 0
    this._timerTotal = 15

    // Store PvE data for post-battle results
    this._pveMode   = data.pveMode ?? false
    this._npcTeam   = data.npcTeam ?? null
    this._difficulty = data.difficulty ?? 'normal'
    this._battleLevel = data.battleLevel ?? 0
    this._tournamentReturn = data.tournamentReturn ?? false
    this._bracketData = data.bracketData ?? null
    this._isTrainingMode = data.trainingMode ?? false
    this._skinConfig = data.skinConfig ?? null
    this._playerSide = data.playerSide ?? 'left'
    this._playerCharIds = data.playerCharIds ? new Set(data.playerCharIds) : null
    // Surrender threshold: majority of HUMAN players on the team (bots don't count)
    // playersPerSide = number of human players (1=solo, 2=duo, up to 4=squad)
    const humanPlayers = data.playersPerSide ?? 1
    this._surrenderRequired = Math.max(1, Math.ceil(humanPlayers / 2))
    this._surrenderVotes = 0

    // 1. Build engine layer
    this._ctrl   = _buildController(data.deckConfig, this._difficulty, this._isTrainingMode, this._playerSide)
    this._driver = new BattleDriver(
      this._ctrl,
      new AutoPlayer(this._ctrl),
      {
        movementSkipMs: 300,
        actionBeginMs:  200,
        turnPlayMs:     200,
        phaseAdvanceMs: 400,
        playerSide:     this._playerSide,
        playerCharIds:  this._playerCharIds ?? undefined,
      },
    )

    // 1b. Visual effects manager
    this._vfx = new VFXManager(this)

    // 2. Static visuals
    this._drawBackground()
    this._drawGrid()
    this._drawHUD()
    this._drawCharacters()

    // 3. Player panel (persistent shell, hidden by default)
    this._buildPanelShell()
    this._drawStatusPanels()
    // Initial wall-buff sync — covers the case where a starting position
    // already has units on the wall column (no CHARACTER_MOVED has fired yet).
    this._refreshStatusPanels()
    this._buildActionButtons()
    this._buildEndMovementButton()
    this._buildTurnTrackerShell()

    // 3b. Sound system (init requires a prior user gesture — scene create is safe)
    soundManager.init()

    // 4. Event subscriptions — ONLY visual reactions + input forwarding
    this._bridge = new PhaserBridge(this._ctrl)

      // ── Phase / round labels ──────────────────────────────────────────────
      .onHUD(EventType.ROUND_STARTED, (e) => {
        this._roundText.setText(t('scenes.battle.tracker.round', { round: e.round }))
        this._currentRound = e.round
        this._addLog(t('scenes.battle.log-round-marker', { round: e.round }), 'phase')
        soundManager.playRoundStart()

        // Training mode: reset dummies after each round
        if (this._isTrainingMode) this._resetTrainingDummies()
      })
      .onHUD(EventType.PHASE_STARTED, (e) => {
        const sideLabel  = t(e.side  === 'left'     ? 'scenes.battle.team.left-color'   : 'scenes.battle.team.right-color')
        const phaseLabel = t(e.phase === 'movement' ? 'scenes.battle.phase.phase-movement' : 'scenes.battle.phase.phase-action')
        this._phaseText.setText(t('scenes.battle.phase-side-format', { phase: phaseLabel, side: sideLabel }))
        // Mini log: populate full turn order on action phase (stays during next movement)
        if (e.phase === 'action') {
          this._miniLogRound = this._currentRound
          this._miniLogEntries = this._buildMiniLogOrder()
          this._renderMiniLog()
        }
        this._refreshStatusPanels()
        this._highlightStatusCard(null) // clear selection on phase change
        soundManager.playPhaseChange()
        const isPlayer = e.side === this._playerSide
        this._showPhaseBanner(isPlayer, e.phase)
        // Show team turn indicator in top bar
        this._showTeamTurnOverlay(e.side as 'left' | 'right', e.phase)
        // Tracker: reset on action phase, hide on movement
        if (e.phase === 'action') {
          this._turnEntries = []
          // Interleaved: both teams act in the same phase
          this._trackerHeader.setText(t('scenes.battle.tracker.header-both'))
          this._renderTurnTracker()
        } else {
          this._trackerHeader.setText(t('scenes.battle.tracker-side-movement', { side: sideLabel }))
          this._turnEntries = []
          this._renderTurnTracker()
          this._movedThisPhase.clear()
        }
        const isPlayerMovement = e.phase === 'movement' && isPlayer
        this._setMovementPhaseUI(isPlayerMovement)

        // ── Timer countdown (movement phase only, player's side only) ──
        // Duration = 3 seconds per character the player controls
        // Training mode: no timer (player takes as long as they want)
        this._clearTimer()
        const charsControlled = this._playerCharIds ? this._playerCharIds.size : 4
        const moveDuration = charsControlled * 3  // 3s per character
        if (e.phase === 'movement' && isPlayer && !this._isTrainingMode) {
          this._timerSecs = moveDuration
          this._timerTotal = moveDuration
          this._updateTimerDisplay()
          this._timerEvent = this.time.addEvent({
            delay: 1000,
            repeat: this._timerSecs - 1,
            callback: () => {
              this._timerSecs = Math.max(0, this._timerSecs - 1)
              this._updateTimerDisplay()
              if (this._timerSecs <= 0 && !this._ctrl.isBattleOver) {
                this._clearTimer()
                if (this._isPlayerMovementPhase) {
                  this._ctrl.clearMoveSelection()
                  this._ctrl.advancePhase()
                }
              }
            },
          })
        }
      })
      .onHUD(EventType.PHASE_ENDED, (_e) => {
        this._clearTimer()
      })
      .onHUD(EventType.ACTIONS_RESOLVED, (_e) => {
        this._clearTimer()
        this._refreshStatusPanels()
        this._highlightStatusCard(null)
      })
      .onHUD(EventType.RESOLUTION_STARTED, (_e) => {
        // Stagger resolution: resolve one character at a time with delay
        this._clearTimer()
        // Small delay before starting resolution to let UI settle
        this.time.delayedCall(400, () => this._resolveNextWithDelay())
      })

      // ── Turn sequencing indicators ─────────────────────────────────────────
      .on(EventType.TURN_STARTED, (e) => {
        const sprite = this._sprite(e.unitId)
        if (sprite) {
          sprite.activeRing.setVisible(true).setScale(1)
          this.tweens.add({
            targets: sprite.activeRing,
            scaleX: 1.12, scaleY: 1.12,
            yoyo: true, repeat: -1,
            duration: 550, ease: 'Sine.InOut',
          })
        }
        // Tracker
        const char = this._ctrl.getCharacter(e.unitId)
        const existing = this._turnEntries.find(t => t.unitId === e.unitId)
        if (existing) {
          existing.status = 'active'
        } else {
          this._turnEntries.push({
            unitId: e.unitId,
            name:   char?.name ?? e.unitId,
            role:   char?.role ?? '',
            order:  e.order,
            total:  e.total,
            status: 'active',
          })
        }
        this._renderTurnTracker()
        // Update top bar with current role (for 1x1 solo)
        this._showActorLabel(e.unitId, char?.side === this._playerSide)
        if (char) {
          this._showTeamTurnOverlay(char.side as 'left' | 'right', 'action', char.role)
        }
        // Player turn: auto-focus actor and open skill panel + flash banner
        if (char && this._isPlayerChar(e.unitId)) {
          this._currentActorId = e.unitId
          this._selReady       = false
          this._selectedCardId = null
          this._ctrl.selectCharacter(e.unitId)
          this._showTurnFlash(char.name)
          // Reset timer per character turn (15 sec for action, skip in training)
          if (this._ctrl.phase === 'action' && !this._isTrainingMode) {
            this._clearTimer()
            const turnDuration = 15
            this._timerSecs = turnDuration
            this._timerTotal = turnDuration
            this._updateTimerDisplay()
            this._timerEvent = this.time.addEvent({
              delay: 1000,
              repeat: turnDuration - 1,
              callback: () => {
                this._timerSecs = Math.max(0, this._timerSecs - 1)
                this._updateTimerDisplay()
                if (this._timerSecs <= 0 && !this._ctrl.isBattleOver) {
                  this._clearTimer()
                  const a = this._ctrl.currentActor
                  if (a && a.side === this._playerSide) {
                    const s = this._ctrl.getSelection(a.id)
                    const has = s && (s.attackSkill !== null || s.defenseSkill !== null)
                    if (has) this._ctrl.commitTurn()
                    else this._ctrl.skipTurn('timed_out')
                  }
                }
              },
            })
          }
        }
      })
      .on(EventType.TURN_COMMITTED, (e) => {
        this._stopActiveRing(e.unitId)
        this._clearFocusRings()
        this._hideActorLabel()
        this._closeConfirmPopup()
        // Flush any pending action that wasn't completed
        if (this._pendingAction && this._pendingAction.actor === e.unitId) {
          this._actionHistory.push({ round: this._currentRound, ...this._pendingAction })
          this._pendingAction = null
        }
        const entry = this._turnEntries.find(t => t.unitId === e.unitId)
        if (entry) { entry.status = 'done'; this._renderTurnTracker() }
        // Mini log: do NOT mark skips here — deferred resolution hasn't happened yet.
        // Skips are marked after each character resolves in _resolveNextWithDelay.
        if (e.unitId === this._currentActorId) {
          this._hidePanel()
          this._currentActorId = null
        }
      })
      .on(EventType.TURN_SKIPPED, (e) => {
        this._stopActiveRing(e.unitId)
        this._clearFocusRings()
        this._hideActorLabel()
        this._closeConfirmPopup()
        const entry = this._turnEntries.find(t => t.unitId === e.unitId)
        if (entry) { entry.status = 'skipped'; this._renderTurnTracker() }
        // Mini log: mark as skipped internally (shown during resolution phase)
        const mlSkip = this._miniLogEntries.find(m => m.unitId === e.unitId)
        if (mlSkip) {
          mlSkip.done = true
          mlSkip.atkSkip = true
          mlSkip.defSkip = true
          // Don't render yet — will be revealed during staggered resolution
        }
        // Add skip to action history
        const skipChar = this._ctrl.getCharacter(e.unitId)
        this._actionHistory.push({
          round: this._currentRound,
          actor: e.unitId,
          actorName: this._name(e.unitId),
          actorSide: skipChar?.side ?? 'left',
          atkSkill: t('scenes.battle.log.skipped'),
          atkTargets: e.reason === 'stunned' ? t('scenes.battle.log.stunned') : e.reason === 'dead' ? t('scenes.battle.log.dead') : '',
        })
        if (e.unitId === this._currentActorId) {
          this._hidePanel()
          this._currentActorId = null
        }
      })

      // ── Player action state ────────────────────────────────────────────────
      .on(EventType.CHARACTER_FOCUSED, (e) => {
        this._showFocusRing(e.unitId)
        this._highlightStatusCard(e.unitId)
        if (e.unitId !== this._currentActorId) return
        this._rebuildCardButtons(e.unitId)
      })
      // Deck rotation: when the active character's hand changes, rebuild the
      // card buttons so the UI reflects the new front-of-queue cards. Other
      // rebuild triggers (CHARACTER_FOCUSED, post-cancel, post-select-defense)
      // already cover the common flow; this handler is the belt-and-suspenders
      // for edge cases where rotation happens while the same actor is focused
      // (e.g. second attack in a double-attack turn).
      .on(EventType.CARD_ROTATED, (e) => {
        if (e.unitId === this._currentActorId) {
          this._rebuildCardButtons(e.unitId)
        }
      })
      .on(EventType.MOVE_CHARACTER_SELECTED, (e) => {
        this._moveSelectedId = e.unitId
        this._showMoveRing(e.unitId)
        this._highlightStatusCard(e.unitId)
        this._clearMoveOverlays()
        for (const pos of this._ctrl.getValidMoves(e.unitId)) {
          this._addMoveOverlay(pos.col, pos.row)
        }
        // movement phase — no mini log entry
      })
      .on(EventType.MOVE_SELECTION_CLEARED, (_e) => {
        this._moveSelectedId = null
        this._clearMoveOverlays()
        this._clearMoveRings()
      })
      .on(EventType.AWAITING_TARGET, (e) => {
        this._awaitingMode    = e.targetMode
        this._awaitingSkillId = e.skillId
        this._buildTargetOverlays(e.unitId, e.skillId, e.targetMode)
        // Ensure cancel button is visible while in targeting mode
        if (this._cancelBtn) this._cancelBtn.setVisible(true)
      })
      .on(EventType.CARD_SELECTED, (e) => {
        // Track last selected card of each category; keep latest attack highlight
        this._selectedCardId = e.cardId
        this._refreshCardHighlights()
        // Enable confirm after any skill is selected (1 skill = other is skipped)
        this._selReady = true
        this._confirmBtn.setAlpha(1)
      })
      .on(EventType.SELECTION_READY, (_e) => {
        this._selReady = true
        this._confirmBtn.setAlpha(1)
      })
      .on(EventType.SELECTION_CANCELLED, (_e) => {
        // Panel stays open. Clear target mode and overlays.
        // The Cancel button handler will re-call selectCharacter immediately
        // after cancelAction(), triggering CHARACTER_FOCUSED → panel rebuild.
        this._clearTargetOverlays()
        this._clearAreaPreview()
        this._awaitingMode    = null
        this._awaitingSkillId = null
        this._selReady        = false
        this._selectedCardId  = null
        this._confirmBtn.setAlpha(0.3)
      })

      // ── Movement animation + position label ────────────────────────────────
      .onAnimation(EventType.CHARACTER_MOVED, (e) => {
        const sprite = this._sprite(e.unitId)
        if (!sprite) return
        const { x, y } = _tileCenter(e.toCol, e.toRow)
        // Outer container moves linearly — inner sprite layers a hop arc
        // (squash/stretch + local Y bob) on top for the "jumping" feel.
        const hopMs = 320
        this.tweens.add({ targets: sprite.container, x, y, duration: hopMs, ease: 'Quad.Out' })
        sprite.animator?.playHop(hopMs)
        sprite.posText.setText(`(${e.toCol},${e.toRow})`)
        // Wall-touch buff is position-dependent: refresh status cards when
        // any unit moves, so MURO +X% appears/disappears immediately.
        this._refreshStatusPanels()
        // Clear move overlays — controller already cleared _selectedForMove via auto-reset
        if (e.unitId === this._moveSelectedId) {
          this._moveSelectedId = null
          this._clearMoveOverlays()
          this._clearMoveRings()
        }
        // Auto-advance when all player-controlled characters have moved
        if (this._isPlayerMovementPhase) {
          if (this._isPlayerChar(e.unitId)) {
            this._movedThisPhase.add(e.unitId)
            const playerUnits = this._playerSide === 'left' ? LEFT_UNITS : RIGHT_UNITS
            const aliveCount = playerUnits.filter(u => this._isPlayerChar(u.id) && this._ctrl.getCharacter(u.id)?.alive).length
            if (this._movedThisPhase.size >= aliveCount) {
              this.time.delayedCall(400, () => {
                if (this._isPlayerMovementPhase && !this._ctrl.isBattleOver) {
                  this._ctrl.clearMoveSelection()
                  this._ctrl.advancePhase()
                }
              })
            }
          }
        }
      })

      // ── Skill pulse animation ──────────────────────────────────────────────
      .onAnimation(EventType.SKILL_USED, (e) => {
        const casterSprite = this._sprite(e.unitId)
        if (casterSprite?.animator) {
          // AAA procedural animation on the inner sprite: lunge for attacks,
          // brace for defence. Direction = sign of caster.side (left-side
          // faces right → +1, right-side faces left → -1).
          const casterChar = this._ctrl.getCharacter(e.unitId)
          const dir = casterChar?.side === 'right' ? -1 : +1
          if (e.category === 'attack') {
            casterSprite.animator.playAttack(dir)
          } else if (e.category === 'defense') {
            casterSprite.animator.playDefend()
          } else {
            // Utility / neutral skills get a cast burst
            casterSprite.animator.playCast()
          }
        }

        // Highlight the acting character in arena + status panel
        this._showFocusRing(e.unitId)
        this._highlightStatusCard(e.unitId)
        // Show active ring with brief pulse
        if (casterSprite) {
          casterSprite.activeRing.setVisible(true).setScale(1)
          this.tweens.add({
            targets: casterSprite.activeRing,
            scaleX: 1.15, scaleY: 1.15,
            yoyo: true, duration: 300, ease: 'Sine.InOut',
            onComplete: () => casterSprite.activeRing.setVisible(false).setScale(1),
          })
        }

        // Record timing so subsequent DAMAGE/HEAL events can delay until projectile lands
        this._lastSkillAnimMs = 300  // projectile travel time
        this._lastSkillTime   = Date.now()

        // ── Enhanced skill animation: projectiles + glow pulses ──
        if (e.category === 'attack' && casterSprite) {
          this._playAttackProjectile(e, casterSprite)
        } else if (e.category === 'defense' && casterSprite) {
          this._playDefenseGlow(e, casterSprite)
        }

        // Mini log — mark skill icon on the actor's entry
        const mlEntry = this._miniLogEntries.find(m => m.unitId === e.unitId)
        if (mlEntry) {
          if (e.category === 'attack') mlEntry.atkIcon = true
          if (e.category === 'defense') mlEntry.defIcon = true
          this._renderMiniLog()
        }

        // Structured history capture (defense fires first, then attack)
        const actorChar = this._ctrl.getCharacter(e.unitId)
        const targetName = e.targetId ? this._name(e.targetId) : ''
        const skill2 = this._ctrl.getSkill(e.skillId)
        const skillGroup = skill2?.group ?? ''
        if (e.category === 'defense') {
          this._pendingAction = {
            actor: e.unitId,
            actorName: this._name(e.unitId),
            actorSide: actorChar?.side ?? 'left',
            defSkill: e.skillName,
            defGroup: skillGroup,
            defTarget: targetName || this._name(e.unitId),
          }
        } else if (e.category === 'attack') {
          if (this._pendingAction && this._pendingAction.actor === e.unitId) {
            this._pendingAction.atkSkill = e.skillName
            this._pendingAction.atkGroup = skillGroup
            this._pendingAction.atkTargets = targetName
            this._actionHistory.push({ round: this._currentRound, ...this._pendingAction })
            this._pendingAction = null
          } else {
            this._actionHistory.push({
              round: this._currentRound,
              actor: e.unitId,
              actorName: this._name(e.unitId),
              actorSide: actorChar?.side ?? 'left',
              atkSkill: e.skillName,
              atkGroup: skillGroup,
              atkTargets: targetName,
            })
          }
        }
      })

      // ── HP bar + floating damage ───────────────────────────────────────────
      .onHUD(EventType.DAMAGE_APPLIED, (e) => {
        const elapsed = Date.now() - this._lastSkillTime
        const delay = Math.max(0, this._lastSkillAnimMs - elapsed)
        this.time.delayedCall(delay, () => {
          this._updateHpBar(e.unitId, e.newHp)
          this._flashUnit(e.unitId, 0xff2222, 0.70)
          this._floatingText(e.unitId, `-${e.amount}`, '#ff4444', 24, e.amount >= 40)
          soundManager.playHit()
          // AAA hurt animation: knockback + rotation shake + red tint on the
          // *inner* sprite, leaving the outer container (HP bars, rings) rock
          // steady. Direction inferred from target side — right-side targets
          // are usually struck from the left, and vice versa.
          const flinchS = this._sprite(e.unitId)
          if (flinchS && e.amount > 0) {
            const targetChar = this._ctrl.getCharacter(e.unitId)
            const fromLeft = targetChar?.side !== 'left'   // hit from left → knock right
            flinchS.animator?.playHurt(fromLeft)
          }
          // Camera effects on big damage
          if (e.amount >= 50) {
            this.cameras.main.shake(200, 0.01)
            this.cameras.main.flash(100, 255, 255, 255, false, undefined, 0.15)
          } else if (e.amount >= 30) {
            this.cameras.main.shake(150, 0.006)
          }
          // Update shield bar after damage (shield may have absorbed some)
          const dmgSprite = this._sprite(e.unitId)
          if (dmgSprite) {
            const dmgChar = this._ctrl.getCharacter(e.unitId)
            const remainShield = dmgChar?.shieldAmount ?? 0
            const shRatio = Math.min(1, remainShield / dmgSprite.maxHp)
            const shBarW = CHAR_SIZE + 4
            this.tweens.add({
              targets: dmgSprite.shieldBar,
              displayWidth: shRatio * shBarW,
              duration: 300,
              ease: 'Quad.Out',
            })
          }
        })
        this._addLog(t('scenes.battle.log.damage', { name: this._name(e.unitId), amount: e.amount, hp: e.newHp }), 'damage')
        // Append area targets to the last action's atkTargets
        if (this._actionHistory.length > 0) {
          const lastAct = this._actionHistory[this._actionHistory.length - 1]
          const dmgName = this._name(e.unitId)
          if (lastAct.atkTargets && !lastAct.atkTargets.includes(dmgName)) {
            lastAct.atkTargets += ` / ${dmgName}`
          } else if (!lastAct.atkTargets) {
            lastAct.atkTargets = dmgName
          }
        }
      })
      .onHUD(EventType.HEAL_APPLIED, (e) => {
        const elapsed = Date.now() - this._lastSkillTime
        const delay = Math.max(0, this._lastSkillAnimMs - elapsed)
        this.time.delayedCall(delay, () => {
          this._updateHpBar(e.unitId, e.newHp)
          this._flashUnit(e.unitId, 0x22ff88, 0.55)
          this._floatingText(e.unitId, `+${e.amount}`, '#44ff88', 22)
          soundManager.playHeal()
        })
        this._addLog(t('scenes.battle.log.heal', { name: this._name(e.unitId), amount: e.amount }), 'heal')
      })
      .onHUD(EventType.BLEED_TICK, (e) => {
        this._updateHpBar(e.unitId, e.newHp)
        this._flashUnit(e.unitId, 0xcc1133, 0.60)
        this._floatingText(e.unitId, `🩸-${e.damage}`, '#8844cc', 18)
        soundManager.playBleed()
        const bs = this._sprite(e.unitId)
        if (bs) this._vfx.bleedEffect(bs.container.x, bs.container.y)
      })
      .onHUD(EventType.POISON_TICK, (e) => {
        this._updateHpBar(e.unitId, e.newHp)
        this._flashUnit(e.unitId, 0x88cc22, 0.55)
        this._floatingText(e.unitId, `☠-${e.damage}`, '#88cc22', 18)
        soundManager.playPoison()
        const ps = this._sprite(e.unitId)
        if (ps) this._vfx.poisonCloud(ps.container.x, ps.container.y, 20)
      })
      .onHUD(EventType.REGEN_TICK, (e) => {
        this._updateHpBar(e.unitId, e.newHp)
        this._flashUnit(e.unitId, 0x22dd66, 0.50)
        this._floatingText(e.unitId, `🌿+${e.heal}`, '#44ff88', 18)
      })
      .onHUD(EventType.SHIELD_APPLIED, (e) => {
        const elapsed = Date.now() - this._lastSkillTime
        const delay = Math.max(0, this._lastSkillAnimMs - elapsed)
        this.time.delayedCall(delay, () => {
          this._floatingText(e.unitId, `🛡+${e.amount}`, '#88aaff', 20)
          // Animate shield bar overlay
          const shSprite = this._sprite(e.unitId)
          if (shSprite) {
            const shChar = this._ctrl.getCharacter(e.unitId)
            const shieldTotal = shChar?.shieldAmount ?? e.amount
            const shieldRatio = Math.min(1, shieldTotal / shSprite.maxHp)
            const shBarW = CHAR_SIZE + 4
            this.tweens.add({
              targets: shSprite.shieldBar,
              displayWidth: shieldRatio * shBarW,
              duration: 350,
              ease: 'Quad.Out',
            })
          }
        })
      })

      // ── Status effect icons ────────────────────────────────────────────────
      .onHUD(EventType.STATUS_APPLIED, (e) => {
        const elapsed = Date.now() - this._lastSkillTime
        const delay = Math.max(0, this._lastSkillAnimMs - elapsed)
        this.time.delayedCall(delay, () => {
          const icons: Record<string, string> = {
            bleed: '🩸', stun: '⚡', regen: '🌿', evade: '💨',
            reflect: '🪞', def_down: '🔻DEF', atk_down: '🔻ATK',
          }
          this._floatingText(e.unitId, icons[e.status] ?? e.status, '#ffdd44')
          this._addStatusDot(e.unitId, e.status)
          this._refreshStatusPanels()
          this._rebuildStatusPanel(e.unitId)
        })
      })
      .onHUD(EventType.STAT_MODIFIER_EXPIRED, (e) => {
        this._removeStatusDot(e.unitId, e.effectType)
        this._refreshStatusPanels()
        this._rebuildStatusPanel(e.unitId)
      })
      .onHUD(EventType.EFFECTS_CLEANSED, (e) => {
        for (const status of e.removed) this._removeStatusDot(e.unitId, status)
        this._refreshStatusPanels()
        this._rebuildStatusPanel(e.unitId)
      })
      .onHUD(EventType.EFFECTS_PURGED, (e) => {
        for (const status of e.removed) this._removeStatusDot(e.unitId, status)
        this._refreshStatusPanels()
        this._rebuildStatusPanel(e.unitId)
      })

      // ── Death animation ────────────────────────────────────────────────────
      .onAnimation(EventType.CHARACTER_DIED, (e) => {
        const sprite = this._sprite(e.unitId)
        if (!sprite) return
        this._stopActiveRing(e.unitId)
        sprite.focusRing.setVisible(false)
        sprite.moveRing.setVisible(false)
        // Clear persistent status dots on death
        this._unitStatuses.get(e.unitId)?.clear()
        this._rebuildStatusDots(e.unitId)
        this._flashUnit(e.unitId, 0xffffff, 0.90)
        this._vfx.deathEffect(sprite.container.x, sprite.container.y)
        this.cameras.main.shake(250, 0.012)
        soundManager.playDeath()
        // AAA death collapse on the inner sprite (rotate + fall + red tint).
        // Marks the animator as dead internally so no further anim overrides it.
        sprite.animator?.playDeath()
        this.time.delayedCall(180, () => {
          sprite.rect.setFillStyle(0x444444)
          this.tweens.add({ targets: sprite.container, alpha: 0.22, duration: 600, ease: 'Quad.Out' })
        })
        this._addLog(t('scenes.battle.log.death', { name: this._name(e.unitId), round: e.round }), 'death')
      })

      // ── Victory overlay ────────────────────────────────────────────────────
      .onHUD(EventType.BATTLE_ENDED, (e) => {
        this._hidePanel()
        this._hideActorLabel()
        for (const obj of this._bannerObjs) (obj as Phaser.GameObjects.GameObject).destroy()
        this._bannerObjs = []

        // Training mode: bounce straight back to lobby — no results screen
        if (this._isTrainingMode) {
          this.time.delayedCall(400, () => transitionTo(this, 'LobbyScene'))
          return
        }

        const playerWon = e.winner === this._playerSide
        const isForfeit = e.reason === 'forfeit'
        let winText: string
        if (isForfeit) {
          winText = playerWon ? t('scenes.battle.outcome.opponent-forfeit') : t('scenes.battle.outcome.self-forfeit')
        } else {
          winText = e.winner
            ? (playerWon ? t('scenes.battle.outcome.victory') : t('scenes.battle.outcome.defeat'))
            : t('scenes.battle.outcome.draw')
        }
        this._showVictoryOverlay(winText, e.reason, e.round)

        // Transition after a short delay
        this.time.delayedCall(2000, () => {
          if (this._tournamentReturn) {
            // Return to BracketScene with the result
            const playerWon = e.winner === this._playerSide
            this.scene.start('BracketScene', {
              ...(this._bracketData ?? {}),
              returning: true,
              playerWon,
            })
          } else {
            this.scene.start('BattleResultScene', {
              winner: e.winner,
              round: e.round,
              reason: e.reason,
              pveMode: this._pveMode,
              npcTeam: this._npcTeam,
              difficulty: this._difficulty,
              playerSide: this._playerSide,
            })
          }
        })
      })

    // 5. ESC key cancels targeting mode
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this._awaitingMode) {
        this._clearTargetOverlays()
        this._clearAreaPreview()
        this._awaitingMode    = null
        this._awaitingSkillId = null
        this._ctrl.cancelAction()
        if (this._currentActorId) {
          this._ctrl.selectCharacter(this._currentActorId)
          this._rebuildCardButtons(this._currentActorId)
        }
      }
    })

    // 6. Start driver first (so it hears PHASE_STARTED from startBattle), then start battle
    this._driver.start()
    this._ctrl.startBattle()

    // 7. Pre-populate mini log with round 1 turn order (visible during first movement phase)
    this._miniLogRound = 1
    this._miniLogEntries = this._buildMiniLogOrder()
    this._renderMiniLog()
  }

  shutdown() {
    // Kill all animations and input
    this.tweens.killAll()
    this.time.removeAllEvents()
    this.input.keyboard?.removeAllListeners()

    // Destroy engine layer
    this._bridge?.destroy()
    this._driver?.destroy()

    // Destroy all UI elements
    this._destroyCardButtons()
    this._clearTargetOverlays()
    this._clearMoveOverlays()
    this._clearAreaPreview()
    this._clearTimer()
    this._hideSkillTooltip()

    // Destroy tracker and banner objects
    for (const obj of this._trackerObjs) (obj as Phaser.GameObjects.GameObject).destroy?.()
    for (const obj of this._bannerObjs)  (obj as Phaser.GameObjects.GameObject).destroy?.()
    this._actorLabel?.destroy()
    this._movePhaseLabel?.destroy(true)
    this._teamTurnOverlay?.destroy(true)

    // Destroy all log text objects
    for (const line of this._logLines) line.destroy?.()
    for (const obj of this._miniLogObjs) obj.destroy()
    this._miniLogContainer?.destroy(true)
    this._miniLogRoundText?.destroy()

    // Destroy all sprite containers
    for (const [, sprite] of this._sprites) sprite.container?.destroy(true)

    // Clear all references
    this._sprites.clear()
    this._unitStatuses.clear()
    this._logLines = []
    this._logMsgs = []; this._actionHistory = []; this._pendingAction = null; this._currentRound = 1
    this._miniLogObjs = []; this._miniLogEntries = []; this._miniLogContainer = null; this._miniLogRoundText = null; this._miniLogRound = 0
    this._turnEntries = []
    this._trackerObjs = []
    this._bannerObjs = []
    this._cardBtns = []
    this._moveOverlays = []
    this._targetOverlays = []
    this._areaPreviewRects = []
  }

  // ── Player panel — shell (built once) ────────────────────────────────────────

  private _buildPanelShell(): void {
    // Skill panel is the left column — already drawn by _drawBackground
    this._panelBg = this.add
      .rectangle(SKILL_COL_W / 2, H / 2, SKILL_COL_W, H, 0x000000, 0.001)
      .setVisible(false)
      .setDepth(5)
  }

  private _drawStatusPanels(): void {
    const leftIds  = ['lking', 'lwarrior', 'lexecutor', 'lspecialist']
    const rightIds = ['rking', 'rwarrior', 'rexecutor', 'rspecialist']

    const gridH = ROWS * TILE
    const gridW = COLS * TILE
    const statusAreaY = GRID_Y + gridH + 4
    const statusAreaH = H - statusAreaY - 2
    const halfW = gridW / 2
    const cardW = (halfW - 12) / 4
    const cardH = statusAreaH - 4

    // Left half = blue team
    leftIds.forEach((id, i) => {
      const cx = GRID_X + 4 + i * (cardW + 2) + cardW / 2
      this._drawMiniStatusCard(cx, statusAreaY + 2, cardW, cardH, id, 'left')
    })

    // Right half = red team
    rightIds.forEach((id, i) => {
      const cx = GRID_X + halfW + 4 + i * (cardW + 2) + cardW / 2
      this._drawMiniStatusCard(cx, statusAreaY + 2, cardW, cardH, id, 'right')
    })
  }

  /**
   * Draw one character's status card in the arena bottom strip.
   *
   * Redesigned per INTEGRATION_SPEC §3 + Print 10:
   *   - Portrait: class-color disc 36 + class sigil SVG overlay (replaces
   *     the teamHex-tinted role text header).
   *   - Typography: Cormorant (name), Manrope meta (class label), JetBrains
   *     Mono (HP number) — legacy Arial + stroke 3 retired.
   *   - HP bar fill from hpStatusColor(); shield overlay drawn as diagonal
   *     stripes (per CSS `--hp-shield`) layered over the right-edge portion.
   *   - Buff/debuff chips 24×18 with polarity-tinted border (green buff,
   *     red debuff, gray neutral shield).
   *   - Stat deltas (ATK/DEF/MOV) use `state.success` / `state.error`
   *     tokens instead of hardcoded #44dd44 / #dd4444.
   */
  private _drawMiniStatusCard(
    x: number, y: number, w: number, h: number,
    unitId: string, side: string,
  ): void {
    const char = this._ctrl.getCharacter(unitId)
    if (!char) return

    const teamColor = side === 'left' ? dsColors.team.ally : dsColors.team.enemy
    const role = char.role as UnitRole
    const classColor = dsColors.class[role]
    const classHex   = dsColors.class[`${role}Hex` as const] ?? fg.primaryHex
    const roleName = roleFull(char.role)
    const unitName = char.name

    // ── Frame (surface.panel + subtle team border) ──
    const g = this.add.graphics()
    g.fillStyle(surface.panel, 0.96)
    g.fillRoundedRect(x - w / 2, y, w, h, radii.md)
    g.lineStyle(1, border.default, 0.7)
    g.strokeRoundedRect(x - w / 2, y, w, h, radii.md)
    // Subtle team accent stripe on top edge
    g.fillStyle(teamColor, 0.45)
    g.fillRoundedRect(x - w / 2, y, w, 2, { tl: radii.md, tr: radii.md, bl: 0, br: 0 })
    this._statusCardBgs.set(unitId, g)
    this._statusCardBounds.set(unitId, { x: x - w / 2, y, w, h, teamColor })

    // Click on status card → select character in arena
    const cardHit = this.add.rectangle(x, y + h / 2, w, h, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true }).setDepth(7)
    cardHit.on('pointerdown', () => {
      if (this._ctrl.phase === 'action' && side === this._playerSide) {
        const actor = this._ctrl.currentActor
        if (actor && actor.id === unitId) {
          this._ctrl.selectCharacter(unitId)
        }
      } else if (this._ctrl.phase === 'movement' && this._isPlayerChar(unitId)) {
        const result = this._ctrl.selectForMove(unitId)
        if (!result.ok) this._addLog(`[!] ${result.error}`)
      }
    })

    const PAD = 6
    const lx = x - w / 2 + PAD
    const rx = x + w / 2 - PAD
    const innerW = w - 2 * PAD

    // ── HEADER ROW: portrait (class disc + sigil) + name/class stack ──
    const portraitSize = 36
    const portraitCx = lx + portraitSize / 2
    const portraitCy = y + PAD + portraitSize / 2

    // Class-color disc
    const portraitG = this.add.graphics().setDepth(6)
    portraitG.fillStyle(classColor, 1)
    portraitG.fillCircle(portraitCx, portraitCy, portraitSize / 2)
    portraitG.lineStyle(1.5, teamColor, 0.85)
    portraitG.strokeCircle(portraitCx, portraitCy, portraitSize / 2)

    // Sigil SVG overlay (tinted dark per Print 10 — shapes are mono)
    const sigilKey = getClassSigilKey(role)
    if (this.textures.exists(sigilKey)) {
      const sigil = this.add.image(portraitCx, portraitCy, sigilKey)
      const targetSize = portraitSize - 12
      const scale = targetSize / Math.max(sigil.width, sigil.height, 1)
      sigil.setScale(scale).setDepth(6).setTintFill(fg.inverse).setAlpha(0.85)
    }

    // Name + class column to the right of the portrait
    const textX = portraitCx + portraitSize / 2 + 8
    this.add.text(textX, portraitCy - portraitSize / 2 + 2, roleName, {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: classHex, fontStyle: 'bold',
    }).setOrigin(0, 0).setLetterSpacing(1.6).setDepth(6)

    this.add.text(textX, portraitCy - 1, unitName, {
      fontFamily: fontFamily.serif, fontSize: typeScale.h3,
      color: fg.primaryHex, fontStyle: 'bold',
    }).setOrigin(0, 0).setDepth(6)

    // Bottom of header row anchors the HP bar
    let cy = y + PAD + portraitSize + 6

    // ── HP BAR ──
    const barX = lx
    const barY = cy
    const barW = innerW
    const barH = 10

    const hpBarBg = this.add.graphics().setDepth(6)
    hpBarBg.fillStyle(surface.deepest, 1)
    hpBarBg.fillRoundedRect(barX, barY, barW, barH, barH / 2)
    hpBarBg.lineStyle(1, border.subtle, 0.9)
    hpBarBg.strokeRoundedRect(barX, barY, barW, barH, barH / 2)

    const hpBarFill = this.add.graphics().setDepth(6)
    const shieldStripes = this.add.graphics().setDepth(6)

    cy += barH + 4

    // HP number row (Mono, right-aligned) + shield amount label on the left
    const shieldLabel = this.add.text(barX, cy, '', {
      fontFamily: fontFamily.mono, fontSize: typeScale.meta,
      color: hpState.shieldHex, fontStyle: 'bold',
    }).setOrigin(0, 0).setDepth(6).setVisible(false)

    const hpText = this.add.text(rx, cy, `${char.hp}/${char.maxHp}`, {
      fontFamily: fontFamily.mono, fontSize: typeScale.small,
      color: hpStatusColor(char.hp / char.maxHp).fillHex, fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(6)

    this._statusHpElems.set(unitId, {
      hpText, hpBarFill, shieldStripes, shieldLabel,
      barX, barY, barW, barH,
    })

    cy += 16

    // ── Stats row (ATK / DEF / MOV as deltas) ──
    const atkDelta = char.attack  - char.baseStats.attack
    const defDelta = char.defense - char.baseStats.defense
    const movDelta = char.mobility - char.baseStats.mobility

    const STAT_LABEL_SIZE = typeScale.meta
    const STAT_VALUE_SIZE = typeScale.small

    const statColFor = (val: number): string =>
      val > 0 ? dsState.successHex : val < 0 ? dsState.errorHex : fg.disabledHex
    const statTxtFor = (val: number): string =>
      val > 0 ? `+${val}` : val < 0 ? String(val) : '0'

    const colW = Math.floor(innerW / 3)
    const makeStat = (label: string, val: number, colIdx: number): Phaser.GameObjects.Text => {
      const colCx = lx + colW * colIdx + colW / 2
      this.add.text(colCx, cy, label, {
        fontFamily: fontFamily.body, fontSize: STAT_LABEL_SIZE,
        color: fg.tertiaryHex, fontStyle: 'bold',
      }).setOrigin(0.5, 0).setLetterSpacing(1.4).setDepth(6)
      return this.add.text(colCx, cy + 12, statTxtFor(val), {
        fontFamily: fontFamily.mono, fontSize: STAT_VALUE_SIZE,
        color: statColFor(val), fontStyle: 'bold',
      }).setOrigin(0.5, 0).setDepth(6)
    }

    const atkText = makeStat(t('scenes.battle.stats.atk'), atkDelta, 0)
    const defText = makeStat(t('scenes.battle.stats.def'), defDelta, 1)
    const movText = makeStat(t('scenes.battle.stats.mov'), movDelta, 2)
    this._statusStatTexts.set(unitId, { atk: atkText, def: defText, mov: movText })

    cy += 28

    // Wall-touch buff (conditional — hidden unless team has ally on wall column)
    const wallText = this.add.text(x, cy, '', {
      fontFamily: fontFamily.mono, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(6).setVisible(false)
    this._statusWallTexts.set(unitId, wallText)
    cy += 12

    // ── Separator before status chips ──
    const sepY = cy + 2
    const sepG = this.add.graphics().setDepth(6)
    sepG.lineStyle(1, border.subtle, 0.9)
    sepG.beginPath(); sepG.moveTo(lx, sepY); sepG.lineTo(rx, sepY); sepG.strokePath()
    cy = sepY + 6

    // ── Status chips container (rebuilt on every status change) ──
    const statusContainer = this.add.container(0, 0).setDepth(6)
    this._statusEffectContainers.set(unitId, {
      container: statusContainer, lx, rx, startY: cy, availH: y + h - cy - 4,
    })
    this._rebuildStatusPanel(unitId)

    // Prime the HP bar fill + shield overlay so the initial render isn't empty
    this._refreshStatusPanelHp(unitId)
  }

  private _buildActionButtons(): void {
    // Button bar BELOW the 2×2 skill card hand (with small gap).
    // Confirmar = gold Primary (INTEGRATION_SPEC §1.1 — gold CTA, fbbf24 fill).
    // Pular     = ghost link (§1.3 — tertiary-fg label, no fill/border).
    const barCenterY = PANEL_Y + HAND_TOTAL_H + BTN_BAR_H / 2 + 6
    const halfW = (SKILL_COL_W - 20) / 2

    const confirm = UI.buttonPrimary(this, 6 + halfW / 2, barCenterY, t('scenes.battle.actions.confirm'), {
      w: halfW, h: 28, depth: 8,
      onPress: () => {
        if (!this._selReady) return
        this._showCommitConfirm()
      },
    })
    this._confirmBtn = confirm.container.setVisible(false)

    const skip = UI.buttonGhost(this, 6 + halfW + 8 + halfW / 2, barCenterY, t('scenes.battle.actions.skip'), {
      w: halfW, h: 28, depth: 8,
      onPress: () => {
        if (this._currentActorId) {
          this._showSkipConfirm()
        }
      },
    })
    this._cancelBtn = skip.container.setVisible(false)
  }

  private _buildEndMovementButton(): void {
    // End-movement CTA: Primary gold (§1.1).
    const barCenterY = PANEL_Y + HAND_TOTAL_H + BTN_BAR_H / 2 + 6
    const end = UI.buttonPrimary(this, SKILL_COL_W / 2, barCenterY, t('scenes.battle.actions.end-movement'), {
      w: BTN_W, h: 28, depth: 8,
      onPress: () => {
        this._ctrl.clearMoveSelection()
        this._ctrl.advancePhase()
      },
    })
    this._endMovementBtn = end.container.setVisible(false)
  }

  // ── Movement phase UI ────────────────────────────────────────────────────────

  private _setMovementPhaseUI(active: boolean): void {
    this._isPlayerMovementPhase = active
    this._clearMoveOverlays()
    this._moveSelectedId = null
    this._clearFocusRings()

    // Destroy previous movement label
    this._movePhaseLabel?.destroy(true)
    this._movePhaseLabel = null

    if (active) {
      this._panelBg.setVisible(true)
      this._endMovementBtn.setVisible(true)

      // Show "TURNO DE MOVIMENTO" in the skill column. Tint follows the
      // local player's side so the label matches their team color rather
      // than the legacy turquoise accent.
      //
      // Sub 9.6: title block moved to the TOP of the skill column (was at
      // H/2-60 = 300, which overlapped both the end-movement button and
      // the mini-log/round badge below). The 2-line "Mova seus
      // personagens" sub and the decorative arrow icon were dropped — the
      // 2-line title plus the FIM MOVIMENTO button right below already
      // communicate the affordance without crowding ORDEM DE AÇÃO further
      // down.
      const labelCx = SKILL_COL_W / 2
      const titleY = TOP_BAR_H2 + 56
      const playerTeamHex = this._playerSide === 'left' ? dsColors.team.allyHex : dsColors.team.enemyHex

      const movTitle = this.add.text(labelCx, titleY, t('scenes.battle.phase.movement-title-line-1'), {
        fontFamily: fontFamily.display, fontSize: typeScale.h3,
        color: playerTeamHex, fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5)

      const movTitle2 = this.add.text(labelCx, titleY + 26, t('scenes.battle.phase.movement-title-line-2'), {
        fontFamily: fontFamily.display, fontSize: typeScale.h3,
        color: playerTeamHex, fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5)

      this._movePhaseLabel = this.add.container(0, 0, [movTitle, movTitle2]).setDepth(6)

      // Pulse animation
      this.tweens.add({
        targets: this._movePhaseLabel,
        alpha: { from: 0.7, to: 1 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      })
    } else {
      this._endMovementBtn.setVisible(false)
      if (!this._currentActorId) this._panelBg.setVisible(false)
    }
  }

  private _addMoveOverlay(col: number, row: number): void {
    // Valid-move overlay: green wash per INTEGRATION_SPEC §4 (tile.validMove).
    const { x, y } = _tileCenter(col, row)
    const fillA = dsTile.validMove.alpha
    const hoverA = Math.min(1, fillA + 0.14)
    const tile = this.add.rectangle(x, y, TILE - 4, TILE - 4)
      .setStrokeStyle(2, dsTile.validMoveBorder, 1)
      .setFillStyle(dsTile.validMove.color, fillA)
      .setInteractive({ useHandCursor: true })
      .setDepth(4)

    tile.on('pointerover', () => tile.setFillStyle(dsTile.validMove.color, hoverA))
    tile.on('pointerout',  () => tile.setFillStyle(dsTile.validMove.color, fillA))
    tile.on('pointerdown', () => {
      if (!this._moveSelectedId) return
      const result = this._ctrl.moveCharacter(this._moveSelectedId, col, row)
      if (!result.ok) this._addLog(`[!] ${result.error}`)
    })

    this._moveOverlays.push(tile)
  }

  private _clearMoveOverlays(): void {
    for (const tile of this._moveOverlays) tile.destroy()
    this._moveOverlays = []
  }

  // ── Turn tracker sidebar ─────────────────────────────────────────────────────

  /** Creates the static background panel + header text. Called once in create(). */
  private _buildTurnTrackerShell(): void {
    this.add.rectangle(TRK_CX, TRK_Y + 190, TRK_W, 380, 0x0a1020)
      .setStrokeStyle(1, 0x1e3a5f).setDepth(3)

    this._trackerHeader = this.add.text(TRK_CX, TRK_Y + 8, t('scenes.battle.tracker.placeholder'), {
      fontFamily: fontFamily.body, fontSize: '14px', color: '#64748b', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(4)
  }

  /** Destroys and recreates all dynamic tracker rows from `_turnEntries`. */
  private _renderTurnTracker(): void {
    for (const obj of this._trackerObjs) (obj as Phaser.GameObjects.GameObject).destroy()
    this._trackerObjs = []

    const rowH  = 28
    const baseY = TRK_Y + 26

    this._turnEntries.forEach((entry, i) => {
      const y = baseY + i * rowH

      const isActive = entry.status === 'active'
      const isDone   = entry.status === 'done'

      // Row background for active actor
      if (isActive) {
        const rowBg = this.add.rectangle(TRK_CX, y + rowH / 2, TRK_W - 4, rowH - 2, 0x112233)
          .setStrokeStyle(1, 0x2255aa).setDepth(3)
        this._trackerObjs.push(rowBg)
      }

      const icon  = isActive ? '▶' : isDone ? '✓' : '—'
      const color = isActive ? '#e2e8f0' : isDone ? '#44dd88' : '#475569'

      const iconTxt = this.add.text(TRK_X + 6, y + 4, icon, {
        fontFamily: fontFamily.body, fontSize: '14px', color,
      }).setDepth(4)

      const nameTxt = this.add.text(TRK_X + 18, y + 4, entry.name, {
        fontFamily: fontFamily.body, fontSize: '14px', color,
        fontStyle: isActive ? 'bold' : 'normal',
      }).setDepth(4)

      const progressColor = isActive ? '#00ccaa' : '#334155'
      const progressTxt = this.add.text(TRK_CX + TRK_W / 2 - 6, y + 4,
        `${entry.order}/${entry.total}`, {
          fontFamily: fontFamily.body, fontSize: '15px', color: progressColor,
        }).setOrigin(1, 0).setDepth(4)

      this._trackerObjs.push(iconTxt, nameTxt, progressTxt)
    })
  }

  // ── Phase banner ─────────────────────────────────────────────────────────────

  /** Show turn indicator on both halves of the top bar (blue left, purple right).
   *  Movement = "Turno de movimento" on both halves
   *  Action = "Turno do REI" etc on both halves (1x1 solo) */
  private _showTeamTurnOverlay(_side: 'left' | 'right', phase?: string, actorRole?: string): void {
    this._teamTurnOverlay?.destroy(true)
    this._teamTurnOverlay = null

    const barX = GRID_X
    const barW = W - GRID_X
    const halfBarW = barW / 2
    const barCy = TOP_BAR_H2 / 2
    const stk = { stroke: '#000000', strokeThickness: 2 }

    const elements: Phaser.GameObjects.GameObject[] = []
    const blueX = barX + halfBarW / 2
    const redX = barX + halfBarW + halfBarW / 2

    let label: string
    if (phase === 'movement') {
      label = t('scenes.battle.phase.movement-label')
    } else if (actorRole) {
      label = t('scenes.battle.phase.role-turn', { role: roleAbbr(actorRole) })
    } else {
      label = t('scenes.battle.phase.action-label')
    }

    // Ally half (left) — blue tint + label
    elements.push(this.add.rectangle(blueX, barCy, halfBarW, TOP_BAR_H2, dsColors.team.ally, 0.08))
    elements.push(this.add.text(blueX, barCy - 4, label, {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color: dsColors.team.allyHex, fontStyle: 'bold', ...stk,
    }).setOrigin(0.5))
    const ag1 = this.add.graphics()
    ag1.lineStyle(2, dsColors.team.ally, 0.5)
    ag1.beginPath(); ag1.moveTo(blueX - 5, barCy + 8); ag1.lineTo(blueX, barCy + 13); ag1.lineTo(blueX + 5, barCy + 8); ag1.strokePath()
    elements.push(ag1)

    // Enemy half (right) — red tint + label
    elements.push(this.add.rectangle(redX, barCy, halfBarW, TOP_BAR_H2, dsColors.team.enemy, 0.08))
    elements.push(this.add.text(redX, barCy - 4, label, {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color: dsColors.team.enemyHex, fontStyle: 'bold', ...stk,
    }).setOrigin(0.5))
    const ag2 = this.add.graphics()
    ag2.lineStyle(2, dsColors.team.enemy, 0.5)
    ag2.beginPath(); ag2.moveTo(redX - 5, barCy + 8); ag2.lineTo(redX, barCy + 13); ag2.lineTo(redX + 5, barCy + 8); ag2.strokePath()
    elements.push(ag2)

    this._teamTurnOverlay = this.add.container(0, 0, elements).setDepth(2)
  }

  private _showPhaseBanner(_isPlayer: boolean, phase: 'movement' | 'action'): void {
    // Kill previous banner immediately
    for (const obj of this._bannerObjs) (obj as Phaser.GameObjects.GameObject).destroy()
    this._bannerObjs = []

    const title    = phase === 'movement' ? t('scenes.battle.phase.movement-title-line-2') : t('scenes.battle.phase.action-title')
    const sub      = phase === 'movement' ? t('scenes.battle.phase.movement-sub').replace('\n', ' ') : t('scenes.battle.phase.action-sub')
    const bgColor  = 0x0a1020
    const stroke   = 0xc9a84c
    const titleCol = '#c9a84c'

    const bannerY = GRID_Y + ROWS * TILE / 2 - 14   // vertical centre of grid

    const bg = this.add.rectangle(W / 2, bannerY, 380, 68, bgColor)
      .setStrokeStyle(2, stroke).setAlpha(0).setDepth(14)
    const titleTxt = this.add.text(W / 2, bannerY - 13, title, {
      fontFamily: fontFamily.display, fontSize: '26px', color: titleCol, fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setDepth(15)
    const subTxt = this.add.text(W / 2, bannerY + 14, sub, {
      fontFamily: fontFamily.body, fontSize: '15px', color: '#94a3b8',
    }).setOrigin(0.5).setAlpha(0).setDepth(15)

    this._bannerObjs = [bg, titleTxt, subTxt]

    this.tweens.add({
      targets: this._bannerObjs, alpha: 1, duration: 200, ease: 'Quad.Out',
      onComplete: () => {
        this.time.delayedCall(1100, () => {
          this.tweens.add({
            targets: this._bannerObjs, alpha: 0, duration: 350, ease: 'Quad.In',
            onComplete: () => {
              for (const obj of this._bannerObjs) (obj as Phaser.GameObjects.GameObject).destroy()
              this._bannerObjs = []
            },
          })
        })
      },
    })
  }

  // ── Actor nameplate ──────────────────────────────────────────────────────────

  // Actor label removed — top bar shows turn info instead
  private _showActorLabel(_unitId: string, _isPlayer: boolean): void { /* no-op */ }
  private _hideActorLabel(): void {
    this._actorLabel?.destroy()
    this._actorLabel = null
  }

  // ── Turn flash banner (brief overlay when player's character acts) ────────

  private _showTurnFlash(name: string): void {
    const cx = W / 2
    const cy = GRID_Y + ROWS * TILE / 2
    const bg = this.add.rectangle(cx, cy, 300, 50, 0x000000, 0.7).setDepth(900)
    const txt = this.add.text(cx, cy, `\u2694 ${name}`, {
      fontFamily: fontFamily.body, fontSize: '24px', color: '#f0c850', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(901)

    // Scale in
    bg.setScale(0.5, 0)
    txt.setAlpha(0)

    this.tweens.add({ targets: bg, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.Out' })
    this.tweens.add({ targets: txt, alpha: 1, duration: 200 })

    // Fade out after 800ms
    this.time.delayedCall(800, () => {
      this.tweens.add({
        targets: [bg, txt], alpha: 0, duration: 300,
        onComplete: () => { bg.destroy(); txt.destroy() },
      })
    })
  }

  // ── Player panel — card buttons (rebuilt each turn) ───────────────────────

  private _rebuildCardButtons(actorId: string): void {
    this._destroyCardButtons()

    const hand = this._ctrl.getHand(actorId)
    if (!hand) return

    // Show the panel shell and persistent buttons
    this._panelBg.setVisible(true)
    this._cancelBtn.setVisible(true)
    this._confirmBtn.setVisible(true).setAlpha(this._selReady ? 1 : 0.3)

    // INTEGRATION_SPEC §2 + Print 15 — vertical 120×160 cards laid out as
    // 2×2: top row atk1/atk2, bottom row def1/def2.
    const allCards = [...hand.attack, ...hand.defense]
    allCards.forEach((skill, i) => {
      const col = i % HAND_COLS
      const row = Math.floor(i / HAND_COLS)
      const cx = HAND_PAD_X + col * (CARD_W + CARD_GAP) + CARD_W / 2
      const cy = PANEL_Y + row * (CARD_H + CARD_GAP) + CARD_H / 2
      this._makeCardBtn(cx, cy, skill, actorId)
    })
  }

  /** Create a small section label ("ATAQUE" / "DEFESA") and track for cleanup. */
  /** Section label for card groups — kept for potential future use */
  public _addSectionLabel(x: number, y: number, text: string, color: string): void {
    const label = this.add.text(x, y, text, {
      fontFamily: fontFamily.body, fontSize: '15px', color, fontStyle: 'bold',
    }).setOrigin(0, 1).setDepth(7)
    // Wrap in a minimal container so it goes through the same cleanup path
    const c = this.add.container(0, 0, [label]).setDepth(7)
    this._cardBtns.push(c)
  }

  /** Build one skill card button and register it for cleanup. */
  private _makeCardBtn(x: number, y: number, skill: Skill, actorId: string): void {
    // Get the actual role of the acting character
    const actorChar = this._ctrl.getCharacter(actorId)
    const actorRole = actorChar?.role ?? 'king'

    // Vertical 120×160 shape per INTEGRATION_SPEC §2 + Print 15.
    // ETAPA 6.4: card exposes CAT·CLASSE + NV+dots at top and stat·TYPE in
    // the footer; UPAR is hidden in battle (read-only context).
    const card = UI.skillCard(this, x, y, {
      skillId: skill.id,
      name: skill.name, effectType: skill.effectType, power: skill.power,
      group: skill.group, unitClass: actorRole, level: 1,
      description: skill.description,
      cooldownTurns: skill.cooldownTurns ?? 0,
      targetType: skill.targetType,
      areaShape: skill.areaShape,
    }, {
      width: CARD_W, height: CARD_H,
      orientation: 'vertical',
      showTooltip: false, // we handle tooltip ourselves
    })
    card.setDepth(7)

    // Selection glow overlay (drawn on top)
    const gfx = this.add.graphics()
    card.add(gfx)

    // Selected: gold outer outline offset 2px (INTEGRATION_SPEC §2 "selected"
    // state). Hovered: soft class-colored glow tuned per category.
    const CLASS_COLOR_MAP: Record<string, number> = {
      king: dsColors.class.king, warrior: dsColors.class.warrior,
      specialist: dsColors.class.specialist, executor: dsColors.class.executor,
    }
    const classGlowColor = CLASS_COLOR_MAP[actorRole] ?? accent.primary
    const categoryColor  = skill.category === 'attack' ? dsState.error : dsState.info
    const drawHighlight = (selected: boolean, hovered: boolean) => {
      gfx.clear()
      if (selected) {
        gfx.lineStyle(2, accent.primary, 1)
        gfx.strokeRoundedRect(-CARD_W / 2 - 3, -CARD_H / 2 - 3, CARD_W + 6, CARD_H + 6, radii.md + 2)
      } else if (hovered) {
        gfx.lineStyle(2, classGlowColor, 0.85)
        gfx.strokeRoundedRect(-CARD_W / 2 - 1, -CARD_H / 2 - 1, CARD_W + 2, CARD_H + 2, radii.md + 1)
      }
      void categoryColor // reserved for future category-tinted hover
    }

    // Hit area on top of card
    const hitArea = this.add.rectangle(0, 0, CARD_W, CARD_H, 0, 0.001)
      .setInteractive({ useHandCursor: true })
    card.add(hitArea)

    const cx = x, cy = y
    hitArea.on('pointerover', () => {
      if (this._awaitingMode) return
      const sel = skill.id === this._selectedCardId
      drawHighlight(sel, true)
      card.setScale(1.03)
      this._showSkillTooltip(skill, cx + CARD_W / 2 + 5, cy)
    })
    hitArea.on('pointerout', () => {
      const sel = skill.id === this._selectedCardId
      drawHighlight(sel, false)
      card.setScale(1)
      this._hideSkillTooltip()
    })
    hitArea.on('pointerdown', () => {
      if (this._awaitingMode) {
        this._clearTargetOverlays()
        this._awaitingMode    = null
        this._awaitingSkillId = null
      }
      const result = this._ctrl.useSkill(skill.id)
      if (!result.ok) this._addLog(`[!] ${result.error}`)
    })

    this._cardBtns.push(card)
    this._cardBgMap.set(skill.id, {
      gfx,
      hitArea,
      redraw: (selected, hovered) => drawHighlight(selected, hovered),
    })
  }

  private _refreshCardHighlights(): void {
    for (const [skillId, entry] of this._cardBgMap) {
      const selected = skillId === this._selectedCardId
      entry.redraw(selected, false)
    }
  }

  // ── Skill tooltip (shown on card hover) ─────────────────────────────────────

  private _showSkillTooltip(skill: Skill, x: number, y: number): void {
    this._hideSkillTooltip()

    const ttActor = this._currentActorId ? this._ctrl.getCharacter(this._currentActorId) : null
    const role = (ttActor?.role ?? 'king') as 'king' | 'warrior' | 'executor' | 'specialist'

    const CLASS_NAMES: Record<string, string> = {
      king: roleFull('king'), warrior: roleFull('warrior'), executor: roleFull('executor'), specialist: roleFull('specialist'),
    }
    const CLASS_HEX: Record<string, string> = {
      king: '#fbbf24', warrior: '#8b5cf6', executor: '#dc2626', specialist: '#10b981',
    }
    const CATEGORY_LABEL: Record<string, string> = {
      attack1: 'ATK 1', attack2: 'ATK 2', defense1: 'DEF 1', defense2: 'DEF 2',
    }

    const DMG_TYPES = new Set([
      'damage', 'true_damage', 'area', 'bleed', 'burn', 'poison', 'lifesteal', 'mark',
    ])
    const HEAL_TYPES = new Set(['heal', 'regen', 'revive'])
    const SHIELD_TYPES = new Set(['shield'])

    // Build stats row (DMG/HEAL/SHLD + CD + RNG). Follows Print 16 layout.
    const stats: Array<{ label: string; value: string; colorHex?: string }> = []
    if (skill.power > 0) {
      if (DMG_TYPES.has(skill.effectType)) {
        stats.push({ label: 'DMG', value: String(skill.power), colorHex: dsState.errorHex })
      } else if (HEAL_TYPES.has(skill.effectType)) {
        stats.push({ label: 'HEAL', value: String(skill.power), colorHex: dsState.successHex })
      } else if (SHIELD_TYPES.has(skill.effectType)) {
        stats.push({ label: 'SHLD', value: String(skill.power), colorHex: hpState.shieldHex })
      }
    }
    stats.push({ label: 'CD', value: String(skill.cooldownTurns ?? 0) })
    if (skill.range && skill.range > 0) {
      stats.push({ label: 'RNG', value: String(skill.range) })
    }

    // Position tooltip to the right of the card, vertically clamped. The helper
    // draws from (ttX, ttY) top-left when anchor='bottom'; estTH estimate is
    // enough to keep the tooltip on-screen without pre-measuring.
    const estTH = 180
    const ttX = Math.min(x + CARD_W / 2 + 16, W - 330)
    const ttY = Phaser.Math.Clamp(y - estTH / 2, 16, H - estTH - 16)

    this._skillTooltip = UI.skillTooltip(this, ttX, ttY, {
      name: skill.name,
      className: CLASS_NAMES[role] ?? role,
      classColorHex: CLASS_HEX[role],
      categoryLabel: CATEGORY_LABEL[skill.group] ?? skill.group.toUpperCase(),
      description: skill.description,
      stats,
    }, { anchor: 'bottom' })
  }

  private _hideSkillTooltip(): void {
    if (this._skillTooltip) {
      this._skillTooltip.destroy(true)
      this._skillTooltip = null
    }
  }

  private _destroyCardButtons(): void {
    this._hideSkillTooltip()
    for (const btn of this._cardBtns) btn.destroy()
    this._cardBtns  = []
    this._cardBgMap.clear()
  }

  // ── Target overlays ───────────────────────────────────────────────────────────

  private _buildTargetOverlays(
    actorId:    string,
    skillId:    string,
    targetMode: 'unit' | 'tile',
  ): void {
    this._clearTargetOverlays()

    if (targetMode === 'unit') {
      const targets = this._ctrl.getValidTargets(actorId, skillId)
      if (!targets || targets.length === 0) {
        this._awaitingMode    = null
        this._awaitingSkillId = null
        this._ctrl.cancelAction()
        this._addLog(t('scenes.battle.log.no-targets'))
        if (this._currentActorId) {
          this._ctrl.selectCharacter(this._currentActorId)
        }
        return
      }
      for (const target of targets) {
        this._addUnitTargetRing(target)
      }
    } else {
      const positions = this._ctrl.getValidAreaPositions(actorId, skillId)
      if (!positions || positions.length === 0) {
        this._awaitingMode    = null
        this._awaitingSkillId = null
        this._ctrl.cancelAction()
        this._addLog(t('scenes.battle.log.no-targets'))
        if (this._currentActorId) {
          this._ctrl.selectCharacter(this._currentActorId)
        }
        return
      }
      for (const pos of positions) {
        this._addTileOverlay(pos.col, pos.row)
      }
    }
  }

  private _addUnitTargetRing(target: Character): void {
    const sprite = this._sprite(target.id)
    if (!sprite) return

    // Valid-skill target: gold wash per §4 (tile.validSkill = accent.primary).
    const ring = this.add.rectangle(
      sprite.container.x, sprite.container.y,
      CHAR_SIZE + 16, CHAR_SIZE + 16,
    )
      .setStrokeStyle(2, dsTile.validSkillBorder, 1)
      .setFillStyle(dsTile.validSkill.color, dsTile.validSkill.alpha * 0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(6)

    ring.on('pointerover', () => ring.setFillStyle(dsTile.validSkill.color, dsTile.validSkill.alpha))
    ring.on('pointerout',  () => ring.setFillStyle(dsTile.validSkill.color, dsTile.validSkill.alpha * 0.5))
    ring.on('pointerdown', () => {
      const result = this._ctrl.chooseTarget({ kind: 'character', characterId: target.id })
      if (result.ok) {
        this._clearTargetOverlays()
        this._awaitingMode    = null
        this._awaitingSkillId = null
        // Rebuild card panel to ensure defense cards are fresh and clickable
        if (this._currentActorId) {
          this._rebuildCardButtons(this._currentActorId)
        }
      } else {
        this._addLog(`[!] ${result.error}`)
      }
    })

    this._targetOverlays.push(ring)
  }

  private _addTileOverlay(col: number, row: number): void {
    // Valid-skill tile (area origin): gold wash per §4 (tile.validSkill).
    const { x, y } = _tileCenter(col, row)
    const idleA = dsTile.validSkill.alpha
    const hoverA = Math.min(1, idleA + 0.12)
    const tile = this.add.rectangle(x, y, TILE - 4, TILE - 4)
      .setStrokeStyle(2, dsTile.validSkillBorder, 1)
      .setFillStyle(dsTile.validSkill.color, idleA)
      .setInteractive({ useHandCursor: true })
      .setDepth(6)

    tile.on('pointerover', () => {
      tile.setFillStyle(dsTile.validSkill.color, hoverA)
      if (this._awaitingSkillId) this._showAreaPreview(col, row, this._awaitingSkillId)
    })
    tile.on('pointerout',  () => {
      tile.setFillStyle(dsTile.validSkill.color, idleA)
      this._clearAreaPreview()
    })
    tile.on('pointerdown', () => {
      const result = this._ctrl.chooseTarget({ kind: 'area', col, row })
      if (result.ok) {
        this._clearTargetOverlays()
        this._awaitingMode    = null
        this._awaitingSkillId = null
        // Rebuild card panel to ensure defense cards are fresh and clickable
        if (this._currentActorId) {
          this._rebuildCardButtons(this._currentActorId)
        }
      } else {
        this._addLog(`[!] ${result.error}`)
      }
    })

    this._targetOverlays.push(tile)
  }

  private _clearTargetOverlays(): void {
    for (const obj of this._targetOverlays) {
      (obj as Phaser.GameObjects.Rectangle).destroy()
    }
    this._targetOverlays = []
    this._clearAreaPreview()
  }

  // ── Area hover preview ──────────────────────────────────────────────────────

  private _showAreaPreview(centerCol: number, centerRow: number, skillId: string): void {
    this._clearAreaPreview()
    const skill = this._ctrl.getSkill(skillId)
    if (!skill?.areaShape) return

    // AoE preview: red wash per §4 (tile.areaPreview). Spec calls for a 4-2
    // dashed border; Phaser Graphics has no dashed stroke primitive, so we
    // render a solid 1px border at the full spec alpha and leave the dash
    // pattern as a polish item for a later pass.
    const offsets = areaOffsets(skill.areaShape)
    for (const [dc, dr] of offsets) {
      const c = centerCol + dc
      const r = centerRow + dr
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue
      const px = GRID_X + c * TILE + TILE / 2
      const py = GRID_Y + r * TILE + TILE / 2
      const rect = this.add.rectangle(px, py, TILE - 2, TILE - 2,
        dsTile.areaPreview.color, dsTile.areaPreview.alpha)
        .setStrokeStyle(1, dsTile.areaBorder, 0.9)
        .setDepth(50)
      this._areaPreviewRects.push(rect)
    }
  }

  private _clearAreaPreview(): void {
    for (const r of this._areaPreviewRects) r.destroy()
    this._areaPreviewRects = []
  }

  // ── Panel lifecycle ────────────────────────────────────────────────────────────

  private _hidePanel(): void {
    this._destroyCardButtons()
    this._clearTargetOverlays()
    this._clearFocusRings()
    this._panelBg.setVisible(false)
    this._confirmBtn.setVisible(false)
    this._cancelBtn.setVisible(false)
    this._selReady        = false
    this._awaitingMode    = null
    this._awaitingSkillId = null
    this._selectedCardId  = null
  }

  // ── Static drawing (called once) ──────────────────────────────────────────────

  private _drawBackground() {
    // Deep dark base
    this.add.rectangle(W / 2, H / 2, W, H, 0x050810)

    const gridH = ROWS * TILE
    const gridW = COLS * TILE
    const halfW = 8 * TILE

    // Arena zones with subtle gradient feel
    const arenaG = this.add.graphics()
    // Blue side
    arenaG.fillStyle(0x0d1a2e, 1)
    arenaG.fillRect(GRID_X, GRID_Y, halfW, gridH)
    // Lighter center strip on blue side
    arenaG.fillStyle(0x112844, 0.3)
    arenaG.fillRect(GRID_X + halfW - TILE * 2, GRID_Y, TILE * 2, gridH)
    // Red side
    arenaG.fillStyle(0x2e0d0d, 1)
    arenaG.fillRect(GRID_X + halfW, GRID_Y, halfW, gridH)
    // Lighter center strip on red side
    arenaG.fillStyle(0x441128, 0.3)
    arenaG.fillRect(GRID_X + halfW, GRID_Y, TILE * 2, gridH)

    // Arena border glow
    arenaG.lineStyle(1.5, 0x2a3a5a, 0.4)
    arenaG.strokeRect(GRID_X, GRID_Y, gridW, gridH)

    // Wall at column 8 (more dramatic)
    arenaG.fillStyle(0x3a3050, 0.6)
    arenaG.fillRect(GRID_X + 8 * TILE - 1, GRID_Y, 3, gridH)
    // Wall glow lines
    arenaG.fillStyle(0x6644aa, 0.15)
    arenaG.fillRect(GRID_X + 8 * TILE - 4, GRID_Y, 9, gridH)

    // Left skill column background (full height)
    const skillBg = this.add.graphics()
    skillBg.fillStyle(0x060a10, 0.95)
    skillBg.fillRoundedRect(0, 0, SKILL_COL_W, H, 0)
    // Right edge accent line
    skillBg.fillStyle(0x1a2a3a, 0.3)
    skillBg.fillRect(SKILL_COL_W - 1, 0, 1, H)

    // Button + log bar below skill cards
    const bbY = PANEL_Y + HAND_TOTAL_H + 4
    const bbG = this.add.graphics()
    bbG.fillStyle(0x0a0e16, 1)
    bbG.fillRect(0, bbY, SKILL_COL_W - 1, H - bbY)
    // Top separator line
    bbG.fillStyle(0x1a2a3a, 0.4)
    bbG.fillRect(6, bbY, SKILL_COL_W - 13, 1)

    // Status area background (below arena, full width)
    const statusAreaY = GRID_Y + gridH + 6
    const statusAreaH = H - statusAreaY - 2
    const statusBg = this.add.graphics()
    statusBg.fillStyle(0x060a10, 0.9)
    statusBg.fillRoundedRect(GRID_X - 2, statusAreaY, gridW + 4, statusAreaH, 8)
    statusBg.fillStyle(0xffffff, 0.01)
    statusBg.fillRoundedRect(GRID_X, statusAreaY + 2, gridW, 12, { tl: 6, tr: 6, bl: 0, br: 0 })
    statusBg.lineStyle(1, 0x1a2a3a, 0.15)
    statusBg.strokeRoundedRect(GRID_X - 2, statusAreaY, gridW + 4, statusAreaH, 8)
  }

  private _drawGrid() {
    // INTEGRATION_SPEC §4 + Print 12: ally half = navy wash with alt checker,
    // enemy half = crimson wash with alt checker, wall column = neutral gray
    // with a 1px highlight on the top edge.
    //
    // `_drawGrid` is idempotent and runs once in create(); per-tile hover /
    // movement / target / area states live in separate overlay Rectangles.
    const g = this.add.graphics()
    const WALL_COL = 8

    // ── Checkerboard tile pattern (ally navy / enemy crimson / wall gray) ──
    // Alt stripes read brighter than the base wash so the grid pattern is
    // visible even at a glance. Values live on `tile.allySideAlt` and
    // `tile.enemySideAlt` — see DesignTokens comment for the contrast story.
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const isEven = (col + row) % 2 === 0
        let baseColor: number
        if (col === WALL_COL) {
          baseColor = dsTile.wall
        } else if (col < WALL_COL) {
          baseColor = isEven ? dsTile.allySide : dsTile.allySideAlt
        } else {
          baseColor = isEven ? dsTile.enemySide : dsTile.enemySideAlt
        }
        g.fillStyle(baseColor, 1)
        g.fillRect(GRID_X + col * TILE, GRID_Y + row * TILE, TILE, TILE)
      }
    }

    // ── Wall column highlight — 1px bright top edge per spec §4 ──
    g.fillStyle(dsTile.wallShine, 0.6)
    g.fillRect(GRID_X + WALL_COL * TILE, GRID_Y, TILE, 1)

    // ── Grid lines (subtle border between every cell) ──
    g.lineStyle(1, border.subtle, 0.85)
    for (let col = 0; col <= COLS; col++) {
      g.lineBetween(GRID_X + col * TILE, GRID_Y, GRID_X + col * TILE, GRID_Y + ROWS * TILE)
    }
    for (let row = 0; row <= ROWS; row++) {
      g.lineBetween(GRID_X, GRID_Y + row * TILE, GRID_X + COLS * TILE, GRID_Y + row * TILE)
    }

    // ── Arena outer border — team-colored halves (INTEGRATION_SPEC colors) ──
    g.lineStyle(2, dsColors.team.ally, 0.55)
    g.lineBetween(GRID_X, GRID_Y, GRID_X + WALL_COL * TILE, GRID_Y)
    g.lineBetween(GRID_X, GRID_Y, GRID_X, GRID_Y + ROWS * TILE)
    g.lineBetween(GRID_X, GRID_Y + ROWS * TILE, GRID_X + WALL_COL * TILE, GRID_Y + ROWS * TILE)

    g.lineStyle(2, dsColors.team.enemy, 0.55)
    g.lineBetween(GRID_X + WALL_COL * TILE, GRID_Y, GRID_X + COLS * TILE, GRID_Y)
    g.lineBetween(GRID_X + COLS * TILE, GRID_Y, GRID_X + COLS * TILE, GRID_Y + ROWS * TILE)
    g.lineBetween(GRID_X + WALL_COL * TILE, GRID_Y + ROWS * TILE, GRID_X + COLS * TILE, GRID_Y + ROWS * TILE)

    // ── Chess-style coordinates (meta Manrope, fg-4 per spec §4) ──
    const coordStyle = {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: fg.disabledHex, fontStyle: 'bold',
    }
    const lastRow = ROWS - 1
    for (let col = 0; col < COLS; col++) {
      this.add.text(
        GRID_X + col * TILE + 4, GRID_Y + lastRow * TILE + TILE - 4,
        String.fromCharCode(65 + col),
        coordStyle,
      ).setOrigin(0, 1).setAlpha(0.85).setDepth(2)
    }
    for (let row = 0; row < ROWS; row++) {
      this.add.text(
        GRID_X + 4, GRID_Y + row * TILE + 4,
        `${row + 1}`,
        coordStyle,
      ).setOrigin(0, 0).setAlpha(0.85).setDepth(2)
    }

    // Ambient gold motes — same atmosphere, restyled to accent.primary.
    for (let i = 0; i < 12; i++) {
      const px = GRID_X + Math.random() * (COLS * TILE)
      const py = GRID_Y + Math.random() * (ROWS * TILE)
      const size = 0.5 + Math.random() * 1
      const p = this.add.circle(px, py, size, accent.primary, 0.05 + Math.random() * 0.05).setDepth(1)
      this.tweens.add({
        targets: p,
        y: py - 20 - Math.random() * 30,
        x: px + (Math.random() - 0.5) * 20,
        alpha: 0,
        duration: 3000 + Math.random() * 3000,
        repeat: -1,
        delay: Math.random() * 3000,
        onRepeat: () => {
          p.setPosition(GRID_X + Math.random() * (COLS * TILE), GRID_Y + Math.random() * (ROWS * TILE))
          p.setAlpha(0.05 + Math.random() * 0.05)
        },
      })
    }
  }

  private _drawHUD() {
    // ── TOP BAR — only above the arena (GRID_X to W) ──
    const barX = GRID_X
    const barW = W - GRID_X
    const barCx = barX + barW / 2  // center of top bar

    const topBar = this.add.graphics()
    topBar.fillStyle(0x060a12, 0.98)
    topBar.fillRoundedRect(barX, 0, barW, TOP_BAR_H2, { tl: 0, tr: 0, bl: 8, br: 8 })
    // Gradient bottom border (ally blue → gold centre → enemy red).
    for (let i = 0; i < barW; i++) {
      const t = i / barW
      const isAlly = t < 0.35
      const isEnemy = t > 0.65
      const color = isAlly ? dsColors.team.ally : isEnemy ? dsColors.team.enemy : accent.primary
      const alpha = isAlly || isEnemy ? 0.15 : 0.25 * (1 - Math.abs(t - 0.5) * 4)
      topBar.fillStyle(color, Math.max(0, alpha))
      topBar.fillRect(barX + i, TOP_BAR_H2 - 2, 1, 2)
    }

    // Team indicators — 4px vertical bar + team label + muted subtitle.
    // Use team tokens (ally blue / enemy red) so the top bar matches the
    // outer grid border and unit rings.
    const teamG = this.add.graphics()
    teamG.fillStyle(dsColors.team.ally, 0.9)
    teamG.fillRoundedRect(barX + 8, 8, 4, 26, 2)
    this.add.text(barX + 18, 10, t('scenes.battle.team.ally-eyebrow'), {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color: dsColors.team.allyHex, fontStyle: 'bold',
    })
    this.add.text(barX + 18, 26, t('scenes.battle.team.ally-name-fallback'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta, color: fg.tertiaryHex,
    })

    teamG.fillStyle(dsColors.team.enemy, 0.9)
    teamG.fillRoundedRect(W - 12, 8, 4, 26, 2)
    this.add.text(W - 20, 10, t('scenes.battle.team.enemy-eyebrow'), {
      fontFamily: fontFamily.body, fontSize: typeScale.small,
      color: dsColors.team.enemyHex, fontStyle: 'bold',
    }).setOrigin(1, 0)
    this.add.text(W - 20, 26, t('scenes.battle.team.enemy-name-fallback'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta, color: fg.tertiaryHex,
    }).setOrigin(1, 0)

    // Round + Timer badge — two-section pill centered in top bar.
    // INTEGRATION_SPEC §6 + Print 17: the visible timer uses Mono tabular
    // numerals; state threshold colors are resolved in _updateTimerDisplay.
    const badgeCy = TOP_BAR_H2 / 2
    const timerW = 64; const roundW = 84; const badgeH = 28; const badgeR = radii.md
    const totalW = timerW + roundW + 2
    const badgeX = barCx - totalW / 2
    const badgeG = this.add.graphics()

    // Timer section (left, darker)
    badgeG.fillStyle(surface.primary, 1)
    badgeG.fillRoundedRect(badgeX, badgeCy - badgeH / 2, timerW, badgeH,
      { tl: badgeR, bl: badgeR, tr: 0, br: 0 })
    // Round section (right, slightly lighter panel tint)
    badgeG.fillStyle(surface.panel, 1)
    badgeG.fillRoundedRect(badgeX + timerW + 2, badgeCy - badgeH / 2, roundW, badgeH,
      { tl: 0, bl: 0, tr: badgeR, br: badgeR })
    // Outer border (royal gold)
    badgeG.lineStyle(1, border.royal, 0.55)
    badgeG.strokeRoundedRect(badgeX, badgeCy - badgeH / 2, totalW, badgeH, badgeR)
    // Divider line between timer and round
    badgeG.fillStyle(border.royal, 0.3)
    badgeG.fillRect(badgeX + timerW, badgeCy - badgeH / 2 + 4, 2, badgeH - 8)

    // Timer text (left section, centered). JetBrains Mono tabular — value colored
    // per 3-state rule (normal green / warning amber / critical red pulsing).
    this._timerText = this.add.text(badgeX + timerW / 2, badgeCy, '', {
      fontFamily: fontFamily.mono, fontSize: typeScale.statMd,
      color: dsState.successHex, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10)

    // Round text (right section, centered)
    this._roundText = this.add.text(badgeX + timerW + 2 + roundW / 2, badgeCy, t('scenes.battle.tracker.round-label-default'), {
      fontFamily: fontFamily.body, fontSize: typeScale.meta,
      color: accent.primaryHex, fontStyle: 'bold',
    }).setOrigin(0.5)

    // Phase text — kept hidden; map overlay banners carry phase transitions.
    // ETAPA 1b (Sub 1.5 status panel) revisits phase labelling; for now the
    // node exists only for typing parity with the rest of the scene.
    this._phaseText = this.add.text(-999, -999, '', {
      fontFamily: fontFamily.body, fontSize: '1px', color: fg.tertiaryHex,
    }).setVisible(false)

    // Team dot (hidden, retained for legacy API parity)
    this._teamDot = this.add.circle(-999, -999, 1, 0x3b82f6).setVisible(false)

    // Timer bar below top bar. Fill color resolved dynamically in
    // _updateTimerDisplay via the same 3-state rule as the label.
    this._timerBar = this.add.rectangle(barX, TOP_BAR_H2, barW, 4, dsState.success)
      .setOrigin(0, 0).setDepth(10).setAlpha(0)
    this._timerBarW = barW

    // ── MINI LOG PANEL + HISTORICO BUTTON — below action buttons ──
    const miniLogY = PANEL_Y + HAND_TOTAL_H + BTN_BAR_H + 10
    const miniLogH = H - miniLogY - 4
    const miniLogW = SKILL_COL_W - 8
    this._miniLogY = miniLogY
    this._miniLogW = miniLogW

    // ── Surrender button — bottom-right corner of the arena area ──
    if (this._isTrainingMode) {
      this._buildTrainingBackButton()
    } else {
      this._buildSurrenderButton()
    }

    // Mini log panel background
    const mlG = this.add.graphics()
    mlG.fillStyle(0x080c14, 0.9)
    mlG.fillRoundedRect(4, miniLogY, miniLogW, miniLogH, 6)
    mlG.lineStyle(1, 0x1a2a3a, 0.2)
    mlG.strokeRoundedRect(4, miniLogY, miniLogW, miniLogH, 6)

    // Mini log title + round on same line
    this.add.text(SKILL_COL_W / 2, miniLogY + 10, t('scenes.battle.tracker.title'), {
      fontFamily: fontFamily.display, fontSize: '11px', color: '#c9a84c', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(5)

    // Round number (updated dynamically)
    this._miniLogRoundText = this.add.text(SKILL_COL_W / 2, miniLogY + 24, '', {
      fontFamily: fontFamily.display, fontSize: '11px', color: '#4fc3f7', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(5)

    // Container for dynamic mini log entries (rendered by _renderMiniLog)
    this._miniLogContainer = this.add.container(0, 0).setDepth(5)

    // HISTORICO button at the bottom of the mini log panel
    const hBtnY = miniLogY + miniLogH - 16
    const hBtnG = this.add.graphics()
    hBtnG.fillStyle(0x0e1420, 0.9)
    hBtnG.fillRoundedRect(10, hBtnY - 12, miniLogW - 12, 24, 6)
    hBtnG.lineStyle(1, 0xc9a84c, 0.3)
    hBtnG.strokeRoundedRect(10, hBtnY - 12, miniLogW - 12, 24, 6)

    this.add.text(SKILL_COL_W / 2, hBtnY, t('scenes.battle.tracker.history-button'), {
      fontFamily: fontFamily.display, fontSize: '14px', color: '#c9a84c', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(5)

    const hBtnHit = this.add.rectangle(SKILL_COL_W / 2, hBtnY, miniLogW - 12, 24, 0, 0.001)
      .setInteractive({ useHandCursor: true }).setDepth(6)
    hBtnHit.on('pointerdown', () => this._showLogPopup())
  }

  /** Show full action history popup organized by round — click anywhere to close */
  private _showLogPopup(): void {
    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.88)
      .setInteractive().setDepth(3000)

    const popW = 800; const popH = 620
    const popX = W / 2 - popW / 2; const popY2 = H / 2 - popH / 2
    const popG = this.add.graphics().setDepth(3001)
    popG.fillStyle(0x0a0e16, 1)
    popG.fillRoundedRect(popX, popY2, popW, popH, 14)
    popG.lineStyle(1.5, 0xc9a84c, 0.3)
    popG.strokeRoundedRect(popX, popY2, popW, popH, 14)

    const stk = { stroke: '#000000', strokeThickness: 3 }
    const logEls: Phaser.GameObjects.GameObject[] = [overlay, popG]

    // Panel hit area — blocks clicks inside the panel from closing
    const panelHit = this.add.rectangle(W / 2, H / 2, popW, popH, 0, 0.001)
      .setInteractive().setDepth(3001)
    logEls.push(panelHit)

    logEls.push(this.add.text(W / 2, popY2 + 28, t('scenes.battle.tracker.history-popup-title'), {
      fontFamily: fontFamily.display, fontSize: '22px', color: '#f0c850', fontStyle: 'bold', ...stk,
    }).setOrigin(0.5).setDepth(3002))

    logEls.push(this.add.text(W / 2, popY2 + popH - 18, t('scenes.battle.tracker.history-popup-hint'), {
      fontFamily: fontFamily.body, fontSize: '15px', color: '#555555', ...stk,
    }).setOrigin(0.5).setDepth(3002))

    // Scrollable content area
    const cX = popX + 16; const cW = popW - 32
    const cStartY = popY2 + 54; const cMaxY = popY2 + popH - 36
    const contentContainer = this.add.container(0, 0).setDepth(3002)
    logEls.push(contentContainer)

    // Mask for scrolling
    const maskG = this.add.graphics().setVisible(false)
    maskG.fillStyle(0xffffff); maskG.fillRect(cX, cStartY, cW, cMaxY - cStartY)
    contentContainer.setMask(maskG.createGeometryMask())
    logEls.push(maskG)

    let cy2 = cStartY
    const blueHex = '#00ccaa'; const redHex = '#8844cc'

    // Group actions by round
    let lastRound = 0
    for (const act of this._actionHistory) {
      if (act.round !== lastRound) {
        lastRound = act.round
        cy2 += 8
        const rg = this.add.graphics()
        rg.fillStyle(0xc9a84c, 0.25); rg.fillRect(cX, cy2, cW, 1)
        contentContainer.add(rg)
        cy2 += 6
        contentContainer.add(this.add.text(cX, cy2, t('scenes.battle.round-heading', { round: act.round }), {
          fontFamily: fontFamily.display, fontSize: '22px', color: '#f0c850', fontStyle: 'bold', ...stk,
        }))
        cy2 += 30
      }

      // Actor header
      const sideHex = act.actorSide === 'left' ? blueHex : redHex
      const sideLabel = act.actorSide === 'left' ? 'AZUL' : 'ROXO'
      contentContainer.add(this.add.text(cX, cy2, `${act.actorName}`, {
        fontFamily: fontFamily.display, fontSize: '18px', color: sideHex, fontStyle: 'bold', ...stk,
      }))
      contentContainer.add(this.add.text(cX + cW, cy2 + 2, sideLabel, {
        fontFamily: fontFamily.display, fontSize: '16px', color: sideHex, fontStyle: 'bold', ...stk,
      }).setOrigin(1, 0))
      cy2 += 26

      // Attack skill line
      const atkGroupColors: Record<string, string> = { attack1: '#dd4433', attack2: '#dd7733' }
      if (act.atkSkill) {
        const atkColor = atkGroupColors[act.atkGroup ?? ''] ?? '#dd4433'
        contentContainer.add(this.add.text(cX + 16, cy2, `⚔ ${act.atkSkill}`, {
          fontFamily: fontFamily.display, fontSize: '17px', color: atkColor, fontStyle: 'bold', ...stk,
        }))
        contentContainer.add(this.add.text(cX + cW, cy2 + 2, act.atkTargets ?? '', {
          fontFamily: fontFamily.body, fontSize: '16px', color: sideHex === blueHex ? redHex : blueHex, fontStyle: 'bold', ...stk,
        }).setOrigin(1, 0))
        cy2 += 24
      }

      // Defense skill line
      const defGroupColors: Record<string, string> = { defense1: '#3366cc', defense2: '#33aa88' }
      if (act.defSkill) {
        const defColor = defGroupColors[act.defGroup ?? ''] ?? '#3366cc'
        contentContainer.add(this.add.text(cX + 16, cy2, `🛡 ${act.defSkill}`, {
          fontFamily: fontFamily.display, fontSize: '17px', color: defColor, fontStyle: 'bold', ...stk,
        }))
        contentContainer.add(this.add.text(cX + cW, cy2 + 2, act.defTarget ?? '', {
          fontFamily: fontFamily.body, fontSize: '16px', color: sideHex, fontStyle: 'bold', ...stk,
        }).setOrigin(1, 0))
        cy2 += 24
      }

      // Thin divider between actors
      const divG = this.add.graphics()
      divG.fillStyle(0x333344, 0.3)
      divG.fillRect(cX + 10, cy2, cW - 20, 1)
      contentContainer.add(divG)
      cy2 += 6
    }

    // Scroll support — start scrolled to the BOTTOM (latest actions)
    const totalH = cy2 - cStartY
    const visH = cMaxY - cStartY
    const maxScroll2 = Math.max(0, totalH - visH)
    let scrollOff = maxScroll2  // start at bottom

    const applyScroll = () => { contentContainer.y = -scrollOff }
    applyScroll()

    // Wheel scroll (works on both overlay and panel)
    const onWheel = (_p: Phaser.Input.Pointer, _go: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      scrollOff = Phaser.Math.Clamp(scrollOff + dy * 0.6, 0, maxScroll2)
      applyScroll()
    }
    overlay.on('wheel', onWheel)
    panelHit.on('wheel', onWheel)

    // Scene-level wheel (catches all wheel events while popup is open)
    const sceneWheel = (_p: Phaser.Input.Pointer, _go: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      scrollOff = Phaser.Math.Clamp(scrollOff + dy * 0.6, 0, maxScroll2)
      applyScroll()
    }
    this.input.on('wheel', sceneWheel)

    // Drag-to-scroll (touch/mobile friendly)
    let dragging2 = false; let dragStartY2 = 0; let dragScrollStart2 = 0
    panelHit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragging2 = true; dragStartY2 = p.y; dragScrollStart2 = scrollOff
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!dragging2) return
      scrollOff = Phaser.Math.Clamp(dragScrollStart2 + (dragStartY2 - p.y), 0, maxScroll2)
      applyScroll()
    })
    this.input.on('pointerup', () => { dragging2 = false })

    // Only close when clicking OUTSIDE the panel (overlay area)
    overlay.on('pointerdown', () => {
      this.input.off('wheel', sceneWheel)
      dragging2 = false
      logEls.forEach(el => el.destroy())
    })
  }

  private _drawCharacters() {
    const allUnits = [
      ...LEFT_UNITS.map((u)  => ({ ...u, side: 'left'  as CharacterSide })),
      ...RIGHT_UNITS.map((u) => ({ ...u, side: 'right' as CharacterSide })),
    ]

    for (const u of allUnits) {
      const char = this._ctrl.getCharacter(u.id)
      if (!char) continue

      const { x, y } = _tileCenter(u.col, u.row)
      const color     = TEAM_COLOR[u.side][u.role]
      const half      = CHAR_SIZE / 2
      const barW      = CHAR_SIZE + 4
      const barH      = 8

      // Ring colors — INTEGRATION_SPEC §5 states (retire legacy 0x00ccaa/
      // 0xffffff/0x00ff88 hardcoded hues). Each state maps to a token:
      //   move  → team color (ally/enemy) — identifies owning side during move
      //   focus → accent.primary (gold)   — INTEGRATION_SPEC §5 "selected"
      //   active → state.success (green)  — TURN_STARTED indicator
      const teamRingColor = u.side === 'left' ? dsColors.team.ally : dsColors.team.enemy

      // Movement-selection ring — shown on MOVE_CHARACTER_SELECTED
      const moveRing = this.add.rectangle(0, 0, CHAR_SIZE + 14, CHAR_SIZE + 14)
        .setStrokeStyle(3, teamRingColor, 1).setFillStyle(teamRingColor, 0.06).setVisible(false)

      // Action-selection ring (gold) — shown on CHARACTER_FOCUSED
      const focusRing = this.add.rectangle(0, 0, CHAR_SIZE + 14, CHAR_SIZE + 14)
        .setStrokeStyle(2, accent.primary, 1).setFillStyle(accent.primary, 0.06).setVisible(false)

      // Turn-active ring (green, pulsing) — shown on TURN_STARTED
      const activeRing = this.add.rectangle(0, 0, CHAR_SIZE + 8, CHAR_SIZE + 8)
        .setStrokeStyle(3, dsState.success).setFillStyle(dsState.success, 0.04).setVisible(false)

      // Sprite: normal character or training dummy.
      // The player's side reads its skin from the per-class skinConfig (set by
      // the lobby); enemy NPCs always use the default 'idle' skin since their
      // appearance is owned by the bot team, not the human player.
      const isDummy = this._ctrl.getCharacter(u.id)?.isDummy ?? false
      const isPlayerSide = u.side === this._playerSide
      const skinId = isPlayerSide && this._skinConfig
        ? (this._skinConfig[u.role as UnitRole] ?? 'idle')
        : 'idle'
      const charGraphics = isDummy
        ? this._drawDummySprite(CHAR_SIZE)
        : drawCharacterSprite(this, u.role as SpriteRole, u.side as SpriteSide, CHAR_SIZE, skinId)

      // Invisible hit-detection rect — keeps flash/highlight logic working unchanged
      const rect = this.add.rectangle(0, 0, CHAR_SIZE, CHAR_SIZE, color, 0.001)
        .setInteractive({ useHandCursor: true })

      rect.on('pointerdown', () => {
        if (this._isPlayerMovementPhase && this._isPlayerChar(u.id)) {
          const result = this._ctrl.selectForMove(u.id)
          if (!result.ok) this._addLog(`[!] ${result.error}`)
        }
      })

      // Flash overlay — colour-filled rectangle tweened to alpha=0 on damage/heal
      const flashRect = this.add.rectangle(0, 0, CHAR_SIZE, CHAR_SIZE, 0xff2222).setAlpha(0)

      // HP bar only (no numbers) — compact below the sprite. Track uses
      // surface.deepest (the navy-black token); fill uses hpStatusColor so
      // full/wounded/critical flows through the same breakpoints as the
      // status panel. Legacy 0x331111/0x4488ff hardcoded hues retired.
      const hpBarBg = this.add.rectangle(0, half + 4, barW, barH, surface.deepest)
        .setStrokeStyle(1, border.subtle, 0.9)
      const hpBar   = this.add.rectangle(-barW / 2, half + 4, barW, barH, hpStatusColor(1).fill).setOrigin(0, 0.5)
      const shieldBar = this.add.rectangle(-barW / 2, half + 4, 0, barH, hpState.shield, 0.7).setOrigin(0, 0.5)

      // Hidden hpText — kept for interface compatibility
      const hpText = this.add.text(0, -999, '', { fontSize: '1px' }).setVisible(false)

      // Hidden posText — kept for compatibility
      const posText = this.add.text(0, -999, `(${u.col},${u.row})`, { fontSize: '1px' }).setVisible(false)

      // Role abbreviation above the unit (team-coloured)
      const teamHex = u.side === 'left' ? dsColors.team.allyHex : dsColors.team.enemyHex
      const roleLabel = this.add.text(0, half - 2, roleAbbr(u.role), {
        fontFamily: fontFamily.body, fontSize: typeScale.meta, color: teamHex, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1)

      // Persistent status dots — positioned at top of the tile
      const statusDots = this.add.container(0, -(half + 2))

      // Class sigil chip (bottom-right of token) — INTEGRATION_SPEC §5
      // "class sigil SVG" — gives a persistent class indicator without
      // adding a fourth ring. Chip is a surface.panel disc with the
      // class sigil (already preloaded from handoff) tinted class color.
      const sigilChipR = 9
      const sigilChipX = half - 2
      const sigilChipY = half - 2
      const classColor = dsColors.class[u.role as UnitRole]
      const sigilChipG = this.add.graphics()
      sigilChipG.fillStyle(surface.panel, 0.95)
      sigilChipG.fillCircle(sigilChipX, sigilChipY, sigilChipR)
      sigilChipG.lineStyle(1, classColor, 0.95)
      sigilChipG.strokeCircle(sigilChipX, sigilChipY, sigilChipR)
      const sigilKey = getClassSigilKey(u.role as UnitRole)
      const sigilImg = this.textures.exists(sigilKey)
        ? this.add.image(sigilChipX, sigilChipY, sigilKey).setTintFill(classColor)
        : null
      if (sigilImg) {
        const target = sigilChipR * 2 - 4
        const scale = target / Math.max(sigilImg.width, sigilImg.height, 1)
        sigilImg.setScale(scale)
      }

      const container = this.add.container(x, y, [
        moveRing, focusRing, activeRing,
        charGraphics,   // sprite placeholder (will be replaced with real sprites later)
        rect,           // invisible hit area (keeps flash/interaction working)
        flashRect,
        hpBarBg, hpBar, shieldBar, hpText, posText, roleLabel, statusDots,
        sigilChipG, ...(sigilImg ? [sigilImg] : []),
      ])

      // AAA animator — drives procedural idle/hop/attack/hurt/death on the
      // *inner* charGraphics container. Dummies are left still so players get
      // a clean target for reference practice.
      const animator = isDummy ? null : new CharacterAnimator(this, charGraphics)

      this._sprites.set(u.id, {
        container,
        charGraphics,
        animator,
        rect, baseColor: color, flashRect,
        hpBar, hpBarBg, shieldBar, hpText, focusRing, moveRing, activeRing, posText, roleLabel, statusDots,
        maxHp: char.maxHp,
      })
      this._unitStatuses.set(u.id, new Set())

      // Kick off the looping idle animation (breathing + float + glow pulse)
      if (animator) {
        animator.playIdle()
      } else {
        // Dummies still get a very subtle idle so they don't feel totally dead
        this.tweens.add({
          targets: charGraphics,
          scaleX: 1.02, scaleY: 1.02,
          duration: 1600 + Math.random() * 400,
          yoyo: true, repeat: -1,
          ease: 'Sine.InOut',
          delay: Math.random() * 800,
        })
      }
    }
  }

  // ── Visual update helpers ──────────────────────────────────────────────────────

  private _updateHpBar(unitId: string, newHp: number) {
    const sprite = this._sprite(unitId)
    if (!sprite) return
    const hp    = Math.max(0, newHp)
    const ratio = hp / sprite.maxHp
    const barW  = CHAR_SIZE + 4
    // Animate HP bar width change (smooth tween instead of instant)
    this.tweens.add({
      targets: sprite.hpBar,
      displayWidth: ratio * barW,
      duration: 400,
      ease: 'Quad.Out',
    })
    sprite.hpBar.setFillStyle(hpStatusColor(ratio).fill)
  }

  private _floatingText(
    unitId: string,
    text: string,
    color: string,
    size: number = 22,
    isCrit: boolean = false,
  ) {
    const sprite = this._sprite(unitId)
    if (!sprite) return
    const { x, y } = sprite.container
    const finalSize = isCrit ? size + 10 : size
    const offsetX = (Math.random() - 0.5) * 30  // random horizontal spread

    const t = this.add.text(x + offsetX, y - 10, text, {
      fontFamily: fontFamily.display,
      fontSize: `${finalSize}px`,
      color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isCrit ? 6 : 4,
      shadow: { offsetX: 0, offsetY: 3, color: '#000000', blur: 8, fill: true },
    }).setOrigin(0.5).setDepth(1000).setAlpha(0)

    // Phase 1: Pop in with elastic scale (0 → overshoot → settle)
    const startScale = isCrit ? 2.0 : 1.5
    t.setScale(0)

    this.tweens.add({
      targets: t,
      scaleX: startScale, scaleY: startScale, alpha: 1,
      duration: 150, ease: 'Back.Out',
      onComplete: () => {
        // Phase 2: Settle scale down
        this.tweens.add({
          targets: t,
          scaleX: 1, scaleY: 1,
          duration: 200, ease: 'Quad.Out',
        })
        // Phase 3: Float up and fade out
        this.tweens.add({
          targets: t,
          y: y - 70 - (isCrit ? 20 : 0),
          alpha: 0,
          duration: 900,
          delay: 300,
          ease: 'Quad.In',
          onComplete: () => t.destroy(),
        })
      },
    })

    // Crit: camera shake + brief white flash
    if (isCrit) {
      this.cameras.main.shake(120, 0.008)
    }
  }

  private _showFocusRing(unitId: string): void {
    this._clearFocusRings()
    const sprite = this._sprite(unitId)
    if (!sprite) return
    sprite.focusRing.setVisible(true).setScale(1.2)
    this.tweens.add({ targets: sprite.focusRing, scaleX: 1, scaleY: 1, duration: 140, ease: 'Back.Out' })
  }

  private _clearFocusRings(): void {
    for (const sprite of this._sprites.values()) {
      sprite.focusRing.setVisible(false).setScale(1)
    }
  }

  private _showMoveRing(unitId: string): void {
    this._clearMoveRings()
    const sprite = this._sprite(unitId)
    if (!sprite) return
    sprite.moveRing.setVisible(true).setScale(1.2)
    this.tweens.add({ targets: sprite.moveRing, scaleX: 1, scaleY: 1, duration: 140, ease: 'Back.Out' })
  }

  private _clearMoveRings(): void {
    for (const sprite of this._sprites.values()) {
      sprite.moveRing.setVisible(false).setScale(1)
    }
  }

  private _stopActiveRing(unitId: string): void {
    const sprite = this._sprite(unitId)
    if (!sprite) return
    this.tweens.killTweensOf(sprite.activeRing)
    sprite.activeRing.setScale(1).setVisible(false)
  }

  private _flashUnit(unitId: string, color: number, intensity: number): void {
    const sprite = this._sprite(unitId)
    if (!sprite) return
    this.tweens.killTweensOf(sprite.flashRect)
    // Double flash (more impactful — blinks twice)
    sprite.flashRect.setFillStyle(color, intensity).setVisible(true)
    this.tweens.add({
      targets: sprite.flashRect,
      alpha: { from: intensity, to: 0 },
      duration: 120,
      yoyo: true,
      repeat: 1,
      onComplete: () => sprite.flashRect.setVisible(false).setAlpha(1),
    })
  }

  // ── Enhanced skill animation helpers ────────────────────────────────────────

  private static readonly PROJECTILE_COLORS: Record<string, number> = {
    damage: 0xff3333, bleed: 0x881122, poison: 0x44cc44, burn: 0xff6600,
    stun: 0xffdd00, true_damage: 0xff00ff, area: 0xff6633,
    def_down: 0xff8833, atk_down: 0xff8833, mov_down: 0xff8833,
    push: 0x88bbff, lifesteal: 0xcc22cc, mark: 0x881122, snare: 0x00ccaa,
    purge: 0xbb44ff, cleanse: 0x44ff88,
  }

  private static readonly GLOW_COLORS: Record<string, number> = {
    heal: 0x44ff88, shield: 0x4488ff, evade: 0xffffff, reflect: 0xbb44ff,
    regen: 0x88ff88, def_up: 0x44aaff, atk_up: 0xffaa44, revive: 0xffcc44,
  }

  private _playAttackProjectile(
    e: Extract<EngineEvent, { type: 'SKILL_USED' }>,
    casterSprite: UnitSprite,
  ): void {
    const { x: sx, y: sy } = casterSprite.container
    const skill = this._ctrl.getSkill(e.skillId)
    const effectType = skill?.effectType ?? 'damage'

    // Area skill: expanding circle at target position
    if (e.areaCenter) {
      const { x: tx, y: ty } = _tileCenter(e.areaCenter.col, e.areaCenter.row)

      // Bigger expanding circle with ring pulse
      const circle = this.add.circle(tx, ty, 4, 0xff6633, 0.6).setDepth(11)
      this.tweens.add({
        targets: circle, radius: TILE * 2, alpha: 0,
        duration: 400, ease: 'Quad.Out',
        onUpdate: () => circle.setScale(circle.scaleX),
        onComplete: () => circle.destroy(),
      })
      // Ring pulse effect
      const ring = this.add.circle(tx, ty, 8, 0xff6633, 0).setDepth(11)
        .setStrokeStyle(3, 0xff6633, 0.8)
      this.tweens.add({
        targets: ring, radius: TILE * 2.5, alpha: 0,
        duration: 500, ease: 'Quad.Out',
        onUpdate: () => ring.setScale(ring.scaleX),
        onComplete: () => ring.destroy(),
      })

      // Fire projectile from caster to area center (bigger, with trail)
      const proj = this.add.rectangle(sx, sy, 12, 12, 0xff6633).setDepth(11)
      const trail1 = this.add.rectangle(sx, sy, 8, 8, 0xff6633, 0.5).setDepth(998)
      const trail2 = this.add.rectangle(sx, sy, 6, 6, 0xff6633, 0.3).setDepth(997)
      this.tweens.add({
        targets: proj, x: tx, y: ty,
        duration: 300, ease: 'Quad.Out',
        onComplete: () => proj.destroy(),
      })
      this.tweens.add({
        targets: trail1, x: tx, y: ty, alpha: 0,
        duration: 350, ease: 'Quad.Out', delay: 40,
        onComplete: () => trail1.destroy(),
      })
      this.tweens.add({
        targets: trail2, x: tx, y: ty, alpha: 0,
        duration: 400, ease: 'Quad.Out', delay: 80,
        onComplete: () => trail2.destroy(),
      })

      // VFX on impact (delayed to match projectile travel)
      this.time.delayedCall(280, () => {
        switch (effectType) {
          case 'burn':
            this._vfx.fireBurst(tx, ty, 60); break
          case 'bleed':
            this._vfx.bleedEffect(tx, ty); break
          case 'stun': case 'snare':
            this._vfx.lightningEffect(tx, ty); break
          case 'poison':
            this._vfx.poisonCloud(tx, ty, 50); break
          case 'mark':
            this._vfx.lightningEffect(tx, ty); break
          case 'push':
            this._vfx.explosion(tx, ty, 0x4488ff, 50); break
          case 'lifesteal':
            this._vfx.explosion(tx, ty, 0xcc22cc, 60); break
          default:
            this._vfx.explosion(tx, ty, 0xff6633, 70); break
        }
      })
      return
    }

    // Single-target projectile
    if (e.targetId) {
      const targetSprite = this._sprite(e.targetId)
      if (!targetSprite) return
      const { x: tx, y: ty } = targetSprite.container
      const color = BattleScene.PROJECTILE_COLORS[e.skillName] ??
                    BattleScene.PROJECTILE_COLORS['damage'] ??
                    0xff3333
      // Look up color by the skill's effectType from the registry
      const projColor = skill
        ? (BattleScene.PROJECTILE_COLORS[skill.effectType] ?? color)
        : color

      // Bigger main projectile (12x12) with trailing glow
      const proj = this.add.rectangle(sx, sy, 12, 12, projColor).setDepth(11)
      const trail1 = this.add.rectangle(sx, sy, 8, 8, projColor, 0.5).setDepth(998)
      const trail2 = this.add.rectangle(sx, sy, 6, 6, projColor, 0.3).setDepth(997)

      this.tweens.add({
        targets: proj, x: tx, y: ty,
        duration: 300, ease: 'Quad.Out',
        onComplete: () => proj.destroy(),
      })
      this.tweens.add({
        targets: trail1, x: tx, y: ty, alpha: 0,
        duration: 350, ease: 'Quad.Out', delay: 40,
        onComplete: () => trail1.destroy(),
      })
      this.tweens.add({
        targets: trail2, x: tx, y: ty, alpha: 0,
        duration: 400, ease: 'Quad.Out', delay: 80,
        onComplete: () => trail2.destroy(),
      })

      // VFX on impact (delayed to match projectile travel)
      this.time.delayedCall(280, () => {
        switch (effectType) {
          case 'damage': case 'true_damage':
            this._vfx.slashEffect(tx, ty, 0xff4444); break
          case 'bleed':
            this._vfx.bleedEffect(tx, ty); break
          case 'stun': case 'snare':
            this._vfx.lightningEffect(tx, ty); break
          case 'burn':
            this._vfx.fireBurst(tx, ty, 40); break
          case 'poison':
            this._vfx.poisonCloud(tx, ty, 30); break
          case 'mark':
            this._vfx.lightningEffect(tx, ty); break
          default:
            this._vfx.slashEffect(tx, ty, projColor); break
        }
      })
    }
  }

  private _playDefenseGlow(
    e: Extract<EngineEvent, { type: 'SKILL_USED' }>,
    casterSprite: UnitSprite,
  ): void {
    // Determine glow color from skill effect type
    const skill = this._ctrl.getSkill(e.skillId)
    const effectType = skill?.effectType ?? 'shield'
    const glowColor = BattleScene.GLOW_COLORS[effectType] ?? 0x4488ff

    // Brief glow pulse on caster
    const { x, y } = casterSprite.container
    const glow = this.add.circle(x, y, CHAR_SIZE / 2, glowColor, 0.5).setDepth(11)
    this.tweens.add({
      targets: glow,
      radius: CHAR_SIZE, alpha: 0,
      duration: 350, ease: 'Quad.Out',
      onUpdate: () => glow.setScale(glow.scaleX),
      onComplete: () => glow.destroy(),
    })

    // VFX on caster based on defense effect type
    switch (effectType) {
      case 'shield':
        this._vfx.shieldEffect(x, y); break
      case 'heal':
        this._vfx.healEffect(x, y); break
      case 'regen':
        this._vfx.healEffect(x, y, 25); break
      case 'evade':
        this._vfx.evadeEffect(x, y); break
      case 'reflect':
        this._vfx.reflectEffect(x, y); break
      case 'atk_up': case 'double_attack':
        this._vfx.buffEffect(x, y, 0xf0c850); break
      case 'def_up':
        this._vfx.buffEffect(x, y, 0x44aaff); break
      case 'cleanse':
        this._vfx.healEffect(x, y, 20); break
      case 'revive':
        this._vfx.buffEffect(x, y, 0x44ff88); break
      default:
        this._vfx.shieldEffect(x, y); break
    }
  }

  // ── Persistent status dot helpers ───────────────────────────────────────────

  private static readonly STATUS_DOT_COLORS: Record<string, number> = {
    bleed:    0xcc2222, burn:     0xcc2222, poison:   0x44cc44,
    stun:     0xffdd00, snare:    0x00ccaa, shield:   0x4488ff,
    evade:    0xffffff, reflect:  0xbb44ff, regen:    0x88ff88,
    def_down: 0xff8833, atk_down: 0xff8833, mov_down: 0xff8833,
    def_up:   0x44aaff, atk_up:   0x44aaff,
    mark:     0x881122, heal_reduction: 0x996633, revive: 0xffcc44,
  }

  private static readonly STATUS_ICONS: Record<string, string> = {
    bleed: '\u{1fa78}', burn: '\u{1f525}', poison: '\u2620', stun: '\u26a1', snare: '\u{1f517}',
    shield: '\u{1f6e1}', evade: '\u{1f4a8}', reflect: '\u{1fa9e}', regen: '\u{1f49a}',
    def_down: '\u2b07', atk_down: '\u2b07', mov_down: '\u{1f40c}', def_up: '\u2b06', atk_up: '\u2b06',
    mark: '\u{1f3af}', heal_reduction: '\u{1f494}', revive: '\u2728', double_attack: '\u2694\u2694',
    silence_defense: '\u{1f910}',
  }

  private _addStatusDot(unitId: string, status: string): void {
    const statuses = this._unitStatuses.get(unitId)
    if (!statuses) return
    statuses.add(status)
    this._rebuildStatusDots(unitId)
  }

  private _removeStatusDot(unitId: string, status: string): void {
    const statuses = this._unitStatuses.get(unitId)
    if (!statuses) return
    statuses.delete(status)
    this._rebuildStatusDots(unitId)
  }

  private _rebuildStatusDots(unitId: string): void {
    const sprite  = this._sprite(unitId)
    const statuses = this._unitStatuses.get(unitId)
    if (!sprite || !statuses) return

    // Clear existing
    sprite.statusDots.removeAll(true)

    const statusArray = Array.from(statuses)
    const maxShow = 6
    const perRow = 3
    const badgeW = 16; const badgeH = 11; const gap = 2
    const rowH = badgeH + gap

    statusArray.slice(0, maxShow).forEach((status, i) => {
      const icon  = BattleScene.STATUS_ICONS[status] ?? '?'
      const color = BattleScene.STATUS_DOT_COLORS[status] ?? 0x888888

      const col = i % perRow
      const row = Math.floor(i / perRow)
      const rowCount = Math.min(perRow, statusArray.length - row * perRow)
      const rowWidth = rowCount * (badgeW + gap) - gap
      const ox = col * (badgeW + gap) - rowWidth / 2 + badgeW / 2
      const oy = row * rowH  // rows go downward, staying inside the tile

      const badge = this.add.graphics()
      badge.fillStyle(color, 0.35)
      badge.fillRoundedRect(ox - badgeW / 2, oy - badgeH / 2, badgeW, badgeH, 3)
      badge.lineStyle(1, color, 0.6)
      badge.strokeRoundedRect(ox - badgeW / 2, oy - badgeH / 2, badgeW, badgeH, 3)

      const iconText = this.add.text(ox, oy, icon, {
        fontFamily: fontFamily.body, fontSize: '11px', color: '#ffffff',
      }).setOrigin(0.5)

      sprite.statusDots.add(badge)
      sprite.statusDots.add(iconText)
    })
  }

  // ── Timer helpers ──────────────────────────────────────────────────────────

  /**
   * Paint the timer label + fill bar per INTEGRATION_SPEC §6 and Print 17.
   *
   *   > 10s  → normal   (state.success   — green)
   *   5..10s → warning  (state.warn      — amber)
   *   ≤ 5s   → critical (state.warnCritical — red, label pulses via Sine.InOut)
   *
   * Uses `MM:SS` tabular format in JetBrains Mono so digits don't jitter as
   * the value ticks down.
   */
  private _updateTimerDisplay(): void {
    const s = this._timerSecs

    let labelHex: string
    let fillColor: number
    let critical: boolean
    if (s > 10) {
      labelHex = dsState.successHex
      fillColor = dsState.success
      critical = false
    } else if (s > 5) {
      labelHex = dsState.warnHex
      fillColor = dsState.warn
      critical = false
    } else {
      labelHex = dsState.errorHex
      fillColor = dsState.warnCritical
      critical = true
    }

    const mins = Math.floor(s / 60)
    const secs = s % 60
    const timeLabel = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    this._timerText.setText(timeLabel).setColor(labelHex)

    // Critical pulse — start/stop the Sine yoyo depending on threshold.
    if (critical && !this._timerPulseTween) {
      this._timerPulseTween = this.tweens.add({
        targets: this._timerText,
        alpha: { from: 1, to: 0.55 },
        duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      })
    } else if (!critical && this._timerPulseTween) {
      this._timerPulseTween.stop()
      this._timerPulseTween = null
      this._timerText.setAlpha(1)
    }

    if (this._timerBar && this._timerTotal > 0) {
      const ratio = s / this._timerTotal
      const barW = this._timerBarW > 0 ? this._timerBarW : W
      this._timerBar.setDisplaySize(barW * Math.max(0, Math.min(1, ratio)), 4).setAlpha(1)
      this._timerBar.setFillStyle(fillColor)
    }
  }

  private _clearTimer(): void {
    if (this._timerEvent) {
      this._timerEvent.destroy()
      this._timerEvent = null
    }
    if (this._timerPulseTween) {
      this._timerPulseTween.stop()
      this._timerPulseTween = null
    }
    this._timerSecs = 0
    this._timerText.setText('').setAlpha(1)
    if (this._timerBar) this._timerBar.setAlpha(0)
  }

  private _showVictoryOverlay(winText: string, reason: string, round: number) {
    const reasonKey = `scenes.battle.victory-overlay.reasons.${reason}`
    const reasonLookup = t(reasonKey)
    const reasonText = reasonLookup === reasonKey ? reason : reasonLookup
    const isForfeit = reason === 'forfeit'
    const stk = { stroke: '#000000', strokeThickness: 3 }

    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(20)
    this.add.rectangle(W / 2, H / 2, 560, 260, 0x101827).setDepth(21).setStrokeStyle(2, 0x334155)

    this.add.text(W / 2, H / 2 - 64, winText, {
      fontFamily: fontFamily.display, fontSize: '36px', color: '#f8e7b9', fontStyle: 'bold', ...stk,
    }).setOrigin(0.5).setDepth(22)

    // Show forfeit detail if applicable
    const detailText = isForfeit
      ? t('scenes.battle.victory-overlay.detail-forfeit', { reason: reasonText })
      : t('scenes.battle.victory-overlay.detail-normal', { reason: reasonText, round })

    this.add.text(W / 2, H / 2 - 10, detailText, {
      fontFamily: fontFamily.body, fontSize: '16px', color: isForfeit ? '#ffaa44' : '#94a3b8', ...stk,
    }).setOrigin(0.5).setDepth(22)

    const btn = this.add.rectangle(W / 2, H / 2 + 64, 240, 48, 0x1e293b)
      .setStrokeStyle(2, 0x475569).setInteractive({ useHandCursor: true }).setDepth(22)
    const label = this.add.text(W / 2, H / 2 + 64, t('scenes.battle.actions.main-menu'), {
      fontFamily: fontFamily.body, fontSize: '17px', color: '#94a3b8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(23)

    btn.on('pointerover', () => { btn.setFillStyle(0x263548); label.setColor('#f1f5f9') })
    btn.on('pointerout',  () => { btn.setFillStyle(0x1e293b); label.setColor('#94a3b8') })
    // Back to the real main hub — Lobby. The old MenuScene "JOGAR" splash is
    // no longer part of the flow (Boot → Login → Lobby directly).
    btn.on('pointerdown', () => transitionTo(this, 'LobbyScene'))
  }

  // ── Training dummy sprite ─────────────────────────────────────────────────────

  private _drawDummySprite(size: number): Phaser.GameObjects.Container {
    const half = size / 2
    const g = this.add.graphics()

    // Wooden target dummy body (rounded rectangle)
    g.fillStyle(0x8B6914, 0.9)
    g.fillRoundedRect(-half + 4, -half + 4, size - 8, size - 8, 6)
    // Darker wood border
    g.lineStyle(2, 0x5a4510, 0.8)
    g.strokeRoundedRect(-half + 4, -half + 4, size - 8, size - 8, 6)

    // Cross-hair target pattern
    g.lineStyle(2, 0xcc3333, 0.6)
    // Outer circle
    g.strokeCircle(0, -2, half * 0.55)
    // Inner circle
    g.strokeCircle(0, -2, half * 0.3)
    // Center dot
    g.fillStyle(0xcc3333, 0.7)
    g.fillCircle(0, -2, 3)

    // Horizontal + vertical crosshairs
    g.lineStyle(1.5, 0xcc3333, 0.4)
    g.lineBetween(-half * 0.55, -2, half * 0.55, -2)
    g.lineBetween(0, -2 - half * 0.55, 0, -2 + half * 0.55)

    // Wood grain lines (subtle)
    g.lineStyle(1, 0x6a5510, 0.3)
    g.lineBetween(-half + 8, half - 10, half - 8, half - 10)
    g.lineBetween(-half + 10, half - 14, half - 10, half - 14)

    return this.add.container(0, 0, [g])
  }

  // ── Training mode: dummy reset ────────────────────────────────────────────────

  private _resetTrainingDummies(): void {
    for (const u of RIGHT_UNITS) {
      const char = this._ctrl.getCharacter(u.id)
      if (!char) continue

      // Heal to full
      char.heal(char.maxHp)
      // Clear all effects
      char.removeEffectsByKind('debuff')
      char.removeEffectsByKind('buff')
      char.resetStats()
      // Reset position to original (dummies start 2 tiles closer)
      char.moveTo(u.col - 2, u.row)

      // Update visuals
      const sprite = this._sprite(u.id)
      if (sprite) {
        // Reset HP bar
        const barW = CHAR_SIZE + 4
        sprite.hpBar.setDisplaySize(barW, 8).setFillStyle(hpStatusColor(1).fill)
        // Reset shield bar
        sprite.shieldBar.setDisplaySize(0, 8)
        // Move sprite back to original position (dummies are 2 tiles closer)
        const { x, y } = _tileCenter(u.col - 2, u.row)
        sprite.container.setPosition(x, y).setAlpha(1)
        // Clear status dots
        sprite.statusDots.removeAll(true)
      }
      // Clear status tracking
      const statuses = this._unitStatuses.get(u.id)
      if (statuses) statuses.clear()
      this._rebuildStatusPanel(u.id)
    }
    this._refreshStatusPanels()
  }

  // ── Surrender button ─────────────────────────────────────────────────────────

  private _buildTrainingBackButton(): void {
    // Top-bar back link: Ghost button (INTEGRATION_SPEC §1.3) with Lucide
    // arrow-left icon replacing the ← unicode glyph.
    const btnX = GRID_X + 108
    const btnY = TOP_BAR_H2 / 2
    const { container } = UI.buttonGhost(this, btnX, btnY, '  ' + t('common.actions.back-titled'), {
      w: 92, h: 24, depth: 9,
      onPress: () => transitionTo(this, 'LobbyScene'),
    })
    // Lucide arrow-left icon overlay (left of label, tinted tertiary-fg).
    const icon = UI.lucideIcon(this, 'arrow-left', -32, 0, 14, fg.tertiary)
    container.add(icon)
    container.setDepth(9)
  }

  private _buildSurrenderButton(): void {
    // Top-bar surrender: Destructive variant (INTEGRATION_SPEC §1.4 — red fill,
    // dark red border). Anchored to the right of the team label so it clears
    // "AZUL / Voce" without overlapping. In duo/squad modes, a small vote-
    // counter chip sits to the right of the button.
    const isSolo = this._surrenderRequired === 1
    const btnW = isSolo ? 92 : 108
    const btnH = 24
    const btnX = GRID_X + (isSolo ? 132 : 152)
    const btnY = TOP_BAR_H2 / 2

    const onClick = () => {
      if (isSolo) {
        this._showConfirmPopup(t('scenes.battle.popup.surrender-title'), '', 0, () => {
          this._ctrl.forfeit(this._playerSide as 'left' | 'right')
        }, {
          eyebrow: t('scenes.battle.popup.confirmation-eyebrow'),
          body: t('scenes.battle.popup.surrender-body-solo'),
          confirmLabel: t('scenes.battle.popup.surrender-confirm'),
          destructive: true,
        })
      } else {
        this._showConfirmPopup(t('scenes.battle.popup.surrender-vote-title'), '', 0, () => {
          this._surrenderVotes++
          if (this._surrenderCountText) {
            this._surrenderCountText.setText(`${this._surrenderVotes}/${this._surrenderRequired}`)
            this._surrenderCountText.setColor(this._surrenderVotes >= this._surrenderRequired
              ? dsState.errorHex : fg.tertiaryHex)
          }
          if (this._surrenderVotes >= this._surrenderRequired) {
            this._ctrl.forfeit(this._playerSide as 'left' | 'right')
          }
        }, {
          eyebrow: t('scenes.battle.popup.vote-eyebrow'),
          body: t('scenes.battle.popup.surrender-vote-body', { required: this._surrenderRequired }),
          confirmLabel: t('scenes.battle.popup.surrender-vote-button'),
          destructive: true,
        })
      }
    }

    const { container } = UI.buttonDestructive(this, btnX, btnY, t('scenes.battle.popup.surrender-button-label'), {
      w: btnW, h: btnH, depth: 9,
      onPress: onClick,
    })
    // Lucide flag icon overlay (left of label, tinted inverse for contrast).
    const flag = UI.lucideIcon(this, 'flag', -btnW / 2 + 14, 0, 12, fg.primary)
    container.add(flag)
    container.setDepth(9)

    if (!isSolo) {
      // Vote counter chip to the right of the destructive button.
      this._surrenderCountText = this.add.text(
        btnX + btnW / 2 + 10, btnY,
        `${this._surrenderVotes}/${this._surrenderRequired}`,
        {
          fontFamily: fontFamily.mono, fontSize: typeScale.meta,
          color: fg.tertiaryHex, fontStyle: 'bold',
        },
      ).setOrigin(0, 0.5).setDepth(9)
    }
  }

  // ── Confirmation modal ────────────────────────────────────────────────────
  //
  // Delegates to UI.modal (INTEGRATION_SPEC §10 + Print 14). Callers pass the
  // semantic content (eyebrow, title, body) plus the confirm action; legacy
  // (title, titleColor, borderColor, onConfirm) signature is preserved as a
  // thin shim so the surrender/skip/commit sites don't have to re-order their
  // arguments in this sub-etapa. The three old color args are ignored — the
  // modal colors come from UI.buttonPrimary/Destructive/Secondary styling.

  private _activeConfirmModal: { close: () => void } | null = null

  private _showConfirmPopup(
    title: string,
    _titleColor: string,       // deprecated — kept for back-compat
    _borderColor: number,       // deprecated — kept for back-compat
    onConfirm: () => void,
    extra?: {
      eyebrow?: string;
      body?: string;
      confirmLabel?: string;
      destructive?: boolean;
    },
  ): void {
    if (this._activeConfirmModal) return
    this._activeConfirmModal = UI.modal(this, {
      eyebrow: extra?.eyebrow ?? t('scenes.battle.popup.confirmation-eyebrow'),
      title,
      body: extra?.body,
      actions: [
        { label: t('scenes.battle.actions.cancel'), kind: 'secondary', onClick: () => { /* noop — close handled */ } },
        {
          label: extra?.confirmLabel ?? t('scenes.battle.actions.confirm'),
          kind: extra?.destructive ? 'destructive' : 'primary',
          onClick: onConfirm,
        },
      ],
    }, {
      onClose: () => { this._activeConfirmModal = null },
    })
  }

  private _closeConfirmPopup(): void {
    this._activeConfirmModal?.close()
    this._activeConfirmModal = null
  }

  private _showSkipConfirm(): void {
    this._showConfirmPopup(t('scenes.battle.popup.skip-title'), '', 0, () => {
      if (this._currentActorId) {
        // Clear any selected skills before skipping
        this._ctrl.clearSelection(this._currentActorId)
        this._ctrl.skipTurn('no_selection')
      }
    }, {
      eyebrow: t('scenes.battle.popup.warning-eyebrow'),
      body: t('scenes.battle.popup.skip-body'),
      confirmLabel: t('scenes.battle.popup.skip-confirm'),
    })
  }

  private _showCommitConfirm(): void {
    this._showConfirmPopup(t('scenes.battle.popup.confirm-action-title'), '', 0, () => {
      if (this._selReady) {
        this._ctrl.commitTurn()
      }
    }, {
      eyebrow: t('scenes.battle.popup.confirmation-eyebrow'),
      body: t('scenes.battle.popup.confirm-action-body'),
      confirmLabel: t('scenes.battle.actions.confirm'),
    })
  }

  // ── Status panel updates ─────────────────────────────────────────────────────

  /**
   * Refresh ATK/DEF/MOV stat texts and the wall-touch buff line in every
   * character's status panel. Reads live values from the controller.
   *
   * Called whenever:
   *   - A phase starts (PHASE_STARTED)
   *   - Actions resolve   (ACTIONS_RESOLVED)
   *   - A unit moves      (CHARACTER_MOVED) — wall buff is position-dependent
   *   - A status effect changes (effect added / removed / cleared)
   */
  /**
   * Redraw the HP bar fill + HP number + shield stripe overlay for one unit.
   * Extracted so damage/heal/shield events can update the panel without a
   * full card rebuild.
   */
  private _refreshStatusPanelHp(unitId: string): void {
    const hp = this._statusHpElems.get(unitId)
    if (!hp) return
    const char = this._ctrl.getCharacter(unitId)
    if (!char) return

    const ratio    = Phaser.Math.Clamp(char.hp / char.maxHp, 0, 1)
    const hpStyle  = hpStatusColor(ratio)
    const shieldAmt = char.totalShield

    // HP number
    hp.hpText.setText(`${char.hp}/${char.maxHp}`).setColor(hpStyle.fillHex)

    // HP bar fill — rounded pill with wounded/critical/full color per ratio
    hp.hpBarFill.clear()
    const fillW = Math.max(2, hp.barW * ratio)
    hp.hpBarFill.fillStyle(hpStyle.fill, 0.95)
    hp.hpBarFill.fillRoundedRect(hp.barX, hp.barY, fillW, hp.barH, hp.barH / 2)
    // Inner top highlight for polish
    hp.hpBarFill.fillStyle(dsColors.ui.white, 0.08)
    hp.hpBarFill.fillRoundedRect(hp.barX + 1, hp.barY + 1, Math.max(0, fillW - 2), 2,
      { tl: hp.barH / 2, tr: hp.barH / 2, bl: 0, br: 0 })

    // Shield overlay — diagonal stripes on the right-edge portion of the bar.
    hp.shieldStripes.clear()
    if (shieldAmt > 0 && char.maxHp > 0) {
      const shieldRatio = Math.min(shieldAmt / char.maxHp, ratio)
      const overlayW = Math.max(2, hp.barW * shieldRatio)
      const overlayX = hp.barX + Math.max(0, fillW - overlayW)

      // Base wash + stripes clipped to the overlay rect
      hp.shieldStripes.fillStyle(hpState.shield, 0.40)
      hp.shieldStripes.fillRoundedRect(overlayX, hp.barY, overlayW, hp.barH, hp.barH / 2)

      // Diagonal hatch lines — low-cost Graphics primitive
      const startX = overlayX - hp.barH
      const endX   = overlayX + overlayW + hp.barH
      hp.shieldStripes.lineStyle(1.5, hpState.shield, 0.55)
      for (let sx = startX; sx < endX; sx += 5) {
        hp.shieldStripes.beginPath()
        hp.shieldStripes.moveTo(sx, hp.barY + hp.barH)
        hp.shieldStripes.lineTo(sx + hp.barH, hp.barY)
        hp.shieldStripes.strokePath()
      }

      hp.shieldLabel.setText(t('scenes.battle.status.shield-suffix', { amount: shieldAmt })).setVisible(true)
    } else {
      hp.shieldLabel.setVisible(false)
    }
  }

  private _refreshStatusPanels(): void {
    // ── HP + shield (per-unit, rebuilt on every event that touches either) ──
    for (const unitId of this._statusHpElems.keys()) {
      this._refreshStatusPanelHp(unitId)
    }

    // ── ATK / DEF / MOV deltas (per-character entity stats) ─────────────────
    for (const [unitId, texts] of this._statusStatTexts) {
      const char = this._ctrl.getCharacter(unitId)
      if (!char) continue
      const updateStat = (t: Phaser.GameObjects.Text, current: number, base: number) => {
        const delta = current - base
        const color = delta > 0 ? dsState.successHex : delta < 0 ? dsState.errorHex : fg.disabledHex
        const txt   = delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : '0'
        t.setText(txt).setColor(color)
      }
      updateStat(texts.atk, char.attack,   char.baseStats.attack)
      updateStat(texts.def, char.defense,  char.baseStats.defense)
      updateStat(texts.mov, char.mobility, char.baseStats.mobility)
    }

    // ── Wall-touch buff line (team-wide global rule) ────────────────────────
    // Polls CombatRuleSystem via the controller. The bonus is computed
    // on-the-fly during damage resolution and never written back to
    // char.attack/defense, so we have to surface it as its own line.
    const wallSnap = this._ctrl.getWallBuffSnapshot()
    for (const [unitId, text] of this._statusWallTexts) {
      const char = this._ctrl.getCharacter(unitId)
      if (!char) { text.setVisible(false); continue }
      const buff = wallSnap.get(char.side)
      if (!buff || buff.count <= 0) {
        text.setVisible(false)
        continue
      }
      const pct = Math.round(buff.atkBonus * 100)
      text.setText(t('scenes.battle.status.wall-bonus', { pct })).setVisible(true)
    }
  }

  private _highlightedStatusId: string | null = null

  /** Highlight a character's status card and arena sprite. */
  private _highlightStatusCard(unitId: string | null): void {
    const redrawBase = (id: string) => {
      const bg = this._statusCardBgs.get(id)
      const b = this._statusCardBounds.get(id)
      if (!bg || !b) return
      bg.clear()
      bg.fillStyle(surface.panel, 0.96)
      bg.fillRoundedRect(b.x, b.y, b.w, b.h, radii.md)
      bg.lineStyle(1, border.default, 0.7)
      bg.strokeRoundedRect(b.x, b.y, b.w, b.h, radii.md)
      bg.fillStyle(b.teamColor, 0.45)
      bg.fillRoundedRect(b.x, b.y, b.w, 2, { tl: radii.md, tr: radii.md, bl: 0, br: 0 })
    }

    // Clear previous highlight
    if (this._highlightedStatusId) redrawBase(this._highlightedStatusId)

    this._highlightedStatusId = unitId
    if (!unitId) return

    // Draw highlight on new card — gold accent frame per §1 focus state
    const bg = this._statusCardBgs.get(unitId)
    const b = this._statusCardBounds.get(unitId)
    if (bg && b) {
      bg.clear()
      // Raised fill
      bg.fillStyle(surface.raised, 0.98)
      bg.fillRoundedRect(b.x, b.y, b.w, b.h, radii.md)
      // Gold focus ring
      bg.lineStyle(2, accent.primary, 0.95)
      bg.strokeRoundedRect(b.x, b.y, b.w, b.h, radii.md)
      // Team color stays as top stripe so side identity persists
      bg.fillStyle(b.teamColor, 0.9)
      bg.fillRoundedRect(b.x, b.y, b.w, 2, { tl: radii.md, tr: radii.md, bl: 0, br: 0 })
    }
  }

  /** Rebuild the status effects chip grid in a unit's bottom status panel. */
  private _rebuildStatusPanel(unitId: string): void {
    const info = this._statusEffectContainers.get(unitId)
    if (!info) return
    const { container, lx, rx, startY, availH } = info
    container.removeAll(true)

    const statuses = this._unitStatuses.get(unitId) ?? new Set<string>()
    const innerW = rx - lx

    // ── Chip catalog: label, polarity → border color ──
    type Polarity = 'buff' | 'debuff' | 'neutral'
    const STATUS_LIST: Array<{ key: string; label: string; polarity: Polarity }> = [
      { key: 'stun',            label: 'ST',  polarity: 'debuff'  },
      { key: 'snare',           label: 'SN',  polarity: 'debuff'  },
      { key: 'silence_defense', label: 'SD',  polarity: 'debuff'  },
      { key: 'heal_reduction',  label: 'H-',  polarity: 'debuff'  },
      { key: 'poison',          label: 'PO',  polarity: 'debuff'  },
      { key: 'bleed',           label: 'BL',  polarity: 'debuff'  },
      { key: 'burn',            label: 'BU',  polarity: 'debuff'  },
      { key: 'atk_down',        label: 'A-',  polarity: 'debuff'  },
      { key: 'def_down',        label: 'D-',  polarity: 'debuff'  },
      { key: 'mov_down',        label: 'M-',  polarity: 'debuff'  },
      { key: 'atk_up',          label: 'A+',  polarity: 'buff'    },
      { key: 'def_up',          label: 'D+',  polarity: 'buff'    },
      { key: 'regen',           label: 'RE',  polarity: 'buff'    },
      { key: 'reflect',         label: 'RF',  polarity: 'buff'    },
      { key: 'evade',           label: 'EV',  polarity: 'buff'    },
      { key: 'shield',          label: 'SH',  polarity: 'neutral' },
    ]

    const BORDER_BY_POLARITY: Record<Polarity, number> = {
      buff:    dsState.success,
      debuff:  dsState.error,
      neutral: hpState.shield,
    }
    const HEX_BY_POLARITY: Record<Polarity, string> = {
      buff:    dsState.successHex,
      debuff:  dsState.errorHex,
      neutral: hpState.shieldHex,
    }

    const CHIP_W  = 26
    const CHIP_H  = 18
    const CHIP_GAP = 4
    const chipsPerRow = Math.max(1, Math.floor((innerW + CHIP_GAP) / (CHIP_W + CHIP_GAP)))
    const maxRows = Math.max(1, Math.floor((availH + CHIP_GAP) / (CHIP_H + CHIP_GAP)))
    const maxChips = chipsPerRow * maxRows

    const active = STATUS_LIST.filter((s) => statuses.has(s.key)).slice(0, maxChips)

    active.forEach((s, i) => {
      const col = i % chipsPerRow
      const row = Math.floor(i / chipsPerRow)
      const cx = lx + col * (CHIP_W + CHIP_GAP)
      const cy = startY + row * (CHIP_H + CHIP_GAP)
      const borderColor = BORDER_BY_POLARITY[s.polarity]
      const hexColor    = HEX_BY_POLARITY[s.polarity]

      const chipG = this.add.graphics().setDepth(6)
      chipG.fillStyle(surface.raised, 0.85)
      chipG.fillRoundedRect(cx, cy, CHIP_W, CHIP_H, radii.sm)
      chipG.lineStyle(1, borderColor, 0.9)
      chipG.strokeRoundedRect(cx, cy, CHIP_W, CHIP_H, radii.sm)
      container.add(chipG)

      const label = this.add.text(cx + CHIP_W / 2, cy + CHIP_H / 2, s.label, {
        fontFamily: fontFamily.mono, fontSize: typeScale.meta,
        color: hexColor, fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(6)
      container.add(label)
    })
  }

  // ── Staggered resolution ─────────────────────────────────────────────────────

  /** Resolve one step at a time with delays between attack → defense → next character. */
  private _resolveNextWithDelay(): void {
    const ATK_DELAY = 800   // ms after attack before defense
    const CHAR_DELAY = 600  // ms after defense before next character

    const result = this._ctrl.resolveNextDeferred()

    // Update mini log: mark any entry that got icons as done
    for (const ml of this._miniLogEntries) {
      if (ml.done) continue
      if (ml.atkIcon || ml.defIcon) {
        // Only mark fully done after defense resolves (or if no defense)
        if (result === 'defense' || result === 'done') {
          ml.done = true
          if (!ml.atkIcon) ml.atkSkip = true
          if (!ml.defIcon) ml.defSkip = true
        }
        break
      }
    }
    this._renderMiniLog()

    if (result === 'attack') {
      // Attack just resolved — wait, then resolve defense
      this.time.delayedCall(ATK_DELAY, () => this._resolveNextWithDelay())
    } else if (result === 'defense') {
      // Defense just resolved — wait, then next character
      this.time.delayedCall(CHAR_DELAY, () => this._resolveNextWithDelay())
    } else {
      // Done — finalize remaining mini log entries
      for (const ml of this._miniLogEntries) {
        if (!ml.done) {
          ml.done = true
          if (!ml.atkIcon) ml.atkSkip = true
          if (!ml.defIcon) ml.defSkip = true
        }
      }
      this._renderMiniLog()
    }
  }

  // ── Log ─────────────────────────────────────────────────────────────────────

  private _addLog(msg: string, type: 'system' | 'damage' | 'heal' | 'death' | 'skill' | 'phase' = 'system') {
    const LOG_COLORS: Record<string, string> = {
      system: '#64748b',
      damage: '#ef5350',
      heal:   '#4caf50',
      death:  '#ff8888',
      skill:  '#c9a84c',
      phase:  '#4fc3f7',
    }
    this._logMsgs.push({ msg, type })
    if (this._logMsgs.length > this._logLines.length) this._logMsgs.shift()
    const last = this._logLines.length - 1
    this._logLines.forEach((line, i) => {
      const entry = this._logMsgs[i]
      if (entry) {
        line.setText(entry.msg)
          .setColor(LOG_COLORS[entry.type] ?? '#64748b')
          .setAlpha(last > 0 ? 0.4 + (i / last) * 0.6 : 1)
      } else {
        line.setText('').setAlpha(0)
      }
    })
  }

  // ── Mini Log (compact turn order + skill icons) ─────────────────────────────

  /** Build the full turn order for the current round (mirrors CombatEngine logic). */
  private _buildMiniLogOrder(): Array<{ unitId: string; name: string; side: string; atkIcon: boolean; defIcon: boolean; atkSkip: boolean; defSkip: boolean; done: boolean }> {
    const round = this._currentRound
    const findAlive = (units: UnitSetup[], role: string) => {
      const u = units.find(x => x.role === role)
      if (!u) return null
      const ch = this._ctrl.getCharacter(u.id)
      return ch?.alive ? u : null
    }
    // Odd rounds: left first. Even rounds: right first.
    const t1 = round % 2 === 1 ? LEFT_UNITS : RIGHT_UNITS
    const t2 = round % 2 === 1 ? RIGHT_UNITS : LEFT_UNITS
    const s1 = round % 2 === 1 ? 'left' : 'right'
    const s2 = round % 2 === 1 ? 'right' : 'left'

    const ordered: Array<{ u: UnitSetup; side: string } | null> = [
      findAlive(t1, 'king')       ? { u: findAlive(t1, 'king')!,       side: s1 } : null,
      findAlive(t2, 'king')       ? { u: findAlive(t2, 'king')!,       side: s2 } : null,
      findAlive(t2, 'warrior')    ? { u: findAlive(t2, 'warrior')!,    side: s2 } : null,
      findAlive(t1, 'warrior')    ? { u: findAlive(t1, 'warrior')!,    side: s1 } : null,
      findAlive(t1, 'executor')   ? { u: findAlive(t1, 'executor')!,   side: s1 } : null,
      findAlive(t2, 'executor')   ? { u: findAlive(t2, 'executor')!,   side: s2 } : null,
      findAlive(t2, 'specialist') ? { u: findAlive(t2, 'specialist')!, side: s2 } : null,
      findAlive(t1, 'specialist') ? { u: findAlive(t1, 'specialist')!, side: s1 } : null,
    ]

    return ordered
      .filter((x): x is { u: UnitSetup; side: string } => x !== null)
      .map(({ u, side }) => {
        const ch = this._ctrl.getCharacter(u.id)
        const abbr = roleAbbr(u.role)
        const playerName = ch?.name ?? u.name
        return {
          unitId: u.id,
          name: `${abbr} (${playerName})`,
          side,
          atkIcon: false,
          defIcon: false,
          atkSkip: false,
          defSkip: false,
          done: false,
        }
      })
  }

  private _renderMiniLog() {
    // Destroy previous entries
    for (const obj of this._miniLogObjs) obj.destroy()
    this._miniLogObjs = []
    if (!this._miniLogContainer) return

    // Update round text
    if (this._miniLogRoundText) {
      this._miniLogRoundText.setText(this._miniLogRound > 0 ? t('scenes.battle.round-heading', { round: this._miniLogRound }) : '')
    }

    const stk = { stroke: '#000000', strokeThickness: 2 }
    const startY = this._miniLogY + 38
    // Available height: from startY to HISTORICO button (28px from bottom)
    const availH = (H - 4) - startY - 30
    const entries = this._miniLogEntries
    const lineH = Math.min(20, Math.floor(availH / Math.max(entries.length, 1)))

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      const y = startY + i * lineH
      const sideColor = e.side === 'left' ? '#00ccaa' : '#8844cc'

      // Separator line between entries
      if (i > 0) {
        const sepG = this.add.graphics().setDepth(5)
        sepG.fillStyle(0x334455, 0.2)
        sepG.fillRect(10, y - 1, this._miniLogW - 12, 1)
        this._miniLogObjs.push(sepG)
        this._miniLogContainer.add(sepG)
      }

      // Order number
      const numText = this.add.text(10, y, `${i + 1}.`, {
        fontFamily: fontFamily.display, fontSize: '13px', color: '#5a6a7a', ...stk,
      }).setDepth(5)
      this._miniLogObjs.push(numText)
      this._miniLogContainer.add(numText)

      // Name
      const nameText = this.add.text(28, y, e.name, {
        fontFamily: fontFamily.body, fontSize: '13px', color: sideColor, fontStyle: 'bold', ...stk,
      }).setDepth(5)
      this._miniLogObjs.push(nameText)
      this._miniLogContainer.add(nameText)

      // Skill icons (right-aligned): ⚔/🛡 for used, X for skipped, · · · for waiting
      let rx = this._miniLogW - 2
      if (e.done || e.atkIcon || e.atkSkip || e.defIcon || e.defSkip) {
        // Attack icon
        const atkStr = e.atkIcon ? '⚔' : e.atkSkip ? '✕' : ''
        const atkCol = e.atkIcon ? '#c9a84c' : '#cc3333'
        if (atkStr) {
          const atkT = this.add.text(rx, y, atkStr, {
            fontFamily: fontFamily.display, fontSize: '14px', color: atkCol, ...stk,
          }).setOrigin(1, 0).setDepth(5)
          this._miniLogObjs.push(atkT)
          this._miniLogContainer.add(atkT)
          rx -= atkT.width + 4
        }
        // Defense icon
        const defStr = e.defIcon ? '🛡' : e.defSkip ? '✕' : ''
        const defCol = e.defIcon ? '#c9a84c' : '#cc3333'
        if (defStr) {
          const defT = this.add.text(rx, y, defStr, {
            fontFamily: fontFamily.display, fontSize: '14px', color: defCol, ...stk,
          }).setOrigin(1, 0).setDepth(5)
          this._miniLogObjs.push(defT)
          this._miniLogContainer.add(defT)
        }
      } else {
        const waitText = this.add.text(rx, y, t('scenes.battle.tracker.wait-indicator'), {
          fontFamily: fontFamily.body, fontSize: '13px', color: '#2a3a4a', ...stk,
        }).setOrigin(1, 0).setDepth(5)
        this._miniLogObjs.push(waitText)
        this._miniLogContainer.add(waitText)
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private _sprite(id: string): UnitSprite | undefined {
    return this._sprites.get(id)
  }

  private _name(id: string): string {
    const char = this._ctrl.getCharacter(id)
    if (!char) return id
    const roleName = roleFull(char.role)
    return `${roleName} (${char.name})`
  }
}

// ── Module helpers (no Phaser, no engine — pure data conversion) ──────────────

/** Human-readable label for a skill effect type, used on card buttons. */
/** @internal kept for potential future use */
export function _effectLabel(effectType: string): string {
  const value = t(`common.skill-card.effect-labels.${effectType}`)
  return value === `common.skill-card.effect-labels.${effectType}` ? effectType : value
}

function _tileCenter(col: number, row: number): { x: number; y: number } {
  return { x: GRID_X + col * TILE + TILE / 2, y: GRID_Y + row * TILE + TILE / 2 }
}

function _scaleStats(
  base: typeof ROLE_STATS[UnitRole],
  difficulty: string,
): { maxHp: number; attack: number; defense: number; mobility: number } {
  const mult = difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.4 : 1.0
  return {
    maxHp:    Math.round(base.maxHp * mult),
    attack:   Math.round(base.attack * mult),
    defense:  Math.round(base.defense * mult),
    mobility: base.mobility,  // don't scale mobility
  }
}

function _buildController(
  deckConfig?: Record<UnitRole, UnitDeckConfig>,
  difficulty: string = 'normal',
  trainingMode: boolean = false,
  playerSide: 'left' | 'right' = 'left',
): GameController {
  const registry = new SkillRegistry(SKILL_CATALOG)

  const fromAssignment = (key: string) => {
    const a = DECK_ASSIGNMENTS[key]
    if (!a) throw new Error(`No deck assignment for "${key}"`)
    return registry.buildDeckConfig([...a.attackIds], [...a.defenseIds])
  }
  const fromConfig = (cfg: UnitDeckConfig) =>
    registry.buildDeckConfig(cfg.attackCards, cfg.defenseCards)

  const leftChars = LEFT_UNITS.map((u) =>
    new Character(u.id, u.name, u.role, 'left', u.col, u.row, ROLE_STATS[u.role]))

  // Training mode: dummies use same stats as left side (matched by role)
  // Sub 9.7: dummy names no longer interpolate the role abbreviation —
  // the colored class icon (crown / shield / sword / leaf) to the left of
  // the name in the unit-status panel already conveys the role, and the
  // longer "Boneco REI" / "Boneco GUE" labels were getting clipped on
  // narrow status cards in DE/RU translations.
  const rightStats = trainingMode ? ROLE_STATS : undefined
  const dummyName = t('scenes.battle.dummy-name')
  const DUMMY_NAMES: Record<string, string> = {
    king: dummyName,
    warrior: dummyName,
    executor: dummyName,
    specialist: dummyName,
  }
  const rightChars = RIGHT_UNITS.map((u) => {
    const stats = rightStats ? rightStats[u.role] : _scaleStats(ROLE_STATS[u.role], difficulty)
    const col = trainingMode ? u.col - 2 : u.col  // dummies 2 tiles closer
    const ch = new Character(u.id, trainingMode ? (DUMMY_NAMES[u.role] ?? 'Dummy') : u.name, u.role, 'right', col, u.row, stats)
    if (trainingMode) ch.setDummy(true)
    return ch
  })

  // Apply player's deck to the correct side
  const playerDeck = (role: UnitRole, side: 'left' | 'right') => {
    const prefix = side === 'left' ? 'l' : 'r'
    if (playerSide === side && deckConfig?.[role]) return fromConfig(deckConfig[role])
    return fromAssignment(`${prefix}${role === 'king' ? 'king' : role === 'warrior' ? 'warrior' : role === 'specialist' ? 'specialist' : 'executor'}`)
  }

  const leftTeam = new Team('left', leftChars, {
    king:       playerDeck('king', 'left'),
    warrior:    playerDeck('warrior', 'left'),
    specialist: playerDeck('specialist', 'left'),
    executor:   playerDeck('executor', 'left'),
  })

  const rightTeam = new Team('right', rightChars, {
    king:       playerDeck('king', 'right'),
    warrior:    playerDeck('warrior', 'right'),
    specialist: playerDeck('specialist', 'right'),
    executor:   playerDeck('executor', 'right'),
  })

  return GameController.create({
    battle:      new Battle({ leftTeam, rightTeam }),
    registry,
    passives:    PASSIVE_CATALOG,
    globalRules: GLOBAL_RULES,
    phaseDurations: trainingMode ? { movement: 0, action: 0 } : undefined,
  })
}
