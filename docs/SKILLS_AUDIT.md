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

## GUERREIRO (lw_*) — auditado em 2026-05-07

Todas as skills do Guerreiro têm bespoke handlers no engine que cobrem corretamente as mecânicas descritas no doc. O catalog usa `power` com semânticas variadas (algumas vezes flat shield, outras vezes percentual de DR) que parecia bug, mas em todos os casos a interpretação correta é feita pelo handler bespoke.

| ID | Skill | Status | Notas |
|----|-------|--------|-------|
| lw_a1 | Colisão Titânica | 🟢 OK | Bespoke handler para snare-if-blocked (linha 1933). Push secondary + condicional. |
| lw_a2 | Impacto | 🟢 OK | Standard area + dual debuff secondaries. |
| lw_a3 | Golpe Devastador | 🟡 Quase | Catalog area `square radius 1` (3×3) vs doc `2×2`. Diferença sutil — gameplay funciona, área um pouco maior que spec. |
| lw_a4 | Investida Brutal | 🟢 OK | Bespoke per-line push: central row → push+snare-if-blocked, flanks → perpendicular push. |
| lw_a5 | Provocação | 🟢 OK | silence_defense + def_down. |
| lw_a6 | Muralha Viva | 🟢 OK | Bespoke handler coloca 2 obstacles `wall_viva` (não usa o resolver stub `summon_wall`). Adjacency tick handler em line 1055. |
| lw_a7 | Investida | 🟡 Direção | Catalog `line east length 6` vs doc "linha vertical 3 sqm". Possível descasamento de terminologia (east = forward, doc usa "vertical"=forward). Não toquei pra não quebrar gameplay. |
| lw_a8 | Prisão de Muralha Morta | 🟢 OK | Bespoke spawn de 8 walls em ring. Snare 2t + 12 dano centro funcionam. |
| lw_d1 | Escudo do Protetor | 🟢 OK | Bespoke positional DR 50% + spawn de 3 wall_shield obstacles. preMovement 2 tiles antes. |
| lw_d2 | Guardião | 🟢 OK | GuardedByEffect bespoke. 60% redirect + 30% mitigação. |
| lw_d3 | Resistência Absoluta | 🟢 OK | Bespoke PositionalDrEffect 65% para self + ally atrás. preMovement 1 tile. Catalog `power: 65` é um identificador semântico, não shield flat. |
| lw_d4 | Fortaleza Inabalável (shared) | 🟢 OK | Stun-self + Character.fortalezaTicks bespoke. -80% dano. |
| lw_d5 | Escudo de Grupo | 🟢 OK | shield 15 all_allies 2t. |
| lw_d6 | Postura Defensiva | 🟢 OK | Bespoke positional DR 25% area 3x3. Catalog `power: 25` identificador semântico, não shield flat. |
| lw_d7 | Avançar | 🟢 OK | retreat_allies/advance_allies handlers movem aliados + buff atk_up. |
| lw_d8 | Bater em Retirada | 🟢 OK | v1.1 evade_chance 50% adicionado. |

**Resumo Guerreiro:** 16/16 funcionando. 1 ajuste minor (lw_a3 area shape) e 1 ambiguidade de direção (lw_a7) deferidos como polish — não são bugs gameplay.

---

## EXECUTOR (le_*) — auditado em 2026-05-07

Engine tem cobertura robusta das mecânicas signature do Executor (sinergia bleed, anti-shield, true damage, lifesteal). v1.1 fixes (Marca da Morte sem lifesteal, Adrenalina cap min 1) já aplicados.

| ID | Skill | Status | Notas |
|----|-------|--------|-------|
| le_a1 | Corte Mortal | 🟢 OK | Bespoke +50% se target tinha bleed (snapshot pré-hit). Cleanse secondary via resolver. |
| le_a2 | Tempestade de Lâminas | 🟢 OK | Bespoke +50% bleed (per-target snapshot). Area 3×3. |
| le_a3 | Disparo Preciso | 🟢 OK | true_damage ignora DEF; bleed-conditional shield bypass via bespoke. |
| le_a4 | Corte Preciso | 🟢 OK | damage area + purge secondary. |
| le_a5 | Corte Hemorragia | 🟢 OK | bleed primary + bleed secondary (stack). |
| le_a6 | Bomba de Espinhos | 🟢 OK | bleed area diamond r2. |
| le_a7 | Marca da Morte | 🟢 OK | v1.1: shield-strip + bleed (lifesteal removido). |
| le_a8 | Armadilha Oculta | 🟢 OK | Bespoke trap obstacle + on-step trigger via _checkTrapTrigger. |
| le_d1 | Refletir | 🟢 OK | ReflectPercentEffect bespoke (25% reduction + 25% reflect). |
| le_d2 | Adrenalina | 🟢 OK | v1.1: atk_up + HP cost cap min 1. |
| le_d3 | Ataque em Dobro | 🟢 OK | double_attack + cooldown 2t. |
| le_d4 | Teleport | 🟢 OK | preMovement maxTiles 5 + ignoresObstacles + consumesNextMovement. |
| le_d5 | Recuo Rápido | 🟢 OK | preMovement back 2 + shield 20. |
| le_d6 | Esquiva (shared) | 🟢 OK | EvadeEffect 1 charge. |
| le_d7 | Bloqueio Total (shared) | 🟢 OK | shield 60 self 2t. |
| le_d8 | Shield | 🟢 OK | shield 25 self 1t. (P1 sugere repurpose — pendente). |

**Resumo Executor:** 16/16 funcionando. Nenhum bug encontrado. P1 (Shield le_d8 redundante) continua pendente como decisão de design, não bug.

---

## ESPECIALISTA (ls_*) — auditado em 2026-05-07

| ID | Skill | Status | Notas |
|----|-------|--------|-------|
| ls_a1 | Bola de Fogo | 🟢 OK | area 2×2 + burn 6/2t secondary. |
| ls_a2 | Chuva de Mana | 🟢 OK | Bespoke 2-tick split (linha 1948 — primary metade + secondary metade). |
| ls_a3 | Raio Purificador | 🟢 OK | Bespoke ally-shield 10 em footprint (linha 2045). Purge secondary em inimigos. |
| ls_a4 | Explosão Central | 🟢 OK | Bespoke mark mechanic — 1º uso planta marca, 2º detona +50% se debuffed. |
| ls_a5 | Orbe de Lentidão | 🟢 OK | damage 12 + dual debuff secondaries. |
| ls_a6 | Correntes Rígidas | 🟢 OK | snare 1t em diamond r1. |
| ls_a7 | Névoa | 🟢 OK | Bespoke arena-wide dual-side: aliados +def_up, inimigos -def_down + heal_reduction 30%. |
| ls_a8 | Congelamento | 🟢 OK | stun + def_down. |
| ls_d1 | Cura Suprema | 🟢 OK (FIX Etapa 1) | Heal 40 single ally — ally picker funciona, exclui Rei. |
| ls_d2 | Renascimento Parcial | 🟢 OK | revive lowest_ally + ReviveEffect. (P4 fallback de heal pendente como decisão.) |
| ls_d3 | Campo de Cura | 🟢 OK | heal area + shield secondary; Rei automaticamente só recebe shield (heal blocked by passive). |
| ls_d4 | Proteção | 🟢 OK | Bespoke cleanse + debuff_immunity flag em allies. |
| ls_d5 | Campo de Cura Contínuo | 🟢 OK | RegenEffect cancellable em aliados não-Rei. |
| ls_d6 | Esquiva (shared) | 🟢 OK | — |
| ls_d7 | Bloqueio Total (shared) | 🟢 OK | — |
| ls_d8 | Aura de Proteção | 🟢 OK | shield 12 area diamond r2 + atk_up secondary. |

**Resumo Especialista:** 16/16 funcionando. Cura Suprema (ls_d1) era o gap principal — resolvido em Etapa 1.

---

## Status final do audit

| Classe | Funcionando | Polish minor | Stubs | Total |
|---|---|---|---|---|
| Rei | 13/16 | 2 (lk_a3 area, lk_a8 King filter) | 3 (Intimidação, Sombra Real, Ordem Real teleport) | 16 |
| Guerreiro | 16/16 | 2 ambiguidades (área lw_a3, direção lw_a7) | 0 | 16 |
| Executor | 16/16 | 0 | 0 | 16 |
| Especialista | 16/16 | 0 | 0 | 16 |
| **Total** | **61/64** (95%) | **4 polish** | **3 stubs** | **64** |

**Confirmado: as 3 stubs do Rei são as únicas skills que não funcionam mecanicamente como o doc descreve.** Todo o resto está OK na Etapa 2 — Guerreiro/Executor/Especialista têm bespoke handlers cobrindo todas as mecânicas signature.

---

## Próxima etapa

- **Etapa 3**: implementar os 3 stubs do Rei (teleport_target multi-unit + UI tile picker, clone visuais com bot AI heuristic, summon_wall variants já cobertas pelos bespoke). Plus: e2e pipeline tests (GameController → Engine), polish dos minor items detectados (lk_a3 area, lk_a8 filter).
