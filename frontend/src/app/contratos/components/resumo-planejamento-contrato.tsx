'use client';
import { useEffect, useRef, useState } from 'react';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis } from '@/hooks/use-entregaveis';

/** Resumo do planejamento real — nunca representa a comprovação como progresso. */
export function ResumoPlanejamentoContrato({ contratoId }: { contratoId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const alvo = ref.current;
    if (!alvo) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observar = new IntersectionObserver((entradas) => {
      if (entradas.some((entrada) => entrada.isIntersecting)) setVisivel(true);
    }, { rootMargin: '200px' });
    observar.observe(alvo);
    return () => observar.disconnect();
  }, []);
  // Ambientes sem IntersectionObserver recebem conteúdo normalmente.
  const habilitado = visivel || typeof IntersectionObserver === 'undefined';
  const etapas = useEtapas(contratoId, habilitado);
  const entregaveis = useEntregaveis(contratoId, habilitado);
  const erro = etapas.erro || entregaveis.erro;
  const pronto = habilitado && !erro && Array.isArray(etapas.dados) && Array.isArray(entregaveis.dados);
  const itens = pronto ? entregaveis.dados!.filter(e => e.contratoId === contratoId) : [];
  const previstas = itens.reduce((total, e) => total + e.evidenciasEsperadas.length, 0);
  const obrigatorias = itens.reduce((total, e) => total + e.evidenciasEsperadas.filter(ev => ev.obrigatoria).length, 0);
  const etapasValidas = pronto ? etapas.dados!.filter(e => e.contratoId === contratoId).length : 0;
  const concluidas = pronto ? etapas.dados!.filter(e => e.contratoId === contratoId && e.status === 'CONCLUIDA').length : 0;
  return <div ref={ref} data-testid="resumo-planejamento-contrato" className="mt-4 grid min-w-0 gap-3 border-t border-brand-green/15 pt-3 text-xs sm:grid-cols-2">
    {erro ? <p role="status" className="text-foreground/65">Indicadores indisponíveis.</p> : !pronto ?
      <p role="status" className="text-foreground/60">Consultando indicadores...</p> : <>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2"><strong>Etapas</strong><span className="tabular-nums">{concluidas} / {etapasValidas}</span></div>
        <progress aria-label="Etapas concluídas" max={Math.max(1, etapasValidas)} value={concluidas}
          className="h-2 w-full accent-violet-500" />
      </div>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2"><strong>Evidências</strong><span className="tabular-nums" title="Entrega ainda não mensurada">— / {obrigatorias}</span></div>
        <div role="status" aria-label="Evidências entregues: não mensuradas" className="h-2 w-full rounded-full bg-foreground/10" />
      </div>
      <span className="sr-only">{itens.length} entregáveis planejados. {previstas} evidências esperadas ao todo. Entregas ainda não mensuradas.</span>
    </>}
  </div>;
}
