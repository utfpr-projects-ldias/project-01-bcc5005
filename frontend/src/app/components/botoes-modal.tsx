'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { IconeConclusao, IconeReabertura } from './icones-ciclo-vida';
import { IconeEngrenagem } from './icone-engrenagem';
import { CLASSES_ACAO_MENU, type IntencaoAcao } from '@/lib/identidade-operacional';

/** Controle de edição independente do menu Fechar/Reabrir. A permissão deve ser validada também na API. */
export function BotaoEditarModal({ rotulo, className = '', ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & { rotulo: string }) {
  return <button {...props} type="button" aria-label={rotulo} title={rotulo} data-pi-controle-modal="editar"
    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-current transition-colors hover:text-brand-neon focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-40 ${className}`}>
    <IconeEngrenagem />
  </button>;
}

/** Opção de ciclo de vida padronizada, neutra no fundo e com tinta por ação.
 * O contexto da entidade não deve modificar essa cor e o disabled deve ficar cinza.
 */
export function BotaoAcaoModal({ intencao, children, className = '', ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { intencao: IntencaoAcao; children: ReactNode }) {
  return <button {...props} type="button" data-pi-intencao={intencao}
    className={`flex min-h-9 w-full items-center justify-start gap-2 rounded-lg border bg-transparent px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:!border-slate-500/20 disabled:!bg-slate-500/10 disabled:!text-foreground/40 ${CLASSES_ACAO_MENU[intencao]} ${className}`}>
    {(intencao === 'solicitar-conclusao' || intencao === 'concluir') && <IconeConclusao className="h-4 w-4 shrink-0 text-violet-500" />}
    {intencao === 'reabrir' && <IconeReabertura className="h-4 w-4 shrink-0 text-green-500" />}
    {intencao === 'arquivar' && <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-orange-500" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v11h14V9M10 13h4"/></svg>}
    {children}
  </button>;
}
