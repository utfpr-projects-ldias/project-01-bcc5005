import { STATUS, type Contrato } from './contratos';

/** Texto contextual: revisão é condição, não novo status do banco nem filtro extra. */
export function faseEmRevisao(status: Contrato['status']): string {
  return status === 'EM_EXECUCAO' ? 'Em execução' : status === 'PLANEJAMENTO' ? 'Planejamento' : STATUS[status];
}

/** Uma situação visual por contrato, mesmo com resposta pendente em cache. */
export type SituacaoVisivelContrato = 'arquivados' | 'cancelados' | 'suspensos' | 'revisao' | 'pendentes' | 'concluidos' | 'ativos';
export function situacaoVisivelContrato(
  contrato: Pick<Contrato, 'arquivadoEm' | 'reabertoEm' | 'status' | 'conclusaoSolicitadaEm' | 'conclusaoParcialSolicitada'>,
  pendenteRemoto: boolean,
): SituacaoVisivelContrato {
  if (contrato.arquivadoEm) return 'arquivados';
  if (contrato.status === 'CANCELADO') return 'cancelados';
  if (contrato.status === 'SUSPENSO') return 'suspensos';
  if (contrato.conclusaoSolicitadaEm && !contrato.reabertoEm && !['CONCLUIDO','FINALIZADO','ENCERRADO'].includes(contrato.status)) return 'pendentes';
  if ((contrato.status === 'CONCLUIDO' || contrato.status === 'CONCLUIDO_PARCIALMENTE' || contrato.status === 'FINALIZADO' || contrato.status === 'ENCERRADO') && !contrato.reabertoEm) return 'concluidos';
  if (contrato.reabertoEm) return 'revisao';
  if (contrato.conclusaoSolicitadaEm === undefined && pendenteRemoto) return 'pendentes';
  return 'ativos';
}

/** Paleta de superfícies; não substitui o estado persistido. */
export type EstadoContextual = 'normal' | 'nao-iniciado' | 'andamento' | 'pendente' | 'parcial' | 'revisao' | 'concluido' | 'finalizado' | 'arquivado' | 'suspenso' | 'encerrado' | 'cancelado';
export function estadoContextualContrato(contrato?: Pick<Contrato, 'arquivadoEm' | 'reabertoEm' | 'status' | 'conclusaoSolicitadaEm' | 'conclusaoParcialSolicitada'>, pendenteConclusao = false): EstadoContextual {
  if (!contrato) return 'normal';
  if (contrato.arquivadoEm) return 'arquivado';
  if (contrato.status === 'CANCELADO') return 'cancelado';
  if (contrato.status === 'SUSPENSO') return 'suspenso';
  if (contrato.status === 'FINALIZADO' && !contrato.reabertoEm) return 'finalizado';
  if (contrato.status === 'ENCERRADO' && !contrato.reabertoEm) return 'encerrado';
  if (situacaoVisivelContrato(contrato, pendenteConclusao) === 'pendentes') return 'pendente';
  if (contrato.reabertoEm) return 'revisao';
  if (contrato.status === 'CONCLUIDO_PARCIALMENTE') return 'parcial';
  if (contrato.status === 'CONCLUIDO') return 'concluido';
  return 'normal';
}
