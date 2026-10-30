'use client';
import { useConsulta, useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { buscarContrato, consultarAcessoContrato, criarContrato, editarContrato, listarContratos, listarResponsaveis, type DadosContrato } from '@/lib/contratos';
import { chaveTexto } from '@/lib/repositorio-consultas';
export const CHAVES_CONTRATO = {
  lista: ['contratos', 'lista'] as const,
  detalhe: (id: string) => ['contratos', 'detalhe', id] as const,
  acesso: (id: string) => ['contratos', 'acesso', id] as const,
  responsaveis: ['usuarios', 'responsaveis'] as const,
};
export const useListaContratos = (habilitada = true) => useConsulta(CHAVES_CONTRATO.lista, () => listarContratos(), { habilitada });
export const useContrato = (id: string, habilitada = true) => useConsulta(CHAVES_CONTRATO.detalhe(id), () => buscarContrato(id), { habilitada: habilitada && !!id });
export const useAcessoContrato = (id: string, habilitada = true) => useConsulta(CHAVES_CONTRATO.acesso(id), () => consultarAcessoContrato(id), { habilitada: habilitada && !!id });
export const useResponsaveis = (habilitada: boolean) => useConsulta(CHAVES_CONTRATO.responsaveis, () => listarResponsaveis(), { habilitada, validadeMs: 10_000 });
export function useMutacoesContrato() {
  const cache = useRepositorioConsultas();
  return {
    criar: async (dados: DadosContrato) => {
      const contrato = await criarContrato(dados);
      cache.gravar(chaveTexto(CHAVES_CONTRATO.detalhe(contrato.id)), contrato);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['admin', 'contratos']);
      return contrato;
    },
    editar: async (id: string, dados: Partial<DadosContrato>) => {
      const contrato = await editarContrato(id, dados);
      cache.gravar(chaveTexto(CHAVES_CONTRATO.detalhe(id)), contrato);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['admin', 'contratos']);
      cache.invalidar(CHAVES_CONTRATO.acesso(id));
      return contrato;
    },
  };
}
