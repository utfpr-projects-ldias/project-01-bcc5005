'use client';
import { useCamadaInterativa } from '@/lib/camadas-interativas';

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { CORES_COMPROVACAO, apresentarFracao, tomComprovacao } from '@/lib/apresentacao-indicadores';

/** A largura é do modal, não do iframe ou do viewport. Reserva a largura existente
 * do painel (304px) e ao menos 720px para conteúdo e navegação. */
export const LARGURA_PAINEL_CONTRATO = 304;
export function precisaPainelExpansivel(largura: number) {
  return largura < LARGURA_PAINEL_CONTRATO + 720;
}

export function SetaPainelContrato({ direcao }: { direcao: 'esquerda' | 'direita' }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={direcao === 'esquerda' ? 'M19 12H5m6-6-6 6 6 6' : 'M5 12h14m-6-6 6 6-6 6'}/></svg>;
}

export function NumeroComprovacoes({ feitas, total }: { feitas?: number | null; total?: number | null }) {
  const fracao = apresentarFracao(feitas,total);
  const tom = tomComprovacao(feitas,total);
  return <div className="grid min-w-0 grid-rows-[4rem_auto] items-center gap-1 text-center sm:grid-rows-[4.5rem_auto]" data-pi-comprovacoes={tom}>
    <strong className={`break-words text-lg font-bold tabular-nums ${CORES_COMPROVACAO[tom]}`} aria-label={fracao.estado === 'indisponivel' ? 'Comprovações indisponíveis' : fracao.estado === 'sem-requisitos' ? 'Sem requisitos documentais (0/0)' : `${fracao.texto} requisitos documentais atendidos`}>{fracao.texto}</strong>
    <span className="text-xs text-foreground/65">Comprovações</span>
  </div>;
}

/** Preserva uma única árvore de conteúdo ao alternar entre painel fixo e drawer. */
export function PainelLateralContrato({ compacto, aberto, onFechar, children }: { compacto: boolean; aberto: boolean; onFechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const modal = compacto && aberto;
  const oculto = compacto && !aberto;
  useCamadaInterativa(modal,()=>ref.current,onFechar,40);
  useEffect(() => {
    if (!modal) return;
    const quadro = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[data-pi-fechar-painel]')?.focus({preventScroll:true}));
    return () => cancelAnimationFrame(quadro);
  }, [modal]);
  function teclado(evento: KeyboardEvent<HTMLElement>) {
    if (!modal) return;
    if (evento.key === 'Escape') {
      evento.preventDefault(); evento.stopPropagation(); onFechar(); return;
    }
    if (evento.key !== 'Tab') return;
    const focaveis = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(el => el.tabIndex >= 0 && !el.closest('[hidden], [inert]'));
    const primeiro = focaveis[0]; const ultimo = focaveis.at(-1);
    if (!primeiro || !ultimo) { evento.preventDefault(); ref.current?.focus(); return; }
    if (evento.shiftKey && (document.activeElement === primeiro || !ref.current?.contains(document.activeElement))) { evento.preventDefault(); ultimo.focus(); }
    else if (!evento.shiftKey && (document.activeElement === ultimo || !ref.current?.contains(document.activeElement))) { evento.preventDefault(); primeiro.focus(); }
  }
  return <>
    <button type="button" tabIndex={-1} data-pi-fundo-painel data-aberto={modal} aria-hidden="true" aria-label="Recolher painel" className="absolute inset-0 z-20 bg-black/40" onClick={modal ? onFechar : undefined}/>
    <aside ref={ref} aria-label="Resumo e execução física do contrato" role={modal ? 'dialog' : undefined} aria-modal={modal || undefined} aria-hidden={oculto || undefined} inert={oculto || undefined} tabIndex={modal ? -1 : undefined} onKeyDown={teclado}
      data-pi-painel-lateral data-compacto={compacto} data-aberto={!oculto} className="min-h-0 shrink-0 space-y-4 overflow-y-auto overscroll-contain border-l bg-background p-3 sm:p-4">
      {children}
    </aside>
  </>;
}
