import type { EstadoContextual } from './estado-visivel-contrato';

/** Uma situação por entidade: situação física, comprovação e arquivamento são dimensões distintas.
 * Esta função serve somente à apresentação; nunca altera os estados persistidos ou o progresso.
 */
export type TipoObjetoOperacional = 'contrato' | 'etapa' | 'entregavel' | 'ocorrencia' | 'atividade' | 'evidencia' | 'documento';
export interface IdentificacaoSituacao {
  objeto: TipoObjetoOperacional;
  status: string | null | undefined;
  arquivado?: boolean;
  reaberto?: boolean;
  pendenteConclusao?: boolean;
}

/** Retorna a cor semântica da situação real do objeto; não herda a cor do contrato-pai. */
export function estadoDoObjeto({ objeto, status, arquivado, reaberto, pendenteConclusao }: IdentificacaoSituacao): EstadoContextual {
  if (arquivado || status === 'ARQUIVADA' || status === 'ARQUIVADO') return 'arquivado';
  // Solicitações pendentes prevalecem sobre o marcador histórico de reabertura:
  // o usuário precisa ver a decisão que está aguardando análise, não a revisão anterior.
  if (status === 'PENDENTE_ENCERRAMENTO') return 'finalizado';
  if (status === 'PENDENTE_CONCLUSAO') return 'concluido';
  if (reaberto) return 'revisao';
  if (pendenteConclusao) return 'concluido';
  if (status === 'CANCELADO') return 'cancelado';
  if (status === 'SUSPENSO') return 'suspenso';
  if (status === 'ENCERRADO' || status === 'ENCERRADA') return 'encerrado';
  if (status === 'FINALIZADO' || status === 'FINALIZADA') return 'finalizado';
  if (status === 'PENDENTE_ENCERRAMENTO') return 'finalizado';
  if (status === 'PENDENTE_CONCLUSAO' || pendenteConclusao) return 'concluido';
  if (status === 'CONCLUIDO' || status === 'CONCLUIDA' || status === 'VERIFICADA' || status === 'VERIFICADO') return 'concluido';
  if (status === 'EM_REVISAO') return 'revisao';
  if (status === 'PENDENTE_VERIFICACAO' || status === 'AGUARDANDO_ENVIO' || status === 'SEM_ENVIO') return 'pendente';
  if (status === 'EM_ANDAMENTO' || status === 'EM_EXECUCAO' || status === 'REGISTRADA') return 'andamento';
  if (objeto === 'etapa' && status === 'PLANEJADA') return 'andamento';
  if (status === 'NAO_INICIADO' || status === 'PLANEJADA' || status === 'PLANEJAMENTO') return 'andamento';
  // EM_ENCERRAMENTO no contrato é uma fase administrativa, não execução integral.
  if (objeto === 'contrato' && status === 'EM_ENCERRAMENTO') return 'pendente';
  return 'normal';
}

/** Cada transição é uma AÇÃO, não o status do pai ou o progresso do filho. */
export type IntencaoAcao = 'neutra' | 'editar' | 'criar' | 'solicitar-conclusao' | 'concluir' | 'verificar' | 'solicitar-encerramento' | 'encerrar' | 'suspender' | 'cancelar' | 'arquivar' | 'reabrir' | 'reativar' | 'excluir';
export const CLASSES_ACAO_MENU: Record<IntencaoAcao, string> = {
  neutra: 'border-slate-500/30 text-foreground hover:bg-slate-500/15',
  editar: 'border-teal-500/40 text-teal-700 dark:text-teal-200 hover:bg-teal-500/15',
  criar: 'border-green-500/40 text-green-700 dark:text-green-200 hover:bg-green-500/15',
  'solicitar-conclusao': 'border-violet-500/40 text-violet-700 dark:text-violet-200 hover:bg-violet-500/15',
  concluir: 'border-violet-500/40 text-violet-700 dark:text-violet-200 hover:bg-violet-500/15',
  verificar: 'border-violet-500/40 text-violet-700 dark:text-violet-200 hover:bg-violet-500/15',
  'solicitar-encerramento': 'border-purple-500/40 text-purple-700 dark:text-purple-200 hover:bg-purple-500/15',
  encerrar: 'border-purple-500/40 text-purple-700 dark:text-purple-200 hover:bg-purple-500/15',
  suspender: 'border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/15',
  cancelar: 'border-red-500/40 text-red-700 dark:text-red-200 hover:bg-red-500/15',
  arquivar: 'border-orange-500/55 text-orange-700 dark:text-orange-300 hover:bg-orange-500/15 focus-visible:outline-orange-500',
  reabrir: 'border-slate-500/35 text-foreground hover:bg-slate-500/15',
  reativar: 'border-teal-500/40 text-teal-700 dark:text-teal-200 hover:bg-teal-500/15',
  excluir: 'border-red-500/40 text-red-700 dark:text-red-200 hover:bg-red-500/15',
};
