# Design System — Fase 1

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-21
**Escopo:** integrar tokens/assets/fontes do design system no projeto e aplicar visual em 4 componentes core.

---

## Resumo executivo

Fase 1 entrega **infraestrutura de design system** (tokens, fontes, assets) e **aplicação piloto em 4 componentes** (Button, HP Bar, Skill Card, Tooltip). Estratégia: **namespaces paralelos** — nenhum token legacy é alterado, novos tokens convivem ao lado dos antigos. Componentes migram organicamente quando telas forem redesenhadas na Fase 2.

**Gates finais:**
- ✅ 473 tests passing (0 regressão)
- ✅ `npm run build` passa em cada um dos 4 checkpoints
- ✅ 4 commits atômicos (`design-p1: import assets + integrate CSS tokens`, `load Google Fonts + configure WebFont loader`, `apply design system to Button + HP Bar + Skill Card + Tooltip`, `phase 1 report + DECISIONS update`)

---

## Tokens adicionados (por categoria)

Arquivo: `game-client/src/utils/DesignTokens.ts`.

Todos os novos namespaces são **paralelos** aos existentes — nenhum legacy foi modificado.

| Categoria | Namespace novo | Itens | Origem CSS |
|---|---|---|---|
| Auras de classe | `classGlow.*` | rei, guerreiro, executor, especialista, teamAlly, teamEnemy (todos `{color, alpha}`) | `--class-*-glow`, `--team-*-glow` |
| Superfícies navy | `surface.*` | deepest, primary, panel, raised, input | `--bg-0..4` |
| Bordas | `border.*` | subtle, default, strong, royal, royalLit | `--border-*` |
| Texto | `fg.*` | primary, secondary, tertiary, disabled, inverse (com pares Hex) | `--fg-1..4`, `--fg-inverse` |
| Acento gold | `accent.*` | primary, hot, dim (com Hex) | `--accent`, `--accent-hot`, `--accent-dim` |
| Stateful | `state.*` | success, successDim, error, errorDim, warn, warnCritical, info (com Hex) | `--success`, `--error`, `--warn`, `--warn-crit`, `--info` (valores divergem do legacy `semantic.*`) |
| Moeda | `currency.*` | goldCoin, goldCoinEdge, dgGem, dgGemEdge (com Hex) | `--gold-coin`, `--dg-gem`, `-edge` |
| HP estado | `hpState.*` | full, wounded, critical, shield (com Hex) | `--hp-full`, `--hp-wounded`, `--hp-critical`, `--hp-shield` |
| HP thresholds | `hpBreakpoint.*` | wounded=0.55, critical=0.25 | derivados INTEGRATION_SPEC §3 |
| Tile states | `tile.*` | default, defaultAlt, allySide, enemySide, hover, validMove(+Border), validSkill(+Border), areaPreview(+Border), wall, wallShine | `--tile-*` |
| Famílias de fonte | `fontFamily.*` | display, serif, body, mono | `--font-*` (Cinzel, Cormorant, Manrope, JetBrains Mono) |
| Type scale | `typeScale.*` | displayXl/Lg/Md, h1/h2/h3, body, small, meta, statLg/Md | `--fs-*` |
| Line/letter | `lineHeight.*`, `letterSpacing.*` | tight/body, display/label/body | `--lh-*`, `--ls-*` |
| Radii novos | `radii.*` | sm:4, md:6, lg:8, xl:12, pill:999 | `--r-*` (numericamente ≠ do legacy `sizes.radius.*`) |
| Spacing extendido | `spacingScale.*` | sp1..sp10 (4,8,12,16,24,32,48,64) | `--sp-*` |
| Motion | `motion.*` | easeOut, easeInOut, durFast/Base/Slow | `--ease-*`, `--dur-*` |
| Elevação | `elevation.*` | sm, md, lg, gold, inset, focusRing — spec Phaser-friendly | `--shadow-*`, `--focus-ring` |

**Total:** ~130 novos tokens em 17 namespaces.

---

## Conflitos resolvidos

1. **HP nomenclatura invertida:** legacy `colors.hp.medium=0xef4444` é na verdade o crítico (vermelho) do CSS; legacy `colors.hp.low=0xf59e0b` é o wounded (amber) do CSS. Resolvido adicionando `hpState.full/wounded/critical/shield` semânticos; legacy aliases continuam apontando pros mesmos valores numéricos (não quebra callers legados).

2. **Surfaces conflitam:** CSS navy (`#0a0f1c..#334155`) vs legacy deep black (`0x04070d`, `0x12161f`). Decisão: novo `surface.*` paralelo; componentes novos mais navy, legacy (21 arquivos) intacto deep black. Aceitável como estado intermediário — Fase 2 alinha.

3. **State/semantic divergem:** CSS `--success #10b981` vs legacy `semantic.success 0x4ade80`; `--error #ef4444` vs `semantic.danger 0xef5350`. Novo `state.*` tem valores do CSS; `semantic.*` preservado.

4. **Class-color hardcoded em skillCard:** valores inconsistentes com `colors.class.*` (warrior aparecia azul `#4a90d9`, executor roxo `#a366ff`). Substituído pelos valores dos tokens (violet, red, green, gold).

5. **Fonts Arial → Google Fonts:** legacy `fonts.heading='Arial Black'`/`fonts.body='Arial'` preservado. Novo `fontFamily.{display,serif,body,mono}` com stack Cinzel/Cormorant/Manrope/JetBrains Mono.

6. **Radii numericamente diferentes:** CSS sm=4/md=6/lg=8 vs legacy sm=5/md=8/lg=12. Novo `radii.*` ao lado do `sizes.radius.*`.

---

## Assets importados

Origem: `design-system-handoff/assets/`.
Destino: `game-client/public/assets/{logo,icons/classes,icons/currency}/`.

| Key | Path | Dims |
|---|---|---|
| `logo-wordmark` | `/assets/logo/draft-game-wordmark.svg` | 240×80 |
| `sigil-rei` | `/assets/icons/classes/rei.svg` | 64×64 |
| `sigil-guerreiro` | `/assets/icons/classes/guerreiro.svg` | 64×64 |
| `sigil-executor` | `/assets/icons/classes/executor.svg` | 64×64 |
| `sigil-especialista` | `/assets/icons/classes/especialista.svg` | 64×64 |
| `currency-gold` | `/assets/icons/currency/gold.svg` | 32×32 |
| `currency-dg` | `/assets/icons/currency/dg.svg` | 32×32 |

Registrados em `AssetPaths.ts#DESIGN_SVG_ASSETS`; carregados em `BootScene.preload()` via `this.load.svg(key, path, { width, height })`. Helper `getClassSigilKey(charClass)` disponível.

---

## Carregamento de fontes

- `index.html` adiciona `<link rel="preconnect">` para `fonts.googleapis.com` + `fonts.gstatic.com` e `<link rel="stylesheet">` para as 4 famílias Google Fonts (`Cinzel 400..900`, `Cormorant Garamond 400..700 + italic`, `Manrope 400..800`, `JetBrains Mono 400..700`), com `display=swap`.
- `BootScene.create()` inicia `document.fonts.ready` como promessa privada (`_fontsReady`). A transição para a próxima cena (`onComplete` do fade overlay) faz `await` desta promessa antes de `scene.start(...)`.
- `warmUpDesignSystemFonts(scene)` instancia 1 Text off-screen por família com alpha 0, destruindo no próximo tick. Força o cache de métricas do Phaser antes da MenuScene/LoginScene, eliminando flash-of-fallback.
- Fallback: se `document.fonts` não existir (ambientes raros), a promessa resolve imediatamente (graceful degrade).
- Nenhuma dependência nova adicionada (sem WebFontLoader).

---

## Componentes atualizados

### 1. Button (`UI.buttonPrimary / buttonSecondary / buttonGhost / buttonDestructive`)

Adicionados ao fim de `UIComponents.ts`, **ao lado** do `UI.button` legacy. Sem quebrar callers antigos.

- **§1.1 Primary:** fill `accent.primary` (#fbbf24), border `border.royal`, label `fg.inverse`. Hover → `#fcd34d` + border `royalLit`. Pressed → `accent.hot` + translateY +1px. Disabled → 40% opacity. Gold-glow shadow via offset rect. Tamanhos sm (140×36), md (200×48), lg (280×56).
- **§1.2 Secondary:** outline — fill transparente, border `border.strong`, label `fg.primary`. Hover: rgba(255,255,255,0.04).
- **§1.3 Ghost:** sem fill/border, label `fg.tertiary` → `fg.primary` no hover.
- **§1.4 Destructive:** fill `state.error`, border `state.errorDim`, label branco.

Todas retornam `{ container, hitArea, setDisabled(v) }`. Label em `fontFamily.body` peso 700, letterSpacing aproximado via `setLetterSpacing(1.5)` (≈0.14em de 11px).

### 2. HP Bar (4 sites em `BattleScene.ts`)

Novo helper `hpStatusColor(ratio)` em `UIComponents.ts` — retorna `{ fill, fillHex }` usando thresholds CSS (`0.55 / 0.25`) e cores `hpState.{full,wounded,critical}` (verde #22c55e / amber #f59e0b / red #ef4444).

Substituições:
- Painel lateral: número HP + barra de trás (linhas 1231-1241) agora usam `hpStyle.fillHex` + `hpStyle.fill`.
- Mini HP bar abaixo da unidade (linha ~2435): fill inicial via `hpStatusColor(1).fill`.
- Tween de HP update (linha ~2510): `setFillStyle(hpStatusColor(ratio).fill)`.
- Reset de dummies (linha ~3004): `setFillStyle(hpStatusColor(1).fill)`.

Cores antigas (`0x44dd44 / 0xddaa22 / 0xdd3322` e `#88cc88 / #ccaa44 / #cc4444`) removidas nesses 4 sites.

### 3. Skill Card (tokens only — shape preservado)

Spec CSS pede 120×160 vertical; shape atual é 210×105 horizontal (ou 300×150 battle). **Mudança de shape fica Fase 2** (refatorar shape afeta DeckBuildScene, SkillUpgradeScene, PackOpenAnimation, BattleScene — scope creep da Fase 1).

Mudanças aplicadas:
- `CLASS_COLORS_HEX` corrigido: `king #fbbf24`, `warrior #8b5cf6`, `specialist #10b981`, `executor #dc2626` (antes: valores inconsistentes com tokens).
- Nome da skill em `fontFamily.serif` (Cormorant Garamond, spec `h3`).
- Descrição em `fontFamily.body` (Manrope), cor `fg.secondaryHex`.

### 4. Tooltip (`UI.tooltip`)

Novo helper em `UIComponents.ts`. Spec §7:
- Fill `surface.raised` (#273449) com alpha 0.98.
- Border 1px `border.strong` (#475569).
- Shadow-md via offset rect (2,4, alpha 0.45).
- Inset highlight top 1px alpha 0.04.
- Radius `radii.md` (6px).
- Padding 12px, width min 220 / max 320.
- Heading opcional em `typeScale.meta` (11px Manrope 700), body em `typeScale.small` (13px Manrope 500) + `fg.secondary`.
- Anchor `top` (default) ou `bottom`.

Assinatura: `UI.tooltip(scene, x, y, { heading?, headingColor?, body }, { maxW?, minW?, depth?, anchor? })`.

Tooltip inline antigo do `skillCard` (linha ~995) **não foi migrado** — mantido como estava para preservar layout complexo com ícone + separador + texto. Migração orgânica em Fase 2.

---

## Pendências (Fase 2)

### Scenes secundárias (ainda não aplicam tokens)
Conforme escopo da Fase 1, as seguintes cenas NÃO foram tocadas:
- LobbyScene, ShopScene, BattlePassScene, SettingsScene, RankedScene, RankingScene, TournamentScene, BracketScene — aguardam passe de Fase 2 com tokens + spec de cenas (`INTEGRATION_SPEC.md` Part II Waves 1-3).
- DeckBuildScene, SkillUpgradeScene — aguardam redesign de Skill Card shape.
- LoginScene, MenuScene — migração de estilos/botões legacy.

### Skill Card shape
Shape 120×160 vertical do CSS spec não aplicado. Requer refactor de:
- Callers atuais (DeckBuildScene, BattleScene hand, SkillUpgradeScene, PackOpenAnimation)
- Layout interno (class band top 32px, icon circle 64, title, description 2 linhas max, footer crimson/azul)
- Estimativa: 3-4h dedicadas, não cabe na Fase 1.

### Motion design
`motion.*` tokens adicionados, mas cenas ainda usam easings/durations hardcoded. Migração orgânica.

### Paleta dupla convivendo
`colors.ui.*` (deep black) e `surface.*` (navy) coexistem. Aceitável durante transição; Fase 2 alinha.

### Tooltip inline do skillCard
Ainda usa layout próprio (ícone + separador + descrição). Consolidação com `UI.tooltip` requer repensar layout enriquecido — fora de escopo Fase 1.

### Legacy hex em BattleScene
Outros hex hardcoded em BattleScene (~30 ocorrências) ainda não migrados: textos de damage/heal flutuante, timer, status colors. Migração orgânica.

---

## Arquivos modificados

- `game-client/public/assets/logo/draft-game-wordmark.svg` (novo)
- `game-client/public/assets/icons/classes/{rei,guerreiro,executor,especialista}.svg` (novo)
- `game-client/public/assets/icons/currency/{gold,dg}.svg` (novo)
- `game-client/src/utils/AssetPaths.ts` — `DESIGN_SVG_ASSETS`, `getAllDesignSvgAssets`, `getClassSigilKey`
- `game-client/src/utils/DesignTokens.ts` — ~180 linhas de novos namespaces
- `game-client/src/utils/UIComponents.ts` — imports, `hpStatusColor`, `BUTTON_SIZES`, 4 variantes `UI.button*`, `UI.tooltip`, skillCard token fixes
- `game-client/src/scenes/BootScene.ts` — preload SVGs, font readiness gate, warm-up helper
- `game-client/src/scenes/BattleScene.ts` — 4 HP color sites migrados via `hpStatusColor`
- `game-client/index.html` — Google Fonts preconnect + stylesheet

---

## Recomendação próxima sessão

**Opção A — continuar Parte 2 da Sprint Dupla (Bloco Deck Rotativo) ✅ combinado.**
Sistema de deck/fila v3 §2.9. Audit primeiro. Estimativa 3-4h.

**Opção B — Fase 2 de design (redesenho de telas secundárias):** aplicação sistemática de tokens + Waves 1-3 do INTEGRATION_SPEC. 6-10h por wave.

**Opção C — MovementEngine modernization** (débitos residuais do Sprint Alfa).

Proceder com **A** conforme combinado.

---

**Phase 1 concluída com zero regressão. 473 tests verdes, build limpo, commits atômicos.**
