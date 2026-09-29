# Projeto Integrador — base do zero

Este ZIP representa o projeto **antes da criação do Next.js e do NestJS**.

Inicialmente a estrutura é:

```text
.
├── frontend/
├── backend/
├── README.md
├── AMBIENTE-DEV.md
└── DO-ZERO-AMBIENTE-DEV.md
```

As pastas `frontend/` e `backend/` começam vazias de propósito.

## Qual arquivo ler?

### `DO-ZERO-AMBIENTE-DEV.md`

Use este arquivo se você estiver começando literalmente do zero.

Ele mostra, em ordem:

1. iniciar o Docker;
2. criar o projeto Next.js dentro de `frontend/`;
3. instalar SuperTokens e Jest no frontend;
4. criar o projeto NestJS dentro de `backend/`;
5. instalar TypeORM, PostgreSQL e SuperTokens no backend;
6. configurar NestJS;
7. criar os Dockerfiles;
8. criar `.env.example`;
9. criar o `.env`;
10. gerar senha do PostgreSQL e chave do SuperTokens;
11. criar `docker-compose.yml`;
12. subir e testar todo o ambiente;
13. encerrar Docker Compose e Docker.

### `AMBIENTE-DEV.md`

É o guia de consulta e explicação.

Ele explica com mais calma:

- o que é Docker Engine e Docker Compose;
- de onde vêm as senhas;
- diferença entre `.env.example` e `.env`;
- como funciona o volume do PostgreSQL;
- como trocar a senha;
- o que deve ou não ir para o Git;
- como iniciar e parar o Docker sem deixá-lo no boot.

## Stack exigida

```text
Frontend        → Next.js
Backend         → NestJS
Banco           → PostgreSQL
ORM             → TypeORM
Autenticação    → SuperTokens
Testes          → Jest
Ambiente        → Docker + Docker Compose
```

Não existe script automático neste pacote. A ideia é executar os comandos manualmente acompanhando o `DO-ZERO-AMBIENTE-DEV.md`.
