# DEVELOPMENT.md - Guia de Desenvolvimento

Este documento fornece diretrizes técnicas para desenvolvedores do Draft.

---

## 🏗️ Arquitetura do Projeto

### Layers

```
main.ts (Phaser Config)
   ↓
BootScene → MenuScene → ArenaScene
               ↓
         (Toda gameplay)
               ↓
    types.ts + data/* + arenaUtils.ts
```

### Responsabilidades

| Arquivo | Responsabilidade |
|---------|------------------|
| `main.ts` | Config Phaser, resolução, scenes |
| `types.ts` | Tipos globais, interfaces |
| `constants.ts` | Cores, dimensões, timings, regras |
| `arenaUtils.ts` | Funções helper reutilizáveis |
| `cardTemplates.ts` | Definição de 16 cartas |
| `initialUnits.ts` | Setup inicial de 8 unidades |
| `unitStats.ts` | Stats base por role |
| `progression.ts` | Sistema de XP (não integrado) |
| `ArenaScene.ts` | 🔴 **TODO**: Refatorar em submódulos |

---

## 🔴 Refatoração Necessária: ArenaScene.ts

**Problema**: 8000+ linhas em um único arquivo (unmaintainable)

**Solução Proposta**: Extrair em `GameManagers` separados

### Estrutura Pós-Refator

```
scenes/
├── ArenaScene.ts          (orchestrator principal, ~500 LOC)
├── managers/
│   ├── BoardManager.ts     (grid, tiles, wall)
│   ├── UnitManager.ts      (units, positioning, collision)
│   ├── CardManager.ts      (deck, card selection, resolution)
│   ├── PhaseManager.ts     (movement, action, turn flow)
│   ├── CombatManager.ts    (damage, effects, status)
│   ├── VisualManager.ts    (rendering, animations)
│   └── InputManager.ts     (clicks, selection, validation)
└── arenaUtils.ts          (helpers)
```

### Padrão: Manager

```typescript
class BoardManager {
  constructor(private scene: Phaser.Scene) {}

  initializeBoard(): void {}
  drawTiles(): void {}
  isValidTile(col, row): boolean {}
  getTile(col, row): TileData {}

  private isInBounds(col, row): boolean {}
}
```

**Benefícios**:
✅ Responsabilidade única por manager  
✅ Testes unitários possíveis  
✅ Manutenção mais fácil  
✅ Reutilização em outras cenas  

---

## 📝 TypeScript Strict Mode

🔴 **NÃO PERMITIDO**:
```typescript
const value: any = someValue          // ❌ any
const result = obj as unknown as str   // ❌ double cast
function func(x) { }                   // ❌ implicit any
const x: string | undefined = getValue()
if (x) console.log(x.length)           // ❌ pode ser undefined aqui
```

✅ **CORRETO**:
```typescript
const value: SomeType = someValue     // ✅ typed
const result = obj as string          // ✅ single cast if necessary
function func(x: number): void { }    // ✅ typed params
const x = getValue() ?? 'default'     // ✅ handle null/undefined
```

---

## 🎨 Constantes

**Sempre use `constants.ts` em vez de magic numbers**:

❌ **Evite**:
```typescript
const rect = this.add.rectangle(950, 650 + 150, 240, 48, 0x3a7a45)
const phaseText = this.add.text(320, 100, 'Movement Phase', ...)
this.time.delayedCall(900, () => {})
```

✅ **Use**:
```typescript
import { UI, COLORS, TIMINGS } from '../data/constants'

const rect = this.add.rectangle(UI.ACTION_BUTTON_X, ..., UI.ACTION_BUTTON_WIDTH, UI.ACTION_BUTTON_HEIGHT, COLORS.ATTACK_BG)
const phaseText = this.add.text(UI.PHASE_TEXT_X, 100, 'Movement Phase', ...)
this.time.delayedCall(TIMINGS.ACTION_RESOLUTION_DELAY, () => {})
```

---

## 📚 Helper Functions

**Reutilize `arenaUtils.ts` ou crie new helpers**:

✅ Bom uso:
```typescript
import { calculateDistance, getHpBarColor } from './arenaUtils'

const dist = calculateDistance(unit.col, unit.row, target.col, target.row)
if (dist > unit.stats.mobility) return false

const color = getHpBarColor(hp / maxHp)
this.healthFill.setFillStyle(color)
```

❌ Evite duplicação:
```typescript
// Em 5 lugares diferentes
const dist = Math.abs(col1 - col2) + Math.abs(row1 - row2)
```

---

## 🔄 Handle Maps & Collections

**Padrão para `Map<string, T>`**:

```typescript
// ❌ Unsafe
const unit = this.unitsById.get(unitId)
console.log(unit.name)  // Erro se undefined!

// ✅ Safe
const unit = this.unitsById.get(unitId)
if (!unit) return  // ou throw error
console.log(unit.name)

// ✅ Modern
const unit = this.unitsById.get(unitId)
unit?.name  // Optional chaining
```

---

## 🎯 Naming Conventions

| Tipo | Convenção | Exemplo |
|------|-----------|---------|
| Constants | SCREAMING_SNAKE | `BOARD_WIDTH`, `DEFAULT_HP` |
| Colors | Hex values | `0x3b82f6` |
| Variables | camelCase | `selectedUnitId`, `phaseTimer` |
| Functions | camelCase | `calculateDistance()`, `getActiveUnits()` |
| Classes | PascalCase | `UnitManager`, `CombatResolver` |
| Types/Interfaces | PascalCase | `UnitData`, `CardEffect` |
| Private/Protected | `_prefix` (optional) | `_validateMove()` |
| JSDoc tags | `@param`, `@returns`, `@throws` | Ver exemplos em arenaUtils.ts |

---

## ✅ Checklist para Novo Código

### Antes de Commit

- [ ] Código passa **`npm run build`** (sem erros)
- [ ] Sem **`any`** ou **`@ts-ignore`** adicionados
- [ ] Sem **magic numbers** (use `constants.ts`)
- [ ] Funções público têm **JSDoc comments**
- [ ] Nomes são **descritivos** e seguem convenção
- [ ] Código foi **testado** no navegador
- [ ] **Commits** são atômicos

### Para PR Review

- [ ] Descrihir **O quê** foi mudado
- [ ] Explicar **Por quê** foi necessário
- [ ] Anotou **Efeitos colaterais** potenciais
- [ ] Linkoud **Issues** relacionadas

---

## 🐛 Debugging

### Dev Server

```bash
npm run dev          # http://localhost:5173
```

Open DevTools (F12) → Console para erros.

### Build Errors

```bash
npm run build        # mostra erros TS + Vite
npm run build 2>&1   # captura stderr também
```

### Type Checking

```bash
npx tsc --noEmit     # Verifica tipos sem emitir JS
```

---

## 🚀 Performance

### Current Status
- ⚠️ **Chunk size**: Phaser é grande (~1.2MB minified)
- ✅ **TypeScript**: Strict mode, bom type-checking
- 🔴 **TODO**: Code-splitting, dynamic imports

### Otimizações Futuras

1. **Code-split** ArenaScene usando dynamic imports
2. **Lazy-load** card images quando implementado
3. **Memoize** cálculos custosos (e.g., pathfinding)
4. **Throttle** event handlers (mouse moves, etc)

---

## 🧪 Testing (TODO)

Estrutura recomendada:

```bash
game-client/
├── src/
├── __tests__/
│   ├── unit/
│   │   └── arenaUtils.test.ts
│   └── integration/
│       └── ArenaScene.test.ts
└── jest.config.js
```

**Setup**:
```bash
npm install --save-dev jest @types/jest ts-jest
npx jest --init
npm test              # Run tests
```

---

## 📖 Documentação de Código

### JSDoc Example

```typescript
/**
 * Calculate Manhattan distance between two grid points.
 * 
 * @param col1 - Column of first point (0-15)
 * @param row1 - Row of first point (0-5)
 * @param col2 - Column of second point
 * @param row2 - Row of second point
 * @returns Manhattan distance (non-negative integer)
 * 
 * @example
 * const dist = calculateDistance(0, 0, 3, 4)
 * console.log(dist)  // 7
 */
export function calculateDistance(
  col1: number,
  row1: number,
  col2: number,
  row2: number
): number {
  return Math.abs(col1 - col2) + Math.abs(row1 - row2)
}
```

---

## 🔗 Git Workflow

```bash
# Branch naming
game-client/fix/unit-damage-calc
game-client/feat/new-card-effect
docs/clarify-deck-system

# Commits
git commit -m "fix: Correct warrior guard reduction to 25%"
git commit -m "feat: Add bleed effect to dark cards"

# Push & PR
git push origin feature/branch-name
# Create PR with template
```

---

## 📊 Architecture Decision Log (ADL)

Quando fizer mudanças arquiteturais, documente em `docs/adr/`:

```
docs/adr/0001-use-managers-pattern.md
```

**Conteúdo**:
- Context
- Decision
- Consequences
- Alternatives Considered
