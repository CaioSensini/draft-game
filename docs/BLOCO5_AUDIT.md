# Bloco 5 — Audit do Especialista (estado atual)

**Data:** 2026-04-21 (após Bloco 4 + quick-wins)
**Objetivo:** Mapear gaps antes de codar. v3 §6.2 é fonte de verdade.

---

## Passiva Queimação — cobertura existente

`passive_specialist_queimacao` (heal_reduction_on_hit 30%, 2t) **já registrada e testada**. 5 tests em `PassiveSystem.test.ts`:

| Caso | Status |
|------|--------|
| Emits `PASSIVE_TRIGGERED` on damage | ✅ |
| Applies `HealReductionEffect` to target (30%, 2t) | ✅ |
| Re-hit renews duration (does NOT stack) | ✅ |
| Does NOT fire on non-Specialist casters | ✅ |
| Affects heal amount (via `Character.heal()`) | ✅ |

**Gaps (prompt pediu stack validation):**
- Interaction com outras heal_reductions simultâneas (replace policy)
- Queimação + Rei imune a cura: no heal passes → heal_reduction passa unchanged (deve ser edge case válido)
- Queimação pós-cleanse: cleanse remove debuffs, então remove queimacao também (confirmar via teste)

---

## Skills do Especialista — 16 entries (v3 §6.2)

### Attack 1 (dano alto)

| ID | Nome | Estado | Gap v3 |
|----|------|--------|--------|
| `ls_a1` | Bola de Fogo | ✅ **Completo** (28 dano + burn 6/2t) | — |
| `ls_a2` | Chuva de Mana | 🟠 PARTIAL | "22 dano em 2 ticks (11+11)" — hoje é 22 em 1 hit |
| `ls_a3` | Raio Purificador | 🟠 PARTIAL | "shield 10 em aliados atingidos" — mixed-side area |
| `ls_a4` | Explosão Central | 🟠 PARTIAL | 2nd-use conditional "50 + 50% extra se debuff"; mark não-removível; ignora evade |

### Attack 2 (controle)

| ID | Nome | Estado | Gap v3 |
|----|------|--------|--------|
| `ls_a5` | Orbe de Lentidão | 🟠 **QUICK FIX** | 2º secondary `mov_down 1` faltando no array — trivial |
| `ls_a6` | Correntes Rígidas | ✅ Completo (10 dmg diamond r1 + snare) | — |
| `ls_a7` | Névoa | 🟡 **STUB** | Arena inimiga inteira, 3 efeitos split ally/enemy |
| `ls_a8` | Congelamento | ✅ Completo (18 dano + stun + def_down) | — |

### Defense 1 (forte)

| ID | Nome | Estado | Gap v3 |
|----|------|--------|--------|
| `ls_d1` | Cura Suprema | ✅ Completo (heal 35 single; Rei bloqueado via King-immune) | — |
| `ls_d2` | Renascimento Parcial | 🟠 PARTIAL | "1x por aliado por partida" tracker ausente |
| `ls_d3` | Campo de Cura | ✅ Completo (heal 12 + shield 10; Rei só recebe shield via King-immune) | — |
| `ls_d4` | Proteção | 🟠 PARTIAL | "imunidade a novos debuffs por 1t" — flag ausente |

### Defense 2 (leves)

| ID | Nome | Estado | Gap v3 |
|----|------|--------|--------|
| `ls_d5` | Campo de Cura Contínuo | 🟠 PARTIAL | "cancelado se aliado tomar dano" — hook em takeDamage |
| `ls_d6` | Esquiva | ✅ Compartilhada | — |
| `ls_d7` | Bloqueio Total | ✅ Compartilhada | — |
| `ls_d8` | Aura de Proteção | ✅ Completo (shield 12 + atk_up 10) | — |

---

## Classificação final

| Tipo | Qtd | Skills |
|------|-----|--------|
| ✅ **Completo sem mudanças** | 8 | ls_a1, ls_a6, ls_a8, ls_d1, ls_d3, ls_d6, ls_d7, ls_d8 |
| 🔧 **Quick fix** (schema) | 1 | ls_a5 (mov_down no array) |
| 🟠 **PARTIAL** (mecânica implementável) | 6 | ls_a2 (2-tick), ls_a3 (ally shield), ls_a4 (2nd-use + imunidade mark), ls_d2 (1x/partida), ls_d4 (debuff immunity), ls_d5 (cancel on dmg) |
| 🟡 **STUB** (sistema novo maior) | 1 | ls_a7 Névoa (arena mixed-side) |

**Target pós-implementação:** 13 completas + 3 PARTIAL + 1 STUB. **Dentro do limite de 5 stubs.**

---

## Mecânicas novas a implementar

### Quick fix (muito rápido)

**ls_a5 Orbe de Lentidão — mov_down como 2º secondary**
- Schema-only: adicionar `{ effectType: 'mov_down', power: 1, ticks: 1 }` ao array. 2 min.

### PARTIAL closes (tier 1 — implementáveis)

**ls_a2 Chuva de Mana — 2-tick damage**
- Skill-specific intercept: aplica power/2 duas vezes. Ou ajusta area damage para rodar dois hits separados.
- Simplest: intercept em `_applyAttackSkill` que faz dano = 11 duas vezes (com execute recheck entre hits).

**ls_a4 Explosão Central — 2nd-use conditional**
- Check if target has `MarkEffect`:
  - Sem mark: aplica `MarkEffect` (não-removível — flag nova).
  - Com mark: dano 50, +50% se target tem qualquer debuff. Ignora evade (bypass interceptDamage).
- `MarkEffect.nonRemovable: boolean` — flag novo pra prevenir cleanse/purge.

**ls_d2 Renascimento Parcial — 1x/ally/battle tracker**
- Novo flag `Character._reviveConsumedThisBattle: boolean`.
- Set na primeira vez que revive dispara.
- Skill-specific intercept que rejeita aplicar se já foi consumido.

**ls_d4 Proteção — debuff immunity**
- Novo flag `Character._debuffImmuneTicks: number`.
- Skill-specific intercept setta após cleanse primário.
- `Character.addEffect` checa se é debuff e immune > 0 → rejeita.

**ls_d5 Campo de Cura Contínuo — cancel on damage**
- RegenEffect tradicional vira `CancellableRegenEffect` com flag.
- `Character.takeDamage` hook: se dano > 0, remove efeitos cancelláveis.

**ls_a3 Raio Purificador — shield em aliados na linha**
- Skill-specific intercept: iterar linha, aplicar damage em inimigos, shield 10 em aliados.

### STUB aceito

**ls_a7 Névoa — arena inimiga inteira, mixed-side 3-effect**
- v3: "toda arena inimiga. Aliados: def_up 15% / Inimigos: def_down 15% + cura recebida -30%"
- Requer: targeting "enemy half of arena" + split effect application por side + 3 efeitos simultâneos
- Handler genérico não suporta mixed-side auras. STUB com STATUS_APPLIED pra UI animar.

---

## Plano de commits

1. `bloco5: Specialist audit + gap analysis` (este)
2. `bloco5: Specialist passive Queimação stack tests` (adicionar stack validation)
3. `bloco5: Specialist quick fix ls_a5 (mov_down 2nd secondary)`
4. `bloco5: Specialist skill-specific handlers (ls_a2, ls_a3, ls_a4)` — attack-side mechanics
5. `bloco5: Specialist defensive mechanics (ls_d2, ls_d4, ls_d5)` — defense-side mechanics
6. `bloco5: Specialist skill tests (16 skills, 50+ tests)`
7. `bloco5: final report + project-wide summary + DECISIONS update`

## Estimativa de esforço

| Fase | Tempo |
|------|-------|
| Audit + Queimação stack tests | 20min |
| ls_a5 quick fix | 2min |
| ls_a2 / ls_a3 / ls_a4 (attack mechanics) | 1h |
| ls_d2 / ls_d4 / ls_d5 (defense mechanics) | 1h |
| Skill tests (16 skills) | 45min |
| Report + summary | 30min |
| **Total** | **~3h30min** |

Similar ao Executor completo. Sem sinais de blockers. Sob o orçamento noturno.

---

**Fim do audit. Implementação começa no próximo commit.**
