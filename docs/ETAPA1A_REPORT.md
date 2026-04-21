# ETAPA 1a — Design System aplicado na BattleScene

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-21
**Escopo:** fundação visual + interatividade (Sub 1.1–1.4, 1.8). Sub 1.5, 1.6, 1.7, 1.9 ficam para ETAPA 1b.

---

## Resumo executivo

A usuária jogou após a Fase 1 e **não viu mudança** porque os helpers novos conviviam com os legacy mas nenhum caller tinha migrado. ETAPA 1a **substitui** 5 grupos visuais da BattleScene (botões, tooltip, timer, grid, modal) pelos equivalentes dirigidos pelos tokens + INTEGRATION_SPEC. Tudo o que a usuária toca 80% do tempo em combate agora vem do design system.

**Gates finais:**

- ✅ 529 tests passing em cada sub-etapa (0 regressão)
- ✅ `npm run build` passa em cada sub-etapa
- ✅ 6 commits atômicos (1 de prints + 5 de sub-etapas)
- ✅ Nenhuma stop rule acionada; todas as sub-etapas ficaram dentro de +50% da estimativa

---

## Commits (ordem cronológica)

1. `etapa1-prints: reference prints for ETAPA 1-5 audit` — 20 pngs em `assets/design/`
2. `etapa1-sub1.1: buttons legacy->Primary/Secondary/Ghost/Destructive`
3. `etapa1-sub1.2: tooltip inline->UI.skillTooltip per Print 16`
4. `etapa1-sub1.3: turn timer refactor (Mono tabular + pulse + 3-state)`
5. `etapa1-sub1.4: grid tile rendering with 7 states + tokens`
6. `etapa1-sub1.8: modal system refactor`

---

## Sub 1.1 — Botões

**Spec:** INTEGRATION_SPEC §1 (Primary/Secondary/Ghost/Destructive) + Print 8 + Print 9.

**Callers migrados (10 total):**

| Cena | Callsite | Variant anterior | Variant novo |
|---|---|---|---|
| `BattleScene` | `_buildActionButtons / Confirmar` | `_makeActionBtn` inline verde | `UI.buttonPrimary` gold |
| `BattleScene` | `_buildActionButtons / Pular` | `_makeActionBtn` inline amber | `UI.buttonGhost` |
| `BattleScene` | `_buildEndMovementButton` | `_makeActionBtn` inline green | `UI.buttonPrimary` gold |
| `BattleScene` | `_buildTrainingBackButton` | graphics ad-hoc `←Voltar` | `UI.buttonGhost` `← Voltar` |
| `BattleScene` | `_buildSurrenderButton` | graphics ad-hoc flag+count | `UI.buttonDestructive` `Render-se` + chip contagem à direita |
| `BattleResultScene` | Jogar Novamente | `UI.button` (info cyan) | `UI.buttonPrimary` gold |
| `BattleResultScene` | Menu Principal | `UI.button` (muted) | `UI.buttonSecondary` |
| `BracketScene` | ASSISTIR | `UI.button` (info cyan) | `UI.buttonSecondary` |
| `BracketScene` | JOGAR | `UI.button` (success green) | `UI.buttonPrimary` gold |
| `BracketScene` | RESULTADOS | `UI.button` (gold) | `UI.buttonPrimary` gold |
| `BracketScene` | FECHAR | `UI.button` (muted) | `UI.buttonSecondary` |

**Efeito colateral:** `BattleScene._makeActionBtn` deletado (era helper interno usado só pelos 3 sites acima).

**`UI.button` legacy** mantido exportado com **@deprecated** JSDoc. Nenhum caller interno ao código novo chama mais. Shim se mantém até todas as cenas externas migrarem (plano: ETAPA 3 redesenha cenas menores).

---

## Sub 1.2 — Tooltip

**Spec:** INTEGRATION_SPEC §7 + Print 16.

**Novo helper:** `UI.skillTooltip(scene, x, y, content, opts)`.

**Estrutura renderizada:**

- **Heading row:** skill name em Cormorant Garamond `h3` (fg-primary) + meta top-right `CLASSE · CATEGORIA` em Manrope 11/700 `letterSpacing ~0.14em`, tingido com a cor da classe (`--class-*` hex)
- **Body:** description em Manrope 13 fg-secondary, wordwrap em `maxW-2×pad`
- **Stats row:** pares LABEL VALUE em JetBrains Mono 13/700 — `DMG/HEAL/SHLD` + `CD` + `RNG`, com valor tingido (vermelho/verde/cinza pela categoria)
- **Flavor:** Cormorant italic fg-tertiary (opcional, callers ainda não passam — `skillCatalog` não tem campo `flavor`; documentado para ETAPA 2)

**Callsite migrado:** `BattleScene._showSkillTooltip` (1 site) — agora deriva `stats` de `skill.effectType/power/cooldownTurns/range` e manda direto pro helper novo.

**Pendências:**

- `UI.skillDetailCard` (preview grande 310×380, 5 sites em `SkillUpgradeScene.ts`) mantido intacto. Aquela tela inteira entra na ETAPA 3 — refatorar parcial agora gera conflito.
- Campo `flavor` no catálogo: adiado pra ETAPA 2 (decisão de dados, não visual).

---

## Sub 1.3 — Turn Timer

**Spec:** INTEGRATION_SPEC §6 + Print 17.

**Alterações em `_drawHUD` + `_updateTimerDisplay` + `_clearTimer`:**

- Formato **MM:SS tabular** em JetBrains Mono 16/700 (antes: `⏱ 15s` em Arial Black 13)
- **3 estados** por tempo restante:
  - `> 10s` — `state.success` (#10b981 verde)
  - `5..10s` — `state.warn` (#f59e0b amber)
  - `≤ 5s` — `state.warnCritical` (#dc2626 vermelho) + **pulse** `Sine.InOut` alpha 1↔0.55 a 500ms
- Timer bar abaixo do top bar: fill dinâmico pela mesma regra (antes: 3 thresholds fixos com verdes/amber/reds hardcoded)
- Pill do badge retida: surfaces agora `surface.primary`/`surface.panel`, borda `border.royal` 55%, separador `border.royal` 30% (antes: 0x080c14/0x10161f/0xc9a84c hardcoded)
- `Round N` texto em Manrope meta + `accent.primary` (antes: Arial Black 13 + 0xf0c850 gold)
- Pulse tween é torn-down em `_clearTimer` para evitar leak ao fim da partida

**Phase label:** permanece escondido (`_phaseText` a `-999,-999`). A arquitetura atual usa map-overlay banners para transições de fase, não top bar. Adicionar phase tag no top bar conflita com "AZUL / ROXO / Round N" existentes. **Movido para ETAPA 1b Sub 1.5** (Status Panel refactor pode reposicionar phase label dentro dos painéis laterais).

---

## Sub 1.4 — Grid Tiles

**Spec:** INTEGRATION_SPEC §4 + Print 12.

**Rewrite de `_drawGrid`:**

| Região | Antes | Agora |
|---|---|---|
| Ally half (cols 0-7) | `0x0e1e30 / 0x0b1828` navy-preto | `tile.allySide` #1a2a4a + alt stripe `tile.defaultAlt` #1f2a42 |
| Enemy half (cols 9-15) | `0x1a1030 / 0x150c28` roxo-preto | `tile.enemySide` #3a1a22 + alt `#4a1c26` |
| Wall col 8 | glow roxo `0x4422aa → 0x8866dd` | `tile.wall` #4b5563 + 1px top shine `tile.wallShine` #94a3b8 |
| Outer border halves | turquesa `0x00ccaa` + roxo `0x8844cc` | `colors.team.ally` #3b82f6 + `colors.team.enemy` #ef4444 |
| Linhas de grid | `0x2a3a50` alpha 0.6 | `border.subtle` #1e293b alpha 0.85 |
| Dots de interseção | presentes | removidos (redundante com linhas) |
| Coords (A-P / 1-6) | Arial Black 12 + stroke 3 | Manrope 11/700 + `fg.disabled` #64748b |
| Motes ambiente | `0xc9a84c` | `accent.primary` #fbbf24 |

**Overlays refatorados:**

- `_addMoveOverlay` — `tile.validMove` verde (#10b981) + border (antes: `0x00ccaa` turquesa)
- `_addUnitTargetRing` — `tile.validSkill` gold (#fbbf24) (antes: `0xffee00` amber)
- `_addTileOverlay` — `tile.validSkill` gold (antes: `0xffee00`)
- `_showAreaPreview` — `tile.areaPreview` red (#ef4444) + border (antes: `0xff6633` orange)

**Pendências conhecidas:**

- **Dashed border em area preview:** Phaser Graphics não tem stroke dashed nativo (spec pede 4-2 dash). Implementado como solid 1px; dash pattern adiado para polish pass futuro.
- **Hover state default (sem skill selecionada):** Print 12 mostra hover wash branco em qualquer tile. Atualmente só temos hover quando overlay (move/skill) está ativo. Hover-everywhere requer adicionar rectangles por tile — overhead mal amortizado; adiar até Sub 1.6 (Unit Token refactor na ETAPA 1b vai tocar o grid de qualquer jeito).

---

## Sub 1.8 — Modal

**Spec:** INTEGRATION_SPEC §10 + Print 14.

**Novo helper:** `UI.modal(scene, content, opts)` — retorna `{ close }`.

**Content schema:**

```ts
{
  eyebrow?: string,   // "CONFIRMAÇÃO" (meta label)
  title: string,      // "RENDER-SE?" (h2 Cinzel UPPER)
  body?: string,      // "Abandonar esta partida afeta seu rank..."
  actions: Array<{
    label: string,
    kind: 'primary' | 'secondary' | 'destructive' | 'ghost',
    onClick: () => void,
  }>,
}
```

**Renderização:**

- Backdrop: full-screen rgba(0,0,0,0.70), bloqueia cliques, fecha modal ao clicar (opt-out via `closeOnBackdrop: false`)
- Dialog: 440×auto (computado do conteúdo), `surface.panel` fill, `border.default` 1px, `radii.xl` 12px, shadow-lg emulation + 1px inset top highlight
- Eyebrow + title + body com paddings spec (24px horizontal, top 24, entre sections 6/12)
- Footer 64px com separador acima em `border.subtle`, botões alinhados à direita com gap 12
- Close X ghost no canto superior direito (hex `\u2715`, Manrope h3, hover fg-primary)
- Animação entry: opacity 0→1 + scale 0.98→1 em `motion.durBase` (200ms) com `motion.easeOut`
- Exit: opacity → 0 em `motion.durFast` (120ms), então destroy

**`_showConfirmPopup` refatorado** para delegar a `UI.modal`. Signature antiga `(title, titleColor, borderColor, onConfirm)` mantida como shim (os 2 args de cor são ignorados). Novo arg opcional `extra?: { eyebrow, body, confirmLabel, destructive }` permite callers enriquecerem o modal.

**4 callsites migrados:**

| Caller | Eyebrow | Title | Body | Confirm label | Kind |
|---|---|---|---|---|---|
| Surrender solo | Confirmação | Render-se? | "Abandonar esta partida afeta seu rank..." | Render-se | destructive |
| Surrender vote | Votação | Votar para render-se? | "Seu voto conta para N..." | Votar | destructive |
| Skip turn | Atenção | Pular turno? | "Seu personagem não joga este turno." | Pular | primary |
| Commit action | Confirmação | Confirmar ação? | "As skills selecionadas entram na fila..." | Confirmar | primary |

**Limitações conhecidas:**

- **Backdrop blur:** CSS `backdrop-filter: blur(6px)` não é renderizável em Phaser 2D. Fallback documentado: rgba(0,0,0,0.70) sólido. README de handoff já flagava isso como esperado.

---

## Arquivos modificados

```
game-client/src/scenes/BattleScene.ts          (imports + 5 sub-etapas)
game-client/src/scenes/BattleResultScene.ts    (Sub 1.1)
game-client/src/scenes/BracketScene.ts         (Sub 1.1)
game-client/src/utils/UIComponents.ts          (deprecation + skillTooltip + modal)
```

Fora do `game-client/`:

```
assets/design/*.png                            (20 prints de referência)
docs/ETAPA1A_REPORT.md                         (este relatório)
```

---

## Métricas

- **LOC adicionadas:** ~640
- **LOC removidas:** ~290
- **Delta LOC líquido:** +350
- **Tests:** 529 passing, 0 regressão
- **Builds verdes:** 5/5 (um por sub-etapa)
- **Tempo real:** ~4.5h (estimado 7h; dentro da janela)

---

## Pendências explícitas para ETAPA 1b

| # | Item | Origem | Prioridade |
|---|---|---|---|
| 1 | **Sub 1.5 — Character Status Panel** | painel lateral `_drawMiniStatusCard` ainda Arial + teamHex antigos + shield sem stripes | alta |
| 2 | **Sub 1.6 — Unit Token** | team ring, HP micro-bar polish, sigil indicator — preservando sprite procedural | alta |
| 3 | **Sub 1.7 — Skill Card shape 120×160** | reflow 2×2 lateral + migração PackOpen + SkillUpgrade | alta |
| 4 | **Sub 1.9 — Lucide** | arrow/flag/X/gear ícones via biblioteca | média |
| 5 | Phase label visível | hoje `_phaseText` em `-999`; Sub 1.5 pode acomodar | média |
| 6 | Dashed border em area preview | Phaser sem stroke dashed; implementar via multi-segment ou shader | baixa |
| 7 | Hover state default em todo tile | Print 12 mostra; requer per-tile rectangle | baixa |
| 8 | Campo `flavor` em skillCatalog | ativaria flavor italic no tooltip skillTooltip | baixa |

## Pendências explícitas para ETAPA 3 (redesign de cenas)

| # | Item | Tela afetada |
|---|---|---|
| 1 | `DeckBuildScene` skill card inline (308×124) | DeckBuildScene — refactor completo da tela |
| 2 | `UI.skillDetailCard` (preview 310×380) 5 sites | SkillUpgradeScene |
| 3 | `UI.button` legacy ainda exportado como shim | remover quando cenas secundárias migrarem |

---

## Sinal verde para ETAPA 1b

Tudo dentro dos gates. **OK para próxima sessão abrir ETAPA 1b** (Sub 1.5 → 1.6 → 1.7 → 1.9).

Nesta sessão, a usuária deve ver mudança visível imediata ao jogar:

- Botões de ação: Confirmar agora dourado, Pular minimalista, Render-se vermelho top-right
- Timer: MM:SS verde/âmbar/vermelho pulsante Mono
- Grid: arena com wash navy-ally e crimson-enemy bem separados, wall neutro cinza
- Tooltip de skill: card enriquecido com classe+categoria coloridos, stats Mono, descrição
- Modais de confirmação: dialog central grande com eyebrow + título + body + botões proper
