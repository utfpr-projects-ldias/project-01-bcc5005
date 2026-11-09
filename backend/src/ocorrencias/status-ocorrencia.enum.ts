/**
 * HU09-01 — situação operacional de uma ocorrência.
 *
 * NAO_INICIADO:
 * Ocorrência prevista, ainda sem execução iniciada.
 *
 * EM_ANDAMENTO:
 * Execução iniciada, mas ainda não concluída.
 *
 * CONCLUIDO:
 * Execução da ocorrência efetivamente concluída.
 *
 * Atraso não é um status. Deve ser identificado pela comparação
 * entre a data prevista e a situação operacional.
 *
 * O vocabulário acompanha os estados já utilizados
 * por StatusExecucaoEntregavel.
 */
export enum StatusOcorrencia {
  NAO_INICIADO = 'NAO_INICIADO',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDO = 'CONCLUIDO',
}