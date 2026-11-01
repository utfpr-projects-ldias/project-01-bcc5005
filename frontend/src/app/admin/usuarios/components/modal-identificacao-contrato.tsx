"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { ContratoResumo } from "@/lib/admin-usuarios";
import { ajustarRestauracaoHistorico } from "@/lib/historico-modal-scroll";

/** Consulta, sem alterar permissões, dados contratuais ou URL. */
export function ModalIdentificacaoContrato({ contrato, focoRetorno, onFechar }: {
  contrato: ContratoResumo;
  focoRetorno: HTMLButtonElement | null;
  onFechar: () => void;
}) {
  const tituloId = useId();
  const painel = useRef<HTMLDivElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);
  const marcador = useRef<string | null>(null);

  useEffect(() => {
    const focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowAnterior = document.body.style.overflow;
    const restauracaoAnterior = window.history.scrollRestoration;
    const posicaoAnterior = { x: window.scrollX, y: window.scrollY };
    const estadoAnterior = window.history.state;
    const estadoPreservado = estadoAnterior && typeof estadoAnterior === "object" ? estadoAnterior : {};
    const id = `identificacao:${tituloId}:${Date.now()}`;

    marcador.current = id;
    document.body.style.overflow = "hidden";
    ajustarRestauracaoHistorico("manual");
    // Entrada transitória sem mudança de URL; conserva o estado interno do Next App Router.
    window.history.pushState({ ...estadoPreservado, __modalIdentificacaoContrato: id }, "", window.location.href);
    botaoFechar.current?.focus({ preventScroll: true });

    function voltar() {
      if (marcador.current && window.history.state?.__modalIdentificacaoContrato !== marcador.current) {
        marcador.current = null;
        onFechar();
      }
    }
    window.addEventListener("popstate", voltar);
    return () => {
      window.removeEventListener("popstate", voltar);
      document.body.style.overflow = overflowAnterior;
      ajustarRestauracaoHistorico(restauracaoAnterior);
      const alvo = focoRetorno?.isConnected ? focoRetorno : focoAnterior;
      if (alvo?.isConnected) alvo.focus({ preventScroll: true });
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          if (Math.abs(window.scrollY - posicaoAnterior.y) > 1 || Math.abs(window.scrollX - posicaoAnterior.x) > 1) {
            window.scrollTo({ left: posicaoAnterior.x, top: posicaoAnterior.y, behavior: "instant" });
          }
        });
      }
    };
  }, [focoRetorno, onFechar, tituloId]);

  function fechar() {
    if (marcador.current && window.history.state?.__modalIdentificacaoContrato === marcador.current) {
      marcador.current = null;
      // Fecha só a entrada temporária; não volta para a página anterior de funcionários.
      window.history.back();
    }
    onFechar();
  }

  function teclado(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      evento.stopPropagation();
      fechar();
    }
    if (evento.key !== "Tab") return;
    const focaveis = Array.from(painel.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter((el) => el.getClientRects().length > 0 || el === botaoFechar.current);
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && evento.button === 0) {
          evento.preventDefault();
          fechar();
        }
      }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onKeyDown={teclado}
        className="flex max-h-[90dvh] w-full max-w-xl min-w-0 flex-col overflow-hidden rounded-2xl border border-brand-green/45 bg-background text-foreground shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-brand-green/25 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs text-foreground/65">Código #{contrato.codigoPublico}</p>
            <h2 id={tituloId} className="text-lg font-semibold">Identificação completa do contrato</h2>
          </div>
          <button
            ref={botaoFechar}
            type="button"
            aria-label="Fechar identificação do contrato"
            className="shrink-0 rounded-lg border border-brand-green/40 px-3 py-2 text-sm hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-green"
            onClick={fechar}
          >Fechar</button>
        </header>
        <dl className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 text-sm sm:px-6">
          <div className="min-w-0">
            <dt className="mb-1 font-semibold text-foreground/65">Número do contrato</dt>
            <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{contrato.numeroContrato}</dd>
          </div>
          <div className="min-w-0">
            <dt className="mb-1 font-semibold text-foreground/65">Órgão contratante</dt>
            <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{contrato.orgaoContratante}</dd>
          </div>
        </dl>
        <footer className="flex shrink-0 justify-end border-t border-brand-green/25 px-4 py-3 sm:px-6">
          <button type="button" className="rounded-lg border border-brand-green/40 px-4 py-2 text-sm hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-green" onClick={fechar}>Voltar</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
