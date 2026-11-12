'use client';

import { useConsulta } from '@/app/components/provedor-consultas';

export type ProgressoEntregavel = {
  entregavelId: string; nome: string; tipo: 'QUANTITATIVO' | 'RECORRENTE' | 'MARCO' | 'UNICO' | 'CONTINUO';
  realizado: string | null; previsto: string | null; percentualExecucao: number | null;
  pesoOperacional: string | null; dataEfetivaMarco: string | null;
};
export type ProgressoContrato = {
  contratoId: string; avancoSimples: number | null; avancoPonderado: number | null;
  pesosValidos: boolean; somaPesos: number | null; entregaveis: ProgressoEntregavel[];
};
export type AtualizacaoExecucao = {
  percentualManual?: number; quantidadeRealizada?: string; dataEfetivaMarco?: string;
};
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

/** A fonte do progresso físico é sempre o backend TEC09; não inferir de documentos. */
export function useProgresso(contratoId: string) {
  const base = `${API}/contratos/${encodeURIComponent(contratoId)}`;
  const consulta = useConsulta(['execucao', contratoId], async signal => {
    const resposta = await fetch(`${base}/progresso`, { credentials: 'include', cache: 'no-store', signal });
    if (!resposta.ok) throw new Error(resposta.status === 404
      ? 'A API de progresso físico ainda não está disponível neste ambiente.'
      : 'Não foi possível consultar o avanço físico.');
    return await resposta.json() as ProgressoContrato;
  }, { habilitada: Boolean(contratoId) });
  return {
    progresso: consulta.dados ?? null, loading: consulta.carregando,
    erro: consulta.erro ? String(consulta.erro) : null, atualizar: consulta.atualizar,
    atualizarExecucao: async (entregavelId: string, dados: AtualizacaoExecucao) => {
      const resposta = await fetch(`${base}/entregaveis/${encodeURIComponent(entregavelId)}/execucao`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
      });
      if (!resposta.ok) throw new Error(resposta.status === 404
        ? 'A edição de execução ainda não está disponível na API TEC09.'
        : resposta.status === 409 ? 'Conflito de atualização; confira os dados.'
        : 'Não foi possível atualizar a execução.');
      await consulta.atualizar();
    },
  };
}
