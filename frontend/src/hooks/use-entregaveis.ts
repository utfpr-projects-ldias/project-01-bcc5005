'use client';
import { useConsulta } from '@/app/components/provedor-consultas';
import { detalharEntregavel, listarEntregaveis, resumoDocumentalContrato } from '@/lib/entregaveis';

export const CHAVES_ENTREGAVEIS = {
  contrato: (contratoId: string) => ['entregaveis', 'contrato', contratoId] as const,
  detalhe: (contratoId: string, id: string) => ['entregaveis', 'contrato', contratoId, 'detalhe', id] as const,
};
export function useEntregaveis(contratoId: string, habilitada = true) {
  return useConsulta(CHAVES_ENTREGAVEIS.contrato(contratoId),
    (signal) => listarEntregaveis(contratoId, signal), { habilitada: habilitada && !!contratoId });
}
export function useDetalheEntregavel(contratoId: string, id: string, habilitada = true) {
  return useConsulta(CHAVES_ENTREGAVEIS.detalhe(contratoId, id),
    (signal) => detalharEntregavel(contratoId, id, signal), { habilitada: habilitada && !!contratoId && !!id });
}

/** Estatística documental de todos os entregáveis do contrato, consultada em uma única chamada. */
export function useResumoDocumentalContrato(contratoId: string, habilitada = true) {
  return useConsulta([...CHAVES_ENTREGAVEIS.contrato(contratoId), 'resumo-documental'],
    signal => resumoDocumentalContrato(contratoId, signal), { habilitada: habilitada && !!contratoId, validadeMs: 10_000 });
}
