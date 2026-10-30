# HU07-06 — Contrato de integração do planejamento (Sprint 04)

**Origem real:** `EntregaveisController` + `EntregaveisService` + tabelas `entregaveis` / `evidencias_esperadas`. **Status:** contrato técnico existente; demonstração QA real só após executar os cenários no navegador.

## API NestJS (SuperTokens, escopo do contrato)

| Método e caminho | Perfil/política | Resposta |
| --- | --- | --- |
| `GET /contratos/:contratoId/entregaveis` | `entregaveis:listar` | `Entregavel[]`, com `evidenciasEsperadas[]` |
| `GET /contratos/:contratoId/entregaveis/:entregavelId` | `entregaveis:visualizar` | `Entregavel` do contrato |
| `POST /contratos/:contratoId/entregaveis` | `entregaveis:criar` | `201 Entregavel` |
| `PATCH /contratos/:contratoId/entregaveis/:entregavelId` | `entregaveis:editar` | `Entregavel` |
| `PUT /contratos/:contratoId/entregaveis/:entregavelId/evidencias-esperadas` | `entregaveis:editar` | Checklist completo de planejamento no objeto |

As FKs compostas garantem `entregavel.contrato_id = etapa.contrato_id`. Um responsável cadastral **não ganha** vínculo de acesso automaticamente. Administrador tem escopo global; Gestor com `podeEditar` pode planejar; Gestor somente leitura e Colaborador não podem modificar planejamento; sem vínculo não pode consultar.

## Tipos e exemplo de payloads aceitos

JSON base para o `POST`, com `etapaId` de uma etapa válida do **mesmo** contrato e UUID v4 real:

```json
{
  "etapaId": "11111111-1111-4111-8111-111111111111",
  "nome": "Reunião inicial de execução",
  "codigo": "ENT-001",
  "tipo": "UNICO",
  "peso": "10.0000",
  "criterioConclusao": "Reunião realizada e ata registrada",
  "evidenciasEsperadas": [
    {"tipoEvidencia": "Ata", "descricao": "Ata da reunião", "obrigatoria": true},
    {"tipoEvidencia": "Foto", "descricao": "Registro opcional", "obrigatoria": false}
  ]
}
```

Especializações estritas por tipo:

- **UNICO**: não exige quantidade nem periodicidade.
- **QUANTITATIVO**: `quantidadePrevista: "25.500"`, `unidadeMedida: "unidades"`; prevista maior que zero, até 3 decimais.
- **RECORRENTE**: `periodicidade: "MENSAL"` e `configuracaoPeriodicidade: {"versao":1}`. Enum fixo atual: `DIARIA`, `SEMANAL`, `MENSAL`, `TRIMESTRAL`, `SEMESTRAL`, `ANUAL`. **Personalizada não homologada**, PQ-09/PQ-10 pendentes.
- **CONTINUO**: `criterioConclusao` textual obrigatório; não calcula avanço por tempo decorrido.
- **MARCO**: `criterioConclusao` textual obrigatório; data efetiva fica para execução/TEC09.

## Dados para consumidores posteriores

Os campos `tipo`, `inicioPrevisto`, `terminoPrevisto`, `quantidadePrevista`, `unidadeMedida`, `periodicidade`, `configuracaoPeriodicidade`, `peso`, `criterioConclusao` e `evidenciasEsperadas` estão disponíveis na resposta de leitura, com UUIDs estáveis de checklist quando itens existentes são editados.

- **HU09** consome a dupla `periodicidade` + `configuracaoPeriodicidade: {"versao":1}` para geração de ocorrências. **HU07 não gera nenhuma ocorrência.** Alterações estruturais, se já houver ocorrências, recebem HTTP 409 até fluxo específico de replanejamento.
- **TEC09** poderá usar `quantidadePrevista` e `peso` como planejamento físico. `peso` é **operacional, nunca financeiro**. A soma ponderada da carteira não é validada por HU07.
- **TEC10 / HU10** poderá comparar `evidenciasEsperadas` com evidências reais. **Checklist não é arquivo nem comprovação**. Campos `quantidadeRealizada`, `statusExecucao`, `percentualExecucao` e `situacaoComprovacao` permanecem `null` no CRUD de planejamento.

Decisões ainda pendentes: PQ-04 (edição por colaborador), PQ-07/08 (comprovação), PQ-09/10 (recorrência), PQ-15 (avanço de etapa). Nenhum desses comportamentos é antecipado neste pacote.

## Rastreabilidade

PRD RF-06 a RF-10, RB-01/02/03/07/08/12/20, RNF-01/02/05/12; HU07-06 Sprint 04. O script `validar_fluxo_real.py` testa o fluxo Next/SuperTokens/Nest e, com `--validar-banco`, compara diretamente as entidades no PostgreSQL e a existência da auditoria transacional.
