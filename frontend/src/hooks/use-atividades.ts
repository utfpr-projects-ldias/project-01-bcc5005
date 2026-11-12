'use client';

import { useConsulta, useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';

export type EstadoAtividade = 'REGISTRADA' | 'PENDENTE_CONCLUSAO' | 'VERIFICADA' | 'ARQUIVADA';
export type FiltroEstadoAtividade = EstadoAtividade | 'ATIVAS' | ''; // ATIVAS: somente registradas; pendentes e finalizadas possuem abas próprias

export type Atividade = {
  id: string; contratoId: string; titulo: string; dataHora: string; descricao: string;
  tipo: string; responsavel: string | null; participantes: string[] | null;
  local: string | null; duracao: string | null; observacoes: string | null;
  ocorrenciaId?: string | null; ocorrenciaIds?: string[]; ocorrencias?: {id: string; entregavelId: string; titulo: string; status: string; inicioPeriodo?: string | null; terminoPeriodo?: string | null}[]; quantidadeExecucao?: string | null;
  entregaveis: { id: string; nome: string; codigoPublico?: number }[];
  status: EstadoAtividade; verificadaEm: string | null; arquivadaEm: string | null; excluidaEm?: string | null;
};
export type DadosAtividade = {
  contratoId: string; titulo: string; dataHora: string; descricao: string; tipo: string;
  responsavel?: string; participantes?: string[]; local?: string; duracao?: string;
  observacoes?: string; ocorrenciaId?: string | null; ocorrenciaIds?: string[]; entregavelIds: string[];
};
export type FiltrosAtividade = { ocorrenciaId?: string; dataInicio?: string; dataFim?: string; etapaId?: string; entregavelId?: string; responsavelId?: string; status?: FiltroEstadoAtividade; page?: number; limit?: number };
type ListaAtividades = { data: Atividade[]; meta: { total: number; page: number; lastPage: number } };
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
  const { ocorrenciaId = '', dataInicio = '', dataFim = '', etapaId = '', entregavelId = '', responsavelId = '', status = '', page = 1, limit = 20 } = filtros;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (ocorrenciaId) params.set('ocorrenciaId', ocorrenciaId);
  if (dataInicio) params.set('dataInicio', dataInicio);
  if (dataFim) params.set('dataFim', dataFim);
  if (etapaId) params.set('etapaId', etapaId);
  if (entregavelId) params.set('entregavelId', entregavelId);
  if (responsavelId) params.set('responsavelId', responsavelId);
  if (status) params.set('status', status);
  const consulta = useConsulta(
    ['atividades', contratoId, ocorrenciaId, dataInicio, dataFim, etapaId, entregavelId, responsavelId, status, String(page), String(limit)],
    (signal) => requisitar<ListaAtividades>(`${base(contratoId)}?${params.toString()}`, { signal }),
    { habilitada: Boolean(contratoId) },
  );
  return {
    atividades: consulta.dados?.data ?? [], total: consulta.dados?.meta.total ?? 0,
    loading: consulta.carregando, atualizando: consulta.atualizando, erro: consulta.erro ? String(consulta.erro) : null,
    atualizar: consulta.atualizar,
    criarAtividade: async (dados: DadosAtividade) => {
      const resposta = await requisitar<Atividade>(base(contratoId), { method: 'POST', body: JSON.stringify(dados) });
      // A consulta por atividades Registradas do modal de conclusão pode usar
      // outra paginação. Todas as variantes devem ser invalidadas ao criar.
      cache?.invalidar(['atividades', contratoId]); cache?.invalidar(['ocorrencias', contratoId]);
      await consulta.atualizar();
      return resposta;
    },
    transicionarAtividade: async (id: string, acao: 'solicitar-conclusao' | 'aprovar-conclusao' | 'cancelar-solicitacao' | 'verificar' | 'reabrir' | 'arquivar' | 'reativar' | 'excluir', justificativa = '') => {
      const resposta = await transicionarAtividadeApi(contratoId, id, acao, justificativa);
      await consulta.atualizar();
      return resposta;
    },
    editarAtividade: async (id: string, dados: Partial<Omit<DadosAtividade, 'contratoId'>>) => {
      const resposta = await editarAtividadeApi(contratoId, id, dados);
      cache?.invalidar(['atividades', contratoId]); cache?.invalidar(['ocorrencias', contratoId]);
      await consulta.atualizar();
      return resposta;
    },
  };
}
