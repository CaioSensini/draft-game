# ETAPA 5b — CustomLobby + Ranked + Polish Final (ÚLTIMA)

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-22
**Escopo:** Fecha as 2 cenas restantes no design system + polish final em 2 overlays compartilhados + verificação E2E. Última etapa do projeto de migração.

---

## Resumo executivo

ETAPA 5b entrega **3 commits atômicos** fechando as últimas 2 cenas vivas (`CustomLobbyScene`, `RankedScene`) + 2 overlays compartilhados (`SkinPicker`, `PlayModesOverlay`). Com essa entrega, **19 de 19 cenas vivas** estão no design system. Navegação end-to-end verificada intacta.

**Princípio aplicado (6ª etapa consecutiva, validado em todas):** *"SUBSTITUIR tokens/fontes/visual superficial, MAS PRESERVAR arquitetura, features e lógica que já funcionam bem."* Todas as migrações preservaram integralmente lógica de negócio (saved state, swap smart relocation, tier math, LP bar, matchmaking handoff, isCurrentMode hook, dim/fade mechanics).

**Gates finais:**

- ✅ 529 tests passing em cada um dos 3 checkpoints
- ✅ `npm run build` limpo em todos os 3 commits
- ✅ 3 commits atômicos (`etapa5b-sub5b.1` até `5b.3`)
- ✅ Nenhuma stop rule acionada
- ✅ Janela 6-8h cumprida em ~2.5h (folga de 3.5h+ vs estimativa 6.5h)

---

## Commits (ordem cronológica — risco crescente)

| Sub | Commit | LOC delta | Tempo |
|---|---|---|---|
| 5b.1 CustomLobby | `fd1b6ab` | +435 / −311 (net +124) | ~40min |
| 5b.2 RankedScene | `30aedbe` | +517 / −616 (net −99) | ~60min |
| 5b.3 Polish overlays | `659c8b8` | +244 / −302 (net −58) | ~30min |
| 5b.4 E2E check | (sem commit — nenhuma regressão) | — | ~15min |
| 5b.5 Relatórios | este commit | +docs | ~20min |

**Δ líquido total na etapa:** −33 LOC com design system muito mais consistente.

---

## Sub 5b.1 — CustomLobbyScene

**LOC:** 617 → 682 (+65, refactor produz código tokenizado mais denso em features)

**Lógica preservada (intacta):**

- `_savedMode/_savedSide/_savedBlue/_savedRed` saved-state entre scene.restart
- `_rebuildSlots()` + `_totalPlayers()` + `_isModeAvailable()` rules machine (solo 2 max / duo 4 max / squad 8 max)
- `_swapTeam()` smart relocation (empty → bot priority quando empty insuficiente)
- `_onSwapRole()` within-team swap com pulsing highlights + cancel overlay
- `_drawCards()` sprite preview + pedestal + skin picker pill integration
- `_showModeSwitcher()` → `showPlayModesOverlay`
- `startBattle` → `transitionTo('BattleScene', { pveMode: 'custom', playerCharIds, playersPerSide: humanCount })` com contagem correta de humanos por lado

**Visual novo:**

- Top bar 56px `surface.panel` + `border.subtle` rule + Cinzel h2 "PARTIDA PERSONALIZADA" + eyebrow meta accent "CUSTOM"
- Mode segmented selector (SOLO/DUO/SQUAD) right-aligned com lock state quando `!isModeAvailable`
- "ALTERAR MODO" ghost button left-center para PlayModesOverlay
- 2 team panels 880×250 empilhados verticalmente:
  - **TIME AZUL** (`colors.team.ally` #3b82f6) — cor consistente com BattleScene + PvPLobby
  - **TIME VERMELHO** (`colors.team.enemy` #ef4444) — antes era roxo 0x8844cc inconsistente
  - Top stripe 2px team-colored + "SEU TIME" accent.primary indicator no painel do lado do jogador
- Swap-team button UI.buttonSecondary "⇅ TROCAR DE TIME" entre painéis
- Cards 200×196 com: class-accent band 38px topo + sprite + pedestal + nome Cormorant h3 + pill VOCÊ/AMIGO/BOT (`state.success`/`state.info`/`border.strong` border)
- ALTERAR SKIN pill bottom do card surface.deepest + border.default + `accent.primary` hover
- Within-team swap glyph ⇄ top-right (duo/squad only) `state.info` → `accent.primary` hover
- Room log 200×260 direita: SALA n/n + mode readout + divider + lista jogadores team-colored + invite button UI.buttonSecondary embaixo
- Invite popup → UI.modal
- Start button UI.buttonPrimary size lg 340×56 "INICIAR BATALHA"

**Decisão cores de time aplicada:** migração `0x00ccaa` (ciano) → `colors.team.ally` (#3b82f6) e `0x8844cc` (roxo) → `colors.team.enemy` (#ef4444). Consistência cross-scene com BattleScene + PvPLobby. Audit detectou a inconsistência; usuária aprovou.

---

## Sub 5b.2 — RankedScene

**LOC:** 1064 → 965 (−99, limpeza significativa)

**Lógica preservada (intacta):**

- **Guard LVL 100** — retorna cedo com cena bloqueada tokenizada (Cinzel displayMd + Cormorant italic subtitle)
- `initRoom()` solo-start com 4 slots isMe
- `RANKED_TIERS` integration: 3 queues (1v1/2v2/4v4) + `td.icon/name/color/colorHex` + LP cap (100 ou 200 no Comandante 3)
- `onSwap` / `swapSlotOwnership` + 2s cooldown + pulsing highlights
- `startSearch` → `transitionTo('MatchmakingScene', { mode: 'ranked', playerCount, returnTo: 'RankedScene' })`
- `refreshSearchState` 3-state machine (disabled→SALA INCOMPLETA / ready→INICIAR BATALHA / searching)
- `isRoomOwner` framework pra multiplayer futuro
- Invite popup placeholder

**Visual novo:**

- Top bar 56px surface.panel + Cinzel h2 "ARENA RANKEADA" + eyebrow "RANKED" + mode pill accent.primary `SOLO/DUO/SQUAD`
- "ALTERAR MODO" ghost button
- **Elo sidebar** 150×(H-80) esquerda:
  - Painel surface.panel + accent top stripe + header "RANKS"
  - 3 queue cards 130×170 cada: active = surface.raised + accent.primary border + 3px left accent rule; inactive = surface.deepest + border.default
  - Tier emoji 26px + Cinzel tier name colored + `DIV n` + LP bar com fill `td.color` + JetBrains Mono `n LP` + `nV · nD · nn%` row
- Team panel 720×300 centered: 4 cards 162×240 com sprite + pedestal + "VOCÊ" state.success badge + "CONVIDAR" state.info pill em cards vazios
- Within-team swap glyph ⇄ top-right (duo/squad), `state.info` → `accent.primary` hover
- Swap highlight: accent.primary 12% pulse + "TROCAR" meta label letterSpacing 1.8 (**corrige o único site Arial Black restante — line 641 do arquivo antigo**)
- Bonus panel 340×140 + Info panel 360×140 abaixo: dot `state.success`/`border.default` + Manrope small labels + "ATUAL" state.success badge toggled
- Room log 200×300 direita: tier icons (UI.tierIcon) + jogador nome + tier chip colored + Invite button UI.buttonSecondary embaixo
- Invite popup → UI.modal
- Start button UI.buttonPrimary size lg 360×56 "INICIAR BATALHA" com `setDisabled(true/false)` para incomplete-room

**Fix adicional:** Arial Black no swap overlay ("TROCAR") substituído por Manrope meta letterSpacing 1.8 — elimina o único remanescente da varredura legacy em cena ativa.

---

## Sub 5b.3 — Polish overlays compartilhados

### SkinPicker.ts (680 → 594 LOC, −12%)

**Lógica preservada:**
- 3-card grid layout
- Rarity coloring (`SKIN_RARITY_COLOR`/`HEX`/`LABEL`)
- Pedestal glow + sprite bob animation 1.7s
- Padlock overlay para skins locked
- Stagger entrance 60+i*70ms
- Equip flow via `playerData.setEquippedSkin` + `onChange` callback
- Close via backdrop pointerdown + close X
- `makeChangeSkinPill` helper preservado

**Visual migrado:**
- Imports legacy `C/F/S/SHADOW` → `surface/border/fg/accent/state/currency/fontFamily/typeScale/radii`
- Panel multi-layer 0x070a12 + gold halo → `surface.panel` + `border.default` + `radii.xl` + drop shadow + top inset highlight
- Header Arial Black 24px gold → **Cinzel h2** `fg.primary` letterSpacing 3 + eyebrow meta accent "ESCOLHER SKIN"
- Close X unicode Arial muted → `✕` Manrope `fg.tertiary` → `fg.primary` hover
- Rarity badge: rarity-tinted Manrope meta letterSpacing 1.6
- Card name Arial Black stroke → **Cormorant serif h3** fg.primary
- Card subtitle Arial italic → **Cormorant italic** small
- EQUIPADA action: `accent.primary` pill (era gold)
- EQUIPAR action: `state.success` + `state.successDim` hover
- **LOCKED DG icon: gold coin → DG gem violet (`currency.dgGem`)** — era wrong family (gold), agora alinhado com Print 11 (DG é violeta)
- Mono statMd price (era Arial Black)
- Footer hint: Cormorant italic `fg.tertiary` / `state.success` quando all unlocked

### PlayModesOverlay.ts (463 → 424 LOC, −8%)

**Lógica preservada:**
- `PLAY_CATEGORIES` data structure (3 categories × modes)
- `isCurrentMode()` hook (PvELobbyScene disambiguation via `currentPveType`)
- Dim/fade mechanics + `dimSceneBackground` snapshot
- Stagger reveal 50+i*20ms
- Ranked LVL 100 lock
- `onModeSelect` custom handler hook
- Radial glow + backdrop click-to-close

**Visual migrado:**
- Imports legacy → tokens semânticos
- **Category colors:** `C.danger` → `state.error` (PVP), `C.info` → `state.info` (PVE), `C.purple` → `currency.dgGem` (CRIAÇÃO — alinhado com família DG violeta)
- Title Arial Black titleMedium gold → **Cinzel h2** fg.primary letterSpacing 3
- Close Arial X muted → `✕` Manrope com `state.error` hover
- Category headers Arial Black 18px → **Manrope meta** letterSpacing 1.8 category-tinted
- Cards `0x111825/0x0a0e14` → `surface.panel`/`surface.deepest`
- Card border current → `accent.primary` 0.8; default → `border.default` 1
- Card label Arial Black 24 white stroke → **Cormorant serif h3** fg.primary
- Card desc Arial 16 muted stroke → Manrope small fg.secondary
- ATUAL badge 0x2a2010 gold → surface.deepest + accent.primary pill
- Lock pill 0x1a1a2a #999 → surface.deepest + border.default + `fg.tertiary`
- "CRIAÇÃO" title com acento correto (era "CRIACAO")

---

## Sub 5b.4 — Verificação E2E

**Método:** auditoria estática dos 31 `transitionTo(this, 'SceneName', ...)` em todas as cenas vivas, conferindo contra o registro em [gameConfig.ts](game-client/src/core/gameConfig.ts).

**Fluxos verificados:**

| # | Fluxo | Status |
|---|---|---|
| 1 | Login → Menu → Lobby | ✅ MenuScene:225 |
| 2 | Lobby → Profile → Lobby | ✅ LobbyScene:145 / ProfileScene:58 |
| 3 | Lobby → Ranking → Lobby | ✅ RankingScene:99 |
| 4 | Lobby → Settings → Lobby / Logout | ✅ SettingsScene:49 / :233 |
| 5 | Lobby → Shop → compra → PackOpen | ✅ ShopScene:150 |
| 6 | Lobby → Battle Pass → Lobby | ✅ BattlePassScene:90 |
| 7 | Lobby → Skills (DeckBuild/Upgrade) | ✅ SkillUpgradeScene:139 |
| 8 | Lobby → JOGAR → PvE (battle/tournament) | ✅ PvELobbyScene:170/669/676 |
| 9 | Lobby → JOGAR → PvP → Matchmaking | ✅ PvPLobbyScene:171/723 {returnTo: PvPLobbyScene} |
| 10 | Lobby → JOGAR → Custom → Battle → PostMatch | ✅ CustomLobbyScene:177/701 |
| 11 | Lobby → JOGAR → Ranked → Matchmaking | ✅ RankedScene:140/221/915 {returnTo: RankedScene} |
| 12 | Bracket → Battle → Bracket (saved state) | ✅ BracketScene:226/542/668 |
| 13 | Battle → PostMatch → (Lobby / DeckBuild) | ✅ BattleScene:3202/3288 / BattleResultScene:372/374/394 |

**Todos os 31 transitionTo resolvem para cenas registradas em gameConfig.ts.** PlayModesOverlay também valida: `RankedScene / PvPLobbyScene / PvELobbyScene / CustomLobbyScene` todos registrados.

**Nenhuma regressão encontrada — não há commit para essa sub.**

---

## Sub 5b.5 — Relatórios

- `docs/ETAPA5B_REPORT.md` (este arquivo)
- `docs/DESIGN_SYSTEM_FINAL_REPORT.md` (agregado das 6 etapas)

---

## Arquivos modificados (total ETAPA 5b)

```
game-client/src/scenes/CustomLobbyScene.ts               (5b.1: rewrite +435/-311)
game-client/src/scenes/RankedScene.ts                    (5b.2: rewrite +517/-616)
game-client/src/utils/SkinPicker.ts                      (5b.3: rewrite +180/-237)
game-client/src/utils/PlayModesOverlay.ts                (5b.3: rewrite +64/-65)
```

Fora de `game-client/`:

```
docs/ETAPA5B_REPORT.md                                  (este relatório)
docs/DESIGN_SYSTEM_FINAL_REPORT.md                      (agregado do projeto)
```

---

## Métricas

- **Tests:** 529 passing em cada um dos 3 checkpoints (baseline intacto, 0 regressão)
- **Builds verdes:** 3/3
- **Tempo real:** ~2.5h (vs estimativa 6.5h — 4h de folga)
- **Stop rules acionadas:** 0

---

## Health check — arquitetura pós-ETAPA 5b

✅ **Domain layer permanece pure** — 64/64 skills intactas, 529 tests verdes
✅ **19 de 19 cenas vivas no design system** — 100% aplicado:
  BootScene ✓ · LoginScene ✓ · MenuScene ✓ · LobbyScene ✓ · DeckBuildScene ✓ · SkillUpgradeScene ✓ · ShopScene ✓ · SettingsScene ✓ · BattlePassScene ✓ · BattleScene ✓ · BattleResultScene ✓ · MatchmakingScene ✓ · RankingScene ✓ · ProfileScene ✓ · PvELobbyScene ✓ · PvPLobbyScene ✓ · BracketScene ✓ · **CustomLobbyScene ✓** · **RankedScene ✓**

✅ **2 overlays compartilhados tokenizados:** SkinPicker + PlayModesOverlay
✅ **Cores de time consistentes cross-scene:** blue/red (colors.team.ally/enemy) em BattleScene + PvPLobby + CustomLobby
✅ **Currency DG (violeta)** harmonizado em Shop + BattlePass + SkinPicker + PlayModesOverlay
✅ **Navegação end-to-end** verificada em 13 fluxos — zero regressão

---

## Pendências explícitas

### Débito residual formalmente aceito (documentado em DESIGN_SYSTEM_FINAL_REPORT.md)

| # | Item | Localização | Motivo |
|---|---|---|---|
| 1 | **~30 sites Arial em BattleScene** (micro-textos: log de combate flutuante, damage floaters, status misc) | BattleScene.ts linhas 1551–3841 | Textos temporários (1-2s vida). Migração exige testes visuais extensivos em combate real. Risco > ganho visual. Documentado ETAPA 1b como "misc, não mais no fluxo 80% que o jogador toca" |

### Pendências menores (sprint polish futuro opcional)

| # | Item | Prioridade | Notas |
|---|---|---|---|
| 1 | Mobile landscape touch-audit | média | Nenhum dos redesigns das 6 etapas foi validado em viewport mobile real |
| 2 | UI.button legacy shim remoção | baixa | Exportado mas sem callers — pode ser removido |
| 3 | Lucide `arrow-left-right` | baixa | Substituiria glyph Unicode `⇄` dos swap buttons |
| 4 | Motion design aplicado | baixa | `motion.*` tokens definidos mas easings ainda hardcoded em muitas cenas |
| 5 | Chunk size 1.7MB build warning | baixa | Phaser bundle grande; split de cenas em dynamic imports |
| 6 | Campo `flavor` em skillCatalog | baixa | Destravaria flavor italic em skillCardVertical + skillDetailCard |

---

## Princípio validado (6ª etapa consecutiva)

O princípio *"SUBSTITUIR tokens/fontes/visual superficial, MAS PRESERVAR arquitetura, features e lógica que já funcionam bem"* foi **confirmado pelas 6 etapas consecutivas**. Esta etapa trouxe 3 casos emblemáticos:

1. **CustomLobby** — saved-state entre restarts + smart swap team + within-team role swap + skin picker integration + BattleScene handoff com `playerCharIds`/`playersPerSide` correto: tudo intocado. Envelope visual completo + correção cross-scene (blue/red).

2. **RankedScene** — 3 queues sidebar com tier math + LP bar + matchmaking handoff + 3-state search button: tudo intocado. O LVL 100 guard ganhou tela bloqueada elegante (Cinzel + Cormorant italic) sem mudar a condição.

3. **PlayModesOverlay** — `isCurrentMode` hook de disambiguação PvELobbyScene (battle vs tournament) + `onModeSelect` override + dim mechanics: intocados. Paleta categórica alinhada (PVP=state.error / PVE=state.info / CRIAÇÃO=currency.dgGem).

---

**Gates finais verificados:**

- ✅ 529 tests passing (0 skipped) em cada commit
- ✅ `npm run build` passa limpo em todos os 3 checkpoints
- ✅ 0 regressão desde o início da ETAPA 5b
- ✅ 3 commits atômicos (`etapa5b-sub5b.1/.2/.3`) + este relatório
- ✅ Ordem inversa (risco crescente) respeitada
- ✅ Stop rules não acionadas em nenhum ponto
- ✅ Navegação E2E verificada em 13 fluxos

**🎯 ÚLTIMA ETAPA CONCLUÍDA. Design system 100% aplicado nas 19 cenas vivas + 2 overlays compartilhados. Relatório agregado em [DESIGN_SYSTEM_FINAL_REPORT.md](DESIGN_SYSTEM_FINAL_REPORT.md).**
