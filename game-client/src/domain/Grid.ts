/**
 * domain/Grid.ts — battlefield grid system.
 *
 * Responsibilities:
 *   - Represent the 16×6 tile battlefield
 *   - Track character placement (by ID — no domain-entity coupling)
 *   - Validate movement (bounds, territory, occupancy, mobility)
 *   - Resolve area shapes (diamond, square, line, ring…)
 *   - Apply pushes and report collisions
 *
 * Design rules:
 *   - Grid works with character IDs (strings) — not Character objects
 *   - Zero Phaser / UI / rendering dependencies
 *   - All state mutations are guarded and return results
 *   - Area resolution is pure (same input → same output)
 */

// ── Inline result type (keeps domain/ independent of engine/) ─────────────────

type GridOk<T>  = { ok: true;  value: T }
type GridErr    = { ok: false; error: string }
export type GridResult<T = void> = GridOk<T> | GridErr

function Ok<T>(value: T): GridOk<T>  { return { ok: true,  value } }
function Err(error: string): GridErr { return { ok: false, error } }

// ── Team side ─────────────────────────────────────────────────────────────────

export type GridSide = 'left' | 'right'

// ── Position ──────────────────────────────────────────────────────────────────

/**
 * Immutable value object for a tile coordinate.
 * All grid operations accept and return Positions.
 */
export class Position {
  readonly col: number
  readonly row: number

  constructor(col: number, row: number) {
    this.col = col
    this.row = row
  }

  /** Factory — preferred over `new Position()` for conciseness. */
  static of(col: number, row: number): Position {
    return new Position(col, row)
  }

  /** True if both coordinates match. */
  equals(other: Position): boolean {
    return this.col === other.col && this.row === other.row
  }

  /** Manhattan (city-block) distance. */
  manhattanTo(other: Position): number {
    return Math.abs(this.col - other.col) + Math.abs(this.row - other.row)
  }

  /** Chebyshev distance (max of Δcol, Δrow) — used for square areas. */
  chebyshevTo(other: Position): number {
    return Math.max(Math.abs(this.col - other.col), Math.abs(this.row - other.row))
  }

  /** True when Manhattan distance is exactly 1. */
  isAdjacentTo(other: Position): boolean {
    return this.manhattanTo(other) === 1
  }

  /** Compute the neighbour in the given direction. May be out-of-bounds. */
  step(dir: Direction): Position {
    const [dc, dr] = DIRECTION_OFFSETS[dir]
    return Position.of(this.col + dc, this.row + dr)
  }

  toString(): string {
    return `(${this.col},${this.row})`
  }
}

// ── Direction ─────────────────────────────────────────────────────────────────

export type CardinalDirection = 'north' | 'south' | 'east' | 'west'
export type Direction =
  | CardinalDirection
  | 'northeast' | 'northwest' | 'southeast' | 'southwest'

/** [Δcol, Δrow] for each direction. Row increases downward (south). */
const DIRECTION_OFFSETS: Record<Direction, [number, number]> = {
  north:     [ 0, -1],
  south:     [ 0,  1],
  east:      [ 1,  0],
  west:      [-1,  0],
  northeast: [ 1, -1],
  northwest: [-1, -1],
  southeast: [ 1,  1],
  southwest: [-1,  1],
}

/** All four cardinal directions. */
export const CARDINAL_DIRECTIONS: CardinalDirection[] = ['north', 'south', 'east', 'west']

/** Reverse a direction (for knockback targeting). */
export function reverseDirection(dir: Direction): Direction {
  const MAP: Record<Direction, Direction> = {
    north: 'south', south: 'north', east: 'west', west: 'east',
    northeast: 'southwest', northwest: 'southeast',
    southeast: 'northwest', southwest: 'northeast',
  }
  return MAP[dir]
}

// ── Cell ──────────────────────────────────────────────────────────────────────

export type CellType =
  | 'open'    // normal walkable tile
  | 'wall'    // impassable — blocks movement and area effects

export class Cell {
  readonly position: Position
  readonly type: CellType
  private _occupantId: string | null = null

  constructor(col: number, row: number, type: CellType = 'open') {
    this.position = Position.of(col, row)
    this.type     = type
  }

  get col(): number { return this.position.col }
  get row(): number { return this.position.row }

  get isWall(): boolean     { return this.type === 'wall' }
  get isOpen(): boolean     { return this.type === 'open' }
  get isOccupied(): boolean { return this._occupantId !== null }

  /** The ID of the character standing on this cell, or null. */
  get occupantId(): string | null { return this._occupantId }

  /**
   * True if a character can land here:
   *   - cell is open (not a wall)
   *   - no character is currently standing on it
   */
  get isWalkable(): boolean { return this.isOpen && !this.isOccupied }

  /** @internal Used by Grid only. */
  _occupy(characterId: string): void   { this._occupantId = characterId }
  /** @internal Used by Grid only. */
  _vacate():                    void   { this._occupantId = null }

  toString(): string {
    const occ = this._occupantId ? ` [${this._occupantId}]` : ''
    return `Cell(${this.col},${this.row}:${this.type}${occ})`
  }
}

// ── Area shapes ───────────────────────────────────────────────────────────────

/**
 * All supported area patterns for skill targeting.
 *
 * single                — only the centre tile
 * diamond(r)            — all tiles with Manhattan distance ≤ r  (classic AoE)
 * square(r)             — all tiles with Chebyshev distance ≤ r  (3×3 when r=1)
 * line(dir, len)        — the centre + `len` tiles in `dir`
 * ring(r)               — tiles at exactly Manhattan distance = r (hollow)
 * cone(dir, len)        — expanding triangle in `dir`
 */
export type AreaShape =
  | { type: 'single' }
  | { type: 'diamond';  radius: number }
  | { type: 'square';   radius: number }
  | { type: 'line';     direction: CardinalDirection; length: number }
  | { type: 'ring';     radius: number }
  | { type: 'cone';     direction: CardinalDirection; length: number }

/**
 * Compute raw (Δcol, Δrow) offsets for an area shape, centred at (0,0).
 * Offsets are NOT filtered by grid bounds — the Grid does that.
 */
export function areaOffsets(shape: AreaShape): Array<[number, number]> {
  const offsets = new Map<string, [number, number]>()
  const add = (dc: number, dr: number) => offsets.set(`${dc},${dr}`, [dc, dr])

  switch (shape.type) {

    case 'single':
      add(0, 0)
      break

    case 'diamond': {
      const r = shape.radius
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          if (Math.abs(dc) + Math.abs(dr) <= r) add(dc, dr)
        }
      }
      break
    }

    case 'square': {
      const r = shape.radius
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          add(dc, dr)
        }
      }
      break
    }

    case 'line': {
      add(0, 0)
      const [dc, dr] = DIRECTION_OFFSETS[shape.direction]
      for (let i = 1; i <= shape.length; i++) add(dc * i, dr * i)
      break
    }

    case 'ring': {
      const r = shape.radius
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          if (Math.abs(dc) + Math.abs(dr) === r) add(dc, dr)
        }
      }
      break
    }

    case 'cone': {
      // Expands one tile wider each step in `direction`
      const [fdc, fdr] = DIRECTION_OFFSETS[shape.direction]
      for (let step = 0; step <= shape.length; step++) {
        const span = step  // half-width at this depth
        for (let side = -span; side <= span; side++) {
          // Perpendicular axis
          const [pdc, pdr] = fdr === 0 ? [0, side] : [side, 0]
          add(fdc * step + pdc, fdr * step + pdr)
        }
      }
      break
    }
  }

  return [...offsets.values()]
}

/**
 * Resolve an area to concrete `Position`s on the grid, filtering out
 * out-of-bounds tiles and (optionally) wall tiles.
 */
export function resolveArea(
  shape: AreaShape,
  center: Position,
  grid: Grid,
  options: { blockWalls?: boolean } = { blockWalls: true },
): Position[] {
  return areaOffsets(shape)
    .map(([dc, dr]) => Position.of(center.col + dc, center.row + dr))
    .filter((pos) => {
      if (!grid.isInBounds(pos.col, pos.row)) return false
      if (options.blockWalls) {
        const cell = grid.cell(pos.col, pos.row)
        if (cell?.isWall) return false
      }
      return true
    })
}

// ── Push result ───────────────────────────────────────────────────────────────

export interface PushResult {
  /** Character that was pushed. */
  readonly characterId: string
  /** Starting position. */
  readonly from: Position
  /** Final resting position (may equal `from` if blocked immediately). */
  readonly to: Position
  /** Actual distance moved (0 if blocked from the start). */
  readonly distanceMoved: number
  /** Requested push force. */
  readonly requestedDistance: number
  /** True if the push was stopped before completing the full distance. */
  readonly blocked: boolean
  /** ID of the character that blocked the push (if blocked by a unit). */
  readonly collidedWith: string | null
}

// ── Grid configuration ────────────────────────────────────────────────────────

export interface GridConfig {
  /** Number of columns (default: 16). */
  cols?: number
  /** Number of rows (default: 6). */
  rows?: number
  /**
   * Column that divides left (< wallCol) and right (>= wallCol) territories.
   * Not a physical wall — just a territorial boundary. (Default: 8)
   */
  wallCol?: number
  /** Additional physical wall tiles to mark impassable. */
  walls?: ReadonlyArray<{ col: number; row: number }>
}

// ── Grid snapshot (read-only view for debugging/serialisation) ────────────────

export interface CellSnapshot {
  col:       number
  row:       number
  type:      CellType
  occupant:  string | null
}

export interface GridSnapshot {
  cols:       number
  rows:       number
  wallCol:    number
  cells:      CellSnapshot[]
  occupants:  Record<string, { col: number; row: number }>
}

// ── Grid ──────────────────────────────────────────────────────────────────────

/**
 * v3 §6.3 temporary tile obstacle (Muralha Viva, Prisão de Muralha Morta,
 * Armadilha Oculta). Unlike static walls (`Cell.type === 'wall'`), obstacles
 * have a lifespan and can be broken by an atk1 hit.
 *
 * Obstacles occupy exactly one tile and:
 *   - Block character movement (via Grid.isWalkable)
 *   - Do NOT block area-effect damage by default — AoE skills still hit
 *     the tile; the obstacle itself takes the hit if it's an atk1
 *   - Track `ticksRemaining` that counts down each round
 *
 * Kinds:
 *   wall_viva  — Muralha Viva: applies adjacency effects (def_down + DoT)
 *                to enemies standing in the 8 cells around the obstacle.
 *   wall_ring  — Prisão de Muralha Morta: pure blocker. Breaking it lets
 *                snared enemies (secondary) escape the ring.
 *   trap       — Armadilha Oculta: fires on step-over (future integration).
 */
export type TileObstacleKind = 'wall_viva' | 'wall_ring' | 'trap'

export interface TileObstacle {
  readonly col: number
  readonly row: number
  readonly kind: TileObstacleKind
  /** Team that placed the obstacle (allies may walk through? v3 silent — we treat as blocking for all). */
  readonly side: 'left' | 'right'
  /** Round counter — decrements to 0 then the obstacle is removed. */
  ticksRemaining: number
  /** ID of the character that cast the skill (for event attribution). */
  readonly sourceId: string
}

export class Grid {
  readonly cols:    number
  readonly rows:    number
  readonly wallCol: number

  private readonly _cells:     Cell[][]                    // [col][row]
  private readonly _occupants: Map<string, Position>       // characterId → Position

  /**
   * v3 §6.3 tile obstacles — keyed by "col,row". Only one obstacle per
   * tile; attempting to place a second overwrites the existing one (last
   * write wins, consistent with the general replace-on-conflict policy).
   */
  private readonly _obstacles: Map<string, TileObstacle> = new Map()

  constructor(config: GridConfig = {}) {
    this.cols    = config.cols    ?? 16
    this.rows    = config.rows    ?? 6
    this.wallCol = config.wallCol ?? 8

    // Build cell grid
    this._cells    = []
    this._occupants = new Map()

    for (let col = 0; col < this.cols; col++) {
      this._cells[col] = []
      for (let row = 0; row < this.rows; row++) {
        this._cells[col][row] = new Cell(col, row, 'open')
      }
    }

    // Mark configured wall tiles
    for (const w of config.walls ?? []) {
      const cell = this._cells[w.col]?.[w.row]
      if (cell) (cell as { type: CellType } & Cell).type !== 'wall'
        // Cell.type is readonly; reconstruct the cell
      this._cells[w.col][w.row] = new Cell(w.col, w.row, 'wall')
    }
  }

  // ── Bounds ─────────────────────────────────────────────────────────────────

  /** True when (col, row) is within the grid dimensions. */
  isInBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows
  }

  /** True when `pos` is within the grid. */
  inBounds(pos: Position): boolean {
    return this.isInBounds(pos.col, pos.row)
  }

  // ── Cell access ────────────────────────────────────────────────────────────

  /** Cell at (col, row). Null if out of bounds. */
  cell(col: number, row: number): Cell | null {
    return this._cells[col]?.[row] ?? null
  }

  /** Cell at position. Null if out of bounds. */
  cellAt(pos: Position): Cell | null {
    return this.cell(pos.col, pos.row)
  }

  // ── Territory ──────────────────────────────────────────────────────────────

  /** Which side owns the column. */
  sideOf(col: number): GridSide {
    return col < this.wallCol ? 'left' : 'right'
  }

  /** True if `col` is within `side`'s territory. */
  isInTerritory(col: number, side: GridSide): boolean {
    return side === 'left' ? col < this.wallCol : col >= this.wallCol
  }

  /** True if position is in `side`'s territory. */
  positionInTerritory(pos: Position, side: GridSide): boolean {
    return this.isInTerritory(pos.col, side)
  }

  /** All open (non-wall) cells in `side`'s territory. */
  territoryCells(side: GridSide): Cell[] {
    const result: Cell[] = []
    const [start, end] = side === 'left'
      ? [0, this.wallCol]
      : [this.wallCol, this.cols]
    for (let col = start; col < end; col++) {
      for (let row = 0; row < this.rows; row++) {
        const c = this._cells[col][row]
        if (c.isOpen) result.push(c)
      }
    }
    return result
  }

  /** True when `col` is the boundary column between the two territories. */
  isWallColumn(col: number): boolean {
    return col === this.wallCol
  }

  // ── Occupancy ──────────────────────────────────────────────────────────────

  /** Place a character on a cell. Fails if out-of-bounds, wall, or occupied. */
  place(characterId: string, col: number, row: number): GridResult {
    if (!this.isInBounds(col, row)) return Err(`Position (${col},${row}) is out of bounds`)
    const target = this._cells[col][row]
    if (target.isWall)     return Err(`(${col},${row}) is a wall`)
    if (target.isOccupied) return Err(`(${col},${row}) is occupied by '${target.occupantId}'`)

    // Remove from previous position if re-placing
    const prev = this._occupants.get(characterId)
    if (prev) this._cells[prev.col][prev.row]._vacate()

    target._occupy(characterId)
    this._occupants.set(characterId, Position.of(col, row))
    return Ok(undefined)
  }

  /** Remove a character from the grid entirely (e.g. on death). */
  remove(characterId: string): void {
    const pos = this._occupants.get(characterId)
    if (pos) {
      this._cells[pos.col][pos.row]._vacate()
      this._occupants.delete(characterId)
    }
  }

  /** The character occupying (col, row), or null. */
  occupantAt(col: number, row: number): string | null {
    return this._cells[col]?.[row]?.occupantId ?? null
  }

  /** Current position of `characterId`, or null if not on the grid. */
  positionOf(characterId: string): Position | null {
    return this._occupants.get(characterId) ?? null
  }

  /** True when (col, row) has a character on it. */
  isOccupied(col: number, row: number): boolean {
    return this._cells[col]?.[row]?.isOccupied ?? false
  }

  /** True when (col, row) can be entered: in bounds, not wall, not occupied, not obstacle. */
  isWalkable(col: number, row: number): boolean {
    const baseWalkable = this._cells[col]?.[row]?.isWalkable ?? false
    if (!baseWalkable) return false
    if (this._obstacles.has(this._obsKey(col, row))) return false
    return true
  }

  // ── v3 §6.3 Tile obstacles ────────────────────────────────────────────────

  private _obsKey(col: number, row: number): string {
    return `${col},${row}`
  }

  /**
   * Place a temporary obstacle on a tile. Fails if the tile is out of
   * bounds, a permanent wall, or currently occupied by a character.
   * Overwrites any existing obstacle on the same tile (last-write-wins).
   */
  placeObstacle(obstacle: TileObstacle): GridResult {
    const cell = this._cells[obstacle.col]?.[obstacle.row]
    if (!cell) return { ok: false, error: 'out of bounds' }
    if (cell.isWall) return { ok: false, error: 'cell is a permanent wall' }
    if (cell.isOccupied) return { ok: false, error: 'cell is occupied by a character' }
    this._obstacles.set(this._obsKey(obstacle.col, obstacle.row), obstacle)
    return { ok: true, value: undefined }
  }

  /** Remove an obstacle if present. Returns the removed obstacle, or null. */
  removeObstacle(col: number, row: number): TileObstacle | null {
    const key = this._obsKey(col, row)
    const existing = this._obstacles.get(key)
    if (!existing) return null
    this._obstacles.delete(key)
    return existing
  }

  /** Obstacle at the given tile, or null. */
  obstacleAt(col: number, row: number): TileObstacle | null {
    return this._obstacles.get(this._obsKey(col, row)) ?? null
  }

  /** True when the tile has an active obstacle. */
  hasObstacleAt(col: number, row: number): boolean {
    return this._obstacles.has(this._obsKey(col, row))
  }

  /** All active obstacles. Order is insertion order (stable). */
  getObstacles(): TileObstacle[] {
    return [...this._obstacles.values()]
  }

  /**
   * Tick every obstacle: decrement `ticksRemaining` and remove any that
   * reach zero. Returns the list of obstacles that expired (for event
   * emission by the caller).
   */
  tickObstacles(): TileObstacle[] {
    const expired: TileObstacle[] = []
    for (const [key, ob] of this._obstacles) {
      ob.ticksRemaining -= 1
      if (ob.ticksRemaining <= 0) {
        expired.push(ob)
        this._obstacles.delete(key)
      }
    }
    return expired
  }

  /** Alias for removeObstacle — semantic marker for "broken by atk1 hit". */
  breakObstacle(col: number, row: number): TileObstacle | null {
    return this.removeObstacle(col, row)
  }

  // ── Movement validation ────────────────────────────────────────────────────

  /**
   * Full movement validation for a character.
   *
   * Checks (in order):
   *   1. Character exists on grid
   *   2. Target is in bounds
   *   3. Target is not a wall
   *   4. Target is in `side`'s territory
   *   5. Target is not already occupied
   *   6. Manhattan distance ≤ `mobility`
   */
  canMoveTo(
    characterId: string,
    toCol: number,
    toRow: number,
    mobility: number,
    side: GridSide,
  ): GridResult {
    const from = this._occupants.get(characterId)
    if (!from) return Err(`Character '${characterId}' is not on the grid`)

    if (!this.isInBounds(toCol, toRow))
      return Err(`Target (${toCol},${toRow}) is out of bounds`)

    const target = this._cells[toCol][toRow]
    if (target.isWall)
      return Err(`(${toCol},${toRow}) is a wall`)

    if (!this.isInTerritory(toCol, side))
      return Err(`(${toCol},${toRow}) is not in ${side} territory`)

    if (target.isOccupied && target.occupantId !== characterId)
      return Err(`(${toCol},${toRow}) is occupied by '${target.occupantId}'`)

    const dist = from.manhattanTo(Position.of(toCol, toRow))
    if (dist === 0)
      return Err('Already at target position')
    if (dist > mobility)
      return Err(`Out of movement range (distance: ${dist}, mobility: ${mobility})`)

    return Ok(undefined)
  }

  /**
   * King variant: can teleport anywhere in own territory (no mobility limit).
   */
  canKingMoveTo(characterId: string, toCol: number, toRow: number, side: GridSide): GridResult {
    if (!this._occupants.has(characterId))
      return Err(`Character '${characterId}' is not on the grid`)
    if (!this.isInBounds(toCol, toRow))
      return Err(`Target (${toCol},${toRow}) is out of bounds`)

    const target = this._cells[toCol][toRow]
    if (target.isWall)
      return Err(`(${toCol},${toRow}) is a wall`)
    if (!this.isInTerritory(toCol, side))
      return Err(`(${toCol},${toRow}) is not in ${side} territory`)
    if (target.isOccupied && target.occupantId !== characterId)
      return Err(`(${toCol},${toRow}) is occupied`)

    const from = this._occupants.get(characterId)!
    if (from.col === toCol && from.row === toRow)
      return Err('Already at target position')

    return Ok(undefined)
  }

  /**
   * Move a character to a new tile.
   * Does NOT validate territory or mobility — call `canMoveTo` first.
   */
  moveCharacter(characterId: string, toCol: number, toRow: number): GridResult {
    const from = this._occupants.get(characterId)
    if (!from) return Err(`Character '${characterId}' is not on the grid`)
    if (!this.isInBounds(toCol, toRow)) return Err(`Out of bounds`)

    const target = this._cells[toCol][toRow]
    if (target.isWall)     return Err(`(${toCol},${toRow}) is a wall`)
    if (target.isOccupied && target.occupantId !== characterId)
      return Err(`(${toCol},${toRow}) is occupied`)

    this._cells[from.col][from.row]._vacate()
    target._occupy(characterId)
    this._occupants.set(characterId, Position.of(toCol, toRow))
    return Ok(undefined)
  }

  /**
   * All valid destination tiles for a character given mobility and side.
   * Does not include the character's current tile.
   */
  validDestinations(
    characterId: string,
    mobility: number,
    side: GridSide,
  ): Position[] {
    const from = this._occupants.get(characterId)
    if (!from) return []

    const result: Position[] = []
    const [colStart, colEnd] = side === 'left'
      ? [0, this.wallCol]
      : [this.wallCol, this.cols]

    for (let col = colStart; col < colEnd; col++) {
      for (let row = 0; row < this.rows; row++) {
        const cell = this._cells[col][row]
        if (!cell.isWalkable) continue
        const dist = from.manhattanTo(Position.of(col, row))
        if (dist >= 1 && dist <= mobility) result.push(Position.of(col, row))
      }
    }
    return result
  }

  /**
   * Get all reachable tiles within mobility range using BFS.
   * Respects walls, occupied tiles, and territory boundaries.
   * Unlike validDestinations (Manhattan distance), this cannot "jump" over walls.
   */
  getReachableTiles(charId: string, mobility: number, side: GridSide): Position[] {
    const start = this._occupants.get(charId)
    if (!start) return []

    const visited = new Set<string>()
    const result: Position[] = []
    const queue: Array<{ pos: Position; steps: number }> = [{ pos: start, steps: 0 }]
    visited.add(`${start.col},${start.row}`)

    while (queue.length > 0) {
      const { pos, steps } = queue.shift()!

      // Add to results if not the starting position
      if (steps > 0) {
        result.push(pos)
      }

      // Don't expand further if we've used all movement
      if (steps >= mobility) continue

      // Check all 4 cardinal directions
      for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as Array<[number, number]>) {
        const nc = pos.col + dc
        const nr = pos.row + dr
        const key = `${nc},${nr}`

        if (visited.has(key)) continue
        visited.add(key)

        // Must be in bounds
        if (!this.isInBounds(nc, nr)) continue

        // Must not be a wall
        const cell = this._cells[nc][nr]
        if (cell.isWall) continue

        // Must be in own territory
        if (!this.isInTerritory(nc, side)) continue

        // Must not be occupied by another unit
        if (cell.isOccupied && cell.occupantId !== charId) continue

        queue.push({ pos: Position.of(nc, nr), steps: steps + 1 })
      }
    }

    return result
  }

  /**
   * All valid king teleport destinations (full territory, ignores mobility).
   * @deprecated King no longer teleports; kept for backward compatibility.
   */
  kingDestinations(characterId: string, side: GridSide): Position[] {
    const from = this._occupants.get(characterId)
    if (!from) return []

    const result: Position[] = []
    const [colStart, colEnd] = side === 'left'
      ? [0, this.wallCol]
      : [this.wallCol, this.cols]

    for (let col = colStart; col < colEnd; col++) {
      for (let row = 0; row < this.rows; row++) {
        const cell = this._cells[col][row]
        if (!cell.isWalkable) continue
        if (col === from.col && row === from.row) continue
        result.push(Position.of(col, row))
      }
    }
    return result
  }

  // ── Push mechanics ─────────────────────────────────────────────────────────

  /**
   * Push `characterId` in `direction` for up to `force` tiles.
   *
   * Stops when:
   *   - Grid boundary is reached
   *   - A wall cell is hit
   *   - Another character is in the way
   *
   * Returns a PushResult describing what actually happened.
   * Call `moveCharacter` first if you want the Grid state updated — push
   * only SIMULATES and REPORTS; call `applyPush` to commit.
   */
  simulatePush(characterId: string, direction: Direction, force: number): PushResult {
    const from = this._occupants.get(characterId)
    if (!from) {
      return {
        characterId, from: Position.of(0, 0), to: Position.of(0, 0),
        distanceMoved: 0, requestedDistance: force,
        blocked: true, collidedWith: null,
      }
    }

    const [dc, dr] = DIRECTION_OFFSETS[direction]
    let current = from
    let moved   = 0
    let collidedWith: string | null = null

    for (let i = 1; i <= force; i++) {
      const next = Position.of(current.col + dc, current.row + dr)

      if (!this.isInBounds(next.col, next.row)) break  // hit edge

      const nextCell = this._cells[next.col][next.row]
      if (nextCell.isWall) break  // hit wall tile

      if (nextCell.isOccupied) {
        collidedWith = nextCell.occupantId
        break  // hit another character
      }

      current = next
      moved++
    }

    return {
      characterId,
      from,
      to: current,
      distanceMoved: moved,
      requestedDistance: force,
      blocked: moved < force,
      collidedWith,
    }
  }

  /**
   * Simulate AND commit the push in one step.
   * Updates grid occupancy to the final position.
   */
  applyPush(characterId: string, direction: Direction, force: number): PushResult {
    const result = this.simulatePush(characterId, direction, force)
    if (result.distanceMoved > 0) {
      this.moveCharacter(characterId, result.to.col, result.to.row)
    }
    return result
  }

  // ── Area queries ───────────────────────────────────────────────────────────

  /**
   * Resolve an area shape centred on `center` to grid Positions.
   * Out-of-bounds and wall tiles are filtered out.
   */
  area(shape: AreaShape, center: Position): Position[] {
    return resolveArea(shape, center, this)
  }

  /**
   * All character IDs occupying tiles within `shape` centred on `center`.
   */
  occupantsInArea(shape: AreaShape, center: Position): string[] {
    return this.area(shape, center)
      .map((pos) => this.occupantAt(pos.col, pos.row))
      .filter((id): id is string => id !== null)
  }

  /**
   * Check whether `targetPos` is within `shape` centred on `center`.
   */
  isInArea(shape: AreaShape, center: Position, targetPos: Position): boolean {
    return this.area(shape, center).some((p) => p.equals(targetPos))
  }

  // ── Adjacency / range ──────────────────────────────────────────────────────

  /** All in-bounds, non-wall cells adjacent (Manhattan = 1) to `pos`. */
  adjacent(pos: Position): Position[] {
    return CARDINAL_DIRECTIONS
      .map((dir) => pos.step(dir))
      .filter((p) => this.isInBounds(p.col, p.row) && !this._cells[p.col][p.row].isWall)
  }

  /** All positions within Manhattan distance `maxDist` of `center`. */
  withinRange(center: Position, maxDist: number): Position[] {
    return this.area({ type: 'diamond', radius: maxDist }, center)
  }

  // ── Wall-touch query ───────────────────────────────────────────────────────

  /**
   * True if `characterId` is standing on the tile immediately facing the
   * territory boundary.
   *   Left side: col = wallCol − 1
   *   Right side: col = wallCol
   */
  isTouchingWall(characterId: string, side: GridSide): boolean {
    const pos = this._occupants.get(characterId)
    if (!pos) return false
    return side === 'left'
      ? pos.col === this.wallCol - 1
      : pos.col === this.wallCol
  }

  /** All character IDs currently touching the wall on `side`. */
  wallTouchers(side: GridSide): string[] {
    const wallTouchCol = side === 'left' ? this.wallCol - 1 : this.wallCol
    const result: string[] = []
    for (let row = 0; row < this.rows; row++) {
      const occ = this._cells[wallTouchCol]?.[row]?.occupantId
      if (occ) result.push(occ)
    }
    return result
  }

  // ── Line of sight (simple, no partial occlusion) ──────────────────────────

  /**
   * True if there are no wall tiles between `from` and `to` along a straight
   * horizontal, vertical, or diagonal path. Returns false for non-aligned paths.
   *
   * Used for line-shape targeting validation and certain push mechanics.
   */
  hasLineOfSight(from: Position, to: Position): boolean {
    const dc = Math.sign(to.col - from.col)
    const dr = Math.sign(to.row - from.row)

    // Must be straight line
    const aligned =
      from.col === to.col ||
      from.row === to.row ||
      Math.abs(from.col - to.col) === Math.abs(from.row - to.row)

    if (!aligned) return false

    let cur = Position.of(from.col + dc, from.row + dr)
    while (!cur.equals(to)) {
      const c = this._cells[cur.col]?.[cur.row]
      if (!c || c.isWall) return false
      cur = Position.of(cur.col + dc, cur.row + dr)
    }
    return true
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────

  /** Read-only snapshot of current grid state (for tests / debugging). */
  snapshot(): GridSnapshot {
    const cells: CellSnapshot[] = []
    for (let col = 0; col < this.cols; col++) {
      for (let row = 0; row < this.rows; row++) {
        const c = this._cells[col][row]
        cells.push({ col, row, type: c.type, occupant: c.occupantId })
      }
    }

    const occupants: Record<string, { col: number; row: number }> = {}
    for (const [id, pos] of this._occupants) {
      occupants[id] = { col: pos.col, row: pos.row }
    }

    return { cols: this.cols, rows: this.rows, wallCol: this.wallCol, cells, occupants }
  }

  // ── Debug ──────────────────────────────────────────────────────────────────

  /**
   * ASCII representation for console debugging.
   * '.' = open  '#' = wall  Letter = first char of occupant ID  '|' = wall column boundary
   */
  toString(): string {
    const lines: string[] = []
    for (let row = 0; row < this.rows; row++) {
      let line = ''
      for (let col = 0; col < this.cols; col++) {
        if (col === this.wallCol) line += '|'
        const c = this._cells[col][row]
        if (c.isWall)          line += '#'
        else if (c.occupantId) line += c.occupantId[0].toUpperCase()
        else                   line += '.'
      }
      lines.push(line)
    }
    return lines.join('\n')
  }
}
