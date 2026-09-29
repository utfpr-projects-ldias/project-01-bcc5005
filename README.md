# Sistema de Acompanhamento de Contratos (PI)
Sistema para acompanhamento de contratos públicos, entregas e suas respectivas evidências.

### Funcionalidades
- Cadastro de clientes
- Cadastro de contratos
- Cadastro e associação de entregáveis
- Controle de entregas e evidências
- Dashboard de contratos e prazos
- Relatório de execução contratual.


### Tecnologias
- Front-end: Next.js
- Back-end: NestJS
- Banco de dados: PostgreSQL
- ORM: TypeORM
- Autenticação/Autorização: SuperTokens
- Testes: Jest

### Alunos
- Lucas Marcão.
- Raul Baggio.
- Lucas Dias.

### Instalação
- git clone <url-do-repositorio>
- cd <nome-do-projeto>
- npx create-next-app@latest frontend --use-npm
- npm install -g @nestjs/cli
- nest new backend

### Configure as variáveis de ambiente:

cp .env.example .env

- *Configure no .env as informações do PostgreSQL e do SuperTokens.*

Execute o projeto:

- npm run dev (front)
- npm run start:dev (backend)

Front: https://nextjs.org
Back: https://nestjs.com
BD: https://typeorm.io / Postgres
Autent./Autor.: https://supertokens.com
Teste: jest.
