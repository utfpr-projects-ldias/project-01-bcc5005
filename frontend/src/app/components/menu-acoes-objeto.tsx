'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Menu universal: só exibe ações autorizadas recebidas do módulo. Não altera permissões nem regras da API. */
export function MenuAcoesObjeto({ children, rotulo = 'Fechar', disabled = false }: {
  children: ReactNode; rotulo?: string; disabled?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState({top: 0, left: 0, acima: false});
  useEffect(() => {
    if (!aberto) return;
    const reposicionar = () => {
      const r = botao.current?.getBoundingClientRect();
      if (!r) return;
      const altura = Math.min(480, painel.current?.offsetHeight || 260, window.innerHeight * 0.60);
      const acima = r.bottom + altura + 12 > window.innerHeight && r.top >= altura + 12;
      setPosicao({ top: acima ? r.top - 6 : r.bottom + 6, acima,
        left: Math.max(12, Math.min(r.right - 274, window.innerWidth - 286)) });
    };
    reposicionar();
    const fechar = (e: PointerEvent) => {
      if (e.target instanceof Node && !painel.current?.contains(e.target) && !botao.current?.contains(e.target)) setAberto(false);
    };
    const teclado = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); botao.current?.focus(); } };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', teclado);
    window.addEventListener('resize', reposicionar);
    window.addEventListener('scroll', reposicionar, true);
    return () => { document.removeEventListener('pointerdown', fechar); document.removeEventListener('keydown', teclado);
      window.removeEventListener('resize', reposicionar); window.removeEventListener('scroll', reposicionar, true); };
  }, [aberto]);
  return <>
    <button ref={botao} type="button" disabled={disabled} aria-expanded={aberto} aria-haspopup="menu" aria-label={`${rotulo}: escolher ação`}
      onClick={() => {
         const r = botao.current?.getBoundingClientRect();
         if (r) setPosicao({ top: r.bottom + 6,
           left: Math.max(12, Math.min(r.right - 274, window.innerWidth - 286)), acima: false });
         setAberto(v => !v);
       }}
      className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-400/40 bg-slate-500/15 px-3 py-2 text-xs font-semibold text-foreground hover:bg-slate-500/25 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>
      {rotulo}
      <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {aberto && createPortal(<div ref={painel} role="menu" aria-label={rotulo}
      style={{ position: 'fixed', top: posicao.top, left: posicao.left, transform: posicao.acima ? 'translateY(-100%)' : undefined, width: 274, maxHeight: 'min(60dvh,480px)' }}
      className="z-[1000] flex flex-col gap-1 overflow-y-auto rounded-2xl border border-slate-500/50 bg-background p-2 text-sm shadow-[0_16px_45px_rgba(0,0,0,0.65)] [&_button]:!flex [&_button]:!min-h-10 [&_button]:!h-auto [&_button]:!w-full [&_button]:!justify-start [&_button]:!gap-2 [&_button]:!rounded-lg [&_button]:!px-3 [&_button]:!py-2 [&_button]:!text-left [&_button]:!text-sm [&_button:not(:disabled)]:hover:!brightness-125 [&_button:not(:disabled)]:hover:!ring-1 [&_button:not(:disabled)]:hover:!ring-current/30 [&_button]:focus-visible:!outline-2 [&_button]:focus-visible:!outline-offset-1 [&_button]:focus-visible:!outline-current [&_button:disabled]:!cursor-not-allowed [&_button:disabled]:!bg-slate-600/15 [&_button:disabled]:!text-foreground/35"
      onClick={e => { if (e.target instanceof Element && e.target.closest('button:not(:disabled)')) setAberto(false); }}>
      {children}
    </div>, document.body)}
  </>;
}
