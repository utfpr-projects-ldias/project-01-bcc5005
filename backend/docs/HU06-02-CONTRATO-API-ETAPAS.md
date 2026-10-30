# HU06-02 — Contrato HTTP da API de Etapas (Sprint 04)

## Escopo e dependências

- PRD v1.0, RF-05, RF-39/40/41/42, RB-14/18/19/20 e RNF-01/02/05. Fase 1 apenas.
- Entidade `Etapa` e restrições (HU06-01) são mantidas sem alteração/migration.
- `AutorizacaoGuard` global + `ExigirPoliticaOperacional` da TEC07-AJUSTES-02: **nenhum ID de body identifica a raiz**.
- `AuditoriaService.registrarNaTransacao`: mesmo `EntityManager` para etapa e evento; falha aborta tudo.
- HU06-03 deve consumir os endpoints reais; HU06-04/05 são responsáveis por QA complementar/integração com UI.

## Rotas (todas requerem sessão + usuário ativo provisionado)

| HTTP | Caminho | Política | Resposta |
|---|---|---|---|
| GET | `/contratos/:contratoId/etapas` | `etapas:listar` | `200` array de etapas ordenadas por `sequencia ASC, id ASC` |
| POST | `/contratos/:contratoId/etapas` | `etapas:criar` | `201` etapa criada |
| GET | `/contratos/:contratoId/etapas/:etapaId` | `etapas:visualizar` | `200` etapa |
| PATCH | `/contratos/:contratoId/etapas/:etapaId` | `etapas:editar` | `200` etapa alterada |
| PATCH | `/contratos/:contratoId/etapas/reordenar` | `etapas:reordenar` | `200` array de etapas na nova ordem |

**Acesso:** Administrador em qualquer contrato existente; Gestor somente quando vinculado; escrita exige `podeEditar=true`. Colaborador vinculado pode ler, mas **não** gerenciar planejamento. IDs inexistentes/fora do escopo ou rota-pai divergente retornam 404 uniforme. A autenticação sem sessão retorna 401; usuário inativo/não provisionado retorna 403. Todos os DTOs proíbem propriedades desconhecidas (400).

### Cadastro

```json
{
  "nome": "Levantamento de necessidades",
  "codigo": "ET-01",
  "descricao": "Etapa inicial",
  "inicioPrevisto": "2026-11-01",
  "terminoPrevisto": "2026-11-15",
  "status": "PLANEJADA",
  "observacoes": null
}
```

Somente `nome` é obrigatório. Campos opcionais aceitam null para limpar (quando atualizados). `status` admite apenas `PLANEJADA`, `EM_ANDAMENTO`, `CONCLUIDA`: enum técnico provisório HU06-01, não o do contrato. Nome/código são trimados e não podem ser apenas espaços; `nome` até 255 caracteres, `codigo` até 50. Datas são civis `YYYY-MM-DD`, validadas como calendário real e `terminoPrevisto >= inicioPrevisto` quando ambas presentes. **Sem vínculo obrigatório entre datas de etapa e vigência do contrato**, ainda pendente de validação de produto.

`contratoId`, `id` e `sequencia` **não podem vir no corpo**: contrato só da rota, UUID gerado pelo banco, sequência atribuída pelo servidor em transação após bloquear a linha do Contrato. O servidor acrescenta `sequencia = max + 1` (normalmente começando em 1).

### Atualização

`PATCH` aceita subconjunto dos campos de cadastro, exceto `sequencia`. Omissão preserva; null só limpa campo opcional. Não há DELETE (RB-14). Auditoria: evento geral `ETAPA_EDITADA` e, quando mudar, `ETAPA_STATUS_ALTERADO` / `ETAPA_PRAZO_ALTERADO`, com valores anteriores/posteriores.

### Reordenação, concorrência e erro 409

Enviar **todos** os IDs reais da lista, inclusive a ordem atual que foi lida pela interface:

```json
{
  "idsOrdemAtual": ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
  "idsOrdemNova": ["22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111"]
}
```

1. Sob `SELECT FOR UPDATE` da linha do Contrato, consultar a lista real da Etapa no mesmo banco.
2. Se a ordem consultada diferir de `idsOrdemAtual`, ou `idsOrdemNova` não contiver precisamente todos os IDs, retornar **409 Conflict**. A UI deve recarregar e pedir nova tentativa, não tentar merge automático.
3. Dentro da mesma transação PostgreSQL, executar `SET CONSTRAINTS "uq_etapas_contrato_sequencia" DEFERRED` e atribuir posições `1..N`, aproveitando a migration HU06-01.
4. Auditar toda etapa cuja sequência mudou (`ETAPA_REORDENADA` com antes/depois) no mesmo commit. Qualquer falha/rollback preserva a ordem original e não deixa auditoria órfã.
5. Uma ordem nova idêntica à atual não grava eventos adicionais.

O contrato é bloqueado também no cadastro/edição de Etapas para serializar alterações dessa coleção. Erros PostgreSQL de unicidade/conflito/concorrrência são traduzidos para 409, violação de dados para 400 e FK inexistente para 404.

### Resposta de Etapa e vigência do Contrato

As respostas mantêm `id`, `contratoId`, `codigo`, `nome`, `descricao`, `sequencia`, `inicioPrevisto`, `terminoPrevisto`, `status`, `observacoes` conforme Etapa da HU06-01, **mais**:

```json
{
  "vigenciaContrato": { "inicioVigencia": "2026-10-01", "terminoVigencia": "2027-01-01" },
  "avisoVigencia": false
}
```

`avisoVigencia` torna-se `true` se qualquer data prevista presente cair fora da vigência **atual** do contrato. Se o Contrato tiver vigência alterada depois da criação das etapas, nova consulta recalcula o aviso, mas **não altera automaticamente** `inicioPrevisto`/`terminoPrevisto`. A HU06-03 deve apresentar aviso textual e acessível (sem bloqueio ou correção automática). As mudanças de vigência do próprio Contrato já são auditadas pelo módulo HU05 (`CONTRATO_PRAZO_ALTERADO`).

### Delimitação

Nenhum ajuste em migrations, autenticação, frontend, progresso, entregáveis, dados financeiros, portal do fiscal, aprovação eletrônica ou recursos da Fase 2. Excluir fisicamente etapas não é suportado. Consultas filtram exclusivamente por contrato autorizável via guard; não existe listagem global de etapas.
