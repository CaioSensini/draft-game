# ETAPA 6 — Polish pós-design (5 ajustes)

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-22
**Escopo:** 5 ajustes finos identificados pela usuária ao jogar o projeto após ETAPA 5b. Sessão única entrega **5 commits atômicos** (sub 6.1 → 6.4) + este relatório.

---

## Resumo executivo

ETAPA 6 fecha o polish pós-design system. O projeto já estava 100% migrado (ETAPA 5b) e estes são ajustes finos de consistência e clareza visual:

1. **DG icon consistente** — 4 implementações divergentes consolidadas no SVG canônico da Shop.
2. **Battle Pass missions layout** — removido subtitle redundante, cards 195×64 → 240×80 param de ficar apertados.
3. **Long description schema + UI** — `longDescription?: string` opcional em `SkillDefinition`; hover detail card (310×460) agora mostra bolinhas de progresso + seção "DESCRIÇÃO DETALHADA" com placeholder quando o campo está vazio.
4. **Top bar lobbies consistente** — PvP e PvE alinhados ao padrão CustomLobby (ALTERAR MODO à esquerda, mode pill à direita). Ranked já estava correto.
5. **Skill card vertical refactor** — top bar (CAT·CLASSE + NV+dots), footer (stat·TIPO + UPAR integrado), sem descrição. External `_buildUparChip` removido. Aplicado em TODOS os 5 callers.

**Gates finais:**
- ✅ 529/529 tests passing em cada um dos 5 checkpoints
- ✅ `npm run build` limpo em todos os 5 commits
- ✅ 5 commits atômicos (etapa6-sub6.1 até 6.4 + este relatório)
- ✅ Nenhuma stop rule acionada
- ✅ Janela 4-5h cumprida (~3.5h reais)

---

## Commits (ordem cronológica)

| Sub | Commit | LOC delta | Tempo |
|---|---|---|---|
| 6.1 DG icon | `455e766` | +21 / −76 (net −55) | ~25min |
| 6.2 BP missions | `5dd6158` | +18 / −16 (net +2) | ~20min |
| 6.5 longDescription | `c9c8d80` | +87 / −12 (net +75) | ~45min |
| 6.3 Top bar lobbies | `6b4d51c` | +10 / −10 (net 0) | ~15min |
| 6.4 Skill card vertical | `eae19a9` | +217 / −209 (net +8) | ~85min |
| 6.6 Relatório | este commit | +docs | ~20min |

**Δ líquido total:** +30 LOC com consolidação significativa (removidas ~125 LOC do `_buildUparChip` + `drawDGCoinIcon`).

Ordem executada: **6.1 → 6.2 → 6.5 → 6.3 → 6.4** (risco crescente, conforme aprovado).

---

## Sub 6.1 — DG icon consistente

**Arquivos modificados:**
- [ShopScene.ts](../game-client/src/scenes/ShopScene.ts)
- [SkinPicker.ts](../game-client/src/utils/SkinPicker.ts)
- [BattlePassScene.ts](../game-client/src/scenes/BattlePassScene.ts)

**Decisões aplicadas:**

- Identificadas 4 implementações do ícone DG: `UI.currencyPill` (SVG padrão), `ShopScene.drawDGCoinIcon` (Graphics), `SkinPicker` inline (Graphics), `BattlePassScene.drawRewardIcon('dg')` (Graphics).
- Consolidado tudo no SVG canônico `/assets/icons/currency/dg.svg` (preloaded como `currency-dg`, o MESMO asset que `UI.currencyPill` já usa no Lobby HUD).
- Técnica: `scene.add.image(x, y, 'currency-dg').setDisplaySize(size, size).setTintFill(currency.dgGem)`.
- `drawDGCoinIcon` em ShopScene removido (não tinha mais callers).

**Lógica preservada:**
- Cores (`currency.dgGem` violet + `currency.dgGemEdge` dark) mantidas.
- Tamanhos ajustados por contexto: Shop DG items 44×44, SkinPicker LOCKED 18×18, BattlePass rewards escalam via `r × 2.2` para bater com small/medium/large.
- Alpha preservado onde aplicável (BattlePass `drawRewardIcon` respeita o alpha passado).

---

## Sub 6.2 — Battle Pass missions layout

**Arquivo modificado:**
- [BattlePassScene.ts](../game-client/src/scenes/BattlePassScene.ts)

**Decisões aplicadas:**

- Removido subtitle italic "Todas expiram junto com a temporada" (linha antiga 167-170). A mensagem já é implícita pela presença do chip "Xd restantes" na top bar.
- Cards aumentados 195×64 → 240×80. Grid 2×4 mantido.
- Painel `MISSION_H` 200 → 220 para absorver a altura extra dos cards.
- Grid Y deslocada: `py + 46` → `py + 36` (reaproveitando os 10px liberados pelo subtitle removido).
- Gap vertical 8 → 10 para respirar entre as duas linhas de cards.
- Layout interno do card:
  - Header (pill categoria + stage X/N) movido de y+10 para y+12 (breathing room).
  - Descrição movida de y+26 (origin 0.5 centralizado) para y+38 (origin 0.5 centralizado, agora abaixo do header).
  - Progress bar `y+h-14` → `y+h-16`.
  - `rightZone` reservado 50 → 54 (mais espaço pro chip +XP na direita).

**Geometria verificada:**
- Grid termina em x=28 + 4×240 + 3×10 = x=1018.
- Premium button começa em x=1080 (btnX=W-110, btnW=180).
- Gap remanescente: **62px** (espaço limpo, sem colisão).

**Lógica preservada:**
- 8 missions em 2 rows × 4 cols (chain slot model).
- States (fullyDone / done / active) + borderColor + fillColor intactos.
- Click handler da claim pill intacto.
- Premium button (OBTER PREMIUM / PREMIUM ATIVO) intacto, apenas centralizado pelo crescimento de `ph`.

---

## Sub 6.5 — Long description schema + UI

**Arquivos modificados:**
- [Skill.ts](../game-client/src/domain/Skill.ts)
- [UIComponents.ts](../game-client/src/utils/UIComponents.ts) (skillDetailCard)
- [SkillUpgradeScene.ts](../game-client/src/scenes/SkillUpgradeScene.ts) (6 call sites)

**Decisões aplicadas:**

### Schema

- `SkillDefinition.longDescription?: string` — opcional, sem default.
- `Skill.longDescription: string` readonly — inicializado em construtor (`def.longDescription ?? ''`).
- `skillCatalog.ts` intocado — as 64 skills continuam sem o campo. Usuária preenche skill a skill conforme priorizar.

### skillDetailCard (UI)

- Card cresceu 310×380 → **310×460** para acomodar a nova seção.
- **Top header**: `CLASSE · NV X` + 5 bolinhas de progresso (`●●●○○`) à direita. Preenchidas = `i < skill.level`, vazias = `surface.raised` com border.default 0.7.
- **Seção "DESCRIÇÃO"**: a descrição curta existente, agora rotulada. Até ~72px (4 linhas) com shrink de fonte 13→11.
- **Separador** subtle entre as duas seções.
- **Seção "DESCRIÇÃO DETALHADA"**: renderiza `skill.longDescription` se preenchido. Se vazio: placeholder italic "Descrição detalhada em breve." em cor `fg.disabled`.
- Auto-shrink de fonte no longDescription (12→10) se exceder a altura disponível.

### Callers

- 6 sites de `UI.skillDetailCard` em SkillUpgradeScene atualizados para passar `longDescription: <def>.longDescription` — fonte única de verdade (catalog).
- Callers NÃO passam explicitamente se o campo estiver undefined (o helper trata o caso).

---

## Sub 6.3 — Top bar lobbies consistente

**Arquivos modificados:**
- [PvPLobbyScene.ts](../game-client/src/scenes/PvPLobbyScene.ts)
- [PvELobbyScene.ts](../game-client/src/scenes/PvELobbyScene.ts)

**Decisões aplicadas:**

- **PvP:** ALTERAR MODO movido de x=W-104 (direita) → x=156 (esquerda). Mode pill movido de x=W-208 (meio-direita) → x=W-60 (borda direita). Pill width 68 → 72 para respiro da label.
- **PvE:** mesmo tratamento (ALTERAR MODO para esquerda, pill para borda direita).
- **Ranked já estava no padrão correto** (ALTERAR MODO x=156 + pill x=W-60) — sem mudanças.
- **CustomLobby é a referência** — sem mudanças.

**Ambiguidade documentada:**

A usuária relatou "riscos decorativos (linhas/riscos amarelo-escuros diagonais) em torno do título" em PvP/PvE/Ranked que NÃO existem no código atual. Grep exaustivo em:
- `drawHeader` scopes das 4 cenas
- asset preloads (AssetPaths.ts)
- qualquer chamada gráfica (`fillTriangle`, `rotation`, `angle`, `UI.cornerOrnaments`, `beginPath`, `lineStyle`)
- preload de imagens/sprites (zero matches)

Nenhum elemento diagonal ou ornamento foi encontrado. Todas as 4 cenas usam o mesmo pattern `surface.panel` fill + 1px `border.subtle` bottom rule.

**Hipótese:** a percepção de "riscos decorativos" pode ter vindo do **cluster accent.primary na direita** (ALTERAR MODO gold + mode pill gold adjacente) que PvP/PvE exibiam. A nova distribuição esquerda/direita elimina esse cluster.

Se após rebuild a usuária ainda ver marcas decorativas, precisa capturar screenshot para follow-up específico — não há suspeito de código/asset remanescente.

**Lógica preservada:**
- derivedMode (Solo/Duo/Squad) e `refreshModePill`.
- Back arrow + `transitionTo('LobbyScene')`.
- `showModeSwitcher` → PlayModesOverlay.
- Eyebrow + title centralizados (PVP/BATALHA, PVE/BATALHA|TORNEIO, RANKED/ARENA RANKEADA, CUSTOM/PARTIDA PERSONALIZADA).

---

## Sub 6.4 — Skill card vertical refactor

**Arquivos modificados:**
- [UIComponents.ts](../game-client/src/utils/UIComponents.ts) — `skillCardVertical` reescrito
- [SkillUpgradeScene.ts](../game-client/src/scenes/SkillUpgradeScene.ts) — deck + inventory callers + helper removido
- [BattleScene.ts](../game-client/src/scenes/BattleScene.ts) — hand caller
- [DeckBuildScene.ts](../game-client/src/scenes/DeckBuildScene.ts) — deck caller
- [PackOpenAnimation.ts](../game-client/src/utils/PackOpenAnimation.ts) — reveal caller

### Novo layout do card 120×160

```
┌──────────────────────────────┐
│ ATAQUE · GUERREIRO           │ Linha 1 — meta letterSpacing 1.4, fg.inverse
│ NV 3 ● ● ● ○ ○               │ Linha 2 — mono NV X + 5 dots
├──────────────────────────────┤ ← classColor divider (32px top band)
│                              │
│        ·●●●●●·               │ Icon circle (r=20, surface.raised + class stroke)
│          ICN                 │
│        ·●●●●●·               │
│                              │
│      NOME DA SKILL           │ Cormorant 13px, auto-shrink 10
│                              │
├──────────────────────────────┤ ← footer separator
│ DMG 25 · LINHA     CD 2      │ Row 1 — stat·TYPE left + CD right
│ ↑ UPAR 300g                  │ Row 2 (conditional) — CTA full-width
└──────────────────────────────┘
```

### Decisões de design

**Top band (32px, class-color wash):**
- Line 1 (y=-hh+8): `CAT · CLASSE` — Manrope meta, letterSpacing 1.4, `fg.inverse`, auto-shrink 11→8 se "ESPECIALISTA"+"ATAQUE" overflowar 104px.
- Line 2 (y=-hh+22): `NV X` + 5 dots — Mono meta + `scene.add.circle(r=2.2)`. Filled = `fg.inverse` sólido, unfilled = preto 25% com border inverse 45%.
- Divider preto 28% 1px no fim da band (y=-hh+32).

**Middle (fixed 90px from y=-hh+38 to y=hh-38):**
- Icon circle (r=20) centralizado em y≈-hh+62.
- Skill name Cormorant abaixo, auto-shrink 13→10 se overflowar largura/altura.

**Footer (38px, surface.deepest):**
- Row 1 (y=footerTop+10): `${STAT_LABEL} ${power}` + (if targetType/areaShape) ` · TIPO` left; `CD N` right.
- Row 2 (y=footerTop+26, conditional): `↑ UPAR Xg` se `canAfford` (state.success bg + border) ou `Xg` disabled (surface.panel bg + border.default). Clicável apenas se `canAfford`.

### Derivação stat + TYPE

- **Stat label/value:**
  - Damage types (damage, true_damage, area, bleed, burn, poison, lifesteal, mark): `DMG X` + `dsState.errorHex`
  - Heal types (heal, regen, revive): `HEAL X` + `dsState.successHex`
  - Shield: `SHLD X` + `dsState.infoHex`
  - Evade / reflect: `EVADE` (sem power) + `dsState.infoHex`
  - Outros (def_up/atk_up/cleanse/…): `PWR X` ou vazio se power≤0

- **TYPE label** (só quando `targetType` presente):
  - `single` → "ALVO"
  - `self` → "PRÓPRIO"
  - `lowest_ally` → "ALIADO"
  - `all_allies` → "ALIADOS"
  - `area` + areaShape.type:
    - `line` → "LINHA"
    - `cone` → "CONE"
    - `ring` → "ANEL"
    - `diamond/square` → "ÁREA"
    - `single` (tile) → "TILE"

### Callers

| Caller | Passa targetType | Passa areaShape | UPAR integrado |
|---|---|---|---|
| BattleScene hand | ✅ skill.targetType | ✅ skill.areaShape | ❌ (read-only) |
| DeckBuildScene | ✅ card.targetType | ❌ (mock sem areaShape) | ❌ (mock) |
| SkillUpgradeScene deck | ✅ def.targetType | ✅ def.areaShape ?? null | ✅ quando eligible |
| SkillUpgradeScene inventory | ✅ def.targetType | ✅ def.areaShape ?? null | ✅ quando eligible |
| PackOpenAnimation | ✅ catalogEntry?.targetType | ✅ catalogEntry?.areaShape ?? null | ❌ (read-only) |

### Remoções

- **`_buildUparChip`** em SkillUpgradeScene (~90 LOC): retirado. UPAR agora vive dentro do footer do card.
- **Constantes** `UPAR_CHIP_W`, `UPAR_CHIP_H`, `UPAR_CHIP_OFFSET_Y`: removidas.
- **`_deckPanelHeight`**: reserva reduzida de `+28` para `+12` (sem mais espaço pro chip externo).
- **`ROW_STRIDE`** no inventory grid: reduzido de `INV_CARD_H + INV_GAP + 18` para `INV_CARD_H + INV_GAP` (sem chip externo abaixo).

### Lógica preservada

- **Descrição** continua em `UI.skillDetailCard` (hover) — apenas não renderizada NO card pequeno (user requirement).
- **Progress dots em BATALHA** passam `level:1` (placeholder — domain Character não carrega owned skill level; ownership vive em playerData). Isso mostra 1 dot filled em qualquer skill em batalha. Pode ser refinado futuramente com lookup em playerData.getSkills() no `_makeCardBtn`, se priorizado.
- **Selection glow / highlight** preservados em todas as cenas (BattleScene drawHighlight, SkillUpgradeScene isSelected).
- **performUpgrade(skillId)** callback continua chamando o pipeline existente (playerData.spendGold + playerData.upgradeSkill).
- **`animateLastDot`** (progress gain animation no horizontal card) continua funcionando para aquela orientação.

---

## Gates finais

| Checkpoint | Tests | Build |
|---|---|---|
| Baseline | 529/529 ✓ | ✓ |
| Após 6.1 | 529/529 ✓ | ✓ |
| Após 6.2 | 529/529 ✓ | ✓ |
| Após 6.5 | 529/529 ✓ | ✓ |
| Após 6.3 | 529/529 ✓ | ✓ |
| Após 6.4 | 529/529 ✓ | ✓ |

Zero regressão em 529 tests desde o início do projeto Combat Engine — as 6 etapas de design + ETAPA 6 mantiveram a baseline intacta.

---

## Débitos residuais / ambiguidades

### 1. "Riscos decorativos" em top bars (não encontrados no código)

Usuária relatou linhas diagonais amarelo-escuras em torno do título das top bars de PvP/PvE/Ranked. Grep exaustivo não encontrou nenhum elemento diagonal/ornamental. A mudança da sub 6.3 (alinhamento de layout com CustomLobby) elimina o cluster accent-primary à direita que PvP/PvE exibiam — hipótese mais provável de causa visual. Se a percepção persistir após rebuild, precisa de screenshot para follow-up específico.

### 2. Progress dots em BattleScene hand usam `level:1`

O skill card em combate não sabe o level do skill do character (playerData.ownedSkills tem a info, Character domain não). Solução futura: `_makeCardBtn` faz lookup em `playerData.getSkills().find(s => s.skillId === skill.id)` e passa `level: owned?.level ?? 1`. Custo: 1 lookup por rebuild da hand (não é hot path). Deferido para sessão futura, se priorizado.

### 3. longDescription do catálogo permanece vazia

As 64 skills em `skillCatalog.ts` não têm `longDescription` preenchido. Detail card exibe placeholder "Descrição detalhada em breve." Preenchimento skill-a-skill fica a cargo da usuária.

### 4. DeckBuildScene mock não tem `areaShape`

O mock do DeckBuildScene tem `card.targetType` mas não `card.areaShape`. Cards `area` no deck build mostrarão "ÁREA" genérico em vez de LINHA/CONE/ANEL. Irrelevante para o produto final — o DeckBuildScene tem mock próprio que deve dar lugar ao catalog real quando backend estiver pronto.

---

## Verificação end-to-end (estática)

Navegação dos fluxos afetados validada por leitura estática:

| Fluxo | Status |
|---|---|
| LobbyScene → ShopScene (DG pill clicável) | ✓ intacto |
| ShopScene tabs (skills/skins/dg) | ✓ DG items com ícone SVG consistente |
| LobbyScene → BattlePassScene (pulse button) | ✓ missions com cards 240×80 + rewards DG SVG |
| LobbyScene → SkillUpgradeScene | ✓ deck grid + inventory com cards novos + UPAR integrado |
| LobbyScene → PvP/PvE/Ranked/Custom (top bar layout) | ✓ ALTERAR MODO alinhado, pill direita |
| PvP/PvE/Custom → SkinPicker (LOCKED state) | ✓ DG icon SVG consistente |
| BattleScene hand (cards 2×2 lateral) | ✓ cards com bolinhas + stat·TIPO |
| PackOpenAnimation reveal | ✓ cards com targetType/areaShape do catálogo |
| SkillUpgradeScene hover → detail card 310×460 | ✓ bolinhas + DESCRIÇÃO + DESCRIÇÃO DETALHADA (placeholder) |

---

## Métricas

- **Duração real:** ~3.5h vs estimativa 4.5-5.5h (1-2h de folga)
- **Commits:** 5 atômicos + 1 relatório = 6 commits
- **LOC delta líquido:** +30 (consolidação de ~125 LOC removidos compensou o novo código)
- **Stop rules acionadas:** 0
- **Regressões funcionais:** 0
- **Tests baseline:** 529/529 em cada checkpoint

---

## Princípio preservado

*"SUBSTITUIR tokens/fontes/visual superficial, MAS PRESERVAR arquitetura, features e lógica que já funcionam bem."*

Validado em todas as 5 sub-etapas:
- Sub 6.1: ícones substituídos, cores/alpha/tamanhos preservados.
- Sub 6.2: layout do card redimensionado, state machine (fullyDone/done/active) intacta.
- Sub 6.5: schema opcional (zero breakage), skillDetailCard preserva geometria core.
- Sub 6.3: só posição de botões/pills; derivedMode, lock state, match logic, transições — tudo intacto.
- Sub 6.4: card refactor visual completo MAS interactive/hit areas, performUpgrade, selection highlight, progress animation — tudo preservado.

---

**ETAPA 6 fechada.** Projeto permanece 100% migrado no design system + 5 ajustes finos aplicados sem regressão. Próximas ações ficam a critério da usuária (preenchimento de `longDescription`, mobile landscape audit, bundle splitting, etc. — débitos do DESIGN_SYSTEM_FINAL_REPORT).
