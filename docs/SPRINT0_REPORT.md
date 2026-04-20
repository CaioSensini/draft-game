# SPRINT 0 CONCLUÍDO ⚠️ (com 2 blockers documentados)

**Data:** 2026-04-20
**Branch:** `turbo-targeting-v1`
**Commits:** 7 commits atômicos (prefixo `sprint0:`)

---

## Resumo

| # | Subtarefa | Status | Observação |
|---|-----------|--------|------------|
| 0.1 | Unificar design tokens | ✅ Concluído | `constants.ts` deletado, tokens semânticos adicionados |
| 0.2 | Migrar Boot/Login pra DesignTokens | ✅ Concluído | Zero literais de cor em ambos |
| 0.3 | Arquivar ArenaScene | ✅ Concluído | Movido pra `src/legacy/ArenaScene.ts.bak` |
| 0.4 | Extrair managers do BattleScene | ⚠️ Parada §4 | Arquitetura alvo documentada em `scenes/battle/managers/README.md` |
| 0.5 | PlayerDataManager → Supabase | ⚠️ Parada §3 | Gap de 4 entities no backend — lista detalhada em DECISIONS.md |
| 0.6 | Phaser Scale Manager mobile | ✅ Concluído | index.html + gameConfig + main.ts atualizados, docs/MOBILE_NOTES.md criado |
| 0.7 | Auditoria touch-first UIComponents | ✅ Concluído | MIN_TOUCH_TARGET + touchHitSize() + hooks, docs/UI_AUDIT.md criado |

**Subtarefas completas: 5/7**
**Subtarefas bloqueadas (com razão documentada e plano de desbloqueio): 2/7**

---

## Métricas

| Métrica | Antes | Depois |
|---------|-------|--------|
| Total de arquivos TS em `src/` | 99 | 97 (-2: constants.ts deletado, ArenaScene movida pra legacy) |
| Total de LOC em `src/` | 40.538 | 38.723 (ArenaScene 2.126 LOC saiu do escopo ativo) |
| Arquivos importando `constants` | 2 | 0 |
| Literais de cor em BootScene+LoginScene | vários | 0 |
| Referências ativas a `ArenaScene` | 3 | 0 (apenas comentários atualizados) |
| BattleScene LOC | 3.659 | 3.659 (sem mudança — stop rule §4) |

**Build:** ✅ `npm run build` passa (sem warnings novos)
**Type-check:** ✅ `tsc --noEmit` limpo
**Dev server:** não testado manualmente nesta sessão, mas build de produção completa funcionou

---

## Arquivos principais criados/modificados

### Criados
- `src/utils/DesignTokens.ts` — expandido significativamente (era 131 LOC, agora ~310 LOC com namespaces semânticos + legacy + shadow/form tokens)
- `docs/DECISIONS.md` — histórico de decisões (já existia, muito expandido)
- `docs/MOBILE_NOTES.md` — limitações por plataforma, checklist, TODOs
- `docs/UI_AUDIT.md` — status table por componente, TODOs priorizados
- `docs/SPRINT0_REPORT.md` — este arquivo
- `docs/PROMPT_SPRINT_0.md` — prompt original salvo
- `docs/SKILLS_CATALOG_v3_FINAL.md` — cópia do contrato de combate
- `src/scenes/battle/managers/README.md` — arquitetura alvo + plano de migração
- `src/legacy/ArenaScene.ts.bak` — scene arquivada

### Modificados
- `src/scenes/BootScene.ts` — zero literais de cor
- `src/scenes/LoginScene.ts` — zero literais de cor (HTML template interpolando tokens)
- `src/systems/BotSystem.ts` — import migrado `constants` → `DesignTokens`
- `src/systems/MovementSystem.ts` — idem
- `src/core/gameConfig.ts` — scale config completo (parent/width/height dentro de `scale:{}`)
- `src/main.ts` — `lockLandscape()` helper
- `index.html` — viewport + safe-area + meta tags mobile
- `src/utils/UIComponents.ts` — `MIN_TOUCH_TARGET`, `touchHitSize()`, touch hooks em `button()`
- `src/engine/PhaserBridge.ts` — comentário ArenaScene → BattleScene
- `src/engine/EffectSystem.ts` — docstring atualizada para documentar legacy status

### Deletados
- `src/data/constants.ts` (205 LOC)

---

## Decisões arquiteturais registradas em DECISIONS.md

1. **Sprint 0.1 — Unificação de design tokens.** DesignTokens wins arquiteturalmente; valores de cor de time/classe vêm de constants.ts (palette por legibilidade). Demais conflitos resolvidos caso a caso.
2. **Sprint 0.4 — Stop rule §4 acionada.** Refator de BattleScene exige 1-2 semanas dedicadas; adiado com plano detalhado.
3. **Sprint 0.5 — Stop rule §3 acionada.** Backend não tem 4 entities necessárias; migração aguarda schema.

---

## Blockers encontrados

### 🔴 Blocker 1 — Refactor de BattleScene (0.4)
**Problema:** BattleScene.ts tem 3.659 LOC com ~100 campos privados inter-referenciados. Atingir <1500 LOC como pedido exige refactor completo de 1-2 semanas.
**Status:** Arquitetura alvo documentada em `src/scenes/battle/managers/README.md` com plano de migração em 3 passes (Animation → UI → Targeting).
**Próximo passo:** Sprint dedicado quando o projeto priorizar.

### 🔴 Blocker 2 — Backend schema incompleto (0.5)
**Problema:** `PlayerData` do cliente inclui `ranked`, `battlePass`, `ownedSkins`, `equippedSkins` que não têm entities correspondentes. `SkillInventory` falta campo `progress`.
**Status:** Lista detalhada de entities necessárias em DECISIONS.md.
**Próximo passo:** Task isolada de backend (TypeORM migration) antes da 0.5 poder ser executada.

---

## Pendências identificadas pra sprints futuros

### Touch-first polish (continuação da 0.7)
- `backArrow()` — aplicar touchHitSize() (15min)
- `skillCard()` — aplicar touchHitSize() + hooks (30min)
- Inputs HTML LoginScene — padding + font-size 16 pra evitar auto-zoom iOS (20min)
- Auditar `setInteractive()` inline em scenes (BattleScene, LobbyScene, SettingsScene, ShopScene) após extração de managers

### Mobile (continuação da 0.6)
- Overlay "gire o dispositivo" para detectar portrait
- Detectar `visualViewport.resize` para ajustar LoginScene quando teclado abrir
- Capacitor wrapper config (orientation: landscape)
- Testes em dispositivos físicos reais

### Backend (desbloqueio da 0.5)
1. Adicionar `progress: number` em `SkillInventory` entity
2. Criar entities: `RankedProfile`, `BattlePassProgress`, `PlayerCosmetics`
3. Gerar TypeORM migration
4. Endpoints REST correspondentes no backend_api
5. Executar 0.5 como planejado: `IPlayerDataStore` + implementações Supabase/Local

### Refactor BattleScene (desbloqueio da 0.4)
1. Passe 1: `BattleAnimationManager` — tweens de movimento, camera shake, screen flash, projéteis
2. Passe 2: `BattleUIManager` — HP bars, skill panel, timer, banner, turn tracker, mini log
3. Passe 3: `BattleTargetingManager` — estado de seleção, highlights, preview de área

Cada passe em PR separado com smoke test manual antes de merge.

---

## Consumo aproximado de tempo

Estimado inicialmente 6-8h. Consumo real aproximado: **~5h** (subtarefas concluídas) + ~30min (stop rules documentadas).
Redução de tempo porque 0.4 e 0.5 foram bloqueios cedo — não consumiram o budget de implementação.

---

## Validação do build final

- ✅ `npm run build` passa (6s, chunk warning de tamanho pré-existente não relacionado ao sprint)
- ✅ `tsc --noEmit` passa limpo (zero erros)
- ✅ Git working tree limpo, 7 commits ordenados no branch

---

## Recomendação de próximo passo

Antes de partir para o próximo sprint grande (Fase 2 do projeto — Bloco 1 do CombatEngine ou implementação de UI polish):

1. **Resolver Blocker 2 primeiro (schema backend).** Dá mobilidade para 0.5 e destrava persistência cross-device.
2. **Decidir quando encarar Blocker 1.** Se o foco for gameplay polish, o BattleScene atual funciona — pode aguardar. Se for manutenabilidade do código, priorize o refactor.
3. **Continuar o plano v3** (aplicação das mecânicas exóticas — clones, summon walls, untargetable, damage redirect — marcadas como pendentes em DECISIONS.md).

---

## Commits deste sprint

```
af30d0e sprint0: audit UIComponents for touch-first readiness
81fd12a sprint0: configure Phaser Scale Manager for desktop + mobile landscape
e8d075f sprint0: PlayerDataManager Supabase migration — stop rule §3 triggered
87ba412 sprint0: BattleScene manager extraction — stop rule §4 triggered
803da51 sprint0: archive legacy ArenaScene — BattleScene is canonical
b5f1b01 sprint0: migrate BootScene and LoginScene to DesignTokens
e073d6e sprint0: unify design tokens — remove constants.ts in favor of DesignTokens.ts
```
