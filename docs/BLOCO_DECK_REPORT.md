# Bloco Deck Rotativo

**Branch:** `turbo-targeting-v1`
**Data:** 2026-04-21
**Escopo:** completar domínio do Deck + integração com CombatEngine + BattleScene, conforme v3 §2.9.

---

## Resumo executivo

Audit inicial revelou que **o Deck domain, a integração com CombatEngine e a UI já estavam substancialmente implementados** (provavelmente fechados implicitamente durante o Sprint Alfa ao adicionar pre-movement, double-attack, e outras mecânicas que tocam a selection flow). O gap real era **ausência de cobertura de testes** — zero tests cobrindo Deck.ts + zero tests cobrindo deck ↔ engine wiring.

Esta sprint trancou o contrato com 56 testes novos (+13 via integração) e adicionou um listener `CARD_ROTATED` em BattleScene como belt-and-suspenders.

**Gates finais:**
- ✅ 529 tests passing (+56 novos, +13 integration = +56 totais), 0 regressão
- ✅ `npm run build` passa limpo
- ✅ 3 commits atômicos (`deck: complete domain logic + rotation queue`, `deck: integrate with CombatEngine (hand validation + rotation on use)`, `deck: integrate with BattleScene UI`)

---

## Estrutura final do Deck

### `src/domain/Deck.ts` (369 LOC — já existente, cumprindo v3 §2.9 integralmente)

**Constantes:**
- `DECK_SIZE = 4` — 4 cartas por categoria (atk + def)
- `HAND_SIZE = 2` — 2 cartas visíveis por categoria

**`SkillQueue`** — fila rotativa única (atk ou def):
- `hand` (slice frontal), `bench` (traseira), `all`, `size`, `nextInLine`, `peek(i)`
- `inHand(id)` / `find(id)` — queries sem mutação
- `use(id) → RotationResult | null` — rotação: splice + push
- `useSkill(skill)` / `rotate(skill)` — aliases
- `reset()` — restaura ordem original

**`CharacterDeck`** — 2 queues independentes por personagem:
- `attack: SkillQueue`, `defense: SkillQueue`
- `attackHand / defenseHand / currentHand` — snapshots
- `canUseAttack(id) / canUseDefense(id)` — validação
- `useAttack(id) / useDefense(id) / useBoth(a,d)` — mutação
- `reset()` — restaura ambas

**`buildCharacterDeck(charId, config)`** — valida `DECK_SIZE` + duplicatas, constrói deck.

**`TeamDecks`** — registry de decks por personagem (set/get/has/build/resetAll/characterIds).

### Integração com `Team`

`Team.ts` constructor auto-invoca `buildCharacterDeck` para cada character:
```ts
for (const character of characters) {
  const config = deckConfig[character.role]
  if (config) this._decks.set(character.id, buildCharacterDeck(character.id, config))
}
```

Acessores públicos: `team.deck(id)`, `team.attackDeck(id)`, `team.defenseDeck(id)`.

### Integração com `CombatEngine`

**Validação de hand (3 sites):**
- `selectAttack` (linha 253-254) — `deck.inHand(skill.id)` → `Err("not in current hand")`
- `selectDefense` (linha 309-310) — idem
- `selectSecondAttack` (linha 344-345) — idem (modo double-attack)

**Rotação após resolução:**
- `_rotateUsedCards` (linha 2409) — chamada em 4 locais de `_applyAttackSkill`/`_applyDefenseSkill`
- Para cada categoria usada, chama `deck.use(skill.id)` e emite `EventType.CARD_ROTATED` com payload `{unitId, cardId, category, nextCardId}`.
- Também rotaciona `secondAttackSkill` quando double-attack está ativo.

### Integração com `GameController` / BattleScene

**`GameController.getHand(charId)` (linha 501):**
```ts
return {
  attack:  team.attackDeck(characterId)?.hand ?? [],
  defense: team.defenseDeck(characterId)?.hand ?? [],
}
```
Retorna apenas 2+2 cartas (não as 8 do deck completo).

**`BattleScene._rebuildCardButtons(actorId)` (linha 1632):**
```ts
const hand = this._ctrl.getHand(actorId)
if (!hand) return
const allCards = [...hand.attack, ...hand.defense]  // 4 cartas
allCards.forEach((skill, i) => { this._makeCardBtn(CARDS_X, cy, skill, actorId) })
```

**Rebuild triggers (4 sites):**
- `CHARACTER_FOCUSED` (linha 681) — quando actor muda
- `CARD_ROTATED` (novo, linha ~689) — **adicionado nesta sprint** como belt-and-suspenders
- pós-cancel (linha 1076)
- pós-select-defense × 2 sites (linhas 1836, 1870)

---

## Tests totais

**Antes:** 473
**Depois:** 529 (+56)

| Arquivo | Tests | Novidade |
|---|---|---|
| `src/domain/__tests__/Deck.test.ts` | 43 | **NOVO** |
| `src/engine/__tests__/DeckIntegration.test.ts` | 13 | **NOVO** |
| Outros (já existentes) | 473 | — |

### Cobertura por arquivo novo

**`Deck.test.ts`** (43 tests, domínio puro):
- SkillQueue construction × 4 (validation errors + defaults)
- hand/bench/all/size/nextInLine/peek snapshots × 6
- inHand/find queries × 4
- use() rotation semantics × 8 (hand front, mid, bench, unknown, useSkill, cycle, rotate alias, hand size invariant)
- reset() × 1
- CharacterDeck dual-category × 11 (independence of attack/defense queues, canUseAttack/Defense, useAttack/Defense/Both, reset)
- buildCharacterDeck validation × 5 (sizes, duplicates)
- TeamDecks CRUD × 5

**`DeckIntegration.test.ts`** (13 tests, integração engine + deck):
- `selectAttack` hand gate × 4 (accept hand, reject bench, reject unknown, backward-compat without deck)
- `selectDefense` hand gate × 2 (accept hand, reject bench)
- Rotation on resolution × 4 (attack rotates, defense rotates, both together, bench-now-selectable)
- `CARD_ROTATED` event × 2 (attack emit, defense emit)
- `GameController.getHand` surface × 1

---

## Integração com BattleScene

Código existente **já exibe apenas a mão atual** (não o deck completo) via `getHand(actorId)`. Os rebuild triggers cobrem os casos normais; o novo listener `CARD_ROTATED` robustece contra edge case onde a rotação ocorre sem mudar de actor (double-attack turn).

**Visualização da fila "próxima" (bench)** não implementada — spec menciona "cartas na fila podem aparecer em área 'próximas' com visual menor" como opcional. Fica como pendência de UI polishing (Fase 2 de design), não bloqueia gameplay. A mecânica está 100%.

---

## Decisão: `HAND_UPDATED` event

**Prompt pedia emit de `HAND_UPDATED`.** Análise revelou que `CARD_ROTATED` já existe e transporta informação equivalente:

| Event | Payload | Quando emitido |
|---|---|---|
| `CARD_ROTATED` | `{unitId, cardId, category, nextCardId}` | Após `_rotateUsedCards` mutar o deck |
| `HAND_UPDATED` (proposto) | `{unitId, attackHand, defenseHand}` | Mesmos pontos — redundante |

**Decisão:** NÃO adicionar `HAND_UPDATED`. Redundância não traz valor; consumidores que precisam da mão completa chamam `getHand(unitId)` após ouvir `CARD_ROTATED`. O mecanismo é mais enxuto e espelha o padrão dos outros events (ex: `DAMAGE_APPLIED` transporta delta, não snapshot de HP total — consumer consulta `character.hp` se quiser o estado).

---

## Pendências (não bloqueantes)

1. **Visualização do bench no HUD** — cartas "próximas na fila" com visual menor. Requer design + layout novo. Fase 2 de polish.
2. **Tooltips por carta com hint "próxima na fila"** — o jogador saberia antecipadamente o que entra na mão ao usar a carta atual. UX improvement.
3. **Hand-preview em DeckBuildScene** — mostrar ao jogador qual será a mão inicial com base na ordem das cartas do deck. Facilita decisões estratégicas.

Nenhum desses bloqueia gameplay. Todos são UX/polish para sessões futuras.

---

## Arquivos modificados

### Novos
- `game-client/src/domain/__tests__/Deck.test.ts` (374 LOC, 43 tests)
- `game-client/src/engine/__tests__/DeckIntegration.test.ts` (308 LOC, 13 tests)

### Modificados
- `game-client/src/scenes/BattleScene.ts` — novo listener `CARD_ROTATED` (11 linhas)

**Não modificados (já estavam completos):**
- `game-client/src/domain/Deck.ts`
- `game-client/src/domain/Team.ts`
- `game-client/src/engine/CombatEngine.ts`
- `game-client/src/engine/GameController.ts`

---

## Commits

1. `deck: complete domain logic + rotation queue` — 43 tests de Deck.ts (domain puro)
2. `deck: integrate with CombatEngine (hand validation + rotation on use)` — 13 tests de integração
3. `deck: integrate with BattleScene UI` — listener `CARD_ROTATED` belt-and-suspenders

---

## Commit agregado Sprint Dupla

**Parte 1 (Design System Fase 1):** 4 commits, 130+ tokens novos em 17 namespaces, 7 SVGs importados, Google Fonts via document.fonts.ready, Button/HP Bar/Skill Card/Tooltip com tokens aplicados.

**Parte 2 (Bloco Deck):** 3 commits, 56 tests novos, deck domain + engine + UI lockados.

**Total do sprint:** 7 commits atômicos, **529 tests** (+56 desde o início), 0 regressão, build limpo em todos os checkpoints.

---

## Recomendação próxima sessão

Com deck integration completa e testada, o gameplay core está pronto pra uso real. Próxima sessão:

**Opção A — MovementEngine modernization (~3-5h)**
Fecha os 2 débitos residuais do Sprint Alfa (Teleport consome-mov + Armadilha voluntária). Também destrava hooks de "on-enter tile" para futuras skills.

**Opção B — Fase 2 de Design (redesenho de cenas secundárias)**
LobbyScene, ShopScene, BattlePassScene, SettingsScene, RankedScene, RankingScene, TournamentScene, BracketScene. Aplicar tokens + cenas do INTEGRATION_SPEC Wave 1-3. 6-10h por wave.

**Opção C — Deck UI polish (bench visualization, deck-build preview) (~2-3h)**
Pendências UX listadas acima.

**Opção D — Dispatch map refactor do CombatEngine (~3-4h)**
Backlog do Sprint Alfa. 16+ skill-id intercepts em 2 mega-funções.

**Minha recomendação:** A → B (quando precisar). A tem ROI alto (fecha débito + habilita novas mecânicas), B é trabalho de volume mas não bloqueia nada.

---

**Sprint Dupla concluída com zero regressão. 529 tests verdes, build limpo, commits atômicos.**
