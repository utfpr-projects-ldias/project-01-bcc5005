'use client';
import { useEffect, useRef, useState } from 'react';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import { comprovacaoDocumentalCompleta, entregavelDocumentalmenteConcluido } from '@/lib/situacao-documental-etapa';

/** Indicadores de comprovação documental. Não representam avanço físico (PRD). */
function Segmentos({ total, completos, rotulo }: {
  total: number; completos: number; rotulo: string;
}) {
  const taxa = total > 0 ? Math.min(100, Math.max(0, completos / total * 100)) : 0;
  return <div className="h-[7px] w-[170px] max-w-full overflow-hidden rounded-full bg-violet-500/20"
    role="img" aria-label={rotulo}>
    <div className="h-full rounded-full bg-violet-500 transition-[width] duration-300" style={{ width: `${taxa}%` }} />
  </div>;
}

export function ResumoPlanejamentoContrato({ contratoId, variante = 'carteira', compactoNaLista = false, contratoReabertoEm = null }: { contratoId: string; variante?: 'carteira' | 'detalhe'; compactoNaLista?: boolean; contratoReabertoEm?: string | null }) {
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
  const habilitado = visivel || typeof IntersectionObserver === 'undefined';
  const etapas = useEtapas(contratoId, habilitado);
  const entregaveis = useEntregaveis(contratoId, habilitado);
  const documental = useResumoDocumentalContrato(contratoId, habilitado);
  const erro = etapas.erro || entregaveis.erro;
  const pronto = habilitado && !erro && Array.isArray(etapas.dados) && Array.isArray(entregaveis.dados);
  const itens = pronto ? entregaveis.dados!.filter(e => e.contratoId === contratoId && !e.arquivadoEm &&
    etapas.dados!.some(etapa => etapa.id === e.etapaId && !etapa.arquivadoEm)) : [];
  const previstas = itens.reduce((total, e) => total + e.evidenciasEsperadas.length, 0);
  const obrigatorias = itens.reduce((total, e) => total + e.evidenciasEsperadas.filter(ev => ev.obrigatoria).length, 0);
  const etapasDoContrato = pronto ? etapas.dados!.filter(e => e.contratoId === contratoId && !e.arquivadoEm) : [];
  const etapasValidas = etapasDoContrato.length;
  const resumo = documental.dados;
  const comprovacaoCompleta = (id: string) => {
    const estado = resumo?.[id];
    const item = itens.find(e => e.id === id);
    return !!item && entregavelDocumentalmenteConcluido(item, estado);
  };
  // Não alterar statusExecucao/status da etapa: comprovação documental e execução física são distintas.
  const finalizados = resumo ? itens.filter(e => comprovacaoCompleta(e.id)).length : 0;
  const concluidas = resumo ? etapasDoContrato.filter(etapa => {
    const vinculados = itens.filter(e => e.etapaId === etapa.id);
    return !etapa.reabertoEm && vinculados.length > 0 && vinculados.every(e => comprovacaoCompleta(e.id));
  }).length : 0;
  const evidenciasVerificadas = resumo ? itens.reduce((total, e) => total + (resumo[e.id]?.verificadasTotal ?? 0), 0) : 0;
  // Conclusão DOCUMENTAL global; não reescreve o status operacional do contrato.
  // Exigir registros evita concluir por vacuidade (0/0); contar somente itens ativos.
  const documentacaoCompleta = Boolean(!contratoReabertoEm && pronto && resumo && !documental.erro &&
    etapasValidas > 0 && itens.length > 0 && previstas > 0 &&
    concluidas === etapasValidas && finalizados === itens.length &&
    evidenciasVerificadas === previstas);
  const taxaEntregaveis = itens.length ? (finalizados / itens.length) * 100 : 0;
  const taxaEvidencias = previstas > 0 ? (evidenciasVerificadas / previstas) * 100 : 0;
  const rotuloEtapas = `${concluidas} de ${etapasValidas} etapas com documentação completa; não é execução física`;
  const rotuloEvidencias = `${evidenciasVerificadas} de ${previstas} evidências verificadas; não é execução física`;
  const pizza = (concluidos: number, total: number, taxa: number, rotulo: string) => <div role="img"
    aria-label={`${concluidos} de ${total} ${rotulo}`}
    className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full"
    style={{ background: `conic-gradient(#a78bfa ${taxa}%, rgba(167,139,250,.17) 0)` }}>
    <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-background">
      <strong className="text-sm tabular-nums text-white">{concluidos}/{total}</strong>
    </div>
  </div>;
  return <div ref={ref} data-testid="resumo-planejamento-contrato" data-documental-completo={documentacaoCompleta ? "true" : "false"} className={variante === 'detalhe'
    ? 'grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3'
    : `mt-3 grid min-w-0 gap-y-3 border-t border-brand-green/15 pt-3 text-xs ${compactoNaLista ? 'gap-x-3 md:grid-cols-[minmax(0,170px)_minmax(0,170px)]' : 'gap-x-4 sm:grid-cols-2'}`}>
    {erro ? <p role="status" className="text-foreground/65">Indicadores indisponíveis.</p> : !pronto ?
      <p role="status" className="text-foreground/60">Consultando planejamento...</p> : variante === 'detalhe' ? <>
        <section className="min-w-0 space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/[0.04] p-4" aria-label="Resumo de etapas">
          <p className="text-xs font-medium uppercase tracking-wide text-white/80">Etapas</p>
          <div className="flex flex-wrap items-baseline gap-2"><strong className="text-2xl tabular-nums text-white">{concluidas}/{etapasValidas}</strong>
            <span className="text-xs text-foreground/65">com comprovação completa</span></div>
          <Segmentos total={etapasValidas} completos={concluidas} rotulo={rotuloEtapas} />
        </section>
        <section className="flex min-w-0 items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/[0.04] p-4" aria-label="Resumo de entregáveis">
        {pizza(finalizados, itens.length, taxaEntregaveis, 'entregáveis com comprovação documental completa; não é execução física')}
        <p className="min-w-0 text-sm font-semibold text-white">Entregáveis</p>
      </section>
      <section className="flex min-w-0 items-center gap-3 rounded-xl border border-violet-500/30 bg-violet-500/[0.04] p-4" aria-label="Resumo de evidências">
        {pizza(evidenciasVerificadas, previstas, taxaEvidencias, 'evidências verificadas; não é execução física')}
        <p className="min-w-0 text-sm font-semibold text-white">Evidências</p>
      </section>
      </> : <>
      <div className="min-w-0 space-y-1.5">
        <div className="flex max-w-[170px] items-center justify-between gap-2"><strong>Etapas</strong>
          <span className="tabular-nums text-foreground/75">{etapasValidas ? `${concluidas} de ${etapasValidas}` : '0 de 0'}</span></div>
        <Segmentos total={etapasValidas} completos={concluidas} rotulo={rotuloEtapas} />
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex max-w-[170px] items-center justify-between gap-2"><strong>Evidências</strong>
          <span className="tabular-nums text-foreground/75">{previstas ? `${resumo ? evidenciasVerificadas : '…'} de ${previstas}` : '0 de 0'}</span></div>
        <Segmentos total={previstas} completos={evidenciasVerificadas} rotulo={rotuloEvidencias} />
      </div>
      <span className="sr-only">{obrigatorias} obrigatórias. {itens.length} entregáveis previstos. O andamento físico e a comprovação real são dimensões separadas.</span>
    </>}
  </div>;
}
