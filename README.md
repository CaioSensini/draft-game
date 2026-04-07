# Draft Game

Projeto do jogo **Draft** — um RPG tático 2D competitivo baseado em grid com combate em tempo real.

---

## 🟢 Status do Projeto

| Componente | Status | Notas |
|-----------|--------|-------|
| **Game Client** | ✅ Ativo | Phaser 3, TypeScript, Vite |
| **Backend API** | 🔵 Planejado | NestJS + PostgreSQL |
| **Admin Panel** | 🔵 Planejado | Next.js |
| **Desktop** | 🔵 Planejado | Electron |
| **Mobile** | 🔵 Planejado | Capacitor |

---

## ⚙️ Stack Tecnológica

### Frontend (Game Client) ✅ **ATIVO**
- **HTML5** — Estrutura
- **TypeScript 5.8.3** — Linguagem (modo strict)
- **Phaser 3.90.0** — Motor de jogo
- **Vite 7** — Bundler e dev server

### Backend (Planejado)
- **NestJS** — Framework Node.js
- **PostgreSQL** — Banco de dados
- API REST para multiplayer e persistência

### Admin Panel (Planejado)
- **Next.js** — Framework React

### Plataformas Alvo
- ✅ **Web** (principal)
- 🔵 **Desktop** via Electron
- 🔵 **Mobile** via Capacitor

---

## 🎮 Conceito do Jogo

**Draft** é um RPG tático PvP/PvE focado em estratégia e posicionamento.

### Objetivo
Eliminar o **Rei inimigo** em combates por equipes

### Configuração
- **Arena**: Grid 16×6 (1024×384 px, tiles de 64px)
- **Times**: 4 unidades vs 4 unidades
- **Composição obrigatória**:
  - 1 **Rei** (REI)
  - 1 **Guerreiro** (WARRIOR)
  - 1 **Executor** (EXECUTOR)
  - 1 **Especialista** (SPECIALIST)

### Modos de Jogo
- **1v1**: Cada jogador controla 4 personagens
- **2v2**: Cada jogador controla 2 personagens
- **4v4**: Cada jogador controla 1 personagem

---

## 🔁 Mecânica de Turnos

### Estrutura por Round

Cada round alterna entre os dois times:

#### **1️⃣ Fase de Movimento** (20 seg)
- Jogador seleciona 1 unidade
- Clica em tile válido para mover
- Validações por role (range de mobilidade diferente por classe)

#### **2️⃣ Fase de Ação** (15 seg)
- Jogador seleciona **1 ataque** + **1 defesa** por unidade
- Cartas têm diferentes padrões de alvo: unidade única, azarém, self, all allies, área
- Após ambos times escolherem, as ações são resolvidas em paralelo (ordem por role: King → Warrior → Executor → Specialist)

### Sistema de Deck Rotativo

Cada unidade possui **8 habilidades** (4 ataque + 4 defesa):
- Apenas 2 (1 ataque + 1 defesa) estão disponíveis por turno
- Após usar uma, ela vai para o **final da fila**
- Uma nova habilidade é **puxada do topo**
- Cria ciclo estratégico e evita repetição de ações

---

## 📁 Estrutura do Projeto

```
Draft/
├── game-client/              # ✅ Cliente do jogo (ATIVO)
│   ├── src/
│   │   ├── main.ts           # Config Phaser (scenes, resolução)
│   │   ├── types.ts          # Tipos e interfaces TypeScript
│   │   ├── data/
│   │   │   ├── constants.ts  # Constantes (cores, dimensões, timings)
│   │   │   ├── cardTemplates.ts   # 16 cartas (4 por role)
│   │   │   ├── initialUnits.ts    # 8 unidades iniciais
│   │   │   ├── unitStats.ts       # Stats base por role
│   │   │   └── progression.ts     # Sistema de nível (XP)
│   │   └── scenes/
│   │       ├── BootScene.ts       # Boot → Menu
│   │       ├── MenuScene.ts       # Menu → Arena
│   │       ├── ArenaScene.ts      # ⚔️ Todo gameplay (~8000 LOC)
│   │       └── arenaUtils.ts      # Helper functions
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.js (padrão)
│
├── backend_api/              # 🔵 Backend (planejado)
├── admin_panel/              # 🔵 Admin (planejado)
├── docs/                     # 📚 Documentação
│   ├── 01_project_foundation.md
│   └── game_design.md
├── assets_base/              # 🎨 Assets compartilhados
└── README.md                 # Este arquivo
```

---

## 🚀 Como Executar

### Pré-requisitos
- **Node.js** 16+ e **npm** 8+
- Navegador moderno (Chrome, Firefox, Edge)

### Instalação
```bash
cd game-client
npm install
```

### Desenvolvimento
```bash
npm run dev
```
Abre em **http://localhost:5173/** com auto-reload

### Build para Produção
```bash
npm run build
```
Gera otimizado em `dist/`

### Preview do Build
```bash
npm run preview
```
Testa a build de produção localmente

---

## 🎮 Gameplay

### Fluxo da Sessão
1. **BootScene** (inicial)
2. **MenuScene** (tela de início)
3. **ArenaScene** (combate)
   - Setup: 2 times (left/right) aparecem na arena
   - Rounds alternam entre sides
   - Cada round: Movement Phase → Action Phase
   - Fim: Um time sem Rei perde

### Exemplo de Round

```
Round 1:
├─ Left Team Turn
│  ├─ Movement Phase (20s): Escolhe qual unidade mover
│  └─ Action Phase (15s): Todas unidades escolhem ataque + defesa
├─ Right Team Turn (idem)
└─ Action Resolution: Ambos times aplicam danos/heals
Round 2: ...
```

---

## 🛠️ Estrutura Técnica (ArenaScene)

### Dados em Memória

| Campo | Tipo | Propósito |
|-------|------|-----------|
| `unitsById` | `Map<string, UnitData>` | Posições/identidade das unidades |
| `unitState` | `Map<string, RuntimeState>` | HP, shields, status effects |
| `unitSprites` | `Map<string, UnitVisual>` | Containers/visuals Phaser |
| `unitProgress` | `Map<string, UnitProgress>` | Flags de moved/acted por fase |
| `unitDecks` | `Map<string, UnitDeck>` | Deck rotativo de cartas |
| `currentPhase` | `'movement' \| 'action'` | Fase atual |
| `currentSideIndex` | `0 \| 1` | Time atual (0=left, 1=right) |
| `roundNumber` | `number` | Contador de rounds |

### Renderização

- **Graphics API** do Phaser (sem sprites)
- Unidades = círculos com layers (contorno, corpo, símbolo, HP bar)
- Animações: Tweens (movimento, projectiles)
- Texto flutuante: Números de dano/cura com fade-out (~800ms)

### Resolução de Ações

Quando ambos times finalizam suas escolhas:
1. Joga animações em **ordem de role** (King → Warrior → Executor → Specialist)
2. Each unit fires projectile tween toward target
3. Flash effect + floating damage/heal text
4. Status effects aplicados

---

## 🎯 Passivas por Role

| Role | Passiva | Efeito |
|------|---------|--------|
| **King** | Wall Defender | Reduz 10% dano se tocando parede |
| **Warrior** | Guardian | Reduz 25% dano tomado por aliados próximos |
| **Executor** | Predator | +25% dano se isolado (sem aliados adjacentes) |
| **Specialist** | Warden | Heals +20% com passivas? (TBD) |

---

## 📊 Tipos de Cartas (16 Total)

### Attack Cards (8)
Cada role tem 2 cartas de ataque:
- King, Warrior, Executor, Specialist

### Defense Cards (8)
Cada role tem 2 cartas de defesa:
- King, Warrior, Executor, Specialist

### Efeitos Possíveis
- `damage` — Dano direto
- `heal` — Cura aliado
- `shield` — Escudo (reduz dano próximo)
- `bleed` — Dano contínuo
- `stun` — Paralisa (pula turno)
- `evade` — Evita dano
- `reflect` — Reflete dano
- `regen` — Cura contínua
- `area` — Dano em área (AoE)

---

## 🔐 Features NOT YET IMPLEMENTED

❌ Multiplayer (conexão backend)  
❌ Persistência (banco de dados)  
❌ Sistema de nível/XP (estrutura existe, lógica não integrada)  
❌ Matchmaking  
❌ Ranking/Leaderboard  
❌ Cosmética de unidades  
❌ Admin panel  
❌ Desktop/Mobile wrappers  

---

## 📖 Documentação Adicional

- [01_project_foundation.md](./docs/01_project_foundation.md) — Raiz do projeto
- [game_design.md](./docs/game_design.md) — Design document detalhado

---

## 👨‍💻 Desenvolvimento

### Contribuição

1. Faça suas mudanças em branch feature
2. Teste localmente (`npm run dev`)
3. Build (`npm run build`) deve passar sem erros
4. Commit com mensagem clara

### Scripts Disponíveis

```bash
npm run dev      # Dev server com hot reload
npm run build    # tsc + Vite bundle
npm run preview  # Preview da build
```

### Arquitetura Notes

- **ArenaScene.ts** contém toda a lógica (considerar futuro refactor em submódulos)
- **types.ts** é central — mudanças afetam todo o projeto
- **constants.ts** deve ser usado em vez de magic numbers
- **arenaUtils.ts** tem helpers — adicione funções reutilizáveis lá

---

## 📝 Licença

A definir

---

## 🤝 Suporte

Para dúvidas sobre o projeto, consulte `CLAUDE.md` ou a documentação em `/docs`.


### 🔹 Área (AOE)
- A habilidade é aplicada na **posição escolhida**
- Pode errar se o alvo sair da área

---

## 🧠 Classes e Identidade

Cada classe possui papel estratégico único:

### 👑 Rei
- Condição de vitória
- Alta sobrevivência e controle
- Passiva: **Transporte Real**
  - Pode se mover livremente no mapa (teleporte)

---

### 🛡 Guerreiro
- Frontline e proteção
- Controle de espaço e mitigação

Passiva:
- Aliados adjacentes recebem **redução de dano**

---

### ⚔️ Executor
- Alto dano e finalização
- Forte contra alvos isolados

Passiva:
- Ganha **dano bônus quando isolado**

---

### 🔮 Especialista
- Controle, suporte e manipulação de combate

Passiva:
- Inimigos atingidos recebem **redução de cura**

---

## 🧩 Sistema de Habilidades

Cada classe possui **16 habilidades únicas**, divididas em:

- Ataque Tipo 1 (dano forte)
- Ataque Tipo 2 (controle)
- Defesa Tipo 1 (defesa forte)
- Defesa Tipo 2 (defesa leve)

As habilidades incluem:
- dano direto
- dano em área
- stun, snare, controle
- cura
- shield
- buffs e debuffs
- manipulação de posicionamento

O design das habilidades considera:
- colisão com mapa
- interação entre personagens
- consistência de regras (target vs área)

---

## 🧱 Sistema de Mapa (Mecânica de Muro)

Jogadores próximos ao muro recebem bônus cumulativos:

- +25% dano e defesa por personagem encostado
- Até 4 personagens → bônus máximo:
  - +100% dano
  - +100% defesa

Regra especial:
- O Rei só ativa o bônus se os 3 aliados também estiverem posicionados corretamente

---

## 📈 Progressão

- Level único para o player (até 100)
- Todos os personagens evoluem juntos
- Atributos aumentam com o level:
  - vida
  - ataque
  - defesa

---

## 🎁 Sistema de Loot e Evolução

- Habilidades podem ser:
  - dropadas (PvE)
  - obtidas via pacotes
- Sistema de upgrade:
  - combinar habilidades iguais
  - nível máximo: 5

---

## 🏆 PvP, PvE e Ranked

### PvP
- Combate direto entre jogadores

### PvE
- Combate contra equipes NPC
- Drop de habilidades

### Ranked
- Sistema de torneios com 8 equipes
- Progressão baseada em posição final

---

## ⚔️ Sistema Offline

- Equipes podem ser atacadas até **10 vezes por dia**
- Jogador também pode atacar offline até **10 vezes por dia**

Recompensas:
- Gold (com imposto)
- Maestria:
  - ataque
  - defesa

---

## 💰 Economia

- Moedas:
  - Gold (in-game)
  - DG (Draft Gold - premium)

- Sistema com imposto para evitar inflação

---

## 🧠 Filosofia de Design

Draft Game é construído com base em:

- Clareza estratégica
- Combate justo e previsível
- Alto teto de habilidade
- Baixa aleatoriedade injusta
- Decisões rápidas com impacto alto

---

