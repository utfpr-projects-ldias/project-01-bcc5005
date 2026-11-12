# TEC08-02 — Documento contratual, API e auditoria (Sprint 04)

**Estado:** implementação preparada para validação local; **não** declarar homologada só com testes unitários.
**Origem:** PRD RF-04, RB-14/RB-20, RNF-01/02/03/05/08/11; issue-pai TEC08; sub-issue TEC08-02.

## Contrato HTTP (proposto e implementado neste incremento)

Sob SuperTokens, usuário ativo e ACL do contrato raiz:

- `GET /contratos/:contratoId/documentos?categoria=ANEXO&pagina=1`: lista paginada (20 por página), metadados sem `storageKey`. `ADMIN` ou `GESTOR`/`COLABORADOR` vinculados: leitura.
- `POST /contratos/:contratoId/documentos`: `multipart/form-data` com campo binário `arquivo`, texto `categoria` e `descricao` opcional. `ADMIN` ou `GESTOR` vinculado com `podeEditar=true`: escrita. `COLABORADOR` não recebe edição de planejamento enquanto PQ-04 estiver aberta.
- `GET /contratos/:contratoId/documentos/:documentoId`: metadados autorizados.
- `GET /contratos/:contratoId/documentos/:documentoId/download`: bytes autenticados, sem URL estática; cabeçalhos `attachment`, `nosniff`, `private, no-store`.

Os detalhes resolvem a FK `documentos_contratuais.contrato_id` a partir do **ID do documento persistido** e exigem consistência com `:contratoId`. Documento inexistente, fora de escopo e ID cruzado negam acesso. Sessão inválida resulta em 401, identidade inativa em 403 e recurso fora de escopo em 404 conforme guard existente.

### Catálogo técnico provisório, a validar (PQ-11)

- `CONTRATO_PRINCIPAL` — exige PDF.
- `ADITIVO` — documento relacionado a aditivo.
- `ANEXO` — outros arquivos contratuais.
- `OUTRO` — outra classificação explícita.

O conjunto é uma **decisão técnica temporária**, não aprovação do cliente. Arquivos aceitos usam a política de TEC08-01: extensões `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.txt`, validação efetiva, tamanho unitário e cota total configuráveis. O servidor não confia em MIME declarado ou nome do arquivo para armazenar caminho.

## Modelo e auditoria

Migration **nova** `1793900000000-CriarDocumentosContratuais`: tabela `documentos_contratuais`, FKs com `ON DELETE RESTRICT`, índices por contrato/categoria/data e por autor, restrições de categoria/bytes/chave/hash; nenhuma migration antiga editada. Metadados: categoria, descrição, nome, MIME efetivo, tamanho, hash, autor e instante; `storage_key` privada, nunca retornada em JSON.

No upload, o serviço primeiro salva o blob privado no adaptador da TEC08-01, depois grava **metadados + `DOCUMENTO_ANEXADO` em uma única transação PostgreSQL**. O resolvedor de auditoria usa a FK persistida. Se o SQL falhar, compensa o blob com token efêmero; se a compensação também falhar, registra erro para reconciliação. Se o commit SQL ocorreu, o arquivo não é removido por falha posterior de confirmação. Download verifica existência, tamanho e SHA-256 antes de transmitir.

**Limite arquitetural:** PostgreSQL + filesystem não possuem commit distribuído. Queda total do processo entre gravação do blob e commit SQL pode deixar órfão não acessível via API; recuperação exige rotina administrativa de reconciliação com inventário e backups. Não executar remoção automática destrutiva de arquivos sem análise/autorizações. Storage TEC08-01 tem cota serializada dentro de um único processo: produção multi-réplica requer mecanismo distribuído.

## Validação e execução

- Testes unitários/contrato: `npm test -- --runInBand --runTestsByPath src/documentos/documentos.service.spec.ts src/documentos/documentos.controller.spec.ts src/documentos/documentos.migration.spec.ts src/documentos/documentos.acl.spec.ts` dentro de `backend`.
- `npm test -- --runInBand`, `npm run lint`, `npm run build`.
- `npm run migration:show` **somente leitura**, no ambiente autorizado; uma migration nova aparecerá pendente.
- **Não aplicar `migration:run` no banco com dados importantes sem backup consistente de PostgreSQL E blobs, e sem confirmar o alvo do DATABASE_URL.** Não usar `down -v`/`migration:revert`.
- TEC08-04/05: banco isolado e PostgreSQL real, SuperTokens, fixtures de usuários ADMIN/GESTOR/COLABORADOR, contrato A/B, arquivo válido, MIME falsificado, bytes iguais, falha SQL após blob, checksum corrompido, reinicialização, upload/download reais, autorização negativa, auditoria.

## Não incluído na TEC08-02

UI (TEC08-03), bateria E2E real e aceites transversais (TEC08-04/05), workflow de aprovação/portal/financeiro da Fase 2, edição de categoria e arquivamento. Não existem endpoints públicos de exclusão, e não se trata de evidência operacional HU10. O texto do PRD v1.0 continua `Proposta para validação`; PQ-11 está aberta.
