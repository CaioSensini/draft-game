# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Draft** is a tactical grid-based turn-based game prototype. Only the `game-client` is actively developed; `backend_api` and `admin_panel` are planned but not yet started.

## Development Commands

All commands run from `game-client/`:

```bash
npm run dev      # Start Vite dev server at http://localhost:5173
npm run build    # tsc + Vite bundle → dist/
npm run preview  # Preview production build
```

No test or lint scripts are configured yet.

## Architecture

### Stack
- **Phaser 3.90.0** — game engine
- **TypeScript 5.8.3** (strict mode) — language
- **Vite 7** — bundler (no vite.config.ts; uses defaults)
- Resolution: 1280×720 with FIT scaling

### Scene Flow

```
BootScene → MenuScene → ArenaScene
```

`ArenaScene` is the entire game — a single ~8000-LOC file (`game-client/src/scenes/ArenaScene.ts`). All gameplay logic lives there.

### Board

16 columns × 6 rows of 64px tiles. Cols 0–7 = Blue/Left team territory; cols 8–15 = Red/Right team territory. A visual wall sits at col 8.

### Turn Structure

Each round alternates between **Side 0 (Left/Blue)** and **Side 1 (Right/Red)**. Each side's turn has two phases:

1. **Movement Phase** (20s): Player selects a unit, clicks a highlighted valid tile. Units have role-based mobility ranges.
2. **Action Phase** (15s): Player selects attack + defense cards per unit. Cards have `targetingMode: 'unit' | 'tile' | 'none'` and targeting constraints (enemy side / ally side / self).

After both sides complete their turns, the round increments and repeats.

### Key Data Structures

```typescript
// Unit identity and board position
interface UnitData {
  id: string
  name: string
  role: 'tank' | 'king' | 'healer' | 'dps'
  side: 'left' | 'right'
  col: number; row: number
  color: number; symbol: string
}

// Card played during Action Phase
interface CardData {
  id: string; name: string
  category: 'attack' | 'defense'
  effect: 'damage' | 'heal' | 'shield' | 'bleed' | 'stun' | 'evade' | 'reflect' | 'regen' | 'area'
  range: number
  targetKind: 'enemy' | 'ally' | 'self'
  targetingMode: 'unit' | 'tile' | 'none'
  areaRadius?: number
  power: number
}
```

### Session State (ArenaScene fields)

| Field | Purpose |
|---|---|
| `unitsById` | `Map<string, UnitData>` — current unit positions |
| `unitProgress` | `Map<string, UnitProgress>` — moved/acted flags |
| `currentPhase` | `'movement' \| 'action'` |
| `currentSideIndex` | `0 \| 1` — whose turn it is |
| `roundNumber` | Incrementing round counter |
| `pendingTargeting` | Set when a card awaiting target selection is active |

### Rendering

All visuals use the **Phaser Graphics API** (no sprite sheets). Units are rendered as layered circles with symbol text inside `Phaser.GameObjects.Container`s. Animations use Phaser tweens. Floating text (damage/heal numbers) fades out over ~800ms.

### Action Resolution

After both teams choose cards, `resolveCurrentSideActions()` plays animations in role order: King → Tank → DPS → Healer. Each unit fires a projectile tween toward its target, with a flash hit effect and floating text. No actual stat/HP system exists yet — it is purely visual.

## Planned Integrations (not yet implemented)

- **Backend**: NestJS + PostgreSQL (multiplayer, persistence)
- **Desktop**: Electron wrapper
- **Mobile**: Capacitor wrapper
- **Admin Panel**: Next.js
