'use client';
import { useConsulta, useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { consultarUsuariosPaginados, buscarFuncionarioPorId, listarPermissoesFuncionario, listarContratosAdministracao, } from '@/lib/admin-usuarios';
export const CHAVES_FUNCIONARIOS = {
  lista: (ativo: boolean, pagina: number, busca: string) => ['usuarios', 'lista', ativo, pagina, busca] as const,
  totais: (ativo: boolean) => ['usuarios', 'total', ativo] as const,
  detalhe: (id: string) => ['usuarios', 'detalhe', id] as const,
  permissoes: (id: string) => ['usuarios', 'permissoes', id] as const,
  contratos: ['admin', 'contratos'] as const,
};
export const useUsuariosPaginados = (ativo: boolean, pagina: number, busca: string, habilitada = true) =>
  useConsulta(CHAVES_FUNCIONARIOS.lista(ativo, pagina, busca), () => consultarUsuariosPaginados({ ativo, pagina, busca }), { habilitada });
export const useTotalUsuarios = (ativo: boolean, habilitada = true) =>
  useConsulta(CHAVES_FUNCIONARIOS.totais(ativo), async () => (await consultarUsuariosPaginados({ ativo, pagina: 1, limite: 1 })).total, { habilitada, validadeMs: 10_000 });
export const useDetalheFuncionario = (id: string, habilitada: boolean) =>
  useConsulta(CHAVES_FUNCIONARIOS.detalhe(id), () => buscarFuncionarioPorId(id), { habilitada: habilitada && !!id });
export const usePermissoesFuncionario = (id: string, habilitada: boolean) =>
  useConsulta(CHAVES_FUNCIONARIOS.permissoes(id), () => listarPermissoesFuncionario(id), { habilitada: habilitada && !!id });
export const useContratosAdmin = (habilitada: boolean) => useConsulta(CHAVES_FUNCIONARIOS.contratos, () => listarContratosAdministracao(), { habilitada });
export function useInvalidacaoFuncionarios() {
  const cache = useRepositorioConsultas();
  return {
    lista: () => { cache.invalidar(['usuarios', 'lista']); cache.invalidar(['usuarios', 'total']); cache.invalidar(['usuarios', 'responsaveis']); },
    detalhe: (id: string) => cache.invalidar(CHAVES_FUNCIONARIOS.detalhe(id)),
    permissoes: (id: string) => { cache.invalidar(CHAVES_FUNCIONARIOS.permissoes(id)); cache.invalidar(['contratos']); },
  };
}
