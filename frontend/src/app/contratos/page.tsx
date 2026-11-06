'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';
import { useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useListaContratos } from '@/hooks/use-contratos';
import { STATUS, rotuloCodigoPublico, reativarContrato, excluirContratoArquivado, type Contrato, type StatusContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from './components/area-contratos';
import { ResumoPlanejamentoContrato } from './components/resumo-planejamento-contrato';
import { lerEstadoCarteira, salvarEstadoCarteira } from '@/lib/estado-lista-contratos';

const LISTA_VAZIA: Contrato[] = [];
// O HTML SSR e a primeira hidratação usam o mesmo placeholder. No cliente,
// a seleção salva já está no estado inicial quando as abas se tornam visíveis.
const observarCliente = () => () => {};
const snapshotCliente = () => true;
const snapshotServidor = () => false;

export default function ContratosListPage() {
  const cache = useRepositorioConsultas();
  const [confirmacao, setConfirmacao] = useState<{ id: string; numero: string; tipo: 'reativar' | 'excluir' } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erroOperacao, setErroOperacao] = useState('');
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [reativados, setReativados] = useState<string[]>([]);
  async function confirmarAcao() {
    if (!confirmacao || ocupado) return;
    setOcupado(true); setErroOperacao('');
    const { id, tipo } = confirmacao;
    try {
      if (tipo === 'reativar') {
        await reativarContrato(id);
        setReativados(anterior => [...anterior, id]);
        toastSucesso('Contrato reativado.');
      } else {
        const resultado = await excluirContratoArquivado(id);
        if (!resultado.excluido) throw new Error('Não foi possível excluir o contrato.');
        setExcluidos(anterior => [...anterior, id]);
        if (resultado.arquivosPendentes > 0) toastAviso('Contrato excluído. A limpeza de alguns arquivos precisa ser concluída.');
        else toastSucesso('Contrato excluído.');
      }
      setConfirmacao(null);
      cache.invalidar(['contratos', 'lista']);
      await lista.atualizar().catch(() => {});
    } catch (erro) {
      setErroOperacao(erro instanceof Error ? erro.message : 'Não foi possível concluir a ação.');
    } finally { setOcupado(false); }
  }

  const { dados: perfil, erro: erroPerfil } = useMeuPerfil();
  const lista = useListaContratos(!!perfil?.ativo);
  const contratos = !lista.erro && perfil?.ativo ? lista.dados ?? LISTA_VAZIA : LISTA_VAZIA;
  const carregando = !!perfil?.ativo && lista.carregando;
  const erro = erroPerfil ? 'Não foi possível validar sua conta.' : lista.erro ? (lista.erro instanceof Error ? lista.erro.message : 'Não foi possível carregar os contratos.') : '';
  // Ler a preferência somente na inicialização da instância. Não reproduzir
  // a aba Ativos enquanto se aguarda a hidratação nem atualizar estado dentro
  // de useLayoutEffect (React 19 / react-hooks/set-state-in-effect).
  const [preferenciasIniciais] = useState(() => lerEstadoCarteira());
  const [busca, setBusca] = useState(preferenciasIniciais?.busca ?? '');
  const [campoBusca, setCampoBusca] = useState<'todos' | 'numero' | 'codigo' | 'orgao' | 'objeto'>(preferenciasIniciais?.campo ?? 'todos');
  const [filtroArquivo, setFiltroArquivo] = useState<'ativos' | 'concluidos' | 'arquivados'>(preferenciasIniciais?.aba ?? 'ativos');
  const [filtro, setFiltro] = useState<StatusContrato | ''>((preferenciasIniciais?.status ?? '') as StatusContrato | '');
  const estadoRestaurado = useSyncExternalStore(observarCliente, snapshotCliente, snapshotServidor);
  const rolagemPendente = useRef<number | null>(preferenciasIniciais?.rolagem ?? null);
  useEffect(() => {
    if (!estadoRestaurado) return;
    const guardar = () => salvarEstadoCarteira({
      aba: filtroArquivo, busca, campo: campoBusca, status: filtro,
      rolagem: rolagemPendente.current ?? window.scrollY,
    });
    guardar();
    // Persistência de rolagem no máximo uma vez por quadro, para não sobrecarregar a UI.
    let quadro: number | null = null;
    const aoRolar = () => {
      if (quadro !== null) return;
      const escrever = () => { quadro = null; guardar(); };
      quadro = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(escrever) : window.setTimeout(escrever, 0);
    };
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => {
      window.removeEventListener('scroll', aoRolar);
      if (quadro !== null) {
        if (typeof window.requestAnimationFrame === 'function' && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(quadro);
        else window.clearTimeout(quadro);
      }
    };
  }, [estadoRestaurado, filtroArquivo, busca, campoBusca, filtro]);
  useEffect(() => {
    if (!estadoRestaurado || !perfil?.ativo || !lista.dados || carregando || rolagemPendente.current === null) return;
    // Após retorno da rota, a lista precisa estar pintada antes de recuperar scroll.
    const restaurar = () => {
      if (rolagemPendente.current === null) return;
      const destino = rolagemPendente.current;
      window.scrollTo({ top: destino, behavior: 'auto' });
      rolagemPendente.current = null;
    };
    const agendamento = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(restaurar) : window.setTimeout(restaurar, 0);
    return () => {
      if (typeof window.cancelAnimationFrame === 'function' && typeof window.requestAnimationFrame === 'function') window.cancelAnimationFrame(agendamento);
      else window.clearTimeout(agendamento);
    };
  }, [estadoRestaurado, perfil?.ativo, lista.dados, carregando, filtroArquivo]);
  function preservarRetorno() {
    salvarEstadoCarteira({ aba: filtroArquivo, busca, campo: campoBusca, status: filtro, rolagem: window.scrollY });
  }

  const visiveis = useMemo(() => contratos.filter(c => {
    if (excluidos.includes(c.id) || (filtroArquivo === 'arquivados' && reativados.includes(c.id))) return false;
    const termo = busca.toLocaleLowerCase('pt-BR').trim();
    const codigo = termo.startsWith('#') ? termo.slice(1) : termo;
    const conteudos: Record<Exclude<typeof campoBusca, 'todos'>, string> = {
      numero: c.numeroContrato,
      codigo: c.codigoPublico,
      orgao: c.orgaoContratante,
      objeto: c.objeto,
    };
    const contem = (valor: string, codigoIdentificador = false) => valor.toLocaleLowerCase('pt-BR').includes(codigoIdentificador ? codigo : termo);
    const corresponde = termo === '' || (campoBusca === 'todos'
      ? contem(c.codigoPublico, true) || contem(c.numeroContrato) || contem(c.orgaoContratante) || contem(c.objeto)
      : contem(conteudos[campoBusca], campoBusca === 'codigo'));
    return (filtroArquivo === 'arquivados' ? Boolean(c.arquivadoEm) :
      !c.arquivadoEm && (filtroArquivo === 'concluidos' ? c.status === 'CONCLUIDO' : c.status !== 'CONCLUIDO')) &&
      (!filtro || c.status === filtro) && corresponde;
  }), [contratos, busca, campoBusca, filtro, filtroArquivo, excluidos, reativados]);
  return <AreaContratos titulo="Gestão de Contratos">
    <section className="flex flex-wrap items-center justify-between gap-3" aria-label="Cabeçalho dos contratos">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">Contratos</h2>
        {estadoRestaurado ? <div role="tablist" aria-label="Situação dos contratos" className="inline-flex items-center gap-1 rounded-xl border border-brand-green/20 bg-background/70 p-1">
          {(['ativos', 'concluidos', 'arquivados'] as const).map(opcao => <button key={opcao} type="button" role="tab"
            aria-selected={filtroArquivo === opcao} aria-label={opcao === 'ativos' ? 'Contratos ativos' : opcao === 'concluidos' ? 'Contratos concluídos' : 'Contratos arquivados'}
            onClick={() => setFiltroArquivo(opcao)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtroArquivo === opcao ? (opcao === 'concluidos' ? 'bg-violet-500/25 text-violet-200' : 'bg-brand-green text-on-brand-green') : 'text-foreground/65 hover:bg-brand-green/10 hover:text-foreground'}`}>
            {opcao === 'ativos' ? 'Ativos' : opcao === 'concluidos' ? '◉ Concluídos' : 'Arquivados'}
          </button>)}
        </div> : <div aria-hidden="true" data-testid="abas-aguardando-restauracao"
          className="h-9 min-w-[240px] rounded-xl border border-transparent opacity-0" />}
      </div>
      {perfil?.perfil === 'ADMINISTRADOR' && <Link href="/contratos/novo"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-green px-3 text-xs font-semibold text-on-brand-green transition hover:brightness-110">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="4" y="3" width="15" height="18" rx="2"/><path d="M8 8h7M8 12h4M16 14v6m-3-3h6"/></svg>
        Cadastrar contrato
      </Link>}
    </section>
    {erroOperacao && <Aviso erro>{erroOperacao}</Aviso>}
    {erro && <div className="space-y-2"><Aviso erro>{erro}</Aviso><button type="button" onClick={() => void lista.atualizar().catch(() => {})} className="text-sm text-brand-neon underline">Tentar novamente</button></div>}
    {!perfil ? <Aviso>{erro || "Verificando perfil..."}</Aviso> : !estadoRestaurado || carregando ? <Aviso>Carregando contratos...</Aviso> : erro ? null : <>
      <div className="space-y-3 rounded-xl border border-brand-green/10 bg-brand-darkgreen/5 p-3 sm:p-4" aria-label="Filtros de contratos">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full min-w-0 sm:w-56 sm:shrink-0">
            <label htmlFor="campo-busca" className="mb-1 block text-xs font-medium text-foreground/70">Buscar por</label>
            <select id="campo-busca" value={campoBusca} onChange={e => setCampoBusca(e.target.value as typeof campoBusca)}
              className="h-10 w-full rounded-lg border border-brand-green/30 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon">
              <option value="todos">Todos os campos</option><option value="numero">Número</option>
              <option value="codigo">Código</option><option value="orgao">Órgão</option><option value="objeto">Objeto</option>
            </select>
          </div>
          <div className="w-full min-w-0 flex-1">
            <label htmlFor="busca-contrato" className="mb-1 block text-xs font-medium text-foreground/70">Pesquisar contrato</label>
            <div className="relative">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
              <input id="busca-contrato" type="search" placeholder="Digite para buscar..." aria-label="Pesquisar contrato"
                className="h-10 w-full rounded-lg border border-brand-green/30 bg-background pl-9 pr-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon"
                value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-brand-green/10 pt-3">
          <div className="w-full sm:w-56">
            <label htmlFor="filtro-status" className="mb-1 block text-xs font-medium text-foreground/70">Filtrar por status</label>
            <select id="filtro-status" className="h-10 w-full rounded-lg border border-brand-green/30 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon"
              value={filtro} onChange={e => setFiltro(e.target.value as StatusContrato | '')}>
              <option value="">Todos os status</option>{(Object.keys(STATUS) as StatusContrato[]).map(k => <option key={k} value={k}>{STATUS[k]}</option>)}
            </select>
          </div>
          {(busca || filtro || filtroArquivo !== 'ativos' || campoBusca !== 'todos') && <button type="button"
            onClick={() => { setBusca(''); setCampoBusca('todos'); setFiltro(''); setFiltroArquivo('ativos'); }}
            className="h-10 rounded-lg border border-brand-green/20 px-3 text-xs text-foreground/70 hover:bg-brand-green/10">Limpar filtros</button>}
        </div>
      </div>
      <p className="text-sm text-foreground/60">{visiveis.length} contrato(s) {filtroArquivo === 'arquivados' ? 'arquivado(s)' : filtroArquivo === 'concluidos' ? 'concluído(s)' : 'em carteira'}</p>
      {!contratos.length ? <Aviso>Nenhum contrato cadastrado ou atribuído à sua conta.</Aviso> : !visiveis.length ? <Aviso>Nenhum resultado para os filtros escolhidos.</Aviso> :
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">{visiveis.map(c => <li key={c.id} className="relative min-w-0">
          <Link href={`/contratos/${encodeURIComponent(c.id)}`} aria-label={`Abrir contrato ${c.numeroContrato}`}
            onClick={preservarRetorno}
            data-arquivado={Boolean(c.arquivadoEm)}
            className={`contrato-card-documental group block h-full min-w-0 cursor-pointer rounded-2xl border p-4 text-left ${c.arquivadoEm && perfil?.perfil === 'ADMINISTRADOR' ? 'pb-16 md:pb-4' : ''}  transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 ${c.arquivadoEm ? 'border-amber-500/50 bg-[#261d0d] text-white hover:border-amber-400/75 focus-visible:outline-amber-400' : c.status === 'CONCLUIDO' ? 'border-violet-500/45 bg-violet-500/5 hover:border-violet-400/70 focus-visible:outline-violet-400' : 'border-brand-green/25 bg-brand-darkgreen/10 hover:border-brand-green/60 hover:bg-brand-green/5 hover:shadow-[0_0_0_1px_rgba(95,211,74,.13)] focus-visible:outline-brand-neon'}`}>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1 basis-[12rem]"><h3 title={c.numeroContrato} className={`contrato-card-titulo line-clamp-2 break-all text-base font-bold group-hover:underline group-hover:underline-offset-4 ${c.arquivadoEm ? 'text-white' : 'text-brand-neon'}`}>{c.numeroContrato}</h3>
                <p className={`mt-1 text-xs ${c.arquivadoEm ? 'text-white/75' : 'text-foreground/65'}`}>Código {rotuloCodigoPublico(c.codigoPublico)}</p></div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${c.arquivadoEm ? 'border-amber-400/50 bg-amber-500/15 text-white' : 'border-brand-green/25 bg-brand-green/5'}`}>{STATUS[c.status]}</span>
              {c.reabertoEm && !c.arquivadoEm && <span className="rounded-full border border-emerald-400/50 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200">Reaberto</span>}
            </div>
            <p title={c.orgaoContratante} className={`mt-2 line-clamp-1 break-all text-sm font-medium ${c.arquivadoEm ? 'text-white' : 'text-foreground/85'}`}>{c.orgaoContratante}</p>
            <p title={c.objeto} className={`mt-1 line-clamp-1 break-all text-xs ${c.arquivadoEm ? 'text-white/75' : 'text-foreground/65'}`}>{c.objeto}</p>
            <ResumoPlanejamentoContrato contratoId={c.id} contratoReabertoEm={c.reabertoEm} compactoNaLista={Boolean(c.arquivadoEm && perfil?.perfil === 'ADMINISTRADOR')} />
          </Link>
          {c.arquivadoEm && perfil?.perfil === 'ADMINISTRADOR' && <div className="absolute bottom-3 right-3 z-[2] flex items-center justify-end gap-1.5">
            <button type="button" aria-label={`Reativar contrato ${c.numeroContrato}`} title="Reativar contrato"
              onClick={() => { setErroOperacao(''); setConfirmacao({ id: c.id, numero: c.numeroContrato, tipo: 'reativar' }); }}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500/45 px-2.5 text-xs font-semibold text-amber-100 transition hover:border-amber-400 hover:bg-amber-500/15 focus-visible:outline-2 focus-visible:outline-amber-300">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11a9 9 0 1 1 3 7M3 4v7h7" /></svg>Reativar
            </button>
            <button type="button" aria-label={`Excluir contrato ${c.numeroContrato}`} title="Excluir definitivamente"
              onClick={() => { setErroOperacao(''); setConfirmacao({ id: c.id, numero: c.numeroContrato, tipo: 'excluir' }); }}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-red-500/45 px-2.5 text-xs font-semibold text-red-200 transition hover:border-red-400 hover:bg-red-500/15 focus-visible:outline-2 focus-visible:outline-red-300">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7m4-7v7" /></svg>Excluir
            </button>
          </div>}
        </li>)}</ul>}
      {confirmacao && <ConfirmacaoSimples
        titulo={confirmacao.tipo === 'excluir' ? 'Excluir contrato arquivado?' : 'Reativar contrato?'}
        descricao={confirmacao.tipo === 'excluir'
          ? `Excluir definitivamente “${confirmacao.numero}” e todos os seus registros e arquivos? Esta ação não pode ser desfeita. O histórico de auditoria será preservado.`
          : `Reativar o contrato “${confirmacao.numero}”? Ele voltará à carteira ativa, preservando seus documentos e histórico.`}
        confirmar={confirmacao.tipo === 'excluir' ? 'Excluir definitivamente' : 'Confirmar reativação'}
        perigoso={confirmacao.tipo === 'excluir'} ocupado={ocupado}
        onCancelar={() => { if (!ocupado) setConfirmacao(null); }} onConfirmar={() => void confirmarAcao()}
      />}

    </>}
  </AreaContratos>;
}
