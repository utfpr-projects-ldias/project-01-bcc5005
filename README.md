# Projeto Integrador

Projeto desenvolvido para a disciplina de **Projeto Integrador**.

O sistema web ainda será definido. Neste momento, o repositório contém somente a **base técnica** e o **ambiente de desenvolvimento** solicitado para a disciplina.

## Tecnologias

### Frontend
- Next.js
- TypeScript
- TailwindCSS

### Backend
- Node.js
- NestJS
- TypeScript

### Banco de Dados
- PostgreSQL
- TypeORM

### Autenticação e Autorização
- SuperTokens

### Testes
- Jest

### Ambiente
- Docker
- Docker Compose

---

## Estrutura

```text
.
├── frontend/
├── backend/
├── scripts/
│   └── instalar-dependencias-com-docker.sh
├── docker-compose.yml
├── .env.example
├── README.md
└── AMBIENTE-DEV.md
```

---

## Pré-requisito principal

Para executar o ambiente completo, a máquina precisa de:

- Git;
- Docker Engine;
- Docker Compose (`docker compose`).

> **Não é necessário instalar Node.js, NestJS, Next.js ou PostgreSQL diretamente na máquina.** O Docker será utilizado para isso.

Para verificar:

```bash
git --version
docker --version
docker compose version
```

Para instruções detalhadas de instalação e explicação das variáveis, consulte [`AMBIENTE-DEV.md`](./AMBIENTE-DEV.md).

---

## Primeira configuração

### 1. Clone o repositório

```bash
git clone URL_DO_REPOSITORIO
cd project-01-bcc5005
```

### 2. Crie o arquivo `.env`

```bash
cp .env.example .env
```

Abra o `.env` e troque obrigatoriamente:

```env
POSTGRES_PASSWORD=...
SUPERTOKENS_API_KEY=...
```

Os valores são explicados em detalhes em [`AMBIENTE-DEV.md`](./AMBIENTE-DEV.md).

### 3. Instale as dependências adicionais da stack

Como o projeto será dockerizado, não é necessário ter Node.js instalado localmente.

Execute:

```bash
./scripts/instalar-dependencias-com-docker.sh
```

Esse script utiliza temporariamente a imagem `node:22-alpine` para atualizar os `package.json` e `package-lock.json` do frontend e backend.

Ele instala:

```text
Frontend:
- supertokens-auth-react
- Jest
- Testing Library

Backend:
- @nestjs/typeorm
- typeorm
- pg
- supertokens-node
```

Esse passo precisa ser realizado **uma vez** na preparação inicial e os `package.json`/`package-lock.json` resultantes devem ser versionados.

### 4. Valide o Docker Compose

```bash
docker compose config
```

Se não houver erro, continue.

### 5. Suba o ambiente

```bash
docker compose up --build
```

Na primeira execução, o Docker baixa automaticamente as imagens necessárias, incluindo:

```text
node:22-alpine
postgres:17-alpine
supertokens/supertokens-postgresql:12.1.1
```

Não é necessário instalar PostgreSQL manualmente.

---

## Acessos locais

```text
Frontend:         http://localhost:3000
Backend:          http://localhost:3001
SuperTokens Core: http://localhost:3567/hello
PostgreSQL:       localhost:5432
```

O endpoint do SuperTokens deve retornar:

```text
Hello
```

---

## Verificar os serviços

```bash
docker compose ps
```

Devem existir quatro serviços:

```text
frontend
backend
database
supertokens
```

O PostgreSQL deve aparecer como `healthy` após a inicialização.

---

## Testes

### Backend

```bash
docker compose exec backend npm test
```

### Frontend

```bash
docker compose exec frontend npm test
```

---

## Testar o PostgreSQL

```bash
docker compose exec database pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Se seu terminal não possui essas variáveis carregadas, use os valores escolhidos no `.env`, por exemplo:

```bash
docker compose exec database pg_isready -U postgres -d integrador
```

O resultado esperado contém:

```text
accepting connections
```

---

## Testar o SuperTokens

```bash
curl http://localhost:3567/hello
```

Resultado esperado:

```text
Hello
```

Isso confirma que o **Core está executando**. Não significa que o login da aplicação já foi implementado.

---

## Encerrar

```bash
docker compose down
```

Os dados do PostgreSQL permanecem no volume.

Para apagar containers **e também os dados locais do banco**:

```bash
docker compose down -v
```

> Cuidado: `-v` remove o volume do PostgreSQL.

---

## Desenvolvimento diário

Depois que a configuração inicial já tiver sido concluída, normalmente basta:

```bash
docker compose up
```

O frontend e o backend utilizam volumes para hot reload.

Quando houver alteração em dependências ou Dockerfiles, use novamente:

```bash
docker compose up --build
```

---

## Branches

Branches principais:

```text
main
homolog
develop
```

Para uma nova tarefa:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/nome-da-tarefa
```

---

## Antes do commit do ambiente

Confira:

```bash
git status
```

O `.env` **não pode aparecer para commit**.

Valide:

```bash
docker compose config
docker compose up --build
docker compose ps
docker compose exec backend npm test
docker compose exec frontend npm test
curl http://localhost:3567/hello
```

Depois:

```bash
docker compose down
git add .
git status
git commit -m "chore: configura ambiente inicial de desenvolvimento"
git push -u origin SUA_BRANCH
```

---

## Observações

- Não versionar `.env`.
- Versionar `.env.example`.
- Nunca colocar senha ou chave real no `.env.example`.
- `NEXT_PUBLIC_*` é visível no navegador e nunca deve conter segredos.
- Não criar entidades ou regras de negócio antes da definição do sistema.
- Manter `synchronize: false` no TypeORM.
- O SuperTokens está preparado no ambiente, mas login/autorização reais serão implementados quando o domínio e as histórias de usuário forem definidos.
