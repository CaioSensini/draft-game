# Contributing to Draft

Obrigado pelo interesse em contribuir para o projeto **Draft**!

## 📋 Processo de Contribuição

### 1. Setup Local
```bash
cd game-client
npm install
npm run dev
```

### 2. Crie uma Branch
```bash
git checkout -b feature/sua-feature
```

### 3. Faça suas Mudanças

#### Diretrizes de Código
- Use **TypeScript strict mode** — sem `any` permitidos
- Adicione **comentários JSDoc** em funções públicas
- Siga a convenção: `camelCase` para variáveis/funções, `PascalCase` para classes/tipos
- Use **constantes** do arquivo `src/data/constants.ts` em vez de magic numbers
- Adicione **helper functions** em `src/scenes/arenaUtils.ts` se reutilizável

#### Estrutura de Commits
```
[TIPO] Descrição breve

Descrição detalhada se necessário.

- Bullet points de mudanças
- Um por linha
```

**Tipos**: `feat`, `fix`, `refactor`, `docs`, `test`, `style`, `chore`

Exemplos:
```
feat: Add healing card effect visualization
fix: Correct warrior guard reduction calculation
refactor: Extract distance calculation to utils
docs: Update game mechanics documentation
```

### 4. Teste Localmente
```bash
npm run build  # Deve passar sem erros
npm run dev    # Teste no navegador
```

### 5. Push e Create Pull Request
```bash
git push origin feature/sua-feature
```

Descreva:
- **O que**: Mudança implementada
- **Por quê**: Motivação/problema resolvido
- **Como**: Abordagem técnica

---

## 🎯 Áreas de Contribuição Bem-Vinda

### 🔴 Prioridade Alta
- [ ] Refatoração de `ArenaScene.ts` (muito grande, considerar submódulos)
- [ ] Integração com backend (quando iniciado)
- [ ] Performance optimization (chunk size warning)
- [ ] Testes unitários

### 🟠 Prioridade Média
- [ ] Novos efeitos de cartas
- [ ] Melhorias na UI/UX
- [ ] Documentação de código
- [ ] Helpers em `arenaUtils.ts`

### 🟡 Prioridade Baixa
- [ ] Cosmética (sons, animações extras)
- [ ] Suporte a diferentes resoluções
- [ ] Accessibility (a11y)

---

## 🚫 NÃO Faça

❌ Mude a **lógica de gameplay** sem discussão (combate, turnos, regras)  
❌ Adicione **dependências** novas sem justificar  
❌ Comite **console.logs** ou código de debug  
❌ Escreva código **sem tipos** (strict mode obrigatório)  
❌ Ignore **warnings do build**  

---

## 🔍 Checklist Antes de Submit

- [ ] `npm run build` passa sem **erros** (warnings OK)
- [ ] Sem `any` ou `@ts-ignore` adicionados
- [ ] Código segue **estilo do projeto**
- [ ] **Commits** são atômicos e bem-descritos
- [ ] **Documentação** atualizada se necessário
- [ ] Testado no navegador (`npm run dev`)

---

## 📚 Recursos

- [CLAUDE.md](./CLAUDE.md) — Guia geral do projeto
- [docs/game_design.md](./docs/game_design.md) — Design detalhado
- [src/types.ts](./game-client/src/types.ts) — Tipos principais
- [src/data/constants.ts](./game-client/src/data/constants.ts) — Configurações

---

## ❓ Dúvidas?

1. Abra uma **Issue** descrevendo o problema
2. Consulte `CLAUDE.md` para visão geral
3. Veja exemplos no código existente

---

**Obrigado por melhorar Draft! 🎮**
