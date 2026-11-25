'use client';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';

import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { contextoDaDecisao, coresDecisao } from '@/lib/cores-decisoes';
import { useEffect, useLayoutEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useCamadaInterativa } from '@/lib/camadas-interativas';
import { bloquearRolagemDocumento } from '@/lib/bloqueio-rolagem-modal';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { rotuloCodigoPublico } from '@/lib/codigos-publicos';

/** Edição/criação em sobreposição: sem rolagem para o rodapé, foco contido e retorno ao gatilho. */
export function ModalEtapa({ titulo, ocupado, onFechar, focoRetorno, contexto = 'Planejamento do contrato', rotuloFechar = 'Fechar edição da etapa', textoFechar = 'Fechar ×', camada = 'principal', bloqueadoPorSubmodal = false, compacto = false, estreito = false, larguraAmpla = false, retornoEsquerda = false, mostrarXComVoltar = false, somenteIconeFechar = true, ocultarFechar = false, alturaEstavel = false, formularioLongo = false, formularioHorizontal = false, cabecalhoUmaLinha = false, concluido = false, arquivado = false, revisao = false, estadoContextual = 'normal', acoes, acoesComoMenu = false, rotuloMenuAcoes = 'Fechar', codigoPublico, etiqueta, etiquetaNoContexto = false, atrasado, finalizadoComAtraso, identidadeEntregavel = false, interno = false, cabecalhoContextual = false, larguraFormulario, larguraDetalhe = false, consultaRegistros = false, children }: {
  titulo: string; ocupado: boolean; onFechar: () => void; focoRetorno?: HTMLElement | null; contexto?: string; rotuloFechar?: string; textoFechar?: string; camada?: 'principal' | 'aninhada' | 'evidencia' | 'edicao'; bloqueadoPorSubmodal?: boolean; compacto?: boolean; estreito?: boolean; larguraAmpla?: boolean; retornoEsquerda?: boolean; mostrarXComVoltar?: boolean; somenteIconeFechar?: boolean; ocultarFechar?: boolean; alturaEstavel?: boolean; formularioLongo?: boolean; formularioHorizontal?: boolean; cabecalhoUmaLinha?: boolean; concluido?: boolean; arquivado?: boolean; revisao?: boolean; estadoContextual?: EstadoContextual; acoes?: ReactNode; acoesComoMenu?: boolean; rotuloMenuAcoes?: string; codigoPublico?: number | null; etiqueta?: string; etiquetaNoContexto?: boolean; atrasado?: boolean; finalizadoComAtraso?: boolean; identidadeEntregavel?: boolean; interno?: boolean; cabecalhoContextual?: boolean; larguraDetalhe?: boolean; consultaRegistros?: boolean; larguraFormulario?: 'atividade' | 'evidencia' | 'ocorrencia' | 'entregavel' | 'contrato' | 'etapa' | 'registro' | 'registro-manual' | 'contribuicao'; children: ReactNode;
}) {
  const tituloId = useId();
  const painel = useRef<HTMLDivElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const bloqueioInicial = useRef(bloqueadoPorSubmodal);
  useCamadaInterativa(true, () => painel.current, () => { if (!ocupado && !bloqueadoPorSubmodal) onFechar(); }, interno ? 60 : camada === 'edicao' ? 150 : camada === 'evidencia' ? 130 : camada === 'aninhada' ? 115 : 100);
  useEffect(() => {
    if (interno) return;
    window.dispatchEvent(new Event('pi:fechar-menus'));
    // Caso o gatilho não seja passado, usa o foco pré-modal como alternativa.
    const anteriorFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const liberarRolagem = bloquearRolagemDocumento();
    // O foco de uma camada de baixo não deve capturar a interação do filho.
    if (!bloqueioInicial.current) painel.current?.focus({ preventScroll: true });
    return () => {
      liberarRolagem();
      const destino = focoRetorno?.isConnected ? focoRetorno : anteriorFoco;
      // Um submodal pode ter tomado o foco; nunca transferi-lo para trás
      // quando outra camada permanece acima.
      const camadas = document.querySelectorAll<HTMLElement>('[data-tec08-modal]');
      const superior = camadas.item(camadas.length - 1);
      // Ao fechar uma filha, retornar foco ao gatilho dentro do modal pai que
      // continua no topo. Antes havia um limite arbitrário de uma camada:
      // com etapa + entregável ainda abertos, o foco caía no body e Escape
      // deixava de alcançar o diálogo visível.
      if (destino?.isConnected && (!superior || superior.contains(destino)))
        destino.focus({ preventScroll: true });
    };
  }, [focoRetorno, interno]);
  useEffect(() => {
    if (interno) return;
    // Edição administrativa do contrato no iframe: primeiro encerra os detalhes
    // operacionais ainda abertos. Só o conteúdo da mesma janela recebe o evento.
    const fecharDetalhe = () => { if (!ocupado) onFechar(); };
    window.addEventListener('pi:fechar-modais-operacionais', fecharDetalhe);
    return () => window.removeEventListener('pi:fechar-modais-operacionais', fecharDetalhe);
  }, [ocupado, onFechar, interno]);
  useEffect(() => {
    // Durante a edição, o único Cancelar fica no rodapé: orientar o teclado ao formulário.
    if (ocultarFechar) painel.current?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus({ preventScroll: true });
  }, [ocultarFechar]);
  // A edição reutiliza a mesma janela de consulta. Sem esta restauração o scroll
  // da consulta anterior pode fazer o formulário parecer aberto pelo meio.
  // useLayoutEffect acontece antes da pintura; não desloca os modais-pai.
  useLayoutEffect(() => {
    if (!formularioLongo && !larguraFormulario) return;
    const conteudo = painel.current?.querySelector<HTMLElement>('[data-tec08-corpo-modal]');
    if (conteudo) conteudo.scrollTop = 0;
  }, [formularioLongo, larguraFormulario]);
  function fechar() { if (!ocupado) onFechar(); }
  function teclado(evento: KeyboardEvent<HTMLDivElement>) {
    if (bloqueadoPorSubmodal || !painel.current?.parentElement || !camadaSuperior(painel.current.parentElement)) return;
    if (evento.key === 'Escape' && !ocupado) { evento.preventDefault(); evento.stopPropagation(); fechar(); }
    if (evento.key !== 'Tab') return;
    const focaveis = Array.from(painel.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter((el) => el.getClientRects().length > 0 || el === fecharRef.current);
    if (!focaveis.length) return;
    const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
    else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
  }
  function camadaSuperior(elemento: HTMLElement) {
    // Portals ficam no body: a última camada é a única autorizada a reagir
    // ao botão lateral de Voltar do mouse. Evita fechar todos os pais de uma vez.
    const abertas = document.querySelectorAll<HTMLElement>('[data-tec08-modal]');
    return abertas.length > 0 && abertas.item(abertas.length - 1) === elemento;
  }
  // Cada overlay é transparente. bg-background/90 ou /95 era quase OPACO e
  // escondia o contexto, parecendo uma troca brusca de página.
  // Todos os painéis permanecem VISÍVEIS e montados em pilha. Quando uma janela
  // filha abre, apenas a interação do pai fica bloqueada: nunca usar invisible,
  // opacity-0 ou desmontar seu cabeçalho/rolagem. A redução progressiva de largura
  // e altura deixa as bordas e a seta de Voltar do pai à vista.
  // O acesso por teclado fica reservado ao diálogo superior.
  const camadaVisual = camada === 'edicao' ? 'z-[150] bg-black/25 backdrop-blur-[1px]'
    : camada === 'evidencia' ? 'z-[130] bg-black/20 backdrop-blur-[1px]'
    : camada === 'aninhada' ? 'z-[115] bg-black/20 backdrop-blur-[1px]'
    : 'z-[100] bg-black/[0.12]';
  // Em desktops, a largura diminui a cada nível; no celular, o espaço é
  // preservado para leitura e usamos a navegação pelo botão Voltar.
  const larguraExplicita = larguraFormulario ? {entregavel:1088,ocorrencia:960,evidencia:840,atividade:1024,contrato:1088,etapa:920,registro:600,'registro-manual':520,contribuicao:380}[larguraFormulario] : undefined;
  const larguraPainel = larguraDetalhe ? 'max-w-[76rem]' : larguraFormulario === "entregavel" ? "max-w-[68rem]" : larguraFormulario === "ocorrencia" ? "max-w-[60rem]" : larguraFormulario === "evidencia" ? "max-w-[56rem]" : larguraFormulario === "atividade" ? "max-w-[52rem]" : larguraAmpla ? 'max-w-4xl' : formularioHorizontal ? 'max-w-2xl' : formularioLongo ? 'max-w-5xl' : estreito ? 'max-w-md' : camada === 'edicao' ? 'max-w-lg' : camada === 'evidencia' ? 'max-w-xl' : camada === 'aninhada' ? 'max-w-5xl'
    : compacto ? 'max-w-3xl' : 'max-w-5xl';
  // Cada janela tem uma única identidade: estado próprio prevalece sobre o pai.
  // Um modal de DETALHE usa a situação explícita do próprio objeto; somente
  // um diálogo de decisão sem estado informado infere a cor pelo título.
  // Isso impede que um entregável filho herde a cor da ação ou do contrato-pai.
  const estadoInformado: EstadoContextual = arquivado ? 'arquivado' : concluido ? 'concluido' : revisao ? 'revisao' : estadoContextual;
  const estadoModal = estadoInformado !== 'normal' || identidadeEntregavel || camada === 'evidencia' ? estadoInformado : contextoDaDecisao(titulo, estadoInformado);
  const coresDaAcao = coresDecisao(estadoModal);
  const modalDeDecisao = !identidadeEntregavel && camada !== 'evidencia' && /reabr|reativ|retom|revert|cancelar solicit|cancelar contrato|suspend|arquiv|encerr|finaliz|solicitar conclus|aprovar conclus/i.test(titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const corConclusao = estadoModal === 'finalizado' ? 'border-purple-500/60' : estadoModal === 'arquivado' ? 'border-amber-500/50' : estadoModal === 'concluido' ? 'border-violet-500/45' : estadoModal === 'nao-iniciado' ? 'border-neutral-400/50' : estadoModal === 'andamento' ? 'border-brand-green/60' : estadoModal === 'revisao' ? 'border-teal-600/50' : estadoModal === 'parcial' ? 'border-amber-500/60' : estadoModal === 'pendente' ? 'border-yellow-400/50' : estadoModal === 'suspenso' ? 'border-yellow-500/50' : estadoModal === 'encerrado' ? 'border-slate-500/45' : estadoModal === 'cancelado' ? 'border-red-500/45' : coresDaAcao.borda;
  const corTitulo = estadoModal === 'finalizado' ? 'text-purple-400 dark:text-purple-300' : estadoModal === 'arquivado' ? 'text-amber-200' : estadoModal === 'concluido' ? 'text-violet-300' : estadoModal === 'nao-iniciado' ? 'text-neutral-700 dark:text-neutral-100' : estadoModal === 'andamento' ? 'text-brand-neon' : estadoModal === 'revisao' ? 'text-teal-200' : estadoModal === 'parcial' ? 'text-amber-800 dark:text-amber-200' : estadoModal === 'pendente' ? 'text-yellow-700 dark:text-yellow-200' : estadoModal === 'suspenso' ? 'text-yellow-200' : estadoModal === 'encerrado' ? 'text-foreground' : estadoModal === 'cancelado' ? 'text-red-300' : coresDaAcao.texto;
  const alturaPainel = consultaRegistros ? 'h-[min(78dvh,700px)] max-h-[min(78dvh,700px)]' : larguraDetalhe ? 'max-h-[min(85dvh,780px)]' : larguraFormulario ? 'max-h-[min(90dvh,900px)]' : formularioLongo ? 'h-[min(88dvh,850px)]' : camada === 'evidencia' ? 'max-h-[min(78dvh,700px)]'
    : camada === 'aninhada' ? (compacto ? 'max-h-[min(82dvh,730px)]' : 'h-[min(82dvh,730px)]')
    : alturaEstavel ? 'h-[min(82dvh,730px)]' : 'max-h-[min(88dvh,850px)]';
  // O maxHeight inline aplica o limite também quando uma classe arbitrária
  // de altura não for gerada pelo Tailwind.
  const cabecalho = (
      <header data-pi-cabecalho-hierarquia={Boolean(retornoEsquerda&&(identidadeEntregavel||interno))||undefined} data-pi-cabecalho-contextual={cabecalhoContextual || undefined} className={`flex shrink-0 items-center justify-between gap-2 border-b ${interno ? "px-0 py-3" : "px-3 py-3 sm:px-5"} ${cabecalhoUmaLinha ? 'flex-wrap sm:flex-nowrap' : 'flex-wrap'} ${corConclusao}`}>
        {retornoEsquerda && <button ref={fecharRef} type="button" onClick={fechar} disabled={ocupado}
          data-pi-voltar-hierarquia data-tec08-fechar-modal data-pi-acao="secundaria" aria-label={rotuloFechar} title={rotuloFechar}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent text-foreground transition-colors hover:border-slate-400/65 hover:bg-slate-500/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>}
        <div className="min-w-0 flex-1 pi-header-identidade"><div className="flex min-w-0 flex-wrap items-center justify-start gap-2 pi-header-contexto"><p title={contexto} className={`min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-foreground/60 ${cabecalhoUmaLinha ? 'whitespace-nowrap' : ''}`}>{contexto}</p>
          {etiquetaNoContexto && etiqueta && <span className={`max-w-[145px] shrink-0 truncate whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${corTitulo} ${corConclusao}`}>{etiqueta}</span>}<EtiquetaAtraso atrasado={atrasado} finalizadoComAtraso={finalizadoComAtraso}/></div>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-2 pi-header-titulo"><h2 id={tituloId} tabIndex={-1} data-pi-foco-inicial title={titulo} className={`min-w-0 text-lg font-semibold leading-snug ${corTitulo} ${cabecalhoUmaLinha || camada === 'evidencia' ? 'block truncate whitespace-nowrap' : 'line-clamp-2 break-words [overflow-wrap:anywhere]'}`}>{titulo}</h2>{codigoPublico != null && <span className="shrink-0 font-mono text-xs text-foreground/60">{rotuloCodigoPublico(codigoPublico)}</span>}{!etiquetaNoContexto && etiqueta && <span className={`max-w-[170px] shrink-0 truncate whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${corTitulo} ${corConclusao}`}>{etiqueta}</span>}</div></div>
        <div className={`flex shrink-0 items-center justify-end gap-1 sm:gap-2 ${cabecalhoUmaLinha ? 'flex-wrap sm:flex-nowrap' : 'flex-wrap'}`}>

        {acoesComoMenu && acoes ? <MenuAcoesObjeto disabled={ocupado} rotulo={rotuloMenuAcoes}>{acoes}</MenuAcoesObjeto> : acoes}
        {(!retornoEsquerda || mostrarXComVoltar) && !ocultarFechar && <button ref={fecharRef} type="button" onClick={fechar} disabled={ocupado}
          data-tec08-fechar-modal data-pi-acao="secundaria" aria-label={rotuloFechar} title={rotuloFechar}
          className={`${somenteIconeFechar ? 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg' : 'rounded-lg px-3 py-2 text-sm'} border border-current/40 font-semibold text-current transition-colors hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current disabled:opacity-50`}>
          {somenteIconeFechar ? <span aria-hidden="true">×</span> : textoFechar}</button>}
        </div>
      </header>
  );
  if (interno) return <div role="region" ref={painel} data-pi-detalhe-interno data-pi-entregavel={identidadeEntregavel || undefined} data-tec08-estado={estadoModal} aria-labelledby={tituloId} className="min-w-0 text-foreground">
    {cabecalhoContextual ? <h2 id={tituloId} className="sr-only">{titulo}</h2> : cabecalho}
    <div className={cabecalhoContextual ? "min-w-0" : "min-w-0 py-3"}>{children}</div>
  </div>;
  return <div data-tec08-modal data-pi-consulta-registros={consultaRegistros || undefined} data-tec08-camada={camada} className={`fixed inset-0 flex min-h-0 items-center justify-center overflow-y-auto p-3 sm:p-5 ${camadaVisual} ${bloqueadoPorSubmodal ? 'pointer-events-none' : ''}`}
    onMouseDown={(e) => {
      if (ocupado || !camadaSuperior(e.currentTarget)) return;
      if (e.button === 3) { // botão lateral «Voltar» do mouse, caso entregue ao DOM
        e.preventDefault(); e.stopPropagation(); fechar();
      } else if (e.button === 0 && e.target === e.currentTarget) {
        e.preventDefault(); e.stopPropagation(); fechar();
      }
    }}>
    <div ref={painel} data-pi-consulta-entregavel={larguraDetalhe || undefined} data-pi-formulario-modal={larguraFormulario || undefined} data-pi-modal-neutro={Boolean(larguraDetalhe || larguraFormulario || titulo==='Histórico do contrato') || undefined} data-pi-entregavel={identidadeEntregavel || undefined} data-tec08-entidade="modal" data-tec08-estado={estadoModal} data-tec08-decisao-modal={modalDeDecisao || undefined} role="dialog" tabIndex={-1} aria-modal={!bloqueadoPorSubmodal} aria-hidden={bloqueadoPorSubmodal || undefined} aria-labelledby={tituloId} onKeyDown={teclado}
      style={{ ...(larguraExplicita ? { width: `min(100%, ${larguraExplicita}px)`, maxWidth: `${larguraExplicita}px` } : {}), maxHeight: 'calc(100dvh - 24px)', minHeight: 0, ...(formularioLongo && !larguraFormulario ? { height: 'min(88dvh, 850px)' } : {}) }}
      className={`flex w-full ${larguraPainel} ${alturaPainel} min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border ${corConclusao} bg-background text-foreground shadow-[0_18px_65px_rgba(0,0,0,0.3)] ${bloqueadoPorSubmodal ? 'pointer-events-none' : ''}`}>
      {cabecalho}
      <div data-tec08-corpo-modal className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">{children}</div>
    </div>
  </div>;
}
