# Draft Game - Estruturação Completa

## Visão Geral do Jogo

**Draft** é um jogo tático estratégico baseado em turnos, onde jogadores controlam equipes de 4 unidades (Rei, Guerreiro/Tank, Executor/DPS, Especialista/Healer) em batalhas 4v4. O objetivo é derrotar o Rei adversário através de posicionamento estratégico, uso de habilidades e controle do campo de batalha.

## Mecânicas Core

### Sistema de Batalha
- **Campo**: 16x6 tiles (64px cada), dividido em território azul (cols 0-7) e vermelho (cols 8-15)
- **Turnos**: Fase de Movimento (20s) + Fase de Ações (15s), alternando entre times
- **Condição de Vitória**: Derrotar o Rei adversário
- **Unidades**: 4 por time, cada uma com role específico e habilidades únicas

### Classes e Roles

#### 👑 REI (King)
- **Stats Base**: HP 100, ATK 50, DEF 50, MOB 3
- **Passiva**: Transporte Real - Teleporta livremente durante fase de movimento
- **Estilo**: Controle e sobrevivência, foco em posicionamento e buffs

#### 🛡️ GUERREIRO (Tank/Warrior)
- **Stats Base**: HP 150, ATK 40, DEF 80, MOB 2
- **Passiva**: Aliados próximos (+15% mitigação de dano)
- **Estilo**: Tanqueamento, controle de área, proteção de equipe

#### ⚔️ EXECUTOR (DPS/Executor)
- **Stats Base**: HP 60, ATK 80, DEF 20, MOB 4
- **Passiva**: +15% dano quando sozinho (sem unidades adjacentes)
- **Estilo**: Dano alto, debuffs, mobilidade

#### 🔮 ESPECIALISTA (Healer/Specialist)
- **Stats Base**: HP 80, ATK 30, DEF 30, MOB 3
- **Passiva**: Inimigos atingidos por habilidades recebem -20% cura por 1 turno
- **Estilo**: Suporte, controle mágico, cura em área

### Sistema de Habilidades

#### Estrutura das Habilidades
Cada unidade possui **16 habilidades** divididas em:
- **Ataque Tipo 1 (4 cards)**: Dano forte/sustentado
- **Ataque Tipo 2 (4 cards)**: Controle e debuffs
- **Defesa Tipo 1 (4 cards)**: Defesas fortes
- **Defesa Tipo 2 (4 cards)**: Defesas leves/suporte

#### Sistema de Deck
- Cada unidade carrega **8 habilidades** (4 ataque + 4 defesa)
- Por turno: usa 1 ataque + 1 defesa
- Após uso, habilidade vai para o fundo do deck
- Rotação independente para ataque/defesa
- Tempo para reutilizar: ~2 turnos (dependendo do deck)

#### Alcance e Targeting
- **Target**: Habilidades em unidades específicas seguem o alvo mesmo se mover
- **Área**: Habilidades em regiões afetam tiles, independente de movimento
- **Ranges**: Medidos em sqm (tiles) a partir do ponto de impacto

### Buff do Muro

Sistema estratégico de posicionamento:
- Unidades encostadas no muro central ganham buffs
- **1 unidade**: +25% DEF/DMG para time
- **2 unidades**: +50% DEF/DMG para time
- **3 unidades**: +75% DEF/DMG para time
- **4 unidades (incluindo Rei)**: +100% DEF (imunidade), +100% DMG (dobro) para time

### Sistema de RPG

#### Progressão
- **Level único** para toda equipe (1-100)
- **XP** ganha em vitórias (PVP/PVE)
- **Atributos escaláveis**: HP, ATK, DEF aumentam com level

#### Modos de Jogo
- **1v1**: 1 jogador controla 4 unidades (15s por unidade = 60s total)
- **2v2**: 2 jogadores controlam 2 unidades cada (15s por unidade = 30s)
- **4v4**: 4 jogadores controlam 1 unidade cada (15s total)

#### Economia
- **Gold**: Moeda principal, ganha em batalhas (com impostos)
- **DG (Draft Gold)**: Moeda premium, comprada com dinheiro real
- **Loja**: Habilidades, upgrades, itens
- **Sistema de Maestria**: Ataque/Defesa para trocar por pacotes

#### PVE/PVP
- **PVE**: Ataques a reinos NPCs, farming XP/gold/habilidades
- **PVP**: Batalhas ranqueadas, torneios
- **Offline**: Até 10 ataques/defesas por dia
- **Bônus equipe**: +10% XP em duplas, +20% em quartetos

### Detalhes Técnicos

#### Arquitetura
- **Frontend**: Phaser 3 + TypeScript + Vite
- **Backend**: NestJS + PostgreSQL (planejado)
- **Resolução**: 1280x720, FIT scaling

#### Estado do Jogo
- **Session State**: Units, progress, phase, side, round
- **Unit State**: HP, effects, position, deck
- **Effects**: Bleed, stun, shield, regen, etc. com duração

#### Desenvolvimento Atual
- Game client funcional com combate básico
- Sistema de cards implementado (4 por role)
- UI básica, tooltips, efeitos visuais
- Próximas implementações: Sistema completo de deck, passivas, buffs do muro, RPG

---

*Este documento serve como referência para futuras implementações e manutenção do código. Todas as mecânicas descritas devem ser implementadas de forma consistente com esta especificação.*</content>
<parameter name="filePath">c:\Projetos\Draft\docs\game_structure.md