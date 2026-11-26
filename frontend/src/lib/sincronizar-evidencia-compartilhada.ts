import type { RepositorioConsultas } from './repositorio-consultas';

export const EVENTO_REGISTROS_COMPARTILHADOS = 'pi:registros-compartilhados-atualizados';
const CANAL = 'pi:registros-compartilhados-v1';
const origemLocal = `${Date.now()}-${Math.random()}`;
function invalidar(cache?: RepositorioConsultas | null) {
  for (const chave of ['contratos','entregaveis','etapas','execucao','ocorrencias','atividades','evidencias','evidencias-destinos','dashboard','metas-marco']) cache?.invalidar([chave]);
}
function avisar() { window.dispatchEvent(new Event(EVENTO_REGISTROS_COMPARTILHADOS)); }

/** Cada aba/iframe tem seu próprio cache. O sinal não transporta dados nem identificadores. */
export function observarRegistrosCompartilhados(cache: RepositorioConsultas) {
  const receber = () => { invalidar(cache); avisar(); };
  const receberStorage = (evento: StorageEvent) => { if (evento.key === CANAL && evento.newValue) receber(); };
  let canal: BroadcastChannel | undefined;
  try { if (typeof window.BroadcastChannel === 'function') { canal = new window.BroadcastChannel(CANAL); canal.onmessage = evento => { if (evento.data !== origemLocal) receber(); }; } } catch { /* fallback storage */ }
  window.addEventListener('storage', receberStorage);
  return () => { canal?.close(); window.removeEventListener('storage', receberStorage); };
}

/** Chamar somente depois de uma mutação confirmada; todas as visões consultam sua própria ACL. */
export function sincronizarEvidenciaCompartilhada(cache?: RepositorioConsultas | null, contratoId?: string) {
  invalidar(cache);
  if (typeof window === 'undefined') return;
  avisar();
  if (!contratoId) return;
  let canal: BroadcastChannel | undefined;
  try {
    if (typeof window.BroadcastChannel === 'function') {
      canal = new window.BroadcastChannel(CANAL);
      canal.postMessage(origemLocal);
      return;
    }
  } catch { /* fallback para outros contextos da mesma origem */ }
  finally { canal?.close(); }
  try { window.localStorage.setItem(CANAL, `${Date.now()}-${Math.random()}`); window.localStorage.removeItem(CANAL); } catch { /* armazenamento desabilitado */ }
}
