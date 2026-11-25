'use client';
import { useConsulta, useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { criarEtapa, editarEtapa, listarEtapas, reordenarEtapas, consultarElegibilidadeEtapa, type AtualizacaoEtapa, type DadosEtapa } from '@/lib/etapas';
import { sincronizarContrato } from '@/lib/sincronizar-contrato';
import { chaveTexto } from '@/lib/repositorio-consultas';

export const CHAVES_ETAPAS = { lista: (contratoId: string) => ['etapas', 'contrato', contratoId] as const };
export function useEtapas(contratoId: string, habilitada = true) {
  return useConsulta(CHAVES_ETAPAS.lista(contratoId), () => listarEtapas(contratoId), { habilitada: habilitada && !!contratoId, validadeMs: 10000 });
}
export function useElegibilidadeEtapa(contratoId: string, etapaId: string, habilitada = true) {
  return useConsulta([...CHAVES_ETAPAS.lista(contratoId), 'elegibilidade', etapaId],
    signal => consultarElegibilidadeEtapa(contratoId, etapaId, signal), { habilitada: habilitada && !!contratoId && !!etapaId });
}
export function useMutacoesEtapas(contratoId: string) {
  const cache = useRepositorioConsultas();
  const chave = CHAVES_ETAPAS.lista(contratoId);
  return {
    criar: async (dados: DadosEtapa) => {
      const etapa = await criarEtapa(contratoId, dados);
      sincronizarContrato(cache, contratoId);
      return etapa;
    },
    editar: async (etapaId: string, dados: AtualizacaoEtapa) => {
      const etapa = await editarEtapa(contratoId, etapaId, dados);
      sincronizarContrato(cache, contratoId);
      return etapa;
    },
    reordenar: async (ordemAnterior: string[], ordemNova: string[]) => {
      const lista = await reordenarEtapas(contratoId, ordemAnterior, ordemNova);
      cache.gravar(chaveTexto(chave), lista);
      sincronizarContrato(cache, contratoId);
      return lista;
    },
  };
}
