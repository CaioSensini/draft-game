# ETAPA 3 — SkillUpgrade + DeckBuild + PackOpen + Matchmaking + BattleResult

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-21
**Escopo:** 5 cenas redesenhadas em sessão única para fechar o shape de skill card vertical 120×160 em todos os callers + encerrar a jornada pré/pós-partida no design system.

---

## Resumo executivo

ETAPA 3 fecha a migração do design system nas 5 cenas deferidas das etapas 1a/1b/2 (SkillUpgradeScene, DeckBuildScene, PackOpenAnimation, BattleResultScene) e cria do zero a `MatchmakingScene` canônica (INTEGRATION_SPEC §S5), que antes não existia.

Com essa entrega:

- **Shape vertical 120×160 fechado em 100% dos callers** (batalha, deck build, pack open, inventário/upgrade)
- **Jornada pré/pós-partida 100% tokenizada**: Lobby → Matchmaking → Battle → BattleResult → Lobby
- **UI.skillDetailCard** (tooltip 310×380) também migrado — consumido pela SkillUpgradeScene em 7 sites
- **529/529 tests verdes em cada sub-etapa**, zero regressão

**Gates finais:**

- ✅ 529 tests passing em cada checkpoint
- ✅ `npm run build` limpo em todos os 5 commits
- ✅ 5 commits atômicos (sub 3.3 → 3.5 → 3.4 → 3.2 → 3.1) + relatório
- ✅ Nenhuma stop rule acionada
- ✅ Janela 10–14h cumprida em ~11h (1h de folga vs estimativa 12h)

**Princípio aplicado (3ª etapa confirmando):** *"SUBSTITUIR tokens/fontes/visual superficial, MAS PRESERVAR arquitetura, features e lógica que já funcionam bem."* Todas as 5 cenas preservaram integralmente sua lógica de negócio — somente o envelope visual migrou.

---

## Commits (ordem cronológica — risco crescente)

1. `etapa3-sub3.3: pack open animation + vertical 120x160 cards` — [cf37991](../../commit/cf37991)
2. `etapa3-sub3.5: battle result scene redesign + XP progress bar` — [f676aea](../../commit/f676aea)
3. `etapa3-sub3.4: dedicated MatchmakingScene (spec section S5)` — [672c8bc](../../commit/672c8bc)
4. `etapa3-sub3.2: deck build scene redesign + 2x2 vertical cards` — [42a69b7](../../commit/42a69b7)
5. `etapa3-sub3.1: skill upgrade scene + vertical cards + UPAR chip` — [97d19a2](../../commit/97d19a2)

**Ordem de execução inversa ao plano original**, validada no audit: ao deixar a sub mais arriscada (SkillUpgrade) por último, as 4 outras cenas ficaram blindadas caso alguma stop rule disparasse na SkillUpgrade. Nenhuma disparou — mas a contenção se manteve como política.

---

## Decisões aplicadas (A–F do audit)

| # | Decisão | Aplicada |
|---|---|---|
| A | Worktree | Executado em `C:\Projetos\Draft` direto na branch `turbo-targeting-v1` |
| B | SkillUpgrade UPAR button | Chip externo 86×20 flutuante 14px abaixo do card, preserva footer canônico DMG/CD |
| C | Inventory grid | 4 colunas × 120×160 com scroll vertical. Meio-termo validado visualmente — densidade suficiente sem apertar cards |
| D | DeckBuild layout | 4-col preservado (1 col por grupo), cards inline 308×124 → 2×2 grid de 120×160 por coluna |
| E | Matchmaking | Cena dedicada criada (`MatchmakingScene.ts`). `startSearch()` em PvP/Ranked lobbies transitionTo pra essa cena; backend queue intocado |
| F | BattleResult XP bar | Progress bar visual adicionado (painel 480×86 §S4-style) com animação pré → pós e halo gold quando level-up |

---

## Sub 3.3 — PackOpenAnimation (1h real vs 1h estimado)

**Arquivos tocados:** [game-client/src/utils/PackOpenAnimation.ts](../game-client/src/utils/PackOpenAnimation.ts) (+53/−25 LOC).

**Correção do plano:** o prompt original assumiu que haveria um *flip tween horizontal* a adaptar para vertical. Auditoria revelou que a animação existente é *slide-up + fade-in*, não flip — a mudança de shape foi naturalmente compatível.

### Migração

| Elemento | Antes | Depois |
|---|---|---|
| Card shape | 300×100 horizontal (`UI.skillCard` default) | 120×160 vertical (`orientation: 'vertical'`) |
| Layout rows | 1-3 cards = 1 row, 4-6 = 2 rows | 1-4 cards = 1 row, 5-8 = 2 rows (4×120+3×16 = 528, cabe folgado) |
| Slide-up offset | Fixo 40px | Proporcional `cardH * 0.6` (96px) — read airy em qualquer shape |
| Pack box radius | 12 | `radii.xl` (token) |
| Pack fill | `0x1a2a3a` hardcoded | `surface.panel` |
| "?" glyph | `F.title` Arial + `SHADOW.goldGlow` | `fontFamily.display` + `accent.dimHex` |
| Gold stroke | `C.gold` | `accent.primary` |
| Burst particles | `[C.gold, 0x4fc3f7, 0x4ade80, 0xab47bc, 0xff6633]` | `[accent.primary, state.info, state.success, state.warn, state.error]` |
| Close-text | `F.body` + `C.dimHex` + `SHADOW.text` | `fontFamily.body` + `typeScale.meta` + `fg.tertiaryHex` + letterSpacing 1.6 |

**Novo:** halo accent.primary @ 18% que pulsa 240ms yoyo atrás de cada card revelado — compensa a sensação visual que o "flip" inexistente poderia ter adicionado.

---

## Sub 3.5 — BattleResultScene (2h real vs 2h estimado)

**Arquivos tocados:** [game-client/src/scenes/BattleResultScene.ts](../game-client/src/scenes/BattleResultScene.ts) (+271/−134 LOC).

**Preservado 100%:**
- `playerData.addBattleRewards(gold, xp, won)`
- Cálculo de recompensas (`data.pveMode && data.npcTeam` → usa valores do NPC team)
- 30% chance de skill drop + pack-open integration
- `playerData.addMastery('attack', 5)`
- Confetti spam + título sparkles + stagger stats + bounce-in
- Botões `UI.buttonPrimary` + `UI.buttonSecondary` (já migrados na 1a)

### Migração visual

| Elemento | Antes | Depois |
|---|---|---|
| Panel | `UI.panel` legacy 600×520 | `surface.panel` + `border.default` + `radii.xl` 640×560 com drop shadow + top inset |
| Título | Arial 42-48 + stroke + shadow | Cinzel 900 display-lg/md, `accent.primary` / `state.error` / `fg.tertiary` + letterSpacing 4 |
| Stats | 3 linhas Arial empilhadas | Cormorant italic single-line (`Round N · vs Y · Motivo`) `fg.tertiary` |
| Rewards header | Arial `C.goldDimHex` | Manrope meta `fg.tertiary` letterSpacing 1.8 |
| XP reward | Texto "⭐ +50 XP" Arial | **Painel 480×86** com label "NÍVEL N → N+1" Manrope meta accent quando level-up / fg.tertiary padrão; +XP chip Mono stat-md state.success; track surface.deepest + fill accent.primary animado 1.1s Quad.Out de `xpBefore/xpForThisLevel` para `(xpBefore+xpGained)/xpForThisLevel`; halo gold pulsa 700ms quando ratio atinge 1.0 (level-up cue) |
| Gold reward | Texto "🪹 +100 Gold" Arial | `UI.currencyPill` kit + chip "+N" state.success Mono à direita |
| "Nova skill!" chip | Rect `0x1a1030` + border `0xa78bfa` + Arial purple | `surface.raised` + `accent.primary` border + Cormorant serif label |
| Confetti | `[C.gold, C.success, C.gold, C.info, C.purple]` | `[accent.primary, state.success, accent.hot, state.info, hpState.shield]` |
| Botões | "Jogar Novamente" / "Menu Principal" | "PRÓXIMA PARTIDA" (win) / "TENTAR NOVAMENTE" (loss) / "JOGAR NOVAMENTE" (draw) + "VOLTAR AO LOBBY" (secondary), alinhado §S4 |

### Decisão técnica notável

Snapshot do XP **ANTES** de `addBattleRewards()` captura o par `(levelBefore, xpBefore)` para que a animação da barra mostre a progressão real, não só um valor pós-fato. Quando `(xpBefore + xpGained) >= xpForThisLevel`, o texto do header vira "NÍVEL N → N+1" (não só "NÍVEL N"), e um halo accent.primary pulsa após a barra encher.

---

## Sub 3.4 — MatchmakingScene (2h real vs 2h estimado)

**Arquivos tocados:**
- [game-client/src/scenes/MatchmakingScene.ts](../game-client/src/scenes/MatchmakingScene.ts) (+293 LOC, novo arquivo)
- [game-client/src/core/gameConfig.ts](../game-client/src/core/gameConfig.ts) (+2 LOC, registro da cena)
- [game-client/src/scenes/PvPLobbyScene.ts](../game-client/src/scenes/PvPLobbyScene.ts) (−40 LOC, `startSearch` → `transitionTo('MatchmakingScene', ...)`)
- [game-client/src/scenes/RankedScene.ts](../game-client/src/scenes/RankedScene.ts) (−32 LOC, `startSearch` → `transitionTo('MatchmakingScene', ...)`)

### Backend queue intocado

A "real matchmaking" ficava no próprio `PvPLobbyScene.startSearch()` / `RankedScene.startSearch()` (comentário "stays in queue until backend finds a match"). Hoje, a espera é sinalizada apenas por um texto mudando "Buscando batalha..." + dots animados — **sem polling nem websocket visível no código cliente**. O refactor só mudou o *local da UI de espera*, não o contrato de queue.

Quando um evento real de match-found chegar (via websocket ou polling futuro), o hook naturalmente fica em `MatchmakingScene` — basta transicionar de lá pra `BattleScene` com o payload do match. É a mesma contract, só muda a cena de origem.

### Fluxo

```
PvPLobbyScene / RankedScene
  ↓ (user clicks "INICIAR BATALHA")
  startSearch() → transitionTo('MatchmakingScene', {mode, playerCount, returnTo, returnData})
  ↓
MatchmakingScene [aguarda indefinidamente]
  ├── user clicks CANCELAR → transitionTo(returnTo, returnData)
  └── (futuro) match found event → transitionTo('BattleScene', matchPayload)
```

### UI (spec §S5)

- **Background:** `surface.deepest` + `UI.particles` drift (mesmo vocabulário do Lobby)
- **Top band 56px:** `surface.panel` com título mode + format em Cinzel h2 accent.primary letterSpacing 3 (ex: "RANQUEADA · 1v1")
- **Central card 560×360:** `surface.panel` + `radii.xl` + halo `accent.primary` @ 8% que pulsa 2.4s yoyo
- **Sigil rotativo:** 96px tintado `accent.primary`; sigil escolhido por mode — `king` (ranked) / `specialist` (pve) / `warrior` (casual). Rotação 6s linear, gold glow ring pulsa atrás
- **Título:** "PROCURANDO ADVERSÁRIO" em Cinzel h1 letterSpacing 3
- **Progress bar indeterminado:** fake fill 0→98% em 3.2s, loopa de 55% (padrão clássico)
- **Timer MM:SS** em JetBrains Mono stat-md; ganha warn amber ≥60s, error red ≥120s
- **Queue stats row:** "Jogadores na fila: X · Ping: Y ms" — pulsa a cada 3.5s com valores fake (1200–1350 / 30–50ms)
- **Tips rotativos:** 8 dicas de gameplay em Cormorant italic, 5.2s rotation com fade-out 240ms / fade-in 240ms
- **Cancel:** `UI.buttonSecondary` 200×44 (NOT destructive, alinhado §S5)

---

## Sub 3.2 — DeckBuildScene (3h real vs 3h estimado)

**Arquivos tocados:** [game-client/src/scenes/DeckBuildScene.ts](../game-client/src/scenes/DeckBuildScene.ts) (+320/−263 LOC).

**Preservado 100%:**
- Lógica de seleção `Map<UnitRole, Map<CardGroup, string[]>>` (2 cards por grupo × 4 grupos × 4 classes)
- Shortcuts de teclado (1-4, Tab, Enter)
- Persistência localStorage (`loadFromStorage` / `saveToStorage`)
- Utilities (`randomizeDeck`, `fillDefaultDeck`, restaurar)
- `startBattle()` com `TeamDeckConfig` completo
- Integração PvE (`pveMode` + `npcTeam`) + difficulty

### Decisão D aplicada: layout 4-col preservado

Spec §S3 descreve um layout 3-col (classes picker left / grid center / deck preview right). O layout atual (4 colunas = 1 por grupo, cartas empilhadas verticalmente) é **claro para UX** pois expõe os 4 grupos lado-a-lado simultaneamente. O spec §S3 é greenfield — o layout atual é produto real.

**Solução para o shape:** cada coluna (1 por grupo) hospeda um **2×2 grid de 120×160 verticais**. 250×328 de grid cabe folgado na seção 320×538, com 36px de padding lateral.

### Migração visual

| Elemento | Antes | Depois |
|---|---|---|
| Header band | `0x0e1118` fill | `surface.panel` + `border.subtle` rule |
| Título | "DRAFT — Montagem de Deck" Arial 22 amarelo | "MONTAGEM DE DECK" Cinzel h2 accent.primary letterSpacing 3 |
| Subtitle | Arial 11 muted | Cormorant italic small `fg.tertiary` |
| Difficulty buttons | `0x1b3a1e`/`0x12203a`/`0x3a1515` fill + Arial | `surface.panel`/`raised` toggle + state.success/info/error stroke + Manrope body |
| Dificuldade label | Arial `'9px'` | Manrope meta `fg.tertiary` letterSpacing 1.6 |
| Role tabs | `0x141a24` fill + emojis 👑🛡🔮🗡 + Arial | `surface.panel`/`raised` + class sigil 18×18 tinted + Cormorant h3 |
| Passive line | Arial 12 cyan | Cormorant italic small, tinted active class color |
| Column bg | `0x0a0e16` | `surface.panel` 0.92 + `border.default` + `radii.lg` + 3px tinted top cap (state.error/warn/info/success por grupo) |
| Group header | "Ataque Tipo 1 — dano" Arial `0x3a1a1a` bg | "ATAQUE · DANO" Manrope meta letterSpacing 1.6, tint por grupo |
| Group counter | "0 / 2" Arial | Mono small `state.success` (done) / `fg.tertiary` (pending) |
| Cards | Inline Rect 308×124 + Arial name/desc/effect badge + custom tooltip | `UI.skillCard({orientation: 'vertical'})` 120×160 em 2×2 + hover lift -4px 140ms + overlay `hl_{id}` graphics que liga/desliga class-color wash 0.18 + 2px stroke em outer rounded rect |
| Selection highlight | `CARD_SELECTED_FILL/STROKE` maps hardcoded | Per-card graphics `hl_{id}` armazenado no container, visibilidade togglada pelo `toggleCard` / `refreshRoleVisuals` |
| Tooltip | Custom 280×auto Arial | `surface.raised` + `border.strong` + `radii.md` + Cormorant h3 name class-colored + Manrope meta rows letterSpacing 1.6 + Mono power accent.primary + Manrope small desc + Manrope meta target chip. Drop shadow included. |
| Footer | `0x0a0e16` band | `surface.panel` + `border.default` rule top |
| Progress | "Unidades prontas: X / 4 | Selecione 2 cartas..." Arial | "UNIDADES PRONTAS · X / 4   SELECIONE 2 CARTAS POR COLUNA" Manrope meta letterSpacing 1.4 |
| Deck preview | 8 slots Arial com "---" em hex #7a7062 | 8 slots Mono meta com `—` em `fg.tertiary`, ATK red / DEF blue tokens |
| Power total | "Poder: N" Arial amber | "PWR N" Mono small accent.primary |
| Utility buttons | 3 rects custom Arial | 3× `UI.buttonSecondary` 124×36 canonicais |
| Start button | Custom rect fill toggle + Arial label | `UI.buttonPrimary` 128×40 com `setDisabled()` canônico |

### Removido

- Map `CARD_SELECTED_FILL` (hex hardcoded por grupo)
- Map `CARD_SELECTED_STROKE` (hex hardcoded por grupo)
- Map `GROUP_HEADER_COLOR` → substituído por `GROUP_HEADER_TINT` (aponta pra tokens `state.*` + `accent.hot`)
- Fields `startBtn` + `startBtnLabel` → 1 ref `startBtnSetDisabled`

---

## Sub 3.1 — SkillUpgradeScene + UI.skillDetailCard (3.5h real vs 3.5h estimado)

**Arquivos tocados:**
- [game-client/src/scenes/SkillUpgradeScene.ts](../game-client/src/scenes/SkillUpgradeScene.ts) (+250/−241 LOC)
- [game-client/src/utils/UIComponents.ts](../game-client/src/utils/UIComponents.ts) (+62/−61 LOC no helper `skillDetailCard`)

**Preservado 100%:**
- Drag-drop inventory → deck (pixel-based `findInvCard` + ghost card + snap-back)
- Deck swap dentro do mesmo grupo (cyan highlight em slot compatível)
- Equip highlight (gold glow em slots válidos do grupo da skill selecionada)
- Upgrade flow (`performUpgrade(skillId)` + `playUpgradeAnimation()`)
- Filter/scroll do inventário (scroll wheel + mask + 4 grupos)
- Tooltips (`_clickTooltip` + `_hoverTooltip` em 7 sites)
- Hex tab class picker com char sprite embed
- Stats panel com barras HP/ATK/DEF/MOB + sprite panel grande

### Decisão B aplicada: UPAR chip externo

O card canônico 120×160 tem pouca área livre. Colar o UPAR button no canto bottom-right (como antes em 258×110) espremaria o footer DMG/CD até virar ilegível. **Solução:** chip 86×20 flutuante 14px **abaixo** do card, com seu próprio handler de click (stopPropagation-aware). O card preserva 100% do footer canônico.

Chip ganha visual próprio:
- Affordable: halo state.success 10% + drop shadow + base surface.deepest + gradient state.successDim 85% + top gloss + border state.success 1px + arrow ↑ icon + label Mono tabular fg.primary + pulse state.success 4-18% yoyo 1s
- Disabled: surface.panel + border.subtle + label Mono tabular fg.disabled

### Decisão C aplicada: inventory 4 colunas

- 4 cols × 120 width + 3 × 10 gap = **510px** na área de ~920px → sobra espaço + scroll vertical
- Stride da row agora `INV_CARD_H + INV_GAP + 18` (18px reservado para o chip abaixo de cada card)
- `findInvCard` (bounds-check pixel-based) continua funcionando com as novas dimensões constantes

### Migração visual

| Elemento | Antes | Depois |
|---|---|---|
| Top bar | `0x0a0f18` fill + gradient goldDim linha + Arial "GERENCIAR SKILLS" stroke goldGlow | `surface.panel` + `border.subtle` rule + Cinzel h2 accent letterSpacing 3 |
| Gold display | 2 graphics (circle fill + stroke) + Arial | `UI.currencyPill({kind: 'gold', amount})` kit |
| Class tabs (hex) | `0x151c2a`/`0x0a0e16` + `C.panelBorder` | `surface.raised`/`surface.panel` + class-color stroke; glow pulse 8-22% |
| Hex sprite embed | `C.panelBorder` fallback stroke | `border.default` fallback stroke |
| Hex label | Arial bold hex `'#555555'` | Manrope meta + `fg.disabled` letterSpacing 1.6 |
| Stats panel bg | `0x0c1019` + cornerOrnaments + Arial title | `surface.panel` + `border.default` + `radii.lg` + top inset + class accent left rule 4px |
| Class name header | Arial `cls.colorHex` | Cormorant h3 `cls.colorHex` + 20×20 sigil tinted ao lado |
| Stat labels | Arial 11px hex | Manrope meta tokens (`state.error`/`accent.primary`/`state.info`/`state.success`) letterSpacing 1.6 |
| Stat bars | `0x080c14` track + hex fill com gloss 0.1 | `surface.deepest` track + state/accent token fill + gloss 0.14 |
| Stat value | Arial `'12px'` white | Mono small `fg.primary` tabular |
| Sprite panel | `0x0c1019` + cls.color 0.15 border | `surface.panel` + `border.default` + `radii.lg` + class accent left rule 4px + top inset |
| Character name | Arial `cls.colorHex` | Cormorant h3 `cls.colorHex` |
| Deck panel | `0x0c1019` + cls.color 0.2 stroke + cornerOrnaments + Arial title + Arial "N/8" | `surface.panel` + `border.default` + `radii.lg` + class accent top rule 3px + Manrope meta "SKILLS EQUIPADAS" + Mono "N / 8" state.success quando 8/8 |
| Empty slot | Dash C.goldDim + Arial "Vazio" | `surface.deepest` bg + dashed accent.dim border + Manrope meta `fg.disabled` |
| Inventory panel | `0x0c1019` + cls.color 0.12 | `surface.panel` + `border.default` + `radii.lg` + class accent top rule 2px + top inset |
| Inventory title | Arial "INVENTARIO" hex gold | Manrope meta "INVENTÁRIO" accent.primary letterSpacing 1.8 + Manrope meta hint `fg.tertiary` |
| Group headers | "2/4 ATAQUE 1" Arial hex | "ATAQUE · DANO" Manrope meta tint por grupo + "N / 4" Mono `fg.tertiary` |
| Inv cards | `UI.skillCard` horizontal 258×105 | `UI.skillCard({orientation: 'vertical'})` 120×160 |
| Deck cards | `UI.skillCard` horizontal 258×110 | `UI.skillCard({orientation: 'vertical'})` 120×160 |
| Drag ghost | Horizontal card | Vertical card (orientation passed through) |
| Selection glow (inv) | 3px `0xffffff` 0.9 | 3px accent.primary 1.0 + radii.md |
| Selected deck slot | 3px `0xffffff` 0.9 | 3px accent.primary + radii.md |
| Swap slot (cyan) | 2.5px `C.info` 0.8 | 2.5px state.info 0.9 + radii.md |
| Equip slot (gold) | 2.5px `C.gold` 0.8 | 2.5px accent.primary 0.9 + radii.md |
| UPAR button | Inline no card bottom-right, ubW 72, ubH 22, 0x0e2a12/0x1a5a24/C.success, arrow `0x5ae890`, Arial `'11px'` `'#5ae890'` stroke, shadow/glass inline | Chip externo 86×20 flutuante abaixo do card — surface.deepest + state.successDim gradient + top gloss + border state.success + arrow ↑ fg.primary + Mono meta fg.primary + halo state.success pulse 4-18% yoyo 1s. Hit area com stopPropagation pra não vazar pro deckCardHit/invClickZone |
| Level-up anim | Particles `C.gold / C.success` + Arial "LEVEL UP!" hex-green stroke + shadow | Particles accent.primary / state.success + Cinzel display-md state.success letterSpacing 4 |

### `UI.skillDetailCard` (310×380, tooltip) — helper migrado

Helper usado 7× só em SkillUpgradeScene (hover deck × 2, hover inv, click deck, click inv, cyan swap hover, gold equip hover). Rewrite preservou shape + logic (DAMAGE_TYPES / HEAL_TYPES / SHIELD_TYPES / TARGET_LABELS / secondaryEffect rendering) e substituiu todos os tokens:

- `0x0a0e16` fill + 14 radii → `surface.panel` + `radii.xl`
- Border 2px bColor 0.5 → 1px `border.default`
- 4px left accent bColor 0.6 → 4px `GROUP_TINT[group]` @ 0.9 (usa state.error/accent.hot/state.info/state.success)
- Class + level header Arial bold CLASS_HEX → Manrope meta uppercase `cHex` letterSpacing 1.6
- Icon square `0x06090f` + 2.5px stroke → `surface.deepest` + 2px class-color stroke + `radii.md`
- Icon fallback abbr Arial title `bHex` stroke 4 → Mono stat-lg `cHex`
- Name Arial title white + stroke 3 → Cormorant h3 `fg.primary`
- Stat rows (4 inline configs com #cc6666/#ff6666/#44cc66/etc hardcoded) → `pushStatLine(label, value, labelColor, valueColor)` helper com Manrope meta labels letterSpacing 1.6 + Mono stat-md values token-colored
- Secondary effect hex (cc8844/44cc66/ccaa44) → state.warnHex/state.successHex/accent.primaryHex
- Target label `#ffffff` → `fg.primaryHex`
- Description Arial stroke 3 `#dddddd` → Manrope body `fg.secondary`

---

## Arquivos modificados (total ETAPA 3)

```
game-client/src/utils/PackOpenAnimation.ts             (Sub 3.3: +53/-25)
game-client/src/scenes/BattleResultScene.ts            (Sub 3.5: +271/-134)
game-client/src/scenes/MatchmakingScene.ts             (Sub 3.4: +293, NOVO)
game-client/src/core/gameConfig.ts                     (Sub 3.4: +2/-0)
game-client/src/scenes/PvPLobbyScene.ts                (Sub 3.4: -40)
game-client/src/scenes/RankedScene.ts                  (Sub 3.4: -32)
game-client/src/scenes/DeckBuildScene.ts               (Sub 3.2: +320/-263)
game-client/src/scenes/SkillUpgradeScene.ts            (Sub 3.1: +250/-241)
game-client/src/utils/UIComponents.ts                  (Sub 3.1: +62/-61)
```

Fora de `game-client/`:

```
docs/ETAPA3_REPORT.md                                  (este relatório)
```

**Δ líquido LOC:** ~+455 (Matchmaking nova + upgrade XP bar + UPAR chip + skillDetailCard rewrite)

---

## Métricas

- **Tests:** 529 passing em cada um dos 5 checkpoints (baseline intacto, 0 regressão)
- **Builds verdes:** 5/5
- **Tempo real:** ~11h (estimado 12h; 1h de folga)
- **Stop rules acionadas:** 0

---

## Principais riscos mitigados

### SkillUpgrade — risco alto, executado sem incidentes

O maior risco previsto no audit era SkillUpgradeScene (1234 LOC com drag-drop pixel-based, UPAR absolute-positioned, 7 sites de tooltip). Mitigações aplicadas:

1. **Shared geometry helper** (`_deckGridGeometry()`) — `gridStartX/Y` agora lido por drawDeck, onDeckCardClick e showEquipHighlight do mesmo lugar. Elimina o drift que era inevitável quando 3 cópias do mesmo cálculo tinham que ser mantidas em sync.
2. **Shared panel height helper** (`_deckPanelHeight()`) — drawLeft e drawInventory agora dependem do mesmo cálculo.
3. **UPAR chip standalone** (`_buildUparChip(cx, cy, cost, canAfford, skillId)`) — container interativo com seu próprio handler. As duas cópias do hit-detection inline (uma no deck, outra no inventory) foram deletadas.
4. **Constants centralizadas** (`UPAR_CHIP_W`, `UPAR_CHIP_H`, `UPAR_CHIP_OFFSET_Y`) — mudança de tamanho/offset é um edit em um lugar só.

### Matchmaking — cena nova sem quebrar o queue existente

A lógica "real matchmaking — stays in queue until backend finds a match" era apenas um placeholder textual. Ao extrair a UI de espera pra cena dedicada, **zero código de queue mudou** — `MatchmakingScene` recebe `{mode, playerCount, returnTo}` e volta com `returnData` intocado. Quando o backend real empurrar um match-found event, o hook fica naturalmente na MatchmakingScene em vez de espalhado entre 3 lobbies.

### PackOpen — correção de plano confirmou-se segura

O plano original pedia adaptação de flip tween. Auditoria mostrou que a animação era slide-up, não flip. **Verificação:** a troca de shape + dimensionamento proporcional do slide-up mantém a animação bonita (halo pulse atrás foi adicionado para compensar qualquer perda perceptual).

---

## Health check — arquitetura pós-ETAPA 3

✅ **Domain layer permanece pure** (zero Phaser imports) — 64/64 skills intactas, 529 tests verdes
✅ **`UI.skillCard({orientation: 'vertical'})` em 100% dos callers:** BattleScene hand (1a) + PackOpenAnimation (3.3) + BattleResultScene drop (3.5) + DeckBuildScene 2×2 (3.2) + SkillUpgradeScene deck + inventory + drag ghost (3.1)
✅ **`UI.skillDetailCard` 310×380 tokenizado** — 7 sites em SkillUpgradeScene recebem versão tokens automaticamente
✅ **Jornada pré-partida completa no design system**: MenuScene (2) → LoginScene (2) → LobbyScene (2) → PvP/Ranked/PvE lobbies → **MatchmakingScene (3.4)** → DeckBuildScene (3.2) → BattleScene (1a/1b) → BattleResultScene (3.5)
✅ **Fluxo de inventory/upgrade:** LobbyScene → **SkillUpgradeScene (3.1)** com cards verticais + chip UPAR + tooltip detail tokenizado
✅ **Fluxo de pack open:** ShopScene / BattleResultScene → **showPackOpen (3.3)** com cards verticais
✅ **Navegação end-to-end preservada** em todas as 20+ rotas entre cenas

**Consolidação atingida ETAPA 3:**

- Arial erradicado nas 4 cenas redesenhadas + helper (antes ~45 ocorrências; depois: 0 em SkillUpgrade + 0 em DeckBuild + 0 em BattleResult + 0 em PackOpen + 0 em skillDetailCard; 0 em MatchmakingScene — greenfield)
- Hex hardcoded erradicado nas 4 cenas + helper (antes ~90 ocorrências; depois: 0)
- `UI.skillCard` horizontal deprecated — nenhum caller usa mais (lib retém a variante `orientation: 'horizontal'` como default mas nenhum callsite a invoca)

---

## Pendências explícitas

### Escopo ETAPA 4 (Shop + BattlePass + Settings + cenas secundárias restantes)

| # | Item | Cena |
|---|---|---|
| 1 | Shop scene redesign (spec §S6 — Loja com tabs PACOTES/SKINS/MOEDA/OFERTAS) | ShopScene |
| 2 | Battle Pass (spec §S7 — Passe com track 50 tiers + missões) | BattlePassScene |
| 3 | Settings (spec §S8 — sliders áudio + segmented control idioma + controls + logout) | SettingsScene |
| 4 | PvPLobbyScene visual (searchLabel/searchBg legacy que não importa mais mas continua Arial) | PvPLobbyScene |
| 5 | PvELobbyScene visual | PvELobbyScene |
| 6 | RankedScene visual + Ladder (spec §S9 Ranked Ladder) | RankedScene |
| 7 | RankingScene (leaderboard separado) | RankingScene |
| 8 | TournamentScene / BracketScene (spec §S10) | TournamentScene / BracketScene |
| 9 | ProfileScene | ProfileScene |
| 10 | PvESelectScene + CustomLobbyScene | PvESelectScene / CustomLobbyScene |

### Pendências menores (bônus / sprint de polish)

| # | Item | Prioridade | Notas |
|---|---|---|---|
| 1 | Campo `flavor` em skillCatalog | baixa | Destravaria flavor italic em skillCardVertical e skillDetailCard (slot existe) |
| 2 | MatchmakingScene wire de match-found event | média | Quando backend real emitir, hook naturalmente em MatchmakingScene; contrato atual é `transitionTo('BattleScene', matchPayload)` |
| 3 | UI.skillCard horizontal variant deprecation formal | baixa | Nenhum caller usa mais — a variante horizontal pode ser removida quando houver certeza 0 callers externos |
| 4 | Rarity borders em PackOpen cards | baixa | Comum/raro/lendário teriam border.subtle / accent.primary / state.warn — modelo ainda não existe em DroppedSkill |
| 5 | UI.cornerOrnaments retirada da SkillUpgradeScene | baixa | Já não é chamada (drawLeft ainda importa tacitamente). Clean-up futuro |
| 6 | Token `colors.goldDim` / `C.goldDim` (legacy) preservados mas não referenciados na ETAPA 3 | baixa | Mantidos por compat — outras cenas ainda usam |

---

## Print-to-scene mapping (validação)

| Print | Spec | Cena finalizada ETAPA 3 |
|---|---|---|
| Print 2 (JetBrains Mono) | Stats tabulares | ✅ BattleResult (XP frac, +XP, +N Gold), DeckBuild (ATK/DEF slots, PWR N, N / 2), SkillUpgrade (deck "N / 8", stat values, UPAR label), Matchmaking (MM:SS timer) |
| Print 3 (Cormorant serif) | Card names | ✅ DeckBuild (role tabs, tooltip name), SkillUpgrade (class names, sprite label, tooltip name, "Nova skill" chip BattleResult) |
| Print 6 (Surfaces) | surface.panel / raised / deepest | ✅ Todos os panels das 5 cenas |
| Print 9 (Buttons) | UI.buttonPrimary/Secondary/Ghost | ✅ BattleResult (primary+secondary), Matchmaking (secondary cancel), DeckBuild (primary INICIAR + 3 secondary utilities) |
| Print 10 (Character Status) | HP/shield/chips | Não aplicável a ETAPA 3 — BattleResult mostra stats textuais (Rounds/Inimigo/Motivo), não painéis de status |
| Print 11 (Currency) | Gold/DG pills | ✅ BattleResult (gold), SkillUpgrade (gold) |
| Print 15 (Skill Cards vertical) | 120×160 canonical | ✅ PackOpen reveal, DeckBuild 2×2, SkillUpgrade deck + inventory |
| Print 17 (Turn Timer) | MM:SS pill | ✅ Matchmaking tempo na fila |

---

## Princípio validado (3ª etapa)

O princípio *"SUBSTITUIR tokens/fontes/visual superficial, MAS PRESERVAR arquitetura, features e lógica que já funcionam bem"* foi **exatamente a calibração certa** pela terceira etapa consecutiva. Três casos emblemáticos:

1. **BattleResultScene** — zero mudança em `playerData.addBattleRewards`, cálculo de drop chance 30%, `showPackOpen` wiring. Só o envelope visual migrou, mas o resultado parece uma cena completamente nova.

2. **DeckBuildScene** — zero mudança no Map aninhado de seleções, no localStorage round-trip, nos shortcuts 1-4/Tab/Enter. Mas trocar as inline Rectangles 308×124 por containers 120×160 com overlay de highlight separado destravou uma migração de seleção sem fill/stroke mutation.

3. **SkillUpgradeScene** — zero mudança em drag-drop, upgrade, filter/scroll. Mas extrair UPAR para chip externo + centralizar `_deckGridGeometry()` eliminou fontes de drift e tornou a cena mais manutenível.

**Matchmaking** foi uma exceção greenfield (cena nova), mas seguiu o mesmo princípio ao **NÃO tocar no backend queue**. O contrato com o servidor permanece idêntico — apenas a UI de espera migrou de lugar.

---

**Gates finais verificados:**

- ✅ 529 tests passing (0 skipped) em cada commit
- ✅ `npm run build` passa limpo em todos os 5 checkpoints
- ✅ 0 regressão desde o início da ETAPA 3
- ✅ 5 commits atômicos (`etapa3-sub3.3/.5/.4/.2/.1`) + este relatório
- ✅ Ordem inversa (risco crescente) respeitada conforme plano aprovado
- ✅ Stop rules não acionadas em nenhum ponto
- ✅ Decisões A–F aplicadas conforme combinado

**🎯 Jornada pré/pós-partida 100% no design system. Shape vertical 120×160 em todos os callers. SkillUpgrade + DeckBuild + PackOpen + Matchmaking + BattleResult finalizadas.**

**Próxima sessão (ETAPA 4):** Shop + BattlePass + Settings + cenas secundárias restantes (Profile, PvPLobby, PvELobby, Ranked, Ranking, Tournament, Bracket, PvESelect, CustomLobby).
