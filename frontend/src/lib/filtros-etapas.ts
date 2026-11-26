import type { Etapa } from './etapas';
import { identidadeEtapa } from './identidade-etapa';
import { resultadoFinalizacao } from './finalizados';

export type AbaEtapas = 'todas' | 'revisao' | 'pendentes' | 'concluidas' | 'arquivadas';
const andamento = [['PLANEJADA', 'Em planejamento'], ['EM_ANDAMENTO', 'Em andamento']] as const;
const finais = [['CONCLUIDA', 'Concluída'], ['CONCLUIDO_PARCIALMENTE', 'Concluída parcialmente'], ['ENCERRADA', 'Encerrada'], ['FINALIZADA', 'Finalizada']] as const;
const pendencias = [['PENDENTE_CONCLUSAO', 'Pendente de conclusão'], ['PENDENTE_CONCLUSAO_PARCIAL', 'Pendente de conclusão parcial'], ['PENDENTE_ENCERRAMENTO', 'Pendente de encerramento']] as const;
export const filtrosEtapas: Record<AbaEtapas, readonly (readonly [string, string])[]> = {
  todas: andamento,
  revisao: andamento,
  pendentes: pendencias,
  concluidas: finais,
  arquivadas: [...andamento, ...finais],
};

/** Estado exibido e solicitação têm precedência sobre o estado persistido. */
export function etapaNaAba(etapa: Etapa, aba: AbaEtapas, filtro = ''): boolean {
  const pendencia = etapa.encerramentoSolicitadoEm ? 'PENDENTE_ENCERRAMENTO' : etapa.conclusaoSolicitadaEm ? (etapa.conclusaoParcialSolicitada ? 'PENDENTE_CONCLUSAO_PARCIAL' : 'PENDENTE_CONCLUSAO') : null;
  if (aba === 'arquivadas') return Boolean(etapa.arquivadoEm) && (!filtro || etapa.status === filtro);
  if (etapa.arquivadoEm) return false;
  const revisao = identidadeEtapa(etapa).estado === 'revisao';
  const final = resultadoFinalizacao('etapa', etapa.status) !== null;
  if (aba === 'revisao') return revisao && (!filtro || etapa.status === filtro);
  if (aba === 'pendentes') return pendencia !== null && (!filtro || pendencia === filtro);
  if (aba === 'concluidas') return !etapa.reabertoEm && !pendencia && final && (!filtro || etapa.status === filtro);
  return !revisao && !pendencia && !final && (!filtro || etapa.status === filtro);
}
