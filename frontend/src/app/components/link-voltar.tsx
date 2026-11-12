import Link from "next/link";
import type { ReactNode } from "react";

/** Ação contextual de retorno, sem recarregar o documento. */
export function LinkVoltar({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href}
      className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg border border-brand-green/30 bg-brand-darkgreen/10 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand-green/60 hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green">
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m15 18-6-6 6-6" />
      </svg>
      <span>{children}</span>
    </Link>
  );
}
