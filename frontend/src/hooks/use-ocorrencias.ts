'use client';

import { useConsulta } from '@/app/components/provedor-consultas';

/** Campos e enum fornecidos pela API HU09-01/02. */
export type StatusOcorrencia = 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'CONCLUIDO';
export type OrigemOcorrencia = 'RECORRENTE' | 'MANUAL_QUANTITATIVA';
export type Ocorrencia = {
  id: string; contratoId: string; entregavelId: string; titulo: string;
  periodoInicio: string | null; periodoFim: string | null;
  dataPrevista: string | null; dataRealizada: string | null;
  status: StatusOcorrencia; origem: OrigemOcorrencia;
  quantidadeRealizada: string | null; observacoes: string | null;
};
export type NovaOcorrenciaManual = {
  entregavelId: string; titulo: string; periodoInicio?: string;
  periodoFim?: string; dataPrevista?: string;
  quantidadeRealizada?: string; observacoes?: string;
};
export type EdicaoOcorrencia = Partial<Pick<Ocorrencia, 'titulo' | 'dataPrevista' | 'dataRealizada' | 'status' | 'quantidadeRealizada' | 'observacoes'>>;
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

async function mensagemErro(resposta: Response, padrao: string) {
  if (resposta.status === 401 || resposta.status === 403) return 'Você não tem permissão para esta operação.';
  if (resposta.status === 409) return 'Os dados foram alterados ou estão em conflito. Atualize a agenda.';
  if (resposta.status === 404) return 'Recurso não encontrado ou módulo HU09 ainda não disponível neste ambiente.';
  return padrao;
}

export function useOcorrencias(contratoId: string) {
  const base = `${API}/contratos/${encodeURIComponent(contratoId)}/ocorrencias`;
  const consulta = useConsulta(['ocorrencias', contratoId], async signal => {
    const resposta = await fetch(base, { credentials: 'include', cache: 'no-store', signal });
    if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível consultar a agenda do contrato.'));
    const dados: unknown = await resposta.json();
    if (Array.isArray(dados)) return dados as Ocorrencia[];
    if (dados && typeof dados === 'object' && 'data' in dados && Array.isArray(dados.data)) return dados.data as Ocorrencia[];
    throw new Error('A API devolveu um formato de agenda inválido.');
  }, { habilitada: Boolean(contratoId) });
  return {
    ocorrencias: consulta.dados ?? [], loading: consulta.carregando,
    erro: consulta.erro ? (consulta.erro instanceof Error ? consulta.erro.message : 'Falha ao consultar ocorrências.') : null,
    atualizar: consulta.atualizar,
    criarOcorrenciaManual: async (dados: NovaOcorrenciaManual) => {
      if (!contratoId || !dados.entregavelId) throw new Error('Selecione o contrato e um entregável quantitativo.');
      const { entregavelId, ...corpo } = dados;
      // O ID do entregável pertence à rota, não ao DTO (whitelist do NestJS).
      const url = `${API}/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(entregavelId)}/ocorrencias`;
      const resposta = await fetch(url, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível registrar a ocorrência.'));
      await consulta.atualizar();
    },
    gerarOcorrenciasRecorrentes: async (entregavelId: string): Promise<number> => {
      if (!contratoId || !entregavelId) throw new Error('Selecione um contrato e um entregável recorrente.');
      const url = `${API}/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(entregavelId)}/ocorrencias/gerar`;
      const resposta = await fetch(url, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forcarRegeneracaoFuturas: false }) });
      if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível gerar períodos recorrentes.'));
      const resultado: unknown = await resposta.json();
      await consulta.atualizar();
      return resultado && typeof resultado === 'object' && 'novasGeradas' in resultado && typeof resultado.novasGeradas === 'number'
        ? resultado.novasGeradas : 0;
    },
    editarOcorrencia: async (id: string, dados: EdicaoOcorrencia) => {
      if (!contratoId || !id) throw new Error('Selecione uma ocorrência válida.');
      const resposta = await fetch(`${base}/${encodeURIComponent(id)}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível atualizar a ocorrência.'));
      await consulta.atualizar();
    },
  };
}
