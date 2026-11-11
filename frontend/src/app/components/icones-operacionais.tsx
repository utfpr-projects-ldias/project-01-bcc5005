/** Ícones consistentes no menu global e nas abas de contrato. */
export function IconeAtividades({ tamanho = 20 }: { tamanho?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M8 12h8M8 16h5"/>
  </svg>;
}
export function IconeOcorrencias({ tamanho = 20 }: { tamanho?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.8 10.5l1.8 1.8 3.6-3.7"/>
  </svg>;
}
