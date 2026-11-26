import type { Entregavel } from './entregaveis';
import { resultadoFinalizacao } from './finalizados';
import { rotuloEstadoEntregavel } from './identidade-operacional';
export type AbaEntregaveis = 'ativos' | 'revisao' | 'pendentes' | 'comprovados' | 'arquivados';
const ativos = ['Não iniciado', 'Em andamento'];
const pendencias = ['Pendente de conclusão', 'Pendente de conclusão parcial', 'Pendente de encerramento', 'Pendente de regularização documental'];
const finais = ['Concluído', 'Concluído parcialmente', 'Encerrado', 'Concluído · Encerrado', 'Concluído parcialmente · Encerrado'];
export const filtrosEntregaveis: Record<AbaEntregaveis, readonly string[]> = {
  ativos, revisao: ativos, pendentes: pendencias, comprovados: finais, arquivados: [...ativos, ...pendencias, ...finais],
};
export function abaDoEntregavel(e: Entregavel): AbaEntregaveis {
  if (e.arquivadoEm) return 'arquivados';
  if (e.regularizacaoDocumentalSolicitada || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')) return 'pendentes';
  if (e.reabertoEm) return 'revisao';
  return resultadoFinalizacao('entregavel', e.statusExecucao) !== null ? 'comprovados' : 'ativos';
}
export function situacaoFiltroEntregavel(e: Entregavel): string {
  // A aba já identifica revisão/arquivo; o filtro descreve a fase do objeto.
  return rotuloEstadoEntregavel(e.statusExecucao, false, false, Boolean(e.regularizacaoDocumentalSolicitada), Boolean(e.motivoFinalizacao));
}
