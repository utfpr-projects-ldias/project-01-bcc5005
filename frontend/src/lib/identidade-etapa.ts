import { STATUS_ETAPA, type Etapa } from './etapas';
import { estadoDoObjeto } from './identidade-operacional';
import type { EstadoContextual } from './estado-visivel-contrato';
export type IconeEtapa = 'planejamento' | 'andamento' | 'revisao' | 'pendente' | 'encerramento-pendente' | 'concluida' | 'parcial' | 'encerrada' | 'arquivada';
export function identidadeEtapa(e: Etapa): { rotulo: string; estado: EstadoContextual; icone: IconeEtapa } {
  if (e.arquivadoEm) return {rotulo:'Arquivada',estado:'arquivado',icone:'arquivada'};
  if (e.encerramentoSolicitadoEm) return {rotulo:'Pendente de encerramento',estado:'pendente',icone:'encerramento-pendente'};
  if (e.conclusaoSolicitadaEm) return {rotulo:e.conclusaoParcialSolicitada?'Pendente de conclusão parcial':'Pendente de conclusão',estado:'pendente',icone:'pendente'};
  if (e.reabertoEm) return {rotulo:'Em revisão',estado:'revisao',icone:'revisao'};
  const estado=estadoDoObjeto({objeto:'etapa',status:e.status});
  const icone: IconeEtapa=e.status==='CONCLUIDA'?'concluida':e.status==='CONCLUIDO_PARCIALMENTE'?'parcial':e.status==='FINALIZADA'||e.status==='ENCERRADA'?'encerrada':e.status==='EM_ANDAMENTO'?'andamento':'planejamento';
  return {rotulo:STATUS_ETAPA[e.status],estado,icone};
}
