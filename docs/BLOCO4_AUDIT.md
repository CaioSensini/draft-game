# Bloco 4 — Audit do Executor (estado atual)

**Data:** 2026-04-21 (após refactor Parte 1 de secondaryEffects[])
**Objetivo:** Antes de codar, mapear exatamente o que já existe, o que está incompleto, o que falta.

---

## Passiva Isolado — cobertura de tests existente

`passive_executor_isolado` (+20% ATK isolado) e `passive_executor_isolado_trade_off` (+10% damage taken isolado) **já estão registradas** no `PASSIVE_CATALOG`. Ambas foram implementadas no Bloco 1 e cobertas por **6 tests existentes** em `PassiveSystem.test.ts > Passive — Isolado`:

| Caso | Status |
|------|--------|
| +20% damage DEALT when caster has no adjacent ally | ✅ |
| +10% damage RECEIVED when target is an isolated Executor | ✅ |
| Does NOT activate with ally adjacent (cardinal) | ✅ |
| Does NOT activate with ally DIAGONAL (NE) | ✅ |
| Isolado +20% + Proteção Real -20% compound correctly | ✅ |
| Isolated Executor attacking allied-supported King (full scenario) | ✅ |

**Gaps identificados no prompt e não cobertos:**
- ❌ **Stack com Execute (<30% HP)**: `+20% × 1.25 exec = +50% combined`. Tests pendentes.
- ❌ **Protetor (Warrior) + trade-off do Isolado** — quando Warrior está adjacente ao Executor. Por definição, Warrior adjacente ⇒ Executor NÃO isolado ⇒ trade-off desativa, Protetor ativa. Deve ter test explícito confirmando isso.
- ❌ **Cobertura 8-direcional completa** (só N + NE testadas hoje).

---

## Skills do Executor — 16 entries

### Attack 1 (dano alto)

| ID | Nome | Estado | Mecânica faltante (v3) |
|----|------|--------|----------------------|
| `le_a1` | Corte Mortal | 🟡 **Primary OK** (45 dmg + cleanse secondary) | **+50% dano se alvo tinha bleed** (skill-specific handler) |
| `le_a2` | Tempestade de Lâminas | 🟡 **Primary OK** (26 dmg 3x3) | **+50% dano em cada alvo com bleed** (skill-specific handler) |
| `le_a3` | Disparo Preciso | 🟡 **Primary OK** (30 true damage) | **Ignora shield se alvo tinha bleed** (skill-specific handler) |
| `le_a4` | Corte Preciso | ✅ **Completo** (22 dmg line + purge) | — |

**3 skills com condicional de bleed** — todas precisam do mesmo padrão "checar bleed antes do hit, amplificar se tinha". Posso implementar com um post-hook único no `_applyAttackSkill` ou skill-specific handlers.

### Attack 2 (bleeds)

| ID | Nome | Estado | Mecânica faltante (v3) |
|----|------|--------|----------------------|
| `le_a5` | Corte Hemorragia | ✅ Primary (bleed 8 line) + bleed 4/3t secondary | Descrição diz "acumulativo se re-aplicado" — verificar comportamento |
| `le_a6` | Bomba de Espinhos | ✅ Primary (bleed 10 diamante r2) + bleed 5/2t | — |
| `le_a7` | Marca da Morte | 🟡 Primary OK (12 area line + bleed 8/2t) | **Remove shields + cura 20% deles como HP** (skill-specific handler) |
| `le_a8` | Armadilha Oculta | 🟡 Primary OK (15 single + bleed 4/3t) | **+snare 1t** no secondary + **tile-trap system** (Grid-aware, stub) |

### Defense 1 (self-buffs)

| ID | Nome | Estado | Mecânica faltante (v3) |
|----|------|--------|----------------------|
| `le_d1` | Refletir | 🟡 Reflect 25 primary | **-25% dano recebido** (damage reduction adicional); v3 diz "reflete o mitigado" |
| `le_d2` | Adrenalina | 🟡 atk_up 25 primary | **Perde 15% HP máximo ao expirar** (skill-specific handler com post-hook em expiry) |
| `le_d3` | Ataque em Dobro | 🟡 double_attack primary | **Cooldown de 2 turnos** — novo sistema (tracking de last-used por skill) |
| `le_d4` | Teleport | 🟡 teleport_self 5 primary | **Consome próximo turno de movimento** — requer integration com movement system (stub) |

### Defense 2 (leves)

| ID | Nome | Estado | Mecânica faltante (v3) |
|----|------|--------|----------------------|
| `le_d5` | Recuo Rápido | 🟡 shield 20 primary | **Move até 2 sqm pra trás** antes — movement system (stub) |
| `le_d6` | Esquiva | ✅ **Shared** (validada no Bloco 2) | — |
| `le_d7` | Bloqueio Total | ✅ **Shared** (shield 60) | — |
| `le_d8` | Shield | ✅ shield 25 self | — |

---

## Cobertura de tests existente

**0 arquivos de teste específicos do Executor.** Nenhum equivalente a `KingSkills.test.ts` ou `WarriorSkills.test.ts` foi criado para o Executor no Bloco 2 ou 3.

Apenas referências indiretas:
- `CombatEngine.dummyBattle.test.ts` — usa Executor como atacante do Rei (4 tests integração)
- `PassiveSystem.test.ts` — 6 tests da passiva Isolado
- `KingSkills.test.ts` — 2 tests que comparam catalog entries do le_d6 (Esquiva)

**Gap:** zero tests para 16 skills individuais.

---

## Plano de execução

### Classificação das 16 skills pós-Bloco 4

| Categoria | Qtd | Skills |
|-----------|-----|--------|
| ✅ **Completo sem mudanças** | 4 | `le_a4`, `le_d6`, `le_d7`, `le_d8` |
| ✅ **Completar mecânica** (implementável) | 8 | `le_a1`, `le_a2`, `le_a3`, `le_a5`, `le_a6`, `le_a7`, `le_a8`, `le_d1`, `le_d2` |
| 🟡 **PARTIAL** (sistema novo pequeno) | 2 | `le_d3` (cooldown), `le_d4` (consume movement) |
| 🟡 **STUB** (sistema Grid-aware) | 2 | `le_a8` tile-trap, `le_d5` movement pre-shield |

**Target final: 12/16 completas + 2 PARTIAL + 2 STUB = sob o limite de 5 stubs.**

### Mecânicas novas a implementar

1. **Bleed-conditional damage bonus** (afeta `le_a1`, `le_a2`, `le_a3`):
   - Post-hook no `_applyOffensiveSkill`: se skill.id ∈ {le_a1, le_a2, le_a3, rk_...} e target tinha bleed pré-hit, modifica cálculo de dano.
   - Precisa capturar "tinha bleed antes do hit" porque o próprio hit pode removê-lo (purge, cleanse).
   - Para le_a3 (true_damage): aditivamente ignora shield.

2. **Shield removal + heal 20%** (`le_a7` Marca da Morte):
   - Skill-specific intercept no path de attack similar ao lk_a4.
   - Remove todos os ShieldEffect do target, soma valor total, cura Executor em 20% do total.

3. **Adrenalina HP loss on expiration** (`le_d2`):
   - Precisa de hook no tick quando `atk_up` (Adrenalina especificamente) expira.
   - Opção: AdrenalineEffect custom que extende StatModEffect com `onExpire()` callback.
   - Mais simples: marcar no Character via `_adrenalineTicks` similar ao `_maxHpBonusTicks`.

4. **Refletir damage reduction** (`le_d1`):
   - Extender handler de `reflect` ou adicionar DefBoostEffect acoplado.
   - Skill-specific intercept para combinar reflect + -25% DR por 1t.

### Mecânicas como stub

5. **Tile-trap Armadilha Oculta** — deposita efeito no tile, trigger on-step. Requer Grid extension. **STUB**.
6. **Movement pre-shield/teleport** (`le_d4`, `le_d5`) — caster pode mover antes da skill. Requer integration com `MovementEngine`. **STUB**.
7. **Ataque em Dobro cooldown** — tracking de last-used turn por skill. **PARTIAL** — mecânica funciona, só não bloqueia uso consecutivo.

---

## Commits planejados

1. `bloco4: audit + gap analysis` (este relatório)
2. `bloco4: Executor passive (Isolado) tests + stack validation` — adicionar 4 tests de stack
3. `bloco4: Executor bleed-conditional mechanics (le_a1/a2/a3)` — implementar o +50% se bleed
4. `bloco4: Executor skill-specific handlers (le_a7, le_d1, le_d2)` — shield-strip/heal, reflect DR, Adrenalina expiration
5. `bloco4: Executor schema fixes (le_a8 snare secondary)` — pequeno
6. `bloco4: Executor skill tests (16 skills, 50+ tests)`
7. `bloco4: final report + DECISIONS update`

---

## Estimativa de esforço

| Fase | Tempo |
|------|-------|
| Isolado stack tests (4) | 20min |
| Bleed-conditional mechanics + tests | 40min |
| le_a7 skill-specific + tests | 25min |
| le_d1 reflect DR + tests | 20min |
| le_d2 Adrenalina expiration + tests | 30min |
| le_a8 schema fix + tests | 15min |
| Demais skill tests | 40min |
| Report + DECISIONS | 15min |
| **Total** | **~3h30min** |

Mais que as 3h estimadas inicialmente no Bloco 2, mas dentro do orçamento noturno. Nenhum risco aparente.

---

**Fim do audit. Iniciando implementação na próxima ação.**
