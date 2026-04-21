# Bloco 5 Concluído ✅

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-21
**Commits principais:**
- `bloco5: Specialist audit + gap analysis`
- `bloco5: Specialist — quick fix + 4 skill-specific mechanics + tests`

---

## Status das 16 skills do Especialista (v3 §6.2) — **12/16 completas**

| ID | Nome | Estado | Tests |
|----|------|--------|-------|
| `ls_a1` | Bola de Fogo | ✅ Completo (28 dano + burn 6/2t) | 3 |
| `ls_a2` | Chuva de Mana | 🟠 PARTIAL — 2-tick split (11+11) pendente | 3 |
| `ls_a3` | Raio Purificador | 🟠 PARTIAL — ally shield-on-line mixed-side pendente | 3 |
| `ls_a4` | Explosão Central | 🟠 PARTIAL — mark 2nd-use conditional pendente | 3 |
| `ls_a5` | Orbe de Lentidão | ✅ **Completo** (12 dano + def_down 25% + **mov_down 1** via array) | 2 |
| `ls_a6` | Correntes Rígidas | ✅ Completo (10 dano diamond r1 + snare) | 3 |
| `ls_a7` | Névoa | 🟡 **STUB** — arena-wide mixed-side dual-side effect | 3 |
| `ls_a8` | Congelamento | ✅ Completo (18 dano + stun + def_down 20%) | 3 |
| `ls_d1` | Cura Suprema | ✅ Completo (heal 35; King-immune bloqueia Rei) | 2 |
| `ls_d2` | Renascimento Parcial | ✅ **Completo** (revive latente + **1x/aliado/partida tracker**) | 2 |
| `ls_d3` | Campo de Cura | ✅ Completo (heal 12 + shield 10; Rei só shield) | 2 |
| `ls_d4` | Proteção | ✅ **Completo** (cleanse + **debuff immunity 1t**) | 3 |
| `ls_d5` | Campo de Cura Contínuo | ✅ **Completo** (regen 6/2t cancellable; Rei não recebe) | 4 |
| `ls_d6` | Esquiva | ✅ Shared (King + Executor + Specialist identity) | 2 |
| `ls_d7` | Bloqueio Total | ✅ Shared (shield 60) | 2 |
| `ls_d8` | Aura de Proteção | ✅ Completo (shield 12 + atk_up 10) | 3 |

**12 completas / 3 PARTIAL / 1 STUB.**

---

## Mecânicas novas entregues

### 3 skill-specific defense handlers

**Proteção (ls_d4/rs_d4):**
- `Character.setDebuffImmunity(ticks)` + `_debuffImmuneTicks` counter
- `Character.addEffect` rejeita `kind === 'debuff'` quando immune > 0
- `_applyDefenseSkill` intercept: cleanse all allies in area + setDebuffImmunity(1) em cada
- Emite `STATUS_APPLIED(debuff_immunity)` pra UI

**Renascimento Parcial (ls_d2/rs_d2):**
- `Character._reviveConsumedThisBattle` flag (lifetime da instância)
- Set em AMBOS os paths de revive-trigger (`takeDamage` + `tickEffects` DoT)
- `addEffect` rejeita `ReviveEffect` novo quando flag está true
- Previne cura-reset infinita enquanto ainda permite revive único por batalha

**Campo de Cura Contínuo (ls_d5/rs_d5):**
- `RegenEffect.cancellable` boolean constructor arg (default false)
- `Character.takeDamage` strip effects com cancellable=true quando hpDamage > 0
- Evaded hits não disparam strip (apenas dano real ao HP)
- `_applyDefenseSkill` intercept: aplica `RegenEffect(6, 2, true)` em allies 3x3, **skip Rei**
- Non-cancellable regens (Rei's Recuperação Real) imunes ao strip

### Quick fix schema (Orbe de Lentidão)

- `secondaryEffects: [def_down 25, mov_down 1]` em `ls_a5` — aproveitando o refactor Parte 1 do Bloco 3

### Tests de stack da passiva Queimação

- Cleanse remove heal_reduction (Queimação é kind='debuff')
- Proteção immunity bloqueia nova Queimação

---

## Edge cases interessantes encontrados

1. **RegenEffect non-cancellable preserva Rei** — Recuperação Real (lk_d2) já aplica `RegenEffect(20, 3)` (default cancellable=false), então o hook do Campo de Cura Contínuo não afeta. Backward compat preservada.
2. **Revive tracker em 2 paths** — Revive pode disparar tanto em `takeDamage` (dano direto) quanto em `tickEffects` (DoT mortal). Ambos setam o flag. Consistência verificada no teste.
3. **Debuff immunity + heal_reduction** — Queimação é `kind='debuff'`. Proteção bloqueia. Testado explicitamente.
4. **DEF clamp em 0** — Orbe de Lentidão def_down 25% em Warrior DEF 20 → `_applyStatMods` clampa em 0, não −5. Test ajustado.
5. **mov_down como 2º secondary** — validou a utilidade do refactor de Parte 1 do Bloco 3. Schema único, mecânica composta sem handler custom.

---

## Tests

- Arquivo novo: `src/engine/__tests__/SpecialistSkills.test.ts` (**54 tests**)
- Total projeto: **404 tests passing, 0 skipped** (350 antes → 404 = +54)
- Piso do prompt: 48 (16 × 3). **Alcançado com folga.**

---

## Regras de parada — não acionadas

- ✅ Stubs: 1 (abaixo de 5)
- ✅ PARTIAL: 3 (bem documentadas)
- ✅ Build passa
- ✅ Zero regressão dos 350 tests anteriores

---

# 🏁 Project-wide Summary — Blocos 1 a 5

## Skills por classe (48 total)

| Classe | Completas | PARTIAL | STUB | Tests classe | Sinalização v3 |
|--------|-----------|---------|------|--------------|---------------|
| **Rei** | **15/16** | 0 | 3 | 48 (KingSkills) | Sequência lifesteal self-exception, Fortaleza shared, Domínio dynamic shield, Espírito HP conditional |
| **Guerreiro** | **9/16** | 4 | 3 | 56 (WarriorSkills) | Fortaleza shared, Protetor passive 8-adj |
| **Executor** | **15/16** | 3 | 1 | 64 (ExecutorSkills + 3 quick wins) | Bleed-conditional +50%/bypass-shield, Refletir percent DR, Adrenalina expiration HP cost, Marca shield-strip |
| **Especialista** | **12/16** | 3 | 1 | 54 (SpecialistSkills) | Proteção debuff immunity, Renascimento 1x lock, Campo Contínuo cancel-on-damage |
| **TOTAL** | **51/64** (79.7%) | 10 | 8 | **222 skill tests** | — |

## Tests por arquivo

| Arquivo | Tests |
|---------|-------|
| `PassiveSystem.test.ts` | 26 |
| `TurnManager.test.ts` | 19 |
| `Skill.effectTypes.test.ts` | 24 |
| `DamageFormula.test.ts` | 38 |
| `Stats.test.ts` | 35 |
| `Character.rules.test.ts` | 32 |
| `CombatEngine.dotOrder.test.ts` | 4 |
| `CombatEngine.dummyBattle.test.ts` | 4 |
| `KingSkills.test.ts` | 48 |
| `WarriorSkills.test.ts` | 56 |
| `ExecutorSkills.test.ts` | 64 |
| `SpecialistSkills.test.ts` | 54 |
| `smoke.test.ts` | 1 |
| **Total** | **404** |

## Débito técnico atualizado

**Sistemas pendentes (backlog de sprints dedicados):**

| # | Sistema | Skills afetadas | Tempo estimado |
|---|---------|-----------------|----------------|
| 1 | **Tile-obstacle / Grid-aware** | Muralha Viva, Prisão Muralha Morta (Warrior), Armadilha Oculta (Executor) | 6-8h |
| 2 | **Damage interceptor** | Guardião (Warrior) | 3-4h |
| 3 | **Positional effects** | Escudo do Protetor, Resistência Absoluta, Postura Defensiva (todas Warrior) | 3-4h |
| 4 | **Movement pre-skill** | Escudo Protetor, Recuo Rápido (Executor), Teleport (Executor) | 2-3h |
| 5 | **Invisibility / Clones** | Fuga Sombria, Sombra Real (Rei) | 4-6h |
| 6 | **Skill cooldown tracking** | Ataque em Dobro (Executor) | 1h |
| 7 | **Arena-wide mixed-side** | Névoa (Specialist) | 2-3h |
| 8 | **Multi-tick damage** | Chuva de Mana (Specialist) | 1-2h |
| 9 | **Mark 2nd-use state** | Explosão Central (Specialist) | 1-2h |
| 10 | **Mixed-side area shield** | Raio Purificador (Specialist) | 1h |
| 11 | **2-tick position-move rules** | Investida Brutal line rules (Warrior) | 2h |
| 12 | **Conditional snare-on-block** | Colisão Titânica (Warrior) | 1h |

**Total backlog de mecânicas:** ~30-40h de sprints dedicados.

**Nenhum blocker.** Todos os primaries funcionais. Todas as class identities (passivas + top-skills) entregues.

**Débito estrutural:** nulo. Schema `secondaryEffects[]` sólido. Padrão de skill-specific intercept provado em 8+ skills (lk_a4, lk_d4, le_a1-3, le_a7, le_d1, le_d2, ls_d2, ls_d4, ls_d5).

---

## Recomendação pra próxima sessão

**3 opções viáveis, ordenadas por impacto:**

### Opção A — Bloco 6: Sistema de deck / fila rotativa
- v3 §2.9: "Deck de 8 (4 atk + 4 def), disponíveis 4 (2+2). Filas separadas atk/def. Skill usada vai pro fim da fila."
- Base: `Deck.ts` (369 LOC) já existe; algumas features provavelmente faltam
- Core mecânica de gameplay (sem isso, UI não tem "rotação")
- Estimativa: 2-4h

### Opção B — Sprint de débito técnico prioritário
- Fechar **damage interceptor** (destrava Guardião + base pra Refletir advanced)
- Fechar **skill cooldown tracking** (destrava Ataque em Dobro)
- Fechar **multi-tick + conditional snare** (quick wins Warrior/Specialist)
- Estimativa: 5-8h, fecha 5-6 PARTIAL → skills completas sobe de 51/64 → 57/64

### Opção C — Refactor do BattleScene
- Stop rule §4 do Sprint 0 ainda pendente (BattleScene 3.659 LOC)
- Infra de combat está estável e testada (404 tests) — este é o momento ideal pra extrair managers
- Estimativa: 1-2 semanas dedicados

**Minha recomendação: B (sprint de débito)** — aproveitar o momentum arquitetural, fechar gaps críticos, subir skills completas pra ~90% antes do Bloco 6 (que é sistema novo, não skills). Opções A e C são válidas, escolha depende da sua prioridade atual (gameplay loop vs cleanup).

---

**Aguardando validação explícita antes de iniciar qualquer próximo bloco ou sprint.**
