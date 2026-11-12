# HU09/TEC09 — regularização após os Ajustes 02 (Patch 03)

## Objetivo
Corrigir a comunicação e interface do progresso físico sem alterar o PRD: execução não equivale a comprovação documental; os pesos são operacionais e a transição de modo é real, versionada e auditável.

## Contratos de API

- `PATCH /contratos/:contratoId/modo-calculo`, política `pesos:atualizar`, JSON `{ "modoCalculo": "SIMPLES" | "PONDERADO", "versao": "<sha256>" }`.
- A troca para ponderado requer pesos atuais válidos totalizando 100%. A volta para simples mantém os pesos.
- O backend confere vínculo/permissões, contrato editável e versão de planejamento, usa transação e audita mudança.
- `PATCH /contratos/:contratoId/pesos` permanece o fluxo de configurar o lote e ativar ponderado.
- Não há nova migration: `modoCalculo` já é persistido no contrato e os pesos nos entregáveis.

## Ocorrências e a decisão PQ-09/10

A geração recorrente permanece **sem períodos parciais automáticos**, como especificado nas restrições vigentes. O erro agora informa o último intervalo que ultrapassa o término do entregável, com datas civis. Ajustar datas no planejamento exige permissão e análise de efeitos; **não** criar ocorrências parciais apenas para fazer o teste passar. A definição de semântica de meses com dias 29–31 também permanece pendente.

## UI/UX

- Visão geral não recebe novamente o painel complexo: existe a aba própria **Execução**.
- Resumo compacto do contrato, contexto de status e avisos claros quando o indicador é incalculável.
- Configuração de pesos recolhida, com campos textuais decimais (`inputMode=decimal`) e `%`, sem spinbox cru.
- Os botões de configuração só aparecem a quem tem permissões. Selecionar o modo aciona backend, não muda só o visual.
- Cada cartão de entregável abre seu **próprio modal** com dados relevantes, fontes, status e ocorrências vinculadas; não redireciona o comando “Ver detalhes”.
- Alteração física permanece separada da conclusão documental.

## QA no computador Linux

1. Aplicador `--check`, `--apply`, `--verify`; `git diff --cached --check`.
2. `docker compose exec -T backend npm test -- --runInBand` e backend lint/build.
3. `docker compose exec -T frontend npm test -- --runInBand` e frontend lint/build.
4. `bash qa/tec08-uiux-final/VALIDAR.sh --target`, `--full`, `--qa-verificar`.
5. Confirmar migration `179560...` `[X]`; este patch **não executa** migrations.
6. Usuário autorizado: modo simples → configurar pesos 100% → ponderado → simples; verificar atualização após recarga e evento de auditoria. Usuário não autorizado: controles ausentes e API retorna 403.
7. Recorrente com vigência integral: geração; recorrente parcial: mensagem com o intervalo excedente e sem persistir novos períodos.
8. Para entregável quantitativo, registrar uma ocorrência e conferir percentual; não somar quantidade declarada duas vezes.
9. Conferir contexto de cores em contratos normais, suspensos, reabertos e concluídos, sem a cor do contrato sobrescrever o entregável.

Sem execução real do Docker/PostgreSQL e aceitação dos pontos PQ pendentes, este documento não significa homologação final das sub-issues HU09-05 e TEC09-05.
