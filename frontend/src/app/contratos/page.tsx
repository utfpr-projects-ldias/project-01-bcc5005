'use client';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';

import { ModalNovoContrato } from './components/modal-novo-contrato';
import { CabecalhoColuna, ordenarTabela, ordemEstados, useOrdemTabela } from './components/tabela-operacional';
import { LinhaContrato, type IndicadoresOrdem } from './components/linha-contrato';
import { ConsultaOperacionalAvulsa } from './components/consulta-operacional-avulsa';
import { PreviaContrato } from '@/app/atividades/components/cartao-atividade';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useListaContratos, usePendentesConclusao } from '@/hooks/use-contratos';
import { type Contrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from './components/area-contratos';
import { lerEstadoCarteira, salvarEstadoCarteira, type AbaCarteira } from '@/lib/estado-lista-contratos';
import { situacaoVisivelContrato, estadoContextualContrato } from '@/lib/estado-visivel-contrato';

import { opcoesStatusCarteira, filtroCompativel, correspondeStatusCarteira, correspondeBuscaCarteira } from '@/lib/filtros-carteira';

const LISTA_VAZIA: Contrato[] = [];
// O HTML SSR e a primeira hidratação usam o mesmo placeholder. No cliente,
// a seleção salva já está no estado inicial quando as abas se tornam visíveis.
const observarCliente = () => () => {};
const snapshotCliente = () => true;
const snapshotServidor = () => false;

export default function ContratosListPage() {
  const cache = useRepositorioConsultas();
  const [contratoModal, setContratoModal] = useState<{ id: string; foco: HTMLElement | null; destino?: {etapaId:string;entregavelId?:string} } | null>(null);
  const [novoContrato, setNovoContrato] = useState(false);
  const [gatilhoNovoContrato, setGatilhoNovoContrato] = useState<HTMLElement | null>(null);
  const {ordem,alternar}=useOrdemTabela();
  const [metricas,setMetricas]=useState<Record<string,IndicadoresOrdem>>({});
  const receberMetricas=useCallback((id:string,v:IndicadoresOrdem)=>setMetricas(atual=>({...atual,[id]:v})),[]);
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
  const [filtro, setFiltro] = useState(() => filtroCompativel(filtroArquivo, preferenciasIniciais?.status ?? ''));
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
    const pendente = idsPendentes.includes(c.id);
    const situacao = situacaoVisivelContrato(c, pendente);
    return (filtroArquivo === 'todos' || situacao === filtroArquivo)
      && correspondeStatusCarteira(c, filtro, pendente) && correspondeBuscaCarteira(c, busca, campoBusca);
  }).sort((a,b) => b.inicioVigencia.localeCompare(a.inicioVigencia)||a.numeroContrato.localeCompare(b.numeroContrato,'pt-BR',{numeric:true})), [contratos, busca, campoBusca, filtro, filtroArquivo, idsPendentes]);
  const ordenados=ordenarTabela(visiveis,ordem,(c,campo)=>campo==='titulo'?c.numeroContrato:campo==='contratante'?c.orgaoContratante:campo==='vigencia'?c.inicioVigencia:campo==='status'?ordemEstados[estadoContextualContrato(c,idsPendentes.includes(c.id))]:metricas[c.id]?.[campo]);
  return <AreaContratos titulo="Gestão de Contratos">
    <section className="flex flex-wrap items-center justify-between gap-3" aria-label="Cabeçalho dos contratos" data-pi-carteira-cabecalho>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-foreground">Contratos</h2>
        {estadoRestaurado ? <AbasRolaveis className="w-full sm:w-auto sm:flex-1"><div role="tablist" aria-label="Situação dos contratos" className="pi-carteira-abas flex max-w-full flex-wrap items-center gap-1">
          {(['todos', 'ativos', 'revisao', 'pendentes', 'concluidos', 'arquivados'] as const).map(opcao => <button key={opcao} type="button" role="tab"
            aria-selected={filtroArquivo === opcao} title={opcao === 'concluidos' ? 'Inclui contratos concluídos e encerrados' : undefined} aria-label={opcao === 'todos' ? 'Todos os contratos' : opcao === 'ativos' ? 'Contratos ativos' : opcao === 'concluidos' ? 'Contratos finalizados' : opcao === 'pendentes' ? 'Contratos pendentes de conclusão' : opcao === 'revisao' ? 'Contratos em revisão' : 'Contratos arquivados'}
            onClick={() => { setFiltroArquivo(opcao); setFiltro(anterior => filtroCompativel(opcao, anterior)); }}
            className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtroArquivo === opcao ? (opcao === 'arquivados' ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-700/75 text-white') : 'text-foreground/65 hover:bg-slate-700/35 hover:text-foreground'}`}>
            {opcao === 'arquivados' ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg> : opcao === 'todos' ? 'Todos' : opcao === 'ativos' ? 'Ativos' : opcao === 'concluidos' ? '◉ Finalizados' : opcao === 'pendentes' ? 'Pendente de conclusão' : 'Em revisão'}
          </button>)}
        </div></AbasRolaveis> : <div aria-hidden="true" data-testid="abas-aguardando-restauracao"
          className="h-9 min-w-[240px] rounded-xl border border-transparent opacity-0" />}
      </div>
      {perfil?.perfil === 'ADMINISTRADOR' && <button type="button" onClick={evento=>{setGatilhoNovoContrato(evento.currentTarget);setNovoContrato(true);}} data-pi-cadastro-neutro data-tec08-acao-criar="contrato"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-green px-3 text-xs font-semibold text-on-brand-green transition hover:brightness-110">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="4" y="3" width="15" height="18" rx="2"/><path d="M8 8h7M8 12h4M16 14v6m-3-3h6"/></svg>
        Cadastrar contrato
      </button>}
    </section>
    {erro && <div className="space-y-2"><Aviso erro>{erro}</Aviso><button type="button" onClick={() => void lista.atualizar().catch(() => {})} className="text-sm text-brand-neon underline">Tentar novamente</button></div>}
    {!perfil ? <Aviso>{erro || "Verificando perfil..."}</Aviso> : !estadoRestaurado || carregando ? <Aviso>Carregando contratos...</Aviso> : erro ? null : <>
      {<div className="pi-carteira-filtros" aria-label="Filtros de contratos">
        <div className="pi-carteira-controles">
          <div className="min-w-0 pi-filtro-campo">
            <label htmlFor="campo-busca" className="mb-1 block text-xs font-medium text-foreground/70">Buscar por</label>
            <select id="campo-busca" value={campoBusca} onChange={e => setCampoBusca(e.target.value as typeof campoBusca)}
              className="h-10 w-full rounded-lg border border-brand-green/30 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon">
              <option value="todos">Todos os campos</option><option value="numero">Número</option>
              <option value="codigo">Código</option><option value="orgao">Órgão</option><option value="objeto">Objeto</option>
            </select>
          </div>
          <div className="min-w-0 pi-filtro-pesquisa">
            <label htmlFor="busca-contrato" className="mb-1 block text-xs font-medium text-foreground/70">Pesquisar</label>
            <div className="relative">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
              <input id="busca-contrato" type="search" data-pi-campo-com-icone="inicio" maxLength={160} placeholder="Pesquisar contrato..." aria-label="Pesquisar contrato"
                className="h-10 w-full rounded-lg border border-brand-green/30 bg-background pl-9 pr-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon"
                value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
          </div>
          <div className="min-w-0 pi-filtro-status">
            <label htmlFor="filtro-status" className="mb-1 block text-xs font-medium text-foreground/70">Filtrar por situação</label>
            <select id="filtro-status" className="h-10 w-full rounded-lg border border-brand-green/30 bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon"
              value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)}>
              <option value="">Todos os status</option>
              {opcoesStatusCarteira(filtroArquivo).map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </div>
          <button disabled={!busca && campoBusca === 'todos' && !filtro} type="button" onClick={() => { setBusca(''); setCampoBusca('todos'); setFiltro(''); }}
            className="pi-limpar-filtros h-10 shrink-0 rounded-lg border border-current/20 px-3 text-xs text-foreground/70 hover:bg-current/5">Limpar filtros</button>
        </div>
      </div>}
      <div className="flex flex-wrap items-end justify-between gap-3"><p className="text-xs text-foreground/60">{visiveis.length} contrato(s) {filtroArquivo === 'arquivados' ? 'arquivado(s)' : filtroArquivo === 'concluidos' ? 'finalizado(s)' : filtroArquivo === 'pendentes' ? 'pendente(s) de conclusão' : filtroArquivo === 'revisao' ? 'em revisão' : filtroArquivo === 'cancelados' ? 'cancelado(s)' : filtroArquivo === 'suspensos' ? 'suspenso(s)' : filtroArquivo === 'todos' ? 'no total' : 'ativos'}</p></div>
      {filtroArquivo === 'pendentes' && contratos.some(c => c.conclusaoSolicitadaEm === undefined) && (buscandoPendentes || pendentesQuery.erro) ? <Aviso>{buscandoPendentes ? 'Consultando pendências de conclusão...' : 'Não foi possível consultar os contratos pendentes. Atualize a página.'}</Aviso> : !contratos.length ? <Aviso>Nenhum contrato cadastrado ou atribuído à sua conta.</Aviso> : !visiveis.length ? <Aviso>Nenhum resultado para os filtros escolhidos.</Aviso> :
        <div className="pi-tabela-scroll"><table className="pi-tabela-operacional pi-tabela-carteira" aria-label="Contratos"><colgroup>{Array.from({length:9},(_,i)=><col key={i}/>)}</colgroup><thead><tr>{[['titulo','Contrato'],['contratante','Contratante'],['vigencia','Vigência'],['execucao','Execução'],['etapas','Etapas'],['entregaveis','Entregáveis'],['evidencias','Evidências'],['comprovacao','Comprovação'],['status','Status']].map(([campo,titulo])=><CabecalhoColuna key={campo} campo={campo} titulo={titulo} ordem={ordem} alternar={alternar}/>)}</tr></thead><tbody>{ordenados.map(c=><LinhaContrato key={c.id} contrato={c} pendente={idsPendentes.includes(c.id)} onIndicadores={receberMetricas} abrir={(el,destino)=>{preservarRetorno();setContratoModal({id:c.id,foco:el,destino});}}/>)}</tbody></table></div>}
      {novoContrato && <ModalNovoContrato focoRetorno={gatilhoNovoContrato} onFechar={()=>setNovoContrato(false)} onCriado={async()=>{cache.invalidar(['contratos','lista']);await lista.atualizar().catch(()=>{});}}/>}
      {contratoModal && (contratoModal.destino ? <ConsultaOperacionalAvulsa contratoId={contratoModal.id} destino={contratoModal.destino} foco={contratoModal.foco} fechar={() => setContratoModal(null)}/> : <PreviaContrato contratoId={contratoModal.id} foco={contratoModal.foco} fechar={() => setContratoModal(null)} />)}

    </>}
  </AreaContratos>;
}
