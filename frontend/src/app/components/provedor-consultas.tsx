'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { RepositorioConsultas, chaveTexto, type ChaveConsulta, type Consulta } from '@/lib/repositorio-consultas';

const SNAPSHOT_SERVIDOR = Object.freeze({ carregando: true, atualizando: false });
const ContextoConsultas = createContext<RepositorioConsultas | null>(null);
/** Client Component: o Query Context nao e importado como hook pelo RootLayout (Server). */
export function ProvedorConsultas({ children }: { children: ReactNode }) {
  const [repositorio] = useState(() => new RepositorioConsultas());
  return <ContextoConsultas.Provider value={repositorio}>{children}</ContextoConsultas.Provider>;
}
export function useRepositorioConsultas() {
  const repositorio = useContext(ContextoConsultas);
  if (!repositorio) throw new Error('ProvedorConsultas ausente da arvore de componentes');
  return repositorio;
}
export function useConsulta<T>(chave: ChaveConsulta, consultar: (signal: AbortSignal) => Promise<T>, opcoes: { habilitada?: boolean; validadeMs?: number } = {}) {
  const repositorio = useRepositorioConsultas();
  const chaveId = chaveTexto(chave);
  const habilitada = opcoes.habilitada !== false;
  const validadeMs = opcoes.validadeMs ?? 0;
  const estado = useSyncExternalStore(
    useMemo(() => (aviso: () => void) => repositorio.observar(chaveId, aviso), [repositorio, chaveId]),
    useMemo(() => () => repositorio.ler<T>(chaveId), [repositorio, chaveId]),
    () => SNAPSHOT_SERVIDOR as Consulta<T>,
  );
  useEffect(() => {
    if (habilitada) void repositorio.buscar(chaveId, consultar, { validadeMs }).catch(() => {});
    // O fetcher e registrado na entrada da chave e a consulta nao reinicia por rerender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositorio, chaveId, habilitada, validadeMs]);
  return {
    ...estado,
    carregando: habilitada && (estado.carregando || (estado.dados === undefined && !estado.erro)),
    atualizar: () => repositorio.buscar(chaveId, consultar, { forcar: true }),
  };
}
