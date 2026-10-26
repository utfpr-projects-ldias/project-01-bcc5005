/**
 * Seis estados operacionais do contrato — RF-02 (PRD §4.1).
 * Atraso NÃO é estado; é sinalizador derivado (RB-09, RF-30, §7.6).
 * Suspensão não reprograma nem congela nada por si só (EC-05).
 */
export enum StatusContrato {
  PLANEJAMENTO = 'PLANEJAMENTO',
  EM_EXECUCAO = 'EM_EXECUCAO',
  EM_ENCERRAMENTO = 'EM_ENCERRAMENTO',
  CONCLUIDO = 'CONCLUIDO',
  SUSPENSO = 'SUSPENSO',
  CANCELADO = 'CANCELADO',
}