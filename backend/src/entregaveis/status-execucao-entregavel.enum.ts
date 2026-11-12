/**
 * Vocabulário físico provisório; TEC09 decidirá transições e cálculo.
 * NULL no banco representa ausência de avaliação operacional nesta HU07.
 */
export enum StatusExecucaoEntregavel {
  NAO_INICIADO = 'NAO_INICIADO',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDO = 'CONCLUIDO',
  PENDENTE_CONCLUSAO = 'PENDENTE_CONCLUSAO',
  PENDENTE_ENCERRAMENTO = 'PENDENTE_ENCERRAMENTO',
  FINALIZADO = 'FINALIZADO',
}
