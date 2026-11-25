/** Ícones de situação reutilizados por abas e filtros. */
export function IconeStatus({ tipo }: { tipo: 'ativas' | 'revisao' | 'pendentes' | 'concluidas' | 'arquivadas' }) {
  if (tipo === 'arquivadas') return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 14h4"/></svg>;
  if (tipo === 'concluidas') return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="9"/><path d="m7 12 3.2 3.2L17 8"/></svg>;
  if (tipo === 'pendentes') return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4v.5"/></svg>;
  if (tipo === 'revisao') return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3v.5"/></svg>;
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 9h8M8 14h8"/></svg>;
}
