import type { Ocorrencia } from './ocorrencia.entity.js';

type Intervalo = { inicio: string; fim: string };
type Periodo = Pick<Ocorrencia, 'periodoInicio' | 'periodoFim' | 'status'>;
const concluido = (o: Periodo) => ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status);
const chave = (inicio: string | null, fim: string | null) => `${inicio}/${fim}`;

/** A série histórica e a grade corrente devem cobrir a obrigação sem lacunas,
 * sobreposições ou períodos extras. Um registro somente cobre seu próprio intervalo. */
export function avaliarAgendaRecorrente(
  ocorrencias: readonly Periodo[], periodos: readonly Intervalo[], inicioAgenda: string,
  inicioObrigacao?: string | null, fimObrigacao?: string | null,
) {
  const anteriores = ocorrencias.filter(o => o.periodoFim != null && o.periodoFim < inicioAgenda);
  const atuais = ocorrencias.filter(o => !anteriores.includes(o));
  const grade = periodos.map(p => chave(p.inicio,p.fim));
  const registros = new Map<string, Periodo[]>();
  for (const o of atuais) {
    const k = chave(o.periodoInicio,o.periodoFim);
    registros.set(k,[...(registros.get(k) ?? []),o]);
  }
  const intervalos = [...anteriores.map(o=>({inicio:o.periodoInicio,fim:o.periodoFim})), ...periodos]
    .sort((a,b)=>(a.inicio??'').localeCompare(b.inicio??''));
  const continua = intervalos.every((p,i) => p.inicio != null && p.fim != null && p.inicio <= p.fim &&
    (i===0 || (intervalos[i-1].fim != null && Date.parse(`${intervalos[i-1].fim}T00:00:00Z`) + 86_400_000 === Date.parse(`${p.inicio}T00:00:00Z`))));
  const total = anteriores.length + periodos.length;
  const concluidas = anteriores.filter(concluido).length + grade.filter(k=>{
    const itens=registros.get(k); return itens?.length===1 && concluido(itens[0]);
  }).length;
  const completa = periodos.length > 0 && periodos[0].inicio === inicioAgenda && continua && total <= 500 &&
    (!inicioObrigacao || intervalos[0]?.inicio===inicioObrigacao) &&
    (!fimObrigacao || intervalos.at(-1)?.fim===fimObrigacao) &&
    atuais.length===grade.length && grade.every(k=>registros.get(k)?.length===1);
  return { completa, total, concluidas };
}

/** A mesma validação vale para projeção e aceite; pesos ausentes não viram 100%. */
export function avaliarPesosAgenda(ocorrencias: readonly Pick<Ocorrencia, 'pesoPeriodo'|'status'>[]) {
  if (!ocorrencias.some(o => o.pesoPeriodo != null)) return { configurados: false, validos: true, percentual: null };
  const pesos = ocorrencias.map(o => o.pesoPeriodo != null && /^\d{1,3}(?:\.\d{1,4})?$/.test(String(o.pesoPeriodo)) ? Math.round(Number(o.pesoPeriodo)*10000) : null);
  const validos = pesos.every(p => p != null && p >= 0 && p <= 1000000) && pesos.reduce<number>((s,p)=>s+(p??0),0)===1000000;
  return { configurados: true, validos, percentual: validos ? ocorrencias.reduce((s,o,i)=>s+(['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status)?pesos[i]!:0),0)/10000 : null };
}
