import { hojeCivil } from '../common/data-civil.js';
import { StatusExecucaoEntregavel as Status } from './status-execucao-entregavel.enum.js';
import type { Entregavel } from './entregavel.entity.js';
import { StatusOcorrencia } from '../ocorrencias/status-ocorrencia.enum.js';
import type { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';

/** Os dois estados abertos são uma projeção dos fatos de execução. Decisões
 * persistidas (inclusive reabertura) prevalecem e nunca são alteradas por GET. */
export function estadoOperacionalEntregavel(e: Pick<Entregavel, 'statusExecucao'|'reabertoEm'|'arquivadoEm'|'dataEfetivaMarco'>, percentual: number|null, ocorrencias: readonly Pick<Ocorrencia,'status'|'dataRealizada'|'substituidaEm'>[]): Status {
  const estado = e.statusExecucao ?? Status.NAO_INICIADO;
  if (e.arquivadoEm || e.reabertoEm || (estado !== Status.NAO_INICIADO && estado !== Status.EM_ANDAMENTO)) return estado;
  const inicio = estado === Status.EM_ANDAMENTO || (percentual ?? 0) > 0 || Boolean(e.dataEfetivaMarco) ||
    ocorrencias.some(o => !o.substituidaEm && (['EM_ANDAMENTO','EM_REVISAO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status) || Boolean(o.dataRealizada)));
  return inicio ? Status.EM_ANDAMENTO : Status.NAO_INICIADO;
}

/** Reconhecimento individual inicia a ocorrência mesmo quando o agregado recorrente é zero. */
export function estadoOcorrenciaReconhecida(o: Pick<Ocorrencia,'status'|'dataRealizada'|'substituidaEm'>, medicao: {progressoPercentual:number|null; quantidadeExecutada:number; atividadesVerificadas?:number; evidenciasFoto?:number; evidenciasRelatorio?:number; evidenciasOutras?:number}): StatusOcorrencia {
  if (o.substituidaEm || o.status !== StatusOcorrencia.NAO_INICIADO) return o.status;
  return (medicao.progressoPercentual ?? 0) > 0 || medicao.quantidadeExecutada > 0 || (medicao.atividadesVerificadas??0)>0 || (medicao.evidenciasFoto??0)+(medicao.evidenciasRelatorio??0)+(medicao.evidenciasOutras??0)>0 || o.dataRealizada ? StatusOcorrencia.EM_ANDAMENTO : o.status;
}

const TERMINAIS: readonly string[] = ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADA'];
export function indicadoresPrazo(prazo: string|null|undefined, estado: string, arquivado: boolean, dataFinal: string|null, hoje = hojeCivil()) {
  const terminal = TERMINAIS.includes(estado);
  return { atrasado: Boolean(!arquivado && !terminal && prazo && prazo < hoje), finalizadoComAtraso: Boolean(terminal && prazo && dataFinal && dataFinal > prazo) };
}
export function indicadoresPrazoEntregavel(e: Pick<Entregavel, 'terminoPrevisto'|'arquivadoEm'|'finalizadoEm'> & Partial<Pick<Entregavel, 'reabertoEm'>>, estado: string, hoje = hojeCivil()) {
  const estadoPrazo = e.reabertoEm && TERMINAIS.includes(estado) ? 'EM_REVISAO' : estado;
  return indicadoresPrazo(e.terminoPrevisto, estadoPrazo, Boolean(e.arquivadoEm), e.finalizadoEm ? hojeCivil(new Date(e.finalizadoEm)) : null, hoje);
}
