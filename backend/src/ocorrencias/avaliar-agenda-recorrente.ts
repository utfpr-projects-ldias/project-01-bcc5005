import type { Ocorrencia } from './ocorrencia.entity.js';

/** Um registro concluído antigo pode cobrir somente um período novo.
 * Preserva os períodos anteriores à revisão sem modificar suas datas.
 * O fechamento físico exige agenda integralmente representada.
 */
export function avaliarAgendaRecorrente(
  ocorrencias: Pick<Ocorrencia, 'periodoInicio' | 'periodoFim' | 'status'>[],
  periodos: Array<{ inicio: string; fim: string }>,
  inicioAgenda: string,
) {
  const anteriores = ocorrencias.filter(o => Boolean(o.periodoFim && o.periodoFim < inicioAgenda));
  const futuras = ocorrencias.filter(o => !anteriores.includes(o));
  const usadas = new Set<number>();
  for (const o of futuras.filter(o => o.status === 'CONCLUIDO')) {
    const indice = periodos.findIndex((p, i) => !usadas.has(i) &&
      Boolean(o.periodoInicio && o.periodoFim && o.periodoInicio <= p.fim && o.periodoFim >= p.inicio));
    if (indice >= 0) usadas.add(indice);
  }
  const completa = periodos.every((p, i) => usadas.has(i) ||
    futuras.some(o => o.status !== 'CONCLUIDO' && o.periodoInicio === p.inicio && o.periodoFim === p.fim));
  const concluidasAnteriores = anteriores.filter(o => o.status === 'CONCLUIDO').length;
  const total = anteriores.length + periodos.length;
  const concluidas = concluidasAnteriores + usadas.size;
  return { completa, total, concluidas };
}
