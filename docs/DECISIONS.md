# DECISIONS.md — Registro de Decisoes de Design

> Memoria persistente do projeto. Toda decisao relevante de design, arquitetura ou direcao artistica deve ser registrada aqui.

---

## 2026-04-20 — Sprint 0.4: PARADA AUTOMATICA §4 — refactor de BattleScene adiado

**Contexto:** Sprint 0 subtarefa 0.4 pediu extracao de 3 managers (Targeting, Animation, UI) do BattleScene.ts (3659 LOC) com meta de BattleScene final abaixo de 1500 LOC. A inspecao detalhada revelou:

- ~100 campos privados no BattleScene, todos inter-referenciados
- Metodos de renderizacao (`_drawBackground`, `_drawGrid`, `_drawHUD`, `_drawStatusPanels`, `_buildTurnTrackerShell`, `_renderTurnTracker`, `_renderMiniLog`, etc.) compartilham estado via `this._sprites`, `this._panelBg`, `this._turnEntries`, `this._miniLogObjs`, etc.
- Handlers de eventos tocam multiplos sistemas (animacao + UI + targeting) em um mesmo callback.

**Alternativas avaliadas:**
- **A)** Extracao completa e limpa — 1-2 semanas de refactor dedicado, fora do escopo Sprint 0.
- **B)** Extracao parcial/superficial (managers que so seguram referencias de volta pra scene) — produz codigo organizacionalmente dividido mas sem ganho real de manutencao, e deixa estado hibrido que atrapalha refactor futuro.
- **C)** Acionar regra de parada §4 do prompt ("se achar que 1500 LOC e inatingivel sem quebrar gameplay, pare e reporte") — documentar arquitetura alvo, deixar placeholder, seguir adiante com as outras subtarefas.

**Decisao:** Alternativa **C**. Razao: o custo-beneficio de uma extracao parcial neste sprint nao compensa o risco de introduzir estado hibrido que atrapalhe o refactor real futuro. Sprint 0 tem outras subtarefas de alto impacto (0.5 Supabase, 0.6 mobile scale, 0.7 touch audit) que sao mais viaveis de entregar bem.

**Consequencias:**
- `src/scenes/battle/managers/README.md` criado com a arquitetura alvo e o plano de migracao detalhado.
- `BattleScene.ts` fica nos 3659 LOC atuais. Sem extracao aplicada.
- Refactor real entra no backlog como sprint dedicado de 1-2 semanas.

**Status:** Subtarefa 0.4 marcada como **parcialmente concluida — stop rule §4 acionada**. Continuando 0.5-0.7.

---

## 2026-04-20 — Sprint 0.1: unificacao de design tokens

**Contexto:** `constants.ts` (205 LOC em src/data/) e `DesignTokens.ts` (131 LOC em src/utils/) coexistiam como duas fontes conflitantes de cores, tamanhos, fontes e regras visuais. 7 conflitos reais foram identificados antes da consolidacao (cores de time, cores de classe, shape do STROKE).

**Alternativas avaliadas:**
- **A)** DesignTokens vence 100% (arquitetura + valores). Problema: os valores de classe em DesignTokens estavam todos em tons de azul/ciano/roxo, matando a legibilidade competitiva no grid.
- **B)** constants.ts vence 100%. Problema: estrutura flat e nomes nao-semanticos (COLORS.KING vs colors.class.king).
- **C)** Arquitetura DesignTokens + valores de cor da constants.ts (heterogenea). Adotada.

**Decisao:**
- **DesignTokens.ts e a unica fonte de verdade** a partir de agora. `src/data/constants.ts` foi deletado.
- **Valores de cor de TIME e CLASSE vem de constants.ts** (conforme diretriz do usuario):
  - `colors.team.ally = 0x3b82f6` (azul)
  - `colors.team.enemy = 0xef4444` (vermelho)
  - `colors.class.king = 0xfbbf24` (dourado)
  - `colors.class.warrior = 0x8b5cf6` (violeta)
  - `colors.class.specialist = 0x10b981` (verde)
  - `colors.class.executor = 0xdc2626` (vermelho)
- **Demais conflitos:**
  - `STROKE` shape: prevalece versao de DesignTokens `{color, thin, normal, thick}`. A versao de constants `{WIDTH, ALPHA}` nao era importada em lugar nenhum — deletada sem risco.
  - Demais atributos de cor nao-time/nao-classe: mantidos os valores originais sem conflito significativo.
- **Nova nomenclatura semantica adicionada:** `colors.*`, `fonts.*`, `sizes.*`, `spacing.*`, `timings.*`, `hpThresholds.*`, `gameRules.*`, `turnTimesPerMode`. Esta e a estrutura preferida para novo codigo.
- **Nomenclatura legacy preservada:** `C`, `F`, `S`, `SHADOW`, `STROKE`, `SCREEN`, `BOARD`, `UI`, `UNIT_VISUAL`, `COLORS`, `TIMINGS`, `HP_THRESHOLDS`, `GAME_RULES`, `TURN_TIMES_PER_MODE`. Re-apontadas para os valores novos. ~21 arquivos que ja importavam DesignTokens continuam funcionando sem alteracao.

**Consequencias:**
- **Nenhuma regressao visual** nas telas que ja usavam DesignTokens — todas as cores legacy (C.blue, C.red, C.king, etc.) agora apontam para os valores corretos de constants.ts. Isso PODE mudar sutilmente a aparencia de telas que usavam C.blue/C.red como acento (antes era turquesa/roxo, agora e azul/vermelho). Decisao deliberada de trocar o antigo "turquesa/roxo draft" pelos valores de constants com base em legibilidade competitiva.
- 2 arquivos (systems/BotSystem.ts, systems/MovementSystem.ts) migrados de `../data/constants` para `../utils/DesignTokens`.
- `src/data/constants.ts` deletado.

**Validacao:**
- `grep -r "data/constants" src/` retorna apenas referencia em comentarios dentro de DesignTokens.ts (documentacao da migracao).
- `npm run build` passa.
- Type-check limpo.

**Status:** Concluido.

---

## 2026-04-18 — Inicio da fase de auditoria AAA

**Contexto:** Projeto Draft em fase de finalizacao do frontend/UI antes de avancar para proximas etapas. Ambicao: qualidade AAA.

**Decisao:** Realizar diagnostico completo antes de qualquer alteracao. Auditar estrutura, codigo, UI, e gap para padrao AAA.

**Status:** Em andamento.

---

## 2026-04-20 — Adocao do SKILLS_CATALOG_v3_FINAL.md como contrato de combate

**Contexto:** Recebido documento v3 do "chat chefe" definindo o balanceamento e regras finais de combate. Este doc agora e a fonte de verdade (docs/SKILLS_CATALOG_v3_FINAL.md). Mudancas futuras entram aqui.

**Aplicado nesta passagem:**

1. **Stats base** (unitStats.ts):
   - Rei: HP 180, ATK 16, DEF 14, MOB 4 (MOB 99 → 4, removido teleport livre).
   - Guerreiro: HP 200, ATK 18, DEF 20, MOB 2.
   - Executor: HP 120, ATK 24, DEF 8, MOB 3.
   - Especialista: HP 130, ATK 20, DEF 10, MOB 2.

2. **Passivas** (passiveCatalog.ts):
   - Rei: -15% → -20% dano recebido (aplica a true damage).
   - Executor: +15% dano → +20% dano / +10% dano recebido (trade-off). Nota: a parte de +10% dano recebido ainda precisa ser implementada no engine (atualmente so aplica +20% quando isolado).
   - Especialista: -20%/1t → -30%/2t.
   - Guerreiro: inalterada.

3. **Regras globais novas** (globalRules.ts):
   - `EXECUTE_HP_THRESHOLD = 0.30`, `EXECUTE_DAMAGE_MULT = 1.25` — aplicado em computeRawDamage.
   - `OVERTIME_START_TURN = 12`, `OVERTIME_DAMAGE_BONUS_PER_TURN = 0.10` — aplicado em computeRawDamage.
   - `HEAL_CAP_PER_TURN = 2` — aplicado em Character.heal().
   - `SHIELD_CAP_PER_UNIT = 100` — constante existe; sobrescrita automatica do shield ja ocorre via addEffect.
   - `KING_HEAL_IMMUNE = true` — aplicado em Character.heal() com bypass para self-skills.
   - `MIN_DAMAGE_FLOOR_RATIO = 0.10` — aplicado em computeRawDamage.

4. **Nova formula de dano** (CombatEngine.computeRawDamage):
   - v3: `dano = base × (100/(100+DEF)) × modificadores × execute × overtime`
   - ATK nao escala dano diretamente — so via buffs (atk_up/down).
   - Floor de 10% do base.

5. **Skill catalog reescrito** (skillCatalog.ts):
   - Todos os powers, durations e descriptions atualizados para v3.
   - Novos effect types adicionados: `silence_attack`, `mov_up`, `pull`, `teleport`, `summon_wall`, `invisibility`, `clone`, `damage_redirect`.

6. **Tempos de turno por modo** (constants.ts):
   - `TURN_TIMES_PER_MODE`: 1v1 20s/char, 2v2 20s/char, 4v4 25s/char.

7. **Sistema de skill level 1-5** (progression.ts):
   - `skillLevelMultiplier`, `skillLevelDurationBonus`, tabelas de upgrade copies/gold.
   - Funcoes disponiveis, mas ainda nao integradas no CombatEngine (nao consome nivel de skill hoje).

8. **Level scaling v3** (progression.ts):
   - `hpMultiplierV3`, `atkDefMultiplierV3`. Disponiveis, mas nao aplicados ao construir Character ainda.
   - `RANKED_NORMALIZED_LEVEL = 50` constante disponivel.

**STUBS / PENDENTES (documentados para proxima passagem):**

- **Mecanicas exoticas sem implementacao plena** (catalogadas como effectType novos com comportamento pendente):
  - `summon_wall` — Muralha Viva, Prisao de Muralha Morta (criar entidades com HP no grid).
  - `clone` — Sombra Real (spawnar decoys).
  - `invisibility` — Fuga Sombria (untargetable por single-target).
  - `damage_redirect` — Guardiao (redirecionar dano aliado → caster com reducao).
  - `teleport` — mecanica basica (relocar caster); versao avancada (Intimidacao teleporta alvo + adjacentes) pendente.

- **Condicionais de dano** (v3 especifica):
  - Corte Mortal: +50% se alvo tem bleed.
  - Disparo Preciso: ignora shield se alvo tem bleed.
  - Tempestade de Laminas: +50% se alvos tem bleed.
  - Hoje aplicam dano base. Implementacao condicional pendente.

- **Efeitos especiais pendentes:**
  - Explosao Central: mark nao-removivel + 50% extra se alvo com debuff.
  - Nevoa: buff aliados + debuff inimigos na arena inteira.
  - Ordem Real: -15% dano por aliado adjacente (ate -45%) no rei.
  - Espirito de Sobrevivencia: condicional em HP (≤50% ou >50%).
  - Recuperacao Real: cancelavel se rei tomar dano (pendente).
  - Armadilha Oculta: sistema de tile-trap.

- **DoT ordering (§2.3)**: ordem "dano direto → DoTs → shields → cura → regen" nao esta implementada explicitamente. O engine atual aplica damage e DoT em pontos diferentes (tick no fim do round). Requer refator da pipeline de resolve.

- **Silence attack**: effect type adicionado e counter no Character pronto, mas nao integrado em ActionEngine (nao bloqueia selecao de attack skill ainda).

- **Confirmar jogada + auto-pilot 3 timeouts**: nao implementados. Requer layer de turn manager nas scenes e bot fallback.

- **Normalizacao de ranked**: constantes prontas, mas nao aplicadas ao construir Character em modo ranked.

**Status:** Nucleo numerico v3 aplicado. Type-check limpo. Mecanicas exoticas catalogadas como pendentes. Jogo compila e pode rodar com novos numeros, mas mecanicas exoticas das skills cairao em comportamento default do effectType generico.

---

## 2026-04-20 — Unificacao de skills com mesmo nome

**Contexto:** Auditoria do skillCatalog revelou skills com nome identico mas mecanicas/valores diferentes entre classes. Isso gera inconsistencia de design (mesmo nome = jogador espera mesmo efeito).

**Skills afetadas:**
- `Esquiva` (ls_d6, le_d6, lk_d7) — ja eram identicas, so padronizado.
- `Bloqueio Total` (ls_d7, le_d7) — ls_d7 tinha power 80, le_d7 tinha 75. Unificado em 75.
- `Fortaleza Inabalavel` (lw_d4, lk_d6) — lw_d4 tinha self-stun (custo), lk_d6 nao tinha. Unificado com self-stun para preservar a identidade mecanica (senao ficaria funcionalmente igual a Bloqueio Total).

**Regra estabelecida:** Cartas com o mesmo nome DEVEM ter o mesmo efeito, power e descricao. Se duas cartas precisam ser mecanicamente diferentes, devem ter nomes diferentes.

**Aplicacao:** Toda nova skill adicionada ao catalogo deve respeitar essa regra. Colisoes de nome serao consideradas bugs.

**Total de skills unicas no jogo:** 61 (antes: 64 nominalmente, com 3 duplicatas).

**Status:** Concluido. Type-check passa.

---
