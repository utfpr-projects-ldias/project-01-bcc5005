'use client';
import { useConsulta, useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { criarEtapa, editarEtapa, listarEtapas, reordenarEtapas, type DadosEtapa } from '@/lib/etapas';
import { chaveTexto } from '@/lib/repositorio-consultas';

export const CHAVES_ETAPAS = { lista: (contratoId: string) => ['etapas', 'contrato', contratoId] as const };
export function useEtapas(contratoId: string, habilitada = true) {
  return useConsulta(CHAVES_ETAPAS.lista(contratoId), () => listarEtapas(contratoId), { habilitada: habilitada && !!contratoId });
}
export function useMutacoesEtapas(contratoId: string) {
  const cache = useRepositorioConsultas();
  const chave = CHAVES_ETAPAS.lista(contratoId);
  return {
    criar: async (dados: DadosEtapa) => {
      const etapa = await criarEtapa(contratoId, dados);
      cache.invalidar(chave);
      cache.invalidar(['contratos', 'pendentes']);
      return etapa;
    },
    editar: async (etapaId: string, dados: DadosEtapa) => {
      const etapa = await editarEtapa(contratoId, etapaId, dados);
      cache.invalidar(chave);
      cache.invalidar(['contratos', 'pendentes']);
      return etapa;
    },
    reordenar: async (ordemAnterior: string[], ordemNova: string[]) => {
      const lista = await reordenarEtapas(contratoId, ordemAnterior, ordemNova);
      cache.gravar(chaveTexto(chave), lista);
      cache.invalidar(['contratos', 'pendentes']);
      return lista;
    },
  };
}
