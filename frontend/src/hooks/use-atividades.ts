'use client';

import { useConsulta } from '@/app/components/provedor-consultas';

export type Atividade = {
  id: string; contratoId: string; titulo: string; dataHora: string; descricao: string;
  tipo: string; responsavel: string | null; participantes: string[] | null;
  local: string | null; duracao: string | null; observacoes: string | null;
  entregaveis: { id: string; nome: string; codigoPublico?: number }[];
};
export type DadosAtividade = {
  contratoId: string; titulo: string; dataHora: string; descricao: string; tipo: string;
  responsavel?: string; participantes?: string[]; local?: string; duracao?: string;
  observacoes?: string; entregavelIds: string[];
};
export type FiltrosAtividade = { dataInicio?: string; dataFim?: string; entregavelId?: string; responsavelId?: string; page?: number; limit?: number };
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
    throw new Error(mensagens[resposta.status] ?? 'Não foi possível realizar a operação no diário.');
  }
  return await resposta.json() as T;
}

export function useAtividades(contratoId: string, filtros: FiltrosAtividade = {}) {
  const { dataInicio = '', dataFim = '', entregavelId = '', responsavelId = '', page = 1, limit = 20 } = filtros;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (dataInicio) params.set('dataInicio', dataInicio);
  if (dataFim) params.set('dataFim', dataFim);
  if (entregavelId) params.set('entregavelId', entregavelId);
  if (responsavelId) params.set('responsavelId', responsavelId);
  const consulta = useConsulta(
    ['atividades', contratoId, dataInicio, dataFim, entregavelId, responsavelId, String(page), String(limit)],
    (signal) => requisitar<ListaAtividades>(`${base(contratoId)}?${params.toString()}`, { signal }),
    { habilitada: Boolean(contratoId) },
  );
  return {
    atividades: consulta.dados?.data ?? [], total: consulta.dados?.meta.total ?? 0,
    loading: consulta.carregando, erro: consulta.erro ? String(consulta.erro) : null,
    atualizar: consulta.atualizar,
    criarAtividade: async (dados: DadosAtividade) => {
      const resposta = await requisitar<Atividade>(base(contratoId), { method: 'POST', body: JSON.stringify(dados) });
      await consulta.atualizar();
      return resposta;
    },
    editarAtividade: async (id: string, dados: Partial<Omit<DadosAtividade, 'contratoId'>>) => {
      const resposta = await requisitar<Atividade>(`${base(contratoId)}/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(dados) });
      await consulta.atualizar();
      return resposta;
    },
  };
}
