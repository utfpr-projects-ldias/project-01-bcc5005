"use client";

import { useEffect, useRef } from "react";

type Props = {
  titulo: string;
  descricao: string;
  confirmar: string;
  ocupado?: boolean;
  perigoso?: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
};

/** Confirmação da própria interface, sem window.confirm ou dependência externa. */
export function ConfirmacaoSimples({ titulo, descricao, confirmar, ocupado = false, perigoso = false, onCancelar, onConfirmar }: Props) {
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelarRef.current?.focus(); }, []);
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
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onKeyDown={teclado}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirmacao-titulo" aria-describedby="confirmacao-descricao"
        className="w-full max-w-sm rounded-2xl border border-brand-green/35 bg-background p-5 text-foreground shadow-2xl">
        <h2 id="confirmacao-titulo" className="text-lg font-semibold">{titulo}</h2>
        <p id="confirmacao-descricao" className="mt-2 break-words text-sm text-foreground/75">{descricao}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancelarRef} type="button" disabled={ocupado} onClick={onCancelar}
            className="rounded-lg border border-brand-green/40 px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand-green">Cancelar</button>
          <button ref={confirmarRef} type="button" disabled={ocupado} onClick={onConfirmar}
            className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand-green ${perigoso ? "bg-red-600 text-white" : "bg-brand-green text-background"}`}>
            {ocupado ? "Aguarde..." : confirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
