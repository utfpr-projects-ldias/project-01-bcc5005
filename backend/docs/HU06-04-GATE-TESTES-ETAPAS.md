# HU06-04 — Gate de testes de Etapas (Sprint 04)

**Base:** snapshot `develop` de 30/10/2026, 17:17; HU06-01/02/03 já incorporadas.  
**Escopo:** somente TESTES e documentação; não cria endpoints, tabela, permissão ou regra de produto.  
**Fonte:** issue `4 sprint-04/sub-issues/HU06-04-TESTES-VALIDAR-ETAPAS-ORDENACAO-E-ESCOPO.md`; PRD v1.0 §4, §6, §8, §9 (RF-05/RB-14/RB-18–20/RNF-01/02/05).

## 1. Camadas e natureza da evidência

| Suíte | Componentes reais | Substituições/limitação |
|---|---|---|
| `backend/test/hu06-04-etapas-regressao-banco.e2e-spec.ts` | Controllers HU05/HU06, DTO `ValidationPipe`, Guard TEC07, serviços, TypeORM, PostgreSQL, migrations e trilha de auditoria | Só identificação de sessão SuperTokens simulada; não comprova cookies/Tokens reais |
| `backend/test/hu06-02-etapas-api.e2e-spec.ts` (preexistente) | HTTP HU06 + PostgreSQL; reordenação concorrente, HTTP, rollback | SuperTokens simulado |
| `frontend/src/app/contratos/components/painel-etapas.hu06-04.test.tsx` | DOM React real, renderização, estados, botões e rótulos | Hooks de dados/mutação simulados; não comprova browser/API |
| `frontend/src/app/contratos/components/formulario-etapa.hu06-04.test.tsx` | DOM React real, validação, eventos de submit, mensagens acessíveis | Callbacks de gravação simulados |
| Suítes prévias HU06-03 | Unidade DOM/API e TypeScript | Dependendo do teste, mocks de React/API |

### 2. Provas adicionais entregues

1. Banco isolado, schema criado por **todas as migrations históricas**, `synchronize: false`, sem `dropSchema`, IDs exclusivos por execução e limpeza de fixtures isoladas.
2. Contrato e etapa históricos são persistidos **antes** de montar a aplicação Nest. Subsequentemente as APIs criam novas etapas nesse contrato, não numa estrutura em memória.
3. Duas criações concorrentes, ordenação por sequência sem duplicatas, arrays inválidos/incompletos (400/409), concorrência real (200 + 409), persistência após reinicialização do app.
4. Validação de sessão ausente (401), usuário inativo (403), Gestor não vinculado (404), Colaborador somente leitura e ADMIN global; IDs cruzados sem vazamento.
5. Provas diretas no PostgreSQL de **FK e UNIQUE**; rollback de todas as alterações e dos eventos se falhar a *última gravação de auditoria* durante a reordenação.
6. Auditoria em banco contendo contrato raiz, ator, data e snapshots anterior/posterior de prazo, status e sequência.
7. **CRUD real de Contratos HU05:** troca de `terminoVigencia` via PATCH, evento `CONTRATO_PRAZO_ALTERADO` com valores antes/depois, nenhuma data de Etapa alterada, `avisoVigencia` recalculado após consulta.
8. Frontend: carregando, vazio, erro, revogação da consulta, controles ocultos por permissão, botões nativos com rótulos, foco/uso do formulário, falha de gravação e conflito 409.

## 3. Execução obrigatória (não usar banco de desenvolvimento)

```bash
cd ~/Documents/projetos/project-01-bcc5005
docker compose up -d --build

docker compose exec database sh -lc \
  'psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '\''integrador_hu06_qa_test'\''" | grep -qx 1 || createdb -U "$POSTGRES_USER" integrador_hu06_qa_test'

docker compose exec backend sh -lc \
  'HU06_QA_TEST_DATABASE_URL="${DATABASE_URL%/*}/integrador_hu06_qa_test" npm run test:e2e -- --runInBand hu06-04-etapas-regressao-banco'

docker compose exec backend sh -lc \
  'HU06_API_TEST_DATABASE_URL="${DATABASE_URL%/*}/integrador_hu06_api_test" npm run test:e2e -- --runInBand hu06-02-etapas-api'

docker compose exec backend npx tsc --noEmit
docker compose exec backend npm test -- --runInBand
docker compose exec backend npm run lint

docker compose exec frontend npx tsc --noEmit
docker compose exec frontend npm test -- --runInBand
docker compose exec frontend npm run lint
```

Não usar `docker compose down -v`, `DROP DATABASE`, `synchronize: true`, migrations de reversão ou banco de dados de trabalho. `integrador_hu06_api_test` deve existir dos testes da HU06-02; se não existir, crie-o também com `createdb` sem apagar dados.

**Resultado real:** deixar registrado o output do Docker antes de marcar como verde; o patch não foi executado integralmente neste ambiente porque os pacotes npm não estão instalados.

## 4. Pontos que permanecem para a HU06-05

- Sessão real SuperTokens, integração com Next em navegador, recarregar página e reiniciar *container* do backend com dados persistentes (a HU06-04 reinicializa somente o Nest no teste).
- QA visual em larguras mobile e desktop, navegação por teclado no navegador real, e perfis reais cadastrados.
- Verificação do vínculo real da FK com o futuro HU07. Aqui é verificada a PK UUID da Etapa, a FK ao Contrato e o contrato de ID/ordem; **nenhuma entidade Entregável é criada**.
- Perguntas do PRD em aberto permanecem abertas (p.ex. PQ-03, PQ-04, PQ-15). Fase 2 não incluída.

## 5. Evidências de aceite

Salve no PR: console das suítes, `git diff --check`, hash do commit, escopo do diff, checklist de revisão, limitações de mocking, resultado do QA manual e captura da execução em banco *sem dados artificiais de resultado*. Só encerrar a issue após PR integrado e gate registrado.
