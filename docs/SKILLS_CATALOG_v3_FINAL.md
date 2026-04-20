# SKILLS_CATALOG_v3 — DRAFT GAME (FINAL)

**Status:** Fonte de verdade única para combate. Substitui todas versões anteriores.
**Versão:** 3.0 — Balanceamento Final com Tabelas Completas
**Data:** Abril 2026
**Inclui:** Skills, passivas, stats base, escalamento por level, upgrade de skills, tempos por modo, regras de ranked.

---

## ÍNDICE

1. Princípios de Balanceamento
2. Regras Globais de Combate
3. Stats Base por Classe
4. Passivas por Classe
5. Fórmula de Dano
6. Catálogo Completo de Skills
7. Simulações de Validação
8. **Escalamento por Level (1-100)** ⬅ NOVO
9. **Upgrade de Skills (lvl 1-5)** ⬅ NOVO
10. **Tempos de Turno por Modo** ⬅ NOVO
11. **Normalização de Ranked** ⬅ NOVO
12. Changelog
13. Instruções de Implementação

---

## 1. PRINCÍPIOS DE BALANCEAMENTO

1. **Dano > Cura por design.** Dano médio ~30% maior que cura média por turno.
2. **Partida média: 8-12 turnos.**
3. **Rei é vulnerável mas resiliente** (4-6 turnos com foco, 10+ sem).
4. **Todo kill é fechável** — execute global garante.
5. **DoT é arma anti-stall.** Bypass de cura.
6. **Utility > burst puro.** Skills com efeitos > skills só-dano.
7. **Passivas sempre ativas.** Sem passivas situacionais raras.

---

## 2. REGRAS GLOBAIS DE COMBATE

### 2.1 Rei Imune a Cura Direta
- **Rei NÃO recebe:** cura direta, regen externo, lifesteal direcionado, vampirismo.
- **Rei PODE receber:** shields, def_up, atk_up, imunidades, revive, self-heal via suas próprias skills (Sequência de Socos lifesteal, Recuperação Real, Espírito de Sobrevivência).

### 2.2 Execute Global
- Alvos com **HP ≤ 30%** recebem **+25% dano** de todas as fontes (incluindo DoT).

### 2.3 DoT Bypass Cura
- Ordem de resolução do turno: **dano direto → DoTs → shields → cura → regen**.
- Bleed/burn/poison rolam antes da cura. Se alvo morre pelo DoT, cura não salva.

### 2.4 Heal Cap
- Aliado pode receber cura no máximo **2 vezes por turno**.
- Shields não contam como cura.

### 2.5 Shield Cap
- Shields de uma unidade somam até **100 HP**. Acima disso, novo shield sobrescreve o mais fraco.

### 2.6 Debuff Stack Cap
- Mesmo debuff não stacka: nova aplicação sobrescreve (pega maior valor / duração maior).
- Debuffs diferentes coexistem.

### 2.7 Buff do Muro
- 1 aliado não-Rei no muro: +25% dano/def pro time
- 2 aliados: +50% / 3 aliados: +75% / 4 (com Rei): +100%
- Rei sozinho no muro NÃO dá buff (precisa estar acompanhado).

### 2.8 Overtime (Turno 12+)
- A partir do turno 12, **+10% dano causado por turno** (acumulativo).
- **Aplica a DoT também** (decidido).

### 2.9 Fila de Skills
- Deck de 8 (4 atk + 4 def), disponíveis 4 (2+2).
- Filas separadas atk/def. Skill usada vai pro fim da fila.

### 2.10 Movimento
- Movimento é turno separado da escolha de skills.
- Sequência do turno: movimento → skill atk + skill def (simultâneas) → resolução.

---

## 3. STATS BASE POR CLASSE (Level 1)

| Classe | HP | ATK | DEF | MOB |
|---|---|---|---|---|
| **Rei** | 180 | 16 | 14 | 4 |
| **Guerreiro** | 200 | 18 | 20 | 2 |
| **Executor** | 120 | 24 | 8 | 3 |
| **Especialista** | 130 | 20 | 10 | 2 |

**Notas:**
- MOB não escala com level. Fixo de acordo com classe.
- HP/ATK/DEF escalam por level (ver seção 8).

---

## 4. PASSIVAS POR CLASSE

### 4.1 Rei — "Proteção Real"
- **-20% dano recebido** de todas as fontes (incluindo true damage).
- Sempre ativo.

### 4.2 Guerreiro — "Protetor"
- Aliados adjacentes (incluindo diagonais): **-15% dano recebido**.
- Guerreiro não recebe do próprio efeito.
- Stacka multiplicativamente com Proteção Real do Rei.

### 4.3 Executor — "Isolado"
- Sem aliados nas 8 células ao redor: **+20% dano causado, +10% dano recebido** (trade-off).

### 4.4 Especialista — "Queimação"
- Alvos atingidos por skill do Especialista recebem **Queimação: -30% cura recebida por 2 turnos**.
- Renovável (não stackável): re-hit reseta timer.

---

## 5. FÓRMULA DE DANO

```
dano_final = dano_base × mitigação_DEF × modificadores × execute_multiplier

onde:
  mitigação_DEF = 100 / (100 + DEF_alvo)
  modificadores = produto de (passivas × buffs × debuffs)
  execute_multiplier = 1.25 se HP_alvo ≤ 30%, senão 1.0

Cap mínimo: dano_final ≥ dano_base × 0.10
```

**Exemplo:** Executor Corte Mortal (45) no Rei (DEF 14, Proteção Real -20%):
- `45 × (100/114) × 0.80 × 1.0 = 31.6 dano`

**Com execute ativado (Rei <30% HP):**
- `45 × (100/114) × 0.80 × 1.25 = 39.5 dano`

---

## 6. CATÁLOGO COMPLETO DE SKILLS

### 6.1 CARTAS COMPARTILHADAS

**Regra:** cartas com mesmo nome = efeito idêntico em qualquer classe.

#### Esquiva [def2] — Especialista, Executor, Rei
- **Alcance:** self
- **Efeito:** evita completamente o **primeiro ataque direto** recebido no próximo turno. Não protege contra DoT já aplicado.
- **Duração:** até receber 1 ataque ou fim do turno.

#### Bloqueio Total [def2] — Especialista, Executor
- **Alcance:** self
- **Efeito:** shield de **60 HP**. Persiste até ser quebrado ou 2 turnos.

#### Fortaleza Inabalável [def2] — Guerreiro, Rei
- **Alcance:** self
- **Efeito:** **-80% dano recebido** por 1 turno. Não pode se mover no próximo turno de movimento.

---

### 6.2 ESPECIALISTA (Mage/Suporte)
**HP 130 · ATK 20 · DEF 10 · MOB 2**
**Passiva:** Queimação (-30% cura em alvos atingidos, 2t)

#### ATTACK 1

**Bola de Fogo [atk1]** — área 2x2 campo inimigo · **28 dano + burn 6/turno por 2t**

**Chuva de Mana [atk1]** — 3 sqm vertical no campo inimigo · **22 dano em 2 ticks** (11+11)

**Raio Purificador [atk1]** — linha reta 3 sqm vertical até fim do mapa · **25 dano + purge** no inimigo / shield 10 em aliados atingidos

**Explosão Central [atk1]** — 1 inimigo target · **1º uso:** marca. **2º uso em marcado:** 50 dano + 50% extra se alvo tem debuff. Marca não-removível. Não bypassa por Esquiva/imunidade.

#### ATTACK 2

**Orbe de Lentidão [atk2]** — área 3x3 · **12 dano + def_down 25% + mov_down 1** (1t)

**Correntes Rígidas [atk2]** — formato + (5 casas) · **10 dano + snare 1t**

**Névoa [atk2]** — toda arena inimiga · aliados: **def_up 15%** / inimigos: **def_down 15% + cura recebida -30%** (2 turnos)

**Congelamento [atk2]** — 1 inimigo target · **18 dano + stun 1t + def_down 20%**

#### DEFENSE 1

**Cura Suprema [def1]** — 1 aliado target (não Rei) · **cura 35 HP**

**Renascimento Parcial [def1]** — 1 aliado target (não Rei) · revive latente: se aliado sofrer dano fatal nos próximos 2 turnos, revive com **25 HP**. Máximo 1x/aliado/partida.

**Campo de Cura [def1]** — área 3x3 · **cura 12 HP + shield 10** (1t) / Rei só recebe shield

**Proteção [def1]** — formato + (5 casas) · remove todos debuffs aliados + imunidade a novos debuffs por 1t

#### DEFENSE 2

**Campo de Cura Contínuo [def2]** — área 3x3 · **regen 6/turno por 2t** (Rei não recebe). Cancelado se aliado tomar dano.

**Esquiva [def2]** — ver 6.1

**Bloqueio Total [def2]** — ver 6.1

**Aura de Proteção [def2]** — diamante r2 · **shield 12 + atk_up 10%** (1t)

---

### 6.3 GUERREIRO (Tank/Frontline)
**HP 200 · ATK 18 · DEF 20 · MOB 2**
**Passiva:** Protetor (-15% dano em aliados adjacentes)

#### ATTACK 1

**Colisão Titânica [atk1]** — retângulo 6x2 vertical · **22 dano + push 1 sqm**. Se bloqueado: snare 1t.

**Impacto [atk1]** — área 3x3 · **28 dano + def_down 18% + mov_down 1** (1t)

**Golpe Devastador [atk1]** — área 2x2 · **30 dano + purge** (remove buffs e quebra shields)

**Investida Brutal [atk1]** — linha reta 3 sqm vertical · **24 dano + push 1 sqm**. Linha central: snare 1t se bloqueado. Linhas cima/baixo: empurradas perpendicular.

#### ATTACK 2

**Provocação [atk2]** — 1 inimigo target · **10 dano + def_down 15% + silence_defense 1t**

**Muralha Viva [atk2]** — 2 sqm vertical no campo inimigo · parede dura 2t. Inimigos nos 8 sqm ao redor: **def_down 15%, mov_down 1, 3 dano/turno adjacente**.

**Investida [atk2]** — linha reta 3 sqm vertical · **12 dano + def_down 15% + mov_down 1** (1t)

**Prisão de Muralha Morta [atk2]** — 3x3 (bordas, centro livre) · **12 dano no centro + 8 paredes temporárias ao redor**. Inimigos dentro: snare 2t. Paredes quebram com qualquer atk1.

#### DEFENSE 1

**Escudo do Protetor [def1]** — move até 2 sqm + cria "parede de escudo" 3 casas à frente vertical · aliados no retângulo 6 sqm atrás: **-50% dano** (1t)

**Guardião [def1]** — 1 aliado target · **60% do dano recebido pelo aliado é redirecionado ao Guerreiro, reduzido 30% no Guerreiro** (1t)

**Resistência Absoluta [def1]** — self (pode mover 1 sqm antes) · Guerreiro + aliado atrás: **-65% dano** (1t)

**Bater em Retirada [def1]** — 4x4 ao redor · move aliados 1 casa pra trás + **+1 mov próximo turno + -15% dano** (1t)

#### DEFENSE 2

**Fortaleza Inabalável [def2]** — ver 6.1

**Escudo de Grupo [def2]** — todos aliados · **shield 15 por 2t**

**Postura Defensiva [def2]** — 3x3 ao redor · aliados: **-25% dano** (1t)

**Avançar [def2]** — 4x4 ao redor · move aliados 1 casa à frente + **+1 mov + -10% dano + +10% atk** (1t)

---

### 6.4 EXECUTOR (Assassino/DPS)
**HP 120 · ATK 24 · DEF 8 · MOB 3**
**Passiva:** Isolado (+20% dano / +10% dano recebido sem aliados adjacentes)

#### ATTACK 1

**Corte Mortal [atk1]** — 1 inimigo target · **45 dano + remove debuffs do alvo**. Se alvo tinha bleed: **+50% dano (67 dano)**.

**Tempestade de Lâminas [atk1]** — área 3x3 · **26 dano**. Se alvos tinham bleed: +50% dano neles.

**Disparo Preciso [atk1]** — 1 inimigo target · **30 true damage** (ignora DEF). Se alvo tinha bleed: ignora também shields.

**Corte Preciso [atk1]** — 2 sqm horizontal · **22 dano + purge**

#### ATTACK 2

**Corte Hemorragia [atk2]** — 2 sqm horizontal · **8 dano + bleed 4/turno por 3t**. Acumulativo se re-aplicado.

**Bomba de Espinhos [atk2]** — diamante r2 · **10 dano + bleed 5/turno por 2t**

**Marca da Morte [atk2]** — 8 sqm vertical (4 de baixo, 2 grossura) · **12 dano + remove shields (cura 20% deles como HP) + bleed 8/turno por 2t**

**Armadilha Oculta [atk2]** — 1 sqm (não em casa ocupada) · ao pisar: **15 dano + snare 1t + bleed 4/turno por 3t**

#### DEFENSE 1

**Refletir [def1]** — self · **-25% dano recebido + reflete o mitigado ao atacante** (próximo turno)

**Adrenalina [def1]** — self · **+25% ATK por 2t**. Ao final: **perde 15% HP máximo** (bloqueável por shield).

**Ataque em Dobro [def1]** — self · próximo turno: **2 skills atk, 0 de def**. **Cooldown: 2 turnos** (não usável consecutivamente).

**Teleport [def1]** — self · teleporta **até 5 sqm**. Consome próximo turno de movimento.

#### DEFENSE 2

**Recuo Rápido [def2]** — self · move até 2 sqm pra trás + **shield 20** (1t)

**Esquiva [def2]** — ver 6.1

**Bloqueio Total [def2]** — ver 6.1

**Shield [def2]** — self · **shield 25** (1t)

---

### 6.5 REI (Líder/Sustain)
**HP 180 · ATK 16 · DEF 14 · MOB 4**
**Passiva:** Proteção Real (-20% dano, aplica a true damage)
**Condição de vitória:** Rei morto = time perde.

#### ATTACK 1

**Soco Real [atk1]** — 2 sqm horizontal · **25 dano + shield self 15** (2t)

**Chute Real [atk1]** — 2 sqm vertical · **27 dano + shield self 15** (2t)

**Sequência de Socos [atk1]** — 3x2 (3 vertical, 2 horizontal) · **15 dano + lifesteal 30%** (exceção à regra 2.1 — é self-heal da própria skill)

**Domínio Real [atk1]** — 3x3 · **18 dano + shield self = 25% do dano total causado** (1t)

#### ATTACK 2

**Empurrão Real [atk2]** — linha reta 3 sqm vertical até fim do mapa · **12 dano + push até 3 sqm**

**Contra-ataque [atk2]** — 3x3 · **15 dano + push 1 sqm** (afastando do centro). Centro não move.

**Intimidação [atk2]** — 1 inimigo target · **10 dano + teleporta alvo e adjacentes pra local escolhido**. Não pode colocar em bordas.

**Desarme [atk2]** — 1 inimigo target (não Rei) · **6 dano + cancela skill atk do alvo no turno + silence_attack 1t**

#### DEFENSE 1

**Fuga Sombria [def1]** — self, teleporta qualquer lugar da **metade aliada** do mapa · Rei fica untargetable por skills single-target até receber dano ou mover

**Recuperação Real [def1]** — self (exceção à regra 2.1) · **recupera 20% HP max em 2t** (10% agora, 10% próximo turno se não tomar dano)

**Sombra Real [def1]** — cria 2 clones em células vazias · Rei pode trocar de posição com um deles. Clones duram 2 turnos. Inimigos não sabem qual é real.

**Espírito de Sobrevivência [def1]** — self · se HP ≤ 50%: **+15% HP max + shield 10% HP max** (1t). Se HP > 50%: **+10% HP max**.

#### DEFENSE 2

**Escudo Self [def2]** — self · **shield 30** (2t)

**Fortaleza Inabalável [def2]** — ver 6.1

**Esquiva [def2]** — ver 6.1

**Ordem Real [def2]** — Rei volta pra posição inicial, aliados teleportados pra posições adjacentes · aliados adjacentes: **-15% dano** / Rei: **-15% por aliado adjacente (max -45%)** (1t)

---

## 7. SIMULAÇÕES DE VALIDAÇÃO

### Sim 1: Executor foca Rei sozinho
- **Resultado:** 10 turnos pra matar Rei B sem suporte. Com time: 5-7 turnos.
- ✅ Dentro de 8-12 turnos de partida.

### Sim 2: Healing stall
- **Antes:** dano 82 vs cura 65 = +17 HP líquido/turno (stall).
- **Agora:** dano 77 vs cura efetiva 32 = **+41 HP líquido/turno.**
- Guerreiro B morre em 5 turnos em vez de 15+. ✅ Stall resolvido.

### Sim 3: Executor com Adrenalina
- **Resultado:** 7-8 turnos pra matar Rei sozinho com buff máximo. Custa 18 HP ao fim.
- ✅ Executor forte mas não oneshot.

### Sim 4: Partida 4v4 completa
- Turnos 1-3: setup. 4-6: Especialista B morto. 7-9: pressão no Guerreiro B. 10-12: execute + overtime matam Rei.
- **Total médio: 10-12 turnos.** ✅ Dentro do alvo.

---

## 8. ESCALAMENTO POR LEVEL (1-100)

### 8.1 Fórmulas

```
HP(level)  = HP_base  × (1 + 0.005 × (level - 1))
ATK(level) = ATK_base × (1 + 0.004 × (level - 1))
DEF(level) = DEF_base × (1 + 0.004 × (level - 1))
MOB(level) = MOB_base  (não escala)
```

### 8.2 Tabela de referência

| Level | HP mult | ATK mult | DEF mult | Exemplo Rei HP |
|---|---|---|---|---|
| 1 | 1.00x | 1.00x | 1.00x | 180 |
| 10 | 1.045x | 1.036x | 1.036x | 188 |
| 25 | 1.12x | 1.096x | 1.096x | 202 |
| 50 | 1.245x | 1.196x | 1.196x | **224** (valor de ranked) |
| 75 | 1.37x | 1.296x | 1.296x | 247 |
| 100 | 1.495x | 1.396x | 1.396x | 269 |

### 8.3 Racional
- **Level 100 vs level 1:** +49.5% HP, +39.6% ATK/DEF.
- Linear, previsível, fácil de balancear.
- Diferença significativa mas não absurda (jogador level 100 não mata level 1 em 1 hit).

### 8.4 Comportamento em ranked
- **Todos os jogadores são normalizados em level 50.**
- Level 1 e level 100 em ranked têm stats idênticos (ver 8.2).
- Level real só impacta em PvE, partidas amistosas e casual.
- Isso garante ranked = skill, não grind.

### 8.5 XP por partida (base)

| Situação | XP (PvE) | XP (PvP não-ranked) | XP (Ranked) |
|---|---|---|---|
| Vitória vs alvo mesmo level | 100 | 80 | 150 |
| Vitória vs alvo -10 levels | 30 | 20 | N/A |
| Vitória vs alvo +10 levels | 200 | 160 | N/A |
| Derrota | 30 | 20 | 40 |
| Amistosa (inválido) | 0 | 0 | N/A |

**Bônus de equipe:**
- 2v2: **+10% XP e drop** para ambos jogadores
- 4v4: **+20% XP e drop** para todos jogadores
- Matchmaking solo: 0% bônus

**XP necessário por level (curva):**
```
xp_needed(level) = 100 × level^1.5

Exemplos:
Level 2: 200 XP
Level 10: 3162 XP
Level 50: 35355 XP
Level 100: 100000 XP
Total 1→100: ~2.5 milhões XP
```

Com ranked vitória de 150 XP, 1→100 levam ~17.000 partidas. Ajustável pós-playtest.

---

## 9. UPGRADE DE SKILLS (lvl 1-5)

### 9.1 Custo em cópias

| Skill level | Cópias pra upar | Total acumulado |
|---|---|---|
| 1 (base) | — | 0 |
| 2 | 1 | 1 |
| 3 | 2 | 3 |
| 4 | 4 | 7 |
| 5 | 8 | 15 |

### 9.2 Custo em gold por upgrade

| Nível | Gold |
|---|---|
| 1→2 | 500 |
| 2→3 | 1.500 |
| 3→4 | 5.000 |
| 4→5 | 15.000 |
| **Total** | **22.000 gold** por skill pra lvl 5 |

### 9.3 Ganhos por level

Cada skill level **aumenta todos os valores numéricos da skill em um escalar fixo**:

| Skill Level | Dano | Cura | Shield | DoT tick | Duração de debuffs |
|---|---|---|---|---|---|
| 1 | 100% (base) | 100% | 100% | 100% | base |
| 2 | +8% | +7% | +7% | +10% | base |
| 3 | +16% | +14% | +14% | +20% | +1 turno em debuffs de 1t |
| 4 | +24% | +21% | +21% | +30% | +1 turno |
| 5 | +32% | +28% | +28% | +40% | +2 turnos em debuffs de 1t |

**Exemplo:** Corte Mortal
- Lvl 1: 45 dano
- Lvl 3: 52 dano (+16%)
- Lvl 5: 59 dano (+32%)

**Exemplo:** Bola de Fogo
- Lvl 1: 28 dano + burn 6/turno por 2t
- Lvl 5: 37 dano + burn 8/turno por 4t (duração dobrou)

### 9.4 NÃO escalam com level de skill
- Alcance (sqm, área, formato)
- Efeitos binários (stun, snare, silence, evade, purge) — ou existe ou não existe
- Mecânicas especiais (teleport range, lifesteal %)

**Racional:** escalar alcance torna skills OP por level. Escalar valores numéricos é balanceável.

### 9.5 Ranked: skills também normalizadas?
**Decisão: NÃO normalizar skills em ranked.**
- Skill levels representam investimento em "mestrar sua skill específica", skill-based progression.
- Diferente de level de player (que é só tempo gasto).
- Mas: **matchmaking de ranked leva em conta "skill level médio do deck"** — jogadores com decks lvl 1-2 enfrentam outros lvl 1-2; decks lvl 4-5 enfrentam outros similares.

---

## 10. TEMPOS DE TURNO POR MODO

### 10.1 Decisões finais

| Modo | Controle | Tempo por personagem | Tempo total por player | Personagens por player |
|---|---|---|---|---|
| **1v1** | 1 player x 4 unidades | 20 seg | **80 seg** | 4 |
| **2v2** | 2 players x 2 unidades | 20 seg | **40 seg** | 2 |
| **4v4** | 4 players x 1 unidade | 25 seg | **25 seg** | 1 |

### 10.2 Racional
- **1v1:** 20s × 4 = 80s. Mais tempo pra coordenar 4 unidades mentalmente.
- **2v2:** 20s × 2 = 40s. Balanço entre coordenar duas unidades e ritmo.
- **4v4:** 25s para 1 unidade. **Maior que os outros modos por personagem** porque:
  - Jogador precisa comunicar com time (texto/voz/pings)
  - Jogador novato em mobile precisa mais tempo pra interface touch
  - Decisão é sozinho, sem rotina de múltiplas unidades

### 10.3 Botão "Confirmar Jogada"
- Todo modo tem botão **"Confirmar"** que finaliza o turno antes do timer.
- Jogador rápido não espera outros.
- Quando todos confirmam, round avança imediatamente.

### 10.4 Comportamento em timeout
- Se timer chega em 0: **jogador perde o turno**. Unidade não ataca nem defende, movimento = ficar parado.
- **Passivas e DoTs ainda se aplicam** (Rei timed-out ainda toma dano, Especialista timed-out ainda aplica Queimação de turno anterior).
- 3 timeouts consecutivos: **unidade entra em "auto-pilot"** (bot assume controle com IA básica). Previne abuse de "deixar o timer rodar pra stall".

---

## 11. NORMALIZAÇÃO DE RANKED

### 11.1 Level normalizado
- **Todos os jogadores em ranked jogam como level 50.**
- HP, ATK, DEF calculados com multiplicadores de level 50 (ver 8.2).
- Level real só importa pra XP/drops pós-partida.

### 11.2 Skills NÃO normalizadas
- Skill levels refletem skill investida, mantidos.
- Mas matchmaking agrupa por "skill level médio do deck".

### 11.3 MMR por modo
- **Cada modo tem MMR separado** (1v1 MMR, 2v2 MMR, 4v4 MMR).
- Jogador pode ser top 1% em 1v1 e médio em 4v4 — sistemas independentes.
- Previne "smurfing cruzado" entre modos.

### 11.4 Sistema de chaveamento (8 equipes, como no design)
- **Fase de grupos:** 2 grupos de 4, round-robin (3 partidas/equipe). Top 2 de cada grupo avançam.
- **Quartas, semis, final:** eliminatória simples (best of 3).
- **Premiação:** pontos acumulativos para ladder global.
  - 1º: 1000 pts | 2º: 600 | 3º-4º: 350 | 5º-8º: 150
- **NPCs de filler:** se equipes humanas insuficientes, NPCs preenchem no nível médio dos participantes humanos.

---

## 12. CHANGELOG vs v1

### Stats base
- Rei: HP 150→180, DEF 12→14, MOB 99→4
- Guerreiro: HP 180→200, ATK 16→18
- Executor: ATK 22→24
- Especialista: ATK 18→20

### Passivas
- Rei: -15%→-20% (aplica true damage agora)
- Executor: +15% dmg → +20%/+10% (trade-off)
- Especialista: -20%/1t → -30%/2t (arma anti-heal)
- Guerreiro: inalterada

### Regras globais NOVAS
- Execute: <30% HP → +25% dano
- Rei imune a cura/regen direta
- DoT bypass de cura
- Heal cap: 2 curas/turno
- Shield cap: 100 HP
- Overtime aplica a DoT

### Principais mudanças de skill
- Cura Suprema: 65→35 HP
- Corte Mortal: 60→45 (+50% se bleed)
- Disparo Preciso: 41→30 true
- Adrenalina: +30%/3t sem custo → +25%/2t + perde 15% HP
- Teleport Executor: mapa → 5 sqm + custa movimento
- Esquiva: total → 1 ataque
- Renascimento: 40 HP sem limite → 25 HP + 1x/partida
- Guardião: 80%/50% → 60%/30%

### Sistemas novos (v3)
- Escalamento por level (seção 8)
- Upgrade de skills com valores exatos (seção 9)
- Tempos por modo finais (seção 10)
- Ranked normalizado (seção 11)

---

## 13. INSTRUÇÕES DE IMPLEMENTAÇÃO PRO CLAUDE CODE

Implementar nesta ordem. Cada seção deve ter unit tests antes de avançar.

### Fase 1 — CombatEngine (lógica pura, sem Phaser)
1. **Enum de effects** (damage, heal, shield, bleed, burn, stun, snare, silence_attack, silence_defense, evade, reflect, push, pull, teleport, def_up, def_down, atk_up, atk_down, mov_up, mov_down, mark, revive, lifesteal, purge, cleanse, poison, double_attack, area_field, summon_wall, invisibility, true_damage).
2. **Fórmula de dano** (seção 5).
3. **Regras globais** (seção 2) como middlewares do resolvedor:
   - Execute check antes de aplicar dano
   - Rei cura-immunity na resolução de effect heal
   - DoT ordering na pipeline de turno
   - Heal/Shield caps na aplicação
4. **Stats base** por classe (seção 3) + escalamento por level (seção 8.1).
5. **Passivas** como event listeners (seção 4).
6. **Sistema de turnos** com movimento → skill selection → resolução.
7. **Rodar simulações da seção 7 como integration tests.** NÃO avançar até passarem.

### Fase 2 — Skills data-driven
8. Schema TypeScript de skill:
   ```typescript
   interface Skill {
     id: string;
     class: 'king' | 'warrior' | 'executor' | 'specialist' | 'shared';
     type: 'atk1' | 'atk2' | 'def1' | 'def2';
     name: string;
     targetType: 'self' | 'single' | 'area' | 'line' | 'all_allies' | 'all_enemies' | 'field';
     areaShape?: { type: 'square' | 'diamond' | 'line' | 'plus' | 'ring'; size: number; direction?: 'vertical' | 'horizontal' | 'any' };
     range: 'self' | 'enemy_field' | 'ally_field' | 'any';
     effects: Effect[];
     level: number; // 1-5
     metadata: { description: string; artAssetId?: string; soundId?: string };
   }
   ```
9. Implementar **61 skills únicas + 3 compartilhadas** da seção 6.
10. **Upgrade de skills** (seção 9) aplicado multiplicativamente aos valores numéricos.
11. Testar cada classe individualmente.

### Fase 3 — Deck e fila rotativa
12. Sistema de deck 4 atk + 4 def por unidade.
13. Fila rotativa: disponíveis 2+2, usada vai pro fim.
14. UI de deck builder (lista todas skills do jogador, drag-and-drop pra slots).

### Fase 4 — Modos e tempo
15. Implementar timer por modo (seção 10).
16. Botão "Confirmar Jogada".
17. Auto-pilot após 3 timeouts.

### Fase 5 — Ranked
18. Normalização de level 50 em ranked (seção 11.1).
19. MMR separado por modo.
20. Sistema de chaveamento 8-team (seção 11.4).

### NÃO implementar agora
- Art de skill (placeholders retângulos)
- VFX polido (partículas básicas ok)
- Animações complexas
- Audio (stubs ok)
- Polish visual de UI

**Isso é Fase 2 do projeto**, depois do CombatEngine estar 100% testado.

### Testes obrigatórios ANTES de considerar engine pronto
- [ ] Todas 4 simulações da seção 7 passam
- [ ] Rei não pode ser curado (assert em 5 skills de cura)
- [ ] Execute multiplier ativa em <30% HP
- [ ] DoT mata alvo antes da cura (edge case)
- [ ] Heal cap funciona (3ª cura no mesmo aliado falha)
- [ ] Fila rotativa não permite re-uso em <2 turnos
- [ ] Timer timeout faz unidade perder turno
- [ ] Passivas triggeram corretamente (Queimação aplica em atk, Protetor reduz em aliado adjacente)

---

**FIM DO DOCUMENTO.** Este é o contrato de combate da Draft. Mudanças futuras = DECISIONS.md.
