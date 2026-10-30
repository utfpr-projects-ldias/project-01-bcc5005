/**
 * V1: frequências fixas para o planejamento (HU07 / HU09).
 * Não incluir PERSONALIZADA antes de homologar PQ-10.
 * A geração real de períodos e os limites parciais são assunto da HU09 / PQ-09.
 */
export enum PeriodicidadeEntregavel {
  DIARIA = 'DIARIA',
  SEMANAL = 'SEMANAL',
  MENSAL = 'MENSAL',
  TRIMESTRAL = 'TRIMESTRAL',
  SEMESTRAL = 'SEMESTRAL',
  ANUAL = 'ANUAL',
}
