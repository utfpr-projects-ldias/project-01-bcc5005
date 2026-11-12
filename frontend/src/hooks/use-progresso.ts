'use client';

import { useConsulta, useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';

export type ProgressoEntregavel = {
  entregavelId: string; nome: string; tipo: 'QUANTITATIVO' | 'RECORRENTE' | 'MARCO' | 'UNICO' | 'CONTINUO';
  realizado: string | null; previsto: string | null; percentualExecucao: number | null;
  pesoOperacional: string | null; dataEfetivaMarco: string | null;
  fonte: string; statusFisico: string; statusEntregavel?: 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'PENDENTE_CONCLUSAO' | 'PENDENTE_ENCERRAMENTO' | 'CONCLUIDO' | 'FINALIZADO' | null; editavel: boolean; inicioPrevisto: string | null; terminoPrevisto: string | null;
};
export type ProgressoContrato = {
  contratoId: string; statusContrato?: string; situacaoAdministrativa?: string; avancoSimples: number | null; avancoPonderado: number | null;
  modoCalculo: string; versaoPesos: string; avanco: number | null; configuracaoPendente: boolean; editavelPesos: boolean;
  pesosValidos: boolean; somaPesos: number | null; entregaveis: ProgressoEntregavel[];
};
export type AtualizacaoExecucao = {
  percentualManual?: number; quantidadeRealizada?: string; dataEfetivaMarco?: string;
};
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

/** A fonte do progresso físico é sempre o backend TEC09; não inferir de documentos. */
export function useProgresso(contratoId: string) {
  const cache = useRepositorioConsultasOpcional();
  const base = `${API}/contratos/${encodeURIComponent(contratoId)}`;
  const consulta = useConsulta(['execucao', contratoId], async signal => {
    const resposta = await fetch(`${base}/progresso`, { credentials: 'include', cache: 'no-store', signal });
    if (!resposta.ok) throw new Error(resposta.status === 404
      ? 'A API de progresso físico ainda não está disponível neste ambiente.'
      : `Não foi possível consultar o avanço físico (HTTP ${resposta.status}). Confira as migrations e os logs do backend.`);
    return await resposta.json() as ProgressoContrato;
  }, { habilitada: Boolean(contratoId) });
  return {
    progresso: consulta.dados ?? null, loading: consulta.carregando,
    erro: consulta.erro ? String(consulta.erro) : null, atualizar: consulta.atualizar,
    atualizarModoCalculo: async (versao: string, modoCalculo: 'SIMPLES' | 'PONDERADO') => {
      const resposta = await fetch(`${base}/modo-calculo`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versao, modoCalculo }),
      });
      if (!resposta.ok) throw new Error(resposta.status === 409
        ? 'O planejamento ou modo foi alterado. Atualize a consulta.'
        : resposta.status === 400 ? 'Para ativar o modo ponderado, configure pesos que somem 100%.'
        : 'Você não tem permissão ou não foi possível salvar o modo de cálculo.');
      cache?.invalidar(['contratos']);
      cache?.invalidar(['entregaveis', 'contrato', contratoId]);
      await consulta.atualizar();
    },
    atualizarPesoIndividual: async (entregavelId: string, versao: string, peso: string) => {
      const resposta = await fetch(`${base}/entregaveis/${encodeURIComponent(entregavelId)}/peso`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versao, peso }),
      });
      if (!resposta.ok) {
        if (resposta.status === 401 || resposta.status === 403) throw new Error('Sua conta não está autorizada a configurar pesos neste contrato (HTTP ' + resposta.status + ').');
        if (resposta.status === 409) throw new Error('O planejamento foi alterado. Atualize os dados e tente novamente.');
        if (resposta.status === 400) throw new Error('Use um peso de 0 a 100, com até quatro casas decimais.');
        throw new Error(`Não foi possível atualizar o peso (HTTP ${resposta.status}).`);
      }
      cache?.invalidar(['entregaveis', 'contrato', contratoId]);
      cache?.invalidar(['contratos']);
      await consulta.atualizar();
    },
    atualizarPesos: async (versao: string, pesos: { entregavelId: string; peso: string }[]) => {
      const resposta = await fetch(`${base}/pesos`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versao, pesos }) });
      if (!resposta.ok) throw new Error(resposta.status === 409 ? 'Planejamento alterado ou bloqueado. Atualize a consulta.' : 'Não foi possível salvar os pesos. Confira permissões e soma de 100%.');
      cache?.invalidar(['entregaveis', 'contrato', contratoId]);
      cache?.invalidar(['contratos']);
      await consulta.atualizar();
    },
    usarOcorrencias: async (entregavelId: string) => {
      const resposta = await fetch(`${base}/entregaveis/${encodeURIComponent(entregavelId)}/execucao/usar-ocorrencias`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      if (!resposta.ok) throw new Error(resposta.status === 409
        ? 'A situação do entregável mudou ou já existem ocorrências. Atualize os dados antes de conciliar.'
        : resposta.status === 403 ? 'Você não tem permissão para conciliar a execução.'
        : 'Não foi possível alterar a fonte de execução.');
      cache?.invalidar(['entregaveis', 'contrato', contratoId]);
      cache?.invalidar(['contratos']);
      await consulta.atualizar();
    },
    atualizarExecucao: async (entregavelId: string, dados: AtualizacaoExecucao) => {
      const resposta = await fetch(`${base}/entregaveis/${encodeURIComponent(entregavelId)}/execucao`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
      });
      if (!resposta.ok) throw new Error(resposta.status === 404
        ? 'A edição de execução ainda não está disponível na API TEC09.'
        : resposta.status === 409 ? 'Conflito de atualização; confira os dados.'
        : 'Não foi possível atualizar a execução.');
      cache?.invalidar(['entregaveis', 'contrato', contratoId]);
      await consulta.atualizar();
    },
  };
}
