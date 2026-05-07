# Skills Audit — comparação spec vs implementação

> Auditoria iniciada em 2026-05-07. Compara CARTAS_DRAFT_v1.1.md (fonte de verdade) com o estado real do engine. Cada classe ganha sua tabela conforme a sessão avança.

---

## REI (lk_*) — auditado em 2026-05-07

| ID | Skill | Status | Bugs encontrados | Fix nesta sessão |
|----|-------|--------|------------------|------------------|
| lk_a1 | Soco Real | 🟢 OK | Shield secondary aplicava no inimigo, não no Rei | ✅ `target: 'caster'` adicionado |
| lk_a2 | Chute Real | 🟢 OK | Shield secondary aplicava no inimigo, não no Rei | ✅ `target: 'caster'` adicionado |
| lk_a3 | Sequência de Socos | 🟡 Quase | areaShape `square radius 1` (3×3 = 9 tiles) mas doc v1.1 diz "3 vertical × 2 horizontal" (6 tiles). Lifesteal funciona ✓ | ⏭️ deferido — comportamento é razoável, ajuste de área é polish |
| lk_a4 | Domínio Real | 🟢 OK | Cap 30 já aplicado em v1.1 | — |
| lk_a5 | Empurrão Real | 🟢 OK | Push capava em 5 (era `min(power, 5)`); refatorado pra secondary push 3 | ✅ catalog refatorado para `effectType: 'area'` + secondary push |
| lk_a6 | Contra-ataque | 🟢 OK | — | — |
| lk_a7 | Intimidação | 🔴 STUB | `handleTeleportTarget` é stub — só emite evento, não teleporta nada. Adjacents não movem. | ⏭️ Etapa 3 (handler bespoke + UI tile picker) |
| lk_a8 | Desarme | 🟡 Parcial | Aplica silence_attack ✓, mas "Não afeta Reis inimigos" não é validado (King-side filter ausente) | ⏭️ Etapa 2 (filter trivial) |
| lk_d1 | Fuga Sombria | 🟢 OK | Bespoke `setInvisibility` funciona | — |
| lk_d2 | Recuperação Real | 🟢 OK (FIX) | Catalog tinha `power: 0` → curava 0 HP. Faltava bespoke handler com 10% maxHp/tick | ✅ bespoke handler — heal 10% maxHp imediato + RegenEffect cancelável 10% no próximo tick |
| lk_d3 | Sombra Real | 🔴 STUB | `handleClone` só emite evento — clones visuais não existem | ⏭️ Etapa 3 (decisão P3 do DECISIONS_PENDING) |
| lk_d4 | Espírito de Sobrevivência | 🟢 OK | gate HP ≤ 60% aplicado em v1.1 | — |
| lk_d5 | Escudo Self | 🟢 OK | — | — |
| lk_d6 | Fortaleza Inabalável (shared) | 🟢 OK | -80% dano via stun-self + redução. Engine tem `Character.fortalezaTicks` etc. | — |
| lk_d7 | Esquiva (shared) | 🟢 OK | — | — |
| lk_d8 | Ordem Real | 🟡 Parcial | `teleport_target` é stub; def_up secondary aplica corretamente. Reposicionamento de aliados não acontece. | ⏭️ Etapa 3 |

**Resumo Rei:** 13/16 funcionando após fixes desta etapa. 3 stubs (lk_a7 Intimidação, lk_d3 Sombra Real, lk_d8 Ordem Real teleport) deferidos pra Etapa 3 — todos exigem novos sistemas (UI tile picker pra teleport_target, sprite-clones-fake, etc.) e não são triviais.

---

## Bugs cross-cutting corrigidos nesta sessão

1. **Defense single-target (Cura Suprema)** não tinha fluxo de target picker — defesa caía em `default: return [char]` no resolver, curando o caster em vez do aliado escolhido. Agora:
   - `GameController.useSkill` entra em modo `awaiting_target` para defense+single
   - `chooseTarget` roteia para `selectDefense(target)` ou `selectAttack(target)` conforme a categoria
   - `CombatEngine.selectDefense` aceita opcional target spec; valida que defense+single tem target
   - `_resolveDefenseTargets` honra o target armazenado para case 'single'
   - `getValidTargets` retorna aliados (filtrando Rei para skills de heal/regen)

2. **Push secondary cap** — `handlePush` capava em `min(power, 5)`. Empurrão Real (lk_a5 power: 12 dano) empurrava 5 sqm em vez dos 3 da spec. Refatorado: lk_a5 vira `area` + `secondary push 3` reusando o caminho secundário testado. Cap geral subiu para 6 (margem de segurança).

3. **Push visual animation** — BattleScene não tinha listener para `UNIT_PUSHED`, sprite ficava parado visualmente após push. Adicionado handler que tween-anima o sprite com squash/stretch (semelhante ao `CHARACTER_MOVED` mas curto).

4. **Secondary effect target routing** — `SecondaryEffectDef` ganhou `target?: 'caster' | 'target'` para resolver self-shield-on-attack patterns (Soco Real, Chute Real). Default 'target' mantém retrocompat.

---

## STUBS confirmados que serão tratados em Etapa 3

| Effect | Skills afetadas | Trabalho necessário |
|---|---|---|
| `teleport_target` | lk_a7 Intimidação, lk_d8 Ordem Real | Tile picker no BattleScene + lógica de relocação multi-unit no engine |
| `clone` | lk_d3 Sombra Real | Sprite system com clones fake + heurística do bot pra atacar aleatoriamente (decisão P3) |
| `summon_wall` | lw_a6 Muralha Viva, lw_a8 Prisão de Muralha Morta, lw_d1 Escudo do Protetor | Obstáculo persistente no Grid + lógica de destruição em atk1 (parcial em alguns) |

---

## Próximas etapas

- **Etapa 2**: audit Guerreiro + Executor + Especialista (48 skills) usando o mesmo formato desta tabela. Provável: encontrar mais self-buff secondaries com problema similar (corrigíveis com `target: 'caster'`), mais stubs (`summon_wall` é o maior).
- **Etapa 3**: tackle os STUBS sérios + e2e tests + visual polish.
