# SPRINT 0 — Fundação + Mobile Readiness

**Status:** Pré-requisito de tudo que vier depois. Sem isso, polish visual e implementação de skills vão gerar retrabalho.
**Escopo:** Limpar dívida técnica estrutural, unificar fontes de verdade, preparar projeto pra mobile, trocar localStorage por Supabase.
**Duração estimada:** 4-8 horas de trabalho autônomo.
**NÃO faz parte:** implementar skills, lógica de combate nova, art, UI polish. (Isso vem depois, no Bloco 1.)

---

## Contexto do projeto

Você está trabalhando no projeto **Draft**, RPG tático 2D competitivo em Phaser 3.90 + TypeScript 5.8 strict + Vite 7. Backend NestJS + Supabase.

**Arquitetura existente:**
- `src/domain/` (11 arq, ~3.400 LOC) — lógica pura
- `src/engine/` (21 arq, ~7.000 LOC) — orquestração
- `src/scenes/` (23 arq, ~20.000 LOC) — cenas Phaser
- `src/data/` (13 arq, ~2.600 LOC) — catálogos
- `src/utils/` (14 arq, ~5.600 LOC) — helpers, DesignTokens, UIComponents
- `src/services/`, `src/core/` — misc
- `src/entities/`, `src/systems/` — **código legacy** (coexistindo com arquitetura nova)

**Problemas atuais que o Sprint 0 resolve:**
1. `constants.ts` e `DesignTokens.ts` — duas fontes de verdade pra cores/tokens visuais
2. `ArenaScene.ts` (2.126 LOC) — cena legacy coexistindo com `BattleScene.ts` (3.659 LOC)
3. `BattleScene.ts` muito grande — precisa extrair managers
4. `PlayerDataManager` usa localStorage — precisa migrar pra Supabase com fallback
5. `BootScene` e `LoginScene` com cores hardcoded — não usam DesignTokens
6. Sem configuração de Phaser Scale Manager pra mobile (Steam + iOS + Android)
7. `UIComponents` não auditado pra touch-first

**Alvo visual do projeto:** Steam (desktop 1280x720+) + iOS + Android (mobile landscape).

---

## Regras de trabalho (NÃO NEGOCIÁVEIS)

1. **CONFIRMAÇÃO ANTES DE EXECUTAR.**
   Primeira resposta sua: explore a estrutura do projeto e responda as 6 perguntas do "Checkpoint de confirmação" (abaixo). **NÃO escreva código na primeira resposta.** Espere aprovação explícita do usuário.

2. **PARE E REPORTE em vez de chutar.**
   Se surgir ambiguidade, conflito de arquitetura, ou build quebrando por motivo não óbvio: **pare, documente em `docs/DECISIONS.md`, e reporte**. Não "tente resolver sozinho" reescrevendo código sem critério.

3. **Commits atômicos e descritivos.**
   Um commit por subtarefa. Formato: `sprint0: <subtarefa> — <resumo>`.

4. **Build tem que passar após CADA subtarefa.**
   Rodar `npm run build` e `npm run dev` antes de commitar. Se quebrar, conserta antes de seguir. Se não conseguir consertar em 2 tentativas, pare e reporte.

5. **Zero mudança de comportamento do jogo.**
   Sprint 0 é refactor estrutural. Jogador não deve notar diferença em gameplay. Se você achar que precisa mudar comportamento pra refatorar, pare e pergunte.

6. **Budget awareness.**
   Seja cirúrgico com leituras de arquivo. Aproveite cada leitura ao máximo antes de descartar contexto.

7. **Documentar decisões estruturais** em `docs/DECISIONS.md`:
   ```
   ## [YYYY-MM-DD] — Título da decisão

   **Contexto:**
   **Alternativas:**
   **Decisão:**
   **Consequências:**
   ```

---

## Checkpoint de confirmação (PRIMEIRA RESPOSTA)

Antes de qualquer código, responda estas 6 perguntas:

1. **Estrutura atual do projeto:**
   - Quantos arquivos em cada pasta (`src/domain`, `src/engine`, `src/scenes`, `src/data`, `src/utils`, `src/entities`, `src/systems`, `src/services`, `src/core`)?
   - Total de LOC do projeto?
   - Build atual passa? (`npm run build`)
   - Dev server sobe? (`npm run dev`)

2. **Estado de `constants.ts` vs `DesignTokens.ts`:**
   - Ambos existem? Onde ficam?
   - Quantos valores cada um tem?
   - Quantos arquivos importam de cada um? (quantidade aproximada via grep)
   - Tem sobreposição (mesmo token em ambos com valores diferentes)? Liste os conflitos.

3. **Estado do BattleScene vs ArenaScene:**
   - LOC atual de cada um?
   - Qual está sendo usado no fluxo ativo do jogo hoje?
   - ArenaScene tem features que BattleScene **ainda não cobre**? Liste.
   - Se ArenaScene tem features exclusivas, é feature crítica ou pode ser descartada?

4. **Estado do PlayerDataManager:**
   - Onde fica o arquivo?
   - Quais dados ele persiste hoje via localStorage?
   - Backend Supabase tem tabelas prontas pra receber esses dados, ou precisamos criar?

5. **Configuração atual de Phaser Scale:**
   - Qual o modo de scale atual? (`Phaser.Scale.NONE`, `FIT`, `ENVELOP`?)
   - Resolução base configurada?
   - Tem algum código de touch hoje?

6. **Seu plano de execução:**
   - Em que ordem você vai executar as 7 subtarefas?
   - Estimativa de tempo por subtarefa?
   - Alguma dependência externa que precisa ser instalada?
   - Algum risco/blocker que você já identificou?

**Espere "aprovado, pode executar" antes de implementar qualquer coisa.**

---

## Subtarefas do Sprint 0 (em ordem)

### Subtarefa 0.1 — Unificar fontes de design tokens

**Problema:** `constants.ts` e `DesignTokens.ts` coexistem como duas fontes conflitantes.

**Ação:**
- Audite o que cada arquivo contém.
- Migre tudo pra `DesignTokens.ts` como fonte única, mantendo nomenclatura semântica:
  ```typescript
  colors.team.ally
  colors.team.enemy
  colors.ui.primary
  fonts.heading
  fonts.body
  sizes.button.sm / md / lg
  spacing.xs / sm / md / lg / xl
  ```
- Se houver conflito (mesmo token com valores diferentes), decida pela versão "mais correta" e documente em `DECISIONS.md`.
- Remova `constants.ts` e atualize **todos** os imports no projeto.
- Valide: `grep -r "constants" src/` não retorna referências ao arquivo antigo.

**Teste:**
- [ ] Build passa
- [ ] Dev server sobe
- [ ] Zero referências ao `constants.ts` deletado
- [ ] Jogo visualmente idêntico ao antes (cores não mudaram)

**Commit:** `sprint0: unify design tokens — remove constants.ts in favor of DesignTokens.ts`

---

### Subtarefa 0.2 — Migrar BootScene e LoginScene pra DesignTokens

**Problema:** essas duas cenas usam cores hardcoded (`#fff`, `0xff0000`, etc.) ignorando DesignTokens.

**Ação:**
- Audite todos valores hardcoded nessas duas cenas.
- Substitua por imports de `DesignTokens.ts`.
- Zero literal de cor nos arquivos (nenhum `#...`, `0x...`, `rgb(...)`).
- Se uma cor usada não existe em DesignTokens, adicione com nome semântico (não "blue1", sim `colors.ui.action.primary`).

**Teste:**
- [ ] Build passa
- [ ] BootScene e LoginScene visualmente idênticas ao antes
- [ ] `grep -E "(#[0-9a-fA-F]{3,6}|0x[0-9a-fA-F]{3,6})" src/scenes/BootScene.ts src/scenes/LoginScene.ts` retorna vazio

**Commit:** `sprint0: migrate BootScene and LoginScene to DesignTokens`

---

### Subtarefa 0.3 — Arquivar ArenaScene legacy

**Problema:** `ArenaScene.ts` (2.126 LOC) é legacy e coexiste com `BattleScene.ts` como nova canonical.

**Ação:**
- **ANTES** de arquivar: rode o jogo, jogue uma partida inteira usando BattleScene. Valide que BattleScene cobre 100% do gameplay esperado.
- **SE** BattleScene não cobrir algo, liste o que falta e **pare aqui**. Pergunte antes de arquivar.
- **SE** BattleScene cobrir tudo: mova `src/scenes/ArenaScene.ts` pra `src/legacy/ArenaScene.ts.bak`.
- Remova do fluxo ativo: registros de cena no GameController, imports em outros arquivos, referências em config.
- Valide: `grep -r "ArenaScene" src/` retorna só o arquivo arquivado.

**Teste:**
- [ ] Build passa
- [ ] Dev server sobe
- [ ] Uma partida completa rodando em BattleScene sem erro
- [ ] ArenaScene não é referenciada em código ativo

**Commit:** `sprint0: archive legacy ArenaScene — BattleScene is canonical`

---

### Subtarefa 0.4 — Extrair managers do BattleScene

**Problema:** `BattleScene.ts` (3.659 LOC) é grande demais pra manter. Mistura responsabilidades.

**Ação:** extrair 3 managers em `src/scenes/battle/managers/`:

1. **`BattleTargetingManager`** — seleção de alvo, highlight de células válidas, preview de área da skill
2. **`BattleAnimationManager`** — tweens de unidade, camera shake, screen flash, projéteis (stubs ok se animação ainda não existe)
3. **`BattleUIManager`** — HP bars, barra de skills, timer, indicadores de turno

**Padrão:** cada manager recebe a cena via injeção no construtor e expõe API clara:
```typescript
targetingManager.highlight(cells: Grid[])
targetingManager.clearHighlight()
animationManager.shake(intensity: number)
animationManager.flashScreen(color: number)
uiManager.updateHP(unit: Unit, hp: number)
uiManager.showTimer(seconds: number)
```

**Meta:** `BattleScene.ts` final **abaixo de 1.500 LOC**.

**Teste:**
- [ ] Build passa
- [ ] BattleScene.ts abaixo de 1500 LOC (mostrar wc -l antes/depois)
- [ ] Jogo roda partida inteira sem erro (funcionalidade 100% preservada)
- [ ] 3 arquivos manager criados, cada um com responsabilidade clara

**Commit:** `sprint0: extract BattleScene managers (Targeting, Animation, UI)`

---

### Subtarefa 0.5 — PlayerDataManager com Supabase (fallback localStorage)

**Problema:** `PlayerDataManager` usa só localStorage, perdemos progresso entre dispositivos.

**Ação:**
- Crie interface `IPlayerDataStore` com métodos async:
  ```typescript
  interface IPlayerDataStore {
    get(key: string): Promise<unknown | null>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
    sync(): Promise<void> // sync pending local changes to remote
  }
  ```
- Implementações:
  - `SupabasePlayerDataStore` — primária, usa conexão Supabase já configurada
  - `LocalPlayerDataStore` — fallback, localStorage
- `PlayerDataManager` consome a interface e decide qual usar baseado em:
  - `navigator.onLine === true` + Supabase acessível → usa Supabase
  - Offline ou erro de rede → usa Local, marca mudança como "pending"
  - Quando voltar online → sincroniza pendentes
- **NÃO mexer em credenciais do Supabase** — usar o que já está configurado no backend.
- Se tabelas Supabase pra dados do player não existirem: **pare aqui** e reporte. Usuário vai criar tabelas.

**Teste:**
- [ ] Build passa
- [ ] PlayerDataManager funciona com Supabase (testar login + salvar perfil)
- [ ] PlayerDataManager funciona offline (testar desconectado)
- [ ] Sync funciona ao reconectar
- [ ] Dados existentes em localStorage são migrados na primeira execução

**Commit:** `sprint0: migrate PlayerDataManager to Supabase with offline fallback`

---

### Subtarefa 0.6 — Phaser Scale Manager pra mobile

**Problema:** jogo roda só desktop. Alvo é Steam + iOS + Android landscape.

**Ação:**
- Configure Phaser Scale Manager:
  ```typescript
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game',
    width: 1280,
    height: 720
  }
  ```
- Landscape **forçado** em mobile:
  - Meta tag `<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">`
  - Meta tag `<meta name="screen-orientation" content="landscape">`
  - JS: `screen.orientation.lock('landscape')` onde suportado
- Safe areas iOS (notch) + Android (gesture bar) via CSS:
  ```css
  body {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
  ```
- Teste em DevTools → Device Toolbar:
  - iPhone 14 Pro Max (landscape)
  - Pixel 7 (landscape)
  - iPad (landscape)
- Documente limitações conhecidas em `docs/MOBILE_NOTES.md`.

**Teste:**
- [ ] Build passa
- [ ] Jogo roda em 1280x720 desktop (sem regressão)
- [ ] Jogo escala corretamente em iPhone 14 Pro Max simulado
- [ ] Jogo escala corretamente em Pixel 7 simulado
- [ ] Safe areas respeitadas (nada cortado atrás do notch)
- [ ] Orientação landscape forçada onde suportado

**Commit:** `sprint0: configure Phaser Scale Manager for desktop + mobile landscape`

---

### Subtarefa 0.7 — Auditoria touch-first de UIComponents

**Problema:** UIComponents foi desenhado pra mouse. Mobile precisa de touch.

**Ação:**
- Revise `src/utils/UIComponents.ts`:
  - Todos os alvos tocáveis (botões, células, cards): **mínimo 44×44pt** (iOS HIG)
  - Hover states precisam de equivalente `pointerdown`/`pointerup` pra touch
  - Feedback tátil: scale down em press, scale up em release (estrutura, sem juice animado ainda — isso vem depois)
  - Não implementar juice animado nesta subtarefa — só garantir que a API suporta estados touch
- Liste em `docs/UI_AUDIT.md` componentes que não suportam touch adequadamente, com plano de correção pra sprint futuro.

**Teste:**
- [ ] Build passa
- [ ] UIComponents API expõe hooks touch (onTouchStart, onTouchEnd, etc)
- [ ] Tamanhos mínimos respeitados em componentes auditados
- [ ] `docs/UI_AUDIT.md` criado com lista de trabalho pendente

**Commit:** `sprint0: audit UIComponents for touch-first readiness`

---

## Gates de qualidade (OBRIGATÓRIOS antes de reportar conclusão)

Antes de dizer "Sprint 0 concluído", confirme:

- [ ] Todas 7 subtarefas commitadas
- [ ] `npm run build` passa sem erro nem warning novo
- [ ] `npm run dev` sobe e jogo roda partida completa sem erro
- [ ] Zero referências a `constants.ts` (deletado)
- [ ] Zero referências a `ArenaScene` em código ativo (arquivado)
- [ ] `BattleScene.ts` abaixo de 1500 LOC
- [ ] PlayerDataManager funciona online (Supabase) e offline (localStorage)
- [ ] Jogo escala corretamente em mobile simulado (iPhone + Android)
- [ ] `docs/DECISIONS.md` atualizado com decisões do sprint
- [ ] `docs/MOBILE_NOTES.md` criado
- [ ] `docs/UI_AUDIT.md` criado
- [ ] `docs/SPRINT0_REPORT.md` criado (relatório final)

**Se QUALQUER item falhar: pare, reporte, não diga que terminou.**

---

## Regras de parada automática (EMERGÊNCIA)

Pare o trabalho e reporte imediatamente se:

1. **Build quebrar e não conseguir consertar em 2 tentativas.**
2. **ArenaScene tiver features críticas** que BattleScene não cobre (pare no 0.3).
3. **Tabelas Supabase não existirem** pra dados do player (pare no 0.5).
4. **Refactor de BattleScene virar reescrita completa** (se achar que 1500 LOC é inatingível sem quebrar gameplay, pare e reporte).
5. **Conflito entre `constants.ts` e `DesignTokens.ts`** com mais de 10 tokens com valores diferentes (pare no 0.1, pergunte como resolver caso a caso).

Em qualquer desses casos: **commit do que você já fez funcionando**, atualize `SPRINT0_REPORT.md` com o ponto de parada, reporte.

---

## O que NÃO fazer no Sprint 0

- ❌ Implementar skills (isso é Bloco 1+ da Fase 2)
- ❌ Mudar lógica de combate
- ❌ Adicionar art, VFX, animações, áudio
- ❌ Refatorar código fora do escopo listado
- ❌ Otimizar performance (first make it work)
- ❌ Instalar libs novas sem perguntar
- ❌ Mudar backend NestJS ou schema Supabase (exceto confirmar que tabelas existem)
- ❌ Criar features novas que não estão nas 7 subtarefas

---

## Formato do relatório final

Quando terminar, criar `docs/SPRINT0_REPORT.md` e responder:

```
# SPRINT 0 CONCLUÍDO ✅ (ou ⚠️ com blockers)

## Resumo
- Subtarefas completadas: [0.1 ✅, 0.2 ✅, ...]
- LOC antes/depois: [totais]
- Build: passando / falhando
- Dev server: ok / com issues

## Arquivos principais criados/modificados
- (lista)

## Arquivos arquivados/deletados
- constants.ts → removido
- ArenaScene.ts → src/legacy/ArenaScene.ts.bak
- (outros)

## Decisões arquiteturais registradas em DECISIONS.md
1. (título) — (resumo)
2. ...

## Blockers encontrados
- (se houver)

## Pendências identificadas pra sprints futuros
- (ex: UIComponents X ainda não suporta touch — documentado em UI_AUDIT.md)

## Consumo aproximado de créditos
- (se Claude Code reportar)

## Recomendação de próximo passo
- Ir pra Bloco 1 (CombatEngine Core) ou aguardar decisão do usuário sobre X
```

---

**FIM DO PROMPT.** Aguarde aprovação do Checkpoint (6 perguntas) antes de implementar.
