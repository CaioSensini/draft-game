# DECISIONS_PENDING.md — Decisões aguardando aprovação

> Decisões de design / balance que **NÃO foram aplicadas** porque exigem aprovação explícita ou playtest. Material registrado a partir de CARTAS_DRAFT_v1.1.md (sessão Cards v1.1, 2026-05-06).

---

## P1. Shield do Executor (le_d8) é redundante

**Problema:** Executor já tem Bloqueio Total (60 HP), Recuo Rápido (20 HP + movimento) e Refletir. "Shield 25 HP simples" é a 4ª skill defensiva sem identidade própria.

**Sugestões alternativas (escolher uma):**
- **Pegada Furtiva:** self, +30% movimento próximo turno + invisibilidade até atacar
- **Faca Reserva:** self, próximo ataque do Executor causa +20% dano
- **Antídoto:** self, remove todos DoTs ativos + imune a novos DoTs por 1 turno

**Risco de mudar:** afeta deck-building atual, exige tradução nos 11 idiomas, pode requerer arte nova.

**Recomendação:** discutir antes da implementação.

---

## P2. Disparo Preciso pode estar over-tuned

**Problema:** 30 true damage (ignora DEF) + ignora shield (com bleed) = atravessa todas as defesas tradicionais. Esquiva é o único counter direto.

**Sugestões:**
- Manter como está (depende de bleed setup, justifica o poder)
- Reduzir true damage de 30 → 26
- Manter true damage mas adicionar cooldown de 2 turnos

**Risco:** se nerf demais, Executor vira inviável contra tanks. Se mantiver, pode dominar o meta.

**Recomendação:** monitorar em playtest antes de mudar.

---

## P3. Sombra Real (lk_d3) precisa decisão de implementação

**Problema:** clones podem ser implementados como Characters reais (Option A) ou apenas visuais no scene (Option B). Option A complica arquitetura; Option B é mais simples mas exige lógica de bot pra atacar aleatoriamente.

**Recomendação atual:** Option B (clones visuais com lógica de hit aleatório nos bots). Documentar em DECISIONS.md depois da decisão.

---

## P4. Renascimento Parcial (ls_d2) — fallback de heal foi adicionado

**Status:** já incluí no documento atual o fallback de "vira heal de 15 HP se aliado não morre em 2t". Manter ou remover?

**Recomendação:** manter (evita feel ruim de skill desperdiçada).

---

## P5. Heal Cap em time de 4

**Problema:** com Queimação ativa em todos os aliados, Especialista pode curar no máximo 2 vezes por aliado por turno (regra global). Isso pode tornar healing stall impossível.

**Sugestões:**
- Manter como está (já foi pensado pra resolver healing stall)
- Aumentar heal cap pra 3 com Especialista (vira buff de classe)

**Recomendação:** manter, validar em playtest.

---

# AJUSTES SISTÊMICOS NÃO APLICADOS (FORA DE ESCOPO)

Estes são **outros parâmetros do jogo** (não-cartas) que mereceriam revisão eventual mas que estão **fora de escopo deste balance pass**:

- **Stats base por classe** (HP/ATK/DEF/MOB) — já balanceados em v3
- **Passivas** — já reformuladas em v3 (Proteção Real -20%, Isolado +20%/-10% trade-off, Queimação -30%/2t)
- **Regras globais** (Execute, Heal Cap, DoT Bypass, Overtime) — implementadas e testadas
- **Buff do Muro** (25/50/75/100% por aliado) — não testado em playtest
- **Tempos de turno por modo** (1v1, 2v2, 4v4) — não definidos
- **Escalamento por level** (1-100) — não documentado
- **Upgrade de skills** (lvl 1-5) — schema existe, valores não definidos

Recomendação: cada um desses merece sua própria sessão de análise quando relevante.
