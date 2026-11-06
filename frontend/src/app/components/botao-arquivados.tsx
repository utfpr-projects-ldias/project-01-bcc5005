import type { ButtonHTMLAttributes } from 'react';

/** Atalho compacto para alternar entre registros ativos e arquivados. */
export function BotaoArquivados({ ativo = false, rotulo = 'Ver arquivados', className = '', ...props }:
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title' | 'aria-label'> & { ativo?: boolean; rotulo?: string }) {
  return <button type="button" title={rotulo} aria-label={rotulo} aria-pressed={ativo} {...props}
    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 transition-colors hover:bg-amber-500/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:opacity-50 ${ativo ? 'bg-amber-500/30 ring-1 ring-inset ring-amber-500/40' : ''} ${className}`}>
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M12 12v6m-3-3 3 3 3-3"/>
    </svg>
  </button>;
}
