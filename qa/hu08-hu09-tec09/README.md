# QA integrado HU08 / HU09 / TEC09 (R27)

Este roteiro executa testes **reais** com Chromium/Next, SuperTokens, NestJS e, opcionalmente, consulta direta ao PostgreSQL. Não usa mocks para afirmar persistência.

**Execução automática no `./testes-all`:** após a criação real de dois contratos QA, a central passa os identificadores internamente, e o validador cria sua própria etapa com entregáveis `RECORRENTE` e `QUANTITATIVO`. Não há necessidade de fornecer UUIDs, rodar comando separado ou reutilizar entregáveis de outros testes. O resultado aparece como `QA-REAL-HU08-HU09-TEC09`, com JSON dentro do ZIP `TESTES-ALL`. A falha do roteiro conta como FAIL na central.

**Pré-requisitos:** serviços Docker no DEV, `./configurar-testes`, Playwright e credenciais QA locais. O validador só modifica contratos cuja observação comece com `QA código público:` (criadas pelo próprio executor). Dados de QA sintéticos são persistentes e não são limpos ao final; nenhum banco é redefinido.

**Somente para depuração manual (opcional):** na execução normal, utilize apenas `./testes-all`.

```bash
bash qa/hu08-hu09-tec09/RODAR-DEV.sh \
  --contrato-id UUID_DO_CONTRATO_QA \
  --outro-contrato-id UUID_DO_OUTRO_CONTRATO_QA \
  --confirmar-persistencia \
  --validar-banco \
  --saida "$HOME/Downloads/QA-HU08-HU09-TEC09-resultado.json"
```

Valida: autenticação pelo formulário real, geração recorrente idempotente, ocorrência quantitativa manual, lançamento numérico e retry pelo mesmo UUID, atividade vinculada a dois entregáveis/ocorrências, consulta de progresso TEC09, isolamento por contrato, tela do diário e conferência SQL opcional de relacionamentos, lançamento e auditoria.

Os testes Python sem infraestrutura rodam na central com os demais `teste_*.py`. A parte real é executada automaticamente pela central quando há contratos sintéticos e infraestrutura disponíveis; um `PASS` apenas dos testes Python não deve ser interpretado como execução real do navegador. O aceite funcional HU06 é executado automaticamente pela central. Aprovação formal de PR não é um teste. O script não grava cookies, senhas nem tokens nos relatórios.

## Extensão R28 — integridade de medições e cotas

O executor real integrado também cria uma **segunda ocorrência quantitativa** no mesmo contrato e valida, por API real:

- duas quantidades independentes na mesma atividade (1 unidade em A, 2 em B);
- tentativa de desvincular A sem atualizar as medições ⇒ HTTP 409 e dados intactos;
- edição explícita das medições e dos vínculos ⇒ B preservada, A removida da associação;
- lançamento manual de A mantido sem somar sua medição removida;
- antes da verificação, quantidade física por atividade ainda não aprovada;
- depois de solicitar e aprovar a atividade, B passa a contabilizar 2 unidades;
- alteração de cota para `null` ⇒ HTTP 400;
- com `--validar-banco`, medição e N:N conferidos diretamente no PostgreSQL.

**Importante:** as atividades e ocorrências de QA são **sintéticas e persistentes**. Use contratos exclusivos para o ensaio, porque após verificar a atividade o contexto pode mudar de estado e impedir novas edições. Na regressão `./testes-all`, os testes Python do roteiro e os testes **reais** aparecem como etapas distintas. O cenário real só recebe PASS se Chrome, API, dados de QA e PostgreSQL passarem. O comando manual permanece disponível para depuração específica, mas não é necessário na execução normal.


## Extensão R32 — conclusão, concorrência e replanejamento histórico

O QA integrado agora verifica situações adicionais com **dados exclusivos do DEV**:

1. Após aprovar a atividade, tentativas de reabertura enquanto uma ocorrência vinculada aguarda conclusão devem retornar HTTP 409 **sem mudar o estado da atividade**. A rotina reabre etapa/entregável (se fechados) e cada ocorrência pendente antes de solicitar a reabertura da atividade. Verifica quantidade 2 → 0 → 2 e nega segunda reabertura.
2. Duas requisições HTTP simultâneas enviam o **mesmo UUID** para uma ocorrência quantitativa exclusiva: deve existir apenas um lançamento e a quantidade executada deve ser 1,000. Essa concorrência ocorre na mesma sessão de navegador; não comprova isolamento entre duas identidades diferentes.
3. Um período recorrente diário é aprovado e preservado enquanto os sete períodos **futuros ainda sem execução** são consolidados em uma semana completa; uma tentativa de replanejar apenas dois dias como semana é rejeitada (HTTP 400) sem alteração na agenda. A prévia exige confirmação; reutilizar o token anterior após aplicar a agenda deve retornar HTTP 409.
4. Com `--validar-banco`, uma tabela **temporária** sofre violação deliberada de chave primária dentro de uma transação SQL, que deve ser revertida. Depois se confirma que a conexão está saudável e a tabela não persistiu. Esse ensaio **não derruba o PostgreSQL** e não substitui um teste de indisponibilidade da aplicação ou de commit incerto.

Os resultados específicos são registrados no `QA-REAL-HU08-HU09-TEC09.json`. Qualquer asserção malsucedida reprova o cenário na central. A execução completa desses acréscimos precisa ser confirmada no Docker/Chromium do projeto; os testes Python isolados avaliam apenas helpers e estruturas do roteiro.

## Extensão R35 — replanejamento semanal completo e evidência negativa

O QA prepara agora **oito dias** no entregável recorrente de teste: o dia atual mais sete dias futuros. Após o ciclo de reabertura e conclusão, mantém o dia concluído e testa dois caminhos:

1. **Rejeição:** `SEMANAL` com apenas dois dias futuros deve responder HTTP 400 e não alterar status, intervalos, substituições ou periodicidade dos registros.
2. **Confirmação:** uma semana futura completa deve retornar prévia com token, substituir exatamente sete ocorrências sem execução por uma ocorrência semanal, manter o dia histórico concluído e rejeitar reutilização do token antigo.

A verificação de rollback SQL isolado e a conferência PostgreSQL das medições continuam após o replanejamento, de modo que uma falha em qualquer etapa reprova a central. O roteiro passou a registrar o motivo resumido do erro HTTP para facilitar diagnósticos, sem salvar credenciais ou cookies.

Os testes de unidade Python para o roteiro não equivalem à execução real: a prova integrada desses dois casos depende da próxima execução `./testes-all` no DEV.

## Extensão R36 — metas de Marco e falha real de conexão isolada

O `QA-REAL-HU08-HU09-TEC09` cria um entregável MARCO de QA na etapa
sintética já criada, adiciona duas metas de atividade, testa vínculo pendente,
aprovação, duplicidade proibida, rejeição, invalidação **dinâmica** ao reabrir
atividade e restauração após nova aprovação. O QA verifica também que a medição
da ocorrência quantitativa não se altera. O cenário é executado pelo mesmo
`./testes-all`; a execução real ainda deve ser confirmada no DEV.

O `QA-REAL-POSTGRES-CONEXAO-ROLLBACK` termina somente a conexão PostgreSQL
aberta pelo próprio teste, dentro de um **banco novo exclusivo de QA**.
Confere que a transação não foi confirmada e que uma nova conexão funciona.
**Não** desliga o PostgreSQL compartilhado nem simula indisponibilidade do
servidor para todos os serviços. Nunca executar essa simulação na base DEV.

A automação funcional HU06 usa relatórios reais; revisão subjetiva e aceite
formal de PR permanecem humanos, pois não são verificações técnicas.
