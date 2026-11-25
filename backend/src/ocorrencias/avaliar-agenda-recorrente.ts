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
  for (const o of futuras.filter(o => ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status))) {
    const indice = periodos.findIndex((p, i) => !usadas.has(i) &&
      Boolean(o.periodoInicio && o.periodoFim && o.periodoInicio <= p.fim && o.periodoFim >= p.inicio));
    if (indice >= 0) usadas.add(indice);
  }
  const completa = periodos.every((p, i) => usadas.has(i) ||
    futuras.some(o => !['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status) && o.periodoInicio === p.inicio && o.periodoFim === p.fim));
  const concluidasAnteriores = anteriores.filter(o => ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status)).length;
  const total = anteriores.length + periodos.length;
  const concluidas = concluidasAnteriores + usadas.size;
  return { completa, total, concluidas };
}

/** A mesma validação vale para projeção e aceite; pesos ausentes não viram 100%. */
export function avaliarPesosAgenda(ocorrencias: readonly Pick<Ocorrencia, 'pesoPeriodo'|'status'>[]) {
  if (!ocorrencias.some(o => o.pesoPeriodo != null)) return { configurados: false, validos: true, percentual: null };
  const pesos = ocorrencias.map(o => o.pesoPeriodo != null && /^\d{1,3}(?:\.\d{1,4})?$/.test(String(o.pesoPeriodo)) ? Math.round(Number(o.pesoPeriodo)*10000) : null);
  const validos = pesos.every(p => p != null && p >= 0 && p <= 1000000) && pesos.reduce<number>((s,p)=>s+(p??0),0)===1000000;
  return { configurados: true, validos, percentual: validos ? ocorrencias.reduce((s,o,i)=>s+(['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status)?pesos[i]!:0),0)/10000 : null };
}
