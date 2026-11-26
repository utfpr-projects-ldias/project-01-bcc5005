'use client';
import { sincronizarEvidenciaCompartilhada } from '@/lib/sincronizar-evidencia-compartilhada';

import { useConsulta, useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';

export type EstadoAtividade = 'REGISTRADA' | 'PENDENTE_CONCLUSAO' | 'VERIFICADA' | 'ARQUIVADA';
export type FiltroEstadoAtividade = EstadoAtividade | 'ATIVAS' | 'TODAS_ATUAIS' | ''; // ATIVAS: somente registradas; pendentes e finalizadas possuem abas próprias

export type Atividade = {
  id: string; contratoId: string; atividadeCompartilhadaId?: string | null; titulo: string; dataHora: string; descricao: string;
  tipo: string; responsavel: string | null; responsavelId?:string|null; participantes: string[] | null;
  local: string | null; duracao: string | null; observacoes: string | null;
  ocorrenciaId?: string | null; ocorrenciaIds?: string[]; medicoesDiretas?: {entregavelId:string;quantidade:string}[]; medicoes?: { ocorrenciaId: string; quantidade: string }[]; ocorrencias?: {id: string; entregavelId: string; titulo: string; status: string; inicioPeriodo?: string | null; terminoPeriodo?: string | null}[]; quantidadeExecucao?: string | null;
  entregaveis: { id: string; nome: string; codigoPublico?: number; etapaId?: string }[];
  parcelasPercentuais?:{entregavelId:string;ocorrenciaId?:string;percentual:string}[];
  comprovantesVinculados?: number; comprovantesHistoricos?:number; contribuicoesDiario?: { destino:string; entregavelId:string|null; ocorrenciaId:string|null; valor:number; valorExato?:string|null; unidade:string; situacao:string; reconhecida:boolean }[];
  status: EstadoAtividade; verificadaEm: string | null; arquivadaEm: string | null; excluidaEm?: string | null;
};
export type DadosAtividade = {
  contratoId: string; titulo: string; dataHora: string; descricao: string; tipo: string;
  responsavelId?: string | null; responsavel?: string; participantes?: string[]; local?: string; duracao?: string;
  referenciaQuantitativa?:string; ocorrenciaReferenciaId?:string;
  parcelasPercentuais?:{entregavelId:string;ocorrenciaId?:string;percentual:string}[];
  percentualExecucao?: string; comprovaExecucaoId?: string; entregavelExecucaoId?: string; ocorrenciaExecucaoId?: string;
  observacoes?: string; ocorrenciaId?: string | null; ocorrenciaIds?: string[]; medicoesDiretas?: {entregavelId:string;quantidade:string}[]; medicoes?: { ocorrenciaId: string; quantidade: string }[]; entregavelIds: string[];
};
export type OrdemDiario = 'recentes'|'antigas'|'duracao-desc'|'duracao-asc';
export type FiltroPresenca = ''|'sim'|'nao';
export type FiltrosAtividade = { responsavel?:string; comEvidencias?:FiltroPresenca; comExecucao?:FiltroPresenca; busca?:string; tipo?:string; ordem?:OrdemDiario; diario?:boolean; habilitada?:boolean; ocorrenciaId?: string; dataInicio?: string; dataFim?: string; etapaId?: string; entregavelId?: string; responsavelId?: string; status?: FiltroEstadoAtividade; page?: number; limit?: number };
type ListaAtividades = { data: Atividade[]; meta: { total: number; page: number; lastPage: number; contagens?: {status:EstadoAtividade;total:number}[] } };
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const base = (contratoId: string) => `${API}/contratos/${encodeURIComponent(contratoId)}/atividades`;

async function requisitar<T>(url: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { credentials: 'include', cache: 'no-store', ...init,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  } catch { throw new Error('Falha de conexão com o diário.'); }
  if (!resposta.ok) {
    const mensagens: Record<number, string> = {
      400: 'Confira os campos, a data e os entregáveis selecionados.',
      401: 'Sessão expirada. Faça login novamente.',
      403: 'Sem permissão para esta operação.',
      404: 'Contrato ou atividade não encontrado ou não autorizado.',
      409: 'Os dados foram alterados por outra operação. Atualize e tente novamente.',
    };
    // 400 e 409 podem conter validações de negócio úteis (sem stack trace/SQL).
    let detalhe: unknown;
    if (resposta.status === 400 || resposta.status === 409) {
      try { detalhe = (await resposta.json() as { message?: unknown }).message; } catch { /* resposta vazia */ }
    }
    const texto = typeof detalhe === 'string' ? detalhe : Array.isArray(detalhe) && detalhe.every(v => typeof v === 'string')
      ? detalhe.join(' · ') : '';
    throw new Error(texto || mensagens[resposta.status] || `Não foi possível realizar a operação no diário (HTTP ${resposta.status}).`);
  }
  return await resposta.json() as T;
}

export async function listarAtividadesVinculaveis(contratoId: string, entregavelId: string, signal?: AbortSignal, incluirVerificadas = false): Promise<ListaAtividades> {
  const params = new URLSearchParams({ entregavelId, page: '1', limit: '50', ...(incluirVerificadas?{}:{status:'REGISTRADA'}) });
  const primeira=await requisitar<ListaAtividades>(`${base(contratoId)}?${params}`, { signal });
  const data=[...primeira.data];
  for(let pagina=2;pagina<=primeira.meta.lastPage;pagina++) {
    params.set('page',String(pagina));
    const parte=await requisitar<ListaAtividades>(`${base(contratoId)}?${params}`,{signal});
    data.push(...parte.data);
  }
  return {...primeira,data:incluirVerificadas?data.filter(a=>a.status==='REGISTRADA'||a.status==='VERIFICADA'):data};
}

export type ComprovanteAtividade = {
  id: string; nomeOriginal: string; tipoEvidencia: string; status: 'VERIFICADA'|'PENDENTE_VERIFICACAO'|'REJEITADA'; entregavelId: string; vinculado: boolean; vigente?:boolean;
};
export function pesquisarResponsaveisAtividade(contratoId:string,busca:string,signal?:AbortSignal) {
  return requisitar<{itens:{id:string;email:string;nome?:string|null}[];total:number}>(`${base(contratoId)}/responsaveis?${new URLSearchParams({busca})}`,{signal});
}
export function listarEvidenciasAtividade(contratoId: string, atividadeId: string): Promise<{
  vinculadas: ComprovanteAtividade[]; disponiveis: ComprovanteAtividade[];
}> {
  return requisitar(`${base(contratoId)}/${encodeURIComponent(atividadeId)}/evidencias`);
}
export function desvincularEvidenciaAtividade(contratoId:string,atividadeId:string,comprovanteId:string){
  return requisitar<{vinculado:boolean}>(`${base(contratoId)}/${encodeURIComponent(atividadeId)}/evidencias/${encodeURIComponent(comprovanteId)}`,{method:'DELETE'});
}
export function vincularEvidenciaAtividade(contratoId: string, atividadeId: string, comprovanteId: string) {
  return requisitar<{ vinculado: boolean }>(`${base(contratoId)}/${encodeURIComponent(atividadeId)}/evidencias`, {
    method: 'POST', body: JSON.stringify({ comprovanteId }),
  });
}

export function consultarAtividade(contratoId: string, id: string, signal?: AbortSignal): Promise<Atividade> {
  return requisitar<Atividade>(`${base(contratoId)}/${encodeURIComponent(id)}`, { signal });
}
export function editarAtividadeApi(contratoId: string, id: string, dados: Partial<Omit<DadosAtividade, 'contratoId'>>): Promise<Atividade> {
  return requisitar<Atividade>(`${base(contratoId)}/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(dados) });
}
export function transicionarAtividadeApi(contratoId: string, id: string,
  acao: 'solicitar-conclusao' | 'aprovar-conclusao' | 'cancelar-solicitacao' | 'verificar' | 'reabrir' | 'arquivar' | 'reativar' | 'excluir', justificativa = ''): Promise<Atividade | { excluida: true }> {
  return requisitar<Atividade | { excluida: true }>(`${base(contratoId)}/${encodeURIComponent(id)}/${acao}`,
    { method: 'POST', body: JSON.stringify(['verificar', 'solicitar-conclusao', 'aprovar-conclusao'].includes(acao) ? {} : { justificativa }) });
}

export function useAtividades(contratoId: string, filtros: FiltrosAtividade = {}) {
  const cache = useRepositorioConsultasOpcional();
  const { ocorrenciaId = '', dataInicio = '', dataFim = '', etapaId = '', entregavelId = '', responsavelId = '', status = '', page = 1, limit = 20, busca = '', tipo = '', ordem = 'recentes', diario = false, habilitada = true, responsavel = '', comEvidencias = '', comExecucao = '' } = filtros;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (ocorrenciaId) params.set('ocorrenciaId', ocorrenciaId);
  if (dataInicio) params.set('dataInicio', dataInicio);
  if (dataFim) params.set('dataFim', dataFim);
  if (etapaId) params.set('etapaId', etapaId);
  if (entregavelId) params.set('entregavelId', entregavelId);
  if (responsavelId) params.set('responsavelId', responsavelId);
  if (status) params.set('status', status);
  if (busca) params.set('busca', busca);
  if (responsavel) params.set('responsavel', responsavel);
  if (comEvidencias) params.set('comEvidencias', comEvidencias);
  if (comExecucao) params.set('comExecucao', comExecucao);
  if (tipo) params.set('tipo', tipo);
  if (ordem !== 'recentes') params.set('ordem', ordem);
  if (diario) params.set('diario', '1');
  const consulta = useConsulta(
    ['atividades', contratoId, ocorrenciaId, dataInicio, dataFim, etapaId, entregavelId, responsavelId, status, String(page), String(limit), busca, tipo, ordem, diario ? "diario" : "lista", responsavel, comEvidencias, comExecucao],
    (signal) => requisitar<ListaAtividades>(`${base(contratoId)}?${params.toString()}`, { signal }),
    { habilitada: Boolean(contratoId) && habilitada, validadeMs: 10000, manterDadosNoEscopo: diario ? `diario:${contratoId}` : undefined },
  );
  return {
    atividades: consulta.dados?.data ?? [], total: consulta.dados?.meta.total ?? 0, contagens: consulta.dados?.meta.contagens,
    loading: consulta.carregando, atualizando: consulta.atualizando, erro: consulta.erro ? String(consulta.erro) : null,
    atualizar: consulta.atualizar,
    criarAtividade: async (dados: DadosAtividade) => {
      const resposta = await requisitar<Atividade>(base(contratoId), { method: 'POST', body: JSON.stringify(dados) });
      // A consulta por atividades Registradas do modal de conclusão pode usar
      // outra paginação. Todas as variantes devem ser invalidadas ao criar.
      cache?.invalidar(['atividades', contratoId]); cache?.invalidar(['ocorrencias', contratoId]);
      cache?.invalidar(['execucao', contratoId]); cache?.invalidar(['entregaveis', 'contrato', contratoId]); cache?.invalidar(['etapas','contrato',contratoId]);
      cache?.invalidar(['contratos', 'elegibilidade-conclusao', contratoId]);
      await consulta.atualizar().catch(() => {});
      window.dispatchEvent(new CustomEvent('pi:estrutura-operacional-atualizada', {detail:{contratoId}}));
      return resposta;
    },
    transicionarAtividade: async (id: string, acao: 'solicitar-conclusao' | 'aprovar-conclusao' | 'cancelar-solicitacao' | 'verificar' | 'reabrir' | 'arquivar' | 'reativar' | 'excluir', justificativa = '') => {
      const resposta = await transicionarAtividadeApi(contratoId, id, acao, justificativa);
      if('atividadeCompartilhadaId' in resposta && resposta.atividadeCompartilhadaId && ['aprovar-conclusao','verificar','solicitar-conclusao'].includes(acao))sincronizarEvidenciaCompartilhada(cache,contratoId);
      cache?.invalidar(['atividades', contratoId]); cache?.invalidar(['ocorrencias', contratoId]);
      cache?.invalidar(['execucao', contratoId]); cache?.invalidar(['entregaveis', 'contrato', contratoId]); cache?.invalidar(['etapas','contrato',contratoId]);
      cache?.invalidar(['contratos', 'elegibilidade-conclusao', contratoId]);
      await consulta.atualizar().catch(() => {});
      window.dispatchEvent(new CustomEvent('pi:estrutura-operacional-atualizada', {detail:{contratoId}}));
      return resposta;
    },
    editarAtividade: async (id: string, dados: Partial<Omit<DadosAtividade, 'contratoId'>>) => {
      const resposta = await editarAtividadeApi(contratoId, id, dados);
      cache?.invalidar(['atividades', contratoId]); cache?.invalidar(['ocorrencias', contratoId]);
      cache?.invalidar(['execucao', contratoId]); cache?.invalidar(['entregaveis', 'contrato', contratoId]); cache?.invalidar(['etapas','contrato',contratoId]);
      cache?.invalidar(['contratos', 'elegibilidade-conclusao', contratoId]);
      await consulta.atualizar().catch(() => {});
      window.dispatchEvent(new CustomEvent('pi:estrutura-operacional-atualizada', {detail:{contratoId}}));
      return resposta;
    },
  };
}

/** Consulta mensal completa para o calendário, sem depender da página atual do diário. */
export async function listarAtividadesCalendario(contratoId:string, inicio:string, fim:string, signal?:AbortSignal){
  const registros:Atividade[]=[];
  let page=1;
  do {
    const params=new URLSearchParams({dataInicio:inicio,dataFim:fim,page:String(page),limit:'100'});
    const resposta=await requisitar<ListaAtividades>(`${base(contratoId)}?${params}`,{signal});
    registros.push(...resposta.data);
    if(page>=resposta.meta.lastPage || !resposta.data.length)break;
    page++;
  }while(!signal?.aborted);
  return registros;
}
