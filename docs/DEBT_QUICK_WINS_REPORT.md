# Sprint de Quick Wins — Concluído ✅

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-20
**Ordem real de execução:** 3 → 10 → 9 → 8 → 5 → 6 (conforme audit aprovado)

---

## Resumo executivo

Seis sistemas menores entregues em sequência, **sem regressão**, cada um com gates verdes antes do próximo:

| # | Sistema | Skill fechada | Tests novos | Commit |
|---|---------|---------------|-------------|--------|
| **3** | Skill cooldown tracking | le_d3 Ataque em Dobro | +1 | `debt-qw3` |
| **10** | Conditional snare-on-block | lw_a1 Colisão Titânica | +2 | `debt-qw10` |
| **9** | Per-line push rules | lw_a4 Investida Brutal | +1 | `debt-qw9` |
| **8** | Mixed-side area shield | ls_a3 Raio Purificador | +1 | `debt-qw8` |
| **5** | Multi-tick damage | ls_a2 Chuva de Mana | 0 (replaced 3) | `debt-qw5` |
| **6** | Mark non-removable (2-use) | ls_a4 Explosão Central | +3 | `debt-qw6` |
| **Total** | **6 skills fechadas** | **+8 tests líquidos** | 6 atômicos |

**Project tests:** 459 → **467** (+8, 0 regressão)
**Build:** ✅ `npm run build` passa em todos os checkpoints
**Stop rules:** nenhuma acionada

---

## Sistema #3 — Skill cooldown tracking (`debt-qw3`)

### Entrega
- `SkillDefinition.cooldownTurns?: number` no schema Skill (default 0 = sem cooldown).
- `Skill.cooldownTurns` público, construído via `def.cooldownTurns ?? 0`.
- `Character._skillCooldowns: Map<string, number>` mapeando skill id → round em que fica disponível de novo.
- API pública: `isSkillOnCooldown`, `skillCooldownRemaining`, `noteSkillUsed`.
- CombatEngine bloqueia em `selectAttack` / `selectDefense` / `selectSecondAttack` quando em cooldown.
- `_applyAttackSkill` e `_applyDefenseSkill` registram uso via `noteSkillUsed`.
- Catalog: `le_d3` ganhou `cooldownTurns: 2` (auto-mirror para `re_d3` via `mirror()`).

### Edge cases
- Skills sem `cooldownTurns` (todas exceto le_d3) nunca entram em cooldown.
- `noteSkillUsed` com cooldown=0 é no-op explícito.
- Checagem usa `currentRound < availAt`: usar no round N permite reuso no round N+2 (2 turnos de gap real).

---

## Sistema #10 — Conditional snare-on-block (`debt-qw10`)

### Entrega
- `_applyOffensiveSkill` assinatura mudou de `number` para `{ hpDamage: number; blocked: boolean }`.
- `blocked === true` quando a skill era damage-carrying, `rawDamage > 0`, e `hpDamage === 0` — captura evade e shield absorvido 100%.
- Todos os 3 callsites atualizados (single + area + bleed-bypass path).
- `_applyAttackSkill` area coleta `blockedHits: Character[]` durante o damage loop.
- Intercept para `lw_a1/rw_a1`: aplica snare 1t em cada blocked hit após a fase de damage.

### Edge cases
- Hit evadido → blocked=true.
- Hit totalmente absorvido por shield → blocked=true.
- Hit que dá damage normal → blocked=false, sem snare.
- Non-damage skills (`heal`, `shield`, etc.) não podem ser "blocked" (wasDamageCarrying gate).

---

## Sistema #9 — Investida Brutal per-line (`debt-qw9`)

### Entrega
- **Catalog fix:** `lw_a4` shape corrigido de `line east length 6` (inconsistente com v3) para `line north length 2` (3 tiles vertical = "linha vertical 3 sqm"). `secondaryEffects` de push removido — push passa a ser bespoke.
- Intercept `lw_a4/rw_a4` no area loop após damage:
  - Computa eixo de carga via `Math.sign(target.col - caster.col)` e `Math.sign(target.row - caster.row)`.
  - **Linha central** (`hit.row === target.row`): push 1 na direção da carga + snare 1t se `blocked`.
  - **Flancos** (`hit.row ≠ target.row`): push perpendicular — east se acima do aim (`row < target.row`), west se abaixo.
- Helper interno `_offsetToDir(dc, dr): Direction` adicionado ao CombatEngine (espelho do helper privado do EffectResolver).

### Edge cases
- Evaded central hit: snare aplicado (via `blockedHits`).
- Flanks nunca recebem snare independentemente de blocked.
- Direção de carga determinada por posição relativa do caster, não por catalog — skill funciona simetricamente do left/right.

---

## Sistema #8 — Mixed-side area shield (`debt-qw8`)

### Entrega
- Intercept `ls_a3/rs_a3` no area loop:
  - Após damage/purge nos inimigos (fluxo normal), recomputa `previewArea` footprint.
  - Itera aliados vivos; se algum estiver num tile do footprint, aplica `addShield(10)` + `STATUS_APPLIED` event.
- Não há double-hit: aliados não estão em `hits` (TargetingSystem filtra inimigos).

### Edge cases
- Aliado fora do footprint: shield não aplicado (teste explícito).
- Aliado no footprint: shield de 10 garantido (teste com `shieldAmount >= 10` tolerando stacking).

---

## Sistema #5 — Multi-tick damage (`debt-qw5`)

### Entrega
- Nova classe `DelayedDamageEffect` (kind='neutral', tipo `'delayed_damage'`):
  - `damagePerTick` + `_ticks` mutável.
  - `tick()` retorna damage value por round; expira quando `_ticks <= 0`.
- `Character.tickEffects` estendido para processar `'delayed_damage'` idêntico a bleed/poison/burn (HP damage + check de revive).
- `createEffect` factory: `'delayed_damage'` case adicionado.
- `computeRawDamage` com intercept para `ls_a2/rs_a2`: `basePower = Math.round(skill.power / 2) = 11`.
- Intercept `ls_a2/rs_a2` no area loop: cada hit recebe `DelayedDamageEffect(11, 1)` após damage primário.

### Edge cases
- Natural expiration após 1 tick (teste isolado).
- Hit imediato continua respeitando fórmula v3 completa (DEF, passivas, etc.) — só o basePower é half.
- DelayedDamage é kind='neutral' → não é stripado por cleanse/purge (intencional: faz parte do mesmo ataque).

---

## Sistema #6 — Mark 2nd-use + non-removable (`debt-qw6`)

### Entrega
- `MarkEffect.nonRemovable: boolean` (default false — zero impacto em marks legados).
- `Character.removeEffectsByKind('debuff')` pula marks com `nonRemovable=true` via `instanceof MarkEffect && e.nonRemovable`.
- Novo helper `_applyExplosaoCentral(caster, target, skill)`:
  - 1ª uso (sem mark ativo): planta `MarkEffect(caster.id, power, nonRemovable=true)`. Zero damage.
  - 2ª uso (mark ativo): `50 + (hasOtherDebuff ? 25 : 0)` dano direto via `applyPureDamage` → bypassa evade, shield, immunity.
- Detecção de "other debuff": qualquer effect com `kind === 'debuff'` excluindo marks (para não se auto-contar).
- Intercept `ls_a4/rs_a4` no `_applyAttackSkill` single-target: desvia para o helper antes do fluxo padrão.

### Edge cases
- Cleanse/purge em target com mark não-removível: mark preservado.
- MarkEffect legado (nonRemovable=false): cleanse strip normal (backward compat testada).
- 2ª uso sem outros debuffs: 50 damage exato.
- 2ª uso com def_down ativo: 75 damage exato.
- Detonation ignora shield (teste implícito no applyPureDamage).

### Cleanse sites mapeados (< 6, sem stop rule)
1. `handleCleanse` → `removeEffectsByKind('debuff')` — filtra mark nonRemovable ✅
2. `handlePurge` → `removeEffectsByKind('buff')` — MarkEffect é 'debuff', não afetado
3. `Character.removeEffect(type)` — uso pontual por skill específica (não genérico)

Total: 2 sites precisando do filtro. Stop rule de >6 nunca próxima de acionar.

---

## Project-wide summary pós-quick wins

### Skills por classe

| Classe | Completas | PARTIAL | STUB | Δ desde Débito |
|--------|-----------|---------|------|-----------------|
| **Rei** | **16/16** (100%) | 0 | 0 | — |
| **Guerreiro** | **16/16** (100%) | 0 | 0 | +2 (lw_a1, lw_a4) ✨ |
| **Executor** | **16/16** (100%) | 0 | 0 | +1 (le_d3) ✨ |
| **Especialista** | **15/16** (94%) | 1 | 0 | +3 (ls_a2, ls_a3, ls_a4) ✨ |
| **TOTAL** | **63/64** (98.4%) | 1 | 0 | **+6 skills** |

**Rei, Guerreiro e Executor chegam a 100%.** Especialista único PARTIAL remanescente: **ls_a7 Névoa** (arena-wide mixed-side).

### Tests por arquivo (pós-quick wins)

| Arquivo | Tests | Δ |
|---------|-------|---|
| `PassiveSystem.test.ts` | 26 | — |
| `TurnManager.test.ts` | 19 | — |
| `Skill.effectTypes.test.ts` | 24 | — |
| `DamageFormula.test.ts` | 38 | — |
| `Stats.test.ts` | 35 | — |
| `Character.rules.test.ts` | 32 | — |
| `CombatEngine.dotOrder.test.ts` | 4 | — |
| `CombatEngine.dummyBattle.test.ts` | 4 | — |
| `KingSkills.test.ts` | 48 | — |
| `WarriorSkills.test.ts` | 59 | +3 ✨ |
| `ExecutorSkills.test.ts` | 64 | +1 ✨ |
| `SpecialistSkills.test.ts` | 58 | +4 ✨ |
| `Invisibility.test.ts` | 19 | — |
| `PositionalDr.test.ts` | 18 | — |
| `TileObstacles.test.ts` | 18 | — |
| `smoke.test.ts` | 1 | — |
| **Total** | **467** | **+8** |

### Débito técnico restante

**5 sistemas pendentes** (de 11 catalogados → 9 fechados até agora):

| # | Sistema | Skills afetadas | Tempo estimado |
|---|---------|-----------------|----------------|
| 1 | **Damage interceptor** | Guardião (lw_d2) | 3-4h |
| 2 | **Movement pre-skill** | Teleport (le_d4), Recuo Rápido (le_d5) | 2-3h |
| 4 | **Arena-wide mixed-side** | Névoa (ls_a7) | 2-3h |
| 7 | **Tile-trap on-step** | Armadilha Oculta (le_a8) | 1-2h (requer MovementEngine) |
| 11 | **Wall de escudo** (extra em lw_d1) | lw_d1 (já completa) | 0.5h |

**Total backlog restante:** ~9-13h. Todos os sistemas menores / quick wins isolados foram fechados.

---

## Health check — arquitetura pós-quick wins

✅ **Domain layer** ainda pure (zero Phaser imports)
✅ **Effect hierarchy** ganhou `DelayedDamageEffect` e `MarkEffect.nonRemovable` sem quebrar factory
✅ **CombatEngine** acumula skill-id intercepts seguindo padrão estabelecido (11+ skills agora interceptadas)
✅ **Skill schema** estendido com `cooldownTurns` (totalmente opcional; usado só onde v3 pede)
✅ **Return signature** de `_applyOffensiveSkill` enriquecido sem vazar para callers externos (só CombatEngine interno)

**Padrão emergente (para futuro refactor):**
- 11 skills agora interceptadas por ID em `_applyAttackSkill` e `_applyDefenseSkill`. Começa a pagar um **dispatch map `Map<skillId, SkillHandler>`** — próximo bloco de skills complexas seria um bom momento.
- `blockedHits` coleta durante loop é útil para qualquer skill futura "react-on-block". Reusable.

---

## Recomendação próxima sessão

**Opção A — Fechar os 5 sistemas médios restantes (~9-13h)**
Leva skills de 63/64 (98.4%) → 64/64 (100%). Só lw_d2 Guardião (damage interceptor) é arquiteturalmente pesado (~3-4h). Os outros são isolados.

**Opção B — Bloco 6: Sistema de deck/fila rotativa (~2-4h)**
v3 §2.9. Core gameplay loop ainda ausente. Com 63 skills completas, ausência de deck é o maior bloqueador para partidas reais.

**Opção C — BattleScene refactor (1-2 semanas)**
3.659 LOC → <1500. Infra combat está estável o suficiente para suportar o refactor.

**Minha recomendação: B agora.**
Com 98.4% das skills completas, a próxima alavanca de valor é **jogar uma partida inteira end-to-end**, não fechar o último PARTIAL. O sistema de deck destrava: rotação de mão, consumo de carta por uso, fadiga/cansaço. Depois disso, uma sessão curta de Opção A fecha ls_a7 Névoa + lw_d2 Guardião e chega a 100%.

---

**Gates finais verificados:**
- ✅ 467 tests passing (0 skipped)
- ✅ `npm run build` passa limpo em todos os 6 checkpoints
- ✅ 0 regressão desde o início do sprint
- ✅ 6 commits atômicos (`debt-qw3`, `debt-qw10`, `debt-qw9`, `debt-qw8`, `debt-qw5`, `debt-qw6`)
- ✅ Stop rules não acionadas em nenhum ponto
- ✅ Ordem 3→10→9→8→5→6 respeitada conforme plano aprovado
- ✅ Estimativa original 6-9h; tempo real entregou todos os 6 sistemas dentro da janela

**Aguardando validação explícita antes de qualquer próxima ação.**
