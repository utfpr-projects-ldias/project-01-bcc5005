'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { RepositorioConsultas, chaveTexto, type ChaveConsulta, type Consulta } from '@/lib/repositorio-consultas';

import { observarRegistrosCompartilhados } from '@/lib/sincronizar-evidencia-compartilhada';

const SNAPSHOT_SERVIDOR = Object.freeze({ carregando: true, atualizando: false });
const ContextoConsultas = createContext<RepositorioConsultas | null>(null);
/** Client Component: o Query Context nao e importado como hook pelo RootLayout (Server). */
export function ProvedorConsultas({ children }: { children: ReactNode }) {
  const [repositorio] = useState(() => new RepositorioConsultas());
  useEffect(() => observarRegistrosCompartilhados(repositorio), [repositorio]);
  return <ContextoConsultas.Provider value={repositorio}>{children}</ContextoConsultas.Provider>;
}
/** Leitura opcional para painéis também testados isoladamente; a aplicação sempre usa o provider. */
export function useRepositorioConsultasOpcional() { return useContext(ContextoConsultas); }
export function useRepositorioConsultas() {
  const repositorio = useContext(ContextoConsultas);
  if (!repositorio) throw new Error('ProvedorConsultas ausente da arvore de componentes');
  return repositorio;
}
export function useConsulta<T>(chave: ChaveConsulta, consultar: (signal: AbortSignal) => Promise<T>, opcoes: { habilitada?: boolean; validadeMs?: number; manterDadosNoEscopo?: string } = {}) {
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
  const escopo = opcoes.manterDadosNoEscopo;
  const [anterior, setAnterior] = useState<{escopo:string;chave:string;dados:T}|null>(null);
  // Somente mantém a lista da consulta anterior quando muda um filtro do mesmo contrato.
  // Não conserva dados em caso de erro, desabilitação ou troca de escopo.
  if ((!habilitada || estado.erro || !escopo || (anterior && anterior.escopo !== escopo)) && anterior) setAnterior(null);
  else if (habilitada && escopo && !estado.erro && estado.dados !== undefined &&
      (anterior?.chave !== chaveId || anterior.dados !== estado.dados)) {
    setAnterior({escopo,chave:chaveId,dados:estado.dados});
  }
  const dadosAnteriores=habilitada&&!estado.erro&&estado.dados===undefined&&escopo&&anterior?.escopo===escopo&&anterior.chave!==chaveId?anterior.dados:undefined;
  return {
    ...estado,
    dados: estado.dados??dadosAnteriores,
    carregando: habilitada && (estado.carregando || (estado.dados === undefined && !estado.erro)),
    atualizar: () => repositorio.buscar(chaveId, consultar, { forcar: true }),
  };
}
