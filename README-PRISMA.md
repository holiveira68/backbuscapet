# 🐾 Buscapet — Backend com Prisma

Backend Node.js + Express com **Prisma ORM** substituindo o `mysql2` com queries SQL manuais.

---

## O que mudou

| Antes (mysql2) | Agora (Prisma) |
|---|---|
| `pool.query('SELECT * FROM pets WHERE...')` | `prisma.pet.findMany({ where: {...} })` |
| SQL manual em strings | API tipada com autocompletar |
| `schema.sql` DDL manual | `prisma/schema.prisma` declarativo |
| Sem migrações versionadas | `prisma migrate` com histórico |
| `mysql2` + pool manual | `PrismaClient` singleton |

---

## Estrutura

```
backend/
├── server.js              ← API Express completa (auth + pets + matches + cron)
├── matcher.js             ← Motor de matching reescrito com Prisma
├── package.json           ← Dependências (@prisma/client, express, etc.)
│
├── lib/
│   └── prisma.js          ← Singleton do PrismaClient
│
├── prisma/
│   ├── schema.prisma      ← Modelos: User, Pet, Match, MatchRun + Enums
│   └── seed.js            ← Dados de exemplo (usuário demo + 8 pets)
│
└── config/
    └── .env.example       ← Template de variáveis de ambiente
```

---

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar o .env

```bash
cp config/.env.example .env
```

Edite o `.env` — a variável mais importante é a `DATABASE_URL`:

```env
DATABASE_URL="mysql://root:sua_senha@localhost:3306/buscapet"
JWT_SECRET=string-longa-e-aleatoria
ADMIN_KEY=buscapet-admin
```

Gere um JWT_SECRET seguro:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Criar o banco e sincronizar o schema

```bash
# Cria o banco "buscapet" se não existir e aplica o schema
npx prisma db push

# OU em produção, use migrações versionadas:
npx prisma migrate deploy
```

### 4. Inserir dados de exemplo

```bash
node prisma/seed.js
# Cria: demo@buscapet.com / Demo@123 + 8 pets de exemplo
```

### 5. Iniciar a API

```bash
npm start          # produção
npm run dev        # desenvolvimento com nodemon (hot-reload)
```

### 6. Verificar

```bash
curl http://localhost:3001/api/health
# { "status": "ok", "db": "connected", "orm": "prisma", "last_cron": "..." }
```

---

## Comandos Prisma úteis

| Comando | O que faz |
|---|---|
| `npm run db:push` | Sincroniza o schema com o banco (desenvolvimento) |
| `npm run db:migrate` | Aplica migrações em produção |
| `npm run db:studio` | Abre o Prisma Studio (GUI visual do banco) |
| `npm run db:generate` | Regenera o Prisma Client após alterar o schema |
| `npm run db:seed` | Insere os dados de exemplo |

---

## Prisma Studio

Interface visual para navegar e editar os dados do banco direto no browser:

```bash
npm run db:studio
# Abre em http://localhost:5555
```

---

## Modelos

```prisma
User      → Contas de usuários
Pet       → Animais lost/found com relação para User
Match     → Pares detectados com score, relação dupla para Pet
MatchRun  → Log de execuções do motor de matching
```

---

*A API REST e os contratos de request/response são idênticos à versão anterior com mysql2 — o frontend não precisa de nenhuma alteração.*
