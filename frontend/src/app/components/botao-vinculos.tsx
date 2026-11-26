'use client';
import type { ReactNode } from 'react';
/** Mesmo ponto de entrada para a consulta de vínculos de qualquer registro operacional. */
export function BotaoVinculos({children,onClick}:{children:ReactNode;onClick:()=>void}){
  return <button type="button" className="pi-atividade-vinculos-resumo" aria-label="Vínculos e contribuição de execução" onClick={onClick}>
    <span className="font-semibold">Vínculos e contribuição de execução</span>{children}<span aria-hidden="true">›</span>
  </button>;
}
