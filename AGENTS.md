# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**Draft Game** is a tactical grid-based 4v4 turn-based strategy game. The goal is to kill the enemy King. Each team has 4 classes: Rei (King), Guerreiro (Warrior), Executor, Especialista (Specialist).

Only `game-client` is actively developed. `backend_api` and `admin_panel` are planned for future phases.

## Development Commands

All commands run from `game-client/`:

```bash
npm run dev      # Start Vite dev server at http://localhost:5173
npm run build    # tsc + Vite bundle → dist/
npm run preview  # Preview production build
```

## Architecture

### Stack
- **Phaser 3.90.0** — rendering only (NO game logic in Phaser)
- **TypeScript 5.8.3** (strict mode)
- **Vite 7** — bundler
- Resolution: 1280×720 with FIT scaling

### Critical Architecture Rule

```
Phaser (input/render) → GameController → CombatEngine → EventBus → Phaser (render)
```

- **engine/** — ZERO Phaser dependencies. All game logic lives here.
- **domain/** — Pure game entities (Character, Skill, Grid, Battle, etc.)
- **scenes/** — Phaser scenes. ONLY rendering and input capture.
- **controller/** — GameController bridges input → engine.

### Scene Flow

```
BootScene → MenuScene → DeckBuildScene → BattleScene
```

**BattleScene** is the correct, event-driven battle renderer. It uses GameController and never touches CombatEngine directly.

**ArenaScene** is a LEGACY monolith (2000+ lines) — DO NOT USE for new features. It exists for reference only.

### Board

16 columns × 6 rows of 64px tiles. Wall divider at column 8.
- Left team (Blue): columns 0–7
- Right team (Red): columns 9–15

### Classes & Stats

| Class | HP | ATK | DEF | Mobility |
|-------|-----|-----|-----|----------|
| Rei (King) | 150 | 15 | 12 | 99 (free teleport own side) |
| Guerreiro (Warrior) | 180 | 16 | 18 | 2 |
| Especialista (Specialist) | 130 | 18 | 10 | 2 (diagonals) |
| Executor | 120 | 22 | 8 | 3 |

### Passives
- **Rei** — Proteção Real: -15% dano recebido (permanente)
- **Guerreiro** — Protetor: aliados adjacentes -15% dano (self não ganha)
- **Executor** — Isolado: +15% dano quando sem ninguém adjacente
- **Especialista** — Queimação: ataques reduzem cura inimiga 20% por 1 turno

### Wall Buff
+25% defesa e dano por aliado tocando o muro central. Rei só conta se os 3 outros já estiverem. Máximo: 100% def + 100% dano.

### Skill System
- 16 skills per class (4 groups of 4: attack1, attack2, defense1, defense2)
- Player equips 8 (2 from each group) in DeckBuildScene
- In battle: 4 available (2 atk + 2 def), uses 1 atk + 1 def per turn
- After use, skill rotates to back of queue
- If player skips/times out, queue does NOT rotate

### Turn Structure
1. Movement Phase (15s per character)
2. Action Phase (15s per character)
3. Resolution: defenses first, then attacks (King → Warrior → Executor → Specialist)
4. Repeat for other side, then next round

### Key Files
- `data/skillCatalog.ts` — all 64 skill definitions (source of truth)
- `data/cardTemplates.ts` — UI-facing card data for DeckBuildScene
- `data/deckAssignments.ts` — default decks for bot team
- `data/passiveCatalog.ts` — passive ability definitions
- `data/globalRules.ts` — global combat rules (wall buff, last stand, etc.)
- `engine/CombatEngine.ts` — combat orchestrator (1000+ lines)
- `engine/GameController.ts` — input → engine bridge
- `engine/EventBus.ts` — typed pub/sub
- `domain/` — pure game entities

## Planned Integrations (not yet implemented)
- **Backend**: NestJS + PostgreSQL (multiplayer, persistence)
- **Desktop**: Electron wrapper (Steam)
- **Mobile**: Capacitor wrapper (iOS, Android)
- **Admin Panel**: Next.js
