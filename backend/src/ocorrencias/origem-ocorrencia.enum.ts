/**
 * HU09-01 — origem contratual da ocorrência.
 *
 * RECORRENTE:
 * Instância de execução pertencente a um período do planejamento
 * periódico de um entregável do tipo RECORRENTE.
 *
 * MANUAL_QUANTITATIVA:
 * Registro individual de execução associado a um entregável
 * do tipo QUANTITATIVO.
 *
 * A origem é persistida para distinguir as regras de idempotência.
 */
export enum OrigemOcorrencia {
  RECORRENTE = 'RECORRENTE',
  MANUAL_QUANTITATIVA = 'MANUAL_QUANTITATIVA',
  MANUAL_DESCRITIVA = 'MANUAL_DESCRITIVA',
}