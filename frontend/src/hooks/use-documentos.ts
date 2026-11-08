'use client';
import { useConsulta, useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { listarDocumentos, enviarDocumento, type CategoriaDocumento, type FiltroCategoriaDocumento, type SituacaoDocumentoFiltro } from '@/lib/documentos';

export const CHAVES_DOCUMENTOS = {
  contrato: (id: string) => ['documentos', 'contrato', id] as const,
  lista: (id: string, categoria: FiltroCategoriaDocumento, pagina: number, arquivados = false, situacao?: SituacaoDocumentoFiltro) =>
    ['documentos', 'contrato', id, 'lista', categoria || 'TODOS', pagina, arquivados ? 'ARQUIVADOS' : 'ATIVOS', situacao ?? 'TODOS'] as const,
};
export function useDocumentos(contratoId: string, categoria: FiltroCategoriaDocumento, pagina: number, habilitada = true, arquivados = false, situacao?: SituacaoDocumentoFiltro) {
  return useConsulta(CHAVES_DOCUMENTOS.lista(contratoId, categoria, pagina, arquivados, situacao),
    (signal) => listarDocumentos(contratoId, categoria, pagina, signal, arquivados, situacao),
    { habilitada: habilitada && !!contratoId, validadeMs: 10_000 });
}
export function useEnviarDocumento(contratoId: string) {
  const cache = useRepositorioConsultas();
  return async (categoria: CategoriaDocumento, arquivo: File, descricao: string) => {
    const documento = await enviarDocumento(contratoId, categoria, arquivo, descricao);
    cache.invalidar(CHAVES_DOCUMENTOS.contrato(contratoId));
    return documento;
  };
}
