'use client';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

/** Edição/criação em sobreposição: sem rolagem para o rodapé, foco contido e retorno ao gatilho. */
export function ModalEtapa({ titulo, ocupado, onFechar, focoRetorno, children }: {
  titulo: string; ocupado: boolean; onFechar: () => void; focoRetorno?: HTMLElement | null; children: ReactNode;
}) {
  const tituloId = useId();
  const painel = useRef<HTMLDivElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Caso o gatilho não seja passado, usa o foco pré-modal como alternativa.
    const anteriorFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrollAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fecharRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = scrollAnterior;
      const destino = focoRetorno?.isConnected ? focoRetorno : anteriorFoco;
      if (destino?.isConnected) destino.focus({ preventScroll: true });
    };
  }, [focoRetorno]);
  function fechar() { if (!ocupado) onFechar(); }
  function teclado(evento: KeyboardEvent<HTMLDivElement>) {
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
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
    onMouseDown={(e) => { if (e.target === e.currentTarget && !ocupado) { e.preventDefault(); fechar(); } }}>
    <div ref={painel} role="dialog" aria-modal="true" aria-labelledby={tituloId} onKeyDown={teclado}
      className="flex max-h-[min(90vh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-brand-green/45 bg-background text-foreground shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-brand-green/25 px-4 py-3 sm:px-6">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-foreground/60">Planejamento do contrato</p>
          <h2 id={tituloId} className="mt-1 break-words text-lg font-bold text-brand-neon">{titulo}</h2></div>
        <button ref={fecharRef} type="button" onClick={fechar} disabled={ocupado}
          aria-label="Fechar edição da etapa" className="rounded-lg border border-brand-green/35 px-3 py-2 text-sm font-semibold transition-colors hover:bg-brand-green/15 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">Fechar ×</button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5">{children}</div>
    </div>
  </div>;
}
