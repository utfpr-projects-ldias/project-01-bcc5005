'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { IconeEngrenagem } from './icone-engrenagem';
import { CLASSES_ACAO_MENU, type IntencaoAcao } from '@/lib/identidade-operacional';

/** Controle de edição independente do menu Fechar/Reabrir. A permissão deve ser validada também na API. */
export function BotaoEditarModal({ rotulo, className = '', ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & { rotulo: string }) {
  return <button {...props} type="button" aria-label={rotulo} title={rotulo} data-pi-controle-modal="editar"
    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-current transition-colors hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-40 ${className}`}>
    <IconeEngrenagem tamanho={19}/>
  </button>;
}

/** Opção de ciclo de vida padronizada, neutra no fundo e com tinta por ação.
 * O contexto da entidade não deve modificar essa cor e o disabled deve ficar cinza.
 */
export function BotaoAcaoModal({ intencao, children, className = '', ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { intencao: IntencaoAcao; children: ReactNode }) {
  return <button {...props} type="button" data-pi-intencao={intencao}
    className={`flex min-h-9 w-full items-center justify-start gap-2 rounded-lg border bg-transparent px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:!border-slate-500/20 disabled:!bg-slate-500/10 disabled:!text-foreground/40 ${CLASSES_ACAO_MENU[intencao]} ${className}`}>
    {children}
  </button>;
}
