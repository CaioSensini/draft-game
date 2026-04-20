# Bloco 2 Concluído ✅

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-21
**Commits principais:**
- `bloco2: 16 King skills implementation + tests`
- `bloco2: Domínio Real dynamic shield (25% of total damage dealt)`
- `bloco2: Espírito de Sobrevivência HP-conditional effect`

## Status das 16 skills do Rei (v3 §6.5) — **13/16 completas**

| ID | Nome | Estado mecânico | Tests |
|----|------|-----------------|-------|
| lk_a1 | Soco Real | ✅ Completo | 3 |
| lk_a2 | Chute Real | ✅ Completo | 2 |
| lk_a3 | Sequência de Socos | ✅ Completo (lifesteal + King-exception) | 3 |
| lk_a4 | Domínio Real | ✅ **Completo (shield dinâmico 25% implementado)** | 5 |
| lk_a5 | Empurrão Real | ✅ Completo | 2 |
| lk_a6 | Contra-ataque | ✅ Completo | 2 |
| lk_a7 | Intimidação | 🟡 Damage + teleport event OK, adjacentes não movidos | 3 |
| lk_a8 | Desarme | ✅ Completo (silence_attack + King-exception) | 4 |
| lk_d1 | Fuga Sombria | 🟡 Status emitido, enforcement untargetable é stub | 2 |
| lk_d2 | Recuperação Real | ✅ Completo (regen bypassa King-immunity) | 2 |
| lk_d3 | Sombra Real | 🟡 Status emitido, spawn de clones é stub | 2 |
| lk_d4 | Espírito de Sobrevivência | ✅ **Completo (HP conditional + shield implementados)** | 5 |
| lk_d5 | Escudo Self | ✅ Completo | 2 |
| lk_d6 | Fortaleza Inabalável | ✅ Completo (compartilhada com Warrior) | 2 |
| lk_d7 | Esquiva | ✅ Completo (compartilhada com Exec/Spec) | 2 |
| lk_d8 | Ordem Real | ✅ Completo (teleport event + def_up) | 3 |

**13 completas / 3 com stubs documentados.**

---

## Quick wins aplicados (pós-validação do usuário)

### Quick Win 1 — Domínio Real shield dinâmico 25%
- `_applyOffensiveSkill` agora retorna `hpDamage dealt` (number); callers single-target ignoram, área agrega.
- `CombatEngine._applyAttackSkill` área case: soma `totalDamageDealt`; se skill.id é `lk_a4`/`rk_a4` e total > 0, aplica `caster.addShield(round(total × 0.25))`.
- Edge case validado: todos os alvos evadem → shield = 0, não aplica.
- 2 tests novos substituindo o `it.skip` anterior.

### Quick Win 2 — Espírito de Sobrevivência HP-conditional
- API nova em `Character`: `addMaxHpBonus(amount, ticks)`, `maxHpBonus`, `maxHpBonusTicks`.
- `Character.maxHp` agora inclui `_maxHpBonus` (effective max).
- `Character.hpRatio` usa `this.maxHp` (dinâmico) — Execute se ajusta corretamente ao bônus.
- Referências internas a `this.baseStats.maxHp` atualizadas para `this.maxHp` em heal/revive/regen.
- `tickEffects`: decrementa `_maxHpBonusTicks`; na expiração, zera bônus e **clampa HP down** ao baseMax (decisão registrada em DECISIONS.md).
- `CombatEngine._applyDefenseSkill`: intercepta `lk_d4`/`rk_d4` ANTES do resolver genérico, chama `_applyEspiritoSobrevivencia`.
- Lógica condicional:
  - HP ≤ 50%: `addMaxHpBonus(15% × baseMax, 1)` + `addShield(10% × baseMax)`
  - HP > 50%: `addMaxHpBonus(10% × baseMax, 1)` (sem shield)
- 4 tests novos cobrindo ambos os ramos + dois cenários de expiração.

---

## Cartas compartilhadas

- **Esquiva** — verificada em 3 classes (King, Executor, Specialist).
- **Fortaleza Inabalável** — verificada em King + Warrior.

## Tests
- Arquivo: `src/engine/__tests__/KingSkills.test.ts`
- **48 tests, 0 skipped** (antes: 45 passing + 2 skipped).
- Piso do prompt: 48 (16 × 3). **Alcançado.**
- Total projeto: **227 tests passing, 0 skipped.**

## Stubs restantes (3, documentados)

1. **Intimidação adjacentes** (`lk_a7`) — teleport do alvo ocorre, mas não move os adjacentes. Requer `teleport_target` multi-target no resolver.
2. **Fuga Sombria invisibility enforcement** (`lk_d1`) — status emitido, mas TargetingSystem não filtra untargetables. Requer extensão no TargetingSystem.
3. **Sombra Real clones** (`lk_d3`) — status emitido, mas clones não spawnam. Requer decisão de design (clones são Characters reais em `Team.all` OU só entidades visuais no scene) + refactor no Team/Grid.

## Edge cases encontrados

1. Lifesteal no Rei bloqueado pela King-immunity (fix: exception no handler).
2. Silence_attack no Rei (v3 diz "não afeta reis"). Guard implementado.
3. Regen no Rei já funcionava por acidente arquitetural (tickEffects bypassa heal()).
4. Tests com `battle` não usada → `void mkBattle(...)`.
5. STATUS_APPLIED union incompleto → estendido com shield, hp_up, silence_attack, teleport_*, invisibility, clone, mov_up.
6. **HP bonus expiration clamp** (quick win 2) — decisão de design documentada: clampa HP down ao baseMax.
7. **Domínio Real damage aggregation** — precisou refatorar `_applyOffensiveSkill` return type de `void` para `number`. Single-target callers continuam funcionando (ignoram o return).
8. **Espírito de Sobrevivência intercepted** — skill-id specific bypass no `_applyDefenseSkill` antes do resolver genérico. Padrão agora usado por 2 skills (lk_a4 + lk_d4), deve virar convenção se mais skills precisarem.

## Próximo passo

**Bloco 3 — Guerreiro**, conforme aprovação do usuário.

Estimativa: 4-6h similares ao padrão de Bloco 2. Único sistema novo esperado: `summon_wall` (Muralha Viva, Prisão de Muralha Morta).
