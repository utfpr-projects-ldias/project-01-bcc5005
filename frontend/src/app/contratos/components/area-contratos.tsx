import type { ReactNode } from 'react';

/** As rotas internas compartilham o menu e cabeçalho persistentes no layout raiz. */
export function AreaContratos({ children }: { titulo: string; children: ReactNode }) {
  return <div className="pi-area-contratos min-w-0 space-y-4">{children}</div>;
}

export function Aviso({ children, erro = false }: { children: ReactNode; erro?: boolean }) {
  return <p data-pi-aviso-neutro={!erro||undefined} role={erro ? 'alert' : 'status'} className={`min-w-0 break-words rounded-xl border p-4 text-sm ${erro ? 'border-red-500/40 text-error-text' : 'border-current/20 text-foreground/75'}`}>{children}</p>;
}
