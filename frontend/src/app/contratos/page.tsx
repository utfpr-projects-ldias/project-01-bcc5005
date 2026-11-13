'use client';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';

import { ModalNovoContrato } from './components/modal-novo-contrato';
import { SeletorOrdenacaoContratos, type OrdemContratos } from './components/seletor-ordenacao-contratos';
import { PreviaContrato } from '@/app/atividades/components/cartao-atividade';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';
import { useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { chaveTexto } from '@/lib/repositorio-consultas';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useListaContratos, usePendentesConclusao } from '@/hooks/use-contratos';
import { STATUS, rotuloCodigoPublico, reativarContrato, retomarContrato, excluirContratoArquivado, type Contrato, type StatusContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from './components/area-contratos';
import { ResumoPlanejamentoContrato } from './components/resumo-planejamento-contrato';
import { IndicadorAvancoFinalizado } from './components/indicador-avanco-finalizado';
import { lerEstadoCarteira, salvarEstadoCarteira, type AbaCarteira } from '@/lib/estado-lista-contratos';
import { faseEmRevisao, situacaoVisivelContrato } from '@/lib/estado-visivel-contrato';

const LISTA_VAZIA: Contrato[] = [];
// O HTML SSR e a primeira hidratação usam o mesmo placeholder. No cliente,
// a seleção salva já está no estado inicial quando as abas se tornam visíveis.
const observarCliente = () => () => {};
const snapshotCliente = () => true;
const snapshotServidor = () => false;

export default function ContratosListPage() {
  const cache = useRepositorioConsultas();
  const [confirmacao, setConfirmacao] = useState<{ id: string; numero: string; tipo: 'reativar' | 'excluir' | 'retomar' } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [contratoModal, setContratoModal] = useState<{ id: string; foco: HTMLElement | null } | null>(null);
  const [erroOperacao, setErroOperacao] = useState('');
  const [novoContrato, setNovoContrato] = useState(false);
  const [gatilhoNovoContrato, setGatilhoNovoContrato] = useState<HTMLElement | null>(null);
  const [ordem, setOrdem] = useState<OrdemContratos>('inicio-desc');
  const [motivoDecisao, setMotivoDecisao] = useState('');
  const [excluidos, setExcluidos] = useState<string[]>([]);
  const [reativados, setReativados] = useState<string[]>([]);
  async function confirmarAcao() {
    if (!confirmacao || ocupado) return;
    setOcupado(true); setErroOperacao('');
    const { id, tipo } = confirmacao;
    try {
      if (tipo === 'retomar') {
        const atualizado = await retomarContrato(id, motivoDecisao.trim());
        cache.gravar(chaveTexto(['contratos', 'detalhe', id]), atualizado);
        setReativados(anterior => [...anterior, id]);
        toastSucesso('Contrato retomado na situação anterior.');
      } else if (tipo === 'reativar') {
        const atualizado = await reativarContrato(id, motivoDecisao.trim());
        // Dados devolvidos pelo servidor prevalecem sobre o cache antigo do detalhe.
        cache.gravar(chaveTexto(['contratos', 'detalhe', id]), atualizado);
        setReativados(anterior => [...anterior, id]);
        toastSucesso('Contrato reativado.');
      } else {
        const resultado = await excluirContratoArquivado(id);
        if (!resultado.excluido) throw new Error('Não foi possível excluir o contrato.');
        setExcluidos(anterior => [...anterior, id]);
        if (resultado.arquivosPendentes > 0) toastAviso('Contrato excluído. A limpeza de alguns arquivos precisa ser concluída.');
        else toastSucesso('Contrato excluído.');
      }
      setConfirmacao(null); setMotivoDecisao('');
      cache.invalidar(['contratos', 'lista']);
      await lista.atualizar().catch(() => {});
    } catch (erro) {
      setErroOperacao(erro instanceof Error ? erro.message : 'Não foi possível concluir a ação.');
    } finally { setOcupado(false); }
  }

  const { dados: perfil, erro: erroPerfil } = useMeuPerfil();
  const lista = useListaContratos(!!perfil?.ativo);
  const pendentesQuery = usePendentesConclusao(!!perfil?.ativo);
  const idsPendentes = useMemo(() => pendentesQuery.dados ?? [], [pendentesQuery.dados]);
  const buscandoPendentes = Boolean(pendentesQuery.carregando && !pendentesQuery.dados);
  const contratos = !lista.erro && perfil?.ativo ? lista.dados ?? LISTA_VAZIA : LISTA_VAZIA;
  const carregando = !!perfil?.ativo && lista.carregando;
  const erro = erroPerfil ? 'Não foi possível validar sua conta.' : lista.erro ? (lista.erro instanceof Error ? lista.erro.message : 'Não foi possível carregar os contratos.') : '';
  // Ler a preferência somente na inicialização da instância. Não reproduzir
  // a aba Ativos enquanto se aguarda a hidratação nem atualizar estado dentro
  // de useLayoutEffect (React 19 / react-hooks/set-state-in-effect).
  const [preferenciasIniciais] = useState(() => lerEstadoCarteira());
  const [busca, setBusca] = useState(preferenciasIniciais?.busca ?? '');
  const [campoBusca, setCampoBusca] = useState<'todos' | 'numero' | 'codigo' | 'orgao' | 'objeto'>(preferenciasIniciais?.campo ?? 'todos');
  const [filtroArquivo, setFiltroArquivo] = useState<AbaCarteira>(preferenciasIniciais?.aba === 'suspensos' || preferenciasIniciais?.aba === 'cancelados' ? 'todos' : preferenciasIniciais?.aba ?? 'todos');
  const [filtro, setFiltro] = useState<StatusContrato | 'ARQUIVADO' | 'EM_REVISAO' | 'PENDENTE_CONCLUSAO' | ''>((preferenciasIniciais?.status ?? '') as StatusContrato | 'ARQUIVADO' | 'EM_REVISAO' | 'PENDENTE_CONCLUSAO' | '');
  const estadoRestaurado = useSyncExternalStore(observarCliente, snapshotCliente, snapshotServidor);
  const rolagemPendente = useRef<number | null>(preferenciasIniciais?.rolagem ?? null);
  useEffect(() => {
    if (!estadoRestaurado) return;
    const guardar = () => salvarEstadoCarteira({
      aba: filtroArquivo, busca, campo: campoBusca, status: filtroArquivo === 'todos' ? filtro : '',
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
    salvarEstadoCarteira({ aba: filtroArquivo, busca, campo: campoBusca, status: filtroArquivo === 'todos' ? filtro : '', rolagem: window.scrollY });
  }

  const visiveis = useMemo(() => contratos.filter(c => {
    if (excluidos.includes(c.id) || ((filtroArquivo === 'arquivados' || filtroArquivo === 'suspensos') && reativados.includes(c.id))) return false;
    const termo = filtroArquivo === 'todos' ? busca.toLocaleLowerCase('pt-BR').trim() : '';
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
    const situacao = situacaoVisivelContrato(c, idsPendentes.includes(c.id));
    // Cada aba já define sua situação; apenas Todos permite filtro adicional.
    const daAba = filtroArquivo === 'todos' || situacao === filtroArquivo;
    const correspondeStatus = filtroArquivo !== 'todos' || !filtro ||
      (filtro === 'ARQUIVADO' ? situacao === 'arquivados'
        : filtro === 'EM_REVISAO' ? situacao === 'revisao'
        : filtro === 'PENDENTE_CONCLUSAO' ? situacao === 'pendentes'
        : situacao !== 'arquivados' && c.status === filtro);
    return daAba && correspondeStatus && corresponde;
  }).sort((a,b) => {
    if(ordem==='inicio-asc')return a.inicioVigencia.localeCompare(b.inicioVigencia)||a.numeroContrato.localeCompare(b.numeroContrato,'pt-BR',{numeric:true});
    if(ordem==='numero-asc')return a.numeroContrato.localeCompare(b.numeroContrato,'pt-BR',{numeric:true});
    if(ordem==='numero-desc')return b.numeroContrato.localeCompare(a.numeroContrato,'pt-BR',{numeric:true});
    return b.inicioVigencia.localeCompare(a.inicioVigencia)||a.numeroContrato.localeCompare(b.numeroContrato,'pt-BR',{numeric:true});
  }), [contratos, busca, campoBusca, filtro, filtroArquivo, idsPendentes, excluidos, reativados, ordem]);
  return <AreaContratos titulo="Gestão de Contratos">
    <section className="flex flex-wrap items-center justify-between gap-3" aria-label="Cabeçalho dos contratos">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">Contratos</h2>
        {estadoRestaurado ? <AbasRolaveis className="w-full sm:w-auto sm:flex-1"><div role="tablist" aria-label="Situação dos contratos" className="flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-brand-green/20 bg-background/70 p-1">
          {(['todos', 'ativos', 'pendentes', 'revisao', 'concluidos', 'arquivados'] as const).map(opcao => <button key={opcao} type="button" role="tab"
            aria-selected={filtroArquivo === opcao} title={opcao === 'concluidos' ? 'Inclui contratos concluídos e encerrados' : undefined} aria-label={opcao === 'todos' ? 'Todos os contratos' : opcao === 'ativos' ? 'Contratos ativos' : opcao === 'concluidos' ? 'Contratos finalizados' : opcao === 'pendentes' ? 'Contratos pendentes de conclusão' : opcao === 'revisao' ? 'Contratos em revisão' : 'Contratos arquivados'}
            onClick={() => { setFiltroArquivo(opcao); setFiltro(''); }}
            className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtroArquivo === opcao ? (opcao === 'arquivados' ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-700/75 text-white') : 'text-foreground/65 hover:bg-slate-700/35 hover:text-foreground'}`}>
            {opcao === 'arquivados' ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg> : opcao === 'todos' ? 'Todos' : opcao === 'ativos' ? 'Ativos' : opcao === 'concluidos' ? '◉ Finalizados' : opcao === 'pendentes' ? 'Pendente de conclusão' : opcao === 'revisao' ? 'Em revisão' : 'Em revisão'}
          </button>)}
        </div></AbasRolaveis> : <div aria-hidden="true" data-testid="abas-aguardando-restauracao"
          className="h-9 min-w-[240px] rounded-xl border border-transparent opacity-0" />}
      </div>
      {perfil?.perfil === 'ADMINISTRADOR' && <button type="button" onClick={evento=>{setGatilhoNovoContrato(evento.currentTarget);setNovoContrato(true);}} data-tec08-acao-criar="contrato"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-green px-3 text-xs font-semibold text-on-brand-green transition hover:brightness-110">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="4" y="3" width="15" height="18" rx="2"/><path d="M8 8h7M8 12h4M16 14v6m-3-3h6"/></svg>
        Cadastrar contrato
      </button>}
    </section>
    {erroOperacao && <Aviso erro>{erroOperacao}</Aviso>}
    {erro && <div className="space-y-2"><Aviso erro>{erro}</Aviso><button type="button" onClick={() => void lista.atualizar().catch(() => {})} className="text-sm text-brand-neon underline">Tentar novamente</button></div>}
    {!perfil ? <Aviso>{erro || "Verificando perfil..."}</Aviso> : !estadoRestaurado || carregando ? <Aviso>Carregando contratos...</Aviso> : erro ? null : <>
      {filtroArquivo === 'todos' && <div className="rounded-xl border border-brand-green/10 bg-background p-3 sm:p-4" aria-label="Filtros de contratos">
        <div className="grid min-w-0 grid-cols-1 items-end gap-3 min-[500px]:grid-cols-2 lg:grid-cols-[minmax(0,11rem)_minmax(0,11rem)_minmax(14rem,1fr)_auto]">
          <div className="min-w-0 order-2 min-[500px]:order-2">
            <label htmlFor="filtro-status" className="mb-1 block text-xs font-medium text-foreground/70">Filtrar por situação</label>
            <select id="filtro-status" className="h-10 w-full rounded-lg border border-brand-green/30 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon"
              value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}>
              <option value="">Todos os status</option>
              {(['PLANEJAMENTO','EM_EXECUCAO'] as const).map(k => <option key={k} value={k}>{STATUS[k]}</option>)}
              {(['SUSPENSO','CANCELADO'] as const).map(k => <option key={k} value={k}>{STATUS[k]}</option>)}
            </select>
            <div className="mt-2"><SeletorOrdenacaoContratos valor={ordem} onChange={setOrdem}/></div>
          </div>
          <div className="min-w-0 order-3 min-[500px]:order-3">
            <label htmlFor="campo-busca" className="mb-1 block text-xs font-medium text-foreground/70">Buscar por</label>
            <select id="campo-busca" value={campoBusca} onChange={e => setCampoBusca(e.target.value as typeof campoBusca)}
              className="h-10 w-full rounded-lg border border-brand-green/30 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon">
              <option value="todos">Todos os campos</option><option value="numero">Número</option>
              <option value="codigo">Código</option><option value="orgao">Órgão</option><option value="objeto">Objeto</option>
            </select>
          </div>
          <div className="min-w-0 order-1 min-[500px]:col-span-2 lg:order-4 lg:col-span-1">
            <label htmlFor="busca-contrato" className="mb-1 block text-xs font-medium text-foreground/70">Pesquisar contrato</label>
            <div className="relative">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
              <input id="busca-contrato" type="search" maxLength={160} placeholder="Digite para buscar..." aria-label="Pesquisar contrato"
                className="h-10 w-full rounded-lg border border-brand-green/30 bg-background pl-9 pr-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon"
                value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
          </div>
          {(busca || campoBusca !== 'todos' || filtro) && <button type="button" onClick={() => { setBusca(''); setCampoBusca('todos'); setFiltro(''); }}
            className="order-5 h-10 shrink-0 rounded-lg border border-brand-green/20 px-3 text-xs text-foreground/70 hover:bg-brand-green/10">Limpar filtros</button>}
        </div>
      </div>}
      <p className="text-sm text-foreground/60">{visiveis.length} contrato(s) {filtroArquivo === 'arquivados' ? 'arquivado(s)' : filtroArquivo === 'concluidos' ? 'finalizado(s)' : filtroArquivo === 'pendentes' ? 'pendente(s) de conclusão' : filtroArquivo === 'revisao' ? 'em revisão' : filtroArquivo === 'cancelados' ? 'cancelado(s)' : filtroArquivo === 'suspensos' ? 'suspenso(s)' : filtroArquivo === 'todos' ? 'no total' : 'ativos'}</p>
      {filtroArquivo === 'pendentes' && (buscandoPendentes || pendentesQuery.erro) ? <Aviso>{buscandoPendentes ? 'Consultando pendências de conclusão...' : 'Não foi possível consultar os contratos pendentes. Atualize a página.'}</Aviso> : !contratos.length ? <Aviso>Nenhum contrato cadastrado ou atribuído à sua conta.</Aviso> : !visiveis.length ? <Aviso>Nenhum resultado para os filtros escolhidos.</Aviso> :
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">{visiveis.map(c => {
          const situacao = situacaoVisivelContrato(c, idsPendentes.includes(c.id));
          const encerrado = c.status === 'ENCERRADO' && !c.reabertoEm;
          const finalizado = c.status === 'FINALIZADO' && !c.reabertoEm;
          const realceVioleta = !encerrado && (situacao === 'concluidos' || situacao === 'pendentes');
          return <li key={c.id} className="relative min-w-0">
          <div role="button" tabIndex={0} aria-label={`Abrir detalhes do contrato ${c.numeroContrato}`}
            onClick={e => { preservarRetorno(); setContratoModal({ id: c.id, foco: e.currentTarget }); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); preservarRetorno(); setContratoModal({ id: c.id, foco: e.currentTarget }); } }}
            data-arquivado={Boolean(c.arquivadoEm)} data-situacao={situacao}
            data-tec08-estado={c.arquivadoEm ? 'arquivado' : situacao === 'suspensos' ? 'suspenso' : situacao === 'cancelados' ? 'cancelado' : situacao === 'revisao' ? 'revisao' : encerrado ? 'encerrado' : finalizado ? 'finalizado' : realceVioleta ? 'concluido' : 'normal'}
            className={`contrato-card-documental group block h-full min-w-0 cursor-pointer rounded-2xl border p-4 text-left ${c.arquivadoEm && perfil?.perfil === 'ADMINISTRADOR' ? 'pt-14 sm:pt-4' : ''}  transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 ${c.arquivadoEm ? 'border-amber-500/50 bg-background text-foreground hover:border-amber-400/75 focus-visible:outline-amber-400' : situacao === 'suspensos' ? 'border-yellow-300/85 bg-background hover:border-yellow-200 focus-visible:outline-yellow-200' : situacao === 'cancelados' ? 'border-red-500/55 bg-background hover:border-red-400/70 focus-visible:outline-red-400' : encerrado ? 'border-slate-500/55 bg-background hover:border-slate-400/70 focus-visible:outline-slate-400' : finalizado ? 'border-purple-500/60 bg-purple-500/[0.10] hover:border-purple-400 focus-visible:outline-purple-400' : realceVioleta ? 'border-violet-500/45 bg-background hover:border-violet-400/70 focus-visible:outline-violet-400' : situacao === 'revisao' ? 'border-teal-700/55 bg-background hover:border-teal-600/70 focus-visible:outline-teal-600' : 'border-brand-green/25 bg-background hover:border-brand-green/60 focus-visible:outline-brand-neon'}`}>
            <div className={`flex min-w-0 flex-wrap items-start justify-between gap-2 ${c.arquivadoEm && perfil?.perfil === 'ADMINISTRADOR' ? 'sm:pr-[20.5rem]' : ''}`}>
              <div className="min-w-0 flex-1 basis-[12rem]"><h3 title={c.numeroContrato} className={`contrato-card-titulo line-clamp-2 max-w-full break-all [overflow-wrap:anywhere] text-base font-bold group-hover:underline group-hover:underline-offset-4 ${c.arquivadoEm ? 'text-foreground' : situacao === 'suspensos' ? 'text-yellow-300' : situacao === 'cancelados' ? 'text-red-300' : encerrado ? 'text-slate-200' : finalizado ? 'text-purple-300' : realceVioleta ? 'text-violet-300' : situacao === 'revisao' ? 'text-teal-200' : 'text-brand-neon'}`}>{c.numeroContrato}</h3>
                <p className={`mt-1 text-xs ${c.arquivadoEm ? 'text-foreground/75' : 'text-foreground/65'}`}>Código {rotuloCodigoPublico(c.codigoPublico)}</p></div>
              {!c.arquivadoEm && <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] ${c.arquivadoEm ? 'border-amber-400/50 bg-amber-500/15 text-amber-900 dark:text-amber-100' : situacao === 'suspensos' ? 'border-yellow-300/80 bg-yellow-300/10 text-yellow-200' : situacao === 'cancelados' ? 'border-red-400/60 bg-red-900/20 text-red-200' : encerrado ? 'border-slate-500/60 bg-slate-500/15 text-slate-200' : finalizado ? 'border-purple-500/60 bg-purple-500/20 text-purple-300' : situacao === 'pendentes' ? 'border-yellow-400/60 bg-yellow-500/10 text-yellow-700 dark:text-yellow-200' : realceVioleta ? 'border-violet-400/50 bg-violet-500/15 text-violet-100' : situacao === 'revisao' ? 'border-teal-600/50 bg-teal-900/20 text-teal-200' : 'border-brand-green/25 bg-brand-green/5'}`}>{situacao === 'arquivados' ? 'Arquivado' : situacao === 'revisao' ? 'Em revisão' : situacao === 'pendentes' ? 'Pendente de conclusão' : STATUS[c.status]}</span>}
              {finalizado && <IndicadorAvancoFinalizado contratoId={c.id} />}
              {situacao === 'revisao' && <span className="shrink-0 rounded-full border border-foreground/20 bg-background px-2 py-1 text-[11px] text-foreground/80">{faseEmRevisao(c.status)}</span>}
            </div>
            <p title={c.orgaoContratante} className={`mt-2 line-clamp-1 break-all text-sm font-medium ${c.arquivadoEm ? 'text-foreground' : 'text-foreground/85'}`}>{c.orgaoContratante}</p>
            <p title={c.objeto} className={`mt-1 line-clamp-1 break-all text-xs ${c.arquivadoEm ? 'text-foreground/75' : 'text-foreground/65'}`}>{c.objeto}</p>
            <ResumoPlanejamentoContrato contratoId={c.id} contratoArquivado={Boolean(c.arquivadoEm)} contratoSuspenso={situacao === 'suspensos'} contratoEmRevisao={situacao === 'revisao'} contratoEncerrado={encerrado} contratoConcluido={realceVioleta && !encerrado} contratoCancelado={situacao === 'cancelados'} compactoNaLista={Boolean(c.arquivadoEm && perfil?.perfil === 'ADMINISTRADOR')} />
          </div>
          {c.arquivadoEm && perfil?.perfil === 'ADMINISTRADOR' && <div className="absolute right-3 top-3 z-[2] flex max-w-[calc(100%-1.5rem)] flex-nowrap items-center justify-end gap-1.5">
            <span className="rounded-full border border-amber-400/50 bg-amber-500/15 px-2 py-1 text-[11px] text-amber-100">Arquivado</span>
            <button type="button" aria-label={`Reativar contrato ${c.numeroContrato}`} title="Reativar contrato"
              onClick={() => { setErroOperacao(''); setConfirmacao({ id: c.id, numero: c.numeroContrato, tipo: 'reativar' }); }}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-amber-500/45 px-2 text-xs font-semibold text-amber-100 transition hover:border-amber-400 hover:bg-amber-500/15 focus-visible:outline-2 focus-visible:outline-amber-300">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11a9 9 0 1 1 3 7M3 4v7h7" /></svg>Reativar
            </button>
            <button type="button" aria-label={`Excluir contrato ${c.numeroContrato}`} title="Excluir definitivamente"
              onClick={() => { setErroOperacao(''); setConfirmacao({ id: c.id, numero: c.numeroContrato, tipo: 'excluir' }); }}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-red-500/45 px-2 text-xs font-semibold text-red-200 transition hover:border-red-400 hover:bg-red-500/15 focus-visible:outline-2 focus-visible:outline-red-300">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7m4-7v7" /></svg>Excluir
            </button>
          </div>}
        </li>; })}</ul>}
      {novoContrato && <ModalNovoContrato focoRetorno={gatilhoNovoContrato} onFechar={()=>setNovoContrato(false)} onCriado={async()=>{cache.invalidar(['contratos','lista']);await lista.atualizar().catch(()=>{});}}/>}
      {contratoModal && <PreviaContrato contratoId={contratoModal.id} foco={contratoModal.foco} fechar={() => setContratoModal(null)} />}
      {confirmacao && <ConfirmacaoSimples
        titulo={confirmacao.tipo === 'excluir' ? 'Excluir contrato arquivado?' : confirmacao.tipo === 'retomar' ? 'Retomar contrato suspenso?' : 'Reativar contrato?'}
        descricao={confirmacao.tipo === 'excluir'
          ? `Excluir definitivamente “${confirmacao.numero}” e todos os seus registros e arquivos? Esta ação não pode ser desfeita. O histórico de auditoria será preservado.`
          : confirmacao.tipo === 'retomar' ? `Retomar “${confirmacao.numero}” mantendo prazos, documentos e progresso? A situação anterior será restaurada pela auditoria.`
          : `Reativar o contrato “${confirmacao.numero}”? Ele voltará à lista de contratos ativos, preservando seus documentos e histórico.`}
        confirmar={confirmacao.tipo === 'excluir' ? 'Excluir definitivamente' : confirmacao.tipo === 'retomar' ? 'Confirmar retomada' : 'Confirmar reativação'}
        perigoso={confirmacao.tipo === 'excluir'} ocupado={ocupado}
        justificativa={motivoDecisao} onJustificativaChange={confirmacao.tipo === 'excluir' ? undefined : setMotivoDecisao}
        onCancelar={() => { if (!ocupado) setConfirmacao(null); }} onConfirmar={() => void confirmarAcao()}
      />}

    </>}
  </AreaContratos>;
}
