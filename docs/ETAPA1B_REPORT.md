# ETAPA 1b — BattleScene Final (Status Panel + Unit Token + Skill Cards 120×160 + Lucide)

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-21
**Escopo:** Sub 1.5, 1.6, 1.7 (battle-only), 1.9. Fecha a reforma visual da BattleScene.

---

## Resumo executivo

ETAPA 1b completa os 4 pontos restantes do redesign da BattleScene listados como pendências na ETAPA 1a. Com essa entrega a tela de combate fica 100% alinhada ao design system para tudo que o jogador toca em ~80% da partida (status de todos os personagens, unit tokens no grid, mão de cartas, botões top-bar, modais).

**Gates finais:**

- ✅ 529 tests passing em cada sub-etapa (0 regressão ao longo das 4)
- ✅ `npm run build` passa em cada sub-etapa
- ✅ 4 commits atômicos + este relatório
- ✅ Escopo Opção A (battle-only para Sub 1.7) respeitado — SkillUpgradeScene, PackOpenAnimation, DeckBuildScene permanecem horizontais e foram formalmente endereçadas em ETAPA 3
- ✅ Nenhuma stop rule acionada; estimativa 6.5h cumprida (Passo 0 + 1.5 + 1.6 + 1.7 + 1.9 + relatório)

---

## Commits (ordem cronológica)

1. `etapa1b-sub1.5: character status panel refactor` — 4c7d8a4
2. `etapa1b-sub1.6: unit token team ring + sigil indicator` — f093c6c
3. `etapa1b-sub1.7: skill card 120x160 vertical + hand 2x2 reflow (battle-only)` — 25cad03
4. `etapa1b-sub1.9: lucide icons library + core replacements` — 282e294

---

## Sub 1.5 — Character Status Panel

**Spec:** INTEGRATION_SPEC §3 + Print 10.

**Arquivos tocados:** `game-client/src/scenes/BattleScene.ts`.

**Retired tokens legacy:**

- `Arial Black` / `Arial` com `stroke: '#000000' strokeThickness: 3` em role name, HP number, stat labels, status effects, wall buff
- Cores hardcoded `'#44dd44' / '#dd4444' / '#555555'` nos stat deltas
- Cores hardcoded `0x00ccaa / 0x8844cc` no highlight do card
- STATUS_COLORS hardcoded para 15 status types (`'#ffdd00'`, `'#00ccaa'`, etc)
- Fundo `0x0a0e18` + stripe com 2px alpha 0.5 (substituído por `surface.panel` + border design-system)

**Adotado:**

| Elemento | Antes | Depois |
|---|---|---|
| Frame | `0x0a0e18` fill + team-tint border alpha 0.12 | `surface.panel` + `border.default` + team stripe 2px alpha 0.45 |
| Portrait | (ausente) | Class-color disc 36px + sigil SVG overlay (`sigil-{role}`) tintado `fg.inverse` |
| Class label | Role name Arial Black stroke | Manrope `meta` 11/700 letterSpacing 1.6, tinta class color |
| Unit name | (ausente — só role) | Cormorant Garamond h3 18/600, `fg.primary` |
| HP bar bg | `0x331111` fill | `surface.deepest` + `border.subtle` stroke |
| HP fill | `hpStatusColor` (já) | mesmo + top inset highlight `0xffffff` alpha 0.08 |
| Shield overlay | (ausente) | Stripes diagonais `hpState.shield` alpha 0.40–0.55, largura proporcional ao `char.totalShield` |
| HP number | Arial stroke | JetBrains Mono `small` tabular, colorido por hpStatusColor |
| Stat deltas ATK/DEF/MOV | Arial + cores hex hardcoded | Manrope `meta` labels + Mono `small` values, tokens `state.success / state.error / fg.disabled` |
| Wall buff | Arial Black 11 | Mono `meta`, `accent.primary` |
| Status chips | Linhas de texto Arial Black 13 coloridas | Chips 26×18 rounded (`radii.sm`), border por polaridade (`buff → state.success`, `debuff → state.error`, `neutral → hpState.shield`), label Mono `meta` |
| Highlight (selected) | `0x00ccaa / 0x8844cc` tint | `surface.raised` + `accent.primary` 2px gold frame |

**Infra nova:**

- `_statusHpElems: Map<unitId, { hpText, hpBarFill, shieldStripes, shieldLabel, barX, barY, barW, barH }>` — rastreia referências ao HP bar + shield overlay, permitindo refresh live via eventos.
- Método `_refreshStatusPanelHp(unitId)` extraído; chamado tanto no `_drawMiniStatusCard` inicial quanto no loop do `_refreshStatusPanels` — garantindo que damage/heal/shield gains reflitam no painel imediatamente (antes o painel era static após primeira render — gap de UX reparado).
- `_rebuildStatusPanel` agora usa `availH` para calcular quantas rows de chips cabem (2–3 rows típicas sem overflow).

---

## Sub 1.6 — Unit Token

**Spec:** INTEGRATION_SPEC §5 + Print 18.

**Arquivos tocados:** `game-client/src/scenes/BattleScene.ts`.

**Decisão confirmada na audit:** NÃO adicionar 4º ring persistente (a spec pede "team ring 3px" mas o token já tem 3 rings state-based + sprite procedural team-tinted). Ao invés disso: migração das cores dos 3 rings existentes para tokens + adicionar class sigil chip bottom-right como indicador persistente da classe.

**Retired hardcodes:**

| Elemento | Antes | Depois |
|---|---|---|
| moveRing | `0x00ccaa` stroke 2 | `colors.team.ally/enemy` stroke 3 (identifica lado dono durante movimento) |
| focusRing | `0xffffff` stroke 2 | `accent.primary` stroke 2 (gold — INTEGRATION_SPEC §5 "selected") |
| activeRing | `0x00ff88` stroke 3 | `state.success` stroke 3 (canonical green token, #10b981) |
| hpBarBg | `0x331111` | `surface.deepest` + `border.subtle` stroke 1 |
| shieldBar | `0x4488ff` alpha 0.7 | `hpState.shield` (`#94a3b8`) alpha 0.7 |

**Novo:**

- Class sigil chip bottom-right: disc 18×18 (raio 9) em `surface.panel` alpha 0.95 + 1px class-color stroke + sigil SVG tintado class color ocupando a parte interna. Usa os sigils já pré-carregados pela Fase 1.
- Total de GameObjects adicionados: 2 por unidade × 8 unidades = 16 — perf negligível.

**Preservado intacto:**

- `drawCharacterSprite` procedural (skin system)
- `CharacterAnimator` (idle/hop/attack/hurt/death)
- Death-state alpha 0.22 já existente
- `flashRect` / `roleLabel` / `statusDots` / pos/hpText hidden

---

## Sub 1.7 — Skill Card 120×160 vertical + Hand 2×2 reflow (battle-only)

**Spec:** INTEGRATION_SPEC §2 + Print 15.

**Arquivos tocados:**
- `game-client/src/utils/UIComponents.ts` — novo `UI.skillCardVertical` + `orientation` param em `UI.skillCard`
- `game-client/src/scenes/BattleScene.ts` — reflow completo de constantes da mão + `_rebuildCardButtons` + `_makeCardBtn` + button bar + mini log Y

**Novo shape vertical 120×160:**

- Frame `surface.panel` fill + 1.5px class-color stroke + `radii.md` (6)
- Shadow drop offset 1,3 alpha 0.40
- Class band topo 24px fill class color solid + "CATEGORIA · CLASSE" em Manrope `meta` letterSpacing 1.6, `fg.inverse`
- Icon circle 44 diameter centralizado (surface.raised fill + 1.5px class stroke) — renderiza PNG se disponível senão 2-letter abbreviation
- Title: Cormorant Garamond 14/600, clamp automático 14→10 pra 2 linhas max
- Description: Manrope 10/400 `fg.secondary`, clamp 2 linhas max
- Footer 26px tingido por categoria: `attack → state.error`, `heal → state.success`, `shield/evade → state.info`
  - Label esquerda: `DMG N / HEAL N / SHLD N / EVADE`
  - CD à direita em JetBrains Mono
- Separator line footer 1px alpha 0.25

**Hand reflow 2×2:**

| Constante | Antes | Depois |
|---|---|---|
| SKILL_COL_W | 220 | 260 |
| CARD_W | 210 | 120 |
| CARD_H | 105 | 160 |
| CARD_GAP | 4 | 8 |
| HAND_COLS | — | 2 (novo) |
| HAND_ROWS | — | 2 (novo) |
| HAND_PAD_X | — | 6 (novo) |
| HAND_TOTAL_H | — | 328 (novo — 2×160+8) |

Layout resultante: atk1/atk2 top row, def1/def2 bottom row. Button bar `barCenterY` e mini log `miniLogY` ambos referenciam `HAND_TOTAL_H` (antes referenciavam `4 * (CARD_H + CARD_GAP)`).

**Selection highlight:**

- Selected: `accent.primary` 2px offset +3px (spec §2 "selected state")
- Hovered: class-colored glow 2px alpha 0.85 (antes: `0xef5350` crimson / `0x4fc3f7` cyan hardcoded)

**Callers preservados em `orientation: 'horizontal'` (default):**

- SkillUpgradeScene deck (4×2 grid)
- SkillUpgradeScene inventory (scrollable)
- SkillUpgradeScene drag card
- PackOpenAnimation flip tween

Esses 4 callers seguem a decisão Opção A da audit: scene-level redesign pertence à ETAPA 3 junto com DeckBuildScene (ver Pendências abaixo).

---

## Sub 1.9 — Lucide Icons

**Spec:** INTEGRATION_SPEC §11 + Print 20.

**Arquivos tocados:**
- `game-client/package.json` (`lucide-static` devDep + `assets:lucide` script)
- `game-client/scripts/copy-lucide-icons.mjs` (novo)
- `game-client/public/assets/icons/ui/*.svg` (14 SVGs copiados)
- `game-client/src/utils/AssetPaths.ts` — `LUCIDE_ICON_NAMES`, `getLucideIconKey`, `getAllLucideIconAssets`
- `game-client/src/scenes/BootScene.ts` — preload dos 14 ícones
- `game-client/src/utils/UIComponents.ts` — helper `UI.lucideIcon`
- `game-client/src/scenes/BattleScene.ts` — substituições em back + surrender
- `game-client/src/utils/UIComponents.ts` — substituição do close X em `UI.modal`

**Pipeline de assets:**

1. `npm i -D lucide-static` (1.8.0, 45 MB em node_modules, NÃO bundled)
2. `npm run assets:lucide` roda `scripts/copy-lucide-icons.mjs` que copia os 14 SVGs curados de `node_modules/lucide-static/icons/` para `public/assets/icons/ui/`
3. BootScene preload carrega todos em 48×48 (2× target size 24px pra render crisp quando escalado)
4. `UI.lucideIcon(scene, name, x, y, size, tint)` retorna `Phaser.GameObjects.Image` com `setTintFill` aplicado

**Curated list (14 ícones):**

Core UI: `arrow-left`, `flag`, `x`, `settings`, `timer`
Skill-domain (preload para uso futuro): `swords`, `shield`, `heart-pulse`, `droplet`, `flame`, `snowflake`, `zap`, `wind`, `crown`

**Substituições aplicadas:**

| Site | Antes | Depois |
|---|---|---|
| BattleScene back button (training) | `'← Voltar'` (unicode U+2190 + texto) | Lucide `arrow-left` 14px + label `'  Voltar'` |
| BattleScene surrender button | `'Render-se'` só texto | Lucide `flag` 12px + label `'  Render-se'` |
| UI.modal close X | Unicode `'\u2715'` Manrope h3 | Lucide `x` 16px com hover tint swap `fg.tertiary → fg.primary` |

**Timer badge:** mantido sem ícone inline. O tabular Mono MM:SS da ETAPA 1a já é legível e a seção de 64px do badge não tem folga horizontal para encaixar ícone sem empurrar "Round N". Decisão documentada no commit.

**Anti-blur:** todos ícones source 48×48, render default 24px (scale 0.5). Para renders ≤48px qualidade é crisp; acima de 48px haveria blur (não é o caso hoje).

---

## Arquivos tocados (total)

```
game-client/src/scenes/BattleScene.ts                  (todas as 4 subs)
game-client/src/scenes/BootScene.ts                    (1.9)
game-client/src/utils/UIComponents.ts                  (1.7 + 1.9)
game-client/src/utils/AssetPaths.ts                    (1.9)
game-client/package.json                               (1.9)
game-client/scripts/copy-lucide-icons.mjs              (1.9, novo)
game-client/public/assets/icons/ui/*.svg               (1.9, 14 novos)
```

Fora do `game-client/`:

```
docs/ETAPA1B_REPORT.md                                 (este relatório)
```

---

## Métricas

| Sub | LOC adicionadas | LOC removidas | Δ líquido |
|---|---|---|---|
| 1.5 Status Panel | +319 | -147 | +172 |
| 1.6 Unit Token | +43 | -11 | +32 |
| 1.7 Skill Card | +291 | -25 | +266 |
| 1.9 Lucide | +127 | -11 | +116 |
| **Total scenes/utils** | **+780** | **-194** | **+586** |

Assets novos: 14 SVGs × ~400-500 bytes = ~6 KB no bundle público. `lucide-static` package fica em node_modules (não bundled).

Tests: 529 passing, 0 regressão ao longo das 4 sub-etapas. Build: 5 runs verdes (1 por sub + baseline).

Tempo real: ~5h15min (dentro da janela 7-8h, 2h+ de folga preservada).

---

## Pendências explícitas para ETAPA 3

Todas as cenas/cases abaixo foram conscientemente deferidos. A ETAPA 3 redesenha as 3 cenas de deck/progression junto:

| # | Item | Arquivo | Shape atual | Shape alvo |
|---|---|---|---|---|
| 1 | Deck editor redesign | `DeckBuildScene.ts` | Card inline 308×124 | 120×160 vertical (ou variante adaptada à layout da cena) |
| 2 | Upgrade deck grid | `SkillUpgradeScene.ts` (3 callers — deck, inventory, drag) | 258×110 (4 cols) | 120×160 com reflow do grid inteiro |
| 3 | Pack open flip tween | `PackOpenAnimation.ts` | 280×105 com flip X-scale tween | Shape vertical + timing de flip novo (vertical flip parece quicar com aspect ratio alto) |
| 4 | `UI.skillDetailCard` (5 sites em `SkillUpgradeScene`) | `UIComponents.ts` | 310×380 detail preview | Variante alinhada ao 120×160 ou tooltip card novo |
| 5 | `UI.button` legacy shim | `UIComponents.ts` | Deprecated, ainda exportado | Remover quando todas cenas secundárias migrarem |

**Justificativa para deferir (confirmada pela Opção A):** SkillUpgradeScene tem 1234 LOC fortemente acopladas ao shape horizontal (4-col deck + scrolling inventory + UPAR button no bottom-right). Migrar pra 120×160 vertical não é "adapter de shape" — é redesign completo do layout da cena (cols ~8 em vez de 4, UPAR button reposicionado, header/tooltip repensados). Escopo comparável ao DeckBuildScene que já estava deferido.

PackOpenAnimation: flip tween atual aplica `scaleX: 0→1` para simular girar a carta virando. Com cards verticais 120×160, a mesma animação funciona mas parece estranha (a carta "afina vertical" em vez de "vira"). Precisa de timing/easing próprios + provavelmente nova entrance (slide up em vez de flip). Trabalho de design da animação, não só shape.

---

## Pendências menores (ETAPA 3 ou sprint de polish)

| # | Item | Prioridade | Notas |
|---|---|---|---|
| 1 | Campo `flavor` em `skillCatalog` | baixa | Destravaria flavor italic no `UI.skillTooltip` e eventualmente no skillCardVertical |
| 2 | Timer icon no HUD | baixa | Decisão: não adicionar agora; pill já é suficientemente claro |
| 3 | Dashed border em area preview | baixa | Phaser Graphics não tem stroke dashed nativo; implementar via segmentos ou shader |
| 4 | Hover default em todo tile | baixa | Print 12 mostra hover wash em qualquer tile; atualmente só overlays ativos têm hover |
| 5 | UI.modal backdrop blur | baixa | `backdrop-filter: blur(6px)` CSS não renderiza em Phaser 2D; fallback rgba opaco mantido |
| 6 | 64 skill icons individuais | média | Cada skill com ícone Lucide/custom próprio (atualmente usa abbrev ou PNG já existentes) |
| 7 | Ícones skill-domain pré-loaded mas sem uso | baixa | swords/shield/heart-pulse/droplet/flame/snowflake/zap/wind/crown carregam mas não aparecem — reservados pra tooltip variants e card badges futuras |

---

## Health check — arquitetura pós-ETAPA 1b

✅ **Domain layer permanece pure** (zero Phaser imports) — 64/64 skills intactas, 529 tests verdes
✅ **Design System tokens** consolidados como fonte única em BattleScene — retiradas 9 categorias de hardcodes (cores, fontes, strokes, status colors, state colors, HP colors, ring colors, unicode glyphs, hardcoded hex)
✅ **UI.skillCard** agora suporta 2 orientações sem duplicar código exportado — `orientation` param delega pra helper interno
✅ **Lucide pipeline** configurado: dev-dep + copy script + BootScene preload + UI helper — padrão escalável pra adicionar mais ícones quando cenas secundárias migrarem
✅ **BattleScene** mantém-se em ~3700 LOC (refactor de LOC count fica pra Sprint dedicado — ainda listado como débito de sprint 0.4)

**Consolidação atingida na BattleScene:**

Legacy hex / Arial / stroke 3 ainda presentes (a fiscalizar em pendências futuras): `~30` ocorrências em log/damage text floating / misc, mas NÃO mais no fluxo 80% que o jogador toca (status, tokens, cards, top bar, modais — todos no design system).

---

## Screenshots descriptions (antes/depois)

**Status Panel (Sub 1.5):**
- *Antes:* Fundo preto-azulado, role name em Arial Black teamHex, linhas de texto "STUN/SNARE/ATK ↑" com cores hardcoded vivas (amarelo `#ffdd00`, ciano `#00ccaa`), stats ATK/DEF/MOV em verde/vermelho saturado com stroke preto.
- *Depois:* Surface panel navy + border default cinza + team stripe fino top, portrait class-color disc com sigil, nome em Cormorant + class label Manrope meta tintado, HP bar com shield stripes diagonais overlay, stat deltas em tokens (success/error/disabled), chips 26×18 com border polarity-tinted.

**Unit Token (Sub 1.6):**
- *Antes:* Rings cyan/white/green hardcoded, shield bar azul flat, nenhum indicador de classe visível.
- *Depois:* Move ring team-colored (blue aliado / red enemy), focus ring gold accent, active ring success green, shield bar `hpState.shield` gray, sigil chip bottom-right com classe visível em qualquer estado.

**Skill Card Hand (Sub 1.7):**
- *Antes:* 4 cards horizontais empilhados verticalmente 210×105 (Brawl Stars style com accent bar esquerda + icon esquerda + text direita).
- *Depois:* 2×2 grid de 120×160 verticais (atk1/atk2 topo, def1/def2 base). Cada card: class band top cheio + icon circle central + nome Cormorant + desc Manrope + footer tingido com DMG/HEAL/SHLD + CD. Selected outline gold.

**Top bar icons (Sub 1.9):**
- *Antes:* Back button `'← Voltar'` (arrow unicode), surrender button `'Render-se'` texto, modal close `'✕'` unicode.
- *Depois:* Back button com Lucide arrow-left + label, surrender button com Lucide flag + label, modal close com Lucide x + hover tint swap.

---

## Recomendação próxima sessão

**Próxima sessão (ETAPA 2):** Menu/Lobby redesign.

Wave 1 do INTEGRATION_SPEC cobre: S1 Login, S2 Lobby, S3 Deck Builder, S4 Post-Match, S5 Matchmaking. Começa pelo LobbyScene (hub central pós-login — primeiro impacto do jogador fora da batalha).

**ETAPA 3 (futura):** Redesign de deck/upgrade/pack (SkillUpgradeScene + DeckBuildScene + PackOpenAnimation), migrando todos para skill card vertical. 1-2 dias dedicados.

**ETAPA 4+:** Waves 2-3 do INTEGRATION_SPEC (Shop, Battle Pass, Settings, Ranked, Tournament, Bracket).

---

**Gates finais verificados:**

- ✅ 529 tests passing (0 skipped)
- ✅ `npm run build` passa limpo em todos os 4 checkpoints
- ✅ 0 regressão desde o início da ETAPA 1b
- ✅ 4 commits atômicos (`etapa1b-sub1.5`, `etapa1b-sub1.6`, `etapa1b-sub1.7`, `etapa1b-sub1.9`)
- ✅ Escopo Opção A respeitado; 4 callers horizontais preservados + pendência ETAPA 3 documentada
- ✅ Stop rules não acionadas em nenhum ponto
- ✅ Ordem 1.5 → 1.6 → 1.7 → 1.9 respeitada conforme plano aprovado

**🎯 BattleScene 100% alinhada ao design system. Próxima sessão começa Menu/Lobby (ETAPA 2).**
