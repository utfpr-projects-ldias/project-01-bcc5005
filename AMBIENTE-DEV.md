# AMBIENTE-DEV — explicações do ambiente de desenvolvimento

Este documento serve como **guia de consulta**. Para criar todos os arquivos do projeto partindo das pastas `frontend/` e `backend/` vazias, siga primeiro o arquivo [`DO-ZERO-AMBIENTE-DEV.md`](./DO-ZERO-AMBIENTE-DEV.md).

---

# 1. Stack

```text
Frontend        → Next.js
Backend         → NestJS
Banco           → PostgreSQL
ORM             → TypeORM
Autenticação    → SuperTokens
Testes          → Jest
Ambiente        → Docker + Docker Compose
```

Arquitetura esperada:

```text
Navegador
   ↓
Next.js :3000
   ↓ HTTP
NestJS :3001
   ├──────────→ SuperTokens Core :3567
   ↓
TypeORM
   ↓
PostgreSQL :5432
```

---

# 2. O que precisa estar instalado diretamente na máquina?

Para este fluxo dockerizado, o essencial é:

```text
Git
Docker Engine
Docker Compose
```

Você não precisa instalar diretamente na máquina:

```text
Node.js
Next.js
NestJS
PostgreSQL
SuperTokens Core
```

O Node.js será usado por meio da imagem:

```text
node:22-alpine
```

O PostgreSQL será executado pela imagem:

```text
postgres:17-alpine
```

E o SuperTokens Core pela imagem:

```text
supertokens/supertokens-postgresql:12.1.1
```

---

# 3. Iniciar Docker somente quando for usar

Verifique:

```bash
docker --version
docker compose version
```

Inicie o Docker:

```bash
sudo systemctl start docker
```

Confira:

```bash
sudo systemctl status docker
```

Esperado:

```text
Active: active (running)
```

Não é necessário usar:

```bash
sudo systemctl enable docker
```

se você não quer que o Docker inicie automaticamente junto com o computador.

---

# 4. Docker Engine e Docker Compose

O Docker Engine é o serviço principal que executa containers.

O Docker Compose lê o `docker-compose.yml` e organiza os containers do projeto.

Neste projeto:

```text
Docker Engine
    ↓
Docker Compose
    ├── frontend
    ├── backend
    ├── database
    └── supertokens
```

`docker compose down` encerra os containers deste projeto.

Ele **não** desliga o Docker Engine.

---

# 5. Encerrar o ambiente

Primeiro:

```bash
docker compose down
```

Depois, se terminou de usar Docker:

```bash
sudo systemctl stop docker
```

Se quiser impedir também ativação pelo socket:

```bash
sudo systemctl stop docker.socket
```

Não use como rotina:

```bash
docker compose down -v
```

O `-v` remove os volumes, inclusive os dados locais do PostgreSQL.

---

# 6. `.env.example` e `.env`

## `.env.example`

É um modelo versionado no Git.

Ele informa quais variáveis precisam existir, mas não contém segredos reais.

Exemplo:

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

## `.env`

É a cópia local com os valores reais:

```bash
cp .env.example .env
```

O `.env` não deve ir para o Git.

---

# 7. De onde vem a senha do PostgreSQL?

A senha **não vem pronta** do Docker, PostgreSQL ou Dockerfile.

Cada desenvolvedor gera sua própria senha local.

Exemplo:

```bash
openssl rand -hex 24
```

A saída é colocada no `.env`:

```env
POSTGRES_PASSWORD=VALOR_GERADO
```

Fluxo:

```text
.env.example
    ↓ cópia
.env
    ↓ recebe a senha gerada localmente
docker-compose.yml
    ↓ passa POSTGRES_PASSWORD
PostgreSQL
    ↓ utiliza na primeira criação do banco
```

Normalmente os colegas **não precisam compartilhar a mesma senha** em desenvolvimento local.

Cada integrante pode ter:

```text
Lucas     → senha A → banco local A
Colega 1  → senha B → banco local B
Colega 2  → senha C → banco local C
```

Todos usam o mesmo código porque o projeto lê a senha da variável `POSTGRES_PASSWORD`.

---

# 8. O PostgreSQL já vem com senha padrão?

Neste projeto, não dependemos de uma senha padrão.

O `docker-compose.yml` passa explicitamente:

```yaml
POSTGRES_USER: ${POSTGRES_USER}
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
POSTGRES_DB: ${POSTGRES_DB}
```

Os valores vêm do `.env`.

A senha não fica no Dockerfile.

---

# 9. O que acontece quando PostgreSQL é criado?

Na primeira execução com um volume vazio:

```text
.env
 ↓
Docker Compose
 ↓
postgres:17-alpine
 ↓
cria usuário
cria banco
define senha
 ↓
postgres_data
```

O volume `postgres_data` guarda os dados do banco.

---

# 10. Atenção ao trocar a senha do PostgreSQL

A senha usada na primeira inicialização fica associada ao usuário criado dentro do banco armazenado no volume.

Por isso:

```bash
docker compose down
docker compose up
```

não cria um banco novo. O volume existente é reutilizado e a senha do banco continua a mesma.

Se você mudar apenas:

```env
POSTGRES_PASSWORD=nova_senha
```

o backend passará a tentar usar a nova senha, mas o PostgreSQL já existente poderá continuar esperando a senha antiga.

Durante o começo do projeto, quando não existem dados importantes, você pode recriar o banco:

```bash
docker compose down -v
docker compose up --build
```

O `-v` apaga o volume. No próximo `up`, o PostgreSQL cria tudo novamente usando a senha atualmente existente no `.env`.

Quando houver dados importantes, não se deve apagar o volume apenas para trocar a senha. A senha deve ser alterada no próprio PostgreSQL e o segredo usado pela aplicação deve ser atualizado.

Em produção, a regra é a mesma: não se destrói o banco para trocar uma senha. A credencial é alterada no banco/infraestrutura e o segredo da aplicação é atualizado de forma segura.

---

# 11. De onde vem a chave do SuperTokens?

Para este ambiente self-hosted básico, não é necessário buscar um token em uma conta externa.

Gere localmente:

```bash
openssl rand -hex 32
```

Coloque no `.env`:

```env
SUPERTOKENS_API_KEY=VALOR_GERADO
```

Não coloque a chave real no `.env.example` nem no Git.

---

# 12. Quais variáveis podem aparecer no Git?

| Variável | `.env.example` | Valor real no Git? | Navegador? |
|---|---:|---:|---:|
| `PORT` | Sim | Sim | Não precisa |
| `FRONTEND_URL` | Sim | Sim | Não precisa |
| `NEXT_PUBLIC_API_URL` | Sim | Sim | Sim |
| `POSTGRES_USER` | Sim | Sim, se genérico | Não |
| `POSTGRES_DB` | Sim | Sim | Não |
| `POSTGRES_PASSWORD` | Placeholder | Não | Não |
| `SUPERTOKENS_IMAGE` | Sim | Sim | Não |
| `SUPERTOKENS_API_KEY` | Placeholder | Não | Não |

Variáveis Next.js iniciadas com:

```text
NEXT_PUBLIC_
```

podem chegar ao navegador e devem ser consideradas públicas.

---

# 13. Quem cria as imagens Docker?

Você não precisa baixar manualmente.

Ao executar:

```bash
docker compose up --build
```

o Docker baixa o que estiver faltando.

Opcionalmente:

```bash
docker pull node:22-alpine
docker pull postgres:17-alpine
docker pull supertokens/supertokens-postgresql:12.1.1
```

---

# 14. Rotina diária depois que tudo estiver configurado

## Começar

```bash
sudo systemctl start docker
cd ~/Documents/projetos/project-01-bcc5005
docker compose up -d
```

## Conferir

```bash
docker compose ps
```

## Logs

```bash
docker compose logs -f
```

## Encerrar projeto

```bash
docker compose down
```

## Parar Docker

```bash
sudo systemctl stop docker
```

Opcionalmente:

```bash
sudo systemctl stop docker.socket
```

---

# 15. Regra final

```text
docker compose down
→ encerra o projeto
→ mantém o volume do PostgreSQL

sudo systemctl stop docker
→ desliga o Docker Engine

docker compose down -v
→ encerra o projeto
→ APAGA volumes locais
→ não usar como rotina
```
