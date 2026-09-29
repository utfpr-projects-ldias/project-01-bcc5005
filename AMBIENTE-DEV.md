# Ambiente de Desenvolvimento — guia detalhado e dúvidas

Este documento explica o ponto atual do projeto, o que precisa estar instalado na máquina, como Docker/PostgreSQL/SuperTokens funcionam, de onde vêm as variáveis do `.env` e como iniciar e encerrar corretamente todo o ambiente de desenvolvimento.

---

# 1. O que já existe no projeto

A base já possui projetos Next.js e NestJS.

O objetivo agora é preparar e validar a stack exigida:

```text
Frontend        → Next.js
Backend         → NestJS
Banco           → PostgreSQL
ORM             → TypeORM
Autenticação    → SuperTokens
Testes          → Jest
Ambiente        → Docker + Docker Compose
```

Arquitetura:

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

# 2. Preciso instalar Node.js, PostgreSQL, NestJS e Next.js no computador?

**Não, se o objetivo é utilizar o ambiente dockerizado.**

Na máquina você precisa basicamente de:

```text
Git
Docker Engine
Docker Compose
```

As demais ferramentas podem ser executadas dentro dos containers.

As imagens principais utilizadas são:

```text
node:22-alpine
postgres:17-alpine
supertokens/supertokens-postgresql:12.1.1
```

O Docker baixa essas imagens automaticamente quando necessário.

---

# 3. Verificar Docker instalado

Execute:

```bash
docker --version
```

E:

```bash
docker compose version
```

Exemplo:

```text
Docker version 29.x.x
Docker Compose version v5.x.x
```

Se os dois comandos funcionarem, Docker e Docker Compose já estão instalados.

---

# 4. Iniciar o Docker apenas quando necessário

Neste projeto não é necessário deixar o Docker iniciando automaticamente junto com o computador.

Para iniciar somente quando for trabalhar no projeto:

```bash
sudo systemctl start docker
```

Confira:

```bash
sudo systemctl status docker
```

O esperado é:

```text
Active: active (running)
```

Depois:

```bash
docker ps
```

Se ainda houver erro de permissão:

```bash
sudo docker ps
```

---

# 5. Não habilitar Docker automaticamente no boot

Se você não deseja que o Docker fique iniciado permanentemente, **não execute**:

```bash
sudo systemctl enable docker
```

E também não precisa executar:

```bash
sudo systemctl enable --now docker
```

O fluxo desejado é simplesmente:

```text
ligou o computador
        ↓
Docker continua parado
        ↓
vai trabalhar no projeto
        ↓
sudo systemctl start docker
        ↓
trabalha normalmente
        ↓
encerra containers
        ↓
para Docker
```

---

# 6. Docker Compose e Docker Engine não são a mesma coisa

É importante diferenciar.

## Docker Engine

É o serviço principal do Docker:

```text
docker.service
```

Ele é responsável por executar os containers.

## Docker Compose

É uma ferramenta que lê:

```text
docker-compose.yml
```

e pede ao Docker Engine para criar e executar vários containers juntos.

No nosso projeto:

```text
Docker Engine
    │
    └── Docker Compose
           │
           ├── frontend
           ├── backend
           ├── database
           └── supertokens
```

Portanto:

```bash
docker compose down
```

não desliga o Docker Engine.

Ele apenas encerra o ambiente deste projeto.

---

# 7. Como encerrar corretamente o projeto

Quando terminar de trabalhar, primeiro encerre o ambiente criado pelo Docker Compose.

Na raiz do projeto:

```bash
docker compose down
```

Isso encerra e remove os containers criados pelo Compose.

Os dados do PostgreSQL permanecem porque estão armazenados em volume.

---

# 8. Conferir se os containers realmente pararam

Execute:

```bash
docker compose ps
```

Não devem existir containers do projeto em execução.

Você também pode usar:

```bash
docker ps
```

Se nenhum outro projeto estiver executando containers, a lista deve ficar vazia.

---

# 9. Parar também o Docker Engine

Depois de executar:

```bash
docker compose down
```

e terminar completamente o trabalho, você pode parar o próprio Docker:

```bash
sudo systemctl stop docker
```

Confira:

```bash
sudo systemctl status docker
```

O esperado:

```text
Active: inactive (dead)
```

Assim o daemon principal do Docker deixa de permanecer executando.

---

# 10. Docker Socket

Em algumas instalações Linux existe também:

```text
docker.socket
```

Ele permite que o systemd inicie o Docker novamente quando algum programa tenta acessar o socket do Docker.

Você pode verificar:

```bash
sudo systemctl status docker.socket
```

Se quiser garantir que o Docker não seja reativado automaticamente enquanto não estiver usando:

```bash
sudo systemctl stop docker.socket
```

Portanto, para desligar completamente o uso do Docker naquele momento:

```bash
sudo systemctl stop docker
sudo systemctl stop docker.socket
```

Quando quiser trabalhar novamente, basta:

```bash
sudo systemctl start docker
```

Normalmente o serviço volta a disponibilizar tudo que é necessário.

---

# 11. Fluxo completo para começar a trabalhar

Entre no projeto:

```bash
cd ~/Documents/projetos/project-01-bcc5005
```

Inicie Docker:

```bash
sudo systemctl start docker
```

Confira:

```bash
docker ps
```

Depois suba o ambiente:

```bash
docker compose up --build
```

Ou, depois que as imagens já estiverem construídas:

```bash
docker compose up
```

---

# 12. Executar em segundo plano

Normalmente:

```bash
docker compose up
```

mantém o terminal ocupado mostrando os logs.

Se preferir executar os containers em segundo plano:

```bash
docker compose up -d
```

O `-d` significa:

```text
detached
```

Depois você pode ver os logs com:

```bash
docker compose logs
```

Ou acompanhar continuamente:

```bash
docker compose logs -f
```

---

# 13. Fluxo completo para terminar de trabalhar

Se iniciou com:

```bash
docker compose up
```

você pode primeiro usar:

```text
Ctrl + C
```

Depois:

```bash
docker compose down
```

Se iniciou com:

```bash
docker compose up -d
```

basta:

```bash
docker compose down
```

Depois confira:

```bash
docker ps
```

E finalmente desligue o Docker Engine:

```bash
sudo systemctl stop docker
```

Opcionalmente, para impedir ativação pelo socket:

```bash
sudo systemctl stop docker.socket
```

Fluxo completo:

```bash
docker compose down
sudo systemctl stop docker
sudo systemctl stop docker.socket
```

---

# 14. Comando que NÃO deve ser usado normalmente para encerrar

Existe:

```bash
docker compose down -v
```

Mas ele é diferente de:

```bash
docker compose down
```

## Normal

```bash
docker compose down
```

Encerra os containers, mas mantém os dados.

## Com `-v`

```bash
docker compose down -v
```

Além de encerrar os containers, remove os volumes.

Isso significa que o banco local pode ser apagado.

Portanto:

> Use `docker compose down -v` somente quando realmente quiser recriar o banco do zero.

---

# 15. Resumo dos comandos de início e fim

## Começar a trabalhar

```bash
sudo systemctl start docker

cd ~/Documents/projetos/project-01-bcc5005

docker compose up
```

Ou:

```bash
docker compose up -d
```

## Terminar de trabalhar

```bash
docker compose down

sudo systemctl stop docker
```

Se quiser garantir que nem o socket poderá reativá-lo:

```bash
sudo systemctl stop docker.socket
```

Portanto, o fluxo diário pode ser:

```bash
# COMEÇAR

sudo systemctl start docker

cd ~/Documents/projetos/project-01-bcc5005

docker compose up -d


# TRABALHAR


# TERMINAR

docker compose down

sudo systemctl stop docker

sudo systemctl stop docker.socket
```

---

# 16. Preciso instalar uma imagem do PostgreSQL manualmente?

Não.

O `docker-compose.yml` possui:

```yaml
image: postgres:17-alpine
```

Quando você executar:

```bash
docker compose up --build
```

ou:

```bash
docker compose pull
```

o Docker baixa a imagem automaticamente.

Se quiser baixar antecipadamente:

```bash
docker pull postgres:17-alpine
```

O mesmo vale para SuperTokens:

```bash
docker pull supertokens/supertokens-postgresql:12.1.1
```

E Node:

```bash
docker pull node:22-alpine
```

Esses `docker pull` são opcionais.

---

# 17. O que é `.env.example` e o que é `.env`?

## `.env.example`

É um modelo.

Mostra quais variáveis o projeto necessita, mas não deve conter segredos reais.

Ele pode ser enviado para o GitHub.

Exemplo:

```env
POSTGRES_USER=postgres
POSTGRES_DB=integrador
POSTGRES_PASSWORD=CHANGE_ME

SUPERTOKENS_API_KEY=CHANGE_ME
```

---

## `.env`

É o arquivo real da sua máquina.

Pode conter:

```text
senhas
API keys
chaves locais
configurações específicas
```

Ele não deve ser enviado ao GitHub.

Criação:

```bash
cp .env.example .env
```

O `.gitignore` deve conter:

```text
.env
.env.local
```

---

# 18. O Docker usa `.env.example`?

Não.

O Docker Compose utiliza o:

```text
.env
```

na raiz do projeto para substituir variáveis como:

```yaml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

Portanto:

```text
.env.example
      ↓ copiar
.env
      ↓
Docker Compose
```

Comando:

```bash
cp .env.example .env
```

Depois edite o `.env`.

---

# 19. Quais variáveis podem ficar públicas?

| Variável | Pode aparecer no `.env.example`? | Valor real pode ir para Git? | Pode ir ao navegador? |
|---|---:|---:|---:|
| `PORT` | Sim | Sim | Não precisa |
| `FRONTEND_URL` | Sim | Sim | Não precisa |
| `NEXT_PUBLIC_API_URL` | Sim | Sim | Sim |
| `POSTGRES_USER` | Sim | Sim, se genérico | Não |
| `POSTGRES_DB` | Sim | Sim | Não |
| `POSTGRES_PASSWORD` | Sim, como placeholder | Não | Não |
| `SUPERTOKENS_IMAGE` | Sim | Sim | Não |
| `SUPERTOKENS_API_KEY` | Sim, como placeholder | Não | Não |

Regra importante:

> Variáveis Next.js iniciadas com `NEXT_PUBLIC_` podem chegar ao navegador e devem ser consideradas públicas.

Nunca faça:

```env
NEXT_PUBLIC_DATABASE_PASSWORD=...
```

ou:

```env
NEXT_PUBLIC_SUPERTOKENS_API_KEY=...
```

---

# 20. De onde vem a senha do PostgreSQL e o que acontece quando ela muda?

A senha do PostgreSQL **não vem pronta do Docker, do PostgreSQL nem do `Dockerfile`**. Ela é criada por quem prepara o ambiente local.

O fluxo correto é:

```text
.env.example
    ↓ cópia
.env
    ↓ recebe uma senha gerada localmente
Docker Compose
    ↓ envia POSTGRES_PASSWORD ao container PostgreSQL
PostgreSQL
    ↓ usa essa senha na primeira criação do banco/volume
```

O `.env.example` que vai para o Git contém apenas um valor de exemplo ou placeholder:

```env
POSTGRES_USER=postgres
POSTGRES_DB=integrador
POSTGRES_PASSWORD=CHANGE_ME
```

Cada integrante clona o projeto e cria o próprio `.env`:

```bash
cp .env.example .env
```

Depois gera uma senha local, por exemplo:

```bash
openssl rand -hex 24
```

Exemplo de saída:

```text
2bb6c27df02c6a7b735bd3d2062cc61079d8f6d30e2e3d2d
```

Essa saída é colocada **somente no `.env` local**:

```env
POSTGRES_USER=postgres
POSTGRES_DB=integrador
POSTGRES_PASSWORD=2bb6c27df02c6a7b735bd3d2062cc61079d8f6d30e2e3d2d
```

Portanto, normalmente **a senha não precisa ser passada para os colegas**. Cada integrante possui seu próprio PostgreSQL local, seu próprio volume Docker e seu próprio `.env`, então cada pessoa pode gerar uma senha diferente. O que todos compartilham pelo Git é apenas o `.env.example`, que informa quais variáveis precisam existir.

No `docker-compose.yml`, o serviço PostgreSQL recebe:

```yaml
environment:
  POSTGRES_USER: ${POSTGRES_USER}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  POSTGRES_DB: ${POSTGRES_DB}
```

O `${POSTGRES_PASSWORD}` significa: “pegue o valor de `POSTGRES_PASSWORD` do `.env` da máquina que está executando o Compose”.

Na **primeira vez** que o PostgreSQL é criado com um volume vazio, a imagem oficial usa esses valores para inicializar o banco:

```text
.env
 ↓
Docker Compose
 ↓
postgres:17-alpine
 ↓
cria usuário
cria banco
define a senha
 ↓
salva tudo no volume postgres_data
```

Depois disso, a senha faz parte do banco já inicializado dentro do volume `postgres_data`.

Por isso, simplesmente encerrar o ambiente:

```bash
docker compose down
```

e iniciar novamente:

```bash
docker compose up
```

**não recria o banco**. O mesmo volume é reutilizado e a senha continua sendo aquela usada quando o banco foi criado.

Também é importante: a senha **não fica definida no `Dockerfile`**. Alterar `Dockerfile.dev` do frontend ou backend não altera a senha do PostgreSQL. A configuração vem do `.env` e é repassada pelo `docker-compose.yml`.

Se você alterar apenas:

```env
POSTGRES_PASSWORD=nova_senha
```

no `.env` depois que o banco já existe, o PostgreSQL não troca automaticamente a senha armazenada dentro do banco. Nesse caso, o backend pode tentar conectar usando `nova_senha`, enquanto o banco ainda espera a senha antiga.

Durante o desenvolvimento inicial, se não houver nenhum dado importante, a forma mais simples de aplicar a nova senha é apagar o volume e deixar o PostgreSQL ser criado novamente:

```bash
docker compose down -v
docker compose up --build
```

O `-v` remove o volume `postgres_data`. Como o próximo `up` encontra um banco vazio, o PostgreSQL é inicializado novamente usando os valores atuais do `.env`.

> **Atenção:** `docker compose down -v` apaga o banco local. Use isso apenas quando os dados puderem ser descartados.

Se já existirem dados importantes, inclusive em um ambiente local, não é necessário apagar o banco. A senha pode ser alterada diretamente no PostgreSQL, por exemplo com um comando administrativo como:

```sql
ALTER USER postgres WITH PASSWORD 'nova_senha';
```

e depois o `.env` deve ser atualizado para utilizar a mesma senha.

Em produção, **não se apaga o volume ou o banco para trocar senha**. A senha é alterada no próprio PostgreSQL ou no serviço de banco gerenciado, e o segredo utilizado pelo backend é atualizado de forma coordenada. Segredos de produção não devem ficar no Git; normalmente ficam em variáveis protegidas da infraestrutura ou em um gerenciador de segredos.

## Resumo

```text
.env.example
→ vai para o Git
→ não contém senha real

cada integrante:
cp .env.example .env
→ gera sua própria senha
→ coloca a senha no .env local
→ não envia o .env para o Git

docker compose up
→ lê o .env
→ passa POSTGRES_PASSWORD ao PostgreSQL

primeira criação do volume
→ PostgreSQL grava aquela senha

docker compose down
→ para os containers
→ mantém o volume
→ mantém a mesma senha

docker compose up novamente
→ reutiliza o banco existente
→ mantém a senha já gravada

alterar só o .env depois
→ NÃO muda automaticamente a senha interna do banco

docker compose down -v
→ apaga o volume
→ próximo up cria o banco de novo
→ usa a senha atual do .env
```

### Os colegas precisam usar a mesma senha?

Para desenvolvimento local, **não**.

Exemplo:

```text
Lucas
.env → POSTGRES_PASSWORD=senha_A
volume local → postgres_data_A

Colega 1
.env → POSTGRES_PASSWORD=senha_B
volume local → postgres_data_B

Colega 2
.env → POSTGRES_PASSWORD=senha_C
volume local → postgres_data_C
```

Todos conseguem executar o mesmo projeto porque o código utiliza variáveis:

```text
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
```

e não uma senha fixa escrita no código.

Só será necessário compartilhar uma mesma credencial quando todos estiverem acessando **o mesmo banco remoto**, como homologação ou produção. Nesse caso, a credencial deve ser distribuída por um meio seguro ou configurada diretamente na infraestrutura, e nunca colocada no `.env.example` ou no repositório.


# 21. Quem cria o PostgreSQL?

O próprio container:

```text
postgres:17-alpine
```

Na primeira inicialização do volume ele recebe:

```text
POSTGRES_USER
POSTGRES_PASSWORD
POSTGRES_DB
```

e cria o ambiente.

Fluxo:

```text
Docker Compose
      ↓
postgres:17-alpine
      ↓
cria usuário
cria banco
configura senha
```

O volume:

```text
postgres_data
```

mantém os dados entre reinicializações.

---

# 22. Troca de senha PostgreSQL

As variáveis são utilizadas especialmente na primeira criação do banco.

Se alterar:

```env
POSTGRES_PASSWORD=...
```

depois que o volume já foi criado, o banco pode continuar utilizando a senha anterior.

Enquanto ainda não existem dados importantes:

```bash
docker compose down -v
```

Depois:

```bash
docker compose up --build
```

Isso recria o banco.

> Não utilize `down -v` quando houver dados que precisam ser preservados.

---

# 23. `DATABASE_URL`

Dentro do Docker, a conexão pode ser montada como:

```text
postgresql://postgres:SENHA@database:5432/integrador
```

O hostname é:

```text
database
```

porque esse é o nome do serviço PostgreSQL no Compose.

Não usamos:

```text
localhost
```

entre containers.

Fluxo:

```text
backend
   ↓
database:5432
   ↓
PostgreSQL
```

---

# 24. SuperTokens

O ambiente possui três partes.

## Frontend

```text
supertokens-auth-react
```

## Backend

```text
supertokens-node
```

## Core

```text
supertokens/supertokens-postgresql:12.1.1
```

O Core é o serviço responsável pela infraestrutura de autenticação.

Neste momento ele ficará preparado no ambiente, mesmo que ainda não existam telas reais de login.

---

# 25. Preciso criar conta no SuperTokens?

Para o ambiente self-hosted básico utilizado neste projeto:

**não.**

A:

```text
SUPERTOKENS_API_KEY
```

é uma chave criada pela própria equipe para proteger a comunicação com o Core.

Gere:

```bash
openssl rand -hex 32
```

Depois:

```env
SUPERTOKENS_API_KEY=VALOR_GERADO
```

Esse valor deve permanecer somente no `.env`.

---

# 26. Instalar dependências sem Node local

Como os projetos Next.js e NestJS já existem, não é obrigatório instalar Node diretamente na máquina.

Com Docker iniciado:

```bash
sudo systemctl start docker
```

Execute:

```bash
./scripts/instalar-dependencias-com-docker.sh
```

O script utiliza:

```text
node:22-alpine
```

temporariamente para executar os `npm install`.

Frontend:

```text
supertokens-auth-react
jest
Testing Library
```

Backend:

```text
@nestjs/typeorm
typeorm
pg
supertokens-node
```

Os seguintes arquivos podem ser alterados:

```text
frontend/package.json
frontend/package-lock.json
backend/package.json
backend/package-lock.json
```

Eles devem ser versionados.

---

# 27. Preparar `.env`

```bash
cp .env.example .env
```

Gere senha PostgreSQL:

```bash
openssl rand -hex 24
```

Gere chave SuperTokens:

```bash
openssl rand -hex 32
```

Seu `.env` ficará semelhante a:

```env
PORT=3001
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001

POSTGRES_USER=postgres
POSTGRES_DB=integrador
POSTGRES_PASSWORD=SUA_SENHA

SUPERTOKENS_IMAGE=supertokens/supertokens-postgresql:12.1.1
SUPERTOKENS_API_KEY=SUA_CHAVE
```

---

# 28. Validar Docker Compose

Antes de subir:

```bash
docker compose config
```

Depois:

```bash
docker compose up --build
```

Ou em segundo plano:

```bash
docker compose up --build -d
```

---

# 29. Verificar os containers

```bash
docker compose ps
```

Devem existir:

```text
frontend
backend
database
supertokens
```

---

# 30. Testar frontend

```bash
curl -I http://localhost:3000
```

Ou abra:

```text
http://localhost:3000
```

---

# 31. Testar backend

```bash
curl http://localhost:3001
```

---

# 32. Testar PostgreSQL

```bash
docker compose exec database pg_isready -U postgres -d integrador
```

Esperado:

```text
accepting connections
```

---

# 33. Testar SuperTokens

```bash
curl http://localhost:3567/hello
```

Esperado:

```text
Hello
```

---

# 34. Testes

Backend:

```bash
docker compose exec backend npm test
```

Frontend:

```bash
docker compose exec frontend npm test
```

---

# 35. Checklist final do ambiente

```text
[ ] Docker instalado
[ ] Docker Compose instalado
[ ] Docker Engine iniciado manualmente

[ ] .env criado
[ ] .env não versionado

[ ] senha PostgreSQL definida
[ ] chave SuperTokens definida

[ ] dependências instaladas
[ ] package-locks atualizados

[ ] docker compose config funciona

[ ] frontend sobe em :3000
[ ] backend sobe em :3001
[ ] PostgreSQL fica healthy
[ ] SuperTokens responde

[ ] Jest backend passa
[ ] Jest frontend passa

[ ] hot reload frontend funciona
[ ] hot reload backend funciona
```

---

# 36. Commit

Confira:

```bash
git status
```

Garanta que:

```text
.env
```

não esteja sendo versionado.

Depois:

```bash
git add .
```

Confira novamente:

```bash
git status
```

Faça o commit:

```bash
git commit -m "chore: configura ambiente inicial de desenvolvimento"
```

Push:

```bash
git push -u origin SUA_BRANCH
```

Depois abra Pull Request para:

```text
develop
```

---

# 37. Rotina diária resumida

## Começar

```bash
sudo systemctl start docker
```

```bash
cd ~/Documents/projetos/project-01-bcc5005
```

```bash
docker compose up -d
```

Verificar:

```bash
docker compose ps
```

---

## Trabalhar

Frontend:

```text
http://localhost:3000
```

Backend:

```text
http://localhost:3001
```

Ver logs:

```bash
docker compose logs -f
```

---

## Terminar

Primeiro pare o ambiente do projeto:

```bash
docker compose down
```

Depois pare o Docker Engine:

```bash
sudo systemctl stop docker
```

Se quiser impedir também uma eventual reativação pelo socket:

```bash
sudo systemctl stop docker.socket
```

Confira:

```bash
sudo systemctl status docker
```

Esperado:

```text
inactive (dead)
```

---

# 38. Resumo importante

## Parar apenas o projeto

```bash
docker compose down
```

## Parar o Docker inteiro

```bash
sudo systemctl stop docker
```

## Impedir também ativação pelo socket

```bash
sudo systemctl stop docker.socket
```

## Apagar também o banco local

Somente quando realmente quiser:

```bash
docker compose down -v
```

---

# 39. Fluxo recomendado

```text
INÍCIO DO TRABALHO

sudo systemctl start docker
        ↓
docker compose up -d
        ↓
desenvolvimento
        ↓
docker compose down
        ↓
sudo systemctl stop docker
        ↓
fim
```

Assim o Docker fica ativo **somente enquanto você estiver trabalhando no projeto**.
