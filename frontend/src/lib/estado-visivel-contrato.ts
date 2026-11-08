import { STATUS, type Contrato } from './contratos';

/** Texto contextual: revisão é condição, não novo status do banco nem filtro extra. */
export function faseEmRevisao(status: Contrato['status']): string {
  return status === 'EM_EXECUCAO' ? 'Em execução' : status === 'PLANEJAMENTO' ? 'Planejamento' : STATUS[status];
}

/** Uma situação visual por contrato, mesmo com resposta pendente em cache. */
export type SituacaoVisivelContrato = 'arquivados' | 'cancelados' | 'suspensos' | 'revisao' | 'pendentes' | 'concluidos' | 'ativos';
export function situacaoVisivelContrato(
  contrato: Pick<Contrato, 'arquivadoEm' | 'reabertoEm' | 'status'>,
  pendenteRemoto: boolean,
): SituacaoVisivelContrato {
  if (contrato.arquivadoEm) return 'arquivados';
  if (contrato.status === 'CANCELADO') return 'cancelados';
  if (contrato.status === 'SUSPENSO') return 'suspensos';
  if ((contrato.status === 'CONCLUIDO' || contrato.status === 'ENCERRADO') && !contrato.reabertoEm) return 'concluidos';
  if (contrato.reabertoEm) return 'revisao';
  if (pendenteRemoto) return 'pendentes';
  return 'ativos';
}
