# ETAPA 8 — Fix SettingsScene + adicionar seletor de idioma

Branch: `claude/i18n-session-1`
Commits: `c331b74` (8.2), `bb07f84` (8.3)

## Sub-etapas

| Sub | Estimativa | Real | Commit |
|---|---|---|---|
| 0. Audit | — | ~10min | (chat) |
| 8.1 — fix language selector | 30min | rolled into 8.3 | — |
| 8.2 — remove deprecated bot difficulty + sliders | 30min | ~15min | `c331b74` |
| 8.3 — refactor layout | 2-3h | ~45min | `bb07f84` |
| 8.4 — validação + relatório | 30min | — | (este commit) |

Total: ~1h. Tudo dentro da janela orçada.

## Sub 8.1 — Diagnóstico

O código do seletor estava presente em SettingsScene.ts:152-176 desde o commit 455c375 da Sessão 1, com imports corretos e build verde. A análise estática indicava renderização normal, mas dois fatores explicavam o sintoma reportado:

1. **Confusão visual** — o panel monolítico anterior tinha DOIS segmented controls visualmente idênticos (Fácil/Normal/Difícil acima, PT-BR/EN-US/... abaixo), separados apenas por headers de eyebrow finos. Para um usuário, parecia haver um único control duplicado ou que o seletor de idioma "não tinha chegado".
2. **Densidade do panel** — 4 seções comprimidas em 620px com gaps de só 24px entre elas reforçavam a confusão.

Não houve fix isolado em 8.1 — a refatoração de 8.3 elimina o problema na raiz ao mover a seção IDIOMA para um card próprio com label dedicado ("ESCOLHA SEU IDIOMA" / "CHOOSE YOUR LANGUAGE" / etc.), garantindo que a função do control seja inequívoca.

## Sub 8.2 — Removidos

**SettingsScene.ts:**
- Constantes `DIFFICULTIES`, type `Difficulty`, helper `difficultyLabel`
- Seção JOGABILIDADE inteira (header + card + segmented control)
- Texto visível "Sliders de volume aguardam API no SoundManager" (substituído por comentário no código)
- Ambos call sites de `localStorage.getItem/setItem('draft_difficulty')`

Verificação prévia: `grep -rn 'draft_difficulty'` confirmou que a chave era usada apenas em SettingsScene — sem refs externas.

**JSONs (todos os 6 idiomas):**
- `scenes.settings.sections.gameplay`
- `scenes.settings.gameplay.bot-difficulty-label`
- `scenes.settings.audio.sliders-pending`
- `scenes.settings.difficulty.{easy,normal,hard}`

## Sub 8.3 — Refactor

**Arquitetura nova:** três cards independentes empilhados verticalmente em vez de um panel monolítico.

```
┌─ TOP BAR ────────────────────────────────── 56px
│  ← back arrow    CONFIGURAÇÕES (h2 Cinzel + accent)
└────────────────────────────────────────────

  ÁUDIO  ─                                   ← eyebrow (12px gap)
  ┌─────────────────────────────────────────┐
  │  🔊  SOM                       [○──]    │ 88px
  │      Efeitos sonoros ligados            │
  └─────────────────────────────────────────┘
                                             ← 28px gap
  IDIOMA  ─                                  ← eyebrow
  ┌─────────────────────────────────────────┐
  │  ESCOLHA SEU IDIOMA                     │ 96px
  │  [PT-BR | EN-US | ES | FR | DE | IT]    │
  └─────────────────────────────────────────┘
                                             ← 28px gap
  CONTA  ─                                   ← eyebrow
  ┌─────────────────────────────────────────┐
  │  SESSÃO                       [SAIR]    │ 92px
  │  Sair da conta atual                    │
  └─────────────────────────────────────────┘

      CODEFORJE VIO                          ← footer @ H-32
      Draft Game v1.0  ·  por Caio Sensini
```

**Cada card aplica o mesmo treatment de superfície usado em ProfileScene/RankingScene:**
- `surface.panel` (preenchimento)
- `border.default` (borda 1px)
- `radii.xl` (raio)
- Drop shadow 3,6 com 45% opacity
- Inset top highlight de 16px com 4.5% opacity

**Hierarquia tipográfica:**
- Top bar title: `fontFamily.display` `typeScale.h2` `accent.primaryHex` `letterSpacing 3`
- Section eyebrows: `fontFamily.body` `typeScale.meta` `accent.primaryHex` `letterSpacing 2` + thin gold rule
- Card labels (uppercase eyebrow): `typeScale.meta` `fg.tertiaryHex` `letterSpacing 1.6`
- Card body text: `typeScale.small` `fg.secondaryHex`
- Footer credits: `typeScale.meta` `fg.disabledHex`

**i18n keys novas** (1 por idioma):
- `scenes.settings.language.field-label`
  - PT-BR: ESCOLHA SEU IDIOMA
  - EN-US: CHOOSE YOUR LANGUAGE
  - ES: ELIGE TU IDIOMA
  - FR: CHOISISSEZ VOTRE LANGUE
  - DE: WÄHLE DEINE SPRACHE
  - IT: SCEGLI LA TUA LINGUA

**Funcionalidade preservada:**
- Sound toggle (sound on/off + estado textual)
- Language selector com 6 opções → `setLang()` + `scene.restart()` para hot-reload
- Logout via `UI.modal` (eyebrow + título + body + cancel/confirm)
- Footer credits

## Validação

| Gate | Status |
|---|---|
| `npm test` | ✅ 547/547 |
| `npm run build` | ✅ green (mesmo warning de chunk size pré-existente) |
| TypeScript strict mode | ✅ sem erros |
| `noUnusedLocals` | ✅ |
| `noFallthroughCasesInSwitch` | ✅ |

Validação visual em browser pendente (sem UI interativa neste ambiente). Itens a verificar manualmente:
- Trocar idioma e verificar que o restart preserva localStorage `draft.lang`
- Confirmar que cada card tem visualmente sua própria superfície
- Verificar que o seletor de idioma é distinguível do toggle de áudio
- Layout em DE (palavras compostas longas como "WÄHLE DEINE SPRACHE")

## Estado da branch

```
bb07f84 etapa8-sub8.3: refactor settings layout to match design system
c331b74 etapa8-sub8.2: remove deprecated bot difficulty + sliders disclaimer
541f7fb i18n-6: visual validation + session 1 report
455c375 i18n-5: language selector in SettingsScene
dbafd43 i18n-4: translate to en/es/fr/de/it (context-aware)
78af8c5 i18n-3: write 64 longDescriptions in PT-BR + wire to SKILL_CATALOG
d368128 i18n-2: extract critical-path PT-BR strings to locale files
c7f9ed1 i18n-1: setup base system + locale folders
```

## Pendências futuras

1. **Validação visual em browser** — testar troca de idioma + persistência + verificar que nenhum card tem overflow em DE/FR.
2. **Slider de volume** — quando SoundManager expor a API, adicionar slider no card de áudio. O card atual tem 88px de altura e pode crescer para ~140px sem reflow externo (apenas atualizar `AUDIO_CARD_H`).
3. **Sessão 2 do i18n** — extração das 12 cenas secundárias + adicionar russo + turco (conforme planejado na Sessão 1).
