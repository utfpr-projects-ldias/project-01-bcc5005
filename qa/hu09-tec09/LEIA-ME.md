# HU09/TEC09 — homologação e contrato de dados

## Contrato de dados para Sprint 05
- `GET /contratos/:contratoId/progresso`: `modoCalculo`, `versaoPesos`, `avanco`, `avancoSimples`, `avancoPonderado`, `somaPesos`, `pesosValidos`, `configuracaoPendente`, `editavelPesos`, `entregaveis`. Cada entregável: `entregavelId`, `nome`, `tipo`, `previsto`, `realizado` (decimais em texto), `percentualExecucao` (número ou null), `pesoOperacional`, `dataEfetivaMarco`, datas previstas, `fonte`, `statusFisico`, `editavel`, `comprovacao: NAO_AVALIADA`. Null não é 0. Não consumir `statusExecucao` legado para inferir 100% físico.
- `PATCH /contratos/:contratoId/entregaveis/:entregavelId/execucao`: exatamente um campo: `percentualManual` (0–100, duas casas, Único/Contínuo), `quantidadeRealizada` (decimal textual, Quantitativo sem ocorrências), `dataEfetivaMarco` (ISO civil, Marco). Recorrente é atualizado pela agenda. Registros quantitativos detalhados substituem a fonte direta, nunca são somados duas vezes. Total declarado diferente de zero impede iniciar detalhamento sem conciliação explícita. Nenhuma operação modifica prova.
- `PATCH /contratos/:contratoId/pesos`: `{versao,pesos:[{entregavelId,peso}]}`. Todos entregáveis ativos, soma decimal exata 100; operação atômica ativa ponderado. Versão obsoleta resulta em 409. Modo PONDERADO escolhido na HU05 sem soma válida permanece configuração pendente. A seleção SIMPLES continua pela edição do contrato. Contratos suspensos/cancelados/encerrados preservam leitura histórica e não aceitam edição física.
- `POST /contratos/:contratoId/entregaveis/:entregavelId/ocorrencias/replanejar`: `{inicioFuturo,terminoPrevisto,periodicidade}` fornece prévia e token `confirmacao`; repetir com o token aplica atomicamente se a agenda permanecer idêntica. Preserva períodos anteriores, executados, iniciados, alterados ou vinculados; mudança incompatível é rejeitada. Períodos removidos da agenda ativa são mantidos com `substituidaEm`, não excluídos. Período histórico idêntico pode ser reativado sob as mesmas proteções. A rota `/gerar` permanece idempotente e aditiva, não aceita forçar regeneração.
- `POST /contratos/:id/impacto-vigencia`: campos parciais `inicioVigencia`, `terminoVigencia`; devolve token, quantidades e incompatibilidades. `PATCH /contratos/:id` recebe `confirmacaoVigencia` se houver impacto. Alterações incompatíveis exigem replanejamento prévio; registros executados/past permanecem históricos. Não congela automaticamente por suspensão.
- Atividades: `ocorrenciaId` opcional em POST/PATCH; omitir preserva vínculo na edição, `null` retira, UUID vincula apenas a ocorrência ativa de um entregável da atividade e do mesmo contrato. `GET .../atividades?ocorrenciaId=...`; detalhe da ocorrência retorna `atividades`. Vínculos N:N de entregáveis continuam obrigatórios. Nenhuma evidência HU10 fictícia.

## Decisões e restrições
- Conjunto físico: entregáveis não arquivados, em etapas não arquivadas, do contrato consultado. Ocorrências substituídas não participam. Contratos inativos não são descartados de seu próprio histórico. Não há cálculo agregado de etapa (PQ-15).
- Recorrências de 29–31, períodos parciais e personalização não homologada são bloqueados (PQ-09/10); não é uma solução definitiva de calendário. Limite de 500 períodos por geração.
- O fechamento documental legado usa `statusExecucao`. O novo `statusFisico` é calculado separadamente para não bloquear comprovantes ao atingir 100%. Entregáveis legados fechados sem percentual explícito não recebem 100% inventado. A separação integral do ciclo de vida e comprovação fica para regularização TEC10, sem reinterpretação dos históricos.
- Campos adicionais da migration 1795600000000 são todos anuláveis. A migration não corrige dados retroativamente. Não executar `migration:revert`, `down -v` ou apagar volumes para testar.

## Gates automatizados (sem escrita no banco)
Na raiz, branch `hu09-tec09-ajustes`, Docker ativo:
```
bash qa/tec08-uiux-final/VALIDAR.sh --target
bash qa/tec08-uiux-final/VALIDAR.sh --full
bash qa/tec08-uiux-final/VALIDAR.sh --qa-verificar
```
O primeiro gate inclui os novos testes focais de HU09/TEC09. O terceiro confirma pré-voos e logins, não equivale à homologação integral.

## HU09-05 / TEC09-05 — homologação real obrigatória
Usar somente contrato sintético de DEV, isolado da carteira real. Criar contrato de teste com vigência suficiente e etapas abertas. Não alterar contratos existentes sem autorização. Registrar IDs, percentuais, HTTP, evidência SQL e resultado após reinício; não anexar senhas, cookies ou dados pessoais ao PR.

1. Atividade antiga sem ocorrência e vinculada a dois entregáveis: preservar título, data e dois vínculos. Criar ocorrência num deles, editar atividade e selecionar ocorrência; recarregar; retirar vínculo e recarregar. Testar tentativa com ocorrência de outro entregável/contrato (409/403/404; nenhuma alteração).
2. Recorrente: datas com intervalos completos e futuras; gerar, repetir (mesmas IDs; zero novas), iniciar/concluir uma ocorrência, conferir data realizada. Replanejar uma fronteira futura completa, ler prévia, cancelar, comparar lista; repetir e confirmar; verificar antigas executadas intactas e substituídas disponíveis no histórico. Testar token obsoleto e tentativa de substituir ocorrência vinculada; ambos 409.
3. Quantitativo meta 10: duas ocorrências manuais (6 e 9); 15 realizado, 100% físico; edição de quantidade, recarregar. Testar quantitativo separado com quantidade direta. Não permitir fonte dupla sem conciliação. Sem ocorrências previstas: recorrente retorna não calculável.
4. Único 50%, contínuo 25%, Marco data efetiva e 100%; comparar GET progresso com UI de contrato, entregável e execução. Não adicionar comprovantes; comprovação permanece não avaliada pelo motor. Em contrato separado, pesos 20/30/50 e percentuais 100/50/25 = 47,5%. Testar soma 99/101, token obsoleto, dois envios concorrentes; nenhuma gravação parcial; modo pendente legado não deve desaparecer.
5. Vigência: consultar impacto de expansão, confirmar e verificar mesmos IDs e datas; redução que alcança futura exige replanejamento explícito. Contrato suspenso/cancelado: leitura continua e mutação falha. Testar Admin, Gestor autorizado, Colaborador sem delegação e acesso cruzado, além de sessão ausente.
6. Reiniciar apenas serviços de aplicação (não volumes): `docker compose restart backend frontend`. Recarregar e comparar mesmos IDs, quantidades, pesos, datas e auditoria. Conferir tema claro/escuro, teclado, mobile e UI anterior.
7. SQL somente leitura (dentro do `psql`, substitua o UUID por contrato de QA):
```
BEGIN READ ONLY;
SELECT id,entregavel_id,periodo_inicio,periodo_fim,status,quantidade_realizada,substituida_em FROM ocorrencias WHERE contrato_id='UUID_QA' ORDER BY entregavel_id,periodo_inicio;
SELECT id,"ocorrenciaId",titulo FROM atividades WHERE "contratoId"='UUID_QA';
SELECT id,tipo,quantidade_prevista,quantidade_realizada,percentual_execucao,peso,data_efetiva_marco,agenda_inicio_futuro FROM entregaveis WHERE contrato_id='UUID_QA';
ROLLBACK;
```
Registre também eventos de auditoria na interface de histórico e resposta real da API. Não declarar HU09-04/05 ou TEC09-04/05 integralmente homologadas antes de completar os cenários de concorrência, rollback e integração real.
