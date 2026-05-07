# Cards v1.1 — Relatório Final

**Data:** 2026-05-06
**Branch:** `cards-v1.1-balance-pass` (merged → `claude/raid-hub-scene` → `turbo-targeting-v1`)
**Documento de origem:** `CARTAS_DRAFT_v1.1.md`

---

## Status por Sub-etapa

| Sub | Escopo | Status | Commit |
|-----|--------|--------|--------|
| **A** | 7 ajustes mecânicos do balance pass + tests + DECISIONS.md | ✅ Completo | `cards-v1.1: balance pass — 7 mechanical adjustments + tests` |
| **B** | Schema (`tags`, `typeLabel`, `durationLabel`, `longDescription` estruturado) | ✅ Completo | `cards-v1.1: schema (tags, typeLabel, durationLabel, longDescription expanded)` |
| **C** | 64 longDescriptions PT-BR + tags injetadas no catalog | ✅ Completo | `cards-v1.1: 64 longDescriptions in PT-BR + tags injected into catalog` |
| **D** | UI updates — `skillDetailCard` 4 seções | ✅ Completo (parcial — pills do `skillCard` deferidas) | `cards-v1.1: UI updates — skillDetailCard renders 4 sections` |
| **E** | i18n para 10 idiomas (en-US, es, fr, de, it, tr, ru, ja, zh-CN, ko) | ✅ Completo (parcial — long-description sections em PT-BR fallback) | `cards-v1.1: i18n migration for 10 languages` |
| **F** | DECISIONS_PENDING + relatório final | ✅ Completo | (este commit) |

---

## Estado dos Tests

| Antes (Sub A start) | Depois (Sub F end) | Δ |
|---|---|---|
| 547 | 549 | +2 net |

**Detalhe da mudança líquida:**
- `KingSkills.test.ts` 48 → 50 (+2): novo teste de cap explícito em Domínio Real, novo teste de boundary em Espírito de Sobrevivência (60% inclusivo), reescrita de "HP > 50% activates" para "HP > 60% no-op"
- `WarriorSkills.test.ts` 63 → 64 (+1): novo teste pro `evade_chance` secondary em Bater em Retirada
- `ExecutorSkills.test.ts` 66 → 64 (-2): 3 testes de lifesteal-from-shield em Marca da Morte deletados (skill agora não tem hook), 1 teste no-self-heal regression adicionado
- `SpecialistSkills.test.ts`: ls_d1 35→40 (sem mudança de quantidade)

---

## Arquivos Modificados

### Engine + Domain
- `game-client/src/data/skillCatalog.ts` — 7 ajustes de números/secondary + 64 `tags` arrays adicionados
- `game-client/src/domain/Skill.ts` — Schema v1.1 (`tags`, `typeLabel`, `durationLabel`, `SkillLongDescription`, `normalizeLongDescription`); novo effect type `evade_chance`
- `game-client/src/domain/Effect.ts` — Novo `EvadeChanceEffect` (charges + chance + roller injetável); `EffectType` estendido
- `game-client/src/domain/Character.ts` — Adrenalina penalty agora clampa min 1 HP (cap não-letal v1.1)
- `game-client/src/engine/CombatEngine.ts` — Domínio Real cap 30 HP; Marca da Morte sem hook de cura; Espírito de Sobrevivência com gate HP > 60% = no-op
- `game-client/src/engine/EffectResolver.ts` — `handleEvadeChance` registrado
- `game-client/src/engine/types.ts` — `STATUS_APPLIED.status` aceita `evade_chance`
- `game-client/src/scenes/BattleScene.ts` — VFX para `evade_chance` (mesmo evadeEffect do `evade`)

### Tests
- `game-client/src/engine/__tests__/KingSkills.test.ts` — lk_a3, lk_a4, lk_d4 atualizados
- `game-client/src/engine/__tests__/WarriorSkills.test.ts` — lw_d8 com evade_chance
- `game-client/src/engine/__tests__/ExecutorSkills.test.ts` — le_a7 lifesteal removido, le_d2 cap test
- `game-client/src/engine/__tests__/SpecialistSkills.test.ts` — ls_d1 35→40

### UI
- `game-client/src/utils/UIComponents.ts` — `UI.skillDetailCard` consome estrutura de 4 seções (flavor + detail + synergies + counter); auto-tune de fonte (12 → 10 px) para evitar overflow

### i18n (11 langs)
- `game-client/src/i18n/locales/pt-BR/skills.json` — Reescrita completa: 64 skills com `type-label`, `duration-label`, `tags`, `long-description: {flavor, detail, synergies, counter}` + top-level `tags` map
- `game-client/src/i18n/locales/pt-BR/common.json` — Section labels: `detail`, `synergies`, `counter`
- `game-client/src/i18n/locales/{en-US,es,fr,de,it,tr,ru,ja,zh-CN,ko}/skills.json` — Migrados pra v1.1 schema com PT-BR fallback nas seções não traduzidas
- `game-client/src/i18n/locales/{...}/common.json` — Section labels traduzidos

### Docs
- `docs/DECISIONS.md` — Nova entrada `2026-05-06 — Cards v1.1: Balance Pass + Schema + 64 longDescriptions`
- `docs/DECISIONS_PENDING.md` — Novo arquivo com P1-P5 + ajustes sistêmicos fora de escopo
- `docs/CARDS_v1.1_REPORT.md` — Este arquivo

### Scripts auxiliares (.scripts/i18n-rebuild/, gitignored)
- `23_parse_cards_v1.1.py` — Parse markdown → JSON
- `24_inject_cards_v1.1.py` — Injeta tags no catalog + reescreve pt-BR/skills.json
- `25_migrate_locales_v1.1.py` — Migra 10 locales para schema v1.1

---

## Balance Pass — 7 Ajustes Aplicados

| # | Skill | Antes | Depois |
|---|---|---|---|
| 1 | Sequência de Socos (lk_a3) | 15 dano + 30% lifesteal | **17 dano + 35% lifesteal** |
| 2 | Domínio Real (lk_a4) | shield = 25% dano (sem cap) | **mesmo + cap 30 HP** |
| 3 | Espírito de Sobrevivência (lk_d4) | 2 branches (≤50% e >50%) | **1 branch + gate**: ativa só com HP ≤ 60% |
| 4 | Bater em Retirada (lw_d8) | +1 mov + def_up | **def_up + 50% chance evadir próximo dano** (novo `evade_chance`) |
| 5 | Marca da Morte (le_a7) | bleed + remove shield + cura 20% | **bleed + remove shield** (lifesteal removido) |
| 6 | Adrenalina (le_d2) | atk_up + custo HP final | **mesmo + cap "min 1 HP"** (não suicida) |
| 7 | Cura Suprema (ls_d1) | heal 35 | **heal 40** |

---

## Decisões Pendentes Registradas (P1-P5)

Movidas para `docs/DECISIONS_PENDING.md` aguardando aprovação explícita / playtest:

- **P1** — Shield do Executor (le_d8) é redundante; sugestões: Pegada Furtiva / Faca Reserva / Antídoto
- **P2** — Disparo Preciso pode estar over-tuned; opções: manter / 30→26 / cooldown 2t
- **P3** — Sombra Real implementação (Option A vs B)
- **P4** — Renascimento Parcial fallback de heal — manter/remover
- **P5** — Heal Cap em time de 4 — escalar para 3 com Especialista?

---

## Pendências e Débito Técnico Identificado

### Débito menor (residual desta sessão)

1. **Tag pills no `UI.skillCard`** (small card, 120×160 vertical) — DEFERIDO. Schema + dados estão prontos; o layout do card pequeno é denso e exige redesenho dedicado pra acomodar 2-3 pílulas sem comprometer legibilidade do ícone/nome/stats.

2. **Tradução completa do `tags` map em 8 idiomas** — Apenas en-US e es têm labels traduzidos. fr/de/it/tr/ru/ja/zh-CN/ko mirroram en-US como fallback. Tracker: futuro polish de tradução.

3. **Tradução completa de `duration-label`** — 13 variantes em PT-BR (algumas frases longas como "Até receber dano direto ou se mover voluntariamente"). Em todos os 10 idiomas não-PT-BR, o valor é a string PT-BR original. Tracker: futuro polish.

4. **Tradução completa de `long-description.{flavor,synergies,counter}`** — Em todos os 10 idiomas não-PT-BR, essas 3 seções caem em fallback PT-BR. UI nunca renderiza vazio, mas o jogador francês/alemão/etc. lê PT-BR nessas seções até serem traduzidas. Tracker: tradução poética grande, requer pass dedicado.

### Atualizações para o briefing

- **Briefing dizia "13 stubs/PARTIAL"** — Estado real é **0 stubs/PARTIAL**. Todas as 64 skills do combat engine estão completas (per `docs/DEBT_ALFA_REPORT.md`). Briefing desatualizado; nenhuma skill PARTIAL/stub foi tocada nesta sessão.

- **Caminhos de arquivo divergentes do briefing**:
  - `game-client/src/data/skills/skillCatalog.ts` (briefing) → `game-client/src/data/skillCatalog.ts` (real)
  - `game-client/src/components/UI/UIComponents.ts` (briefing) → `game-client/src/utils/UIComponents.ts` (real)

---

## Gates de Qualidade

✅ `npx tsc --noEmit` — limpo após cada sub
✅ `npm test` — 549/549 passing após cada sub
✅ `npm run build` — sucesso (1.79 MB minified, ~482 KB gzipped)
✅ Commits atômicos por sub (6 commits no total + merge)
✅ `DECISIONS.md` atualizado
✅ `DECISIONS_PENDING.md` registrado

---

## Comandos para verificação manual

```bash
# Tests
cd game-client && npm test

# Build
cd game-client && npm run build

# Verificar tags injetadas
grep -c "^    tags:" game-client/src/data/skillCatalog.ts   # → 64

# Verificar i18n schema v1.1
python -c "
import json
d = json.load(open('game-client/src/i18n/locales/pt-BR/skills.json', encoding='utf-8'))
print('skills with v1.1 schema:', sum(1 for k,v in d.items() if k.startswith(('lk_','lw_','le_','ls_')) and isinstance(v.get('long-description'), dict)))
"
# → 64
```
