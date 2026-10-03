# Projeto Integrador — Ambiente de Desenvolvimento

Este repositório contém a estrutura base do Projeto Integrador com frontend, backend, banco de dados e autenticação executados em containers Docker.

O ambiente técnico inicial já está configurado. Este `README.md` serve como guia principal para configurar as variáveis locais, iniciar o Docker manualmente, subir o projeto, verificar os serviços, executar testes e encerrar o ambiente corretamente.

Para entender como toda a estrutura foi criada do zero, consulte o arquivo `DO-ZERO-AMBIENTE-DEV.md`.

---

## Stack Tecnológica

| Camada | Tecnologia |
| :--- | :--- |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Backend** | NestJS 12, TypeScript, TypeORM |
| **Banco de Dados** | PostgreSQL 17 |
| **Autenticação** | SuperTokens |
| **Testes** | Jest no Frontend e Backend; React Testing Library no Frontend |
| **Runtime** | Node.js 24 em containers Alpine |
| **Orquestração** | Docker Engine e Docker Compose |

---

## Pré-requisitos

Neste fluxo de desenvolvimento, é necessário ter instalado diretamente na máquina:

- Git;
- Docker Engine;
- Docker Compose.

Não é necessário instalar diretamente na máquina:

- Node.js;
- Next.js;
- NestJS;
- PostgreSQL;
- SuperTokens Core.

O Node.js utilizado pelo projeto é fornecido pelas imagens Docker.

Verifique se Docker e Docker Compose estão disponíveis:

```bash
docker --version
docker compose version
```

---

## Docker sem iniciar automaticamente no boot

Neste projeto, o Docker pode ser utilizado somente quando necessário, sem iniciar automaticamente junto com o sistema operacional.

### Verificar a configuração do boot

```bash
systemctl is-enabled docker.service
systemctl is-enabled docker.socket
```

Para este fluxo, o esperado é:

```text
disabled
disabled
```

Se algum deles aparecer como `enabled` e você quiser manter o Docker desativado no boot:

```bash
sudo systemctl disable docker.service
sudo systemctl disable docker.socket
```

Isso não desinstala o Docker. Apenas impede sua inicialização automática.

### Iniciar o Docker manualmente

Sempre que for trabalhar no projeto:

```bash
sudo systemctl start docker
```

Confira:

```bash
sudo systemctl status docker
```

O estado esperado é semelhante a:

```text
Active: active (running)
```

Também é possível verificar com:

```bash
docker ps
```

> Não é necessário executar `sudo systemctl enable docker` para utilizar o Docker manualmente.

---

## Configurar Variáveis de Ambiente

Na primeira utilização do projeto em uma máquina, crie o arquivo `.env` na raiz a partir do modelo `.env.example`:

```bash
cp .env.example .env
```

O `.env.example` pode ser versionado no Git porque contém apenas a estrutura das variáveis e valores de exemplo.

O `.env` contém as credenciais reais da máquina local e não deve ser enviado ao Git.

### Gerar senha local do PostgreSQL

```bash
openssl rand -hex 24
```

Copie o valor gerado e coloque no `.env`:

```env
POSTGRES_PASSWORD=VALOR_GERADO
```

### Gerar chave local do SuperTokens

```bash
openssl rand -hex 32
```

Copie o valor gerado e coloque no `.env`:

```env
SUPERTOKENS_API_KEY=VALOR_GERADO
```

Cada desenvolvedor pode utilizar credenciais locais diferentes. O código do projeto permanece igual porque as aplicações leem os valores pelas variáveis de ambiente.

---

## Validar o Docker Compose

Antes de subir o ambiente, valide o `docker-compose.yml` sem imprimir no terminal os valores resolvidos das variáveis do `.env`:

```bash
docker compose config -q
```

Se o comando terminar sem apresentar erro, a configuração do Compose está válida.

Evite usar apenas:

```bash
docker compose config
```

quando não houver necessidade de visualizar a configuração completa, pois esse comando pode exibir no terminal os valores resolvidos das variáveis de ambiente.

---

## Subir o Projeto

### Primeira execução ou após alterações de dependências/Dockerfiles

```bash
docker compose up -d --build
```

O `--build` reconstrói as imagens do frontend e backend quando necessário.

Na primeira execução, o Docker também baixa automaticamente as imagens que ainda não existirem na máquina.

### Uso diário

Depois que o ambiente já estiver construído:

```bash
docker compose up -d
```

O parâmetro `-d` executa os containers em segundo plano e libera o terminal.

---

## Verificar os Serviços

Confira os containers do projeto:

```bash
docker compose ps
```

O ambiente possui os seguintes serviços:

```text
frontend
backend
database
supertokens
```

Para acompanhar os logs de todos os serviços:

```bash
docker compose logs -f
```

Para acompanhar somente um serviço:

```bash
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f database
docker compose logs -f supertokens
```

Para sair da visualização de logs sem encerrar os containers:

```text
Ctrl + C
```

---

## Endereços Locais

Com os containers em execução:

- **Frontend:** `http://localhost:3000`
- **Backend (API):** `http://localhost:3001`
- **SuperTokens Core:** `http://localhost:3567`
- **PostgreSQL:** `localhost:5432`

---

## Verificações de Infraestrutura

### Frontend

```bash
curl -I http://localhost:3000
```

### Backend

```bash
curl http://localhost:3001
```

### PostgreSQL

```bash
docker compose exec database pg_isready -U postgres -d integrador
```

O resultado esperado deve indicar:

```text
accepting connections
```

### SuperTokens Core

```bash
curl http://localhost:3567/hello
```

O resultado esperado é:

```text
Hello
```

---

## Verificar Dependências Instaladas

### Frontend

```bash
docker compose exec frontend npm list --depth=0
```

### Backend

```bash
docker compose exec backend npm list --depth=0
```

---

## Executar os Testes

### Frontend

```bash
docker compose exec frontend npm test
```

O frontend utiliza:

- Jest;
- React Testing Library;
- `jest-environment-jsdom`.

### Backend

```bash
docker compose exec backend npm test
```

O backend utiliza:

- Jest;
- `@nestjs/testing`;
- `ts-jest`;
- Supertest para testes HTTP/E2E.

### Cobertura do backend

```bash
docker compose exec backend npm run test:cov
```

### Testes E2E do backend

```bash
docker compose exec backend npm run test:e2e
```

---

## Instalar Novas Dependências

Com os containers em execução, instale pacotes dentro do serviço correspondente.

### Frontend

Exemplo:

```bash
docker compose exec -u "$(id -u):$(id -g)" frontend npm install zod
```

### Backend

Exemplo:

```bash
docker compose exec -u "$(id -u):$(id -g)" backend npm install class-validator class-transformer
```

Esses comandos atualizam o `package.json` e o `package-lock.json` do respectivo projeto.

Depois de alterar dependências, reconstrua o ambiente quando necessário:

```bash
docker compose up -d --build
```

---

## Atualizar Dependências

Para atualizar pacotes respeitando as faixas de versões registradas no `package.json`:

### Frontend

```bash
docker compose exec -u "$(id -u):$(id -g)" frontend npm update
```

### Backend

```bash
docker compose exec -u "$(id -u):$(id -g)" backend npm update
```

Para atualizar um pacote específico para a versão mais recente:

```bash
docker compose exec -u "$(id -u):$(id -g)" frontend npm install PACOTE@latest
```

ou:

```bash
docker compose exec -u "$(id -u):$(id -g)" backend npm install PACOTE@latest
```

Atualizações de dependências devem ser verificadas e testadas antes de serem enviadas ao repositório.

---

## Rotina Diária Recomendada

### 1. Entrar na raiz do projeto

Exemplo:

```bash
cd ~/Documents/projetos/project-01-bcc5005
```

### 2. Iniciar o Docker Engine

```bash
sudo systemctl start docker
```

### 3. Validar o Compose, quando necessário

```bash
docker compose config -q
```

### 4. Subir os containers

```bash
docker compose up -d
```

### 5. Conferir o ambiente

```bash
docker compose ps
```

### 6. Trabalhar normalmente

Quando precisar acompanhar os logs:

```bash
docker compose logs -f
```

### 7. Encerrar os containers do projeto

```bash
docker compose down
```

### 8. Desligar o Docker completamente

Pare primeiro o socket:

```bash
sudo systemctl stop docker.socket
```

Depois pare o serviço:

```bash
sudo systemctl stop docker.service
```

Essa ordem evita que o `docker.socket` permaneça ativo como unidade capaz de acionar novamente o serviço Docker.

### 9. Confirmar que Docker e socket estão inativos

```bash
systemctl is-active docker.service docker.socket
```

O resultado esperado é:

```text
inactive
inactive
```

---

## Diferença entre Docker Compose e Docker Engine

O comando:

```bash
docker compose down
```

encerra e remove os containers e a rede criada pelo Compose para este projeto, mas não desliga o Docker Engine da máquina.

Já:

```bash
sudo systemctl stop docker.socket
sudo systemctl stop docker.service
```

desliga o mecanismo Docker utilizado pela máquina e também o socket que poderia ativá-lo novamente.

Portanto, para encerrar completamente a rotina de desenvolvimento:

```bash
docker compose down
sudo systemctl stop docker.socket
sudo systemctl stop docker.service
```

Depois:

```bash
systemctl is-active docker.service docker.socket
```

---

## O que esperar depois de `docker compose down`

Depois de:

```bash
docker compose down
```

é normal que:

```bash
docker ps
```

não apresente containers em execução.

Também é normal que:

```bash
docker compose logs -f
```

não apresente logs dos containers que acabaram de ser removidos pelo `down`.

Executar novamente:

```bash
docker compose down
```

quando o projeto já está encerrado também não causa problema. Apenas não haverá mais recursos do Compose para remover.

---

## Persistência do PostgreSQL

O PostgreSQL utiliza um volume Docker persistente.

Ao executar:

```bash
docker compose down
```

os containers são removidos, mas os dados do PostgreSQL são preservados.

Não use como rotina:

```bash
docker compose down -v
```

O parâmetro `-v` remove os volumes do Compose, incluindo o volume persistente do PostgreSQL.

Use `docker compose down -v` somente quando realmente quiser apagar o banco local e recriá-lo do zero.

---

## Atenção ao Alterar a Senha do PostgreSQL

A senha definida na primeira inicialização do PostgreSQL fica associada ao usuário armazenado no volume existente.

Por isso, alterar apenas:

```env
POSTGRES_PASSWORD=nova_senha
```

pode fazer o backend tentar utilizar uma senha diferente daquela registrada no banco já existente.

Durante a fase inicial, caso não existam dados importantes e você realmente queira recriar o banco:

```bash
docker compose down -v
docker compose up -d --build
```

Quando houver dados importantes, não apague o volume apenas para trocar uma senha. A credencial deve ser alterada no próprio PostgreSQL e depois atualizada no segredo utilizado pela aplicação.

---

## Resumo dos Comandos Principais

### Iniciar o trabalho

```bash
sudo systemctl start docker
docker compose config -q
docker compose up -d
docker compose ps
```

### Ver logs

```bash
docker compose logs -f
```

### Executar testes

```bash
docker compose exec frontend npm test
docker compose exec backend npm test
```

### Encerrar o trabalho

```bash
docker compose down
sudo systemctl stop docker.socket
sudo systemctl stop docker.service
systemctl is-active docker.service docker.socket
```

### Reconstruir quando necessário

```bash
docker compose up -d --build
```

---

## Regra Prática

```text
sudo systemctl start docker
→ inicia manualmente o Docker Engine

docker compose config -q
→ valida o Compose sem imprimir a configuração resolvida

docker compose up -d
→ inicia os serviços do projeto

docker compose down
→ encerra os serviços do projeto
→ mantém os dados do PostgreSQL

sudo systemctl stop docker.socket
→ desliga o socket que pode ativar o Docker

sudo systemctl stop docker.service
→ desliga o Docker Engine

docker compose down -v
→ encerra o projeto
→ APAGA os volumes locais
→ não usar como rotina
```
