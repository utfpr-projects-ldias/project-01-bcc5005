'use client';
import { useEffect, useLayoutEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { bloquearRolagemDocumento } from '@/lib/bloqueio-rolagem-modal';
import { rotuloCodigoPublico } from '@/lib/codigos-publicos';

/** Edição/criação em sobreposição: sem rolagem para o rodapé, foco contido e retorno ao gatilho. */
export function ModalEtapa({ titulo, ocupado, onFechar, focoRetorno, contexto = 'Planejamento do contrato', rotuloFechar = 'Fechar edição da etapa', textoFechar = 'Fechar ×', camada = 'principal', bloqueadoPorSubmodal = false, compacto = false, retornoEsquerda = false, somenteIconeFechar = false, ocultarFechar = false, alturaEstavel = false, formularioLongo = false, concluido = false, acoes, codigoPublico, children }: {
  titulo: string; ocupado: boolean; onFechar: () => void; focoRetorno?: HTMLElement | null; contexto?: string; rotuloFechar?: string; textoFechar?: string; camada?: 'principal' | 'aninhada' | 'evidencia' | 'edicao'; bloqueadoPorSubmodal?: boolean; compacto?: boolean; retornoEsquerda?: boolean; somenteIconeFechar?: boolean; ocultarFechar?: boolean; alturaEstavel?: boolean; formularioLongo?: boolean; concluido?: boolean; acoes?: ReactNode; codigoPublico?: number | null; children: ReactNode;
}) {
  const tituloId = useId();
  const painel = useRef<HTMLDivElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Caso o gatilho não seja passado, usa o foco pré-modal como alternativa.
    const anteriorFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const liberarRolagem = bloquearRolagemDocumento();
    // O foco de uma camada de baixo não deve capturar a interação do filho.
    if (!bloqueadoPorSubmodal) fecharRef.current?.focus({ preventScroll: true });
    return () => {
      liberarRolagem();
      const destino = focoRetorno?.isConnected ? focoRetorno : anteriorFoco;
      // Um submodal pode ter tomado o foco; nunca transferi-lo para trás
      // quando outra camada permanece acima.
      const camadas = document.querySelectorAll('[data-tec08-modal]');
      if (destino?.isConnected && camadas.length <= 1) destino.focus({ preventScroll: true });
    };
  }, [focoRetorno]);
  useEffect(() => {
    // Durante a edição, o único Cancelar fica no rodapé: orientar o teclado ao formulário.
    if (ocultarFechar) painel.current?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus({ preventScroll: true });
  }, [ocultarFechar]);
  // A edição reutiliza a mesma janela de consulta. Sem esta restauração o scroll
  // da consulta anterior pode fazer o formulário parecer aberto pelo meio.
  // useLayoutEffect acontece antes da pintura; não desloca os modais-pai.
  useLayoutEffect(() => {
    if (!formularioLongo) return;
    const conteudo = painel.current?.querySelector<HTMLElement>('[data-tec08-corpo-modal]');
    if (conteudo) conteudo.scrollTop = 0;
  }, [formularioLongo]);
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
  const camadaVisual = camada === 'edicao' ? 'z-[150] bg-black/[0.035] backdrop-blur-[0.5px]'
    : camada === 'evidencia' ? 'z-[130] bg-black/[0.025] backdrop-blur-[0.5px]'
    : camada === 'aninhada' ? 'z-[115] bg-black/[0.025] backdrop-blur-[0.5px]'
    : 'z-[100] bg-black/[0.04] backdrop-blur-[0.5px]';
  // Em desktops, a largura diminui a cada nível; no celular, o espaço é
  // preservado para leitura e usamos a navegação pelo botão Voltar.
  const larguraPainel = camada === 'edicao' ? 'max-w-lg' : camada === 'evidencia' ? 'max-w-xl' : camada === 'aninhada' ? 'max-w-3xl'
    : compacto ? 'max-w-2xl' : 'max-w-3xl';
  const corConclusao = concluido ? 'border-violet-400/60' : 'border-brand-green/40';
  const corTitulo = concluido ? 'text-violet-300' : 'text-brand-neon';
  const alturaPainel = formularioLongo ? 'h-[min(88dvh,850px)]' : camada === 'evidencia' ? 'max-h-[min(64dvh,590px)]'
    : camada === 'aninhada' ? 'max-h-[min(76dvh,680px)] min-h-[min(64dvh,570px)]'
    : `max-h-[min(88dvh,850px)] ${alturaEstavel ? 'min-h-[min(82dvh,730px)]' : ''}`;
  // O maxHeight inline aplica o limite também quando uma classe arbitrária
  // de altura não for gerada pelo Tailwind.
  return <div data-tec08-modal className={`fixed inset-0 flex min-h-0 items-center justify-center overflow-y-auto p-3 sm:p-5 ${camadaVisual} ${bloqueadoPorSubmodal ? 'pointer-events-none' : ''}`}
    onMouseDown={(e) => {
      if (ocupado || !camadaSuperior(e.currentTarget)) return;
      if (e.button === 3) { // botão lateral «Voltar» do mouse, caso entregue ao DOM
        e.preventDefault(); e.stopPropagation(); fechar();
      } else if (e.button === 0 && e.target === e.currentTarget) {
        e.preventDefault(); e.stopPropagation(); fechar();
      }
    }}>
    <div ref={painel} role="dialog" aria-modal={!bloqueadoPorSubmodal} aria-hidden={bloqueadoPorSubmodal || undefined} aria-labelledby={tituloId} onKeyDown={teclado}
      style={{ maxHeight: 'calc(100dvh - 24px)', minHeight: 0, ...(formularioLongo ? { height: 'min(88dvh, 850px)' } : {}) }}
      className={`flex w-full ${larguraPainel} ${alturaPainel} min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border ${corConclusao} bg-background text-foreground shadow-[0_18px_65px_rgba(0,0,0,0.3)] ${bloqueadoPorSubmodal ? 'pointer-events-none' : ''}`}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-brand-green/20 px-4 py-3 sm:px-5">
        {retornoEsquerda && <button ref={fecharRef} type="button" onClick={fechar} disabled={ocupado}
          aria-label={rotuloFechar} title={rotuloFechar}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-green/25 text-foreground transition-colors hover:border-brand-green/60 hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>}
        <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/60">{contexto}</p>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-2"><h2 id={tituloId} title={titulo} className={`min-w-0 text-lg font-semibold leading-snug ${corTitulo} ${camada === 'evidencia' ? 'truncate' : 'line-clamp-2 break-words [overflow-wrap:anywhere]'}`}>{titulo}</h2>{codigoPublico != null && <span className="shrink-0 font-mono text-xs text-foreground/60">{rotuloCodigoPublico(codigoPublico)}</span>}</div></div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {acoes}
        {!retornoEsquerda && !ocultarFechar && <button ref={fecharRef} type="button" onClick={fechar} disabled={ocupado}
          aria-label={rotuloFechar} title={rotuloFechar}
          className={`${somenteIconeFechar ? 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg' : 'rounded-lg px-3 py-2 text-sm'} border border-brand-green/35 font-semibold transition-colors hover:bg-brand-green/15 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50`}>
          {somenteIconeFechar ? <span aria-hidden="true">×</span> : textoFechar}</button>}
        </div>
      </header>
      <div data-tec08-corpo-modal className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 [scrollbar-gutter:stable]">{children}</div>
    </div>
  </div>;
}
