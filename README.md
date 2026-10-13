# Projeto Integrador — ambiente de desenvolvimento

**Stack:** Next.js 16 (frontend), NestJS 12 (backend), PostgreSQL 17, SuperTokens, TypeORM, Jest e Docker Compose.

## Primeira vez nesta máquina

Requisitos: **Git, Docker Engine e Docker Compose**. Não é necessário instalar Node.js ou PostgreSQL na máquina; eles rodam nos containers.

```bash
# 1) Se você ainda não clonou, clone o repositório normalmente.
# 2) Na raiz do projeto:
[ -f .env ] || cp .env.example .env

# 3) Abra .env e configure POSTGRES_PASSWORD e SUPERTOKENS_API_KEY.
#    Use credenciais locais geradas assim (execute cada comando separadamente):
openssl rand -hex 24   # senha do PostgreSQL
openssl rand -hex 32   # chave do SuperTokens

# 4) Linux: inicie o Docker caso esteja desligado.
sudo systemctl start docker

# 5) Valide e inicie. A primeira execução já baixa imagens e inicializa o banco.
docker compose config -q
docker compose up --build
```

O `--build` constrói/reconstrói as imagens. **O `-d` é opcional:** apenas libera o terminal, não interfere na inicialização do PostgreSQL. Se preferir segundo plano, use `docker compose up -d --build` e consulte os logs com `docker compose logs -f`.

**IMPORTANTE:** não sobrescreva um `.env` existente. O `.env` não é versionado; `.env.example` é somente o modelo. Nunca publique senhas nem chaves no Git.

## Uso diário

```bash
sudo systemctl start docker    # Linux, se necessário
docker compose up             # ou: docker compose up -d
docker compose ps             # em outro terminal, se estiver acompanhando logs
```

Endereços: frontend `http://localhost:3000`, API NestJS `http://localhost:3001`, SuperTokens Core `http://localhost:3567/hello`, PostgreSQL na porta local `5432`.

Para encerrar sem apagar o banco, use `Ctrl+C` se estiver executando em primeiro plano; para remover os containers e a rede, preservando o volume do banco:

```bash
docker compose down
```

Se alterar um Dockerfile ou as dependências, use `docker compose up --build`. Ao instalar pacotes pelo container, mantenha `package.json` e `package-lock.json` no commit.

## Verificações e testes

```bash
docker compose ps
docker compose logs --tail=50 backend frontend supertokens database
curl http://localhost:3567/hello    # Hello
curl http://localhost:3001          # Hello World!

# Backend
docker compose exec backend npx tsc --noEmit
docker compose exec backend npm run build
docker compose exec backend npm run lint
docker compose exec backend npm test
docker compose exec backend npm run test:e2e

# Frontend
docker compose exec frontend npx tsc --noEmit
docker compose exec frontend npm run lint
docker compose exec frontend npm test
docker compose exec frontend npm run build

# TEC04 — migrations do TypeORM (não apaga dados)
docker compose exec backend npm run migration:show
```

O lint frontend pode apresentar avisos `no-img-element` (não são erros). O frontend pode informar `No tests found`: o Jest passou sem executar casos de teste, portanto **não** significa que telas e fluxos estão testados.

A aplicação oferece páginas de cadastro (`/cadastro`), login (`/login`) e dashboard (`/dashboard`). O SDK do SuperTokens utiliza `/auth/st` e os endpoints NestJS próprios da equipe utilizam `/auth`. O endpoint `/protected/ping` requer uma sessão válida; a proteção de navegação do dashboard deverá ser implementada separadamente.

## PostgreSQL: como evitar erros de senha

O banco usa o volume Docker `postgres_data`, persistente mesmo após `docker compose down` **ou após apagar a pasta do Git**. A senha definida no `.env` só é usada para criar o usuário na **primeira inicialização daquele volume**.

- **Primeiro clone com volume novo:** ajuste o `.env` antes de `docker compose up --build`; não é preciso `down -v`.
- **Reinicializações:** mantenha `POSTGRES_PASSWORD` estável. `--build` não apaga nem troca a senha do banco.
- **Erro `password authentication failed` depois de mudar o `.env`:** volte à senha original desse volume ou altere a senha no banco de forma controlada. Não adianta apenas reconstruir as imagens.
- **Você realmente quer um banco local vazio?** `docker compose down -v` remove o volume e **apaga todos os dados locais**, inclusive usuários e sessões do SuperTokens. Use apenas quando a perda for aceitável; nunca em produção.
- **Novo clone na mesma máquina:** pode reaproveitar o volume antigo se o nome do projeto Compose for igual. Caso queira isolar clones, defina `COMPOSE_PROJECT_NAME=um_nome_local_unico` no `.env` **antes da primeira subida**.

O healthcheck do PostgreSQL testa uma conexão autenticada (`SELECT 1` via TCP), portanto uma senha incompatível deixa o banco `unhealthy` em vez de permitir que os demais serviços avancem com uma configuração inválida.

## Dependências e problemas comuns

```bash
# Exemplo: com o frontend já em execução, adicionar uma dependência
docker compose exec frontend npm install PACOTE

# Se o container não estiver rodando, inicie antes de usar exec
docker compose up -d

# Ver logs em tempo real
docker compose logs -f
```

- `Cannot connect to Docker daemon`: inicie o Docker (`sudo systemctl start docker`).
- `service "frontend" is not running`: inicie os serviços antes de `docker compose exec`.
- Mudou `.env` com containers em execução? Use `docker compose up -d --force-recreate` para atualizar o ambiente dos containers, **mas isso não muda a senha interna de um PostgreSQL já inicializado**.
- Se for executar `next build` e `next dev` ao mesmo tempo no mesmo container, prefira parar temporariamente o frontend de desenvolvimento; ambos podem concorrer pelos artefatos da pasta `.next`.
- Não execute `npm audit fix --force` sem avaliar as alterações e o impacto sobre as versões do projeto.
