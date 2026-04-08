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
import { GameController }     from '../engine/GameController'
import { PhaserBridge }       from '../engine/PhaserBridge'
import { AutoPlayer }         from '../engine/AutoPlayer'
import { BattleDriver }       from '../engine/BattleDriver'
import { SKILL_CATALOG }      from '../data/skillCatalog'
import { DECK_ASSIGNMENTS }   from '../data/deckAssignments'
import { PASSIVE_CATALOG }    from '../data/passiveCatalog'
import { GLOBAL_RULES }       from '../data/globalRules'
import { GameState, GameStateManager } from '../core/GameState'
import type { UnitDeckConfig, UnitRole } from '../types'

// ── Layout constants ──────────────────────────────────────────────────────────

const W         = 1280
const H         = 720
const TILE      = 64
const COLS      = 16
const ROWS      = 6
const GRID_X    = (W - COLS * TILE) / 2   // 128
const GRID_Y    = 72
const CHAR_SIZE = 48

// ── Player panel layout ───────────────────────────────────────────────────────

const PANEL_Y    = 594   // top edge of skill panel strip
const PANEL_H    = 126   // height (594–720)
const CARD_W     = 136   // card button width
const CARD_H     = 48    // card button height
const CARD_GAP   = 8     // gap between sibling cards
const ATK_ROW_Y  = PANEL_Y + 28   // y-center of attack card row
const DEF_ROW_Y  = PANEL_Y + 86   // y-center of defense card row
const CARDS_X    = GRID_X + 6     // left edge of first card
const BTN_X      = W - 96         // x-center of confirm/cancel buttons
const CONFIRM_Y  = PANEL_Y + 30   // y-center of Confirm button
const CANCEL_Y   = PANEL_Y + 80   // y-center of Cancel button
const BTN_W      = 108
const BTN_H      = 38

// ── Unit setup ────────────────────────────────────────────────────────────────

type UnitSetup = { id: string; name: string; role: UnitRole; col: number; row: number }

const LEFT_UNITS: UnitSetup[] = [
  { id: 'lking',       name: 'Leo',   role: 'king',       col: 1,  row: 2 },
  { id: 'lwarrior',    name: 'Wren',  role: 'warrior',    col: 2,  row: 4 },
  { id: 'lspecialist', name: 'Sage',  role: 'specialist', col: 0,  row: 5 },
  { id: 'lexecutor',   name: 'Edge',  role: 'executor',   col: 3,  row: 1 },
]
const RIGHT_UNITS: UnitSetup[] = [
  { id: 'rking',       name: 'Rex',   role: 'king',       col: 14, row: 3 },
  { id: 'rwarrior',    name: 'Reva',  role: 'warrior',    col: 13, row: 1 },
  { id: 'rspecialist', name: 'Sable', role: 'specialist', col: 15, row: 0 },
  { id: 'rexecutor',   name: 'Echo',  role: 'executor',   col: 12, row: 4 },
]

const ROLE_STATS: Record<UnitRole, { maxHp: number; attack: number; defense: number; mobility: number }> = {
  king:       { maxHp: 112, attack: 18, defense: 10, mobility: 99 },
  warrior:    { maxHp: 138, attack: 17, defense: 16, mobility: 2  },
  specialist: { maxHp: 94,  attack: 20, defense: 8,  mobility: 2  },
  executor:   { maxHp: 90,  attack: 27, defense: 7,  mobility: 3  },
}

// ── Colour palette ────────────────────────────────────────────────────────────

const TEAM_COLOR: Record<CharacterSide, Record<UnitRole, number>> = {
  left:  { king: 0x4a90d9, warrior: 0x2255aa, specialist: 0x44aacc, executor: 0x7744cc },
  right: { king: 0xd94a4a, warrior: 0xaa2222, specialist: 0xcc6644, executor: 0xcc4488 },
}

const ROLE_LABEL: Record<UnitRole, string> = {
  king: 'R', warrior: 'G', specialist: 'E', executor: 'X',
}

// ── Sprite shape ──────────────────────────────────────────────────────────────

interface UnitSprite {
  container:  Phaser.GameObjects.Container
  rect:       Phaser.GameObjects.Rectangle
  hpBar:      Phaser.GameObjects.Rectangle
  hpText:     Phaser.GameObjects.Text
  focusRing:  Phaser.GameObjects.Rectangle   // selection highlight (white)
  activeRing: Phaser.GameObjects.Rectangle   // turn-active highlight (green)
  posText:    Phaser.GameObjects.Text        // grid coords "(col,row)"
  maxHp:      number
}

// ── Incoming scene data ───────────────────────────────────────────────────────

interface SceneData {
  deckConfig?: Record<UnitRole, UnitDeckConfig>
}

// ── BattleScene ───────────────────────────────────────────────────────────────

export default class BattleScene extends Phaser.Scene {
  // ── Engine objects ──────────────────────────────────────────────────────────
  private _ctrl!:   GameController
  private _bridge!: PhaserBridge
  private _driver!: BattleDriver

  // ── Static visual objects ───────────────────────────────────────────────────
  private _sprites:    Map<string, UnitSprite>   = new Map()
  private _roundText!: Phaser.GameObjects.Text
  private _phaseText!: Phaser.GameObjects.Text
  private _logLines:   Phaser.GameObjects.Text[] = []
  private _logMsgs:    string[]                  = []

  // ── Player input state ──────────────────────────────────────────────────────
  private readonly _playerSide: CharacterSide  = 'left'
  private _currentActorId: string | null        = null
  private _awaitingMode: 'unit' | 'tile' | null = null
  private _selReady     = false

  // ── Player panel — persistent shell ────────────────────────────────────────
  private _panelBg!:    Phaser.GameObjects.Rectangle
  private _confirmBtn!: Phaser.GameObjects.Container
  private _cancelBtn!:  Phaser.GameObjects.Container

  // ── Player panel — recreated each turn ─────────────────────────────────────
  /** All dynamically-created card button containers (destroyed on each turn end). */
  private _cardBtns:  Phaser.GameObjects.Container[] = []
  /** Maps skillId → { bg, defaultStroke } for visual highlight updates. */
  private _cardBgMap: Map<string, { bg: Phaser.GameObjects.Rectangle; stroke: number }> = new Map()
  /** The last card ID selected (for highlight). */
  private _selectedCardId: string | null = null

  // ── Target overlays — recreated on AWAITING_TARGET ─────────────────────────
  /** Interactive overlays shown when player must pick a target or tile. */
  private _targetOverlays: Phaser.GameObjects.GameObject[] = []

  constructor() {
    super('BattleScene')
  }

  // ── Scene lifecycle ─────────────────────────────────────────────────────────

  create(data: SceneData) {
    GameStateManager.set(GameState.PLAYING)

    // 1. Build engine layer
    this._ctrl   = _buildController(data.deckConfig)
    this._driver = new BattleDriver(
      this._ctrl,
      new AutoPlayer(this._ctrl),
      {
        movementSkipMs: 400,
        actionBeginMs:  300,
        turnPlayMs:     700,
        phaseAdvanceMs: 500,
        playerSide:     this._playerSide,
      },
    )

    // 2. Static visuals
    this._drawBackground()
    this._drawGrid()
    this._drawHUD()
    this._drawCharacters()

    // 3. Player panel (persistent shell, hidden by default)
    this._buildPanelShell()
    this._buildActionButtons()

    // 4. Event subscriptions — ONLY visual reactions + input forwarding
    this._bridge = new PhaserBridge(this._ctrl)

      // ── Phase / round labels ──────────────────────────────────────────────
      .onHUD('ROUND_STARTED', (e) => {
        this._roundText.setText(`Round ${e.round}`)
        this._addLog(`— Round ${e.round} —`)
      })
      .onHUD('PHASE_STARTED', (e) => {
        const side  = e.side  === 'left'     ? 'Azul'     : 'Vermelho'
        const phase = e.phase === 'movement' ? 'Movimento' : 'Ação'
        this._phaseText.setText(`${phase} — ${side}`)
        this._addLog(`Fase de ${phase} (${side})`)
      })

      // ── Turn sequencing indicators ─────────────────────────────────────────
      .on('TURN_STARTED', (e) => {
        this._sprite(e.unitId)?.activeRing.setVisible(true)
        this._addLog(`Turno: ${this._name(e.unitId)}`)
        // Player turn: auto-focus actor and open skill panel
        const char = this._ctrl.getCharacter(e.unitId)
        if (char?.side === this._playerSide) {
          this._currentActorId = e.unitId
          this._selReady       = false
          this._selectedCardId = null
          this._ctrl.selectCharacter(e.unitId)
        }
      })
      .on('TURN_COMMITTED', (e) => {
        this._sprite(e.unitId)?.activeRing.setVisible(false)
        this._clearFocusRings()
        if (e.unitId === this._currentActorId) {
          this._hidePanel()
          this._currentActorId = null
        }
      })
      .on('TURN_SKIPPED', (e) => {
        this._sprite(e.unitId)?.activeRing.setVisible(false)
        this._clearFocusRings()
        this._addLog(`${this._name(e.unitId)} pulou (${e.reason})`)
        if (e.unitId === this._currentActorId) {
          this._hidePanel()
          this._currentActorId = null
        }
      })

      // ── Player action state ────────────────────────────────────────────────
      .on('CHARACTER_FOCUSED', (e) => {
        this._showFocusRing(e.unitId)
        if (e.unitId !== this._currentActorId) return
        this._rebuildCardButtons(e.unitId)
      })
      .on('AWAITING_TARGET', (e) => {
        this._awaitingMode = e.targetMode
        this._buildTargetOverlays(e.unitId, e.skillId, e.targetMode)
      })
      .on('CARD_SELECTED', (e) => {
        // Track last selected card of each category; keep latest attack highlight
        this._selectedCardId = e.cardId
        this._refreshCardHighlights()
      })
      .on('SELECTION_READY', (_e) => {
        this._selReady = true
        this._confirmBtn.setVisible(true)
      })
      .on('SELECTION_CANCELLED', (_e) => {
        // Panel stays open. Clear target mode and overlays.
        // The Cancel button handler will re-call selectCharacter immediately
        // after cancelAction(), triggering CHARACTER_FOCUSED → panel rebuild.
        this._clearTargetOverlays()
        this._awaitingMode   = null
        this._selReady       = false
        this._selectedCardId = null
        this._confirmBtn.setVisible(false)
      })

      // ── Movement animation + position label ────────────────────────────────
      .onAnimation('CHARACTER_MOVED', (e) => {
        const sprite = this._sprite(e.unitId)
        if (!sprite) return
        const { x, y } = _tileCenter(e.toCol, e.toRow)
        this.tweens.add({ targets: sprite.container, x, y, duration: 300, ease: 'Quad.Out' })
        sprite.posText.setText(`(${e.toCol},${e.toRow})`)
      })

      // ── Skill pulse animation ──────────────────────────────────────────────
      .onAnimation('SKILL_USED', (e) => {
        const sprite = this._sprite(e.unitId)
        if (sprite) {
          this.tweens.add({
            targets: sprite.rect, scaleX: 1.25, scaleY: 1.25,
            yoyo: true, duration: 150, ease: 'Quad.Out',
          })
        }
        const icon = e.category === 'defense' ? `🛡 ${e.skillName}` : `⚔ ${e.skillName}`
        this._addLog(`${this._name(e.unitId)}: ${icon}`)
      })

      // ── HP bar + floating damage ───────────────────────────────────────────
      .onHUD('DAMAGE_APPLIED', (e) => {
        this._updateHpBar(e.unitId, e.newHp)
        this._floatingText(e.unitId, `-${e.amount}`, '#ff4444')
        this._addLog(`${this._name(e.unitId)} recebe ${e.amount} dano (HP ${e.newHp})`)
      })
      .onHUD('HEAL_APPLIED', (e) => {
        this._updateHpBar(e.unitId, e.newHp)
        this._floatingText(e.unitId, `+${e.amount}`, '#44ff88')
      })
      .onHUD('BLEED_TICK', (e) => {
        this._updateHpBar(e.unitId, e.newHp)
        this._floatingText(e.unitId, `🩸-${e.damage}`, '#cc2244')
      })
      .onHUD('POISON_TICK', (e) => {
        this._updateHpBar(e.unitId, e.newHp)
        this._floatingText(e.unitId, `☠-${e.damage}`, '#88cc22')
      })
      .onHUD('REGEN_TICK', (e) => {
        this._updateHpBar(e.unitId, e.newHp)
        this._floatingText(e.unitId, `🌿+${e.heal}`, '#44ff88')
      })
      .onHUD('SHIELD_APPLIED', (e) => {
        this._floatingText(e.unitId, `🛡+${e.amount}`, '#88aaff')
      })

      // ── Status effect icons ────────────────────────────────────────────────
      .onHUD('STATUS_APPLIED', (e) => {
        const icons: Record<string, string> = {
          bleed: '🩸', stun: '⚡', regen: '🌿', evade: '💨',
          reflect: '🪞', def_down: '🔻DEF', atk_down: '🔻ATK',
        }
        this._floatingText(e.unitId, icons[e.status] ?? e.status, '#ffdd44')
      })

      // ── Death animation ────────────────────────────────────────────────────
      .onAnimation('CHARACTER_DIED', (e) => {
        const sprite = this._sprite(e.unitId)
        if (!sprite) return
        sprite.activeRing.setVisible(false)
        sprite.rect.setFillStyle(0x444444)
        this.tweens.add({ targets: sprite.container, alpha: 0.2, duration: 600, ease: 'Quad.Out' })
        this._addLog(`💀 ${this._name(e.unitId)} morreu (Round ${e.round})`)
      })

      // ── Victory overlay ────────────────────────────────────────────────────
      .onHUD('BATTLE_ENDED', (e) => {
        this._hidePanel()
        const winText = e.winner
          ? `${e.winner === 'left' ? '🔵 Azul' : '🔴 Vermelho'} venceu!`
          : 'Empate!'
        this._showVictoryOverlay(winText, e.reason, e.round)
      })

    // 5. Start engine + driver
    this._ctrl.startBattle()
    this._driver.start()
  }

  shutdown() {
    this._bridge.destroy()
    this._driver.destroy()
    this._destroyCardButtons()
    this._clearTargetOverlays()
  }

  // ── Player panel — shell (built once) ────────────────────────────────────────

  private _buildPanelShell(): void {
    this._panelBg = this.add
      .rectangle(W / 2, PANEL_Y + PANEL_H / 2, W, PANEL_H, 0x060d16)
      .setStrokeStyle(1, 0x1e3a5f)
      .setVisible(false)
      .setDepth(5)
  }

  private _buildActionButtons(): void {
    this._confirmBtn = this._makeActionBtn(
      BTN_X, CONFIRM_Y, BTN_W, BTN_H,
      'Confirmar', 0x0d2211, 0x22cc44, '#44ff88',
      () => {
        if (!this._selReady) return
        this._ctrl.commitTurn()
      },
    ).setVisible(false).setDepth(8)

    this._cancelBtn = this._makeActionBtn(
      BTN_X, CANCEL_Y, BTN_W, BTN_H,
      'Cancelar', 0x1a0808, 0xcc2222, '#ff6666',
      () => {
        this._ctrl.cancelAction()
        // cancelAction clears _focusedCharacterId in the controller.
        // Re-focus immediately so the panel stays open and rebuilds.
        if (this._currentActorId) {
          this._ctrl.selectCharacter(this._currentActorId)
        }
      },
    ).setVisible(false).setDepth(8)
  }

  /** Build a button container with a rect bg + text child. */
  private _makeActionBtn(
    x: number, y: number, w: number, h: number,
    label: string,
    fill: number, stroke: number, textColor: string,
    onDown: () => void,
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, w, h, fill)
      .setStrokeStyle(2, stroke)
      .setInteractive({ useHandCursor: true })

    const txt = this.add.text(0, 0, label, {
      fontFamily: 'Arial', fontSize: '13px', color: textColor, fontStyle: 'bold',
    }).setOrigin(0.5)

    bg.on('pointerover', () => bg.setFillStyle(fill | 0x0a0a0a))
    bg.on('pointerout',  () => bg.setFillStyle(fill))
    bg.on('pointerdown', onDown)

    return this.add.container(x, y, [bg, txt])
  }

  // ── Player panel — card buttons (rebuilt each turn) ───────────────────────

  private _rebuildCardButtons(actorId: string): void {
    this._destroyCardButtons()

    const hand = this._ctrl.getHand(actorId)
    if (!hand) return

    // Show the panel shell and persistent buttons
    this._panelBg.setVisible(true)
    this._cancelBtn.setVisible(true)
    this._confirmBtn.setVisible(this._selReady)

    // Section labels
    this._addSectionLabel(CARDS_X - 4, ATK_ROW_Y - CARD_H / 2 - 4, 'ATAQUE', '#cc6633')
    this._addSectionLabel(CARDS_X - 4, DEF_ROW_Y - CARD_H / 2 - 4, 'DEFESA', '#3366cc')

    // Attack cards
    hand.attack.forEach((skill, i) => {
      const cx = CARDS_X + i * (CARD_W + CARD_GAP) + CARD_W / 2
      this._makeCardBtn(cx, ATK_ROW_Y, skill, actorId)
    })

    // Defense cards
    hand.defense.forEach((skill, i) => {
      const cx = CARDS_X + i * (CARD_W + CARD_GAP) + CARD_W / 2
      this._makeCardBtn(cx, DEF_ROW_Y, skill, actorId)
    })
  }

  /** Create a small section label ("ATAQUE" / "DEFESA") and track for cleanup. */
  private _addSectionLabel(x: number, y: number, text: string, color: string): void {
    const label = this.add.text(x, y, text, {
      fontFamily: 'Arial', fontSize: '9px', color, fontStyle: 'bold',
    }).setOrigin(0, 1).setDepth(7)
    // Wrap in a minimal container so it goes through the same cleanup path
    const c = this.add.container(0, 0, [label]).setDepth(7)
    this._cardBtns.push(c)
  }

  /** Build one skill card button and register it for cleanup. */
  private _makeCardBtn(x: number, y: number, skill: Skill, _actorId: string): void {
    const isAtk      = skill.category === 'attack'
    const baseFill   = isAtk ? 0x141020 : 0x081428
    const baseStroke = isAtk ? 0x663322 : 0x223366

    const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, baseFill)
      .setStrokeStyle(2, baseStroke)
      .setInteractive({ useHandCursor: true })

    const nameTxt = this.add.text(0, -9, skill.name, {
      fontFamily: 'Arial', fontSize: '11px', color: '#e2e8f0', fontStyle: 'bold',
    }).setOrigin(0.5)

    const subTxt = this.add.text(0, 9,
      skill.power > 0 ? `${skill.effectType}  ${skill.power}` : skill.effectType, {
        fontFamily: 'Arial', fontSize: '9px', color: '#64748b',
      }).setOrigin(0.5)

    bg.on('pointerover', () => {
      if (this._awaitingMode) return
      bg.setStrokeStyle(3, isAtk ? 0xffaa44 : 0x44aaff)
    })
    bg.on('pointerout', () => this._applyCardHighlight(skill.id, bg, baseStroke))
    bg.on('pointerdown', () => {
      if (this._awaitingMode) {
        // Re-selecting attack while in targeting mode: just re-issue useSkill.
        // This will overwrite _awaitingTarget in the controller and emit
        // AWAITING_TARGET again (or CARD_SELECTED if self-targeting).
        this._clearTargetOverlays()
        this._awaitingMode = null
      }
      const result = this._ctrl.useSkill(skill.id)
      if (!result.ok) this._addLog(`[!] ${result.error}`)
    })

    const container = this.add.container(x, y, [bg, nameTxt, subTxt]).setDepth(7)
    this._cardBtns.push(container)
    this._cardBgMap.set(skill.id, { bg, stroke: baseStroke })
  }

  private _refreshCardHighlights(): void {
    for (const [skillId, { bg, stroke }] of this._cardBgMap) {
      this._applyCardHighlight(skillId, bg, stroke)
    }
  }

  private _applyCardHighlight(
    skillId: string,
    bg:      Phaser.GameObjects.Rectangle,
    defaultStroke: number,
  ): void {
    if (skillId === this._selectedCardId) {
      bg.setStrokeStyle(3, 0xffffff)
    } else {
      bg.setStrokeStyle(2, defaultStroke)
    }
  }

  private _destroyCardButtons(): void {
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
      for (const target of targets) {
        this._addUnitTargetRing(target)
      }
    } else {
      const positions = this._ctrl.getValidAreaPositions(actorId, skillId)
      for (const pos of positions) {
        this._addTileOverlay(pos.col, pos.row)
      }
    }
  }

  private _addUnitTargetRing(target: Character): void {
    const sprite = this._sprite(target.id)
    if (!sprite) return

    const ring = this.add.rectangle(
      sprite.container.x, sprite.container.y,
      CHAR_SIZE + 16, CHAR_SIZE + 16,
    )
      .setStrokeStyle(2, 0xffee00, 1)
      .setFillStyle(0xffee00, 0.10)
      .setInteractive({ useHandCursor: true })
      .setDepth(6)

    ring.on('pointerover', () => ring.setFillStyle(0xffee00, 0.22))
    ring.on('pointerout',  () => ring.setFillStyle(0xffee00, 0.10))
    ring.on('pointerdown', () => {
      const result = this._ctrl.chooseTarget({ kind: 'character', characterId: target.id })
      if (result.ok) {
        this._clearTargetOverlays()
        this._awaitingMode = null
      } else {
        this._addLog(`[!] ${result.error}`)
      }
    })

    this._targetOverlays.push(ring)
  }

  private _addTileOverlay(col: number, row: number): void {
    const { x, y } = _tileCenter(col, row)
    const tile = this.add.rectangle(x, y, TILE - 4, TILE - 4)
      .setStrokeStyle(2, 0xffee00, 1)
      .setFillStyle(0xffee00, 0.14)
      .setInteractive({ useHandCursor: true })
      .setDepth(6)

    tile.on('pointerover', () => tile.setFillStyle(0xffee00, 0.28))
    tile.on('pointerout',  () => tile.setFillStyle(0xffee00, 0.14))
    tile.on('pointerdown', () => {
      const result = this._ctrl.chooseTarget({ kind: 'area', col, row })
      if (result.ok) {
        this._clearTargetOverlays()
        this._awaitingMode = null
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
  }

  // ── Panel lifecycle ────────────────────────────────────────────────────────────

  private _hidePanel(): void {
    this._destroyCardButtons()
    this._clearTargetOverlays()
    this._clearFocusRings()
    this._panelBg.setVisible(false)
    this._confirmBtn.setVisible(false)
    this._cancelBtn.setVisible(false)
    this._selReady       = false
    this._awaitingMode   = null
    this._selectedCardId = null
  }

  // ── Static drawing (called once) ──────────────────────────────────────────────

  private _drawBackground() {
    this.add.rectangle(W / 2, H / 2, W, H, 0x0c1018)

    const halfW = 8 * TILE
    this.add.rectangle(GRID_X + halfW / 2,         GRID_Y + ROWS * TILE / 2, halfW, ROWS * TILE, 0x0d1a2e)
    this.add.rectangle(GRID_X + halfW + halfW / 2,  GRID_Y + ROWS * TILE / 2, halfW, ROWS * TILE, 0x2e0d0d)

    // Wall at column 8
    this.add.rectangle(GRID_X + 8 * TILE, GRID_Y + ROWS * TILE / 2, 2, ROWS * TILE, 0x556677)
  }

  private _drawGrid() {
    const g = this.add.graphics()
    g.lineStyle(1, 0x1e293b, 1)
    for (let col = 0; col <= COLS; col++) {
      g.lineBetween(GRID_X + col * TILE, GRID_Y, GRID_X + col * TILE, GRID_Y + ROWS * TILE)
    }
    for (let row = 0; row <= ROWS; row++) {
      g.lineBetween(GRID_X, GRID_Y + row * TILE, GRID_X + COLS * TILE, GRID_Y + row * TILE)
    }
    for (let col = 0; col < COLS; col++) {
      this.add.text(
        GRID_X + col * TILE + TILE / 2, GRID_Y + ROWS * TILE + 4,
        `${col}`,
        { fontFamily: 'Arial', fontSize: '9px', color: '#334155' },
      ).setOrigin(0.5, 0)
    }
  }

  private _drawHUD() {
    this.add.rectangle(W / 2, 28, W, 56, 0x101827)

    this._roundText = this.add.text(W / 2, 20, 'Round 1', {
      fontFamily: 'Arial', fontSize: '16px', color: '#f8e7b9', fontStyle: 'bold',
    }).setOrigin(0.5, 0)

    this._phaseText = this.add.text(W / 2, 40, '…', {
      fontFamily: 'Arial', fontSize: '13px', color: '#94a3b8',
    }).setOrigin(0.5, 0)

    this.add.text(GRID_X + 4, 12, '🔵 Azul (você)', {
      fontFamily: 'Arial', fontSize: '13px', color: '#7ab8ff', fontStyle: 'bold',
    }).setOrigin(0, 0)

    this.add.text(GRID_X + COLS * TILE - 4, 12, '🔴 Vermelho', {
      fontFamily: 'Arial', fontSize: '13px', color: '#ff8080', fontStyle: 'bold',
    }).setOrigin(1, 0)

    const logY = GRID_Y + ROWS * TILE + 22
    for (let i = 0; i < 6; i++) {
      this._logLines.push(
        this.add.text(W / 2, logY + i * 18, '', {
          fontFamily: 'Arial', fontSize: '12px', color: '#64748b',
        }).setOrigin(0.5, 0),
      )
    }
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
      const barW      = CHAR_SIZE - 4
      const barOffY   = half + 8

      // Selection ring (white) — shown on CHARACTER_FOCUSED
      const focusRing = this.add.rectangle(0, 0, CHAR_SIZE + 14, CHAR_SIZE + 14)
        .setStrokeStyle(2, 0xffffff, 1).setFillStyle(0x000000, 0).setVisible(false)

      // Turn-active ring (green) — shown on TURN_STARTED
      const activeRing = this.add.rectangle(0, 0, CHAR_SIZE + 8, CHAR_SIZE + 8)
        .setStrokeStyle(3, 0x00ff88).setFillStyle(0x000000, 0).setVisible(false)

      const rect = this.add.rectangle(0, 0, CHAR_SIZE, CHAR_SIZE, color)
        .setStrokeStyle(1, 0x000000, 0.6)

      const roleText = this.add.text(0, -4, ROLE_LABEL[u.role], {
        fontFamily: 'Arial Black', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5)

      const nameText = this.add.text(0, half + 2, u.name, {
        fontFamily: 'Arial', fontSize: '9px', color: '#aaaaaa',
      }).setOrigin(0.5, 0)

      const hpBarBg = this.add.rectangle(0, barOffY, barW, 5, 0x331111)
      const hpBar   = this.add.rectangle(-barW / 2, barOffY, barW, 5, 0x44dd44).setOrigin(0, 0.5)

      // HP number text below the bar
      const hpText = this.add.text(0, barOffY + 10, `${char.maxHp}/${char.maxHp}`, {
        fontFamily: 'Arial', fontSize: '9px', color: '#88cc88',
      }).setOrigin(0.5, 0)

      // Grid coordinates above the unit
      const posText = this.add.text(0, -(half + 14), `(${u.col},${u.row})`, {
        fontFamily: 'Arial', fontSize: '9px', color: '#4a6a8a',
      }).setOrigin(0.5, 1)

      const container = this.add.container(x, y, [
        focusRing, activeRing, rect, roleText, nameText,
        hpBarBg, hpBar, hpText, posText,
      ])

      this._sprites.set(u.id, { container, rect, hpBar, hpText, focusRing, activeRing, posText, maxHp: char.maxHp })
    }
  }

  // ── Visual update helpers ──────────────────────────────────────────────────────

  private _updateHpBar(unitId: string, newHp: number) {
    const sprite = this._sprite(unitId)
    if (!sprite) return
    const hp    = Math.max(0, newHp)
    const ratio = hp / sprite.maxHp
    sprite.hpBar.setDisplaySize((CHAR_SIZE - 4) * ratio, 5)
    sprite.hpBar.setFillStyle(ratio > 0.5 ? 0x44dd44 : ratio > 0.25 ? 0xddaa22 : 0xdd3322)
    // HP number: colour mirrors the bar
    const textColor = ratio > 0.5 ? '#88cc88' : ratio > 0.25 ? '#ccaa44' : '#cc4444'
    sprite.hpText.setText(`${hp}/${sprite.maxHp}`).setColor(textColor)
  }

  private _floatingText(unitId: string, text: string, color: string) {
    const sprite = this._sprite(unitId)
    if (!sprite) return
    const { x, y } = sprite.container
    const t = this.add.text(x, y - CHAR_SIZE / 2, text, {
      fontFamily: 'Arial Black', fontSize: '14px', color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(10)
    this.tweens.add({
      targets: t, y: y - CHAR_SIZE / 2 - 32, alpha: 0,
      duration: 900, ease: 'Quad.Out',
      onComplete: () => t.destroy(),
    })
  }

  private _showFocusRing(unitId: string): void {
    this._clearFocusRings()
    this._sprite(unitId)?.focusRing.setVisible(true)
  }

  private _clearFocusRings(): void {
    for (const sprite of this._sprites.values()) {
      sprite.focusRing.setVisible(false)
    }
  }

  private _showVictoryOverlay(winText: string, reason: string, round: number) {
    const REASON_LABELS: Record<string, string> = {
      king_slain:         'Rei abatido',
      simultaneous_kings: 'Empate simultâneo',
      timeout:            'Tempo esgotado',
      forfeit:            'Desistência',
    }
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setDepth(20)
    this.add.rectangle(W / 2, H / 2, 560, 260, 0x101827).setDepth(21).setStrokeStyle(2, 0x334155)

    this.add.text(W / 2, H / 2 - 64, winText, {
      fontFamily: 'Arial Black', fontSize: '36px', color: '#f8e7b9', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(22)

    this.add.text(W / 2, H / 2 - 10, `${REASON_LABELS[reason] ?? reason} — Round ${round}`, {
      fontFamily: 'Arial', fontSize: '18px', color: '#94a3b8',
    }).setOrigin(0.5).setDepth(22)

    const btn = this.add.rectangle(W / 2, H / 2 + 64, 240, 48, 0x1e293b)
      .setStrokeStyle(2, 0x475569).setInteractive({ useHandCursor: true }).setDepth(22)
    const label = this.add.text(W / 2, H / 2 + 64, 'Menu Principal', {
      fontFamily: 'Arial', fontSize: '17px', color: '#94a3b8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(23)

    btn.on('pointerover', () => { btn.setFillStyle(0x263548); label.setColor('#f1f5f9') })
    btn.on('pointerout',  () => { btn.setFillStyle(0x1e293b); label.setColor('#94a3b8') })
    btn.on('pointerdown', () => this.scene.start('MenuScene'))
  }

  // ── Log ─────────────────────────────────────────────────────────────────────

  private _addLog(msg: string) {
    this._logMsgs.push(msg)
    if (this._logMsgs.length > this._logLines.length) this._logMsgs.shift()
    const last = this._logLines.length - 1
    this._logLines.forEach((line, i) => {
      line.setText(this._logMsgs[i] ?? '').setAlpha(last > 0 ? 0.4 + (i / last) * 0.6 : 1)
    })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private _sprite(id: string): UnitSprite | undefined {
    return this._sprites.get(id)
  }

  private _name(id: string): string {
    return this._ctrl.getCharacter(id)?.name ?? id
  }
}

// ── Module helpers (no Phaser, no engine — pure data conversion) ──────────────

function _tileCenter(col: number, row: number): { x: number; y: number } {
  return { x: GRID_X + col * TILE + TILE / 2, y: GRID_Y + row * TILE + TILE / 2 }
}

function _buildController(deckConfig?: Record<UnitRole, UnitDeckConfig>): GameController {
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

  const rightChars = RIGHT_UNITS.map((u) =>
    new Character(u.id, u.name, u.role, 'right', u.col, u.row, ROLE_STATS[u.role]))

  const leftTeam = new Team('left', leftChars, {
    king:       deckConfig?.king       ? fromConfig(deckConfig.king)       : fromAssignment('lking'),
    warrior:    deckConfig?.warrior    ? fromConfig(deckConfig.warrior)    : fromAssignment('lwarrior'),
    specialist: deckConfig?.specialist ? fromConfig(deckConfig.specialist) : fromAssignment('lspecialist'),
    executor:   deckConfig?.executor   ? fromConfig(deckConfig.executor)   : fromAssignment('lexecutor'),
  })

  const rightTeam = new Team('right', rightChars, {
    king:       fromAssignment('rking'),
    warrior:    fromAssignment('rwarrior'),
    specialist: fromAssignment('rspecialist'),
    executor:   fromAssignment('rexecutor'),
  })

  return GameController.create({
    battle:      new Battle({ leftTeam, rightTeam }),
    registry,
    passives:    PASSIVE_CATALOG,
    globalRules: GLOBAL_RULES,
  })
}
