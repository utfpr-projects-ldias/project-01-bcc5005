import type { RepositorioConsultas } from './repositorio-consultas';
/** An upload may materialize destinations in multiple contracts from a persisted draft. */
export function sincronizarEvidenciaCompartilhada(cache?: RepositorioConsultas | null, contratoId?:string) {
  for (const chave of ['contratos','entregaveis','etapas','execucao','ocorrencias','atividades','evidencias','evidencias-destinos','dashboard','metas-marco']) cache?.invalidar([chave]);
  if(contratoId && typeof window!=='undefined' && window.parent!==window) window.parent.postMessage({tipo:'pi:evidencia-compartilhada-atualizada',contratoId},window.location.origin);
}
