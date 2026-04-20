# BattleScene Managers (planejado — Sprint 0.4 parcialmente executado)

## Status

**Sprint 0.4 acionou a regra de parada automática §4.** O BattleScene tem estado
profundamente acoplado (100+ campos privados inter-referenciados em ~3659 LOC).
Atingir <1500 LOC via extração de managers, mantendo 100% da funcionalidade e
zero regressão de gameplay, requer refactor de 1-2 semanas — escopo maior que
o de um único sprint.

## O que foi feito

- Este diretório foi criado como placeholder estrutural.
- A arquitetura proposta está documentada abaixo.
- Nenhuma extração parcial foi aplicada, para evitar introduzir um estado
  híbrido inconsistente que dificultaria o refactor completo futuro.

## Arquitetura alvo (futura)

Três managers, cada um recebe a scene via injeção no construtor:

### `BattleTargetingManager`
Responsável por:
- Estado de seleção de alvo (`_moveSelectedId`, `_awaitingMode`, `_awaitingSkillId`)
- Highlight de células válidas de movimento (`_moveOverlays`)
- Preview de área de skill (`_buildTargetOverlays`)
- Validação de alvos via `GameController.getValidMoves/getValidTargets`

API pretendida:
```typescript
targetingManager.beginMoveSelection(unitId: string)
targetingManager.highlightValidMoves(positions: Grid[])
targetingManager.clearHighlight()
targetingManager.beginSkillTargeting(unitId: string, skillId: string)
targetingManager.chooseTarget(col: number, row: number)
targetingManager.cancelTargeting()
```

### `BattleAnimationManager`
Responsável por:
- Tweens de movimento de unidade
- Camera shake em hits
- Screen flash em criticos/mortes
- Projeteis e VFX durante ataques
- Coordenação com VFXManager e CharacterAnimator

API pretendida:
```typescript
animationManager.moveUnit(unitId: string, toCol: number, toRow: number): Promise<void>
animationManager.shake(intensity: number, duration: number)
animationManager.flashScreen(color: number, duration: number)
animationManager.fireProjectile(from: Sprite, to: Sprite, type: string): Promise<void>
animationManager.flinch(unitId: string, amount: number)
animationManager.deathFade(unitId: string): Promise<void>
```

### `BattleUIManager`
Responsável por:
- HP bars, shield bars, status dots por unidade
- Painel de skills (cards de attack/defense)
- Timer display e barra de progresso
- Turn tracker (sidebar direita)
- Phase banner (overlay transitório)
- Mini log de round
- Botões (action, end movement, cancel, surrender)

API pretendida:
```typescript
uiManager.buildPanelShell()
uiManager.drawStatusPanels()
uiManager.updateHP(unit: Character, hp: number)
uiManager.showTimer(seconds: number, total: number)
uiManager.renderTurnTracker(entries: TurnEntry[])
uiManager.showPhaseBanner(text: string, duration: number)
uiManager.renderMiniLog(entries: MiniLogEntry[])
```

## Plano de migração (sprint futuro dedicado)

1. Criar os 3 arquivos de manager com classes vazias + interfaces públicas
2. Extrair **um** manager por vez, em passes separados com commit isolado:
   - Passe 1: `BattleAnimationManager` (menos acoplado — só toca sprites e VFX)
   - Passe 2: `BattleUIManager` (HP bars, timer, banner, tracker)
   - Passe 3: `BattleTargetingManager` (estado mais acoplado com `_ctrl`)
3. Cada passe:
   - Move campos privados relacionados para o manager
   - Atualiza call sites em BattleScene para `this._xxxManager.foo()`
   - Roda smoke test manual (partida completa)
   - Commit
4. Meta final: BattleScene ~1500-2000 LOC como orquestrador puro.

## Regra de ouro para o refactor futuro

**Nunca** um método deve residir em dois lugares simultaneamente. A duplicação
temporária durante o refactor leva a bugs silenciosos porque quem chama o método
velho pode divergir de quem chama o novo. Sempre mover, nunca copiar.

## Links

- Arquivo atual a refatorar: `src/scenes/BattleScene.ts` (3659 LOC)
- Documento de referência: `docs/PROMPT_SPRINT_0.md` §0.4
- Decisão de parada: `docs/DECISIONS.md` sob entrada Sprint 0.4
