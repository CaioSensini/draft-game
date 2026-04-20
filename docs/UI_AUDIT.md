# UI_AUDIT.md — Touch-first readiness audit (Sprint 0.7)

> Auditoria dos componentes reutilizáveis em `src/utils/UIComponents.ts`
> contra o alvo touch-first (Steam + iOS + Android landscape).
> Criado em 2026-04-20.

---

## Status atual

| Componente | Linhas | Interativo? | Min 44×44? | Touch hooks? | Status |
|------------|--------|-------------|------------|--------------|--------|
| `panel`            | ~74-88    | ❌ | — | — | ✅ OK (não interativo) |
| `button`           | ~94-185   | ✅ | **✅** (Sprint 0.7) | **✅** (Sprint 0.7) | ✅ **OK** |
| `progressBar`      | ~189-210  | ❌ | — | — | ✅ OK (não interativo) |
| `badge`            | ~214-243  | ❌ | — | — | ✅ OK (não interativo) |
| `goldText/bodyText/mutedText` | ~248-280 | ❌ | — | — | ✅ OK |
| `sectionTitle`     | ~285-315  | ❌ | — | — | ✅ OK |
| `background`       | (ambiente)| ❌ | — | — | ✅ OK |
| `particles`        | (ambiente)| ❌ | — | — | ✅ OK |
| `fadeIn`           | (anim)    | ❌ | — | — | ✅ OK |
| `backArrow`        | ~484-540  | ✅ | ⚠️ parcial | ❌ ausente | 🟡 **TODO** |
| `skillCard`        | ~570-1010 | ✅ | ⚠️ depende do tamanho | ❌ ausente | 🟡 **TODO** |
| Inputs HTML (LoginScene) | — | ✅ | ⚠️ padrão CSS só | ❌ | 🟡 **TODO** |

---

## Sprint 0.7 — o que foi entregue

1. **Constante `MIN_TOUCH_TARGET = 44`** (src/utils/UIComponents.ts)
2. **Helper `touchHitSize(w, h, min?)`** — calcula `{ hitW, hitH }` expandindo invisivelmente o hit area quando o visual for menor que o mínimo
3. **`UI.button()` touch-first:**
   - Hit area aplica `touchHitSize()` automaticamente (44×44 default)
   - Novas opções: `onTouchStart`, `onTouchEnd`, `onHover`, `onHoverEnd`, `minTouchSize`
   - `onPress` continua sendo o callback primário (dispara em `pointerdown` + 80ms delay)

Nenhum call site existente foi modificado — API é backward compatible. Hooks são opt-in.

---

## TODO — componentes que precisam atualização touch-first

### 1. `backArrow()` (linha ~484)

**Problema:** hit area é `circle(size/2)`. Se `size` for passado como 24 (caso comum), hit area fica 24×24 — abaixo dos 44pt.

**Fix proposto:**
```typescript
// antes
const hit = scene.add.circle(0, 0, size / 2, 0x000000, 0.001)

// depois
const hitRadius = Math.max(size / 2, MIN_TOUCH_TARGET / 2)
const hit = scene.add.circle(0, 0, hitRadius, 0x000000, 0.001)
```

Adicionar hooks `onTouchStart`/`onTouchEnd` no estilo do `button()`.

**Prioridade:** média (back arrow é onipresente mas raramente o alvo principal)
**Esforço:** 15min
**Risco:** baixo (visual fica igual, só hit area expande)

---

### 2. `skillCard()` (linha ~570)

**Problema:** skill cards em DeckBuildScene são renderizados ~124×308 (suficiente). Em SkillUpgradeScene inventário podem ser menores. Não há enforcement central.

**Fix proposto:**
```typescript
// Aceitar opção minTouchSize no opts, aplicar touchHitSize() no hit área
const { hitW, hitH } = touchHitSize(w, h, opts?.minTouchSize ?? MIN_TOUCH_TARGET)
```

Adicionar hooks `onTouchStart`/`onTouchEnd` + feedback scale diferenciado pra touch (desabilitar hover scale em touch devices se possível).

**Prioridade:** alta (skill cards são alvo de seleção frequente)
**Esforço:** 30min (muitos call sites espalhados — precisam validar)
**Risco:** médio (validar que layout de DeckBuildScene ainda cabe)

---

### 3. Inputs HTML (LoginScene)

**Problema:** `<input>` tags têm `padding: 12px 14px` + `font-size: 14px`, gerando altura ~42px — marginalmente abaixo dos 44pt. Em dispositivos com viewport scale diferente (iOS landscape compacto) pode ficar apertado.

**Fix proposto:**
- Aumentar padding vertical para 14px
- `font-size: 16px` previne zoom automático no iOS quando o input foca
- Adicionar `touch-action: manipulation` nos inputs para evitar atraso de 300ms (já coberto pelo body rule, validar)

**Prioridade:** média-alta (login é a primeira interação do usuário)
**Esforço:** 20min
**Risco:** baixo (mudança cosmética)

---

### 4. Interações inline em scenes (não via UIComponents)

Auditoria fora de UIComponents identificou padrões a corrigir quando relevantes:

- **BattleScene:** células de grid são ~64×64px (OK pra 44pt). Skill cards laterais são ~220×X (OK). Botões inline (cancel, end-movement, confirm) variam — **auditar quando extrair managers (backlog 0.4)**.
- **LobbyScene:** ícones da bottom bar são 4 ícones dentro de largura de tela — precisa validar em landscape mobile que cada um chega a 44×44 efetivo.
- **ShopScene:** cards 220×280 — OK.
- **SettingsScene:** toggle switch 72×36 — hit area está abaixo dos 44pt verticalmente. Toggle tem zona clicável invisível de ~120×28, ainda abaixo em uma das dimensões.

Prioridade geral desses: **média** — aguardar o próximo sprint de polish pós-Sprint 0.

---

## Recomendações para sprint futuro de touch polish

### Prioridade 1 (antes de release mobile)
- [ ] Aplicar `touchHitSize()` no `backArrow()` e `skillCard()`
- [ ] Aumentar padding vertical dos `<input>` em LoginScene para atingir 44+
- [ ] Auditar todos os `setInteractive()` inline em scenes e substituir por `touchHitSize()`

### Prioridade 2 (polish)
- [ ] Detectar `'ontouchstart' in window` no boot e adaptar feedback: em touch, usar flash curto em vez de hover sustentado
- [ ] Desabilitar `useHandCursor` em touch devices (é meaningless)
- [ ] Adicionar haptic feedback via `navigator.vibrate(10)` em cliques importantes (Android-only)

### Prioridade 3 (longo prazo)
- [ ] Componente `<TouchButton>` de alto nível que encapsula tudo (min size, feedback, haptic, acessibilidade)
- [ ] Modo "acessível" com áreas 56×56 (Material Design extended)
- [ ] Gestures (swipe para trocar tab, pinch para zoom em bracket screens)

---

## Gate Sprint 0.7

- [x] `UI_AUDIT.md` criado com lista de pendências
- [x] `UIComponents.ts` expõe `onTouchStart`/`onTouchEnd` + `touchHitSize()` helper
- [x] `MIN_TOUCH_TARGET = 44` central e exportado
- [x] `button()` aplica min-size automaticamente
- [x] Nenhuma regressão em call sites existentes (API backward compatible)
- [ ] `backArrow` e `skillCard` ainda precisam do mesmo tratamento (documentado como TODO acima)

**Status:** **Entregue parcialmente como combinado** — estrutura e API prontas; aplicação completa em `backArrow`/`skillCard`/scenes fica no backlog.
