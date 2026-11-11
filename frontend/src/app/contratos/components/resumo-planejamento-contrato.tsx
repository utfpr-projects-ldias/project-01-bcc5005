'use client';
import { useEffect, useRef, useState } from 'react';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import { calcularIndicadoresContrato } from '@/lib/indicadores-contrato';

function Progresso({ total, feitos, rotulo, amplo = false, arquivado = false, suspenso = false, revisao = false, encerrado = false, concluido = false, cancelado = false }: {
  total: number; feitos: number; rotulo: string; amplo?: boolean; arquivado?: boolean; suspenso?: boolean; revisao?: boolean; encerrado?: boolean; concluido?: boolean; cancelado?: boolean;
}) {
  const taxa = total > 0 ? Math.min(100, Math.max(0, feitos / total * 100)) : 0;
  const fundo = encerrado ? 'bg-slate-600/25' : arquivado ? 'bg-amber-500/20' : cancelado ? 'bg-red-500/20' : suspenso ? 'bg-amber-500/15' : concluido ? 'bg-violet-500/20' : revisao ? 'bg-teal-900/30' : 'bg-brand-green/15';
  const cor = encerrado ? 'bg-slate-400' : arquivado ? 'bg-amber-400' : cancelado ? 'bg-red-500' : suspenso ? 'bg-amber-500' : concluido ? 'bg-violet-500' : revisao ? 'bg-teal-600' : 'bg-brand-green';
  return <div role="img" aria-label={rotulo} className={`h-[7px] max-w-full overflow-hidden rounded-full ${amplo ? 'w-full' : 'w-full'} ${fundo}`}>
    <div className={`h-full rounded-full transition-[width] duration-300 ${cor}`} style={{ width: `${taxa}%` }} />
  </div>;
}

export function ResumoPlanejamentoContrato({ contratoId, variante = 'carteira', compactoNaLista = false, contratoArquivado = false, contratoSuspenso = false, contratoEmRevisao = false, contratoEncerrado = false, contratoConcluido = false, contratoCancelado = false }: {
  contratoId: string; variante?: 'carteira' | 'detalhe'; compactoNaLista?: boolean; contratoArquivado?: boolean; contratoSuspenso?: boolean; contratoEmRevisao?: boolean; contratoEncerrado?: boolean; contratoConcluido?: boolean; contratoCancelado?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const alvo = ref.current;
    if (!alvo || typeof IntersectionObserver === 'undefined') return;
    const observar = new IntersectionObserver(entradas => {
      if (entradas.some(entrada => entrada.isIntersecting)) setVisivel(true);
    }, { rootMargin: '200px' });
    observar.observe(alvo);
    return () => observar.disconnect();
  }, []);
  const habilitado = visivel || typeof IntersectionObserver === 'undefined';
  const etapas = useEtapas(contratoId, habilitado);
  const entregaveis = useEntregaveis(contratoId, habilitado);
  const documental = useResumoDocumentalContrato(contratoId, habilitado);
  const erro = etapas.erro || entregaveis.erro || documental.erro;
  const pronto = habilitado && !erro && Array.isArray(etapas.dados) && Array.isArray(entregaveis.dados) && Boolean(documental.dados);
  const indicadores = pronto ? calcularIndicadoresContrato(contratoId, etapas.dados!, entregaveis.dados!, documental.dados!) : null;
  const evidenciaAtiva = pronto ? entregaveis.dados!.filter(e => e.contratoId === contratoId && !e.arquivadoEm && etapas.dados!.some(et => et.id === e.etapaId && !et.arquivadoEm)) : [];
  const evidenciasEsperadas = evidenciaAtiva.reduce((s, e) => s + e.evidenciasEsperadas.filter(ev => !ev.arquivadoEm && ev.obrigatoria !== false).length, 0);
  const evidenciasVerificadas = evidenciaAtiva.reduce((s, e) => s + (documental.dados?.[e.id]?.verificadas ?? 0), 0);
  const detalhe = variante === 'detalhe';
  const progresso = [
    { nome: 'Etapas', valor: indicadores?.etapas.concluidas ?? 0, total: indicadores?.etapas.total ?? 0, rotulo: `${indicadores?.etapas.concluidas ?? 0} de ${indicadores?.etapas.total ?? 0} etapas concluídas e comprovadas` },
    { nome: 'Entregáveis', valor: indicadores?.entregaveis.concluidos ?? 0, total: indicadores?.entregaveis.total ?? 0, rotulo: `${indicadores?.entregaveis.concluidos ?? 0} de ${indicadores?.entregaveis.total ?? 0} entregáveis documentalmente comprovados` },
    { nome: 'Evidências', valor: evidenciasVerificadas, total: evidenciasEsperadas, rotulo: `${evidenciasVerificadas} de ${evidenciasEsperadas} evidências obrigatórias verificadas` },
  ];
  const borda = contratoArquivado ? 'border-amber-500/35' : contratoCancelado ? 'border-red-500/45' : contratoSuspenso ? 'border-amber-500/45' : contratoEncerrado ? 'border-slate-500/45' : contratoConcluido ? 'border-violet-500/45' : contratoEmRevisao ? 'border-teal-700/45' : 'border-brand-green/25';
  const cor = contratoArquivado ? '#fbbf24' : contratoCancelado ? '#ef4444' : contratoSuspenso ? '#ca8a04' : contratoEncerrado ? '#94a3b8' : contratoConcluido ? '#a78bfa' : contratoEmRevisao ? '#0d9488' : '#5fd34a';
  const donut = (valor: number, total: number, tamanho = 'h-[76px] w-[76px]') => {
    const percentual = total > 0 ? Math.min(100, Math.max(0, valor / total * 100)) : 0;
    return <div aria-hidden="true" className={`relative flex ${tamanho} shrink-0 items-center justify-center rounded-full`}
      style={{ background: `conic-gradient(${cor} ${percentual}%, rgba(148,163,184,.14) ${percentual}% 100%)` }}>
      <div className="flex h-[72%] w-[72%] items-center justify-center rounded-full bg-background">
        <strong className="text-xs font-semibold tabular-nums text-foreground sm:text-sm">{valor}/{total}</strong>
      </div>
    </div>;
  };
  return <div ref={ref} data-testid="resumo-planejamento-contrato"
    data-documental-completo={indicadores?.documentacaoCompleta ? 'true' : 'false'}
    className={detalhe ? 'grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3' :
      `mt-3 grid w-full max-w-[740px] min-w-0 grid-cols-3 items-start justify-start gap-2 border-t border-brand-green/15 pt-3 text-xs sm:gap-3 ${compactoNaLista ? 'lg:max-w-[650px]' : ''}`}>
    {erro ? <p role="status" className="col-span-full text-foreground/65">Indicadores indisponíveis.</p> :
    !indicadores ? <p role="status" className="col-span-full text-foreground/60">Consultando planejamento...</p> : detalhe ? <>
      <section aria-label="Resumo de etapas" className={`min-w-0 space-y-3 rounded-xl border bg-background p-4 ${borda}`}>
        <div className="flex flex-wrap items-center gap-2"><strong className="text-xs font-semibold uppercase tracking-wide text-foreground/80">Etapas</strong><span className="text-lg font-bold tabular-nums text-foreground">{progresso[0].valor}/{progresso[0].total}</span></div>
        <Progresso total={progresso[0].total} feitos={progresso[0].valor} rotulo={progresso[0].rotulo} amplo arquivado={contratoArquivado} suspenso={contratoSuspenso} revisao={contratoEmRevisao} encerrado={contratoEncerrado} concluido={contratoConcluido} cancelado={contratoCancelado}/>
      </section>
      {progresso.slice(1).map(item => <section key={item.nome} aria-label={`Resumo de ${item.nome.toLowerCase()}`} className={`flex min-w-0 items-center gap-3 rounded-xl border bg-background p-4 ${borda}`}>
        <div role="img" aria-label={item.rotulo}>{donut(item.valor, item.total)}</div>
        <p className="min-w-0 text-sm font-semibold text-foreground">{item.nome}</p>
      </section>)}
    </> : progresso.map(item => <section key={item.nome} aria-label={`Resumo de ${item.nome.toLowerCase()}`} className="min-w-0 text-left">
      <div className="mb-2 text-[10px] font-semibold text-foreground sm:text-xs">{item.nome}</div>
      <div className="flex justify-center sm:hidden">{donut(item.valor, item.total, 'h-[66px] w-[66px]')}<span className="sr-only">{item.nome}: {item.valor}/{item.total}</span></div>
      <div className="hidden space-y-2 sm:block">
        <strong className="block tabular-nums text-xs font-medium text-foreground/80">{item.valor}/{item.total}</strong>
        <Progresso total={item.total} feitos={item.valor} rotulo={item.rotulo} arquivado={contratoArquivado} suspenso={contratoSuspenso} revisao={contratoEmRevisao} encerrado={contratoEncerrado} concluido={contratoConcluido} cancelado={contratoCancelado}/>
      </div>
    </section>)}
  </div>;
}
