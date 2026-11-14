import type { EstadoAtividade } from '@/hooks/use-atividades';

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
export type VinculoCompartilhado = {
  contratoId: string; entregavelIds: string[]; ocorrenciaIds: string[];
  medicoes: { ocorrenciaId: string; quantidade: string }[];
};
export type NovaCompartilhada = {
  titulo: string; dataHora: string; descricao: string; tipo: string;
  observacoes?: string; local?: string; duracao?: string; vinculos: VinculoCompartilhado[];
};
export type ResumoCompartilhada = {
  id: string; total: number; aprovadas: number; pendentes: number;
  atividades: { contratoId: string; atividadeId: string; status: EstadoAtividade; podeSolicitar: boolean; podeAprovar: boolean }[];
};
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API}/atividades-compartilhadas${path}`, {
    credentials: 'include', cache: 'no-store', ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  if (!resp.ok) {
    let detalhe = '';
    try { const corpo = await resp.json() as { message?: string | string[] }; const msg = corpo.message;
      detalhe = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join(' · ') : ''; }
    catch { /* sem informação adicional */ }
    throw new Error(detalhe || (resp.status === 403 ? 'Sem permissão em um dos contratos.' : 'Operação multicontrato não realizada.'));
  }
  return await resp.json() as T;
}
export function criarCompartilhada(dto: NovaCompartilhada) {
  return json<{ id: string; total: number; atividades: { contratoId: string; atividadeId: string }[] }>('', {
    method: 'POST', body: JSON.stringify(dto),
  });
}
export function consultarCompartilhada(id: string) { return json<ResumoCompartilhada>(`/${encodeURIComponent(id)}`); }
export function aprovarCompartilhada(id: string, contratoIds?: string[]) {
  return json<{ id: string; total: number; aprovadas: number; novasAprovacoes: number }>(`/${encodeURIComponent(id)}/aprovar`, {
    method: 'POST', body: JSON.stringify(contratoIds ? { contratoIds } : {}),
  });
}

export function solicitarCompartilhada(id: string, contratoIds?: string[]) {
  return json<{ id: string; total: number; pendentes: number; novasSolicitacoes: number }>(`/${encodeURIComponent(id)}/solicitar`, {
    method: 'POST', body: JSON.stringify(contratoIds ? { contratoIds } : {}),
  });
}
