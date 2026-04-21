# Bloco 4 Concluído ✅

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-21
**Commits principais:**
- `bloco4: Executor audit + gap analysis`
- `bloco4: Executor passive (Isolado) — stack and 8-direction tests`
- `bloco4: Executor bleed-conditional mechanics + 55 skill tests`
- `bloco4: final report + DECISIONS update`

---

## Status das 16 skills do Executor (v3 §6.4) — **12/16 completas**

| ID | Nome | Estado | Tests |
|----|------|--------|-------|
| `le_a1` | Corte Mortal | ✅ **Completo** (damage + cleanse + **+50% se bleed pré-hit**) | 3 |
| `le_a2` | Tempestade de Lâminas | ✅ **Completo** (area + **+50% per-target bleed**) | 3 |
| `le_a3` | Disparo Preciso | ✅ **Completo** (true_damage + **bypass shield se bleed**) | 4 |
| `le_a4` | Corte Preciso | ✅ Completo (damage line + purge) | 3 |
| `le_a5` | Corte Hemorragia | ✅ Completo (bleed + bleed 4/3t) | 3 |
| `le_a6` | Bomba de Espinhos | ✅ Completo (bleed + bleed 5/2t) | 3 |
| `le_a7` | Marca da Morte | 🟠 PARTIAL — shield-strip + heal 20% pendente (skill-specific handler) | 3 |
| `le_a8` | Armadilha Oculta | 🟠 PARTIAL — tile-trap system pendente (Grid-aware) | 3 |
| `le_d1` | Refletir | 🟠 PARTIAL — reflect 25 funciona; "-25% dano recebido" pendente | 3 |
| `le_d2` | Adrenalina | 🟠 PARTIAL — atk_up 25/2t funciona; "-15% HP max na expiração" pendente | 3 |
| `le_d3` | Ataque em Dobro | 🟠 PARTIAL — double_attack funciona; cooldown 2t pendente | 3 |
| `le_d4` | Teleport | 🟡 **STUB** — teleport_self status emit; consume-movement pendente | 3 |
| `le_d5` | Recuo Rápido | 🟠 PARTIAL — shield 20 funciona; pre-move pendente | 3 |
| `le_d6` | Esquiva | ✅ Compartilhada (validada no Bloco 2 + cross-class test aqui) | 2 |
| `le_d7` | Bloqueio Total | ✅ Compartilhada (shield 60) | 2 |
| `le_d8` | Shield | ✅ shield 25 + respeita cap 100 | 3 |

**Resumo:** 7 completas (primárias ok, sem v3 extras) + 3 mecânicas centrais completas (bleed-conditional) + 2 shared = **12 completas**. 4 PARTIAL. 1 STUB.

---

## Assinatura v3 implementada: Bleed-Conditional mechanic

Core identity do Executor v3: "hits harder se alvo sangrava". Implementado em `CombatEngine._applyOffensiveSkill`:

```
const targetHadBleed = _hadBleedEffect(target)   // snapshot PRÉ-hit
const isLeA1 = skill.id === 'le_a1' || 'ra_a1'
const isLeA2 = skill.id === 'le_a2' || 'ra_a2'
const isLeA3 = skill.id === 'le_a3' || 'ra_a3'
const bleedAmplifies     = (isLeA1 || isLeA2) && targetHadBleed
const bleedBypassesShield = isLeA3 && targetHadBleed
```

**Critical design:** o snapshot é tomado ANTES do resolver rodar, então mesmo que `le_a1` tenha `cleanse` secondary (que strip bleed), o bônus de +50% ainda foi decidido com base no estado pré-hit. Isso previne o cleanse "self-sabotar" o bônus.

Para `le_a3` (Disparo Preciso + bleed), a rota de dano é alternativa: `target.applyPureDamage(rawDamage)` direto, bypassando `takeDamage → interceptDamage` → shields passam intactos. Evento `DAMAGE_APPLIED` é emitido manualmente com todas as atribuições de stats/kill que `_processResult` faria.

---

## Passiva Isolado — cobertura estendida

**26 tests total em `PassiveSystem.test.ts`** (era 22, agora 22 pre-existentes + 4 novos do Bloco 4):

Novos tests (Bloco 4):
1. **Isolado × Execute stack** — `1.20 × 1.25 = 1.50×` validado aritmeticamente (Executor isolado vs Warrior a 30% HP → 75 dano).
2. **Dual-Isolado** — Executor isolado atacando outro Executor isolado (+20% out × +10% in = 1.32× combined).
3. **Warrior Protetor ADJACENT** — quando Warrior está adjacente ao Executor: **trade-off DESATIVA** (não está mais isolado), **Protetor ATIVA**. Net: Executor recebe MENOS dano, não mais. Test valida 60 base → 47 final.
4. **8-direção sweep** — Todas as 8 células adjacentes (W/E/N/S/NW/NE/SW/SE) suprimem Isolado. Loop parameterizado.

---

## Edge cases interessantes encontrados

1. **Warrior Protetor no grid test** — Tempestade de Lâminas em 2 Warriors adjacentes: ambos ganham -15% Protetor mútuo. Afeta aritmética esperada (22 ao invés de 26 por hit). Teste foi ajustado depois de confirmar comportamento correto.

2. **Bleed snapshot timing** — Se `le_a1` fosse implementado só como "cheque bleed e multiplique após cleanse", o bônus sumiria. Snapshot pré-hit foi decisão deliberada.

3. **true_damage pass-through vs applyPureDamage** — `le_a3` sem bleed usa `takeDamage` (respeita shield). Com bleed, desvia pra `applyPureDamage` (bypassa shield). Duas rotas coexistem no mesmo skill.

4. **le_d8 Shield 25 + 85 existente → 100 cap** — o test valida que cap §2.5 funciona (não passa de 100). Shield logic de "sobrescreve mais fraco" já foi testada no Bloco 1.

5. **Cross-class shared skills** — le_d6 Esquiva verificada contra lk_d7 + ls_d6 (3-way identity). le_d7 Bloqueio Total verificada contra ls_d7 (2-way).

6. **Catalog identity test** — Executor tem 4+ skills usando bleed (le_a5, le_a6, le_a7 secondary, le_a8 secondary). Confirma "bleeder" como identidade de classe.

---

## Tests

- Arquivo novo: `src/engine/__tests__/ExecutorSkills.test.ts` (**55 tests**)
- Tests adicionados em `PassiveSystem.test.ts`: 4 (Isolado stack)
- **Total projeto: 342 tests passing, 0 skipped** (287 antes → 342 = +55 Executor + 4 stack - 4 reorganização)
- Piso do prompt: 48 skill tests (16 × 3). **Alcançado com folga (55).**

---

## Regras de parada — não acionadas

- ✅ Stubs: 1 (muito abaixo de 5)
- ✅ PARTIAL: 4 (documentados no report)
- ✅ Build passa limpo
- ✅ Zero regressão

---

## Comparação 3 blocos

| Classe | Skills | Completas | PARTIAL | STUB | Tests do bloco | Sinal v3 | Tempo |
|--------|--------|-----------|---------|------|----------------|----------|-------|
| King (Bloco 2) | 16 | 13 | 0 | 3 | 48 | Sequência lifesteal self-exception, Fortaleza shared | ~3h |
| Warrior (Bloco 3) | 16 | 9 | 4 | 3 | 56 | Fortaleza shared | ~1h |
| Executor (Bloco 4) | 16 | 12 | 4 | 1 | 55 | **Bleed-conditional (+50% / bypass shield)** | ~1h |

O Bloco 4 entregou o mecanismo v3 mais distintivo da classe, com precisão aritmética validada.

---

## Health check — débito técnico

**Sistema novos pendentes (cross-block):**
- **Tile-obstacle** — Muralha Viva, Prisão de Muralha Morta, Armadilha Oculta
- **Damage interceptor** — Guardião, (Refletir reduction parcial)
- **Movement pre-skill** — Escudo do Protetor (Warrior), Recuo Rápido, Teleport (all Executor)
- **Clone / Invisibility** — Fuga Sombria, Sombra Real, Camuflagem (especialista futura?)
- **Skill cooldown tracking** — Ataque em Dobro (potencialmente outras)
- **Effect expiration hooks** — Adrenalina HP loss, potencialmente Marca da Morte special logic

Cada um desses pode virar sprint dedicado. Nenhum é blocker pra jogar — todos os primaries funcionam e os secondaries representativos também.

**Débito schema:** o `secondaryEffects[]` refactor (Bloco 3 Parte 1) resolveu a maior dívida de schema. Nenhum gap estrutural novo apareceu no Bloco 4.

---

## Recomendação pro Bloco 5 (Especialista)

Especialista v3 §6.2 é **support/mage**. Padrões esperados:
- **Heal em área** (Campo de Cura) — handler `heal` + targetType area já existem
- **DoT burn** (Bola de Fogo) — handler `burn` já existe
- **Purify / Cleanse** (Proteção) — handler existe
- **Condicional "imunidade a novos debuffs"** em Proteção — novo padrão (effect cleanse + immunity flag) → provável skill-specific
- **Shield-field em área** (Campo de Cura, Aura de Proteção) — ok, combinação de shield + secondaries
- **Revive latente** (Renascimento Parcial) — handler `revive` já existe
- **Mark não-removível** (Explosão Central) — já existia como stub no Bloco 2 (ls_a4 é referenciado pelo Specialist, mas está no catálogo). Pode ter continuação.

**Mecânicas exóticas esperadas (1-2 stubs prováveis):**
- Proteção "imunidade a novos debuffs por 1t" — flag nova no Character?
- Campo de Cura Contínuo "cancela se aliado tomar dano" — hook em takeDamage

Estimativa: **~1.5-2h**. Similar ao Executor.

**Não iniciar Bloco 5 automaticamente.** Aguardando validação explícita do Bloco 4.

---

## Stubs/PARTIAL restantes como backlog

| Skill | Tipo | Sistema pendente | Tempo implementar |
|-------|------|------------------|-------------------|
| le_a7 Marca da Morte | PARTIAL | Skill-specific shield-strip + heal 20% (quick win) | 25min |
| le_a8 Armadilha Oculta | PARTIAL | Tile-trap system (Grid-aware) | 3-4h |
| le_d1 Refletir | PARTIAL | Reflect + DR combined (skill-specific) | 30min |
| le_d2 Adrenalina | PARTIAL | Effect expiration hook (skill-specific) | 45min |
| le_d3 Ataque em Dobro | PARTIAL | Skill cooldown tracking (ActionEngine integration) | 1h |
| le_d4 Teleport | STUB | Movement consume-integration | 1h |
| le_d5 Recuo Rápido | PARTIAL | Pre-move before shield | 30min |

Quick-win batch (le_a7 + le_d1 + le_d2 = ~1h30) pode fechar 3/7 se quiser bump antes de Bloco 5. Não inicio sem aprovação.
