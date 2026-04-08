# Setup do Banco de Dados - PostgreSQL Local

## 1. Instalar PostgreSQL

1. Baixe o instalador em: https://www.postgresql.org/download/windows/
2. Execute o instalador e siga os passos:
   - Marque todos os componentes (PostgreSQL Server, pgAdmin, Command Line Tools)
   - Defina a senha do usuario `postgres` como: **postgres**
   - Mantenha a porta padrão: **5432**
   - Clique em "Next" até finalizar

## 2. Criar o banco de dados

Abra o terminal (PowerShell ou CMD) e execute:

```bash
# Conectar ao PostgreSQL
psql -U postgres

# Dentro do psql, criar o banco:
CREATE DATABASE draft_game;

# Verificar que foi criado:
\l

# Sair:
\q
```

Ou se preferir usar o **pgAdmin** (interface gráfica):
1. Abra o pgAdmin 4
2. Conecte no server "PostgreSQL" com senha `postgres`
3. Clique com botão direito em "Databases" → "Create" → "Database"
4. Nome: `draft_game` → Save

## 3. Configurar o backend

O arquivo `backend_api/.env` já está configurado com:
```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=draft_game
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
JWT_SECRET=draft-game-secret-key-2026
JWT_EXPIRATION=7d
```

Se sua senha do PostgreSQL for diferente de `postgres`, altere no `.env`.

## 4. Iniciar o backend

```bash
cd backend_api
npm install       # primeira vez
npm run start:dev # inicia em modo desenvolvimento
```

O backend vai:
- Conectar no PostgreSQL automaticamente
- Criar as tabelas automaticamente (TypeORM synchronize)
- Rodar na porta 3000

## 5. Iniciar o jogo

Em outro terminal:
```bash
cd game-client
npm run dev
```

Abra http://localhost:5173 no navegador.

## 6. Testar

1. Na tela de login, clique em "Registrar"
2. Preencha username, email e senha
3. Clique em "Criar Conta"
4. Se tudo estiver certo, vai entrar no Lobby

## Problemas comuns

### "Erro ao conectar"
- Verifique se o backend está rodando (`npm run start:dev`)
- Verifique se o PostgreSQL está rodando (Services → postgresql)

### "connection refused" no backend
- Verifique se o PostgreSQL está instalado e rodando
- Verifique a senha no `.env`
- Verifique se o banco `draft_game` foi criado

### "relation does not exist"
- O TypeORM cria as tabelas automaticamente na primeira vez
- Se não criar, reinicie o backend
