# DECISIONS.md — Registro de Decisoes de Design

> Memoria persistente do projeto. Toda decisao relevante de design, arquitetura ou direcao artistica deve ser registrada aqui.

---

## 2026-04-21 — ETAPA 3: 5 cenas finalizadas no design system (pre/pos-partida + upgrade + deck build)

**Contexto:** Etapas 1a/1b/2 deferiram 4 cenas pro pacote de shape vertical 120×160 + MatchmakingScene dedicada. Sessao unica fecha as 5 em ordem inversa de risco (3.3 → 3.5 → 3.4 → 3.2 → 3.1).

**Decisoes aplicadas (A-F do audit):**

- **A — Worktree:** repo principal `C:\Projetos\Draft` branch `turbo-targeting-v1`, mesmo padrao das etapas anteriores
- **B — UPAR button:** chip externo 86×20 flutuante 14px abaixo do card em SkillUpgradeScene. Card canonico 120×160 preserva integralmente o footer DMG/CD. Chip e container interativo com seu proprio handler (`stopPropagation`-aware)
- **C — Inventory grid:** 4 colunas × 120×160 com scroll vertical (meio-termo — 6 apertava footer, 3 desperdiçava espaco). Validado visualmente sem retrocesso
- **D — DeckBuild layout:** 4-col preservado (1 col por grupo, cards inline 308×124 → 2×2 grid de 120×160). Spec §S3 e greenfield; o layout atual e produto real com UX clara
- **E — Matchmaking:** cena dedicada criada (`MatchmakingScene.ts`, 293 LOC). `startSearch()` em PvP/Ranked lobbies migrado pra `transitionTo('MatchmakingScene', {mode, playerCount, returnTo, returnData})`. Backend queue intocado — a "real matchmaking" hoje e um placeholder textual, e o hook de match-found futuro fica naturalmente na cena dedicada em vez de espalhado entre 3 lobbies
- **F — XP progress bar:** adicionado painel 480×86 em BattleResultScene (spec §S4-style). Snapshot xp-before/level-before antes de `addBattleRewards` permite animar progressao real em 1.1s Quad.Out; halo gold pulsa quando ratio atinge 1.0 (level-up cue)

**Correcao de audit confirmada:** PackOpenAnimation nao tinha flip tween — a animacao existente era slide-up + fade-in. Migracao de shape foi compatival e a slide-up agora e proporcional ao card (`cardH * 0.6`). Adicionado halo accent.primary pulse atras de cada card pra compensar o "flip" inexistente.

**UI.skillDetailCard tokenizado:** helper 310×380 consumido 7× pela SkillUpgradeScene. Shape preservado; todos os hex hardcoded + Arial migrados. Stat rows rearquitetadas via `pushStatLine(label, value, labelColor, valueColor)` helper com Manrope meta labels + Mono stat-md values.

**Helpers compartilhados em SkillUpgradeScene:**
- `_deckPanelHeight()` — altura unica consumida por drawLeft + drawDeck + drawInventory
- `_deckGridGeometry()` — `gridStartX/Y` consumido por drawDeck, onDeckCardClick, showEquipHighlight (elimina 3 copias do mesmo calculo)
- `_buildUparChip(cx, cy, cost, canAfford, skillId)` — substitui `_addUparButton` inline

**Resultado numerico:**
- 5 commits atomicos (`etapa3-sub3.3/.5/.4/.2/.1`) + relatorio em `docs/ETAPA3_REPORT.md`
- ~+455 LOC liquidos (MatchmakingScene nova + upgrade XP bar + UPAR chip + skillDetailCard rewrite)
- 529 tests verdes em cada checkpoint, 0 regressao
- Tempo real ~11h vs estimativa 12h (1h de folga)
- Stop rules acionadas: 0

**Ordem inversa de risco validada:** SkillUpgrade (1234 LOC, drag-drop pixel-based, 7 sites de tooltip) ficou por ultimo. Nenhuma stop rule disparou, mas a politica de contencao se manteve — se tivesse disparado, as 4 outras cenas ja estariam commitadas.

**Status:** Shape vertical 120×160 em 100% dos callers. Jornada pre/pos-partida 100% no design system. Relatorio completo em `docs/ETAPA3_REPORT.md`.

---

## 2026-04-21 — Bloco Deck: contrato locked por testes; HAND_UPDATED rejeitado

**Contexto:** Sprint Dupla Parte 2 pediu "completar Deck domain + integrar CombatEngine + BattleScene". Audit inicial revelou que o trabalho principal **já estava feito**: `Deck.ts` (369 LOC) cumpre v3 §2.9 integralmente, `Team` auto-constrói decks, `CombatEngine.selectAttack/Defense` validam via `deck.inHand(id)`, `_rotateUsedCards` roda após skill resolver emitindo `CARD_ROTATED`, `GameController.getHand` expõe só a mão atual, e `BattleScene._rebuildCardButtons` renderiza apenas as 4 cartas da mão (não as 8 do deck). Fechado implicitamente durante o Sprint Alfa.

**Gap real:** zero tests cobrindo `Deck.ts` e zero cobrindo deck ↔ engine wiring.

**Decisão 1 (entregue):** Criar cobertura de testes. 43 tests em `Deck.test.ts` (domain puro) + 13 em `DeckIntegration.test.ts` (engine × deck × event). Total projeto: 473 → 529.

**Decisão 2 — `HAND_UPDATED` rejeitado:** prompt pediu novo event `HAND_UPDATED`. Análise: `CARD_ROTATED` (com payload `{unitId, cardId, category, nextCardId}`) já cobre o mesmo caso de uso. Consumers que precisam do snapshot completo da mão chamam `getHand(unitId)` após ouvir `CARD_ROTATED`. Adicionar `HAND_UPDATED` seria redundância — mesmos triggers, informação subconjunto. Padrão alinhado com outros events (ex: `DAMAGE_APPLIED` transporta delta, não HP total). Futuros consumers podem mudar de ideia; se `HAND_UPDATED` vier, adicionar emit side-by-side sem quebrar `CARD_ROTATED`.

**Decisão 3 — belt-and-suspenders listener:** BattleScene já rebuilda cartas em `CHARACTER_FOCUSED / cancelAction / pós-select-defense` (3 triggers cobrindo o fluxo normal). Adicionado 4º listener em `CARD_ROTATED` (só rebuilda se `e.unitId === this._currentActorId`). Cobre edge case onde rotação acontece sem mudar de actor (segunda carta em double-attack turn). Custo 11 linhas, risco zero.

**Decisão 4 — bench não visualizado:** spec do prompt menciona "cartas na fila podem aparecer em área 'próximas' com visual menor" como opcional. Hoje apenas a mão (2+2) é exibida. **Adiado pra Fase 2 de design polish** — mecânica está 100%, é feature de UX, não de gameplay.

**Status:** 3 commits (`deck: complete domain logic + rotation queue`, `deck: integrate with CombatEngine (hand validation + rotation on use)`, `deck: integrate with BattleScene UI`). Relatório em `docs/BLOCO_DECK_REPORT.md`. 529 tests verdes, 0 regressão.

---

## 2026-04-21 — Design System Fase 1: namespaces paralelos + aplicação piloto

**Contexto:** Sprint Dupla pede integrar o `design-system-handoff/` no projeto (tokens CSS, fontes Google Fonts, SVGs) sem quebrar nenhum dos ~21 arquivos que importam `DesignTokens.ts`. Auditoria revelou múltiplos conflitos entre CSS handoff e TS atual.

**Decisão core:** **namespaces paralelos**. Novos tokens (`surface.*`, `border.*`, `fg.*`, `accent.*`, `state.*`, `hpState.*`, `tile.*`, `fontFamily.*`, `typeScale.*`, `radii.*`, `motion.*`, `elevation.*`, `classGlow.*`, `currency.*`, `spacingScale.*`) convivem com os legacy (`C`, `F`, `S`, `SHADOW`, `colors.ui.*`, `colors.semantic.*`, `fonts`, `sizes.radius.*`, etc.). Zero valor legacy é alterado; callers antigos continuam funcionais. Novo código prefere tokens novos; migração é orgânica.

**Conflitos notáveis catalogados (valores do legacy NÃO mudam):**

1. **HP semântica invertida:** `colors.hp.medium=0xef4444` (legacy) é o `hp-critical` do CSS; `colors.hp.low=0xf59e0b` (legacy) é o `hp-wounded`. Resolvido com namespaces `hpState.{full,wounded,critical,shield}` alinhado ao CSS.
2. **Surfaces conflitam:** CSS navy `#0a0f1c..#334155` vs legacy deep-black `0x04070d, 0x12161f, 0x0e1420`. Consequência: componentes novos serão mais "navy/clear", legacy continua deep-black. **Dupla paleta aceitável como estado intermediário** até Fase 2 alinhar as cenas.
3. **State colors:** CSS `--success #10b981` ≠ legacy `semantic.success 0x4ade80`. Novo `state.*` usa valores CSS.
4. **Class colors em skillCard:** hardcoded table `CLASS_COLORS_HEX` usava valores divergentes (warrior azul, executor roxo). Substituído por `colors.class.*` locked (warrior violet, executor red, specialist green, king gold).
5. **Radii numericamente diferentes:** CSS sm/md/lg = 4/6/8; legacy = 5/8/12. Novo `radii.*` paralelo.
6. **Fonts:** legacy Arial; novo stack Cinzel/Cormorant Garamond/Manrope/JetBrains Mono via Google Fonts.

**Font readiness strategy:** `BootScene.create()` inicia `document.fonts.ready` como promessa privada; `onComplete` da transição aguarda antes de `scene.start(...)`. Helper `warmUpDesignSystemFonts()` instancia 1 Text off-screen por família para forçar o cache do Phaser antes do primeiro render real. **Sem dependência nova** (API nativa, dispensa WebFontLoader).

**Skill Card shape 120×160:** spec CSS pede vertical; shape atual 210×105 (ou 300×150 em battle) é usado em DeckBuildScene, SkillUpgradeScene, PackOpenAnimation, BattleScene. **Mudança de shape fica Fase 2** — Fase 1 aplica só tokens de cor e fonte. Scope creep se mudar shape agora.

**4 componentes aplicados na Fase 1:**
- `UI.buttonPrimary/Secondary/Ghost/Destructive` — novos, paralelos ao `UI.button` legacy. INTEGRATION_SPEC §1 com 5 estados.
- `UI.tooltip` — novo helper §7. Tooltip inline enriquecido do skillCard NÃO migrado.
- `UI.skillCard` — tokens only, sem mudar shape.
- HP Bar em BattleScene — 4 sites migrados via `hpStatusColor(ratio)`.

**Cenas secundárias (Lobby, Shop, BattlePass, Settings, Ranked, Ranking, Tournament, Bracket) ficam Fase 2.**

**Status:** 4 commits atômicos (`design-p1: import assets + integrate CSS tokens`, `design-p1: load Google Fonts + configure WebFont loader`, `design-p1: apply design system to Button + HP Bar + Skill Card + Tooltip`, `design-p1: phase 1 report + DECISIONS update`). 473 tests verdes, zero regressão. Relatório em `docs/DESIGN_PHASE1_REPORT.md`.

---

## 2026-04-21 — Bloco 5: Specialist — 3 Character-level flags para skill-specifics

**Contexto:** v3 §6.2 define 3 mecânicas defensivas do Specialist que exigem state persistente no Character (não encodável via Effect único):
- Renascimento Parcial: "1x por aliado por partida"
- Proteção: "imunidade a novos debuffs por 1 turno"
- Campo de Cura Contínuo: "cancelado se aliado tomar dano"

**Decisão:** Adicionar 3 flags/counters privados em `Character`:
- `_reviveConsumedThisBattle: boolean` — lifetime da instância; set no primeiro revive dispatched.
- `_debuffImmuneTicks: number` — counter decrementado por round; addEffect() rejeita kind='debuff' quando > 0.
- `RegenEffect.cancellable: boolean` (construtor arg) — flag na effect, não no Character; takeDamage strip quando hpDamage > 0.

**Alternativas rejeitadas:**
- A) Adicionar Effect subclasses para cada caso — polui hierarquia, cada subclass vira um case em mergeSameTypeEffect.
- B) Event hooks em Character (onTakeDamage, onEffectExpire, etc.) — maior refactor, não justificável pra 3 skills.

**Justificativa:** os 3 flags são comportamentos transversais (não estado de uma skill específica), então fazem sentido no Character. Precedente do Bloco 2 (`_healsThisTurn`, `_maxHpBonus`, `_silencedAttackTicks`) e Bloco 4 (`_adrenalinePenaltyHp`). A convenção de manter state em Character quando transversal agora está consolidada.

**Escopo:**
- 3 campos novos, 3 getters, 2 APIs (setDebuffImmunity, setAdrenalinePenalty já existia).
- `addEffect` guarda: debuff immunity + revive lock.
- `takeDamage` strip: cancellable regens.
- `tickEffects` decrementa _debuffImmuneTicks.
- Skill-specific intercepts em `_applyDefenseSkill` para ls_d2 (via addEffect guard), ls_d4 (cleanse+setDebuffImmunity), ls_d5 (cancellable regen).

**Consequências:**
- 12 Specialist skills completas vs 8 antes (+quick fix ls_a5 mov_down).
- Non-cancellable regens (Rei's Recuperação Real) preservados — backward compat.
- Outro sistema onboardable pelo padrão: qualquer nova skill "self-flag" cai nesse molde.

**Status:** Concluído. 54 tests em SpecialistSkills.test.ts. Total projeto: 404 passing, 0 skipped.

---

## 2026-04-21 — Bloco 4: Executor bleed-conditional mechanic — snapshot pré-hit

**Contexto:** v3 §6.4 define três skills do Executor com bônus condicional em alvos sangrando:
- Corte Mortal (le_a1): +50% dano se alvo tinha bleed
- Tempestade de Lâminas (le_a2): +50% dano per-target se tinha bleed
- Disparo Preciso (le_a3): ignora shield se alvo tinha bleed

**Problema:** le_a1 tem `cleanse` como secondary — cleanse remove debuffs do target, incluindo bleed. Se o bônus fosse computado depois do secondary, o cleanse sabotaria o +50%.

**Alternativas avaliadas:**
- **A) Snapshot pré-hit:** capturar bleed existence ANTES do resolver rodar; decisão de amplificação fica cristalizada nesse ponto.
- **B) Snapshot pós-primary, pré-secondary:** mais complexo, sujeito a ordem de efeitos.
- **C) Checar bleed em cada etapa:** inconsistente com intenção v3.

**Decisão:** **A — snapshot pré-hit.** Implementado em `CombatEngine._applyOffensiveSkill`:
```typescript
const targetHadBleed = _hadBleedEffect(target)   // ← snapshot FIRST
// ... compute rawDamage ...
// ... apply bonus based on targetHadBleed ...
// ... resolver runs (may include cleanse that removes bleed) ...
```

**Consequência:** le_a1 tira vantagem do bleed E então o remove, o que é exatamente a mecânica v3 ("remove debuffs do alvo" + "+50% se tinha bleed"). Cleanse funciona como efeito secundário legítimo, não contradiz o bônus.

**Disparo Preciso (le_a3) shield bypass:** requer saída pela rota de `Character.applyPureDamage` (que ignora shields) ao invés de `takeDamage` (que aplica shield interception). O handler emite eventos DAMAGE_APPLIED e CHARACTER_DIED manualmente pra manter compatibilidade com o fluxo normal de stats/victory check.

**Helper `_hadBleedEffect`:** checa só `type === 'bleed'` não expirado. Poison e burn NÃO contam — v3 é específico sobre "bleed".

**Status:** Concluído. 55 tests em ExecutorSkills.test.ts + 4 em PassiveSystem.test.ts (Isolado stack). Total projeto: 342 passing, 0 skipped.

---

## 2026-04-21 — Bloco 3 Parte 1: secondaryEffect → secondaryEffects[] (Opção B)

**Contexto:** Bloco 3 identificou que o schema `secondaryEffect: T | null` limita skills a um efeito follow-up. v3 tem pelo menos 4 Warrior skills com 3 efeitos (Impacto, Provocação, Investida + Colisão Titânica com conditional). Sem array, o 3º efeito não cabe.

**Decisão:** Migrar para `secondaryEffects: ReadonlyArray<SecondaryEffectDef>` como campo primário. Manter `secondaryEffect` como **getter deprecated** retornando `secondaryEffects[0] ?? null` para não quebrar callers que ainda não migraram. Catálogo 100% migrado (30 entries). Consumers do engine (CombatEngine 2 sites, SkillRegistry validação) migrados para iterar array.

**Escopo entregue (Opção B):**
- `domain/Skill.ts`: novo campo `secondaryEffects`, getter `secondaryEffect` deprecated, construtor normaliza ambas as formas (array ou single) do `SkillDefinition`
- `domain/SkillRegistry.ts`: valida ambos os shapes
- `engine/CombatEngine.ts`: 2 sites (defense path e attack path) agora iteram `secondaryEffects` com early-break se target morre mid-sequence
- `data/skillCatalog.ts`: 30 entries migradas; 3 Warrior skills PARTIAL agora com 2 secondaries (Impacto +mov_down, Provocação +def_down, Investida +mov_down)
- Tests: assertions migradas para `secondaryEffects?.[0]?.*`; 3 novos tests de integração validam que AMBOS secondaries aplicam via CombatEngine

**Escopo adiado (fora do Opção B, documentado como pendência):**
- **UI tooltip (UIComponents.ts):** continua renderizando apenas o 1º secondary. TODO comment aponta para esta entrada. Polish visual fica para a Fase 2 de integração do design system (sessão futura que vai redesenhar tooltip do zero de qualquer forma — não vale polir agora pra refazer depois).
- **SkillUpgradeScene / BattleScene forwarding:** 5 cópias defensivas continuam lendo `secondaryEffect` via getter legacy. Backward-compat funciona; migração completa pode ser feita quando esses arquivos forem tocados por outra razão.

**4 skills PARTIAL permanentes (razão ≠ schema):**
Estas 4 Warrior skills continuam com implementação parcial mas **não são resolvíveis por array** — precisam de Grid-aware handlers dedicados:
- **Colisão Titânica** (lw_a1): "se bloqueado → snare 1t" é lógica condicional em colisão de push
- **Investida Brutal** (lw_a4): per-line push rules (central vs perpendicular) depende de posição no grid
- **Escudo do Protetor** (lw_d1): "retângulo 6 sqm atrás: -50% dano" é damage reduction posicional
- **Resistência Absoluta** (lw_d3): "Guerreiro + aliado atrás: -65% dano" idem posicional
- **Postura Defensiva** (lw_d6): "-25% dano em 3x3" é DR em vez de shield flat

Ficam backlog para "Grid-aware handlers sprint" futuro.

**Resultado numérico:**
- Antes: 5 PARTIAL schema-gap + 4 PARTIAL Grid-gap = 9 totais
- Depois: 0 PARTIAL schema-gap + 4 PARTIAL Grid-gap = 4 totais
- 5 skills fecham completas (Impacto, Provocação, Investida — schema fix; + 2 que já estavam corretas na tabela de referência que eu contei errado)
- Build passa, 283 tests verdes, 0 regressão

**Status:** Concluído. Bloco 3 report atualizado.

---

## 2026-04-21 — Bloco 3: Warrior skills — 3 sistemas novos como stub

**Contexto:** Bloco 3 implementa as 16 skills do Guerreiro. Três skills dependem de sistemas que não existem hoje no engine. Ao invés de "fingir implementação" ou construir 3 sistemas grandes em um único bloco, registro como stubs explícitos.

**Stubs:**

1. **`summon_wall` (lw_a6 Muralha Viva, lw_a8 Prisão de Muralha Morta)** — requer sistema de "tile obstacle" no Grid: walls com HP próprio, bloqueio de movimento, DoT adjacente, quebra por atk1. Estimativa 6-8h de sprint dedicado. Stub hoje: emite STATUS_APPLIED(summon_wall), aplica damage/secondary nos alvos da área (valor parcial preservado).

2. **`damage_redirect` (lw_d2 Guardião)** — requer damage interceptor protocol. Quando aliado protegido recebe dano, 60% redireciona pro Warrior com -30%. Estimativa 3-4h. Stub hoje: emite STATUS_APPLIED(damage_redirect) no aliado; nenhum redirect math.

**Decisao:** Registrar os 3 como stubs documentados, seguir para Bloco 4. Sistemas novos merecem sprint dedicado futuro. Stubs emitem eventos para a UI pode animar e dispatch path e testavel.

**Extensao do STATUS_APPLIED event type:** union agora inclui `summon_wall` e `damage_redirect`.

**Gap secundario identificado:** O schema `secondaryEffect` do catalogo carrega apenas UM efeito. v3 tem 4 skills do Guerreiro com 3 efeitos (Impacto, Provocação, Investida, Colisão Titânica). O 3º efeito não fica no catalogo. Solução futura: `secondaryEffects: T[]` ou skill-specific handler. Não bloqueante hoje.

**Status:** Concluido com 3 stubs. 13/16 skills funcionais. 56 tests em WarriorSkills.test.ts. Total projeto: 283 passing, 0 skipped. Build limpo.

---

## 2026-04-21 — Bloco 2 quick-win: Espírito de Sobrevivência — HP bonus expiration clamps HP down

**Contexto:** Quick Win 2 (Espírito de Sobrevivência, `lk_d4`/`rk_d4`) aplica um +HP max temporário (15% ou 10% do maxHp base) por 1 turno. Na expiração, se o HP atual do Rei estiver acima do maxHp base (porque ele se curou aproveitando o bônus), o que fazer com o excesso?

**Alternativas avaliadas:**
- **A) Clamp para baixo:** HP atual é reduzido até o maxHp base na expiração. O jogador perde o HP "extra" que estava no intervalo do bônus.
- **B) Deixar como está:** HP atual fica acima do maxHp visível. Jogador mantém os HPs extras até serem gastos.
- **C) Drenar gradualmente:** HP vai caindo 1/turno até atingir o maxHp base.

**Decisao:** **A) Clamp para baixo.**

**Justificativa:**
1. Convenção RPG padrão — WoW, Path of Exile, Final Fantasy, todos clampam HP temporário ao expirar buff.
2. Previne "banking" de buff — jogador não pode empilhar Espírito + cura pra manter HP acima do max permanente depois.
3. Consistente com a expectativa do jogador: o bônus era temporário, o ganho não é permanente.
4. Simplicidade: uma linha de código vs. sistema de drenagem.

**Implementação (`Character.tickEffects`):**
```typescript
if (this._maxHpBonusTicks > 0) {
  this._maxHpBonusTicks--
  if (this._maxHpBonusTicks === 0 && this._maxHpBonus > 0) {
    this._maxHpBonus = 0
    if (this._hp > this.baseStats.maxHp) this._hp = this.baseStats.maxHp
  }
}
```

**Consequência de UX (documentado):** o jogador pode ver sua barra de HP "perder" alguns HPs na hora que Espírito expira. A UI deve destacar isso com um floating text "-X HP (buff expired)" para não parecer bug.

**Status:** Concluido. 4 tests em `KingSkills.test.ts` cobrindo ambos os ramos (≤50% e >50%) + dois cenários de expiração (sem excesso vs com excesso).

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

## 2026-04-20 — Sprint Alfa (Combat Engine 100%) — Debito residual aceitavel

Contexto: Sprint Alfa fechou os 5 sistemas medios restantes (Damage interceptor, Pre-movement, Arena-wide mixed-side, Tile-trap on-step, Wall de escudo). Com isso, as 64/64 skills do catalogo estao mecanicamente completas. Durante a execucao, dois pontos de integracao ficaram DOCUMENTADOS como debito do sistema de movimento (nao das skills), por decisao explicita do sprint:

### 1. Teleport consome proximo movimento — integracao MovementEngine pendente

- `Character._movementConsumedNextTurn` + `setMovementConsumedNextTurn` + `movementConsumedNextTurn` getter estao implementados.
- `le_d4` Teleport seta a flag na execucao via `preMovement.consumesNextMovement`.
- **O que falta:** MovementEngine (fase de movimento entre rounds) precisa consultar `movementConsumedNextTurn`, tratar como "turn pulado" e limpar a flag.
- **Por que aceitavel:** MovementEngine e codigo legado baseado em `BattleState` (nao em Character/Battle domain). A integracao completa exige refactor do GameEngine/Scene para passar a flag adiante. Esta fora de escopo do sprint de skills.
- **Como fechar:** sprint dedicado a integracao MovementEngine - Character. Chamar `char.movementConsumedNextTurn` no inicio da fase de movimento; se true, skip e reset.

### 2. Armadilha Oculta movimento voluntario — hook em MovementEngine pendente

- `_checkTrapTrigger` e chamado em `_executePush` (push) e `_applyPreMovement` (pre-skill movement). Ambos os caminhos disparam a trap corretamente.
- **O que falta:** movimento voluntario na fase de movimento (player/bot escolhe caminho) nao passa por CombatEngine, logo nao aciona `_checkTrapTrigger`.
- **Por que aceitavel:** a skill esta mecanicamente completa — a trap existe, expira, e triggera nos caminhos onde CombatEngine controla a posicao. O gap e do **sistema de movimento**, nao da skill.
- **Como fechar:** quando o MovementEngine for refatorado, adicionar callback onCharacterMoved(char, newCol, newRow) que chame a mesma logica de trap-trigger (extraida para um servico compartilhavel, se necessario).

### Resumo

Ambos itens compartilham o mesmo caminho de remediacao: **sprint dedicado a modernizar MovementEngine para falar com Character/Battle domain** (em vez do BattleState legado). Esse sprint fecharia os 2 itens simultaneamente e tambem desbloquearia hooks similares futuros (e.g. on-enter tile para Escudo do Protetor wall, zona de Nevoa com proximity effects, etc).

**Status:** Skills 64/64 completas. Sistemas de movimento pendentes como debito isolado.

---
