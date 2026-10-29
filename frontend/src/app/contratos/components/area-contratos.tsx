import type { ReactNode } from 'react';

/** As rotas internas compartilham o menu e cabeçalho persistentes no layout raiz. */
export function AreaContratos({ children }: { titulo: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-6">{children}</div>;
}

export function Aviso({ children, erro = false }: { children: ReactNode; erro?: boolean }) {
  return <p role={erro ? 'alert' : 'status'} className={`min-w-0 break-words rounded-xl border p-4 text-sm ${erro ? 'border-red-500/40 text-red-400' : 'border-brand-green/30 text-foreground/75'}`}>{children}</p>;
}
