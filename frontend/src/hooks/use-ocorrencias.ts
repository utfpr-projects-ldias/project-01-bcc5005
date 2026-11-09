'use client';

import { useConsulta } from '@/app/components/provedor-consultas';

/** Contrato previsto pela HU09-02: a página não inventa ocorrências sem API real. */
export type Ocorrencia = {
  id: string; entregavelId: string; titulo: string; periodoInicio: string | null;
  periodoFim: string | null; dataPrevista: string | null; dataRealizada: string | null;
  status: 'PREVISTA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
  quantidadeRealizada: string | null; observacoes: string | null;
};
export type NovaOcorrenciaManual = {
  entregavelId: string; titulo: string; periodoInicio: string; periodoFim: string;
  dataPrevista: string; quantidadeRealizada?: string; observacoes?: string;
};
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export function useOcorrencias(contratoId: string) {
  const base = `${API}/contratos/${encodeURIComponent(contratoId)}/ocorrencias`;
  const consulta = useConsulta(['ocorrencias', contratoId], async signal => {
    const resposta = await fetch(base, { credentials: 'include', cache: 'no-store', signal });
    if (!resposta.ok) throw new Error(resposta.status === 404
      ? 'A API de ocorrências ainda não está disponível neste ambiente.'
      : 'Não foi possível consultar a agenda do contrato.');
    const dados: unknown = await resposta.json();
    if (Array.isArray(dados)) return dados as Ocorrencia[];
    if (dados && typeof dados === 'object' && 'data' in dados && Array.isArray(dados.data)) return dados.data as Ocorrencia[];
    throw new Error('A API devolveu um formato de agenda inválido.');
  }, { habilitada: Boolean(contratoId) });
  return {
    ocorrencias: consulta.dados ?? [], loading: consulta.carregando,
    erro: consulta.erro ? String(consulta.erro) : null,
    atualizar: consulta.atualizar,
    criarOcorrenciaManual: async (dados: NovaOcorrenciaManual) => {
      const resposta = await fetch(`${base}/manuais`, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
      if (!resposta.ok) throw new Error(resposta.status === 404
        ? 'O cadastro manual ainda não está disponível na API HU09.'
        : resposta.status === 409 ? 'Conflito de ocorrência. Atualize a agenda.'
        : 'Não foi possível registrar a ocorrência.');
      await consulta.atualizar();
    },
  };
}
