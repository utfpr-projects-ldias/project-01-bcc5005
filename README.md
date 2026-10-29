# Sistema de Gestão de Execução Contratual

Sistema web interno para acompanhar **contratos de prestação de serviços**, suas etapas, entregáveis, atividades e evidências. A primeira etapa prioriza planejamento, execução, comprovação e rastreabilidade, **sem gestão financeira**.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zod |
| Backend | NestJS 12, TypeScript, TypeORM, `class-validator` e `class-transformer` |
| Banco e autenticação | PostgreSQL 17, SuperTokens (Core, SDK web e SDK Node.js) |
| Testes e qualidade | Jest, React Testing Library, Supertest, ESLint (frontend), Oxlint (backend) |
| Ambiente | Node.js 24 (containers Alpine), Docker Engine e Docker Compose |

## Primeira execução

**Pré-requisitos:** Git, Docker Engine e Docker Compose. Não é necessário instalar Node.js nem PostgreSQL no computador.

Na **raiz do repositório**, prepare o arquivo de ambiente:

```bash
[ -f .env ] || cp .env.example .env
openssl rand -hex 24
openssl rand -hex 32
nano .env
```

Use os dois valores gerados para preencher `POSTGRES_PASSWORD` e `SUPERTOKENS_API_KEY` no `.env`, respectivamente. **Não versione o `.env` nem substitua um arquivo já configurado.**

Inicie os serviços:

```bash
sudo systemctl start docker
docker compose config -q
docker compose up -d --build
docker compose ps
```

- Se falhar o build use docker compose down -v e depois o build denovo!

---

Em um **banco novo**, aplique as migrations e crie o primeiro Administrador:

```bash
docker compose exec backend npm run migration:run
docker compose exec backend npm run build
docker compose exec backend npm run admin:create -- rinaldi@gmail.com
```

O último comando solicita e confirma a senha no próprio terminal. Ele é executado **uma vez por banco novo** e não recria um Administrador já existente. O comando `admin:create` faz parte da **TEC07-01** e estará disponível nas outras branches depois que essa sub-issue for integrada à `develop`.

Acesse **http://localhost:3000/login**. A API NestJS fica em `http://localhost:3001`.

## Uso diário

**Iniciar:**

```bash
sudo systemctl start docker
docker compose up -d
docker compose ps
```

**Acompanhar logs:**

```bash
docker compose logs -f
```

**Reconstruir imagens** após alterações de dependências ou Dockerfiles:

```bash
docker compose up -d --build
```

**Parar o projeto e, se desejado, o Docker no Linux:**

```bash
docker compose down
sudo systemctl stop docker.socket
sudo systemctl stop docker.service
```

`docker compose down` **preserva os dados** do PostgreSQL e as contas do SuperTokens. Desligar o Docker Engine é opcional e afeta outros projetos Docker da máquina.

## Reiniciar o banco do zero — cuidado

```bash
docker compose down -v
```

**Atenção: `-v` apaga os volumes do projeto**, incluindo contratos, usuários, credenciais e sessões armazenados no banco local. Use somente quando quiser perder esses dados. Após recriar o banco, será necessário executar novamente as migrations e `admin:create`. **Não use `-v` para corrigir erros de build nem em produção.**

## Comandos úteis

```bash
# Estado e logs
docker compose ps
docker compose logs --tail=50 backend frontend database supertokens

# Migrations
docker compose exec backend npm run migration:show
docker compose exec backend npm run migration:run

# Testes do backend
docker compose exec backend npx tsc --noEmit
docker compose exec backend npm run lint
docker compose exec backend npm test -- --runInBand
docker compose exec backend npm run test:e2e -- --runInBand

# Testes do frontend
docker compose exec frontend npm run lint
docker compose exec frontend npm test
```

**Estado atual:** a autenticação e o bootstrap do Administrador já foram implementados na TEC07-01; a autorização detalhada e o bloqueio dos endpoints públicos de cadastro pertencem às TEC07-02 e TEC07-04. **Não exponha o ambiente de desenvolvimento publicamente como se essas proteções já estivessem concluídas.**
