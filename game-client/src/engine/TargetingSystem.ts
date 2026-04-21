/**
 * engine/TargetingSystem.ts — resolves skill targets and area shapes.
 *
 * Responsibilities:
 *   - Translate (Skill + TargetSpec + Battle snapshot) → list of hit Characters
 *   - Determine whether unit or area targeting applies
 *   - Validate range constraints
 *   - Provide valid-tile / valid-unit lists for player/bot selection (UI + AI)
 *   - Expose push/collision simulation via Grid primitives
 *
 * Design rules:
 *   - Pure queries: does not modify Character or Battle state
 *   - No engine events emitted here — CombatEngine owns that responsibility
 *   - Grid is used for bounds checking, territory queries, and push simulation
 *   - Area hit resolution uses areaOffsets() directly on Character positions,
 *     avoiding the need to keep the Grid in sync for every query
 */

import { Grid, Position, areaOffsets } from '../domain/Grid'
import type { AreaShape, Direction, PushResult } from '../domain/Grid'
import type { Battle } from '../domain/Battle'
import type { Character } from '../domain/Character'
import type { Skill } from '../domain/Skill'
import type { TargetSpec } from './CombatEngine'

// ── TargetingSystem ───────────────────────────────────────────────────────────

export class TargetingSystem {
  /**
   * Shared grid for bounds / territory checks and push simulation.
   * Uses default dimensions (16 cols × 6 rows, wallCol = 8).
   * No occupancy is stored here unless `syncPositions` is called explicitly.
   */
  private readonly _grid: Grid

  constructor(grid?: Grid) {
    this._grid = grid ?? new Grid()
  }

  // ── Core resolve ──────────────────────────────────────────────────────────

  /**
   * Resolve which Characters are hit by `skill` from `caster` using `spec`.
   *
   * Returns an empty array when:
   *   - `spec` is null
   *   - The spec kind does not match the skill's targetType
   *   - No valid targets are in range
   *
   * Self / ally targets are resolved here for completeness, but the caller
   * (CombatEngine) typically handles those paths separately.
   */
  resolveTargets(
    skill: Skill,
    caster: Character,
    spec: TargetSpec | null,
    battle: Battle,
  ): Character[] {
    if (!spec) return []

    switch (skill.targetType) {

      case 'single': {
        if (spec.kind !== 'character') return []
        const target = battle.getCharacter(spec.characterId)
        if (!target?.alive) return []
        // v3 §6.5 Fuga Sombria — invisible units are untargetable by
        // single-target skills. Area skills still hit them (handled in
        // the 'area' case below).
        if (target.isInvisible) return []
        if (!this.isInRange(caster, Position.of(target.col, target.row), skill.range))
          return []
        return [target]
      }

      case 'area': {
        if (spec.kind !== 'area') return []
        const enemySide = caster.side === 'left' ? 'right' : 'left'
        return this._resolveAreaHits(skill, spec.col, spec.row, enemySide, battle)
      }

      case 'lowest_ally': {
        const ally = battle.teamOf(caster.side).lowestHpCharacter()
        return ally ? [ally] : []
      }

      case 'all_allies':
        return [...battle.teamOf(caster.side).living] as Character[]

      case 'self':
        return [caster]

      default:
        return []
    }
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * True when the full targeting decision is valid for this skill:
   *   - spec kind matches targetType
   *   - target / center tile is within skill.range (0 = unlimited)
   *   - for 'single': target is alive and on the correct side
   */
  validateTargetSpec(skill: Skill, caster: Character, spec: TargetSpec, battle: Battle): boolean {
    switch (skill.targetType) {

      case 'single': {
        if (spec.kind !== 'character') return false
        const target = battle.getCharacter(spec.characterId)
        if (!target?.alive) return false
        // v3 §6.5 — invisible units reject single-target selection.
        if (target.isInvisible) return false
        if (!skill.isValidTargetSide(caster.side, target.side)) return false
        return this.isInRange(caster, Position.of(target.col, target.row), skill.range)
      }

      case 'area': {
        if (spec.kind !== 'area') return false
        return this.isInRange(caster, Position.of(spec.col, spec.row), skill.range)
      }

      default:
        return true
    }
  }

  /**
   * True when `targetPos` is within `range` tiles (Manhattan) of `caster`.
   * When range = 0, always returns true (unrestricted).
   */
  isInRange(caster: Character, targetPos: Position, range: number): boolean {
    if (range === 0) return true
    return Position.of(caster.col, caster.row).manhattanTo(targetPos) <= range
  }

  // ── Valid target queries (for UI / AI) ────────────────────────────────────

  /**
   * All living enemies of `caster` that are valid targets for `skill`.
   * Respects skill.range; returns all living enemies when range = 0.
   */
  getValidUnitTargets(skill: Skill, caster: Character, battle: Battle): Character[] {
    const enemySide = caster.side === 'left' ? 'right' : 'left'
    // v3 §6.5 — invisible enemies are excluded from single-target lists
    // (AI/UI can't select them). For consistency with resolveTargets/validate.
    const candidates = [...battle.teamOf(enemySide).living]
      .filter((c) => !c.isInvisible) as Character[]
    if (skill.range === 0) return candidates
    return candidates.filter((c) =>
      this.isInRange(caster, Position.of(c.col, c.row), skill.range),
    )
  }

  /**
   * All tile positions that are valid area-aim targets for `skill` from `caster`.
   * Respects skill.range; when range = 0, returns all tiles in enemy territory.
   * Useful for rendering the targeting overlay.
   */
  getValidAreaPositions(skill: Skill, caster: Character): Position[] {
    const enemySide = caster.side === 'left' ? 'right' : 'left'

    if (skill.range === 0) {
      // Unrestricted — all open tiles in enemy territory
      return this._grid.territoryCells(enemySide).map((c) => c.position)
    }

    const casterPos = Position.of(caster.col, caster.row)
    return this._grid
      .withinRange(casterPos, skill.range)
      .filter((pos) => this._grid.isInTerritory(pos.col, enemySide))
  }

  // ── Area shape preview ────────────────────────────────────────────────────

  /**
   * All tiles that would be hit if `skill` is aimed at `center`.
   * Out-of-bounds tiles are filtered out automatically.
   *
   * `respectWalls` — when true, wall tiles are excluded from the result.
   *   Defaults to false (most area skills pass through terrain).
   */
  previewArea(skill: Skill, center: Position, respectWalls = false): Position[] {
    const shape  = this._effectiveShape(skill)
    const offsets = areaOffsets(shape)

    return offsets
      .map(([dc, dr]) => Position.of(center.col + dc, center.row + dr))
      .filter((pos) => {
        if (!this._grid.isInBounds(pos.col, pos.row)) return false
        if (respectWalls && this._grid.cell(pos.col, pos.row)?.isWall) return false
        return true
      })
  }

  // ── Push mechanics ────────────────────────────────────────────────────────

  /**
   * Synchronise Character positions into the internal grid.
   * Required before calling `simulatePush` / `applyPush`.
   *
   * Characters that are dead are removed from the grid.
   * Re-entrant: safe to call multiple times per turn.
   */
  syncPositions(characters: readonly Character[]): void {
    for (const char of characters) {
      if (char.alive) {
        this._grid.place(char.id, char.col, char.row)
      } else {
        this._grid.remove(char.id)
      }
    }
  }

  /**
   * Simulate a push without committing grid state — returns PushResult.
   * Describes what *would* happen: how far the character slides, and whether
   * they collide with a wall or another unit.
   *
   * Call `syncPositions` first to ensure the grid reflects current state.
   */
  simulatePush(characterId: string, direction: Direction, force: number): PushResult {
    return this._grid.simulatePush(characterId, direction, force)
  }

  /**
   * Simulate AND commit a push in one step.
   * The grid occupancy is updated to the final position.
   * Returns PushResult — use `result.to` to update Character.col/row afterwards.
   *
   * Call `syncPositions` first to ensure the grid reflects current state.
   */
  applyPush(characterId: string, direction: Direction, force: number): PushResult {
    return this._grid.applyPush(characterId, direction, force)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Resolve the effective AreaShape for a skill:
   *   1. Use `skill.areaShape` when explicitly set (full shape control).
   *   2. Fall back to `diamond(areaRadius)` for backwards compat with legacy skills.
   */
  private _effectiveShape(skill: Skill): AreaShape {
    if (skill.areaShape) return skill.areaShape
    const r = skill.areaRadius || 1
    return { type: 'diamond', radius: r }
  }

  /**
   * Compute which living enemies on `enemySide` stand on tiles covered by the
   * skill's area shape, centred at (centerCol, centerRow).
   *
   * Positions are computed via areaOffsets() applied to Character.col/row
   * directly — no grid sync required for this path.
   */
  private _resolveAreaHits(
    skill: Skill,
    centerCol: number,
    centerRow: number,
    enemySide: 'left' | 'right',
    battle: Battle,
  ): Character[] {
    const shape   = this._effectiveShape(skill)
    const offsets = areaOffsets(shape)

    // Build a Set of "<col>,<row>" strings for O(1) lookup
    const hitTiles = new Set<string>()
    for (const [dc, dr] of offsets) {
      const col = centerCol + dc
      const row = centerRow + dr
      if (this._grid.isInBounds(col, row)) {
        hitTiles.add(`${col},${row}`)
      }
    }

    return battle
      .teamOf(enemySide)
      .living
      .filter((c) => hitTiles.has(`${c.col},${c.row}`)) as Character[]
  }
}
