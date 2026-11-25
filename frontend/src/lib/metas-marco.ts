export type TipoMetaMarco = 'OCORRENCIA' | 'ATIVIDADE' | 'EVIDENCIA';
export type VinculoMeta = {
  id: string; status: 'PENDENTE' | 'APROVADO' | 'REJEITADO';
  ocorrenciaId: string | null; atividadeId: string | null; comprovanteId: string | null;
  elegivel: boolean; solicitadoEm: string;
};
export type MetaMarco = {
  id: string; titulo: string; tipo: TipoMetaMarco; quantidadeExigida: number;
  dataPrevista: string | null; inicioPrevisto: string | null; terminoPrevisto: string | null;
  observacoes: string | null; quantidadeAprovada: number; percentualPreparacao: number;
  pronto: boolean; vinculos: VinculoMeta[];
};
export type ResumoMetasMarco = { entregavelId: string; metas: MetaMarco[];
  total: number; concluidas: number; percentualPreparacao: number; aptoPelasMetas: boolean };
export type DadosMetaMarco = { titulo: string; tipo: TipoMetaMarco; quantidadeExigida: number;
  dataPrevista?: string | null; inicioPrevisto?: string | null; terminoPrevisto?: string | null;
  observacoes?: string | null };
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const url = (c: string, e: string, caminho = '') =>
  `${API}/contratos/${encodeURIComponent(c)}/entregaveis/${encodeURIComponent(e)}/metas${caminho}`;
async function solicitar<T>(c: string, e: string, caminho = '', init?: RequestInit): Promise<T> {
  const resposta = await fetch(url(c,e,caminho), { credentials: 'include', cache: 'no-store', ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  if (!resposta.ok) {
    let mensagem = '';
    try { const corpo = await resposta.json() as { message?: string | string[] };
      mensagem = Array.isArray(corpo.message) ? corpo.message.join(' · ') : corpo.message ?? ''; }
    catch { /* resposta vazia */ }
    throw new Error(mensagem || (resposta.status === 403 ? 'Sem permissão para esta operação.' : 'Não foi possível atualizar as metas.'));
  }
  return await resposta.json() as T;
}
export const listarMetasMarco = (c:string,e:string) => solicitar<ResumoMetasMarco>(c,e);
export const criarMetaMarco = (c:string,e:string,d:DadosMetaMarco) =>
  solicitar<MetaMarco>(c,e,'',{ method:'POST',body:JSON.stringify(d) });
export const editarMetaMarco = (c:string,e:string,id:string,d:Partial<Omit<DadosMetaMarco,'tipo'>>) =>
  solicitar<MetaMarco>(c,e,`/${encodeURIComponent(id)}`,{ method:'PATCH',body:JSON.stringify(d) });
export const candidatosMetaMarco = (c:string,e:string,id:string) =>
  solicitar<{id:string;titulo:string}[]>(c,e,`/${encodeURIComponent(id)}/candidatos`);
export const vincularMetaMarco = (c:string,e:string,id:string,registroId:string) =>
  solicitar<MetaMarco>(c,e,`/${encodeURIComponent(id)}/vinculos`,{ method:'POST',body:JSON.stringify({registroId}) });
export const decidirVinculoMeta = (c:string,e:string,id:string,vinculoId:string,aprovar:boolean,justificativa='') =>
  solicitar<MetaMarco>(c,e,`/${encodeURIComponent(id)}/vinculos/${encodeURIComponent(vinculoId)}/${aprovar?'aprovar':'rejeitar'}`,
    {method:'POST',body:JSON.stringify({justificativa})});
