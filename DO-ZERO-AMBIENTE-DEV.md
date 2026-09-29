# DO-ZERO-AMBIENTE-DEV — criar todo o ambiente a partir das pastas vazias

Este guia assume que inicialmente existe apenas:

```text
.
├── frontend/
├── backend/
├── README.md
├── AMBIENTE-DEV.md
└── DO-ZERO-AMBIENTE-DEV.md
```

As pastas `frontend/` e `backend/` estão vazias.

A ideia é montar manualmente toda a base exigida pelo professor, **sem instalar Node.js ou PostgreSQL diretamente na máquina**.

---

# 1. Entrar na raiz do projeto

Exemplo:

```bash
cd ~/Documents/projetos/project-01-bcc5005
```

Confirme:

```bash
pwd
ls
```

Você deve ver pelo menos:

```text
frontend
backend
README.md
AMBIENTE-DEV.md
DO-ZERO-AMBIENTE-DEV.md
```

---

# 2. Verificar Docker

```bash
docker --version
docker compose version
```

Se o Docker estiver parado:

```bash
sudo systemctl start docker
```

Confira:

```bash
docker ps
```

Se esse comando funcionar, continue.

---

# 3. Criar o frontend Next.js dentro da pasta vazia

Como não queremos instalar Node.js diretamente na máquina, vamos executar o gerador do Next.js dentro de um container Node temporário.

Na **raiz do projeto**:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$PWD/frontend:/app" \
  -w /app \
  node:22-alpine \
  npx create-next-app@latest . \
    --typescript \
    --tailwind \
    --eslint \
    --app \
    --src-dir \
    --use-npm \
    --yes
```

Depois confira:

```bash
ls frontend
```

Agora a pasta terá arquivos do Next.js, como:

```text
frontend/
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.ts
├── src/
└── ...
```

Esses arquivos são normais: eles são criados pelo próprio Next.js.

---

# 4. Instalar SuperTokens e Jest no frontend

Ainda na raiz:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$PWD/frontend:/app" \
  -w /app \
  node:22-alpine \
  sh -c 'npm install supertokens-auth-react && npm install -D jest jest-environment-jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @types/jest'
```

Isso altera:

```text
frontend/package.json
frontend/package-lock.json
```

Não existe script separado: esse comando é executado manualmente apenas durante a preparação inicial.

---

# 5. Configurar Jest no frontend

Crie:

```text
frontend/jest.config.ts
```

Conteúdo:

```ts
import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};

export default createJestConfig(config);
```

Crie também:

```text
frontend/jest.setup.ts
```

Conteúdo:

```ts
import '@testing-library/jest-dom';
```

Adicione um comando `test` ao `package.json` do frontend.

Você pode fazer isso sem editar manualmente o JSON:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$PWD/frontend:/app" \
  -w /app \
  node:22-alpine \
  npm pkg set 'scripts.test=jest --passWithNoTests'
```

---

# 6. Criar o backend NestJS dentro da pasta vazia

Na raiz do projeto:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$PWD/backend:/app" \
  -w /app \
  node:22-alpine \
  npx @nestjs/cli@latest new . \
    --package-manager npm \
    --skip-git
```

Se a CLI solicitar confirmação, aceite a criação do projeto.

Depois:

```bash
ls backend
```

Você deve encontrar arquivos como:

```text
backend/
├── package.json
├── package-lock.json
├── src/
├── test/
├── tsconfig.json
└── ...
```

Esses arquivos são gerados normalmente pelo NestJS.

O NestJS já traz a configuração básica de Jest para o backend.

---

# 7. Instalar TypeORM, PostgreSQL e SuperTokens no backend

Na raiz:

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -v "$PWD/backend:/app" \
  -w /app \
  node:22-alpine \
  npm install @nestjs/typeorm typeorm pg supertokens-node
```

Isso atualiza:

```text
backend/package.json
backend/package-lock.json
```

---

# 8. Configurar a porta e CORS do NestJS

Abra:

```text
backend/src/main.ts
```

Deixe:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3001);
}

bootstrap();
```

O backend ficará em:

```text
http://localhost:3001
```

---

# 9. Configurar TypeORM

Abra:

```text
backend/src/app.module.ts
```

Deixe:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

Por enquanto:

```text
synchronize: false
```

e nenhuma entidade de domínio precisa ser criada.

---

# 10. Criar o Dockerfile do frontend

Crie:

```text
frontend/Dockerfile.dev
```

Conteúdo:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0"]
```

---

# 11. Criar o Dockerfile do backend

Crie:

```text
backend/Dockerfile.dev
```

Conteúdo:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3001

CMD ["npm", "run", "start:dev"]
```

---

# 12. Criar `.gitignore` na raiz

Crie:

```text
.gitignore
```

Conteúdo:

```gitignore
.env
.env.local

node_modules/
.next/
dist/
coverage/

*.log
```

O `.env` real nunca deve ser enviado ao Git.

---

# 13. Criar `.env.example`

Crie na raiz:

```text
.env.example
```

Conteúdo:

```env
PORT=3001
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001

POSTGRES_USER=postgres
POSTGRES_DB=integrador
POSTGRES_PASSWORD=CHANGE_ME

SUPERTOKENS_IMAGE=supertokens/supertokens-postgresql:12.1.1
SUPERTOKENS_API_KEY=CHANGE_ME
```

O `.env.example` pode ir para o Git porque as duas credenciais são apenas placeholders.

---

# 14. Criar o `.env` local

Copie:

```bash
cp .env.example .env
```

Agora o arquivo:

```text
.env
```

é exclusivo da sua máquina.

---

# 15. Gerar a senha local do PostgreSQL

Não existe token ou senha que você precise buscar em um site.

Gere:

```bash
openssl rand -hex 24
```

Copie a saída.

Abra o `.env` e substitua:

```env
POSTGRES_PASSWORD=CHANGE_ME
```

por:

```env
POSTGRES_PASSWORD=VALOR_QUE_VOCE_GEROU
```

Cada colega pode gerar uma senha diferente para o próprio banco local.

---

# 16. Gerar a chave local do SuperTokens

Execute:

```bash
openssl rand -hex 32
```

Copie a saída.

No `.env`, substitua:

```env
SUPERTOKENS_API_KEY=CHANGE_ME
```

por:

```env
SUPERTOKENS_API_KEY=VALOR_QUE_VOCE_GEROU
```

A chave real também não vai para o Git.

---

# 17. Criar o `docker-compose.yml`

Na raiz, crie:

```text
docker-compose.yml
```

Conteúdo:

```yaml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    environment:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
    depends_on:
      - backend

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "3001:3001"
    volumes:
      - ./backend:/app
      - /app/node_modules
    environment:
      PORT: ${PORT}
      FRONTEND_URL: ${FRONTEND_URL}
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@database:5432/${POSTGRES_DB}
      SUPERTOKENS_CONNECTION_URI: http://supertokens:3567
      SUPERTOKENS_API_KEY: ${SUPERTOKENS_API_KEY}
    depends_on:
      database:
        condition: service_healthy
      supertokens:
        condition: service_started

  database:
    image: postgres:17-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  supertokens:
    image: ${SUPERTOKENS_IMAGE}
    ports:
      - "127.0.0.1:3567:3567"
    environment:
      POSTGRESQL_CONNECTION_URI: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@database:5432/${POSTGRES_DB}
      POSTGRESQL_TABLE_NAMES_PREFIX: st_
      API_KEYS: ${SUPERTOKENS_API_KEY}
    depends_on:
      database:
        condition: service_healthy

volumes:
  postgres_data:
```

---

# 18. Entender de onde vêm as variáveis

Exemplo:

```yaml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

O `${POSTGRES_PASSWORD}` vem do `.env` da sua máquina.

O Docker Compose lê o `.env` e passa o valor para o container.

O `.env.example` não é lido como senha real. Ele serve apenas de modelo.

---

# 19. Estrutura esperada depois da preparação

Agora o projeto ficará aproximadamente:

```text
.
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── package-lock.json
│   ├── jest.config.ts
│   ├── jest.setup.ts
│   ├── Dockerfile.dev
│   └── ...
│
├── backend/
│   ├── src/
│   ├── test/
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile.dev
│   └── ...
│
├── .env
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
├── AMBIENTE-DEV.md
└── DO-ZERO-AMBIENTE-DEV.md
```

Os `...` representam arquivos normais gerados automaticamente pelo Next.js ou NestJS.

---

# 20. Validar o Compose

Antes de subir:

```bash
docker compose config
```

Se não houver erro, continue.

---

# 21. Subir todo o ambiente

Primeira execução:

```bash
docker compose up --build
```

Ou em segundo plano:

```bash
docker compose up --build -d
```

Na primeira vez pode demorar porque o Docker precisa baixar imagens e construir frontend/backend.

---

# 22. Verificar os quatro serviços

```bash
docker compose ps
```

Você deverá encontrar:

```text
frontend
backend
database
supertokens
```

---

# 23. Testar frontend

Abra:

```text
http://localhost:3000
```

Ou:

```bash
curl -I http://localhost:3000
```

---

# 24. Testar backend

```bash
curl http://localhost:3001
```

---

# 25. Testar PostgreSQL

```bash
docker compose exec database pg_isready -U postgres -d integrador
```

Esperado:

```text
accepting connections
```

---

# 26. Testar SuperTokens Core

```bash
curl http://localhost:3567/hello
```

Esperado:

```text
Hello
```

---

# 27. Testar Jest do backend

```bash
docker compose exec backend npm test
```

---

# 28. Testar Jest do frontend

Como o projeto pode ainda não possuir testes reais:

```bash
docker compose exec frontend npm test
```

O script foi configurado com `--passWithNoTests`, então a ausência de testes não deve causar falha apenas por não existir nenhum arquivo de teste.

---

# 29. Testar hot reload

Com o Compose executando, altere algum texto da página inicial do Next.js.

Salve.

Atualize:

```text
http://localhost:3000
```

A mudança deve aparecer sem reconstruir manualmente a imagem.

Faça também uma pequena alteração em uma resposta do NestJS e salve.

O `start:dev` deve reiniciar o backend automaticamente.

---

# 30. Encerrar o projeto

```bash
docker compose down
```

Isso encerra os containers, mas mantém o volume do PostgreSQL.

---

# 31. Parar o Docker Engine

Quando terminar de trabalhar:

```bash
sudo systemctl stop docker
```

Se quiser também impedir reativação por socket:

```bash
sudo systemctl stop docker.socket
```

---

# 32. Não usar `down -v` como rotina

Não faça normalmente:

```bash
docker compose down -v
```

O `-v` remove o volume e apaga o banco PostgreSQL local.

Use somente quando realmente quiser recriar o banco do zero.

---

# 33. Conferir antes do commit

```bash
git status
```

O `.env` não deve aparecer para commit.

Devem poder ser versionados:

```text
.env.example
.gitignore
docker-compose.yml
frontend/package.json
frontend/package-lock.json
frontend/Dockerfile.dev
frontend/jest.config.ts
frontend/jest.setup.ts
backend/package.json
backend/package-lock.json
backend/Dockerfile.dev
backend/src/main.ts
backend/src/app.module.ts
README.md
AMBIENTE-DEV.md
DO-ZERO-AMBIENTE-DEV.md
```

---

# 34. Commit

```bash
git add .
git status
```

Depois:

```bash
git commit -m "chore: configura ambiente inicial de desenvolvimento"
```

Push:

```bash
git push -u origin SUA_BRANCH
```

Depois abra Pull Request para `develop`.

---

# 35. Rotina depois que a preparação inicial estiver pronta

Você não precisa repetir a criação do Next, Nest ou os `npm install` toda vez.

Depois que `package.json` e `package-lock.json` estiverem versionados, o uso normal é:

```bash
sudo systemctl start docker
docker compose up -d
```

Trabalhe normalmente.

Ao terminar:

```bash
docker compose down
sudo systemctl stop docker
```

---

# 36. Resumo do processo do zero

```text
pastas frontend/ e backend/ vazias
        ↓
criar Next.js usando node:22-alpine
        ↓
instalar SuperTokens + Jest no frontend
        ↓
criar NestJS usando node:22-alpine
        ↓
instalar TypeORM + pg + SuperTokens no backend
        ↓
configurar NestJS + TypeORM
        ↓
criar Dockerfiles
        ↓
criar .env.example
        ↓
copiar para .env
        ↓
gerar senha PostgreSQL
        ↓
gerar chave SuperTokens
        ↓
criar docker-compose.yml
        ↓
docker compose config
        ↓
docker compose up --build
        ↓
testar tudo
        ↓
commit
```

A partir daí, o ambiente técnico inicial está preparado.
