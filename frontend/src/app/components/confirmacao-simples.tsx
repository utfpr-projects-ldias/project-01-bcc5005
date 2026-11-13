"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { EstadoContextual } from "@/lib/estado-visivel-contrato";
import { contextoDaDecisao, coresDecisao } from "@/lib/cores-decisoes";

type Props = {
  titulo: string;
  descricao: string;
  confirmar: string;
  ocupado?: boolean;
  perigoso?: boolean;
  cancelarVermelho?: boolean;
  confirmacaoRoxa?: boolean;
  aprovarVerde?: boolean;
  estadoContextual?: EstadoContextual;
  onCancelar: () => void;
  onConfirmar: () => void;
  justificativa?: string;
  onJustificativaChange?: (valor: string) => void;
  justificativaMinima?: number;
};

/** Confirmação da própria interface, sem window.confirm ou dependência externa. */
export function ConfirmacaoSimples({ titulo, descricao, confirmar, ocupado = false, perigoso = false, cancelarVermelho = false, confirmacaoRoxa = false, aprovarVerde = false, estadoContextual = 'normal', onCancelar, onConfirmar, justificativa, onJustificativaChange, justificativaMinima = 15 }: Props) {
  const modalId = useId();
  const estadoDaAcao = contextoDaDecisao(`${titulo} ${confirmar}`, estadoContextual);
  // Logout: confirmação de sessão, com identidade verde do sistema.
  const saidaVerde = /sair da conta|encerrar sessão/i.test(`${titulo} ${confirmar}`);
  const cores = saidaVerde ? {
    borda: 'border-brand-green/50', texto: 'text-brand-neon',
    foco: 'focus-visible:outline-brand-green', campo: 'focus-visible:border-brand-green',
    botao: 'border-brand-green bg-brand-green text-on-brand-green hover:brightness-110',
  } : coresDecisao(estadoDaAcao);
  const corBotao = estadoDaAcao !== 'normal' ? cores.botao : confirmacaoRoxa
    ? 'border-violet-500 bg-violet-700 text-white hover:bg-violet-600'
    : aprovarVerde ? 'border-green-600 bg-green-800 text-white hover:bg-green-700'
    : perigoso ? 'border-red-500 bg-red-700 text-white hover:bg-red-600' : cores.botao;
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelarRef.current?.focus();
    return () => { if (anterior?.isConnected) anterior.focus({ preventScroll: true }); };
  }, []);
  function teclado(evento: React.KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape" && !ocupado) { evento.preventDefault(); onCancelar(); }
    if (evento.key === "Tab") {
      const primeiro = cancelarRef.current;
      const ultimo = confirmarRef.current;
      if (!primeiro || !ultimo) return;
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault(); ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault(); primeiro.focus();
      }
    }
  }
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/15 p-4" onKeyDown={evento => { evento.stopPropagation(); teclado(evento); }}>
      <div role="dialog" aria-modal="true" data-tec08-estado={estadoDaAcao} aria-labelledby={`${modalId}-titulo`} aria-describedby={`${modalId}-descricao`}
        className={`w-full max-w-sm rounded-2xl border ${cores.borda} bg-background p-5 text-foreground shadow-2xl`}>
        <h2 id={`${modalId}-titulo`} className={`text-lg font-semibold ${cores.texto}`}>{titulo}</h2>
        <p id={`${modalId}-descricao`} className="mt-2 break-words text-sm text-foreground/75">{descricao}</p>
        {onJustificativaChange && <label className="mt-4 block text-sm font-medium text-foreground" htmlFor={`${modalId}-justificativa`}>
          Justificativa obrigatória ({justificativaMinima} a 200 caracteres)
          <textarea id={`${modalId}-justificativa`} rows={3} maxLength={200} required
            value={justificativa ?? ''} onChange={evento => onJustificativaChange(evento.target.value)}
            aria-describedby={`${modalId}-contador`}
            className={`mt-2 block w-full resize-y rounded-lg border ${cores.borda} bg-background p-3 text-foreground focus-visible:outline-2 ${cores.foco} ${cores.campo}`} />
          <span id={`${modalId}-contador`} className="mt-1 block text-right text-xs text-foreground/65">{(justificativa ?? '').length}/200</span>
        </label>}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 [&>button]:min-h-10">
          <button ref={cancelarRef} type="button" disabled={ocupado} onClick={onCancelar}
            className={`inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 focus-visible:outline-2 ${cores.foco} ${cancelarVermelho ? "border border-red-500/65 bg-red-600 text-white hover:bg-red-500" : `border ${cores.borda} hover:bg-current/10`}`}>Cancelar</button>
          <button ref={confirmarRef} type="button" aria-busy={ocupado} disabled={ocupado || Boolean(onJustificativaChange && ((justificativa ?? '').trim().length < justificativaMinima || (justificativa ?? '').trim().length > 200))} onClick={onConfirmar}
            data-tec08-confirmar="true" data-tec08-acao-roxa={confirmacaoRoxa || undefined} data-tec08-acao-aprovar={aprovarVerde || undefined} className={`inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-65 ${corBotao} ${cores.foco}`}>
            {ocupado ? "Aguarde..." : confirmar}
          </button>
        </div>
      </div>
    </div>
  , document.body);
}
