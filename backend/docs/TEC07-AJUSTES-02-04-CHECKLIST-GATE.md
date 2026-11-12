# TEC07-AJUSTES-02-04 — Checklist de integração e aceite

**Não marcar uma caixa sem evidência de execução.** Contrato técnico: [TEC07-AJUSTES-02-04-CONTRATO-INTEGRACAO-V1.md](TEC07-AJUSTES-02-04-CONTRATO-INTEGRACAO-V1.md).

## A. Base e alterações

- [ ] PR `TEC07-AJUSTES-02-03` mesclado em `develop` antes de criar `feature/tec07-ajustes-02-04`.
- [ ] Git limpo antes da aplicação; patch conferido por SHA-256; somente os arquivos previstos mudaram.
- [ ] Sem mudanças no `README.md`, `TEC07-AJUSTES-01`, autenticação, usuários, frontend ou migrations.
- [ ] `AuditoriaService` aceita resolvedor por módulo com **mesmo EntityManager**, preservando CONTRATO/USUARIO/ETAPA e sem regravar eventos históricos.
- [ ] Contrato `tec07.operacional.v1` versionado, com proprietário de cada recurso, ações/escopo e sequência de PRs.
- [ ] Exemplos HU06/TEC08 e fixture de regressão documentados como **exemplos, não APIs implementadas**.

## B. Testes obrigatórios

- [ ] `docker compose exec backend npx tsc --noEmit`.
- [ ] `docker compose exec backend npm test -- --runInBand`.
- [ ] `docker compose exec backend npm run lint`.
- [ ] `docker compose exec frontend npx tsc --noEmit`.
- [ ] `docker compose exec frontend npm test -- --runInBand`.
- [ ] `docker compose exec frontend npm run lint`.
- [ ] Reexecutar E2E PostgreSQL isolado: `tec07-ajustes-02-01-auditoria-banco`, `tec07-ajustes-02-02-escopo-banco`, `tec07-ajustes-02-03-seguranca-regressao` (seguir env/bancos de cada teste).
- [ ] E2E de `contratos-api` e `admin-usuarios` sem regressão.
- [ ] Registrar número real de testes aprovados, falhas e skips; nenhum teste omitido silenciosamente.
- [ ] Revisar manualmente login/logout e as telas existentes no navegador (não alegar QA visual se não executado).

## C. Git/PR e consumidores

- [ ] `git add .`, `git diff --cached --check`, commit e push da branch `feature/tec07-ajustes-02-04`.
- [ ] PR específico `TEC07-AJUSTES-02-04` criado **para `develop`**, revisado e aprovado.
- [ ] Merge confirmado via hash no remoto `origin/develop`; atualizar `develop` local após merge.
- [ ] Issue-pai TEC07-AJUSTES-02 encerra somente após confirmar integração de **todas** as 4 sub-issues e critérios globais.
- [ ] Dono HU06-02 conhece `etapas:*`, raiz persistida e eventos `ETAPA_*`.
- [ ] Dono TEC08-02 conhece `documentos:*`, adaptadores de escopo/contexto auditável, armazenamento e compensação.
- [ ] Donos HU07/HU08/HU09/TEC09 cientes dos resolvedores próprios e da validação de vínculos N:N.
- [ ] Dúvidas PQ-03/PQ-04/PQ-14 registradas para decisão, sem abrir a Fase 2.

## D. Referência dos resultados (preencher após rodar)

| Verificação | Resultado/contagem | Data e evidência |
|---|---|---|
| Unitários backend | Pendente | — |
| Unitários frontend | Pendente | — |
| E2E backend (bancos isolados) | Pendente | — |
| TSC + lint | Pendente | — |
| QA navegador | Não executado | — |
| PR e merge | Pendente | — |
