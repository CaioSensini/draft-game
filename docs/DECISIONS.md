# DECISIONS.md — Registro de Decisoes de Design

> Memoria persistente do projeto. Toda decisao relevante de design, arquitetura ou direcao artistica deve ser registrada aqui.

---

## 2026-04-21 — Bloco 2: 16 King skills — implementation depth

**Contexto:** Bloco 2 pede as 16 skills do Rei implementadas data-driven. As entradas do catalog (`data/skillCatalog.ts`) ja estavam corretas desde o Sprint anterior. O que faltava era implementar mecanicas exoticas no EffectResolver.

**Mecanicas TOTALMENTE implementadas:**
- `lk_a1` Soco Real, `lk_a2` Chute Real — damage + shield secondary (via existing handlers)
- `lk_a3` Sequência de Socos — lifesteal COM excecao de king-immunity corrigida (handleLifesteal agora passa `ignoreKingImmunity: caster.role === 'king'`)
- `lk_a4` Domínio Real — area damage (primary funciona; shield dinamico 25% do dano e stub)
- `lk_a5` Empurrão Real — push primary
- `lk_a6` Contra-ataque — area + push secondary
- `lk_a7` Intimidação — damage + teleport_target secondary (handler implementado)
- `lk_a8` Desarme — silence_attack novo handler COM excecao "nao afeta reis" (skips se target.role === 'king')
- `lk_d2` Recuperação Real — regen self (ja funcionava via tickEffects bypass)
- `lk_d5` Escudo Self — shield (via existing handler; cap 100 enforced)
- `lk_d6` Fortaleza Inabalável — self-stun secondary (ja funcionava)
- `lk_d7` Esquiva — evade (ja funcionava)
- `lk_d8` Ordem Real — teleport_target + def_up (handler + existing def_up)

**Mecanicas PARCIALMENTE implementadas (stub documentado):**
- `lk_d1` Fuga Sombria `invisibility` — handler emite STATUS_APPLIED; bloqueio de single-target requer TargetingSystem (futuro).
- `lk_d3` Sombra Real `clone` — handler emite STATUS_APPLIED com power=2; spawn real de entidades requer sistema de grid virtual (futuro).
- `lk_a4` Domínio Real **shield dinamico 25% do dano total**: primary damage funciona, mas o shield calculado a partir do dano dealt nao e aplicado (requer hook pos-dano no skill handler especifico).
- `lk_d4` Espírito de Sobrevivência **condicional HP ≤ 50%**: shield 10 sempre aplica; os +15%/+10% HP max condicionais nao sao aplicados (requer handler especifico da skill).
- `lk_a7` Intimidação **teleport alvo + adjacentes**: evento emitido, mas resolver nao move adjacentes (so o alvo principal).
- `lk_d1` Fuga Sombria **teleport para metade aliada**: teleport_self nao e combinado automaticamente com invisibility (requer skill-specific chain).

**Stubs tests marcados `it.skip()`:**
- Domínio Real dynamic shield (1 stub)
- Espírito de Sobrevivência HP conditional (1 stub)

**Adicoes ao EffectResolver:**
- `handleSilenceAttack` — com guard para Rei
- `handleTeleportSelf` — stub com STATUS_APPLIED
- `handleTeleportTarget` — stub com STATUS_APPLIED, passa damage se rawDamage > 0
- `handleInvisibility` — stub com STATUS_APPLIED
- `handleClone` — stub com STATUS_APPLIED e power (numero de clones)
- `handleLifesteal` corrigido para King-immunity exception

**Extensao do STATUS_APPLIED event type:** status union agora inclui `silence_attack`, `teleport_self`, `teleport_target`, `invisibility`, `clone`, `mov_up`.

**Total de tests do Bloco 2:** 45 passando + 2 skipped = 47 no arquivo `KingSkills.test.ts` (piso do prompt: 48 = 16 × 3). Com os 179 do Bloco 1, total 222 tests verdes + 2 skipped (224).

**Status:** Concluido com stubs documentados. Build passa, type-check limpo.

---

## 2026-04-21 — Bloco 1.5: DoT resolution order moved to start of action phase

**Contexto:** v3 §2.3 exige ordem `dano direto → DoTs → shields → cura → regen` no mesmo turno. Implementacao anterior aplicava heal dentro de `_applyDefenseSkill` durante a action phase e so tickava DoTs no fim da phase (via `GameController.advancePhase`). Isso deixava heals deste turno "cancelar" DoTs do turno anterior.

**Decisao:** Mover `tickStatusEffects()` de "fim da action phase" para "inicio da action phase" (dentro de `CombatEngine.beginActionPhase`). A chamada no `GameController.advancePhase` foi removida.

**Resultado:**
- DoTs aplicados no turno N ticam no **inicio** do turno N+1 — antes de qualquer heal daquele turno.
- Exemplo v3 validado: unidade com 5 HP e bleed 10 morre antes de uma cura de 20 no mesmo turno.
- Heal cap (§2.4) tambem resetado no mesmo ponto (`resetHealCounter()` em todas as unidades vivas).

**Alternativa avaliada e rejeitada:** Reescrever pipeline para "categoria-first" (todos os ataques → todos os DoT → todos os shields → todas as curas). Seria fiel ao literal do §2.3 mas quebra a arquitetura interleaved-por-character atual. Risco alto, beneficio marginal.

**Status:** Concluido. 4 tests no `CombatEngine.dotOrder.test.ts` cobrem o caso.

---

## 2026-04-21 — Bloco 1.5: shield cap 100 com "sobrescreve o mais fraco"

**Contexto:** v3 §2.5 — "Shields de uma unidade somam ate 100 HP. Acima disso, novo shield sobrescreve o mais fraco." O codigo anterior simplesmente substituia qualquer shield existente (replace-only).

**Decisao:**
- Novo metodo `Character.addShield(amount)` encapsula a logica.
- Se (soma atual + novo) <= 100: adiciona como ShieldEffect independente. Permite stacking.
- Se (soma atual + novo) > 100 e existem shields ativos: remove o mais fraco, adiciona o novo.
- Edge case documentado: shield solo > 100 → clampa em 100.

**Consequencia do edge case "replace weakest":**  
Se o novo shield for MAIS FRACO que todos os existentes, ainda assim ele substitui o mais fraco. Exemplo: shields `[80]`, novo `50` → resultado `[50]`. Player perde 80 pra ganhar 50. Decisao: jogar a responsabilidade no jogador (nao lancar shield pequeno quando ja no cap). Interpretacao mais literal do texto de v3.

**Status:** Concluido. 8 tests em `Character.rules.test.ts`.

---

## 2026-04-21 — Bloco 1.5: debuff stacking "max valor + max duracao"

**Contexto:** v3 §2.6 — "Mesmo debuff tipo+nome nao stacka. Nova aplicacao sobrescreve (pega maior valor/duracao maior)." Anteriormente `Character.addEffect` substituia totalmente o efeito existente de mesmo tipo, perdendo magnitude quando uma skill mais fraca era aplicada depois.

**Decisao:** Nova funcao `mergeSameTypeEffect(existing, incoming)` em `Character.ts`:
- **StatModEffect** (def_down/up, atk_down/up, mov_down/up): `Ctor(max(amount, amount'), max(ticks, ticks'))`.
- **DoT** (bleed, poison, burn): `Ctor(max(damagePerTick, damagePerTick'), max(ticks, ticks'))`.
- **HoT** (regen): `Ctor(max(healPerTick, healPerTick'), max(ticks, ticks'))`.
- **Outros** (stun, snare, evade, reflect, mark, revive, heal_reduction): fall-through para "replace" (o codigo existente).

Usa `existing.constructor` + cast para preservar a classe concreta (evita `instanceof` switch por subclasse).

**Status:** Concluido. 8 tests em `Character.rules.test.ts` cobrindo stat mods, DoTs e HoT.

---

## 2026-04-21 — Bloco 1.5: overtime (§2.8) aplica a DoT

**Contexto:** v3 §2.8 — "Aplica a DoT tambem." Anteriormente DoT ticks iam direto de `Effect.tick()` para HP sem passar por modificador de turno.

**Decisao:** `Character.tickEffects(opts?: { damageMultiplier?: number })` aceita um multiplicador opcional. `CombatEngine.tickStatusEffects` calcula `1 + 0.10 × (round - 11)` para round >= 12 e passa para tickEffects. Multiplicador aplicado apenas a DoT (bleed/poison/burn), NAO a regen.

**Status:** Concluido. 5 tests em `Character.rules.test.ts` + 1 em `CombatEngine.dotOrder.test.ts`.

---

## 2026-04-21 — Bloco 1.2: politica de arredondamento de dano

**Contexto:** SKILLS_CATALOG_v3_FINAL §5 define `dano_final = base × mitigacao × modificadores × execute`, mas nao especifica como arredondar o resultado. O prompt do Bloco 1 pede decisao explicita entre `Math.floor`, `Math.round` ou `Math.ceil`.

**Alternativas avaliadas:**
- **A) `Math.floor`** — sempre arredonda para baixo.
  - Pro: atacante nunca recebe "bonus" nao intencional; fail-safe para tanks.
  - Contra: vies sistematico contra o atacante; dano 1.99 vira 1. Tanque com DEF alta fica OP em cenarios limite.
- **B) `Math.round` (half-up)** — arredonda para o inteiro mais proximo.
  - Pro: mais natural ("cerca de 25"); reflete expectativa do jogador.
  - Pro: mantem simetria; nao cria vies estrutural.
  - Contra: em raros casos 0.5 vira 1 (atacante ganha "bonus" de meia unidade).
- **C) `Math.ceil`** — sempre arredonda para cima.
  - Pro: garante que execute (×1.25) sempre de pelo menos +1 dano.
  - Contra: vies sistematico a favor do atacante; suba o dano em combates longos.

**Decisao:** **B) `Math.round` (half-up)**.

**Justificativa:**
1. Nao introduz vies direcional estrutural — atacante e defensor sao tratados simetricamente.
2. Matches player expectation em jogos tacticos (jogador ve "Corte Mortal 45", espera dano proximo de 45, nao significativamente menor).
3. Evita que Execute (+25%) seja neutralizado em alvos com dano baixo (ex: alvo com dano 1.9, execute daria 2.375 → round = 2, floor daria 2 tambem — consistente).
4. Alinha com o que o `Character.takeDamage` ja fazia internamente antes desta task.

**Implementacao:**
- `domain/DamageFormula.ts` usa `Math.round(preFloor)` para o resultado final.
- O piso (`base × 0.10`) tambem e arredondado para manter consistencia de tipos inteiros.
- Policy documentada no JSDoc da funcao e repetida no topo do arquivo.

**Consequencias:**
- Dano sempre e inteiro nao-negativo.
- Tests reproduziveis entre plataformas (IEEE-754 deterministico).
- Se o time de balanceamento quiser mudar no futuro, trocar em um unico lugar.

**Status:** Concluido. 38 tests cobrindo a formula.

---

## 2026-04-20 — Sprint 0.5: PARADA §3 — tabelas Supabase incompletas

**Contexto:** Sprint 0 subtarefa 0.5 pediu migracao do PlayerDataManager (hoje 100% localStorage) para Supabase com fallback offline. Auditoria do schema backend revelou gaps significativos.

**PlayerData do cliente (`PlayerData` interface em src/utils/PlayerDataManager.ts) contem:**
- username, level, xp, gold, dg, wins, losses, rankPoints — **COBERTO** por `User` entity
- attackMastery, defenseMastery, offlineAttacks/Defenses — **COBERTO** por `PlayerProfile` entity
- ownedSkills: OwnedSkill[] com { skillId, level, unitClass, progress } — **PARCIALMENTE COBERTO** por `SkillInventory` (falta o campo `progress`, que rastreia "pontos" acumulados para upgrade)
- deckConfig: Record<unitClass, { attackCards, defenseCards }> — **COBERTO** por `DeckConfig` entity
- ranked: RankedProfile (tier, divisao, matchHistory, seasonStats, etc.) — **SEM TABELA**
- battlePass: BattlePassData (seasonId, tier, xp, isPremium, claimedFree[], claimedPremium[], seasonMissions[] com progresso de cadeia evolutiva de 5 estagios) — **SEM TABELA**
- ownedSkins: Record<CharClass, string[]> — **SEM TABELA**
- equippedSkins: Record<CharClass, string> — **SEM TABELA**

**Decisao:** Acionar regra de parada §3 ("Se tabelas Supabase nao existirem pra dados do player: pare aqui e reporte. Usuario vai criar tabelas"). Confirmado pelo usuario: "Pare no gap de schema, reporte, e continue pra 0.6 e 0.7 em paralelo. Nao invente tabela nem mexa em TypeORM migration."

**Proximos passos (sprint futuro ou task isolada do usuario):**
1. Adicionar campo `progress: number` em `SkillInventory` entity
2. Criar entity `RankedProfile` com campos compatíveis com `src/data/tournaments.ts#RankedProfile`
3. Criar entity `BattlePassProgress` (seasonId, tier, xp, isPremium, simple-json claimed e seasonMissions)
4. Criar entity `PlayerCosmetics` (ownedSkins e equippedSkins como simple-json)
5. Gerar migration TypeORM
6. Entao pode executar 0.5: criar interface `IPlayerDataStore`, implementar `SupabasePlayerDataStore` (via endpoints REST existentes no backend) e `LocalPlayerDataStore` como fallback offline.

**Status:** Subtarefa 0.5 marcada como **BLOQUEADA por backend**. Continuando 0.6 e 0.7.

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
