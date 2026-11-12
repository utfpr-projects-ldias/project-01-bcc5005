# Backend — Sistema de Gestão de Execução Contratual

Backend do Projeto Integrador (BCC5005), desenvolvido com **NestJS**, **TypeScript**, **TypeORM** e **PostgreSQL**. O ambiente de desenvolvimento é executado com **Docker Compose** e utiliza **SuperTokens Core** como serviço separado de autenticação.

> **Leia primeiro o [`README.md` da raiz do repositório](../README.md)** para instalar o ambiente, configurar o `.env`, iniciar o Docker e conhecer os demais serviços. Este documento explica especificamente o **backend** e os **comandos de migrations** preparados na TEC04.

## 1. Tecnologias e responsabilidades

| Componente | Função |
|---|---|
| NestJS + TypeScript | API HTTP da aplicação |
| TypeORM + `pg` | Acesso ao PostgreSQL e migrations |
| PostgreSQL 17 | Persistência dos dados |
| SuperTokens Core | Infraestrutura de autenticação, em container separado |
| Jest | Testes automatizados |
| Oxlint | Análise estática de código |
| Docker Compose | Execução integrada em desenvolvimento |

No ambiente Docker, o backend é acessível em **http://localhost:3001**. O processo NestJS escuta na porta `3001` definida pela variável `PORT`.

## 2. Estrutura relevante

```text
backend/
├── Dockerfile.dev
├── package.json
├── package-lock.json
├── README.md
└── src/
    ├── main.ts                  # Inicialização do NestJS
    ├── app.module.ts            # Módulo e conexão TypeORM da aplicação
    └── database/
        ├── data-source.ts       # DataSource utilizado pela CLI do TypeORM
        └── migrations/          # Migrations versionadas no Git
            └── .gitkeep
```

O `app.module.ts` configura o TypeORM durante a execução do NestJS. O `src/database/data-source.ts` fornece a conexão à **CLI de migrations**. Ambos utilizam a mesma variável `DATABASE_URL`.

**Regra obrigatória:** manter `synchronize: false`. As mudanças de esquema devem ser aplicadas por migrations explícitas, e não automaticamente ao subir a aplicação.

## 3. Preparar e iniciar o ambiente

Os comandos abaixo devem ser executados **na raiz do repositório**, onde está `docker-compose.yml` — não dentro de `backend/`.

Na **primeira instalação**, siga o README da raiz: crie `.env` a partir de `.env.example`, gere as credenciais locais, valide o Compose e construa o ambiente. O `.env` não deve ser versionado.

No uso diário, caso o Docker Engine esteja desligado no Linux:

```bash
sudo systemctl start docker
```

Suba os serviços:

```bash
docker compose up -d
```

Verifique:

```bash
docker compose ps
```

Na **primeira execução** ou quando houver alterações de Dockerfile/dependências que exijam reconstrução:

```bash
docker compose up -d --build
```

Não é necessário fazer `--build` apenas por editar scripts no `backend/package.json`, pois o Compose de desenvolvimento monta a pasta `./backend` em `/app`.

Consulte os logs:

```bash
docker compose logs --tail=80 backend
```

Verifique a API inicial:

```bash
curl http://localhost:3001
```

## 4. Migrations do TypeORM (TEC04)

Uma **migration** é um arquivo versionado que representa uma mudança controlada no esquema do banco (por exemplo, criar ou alterar uma tabela). Cada integrante da equipe executa as migrations pendentes no seu próprio banco local.

Fluxo previsto para futuras funcionalidades:

```text
Criar/alterar uma Entity (*.entity.ts)
         ↓
Gerar e revisar uma migration (*.ts)
         ↓
Versionar Entity + migration no Git
         ↓
Executar migration:run em cada ambiente
         ↓
Banco atualizado de forma controlada
```

**Nesta TEC04, não foram criadas entidades ou migrations de domínio.** A primeira migration real deve acompanhar a primeira entidade de uma funcionalidade futura.

### 4.1. Scripts disponíveis

Os scripts estão definidos em `backend/package.json`. Execute sempre **na raiz do repositório**:

| Ação | Comando |
|---|---|
| Listar migrations e seu estado | `docker compose exec backend npm run migration:show` |
| Executar migrations pendentes | `docker compose exec backend npm run migration:run` |
| Reverter a última migration executada | `docker compose exec backend npm run migration:revert` |

**Listar:**

```bash
docker compose exec backend npm run migration:show
```

**Aplicar as pendentes:**

```bash
docker compose exec backend npm run migration:run
```

Se não houver migrations pendentes, a saída esperada é:

```text
No migrations are pending
```

O TypeORM pode manter uma tabela interna chamada `migrations` para registrar o histórico de execução. Ela não é uma tabela do domínio de contratos.

**Reverter (usar apenas quando necessário):**

```bash
docker compose exec backend npm run migration:revert
```

> **Atenção:** `migration:revert` altera o banco de dados, executando o método `down` da última migration aplicada. Não é necessário executá-lo nesta TEC04, porque ainda não existem migrations reais para reverter.

### 4.2. Gerar uma migration a partir das entidades

Quando uma funcionalidade futura introduzir ou modificar entidades TypeORM:

```bash
docker compose exec backend \
  npm run typeorm -- \
  migration:generate \
  ./src/database/migrations/NomeDaMigration \
  -d ./src/database/data-source.ts
```

O TypeORM compara as entidades encontradas pelo DataSource com o esquema atual do PostgreSQL e gera um arquivo `.ts` em `src/database/migrations/`.

**Revise o SQL gerado antes de executar `migration:run`.** Se não houver diferenças entre as entidades e o banco, o comando pode informar que não existem mudanças; isso não exige criar uma migration artificial.

### 4.3. Criar uma migration manualmente

Se for necessário escrever as operações manualmente, crie um arquivo base:

```bash
docker compose exec backend \
  npm run typeorm -- \
  migration:create \
  ./src/database/migrations/NomeDaMigration
```

Depois, implemente e revise os métodos `up` e `down` conforme a alteração necessária. **Este comando cria apenas um arquivo-base**, não modifica o banco.

### 4.4. Regras para a equipe

- Versione as migrations junto com as respectivas entidades ou alterações de esquema.
- Mantenha `synchronize: false` tanto no `AppModule` quanto no DataSource da CLI.
- Não crie tabelas manualmente se a alteração faz parte de uma migration do projeto.
- Não use migrations TypeORM para modificar as tabelas internas do **SuperTokens Core**; o serviço gerencia essas tabelas separadamente (no Compose atual, com prefixo `st_`).
- Após atualizar uma branch que contenha **novas migrations**, execute `migration:run` no banco local e confira o resultado.
- **Não execute `migration:revert` automaticamente** após um `git pull`: a reversão é uma operação deliberada.

## 5. Validações do backend

Os comandos abaixo já foram utilizados na TEC04-02. Eles não exigem reconstruir o Docker, desde que os containers estejam funcionando.

**TypeScript:**

```bash
docker compose exec backend npx tsc --noEmit
```

**Build do NestJS:**

```bash
docker compose exec backend npm run build
```

**Testes unitários:**

```bash
docker compose exec backend npm test
```

**Lint:**

```bash
docker compose exec backend npm run lint
```

**Verificar os comandos registrados:**

```bash
docker compose exec backend npm run
```

**Testes E2E (quando aplicável):**

```bash
docker compose exec backend npm run test:e2e
```

A execução inicial da TEC04-02 confirmou que `migration:show` funciona, `migration:run` informa `No migrations are pending`, o TypeScript e o build passam, o teste unitário existente passa e o Oxlint termina sem avisos ou erros. Isso **não substitui** testes de migrations reais que venham a ser criadas futuramente.

## 6. Problemas comuns

### `password authentication failed for user "postgres"` (`28P01`)

O banco pode estar marcado como `healthy` e, ainda assim, rejeitar a senha da aplicação. Isso ocorre, por exemplo, se o volume PostgreSQL foi inicializado com uma senha antiga e o `.env` foi alterado posteriormente.

Confira os logs:

```bash
docker compose logs --tail=80 backend supertokens
```

**Não use `docker compose down -v` para corrigir esse erro:** isso removeria o volume com os dados do banco.

Se houver divergência confirmada, é possível entrar no `psql` local do container:

```bash
docker compose exec database psql -U postgres -d postgres
```

E redefinir a senha do usuário:

```text
\password postgres
```

Informe a mesma senha configurada no `.env` da raiz e saia com `\q`. Esse procedimento só deve ser executado quando a divergência de credenciais estiver confirmada. Nunca publique o `.env` nem a URL contendo a senha.

### `DATABASE_URL não foi definida`

Verifique se existe um `.env` na **raiz** do projeto e se os serviços foram criados com a configuração atual. O backend recebe `DATABASE_URL` pelo Compose. Não substitua o host `database` por `localhost` dentro do container.

### `Cannot find module` ao utilizar a CLI

Confirme a existência de `backend/src/database/data-source.ts` e a disponibilidade do `ts-node`:

```bash
docker compose exec backend npm ls ts-node
```

O projeto usa ESM (`"type": "module"`), por isso o script da CLI utiliza `typeorm-ts-node-esm`.

### `migration:show` ou `migration:run` não existe

Confira se `backend/package.json` contém os scripts e se está executando o comando no serviço correto:

```bash
docker compose exec backend npm run
```

### Alteração no `package-lock.json` após atualizar a branch

Em um ambiente já existente, pode ser necessário sincronizar as dependências instaladas no volume de `node_modules` do backend:

```bash
docker compose exec backend npm ci
```

Depois reinicie o serviço, se necessário:

```bash
docker compose restart backend
```

Não é necessário reinstalar dependências a cada mudança de branch; apenas quando o ambiente instalado estiver desatualizado em relação ao lockfile.

## 7. Encerrar o ambiente

Na **raiz do repositório**:

```bash
docker compose down
```

Esse comando remove os containers e a rede do projeto, mas **preserva o volume PostgreSQL**. Evite `docker compose down -v`, exceto se realmente desejar apagar os dados e reinicializar o banco.

Para detalhes sobre iniciar ou desligar o Docker Engine manualmente, consulte o README principal na raiz do repositório.
