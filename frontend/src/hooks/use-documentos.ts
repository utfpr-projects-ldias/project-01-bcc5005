'use client';
import { useConsulta, useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { listarDocumentos, enviarDocumento, type CategoriaDocumento, type FiltroCategoriaDocumento } from '@/lib/documentos';

export const CHAVES_DOCUMENTOS = {
  contrato: (id: string) => ['documentos', 'contrato', id] as const,
  lista: (id: string, categoria: FiltroCategoriaDocumento, pagina: number, arquivados = false) =>
    ['documentos', 'contrato', id, 'lista', categoria || 'TODOS', pagina, arquivados ? 'ARQUIVADOS' : 'ATIVOS'] as const,
};
export function useDocumentos(contratoId: string, categoria: FiltroCategoriaDocumento, pagina: number, habilitada = true, arquivados = false) {
  return useConsulta(CHAVES_DOCUMENTOS.lista(contratoId, categoria, pagina, arquivados),
    (signal) => listarDocumentos(contratoId, categoria, pagina, signal, arquivados),
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
