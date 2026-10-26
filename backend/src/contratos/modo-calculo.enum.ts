/**
 * Modo de cálculo do avanço do contrato — PRD §8.2 e §6.4.
 * - SIMPLES: média dos percentuais dos entregáveis.
 * - PONDERADO: Σ (progresso × peso operacional).
 * Peso é sempre operacional, nunca financeiro (RB-12, P-04).
 * A troca simples→ponderado exige soma de pesos = 100% (EC-07) —
 * validação pertence a HU posterior, aqui só persistimos o modo.
 */
export enum ModoCalculo {
  SIMPLES = 'SIMPLES',
  PONDERADO = 'PONDERADO',
}