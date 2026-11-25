/**
 * Modo de cálculo do avanço do contrato — PRD §8.2 e §6.4.
 * - SIMPLES: média dos percentuais dos entregáveis.
 * - PONDERADO: Σ (progresso × peso operacional).
 * Peso é sempre operacional, nunca financeiro (RB-12, P-04).
 * Distribuição parcial: decisão solicitada em 24/11/2026, divergente de EC-07.
 * A soma inferior a 100% é provisória; o fechamento continua bloqueado.
 */
export enum ModoCalculo {
  SIMPLES = 'SIMPLES',
  PONDERADO = 'PONDERADO',
}