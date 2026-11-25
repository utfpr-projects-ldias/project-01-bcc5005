'use client';
import { formatarPercentualSemAnteciparConclusao } from '@/lib/apresentacao-indicadores';
import type { Ocorrencia } from '@/hooks/use-ocorrencias';
import type { ProgressoEntregavel } from '@/hooks/use-progresso';
import { AnelProgresso } from './anel-progresso';
import { diaLocalBrasil } from '@/lib/estado-temporal';
const dia=(v:string)=>Date.parse(`${v}T00:00:00Z`);
export function diasPlanejamento(inicio:string|null,fim:string|null,hoje:string) {
  const total=inicio&&fim?(dia(fim)-dia(inicio))/86400000+1:0;
  if (!inicio || !Number.isFinite(total) || total<=0 || !Number.isFinite(dia(hoje))) return {total:0,decorridos:0};
  return {total,decorridos:Math.max(0,Math.min(total,(dia(hoje)-dia(inicio))/86400000+1))};
}
/** O motor TEC09 é autoritativo para o progresso; filtros não alteram a série. */
export function ProgressoSerieRecorrente({registros,inicio,fim,resumoFisico}:{registros:Ocorrencia[];inicio:string|null;fim:string|null;resumoFisico?:ProgressoEntregavel}) {
  const ativos=registros.filter(o=>!o.substituidaEm);
  const percentual=resumoFisico?.percentualExecucao??null;
  const progresso=typeof percentual==='number'&&Number.isFinite(percentual)?Math.min(100,Math.max(0,percentual)):null;
  const {total,decorridos}=diasPlanejamento(inicio,fim,diaLocalBrasil());
  const fracao=resumoFisico?.realizado!=null&&resumoFisico.previsto!=null?`${resumoFisico.realizado}/${resumoFisico.previsto}`:null;
  return <div data-pi-resumo-serie className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-current/20 bg-current/[0.025] px-3 py-2 sm:gap-5">
    <div className="min-w-0 space-y-1.5"><div className="flex flex-wrap items-center justify-between gap-1 text-xs"><strong>Execução das ocorrências</strong><span className="tabular-nums">{progresso===null?'Não calculável':formatarPercentualSemAnteciparConclusao(progresso,1)}</span></div>
      <div role="progressbar" aria-label="Avanço das ocorrências" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso??undefined} className="h-2 overflow-hidden rounded-full bg-current/10"><div style={{width:`${progresso??0}%`,backgroundColor:'var(--pi-cor-propria, #5fd34a)'}} className="h-full rounded-full"/></div>
      <p className="text-xs text-foreground/65">{fracao?`${fracao} concluídas`: `${ativos.length} ocorrências ativas · aguardando cálculo`}{resumoFisico?.fonte==='PESOS_SERIE_INCOMPLETOS'?' · pesos incompletos':''}</p></div>
    <div className="flex items-center gap-1.5" title="Dias decorridos do planejamento; não representa execução física">
      <strong className="max-w-[5.5rem] text-center text-[11px] leading-tight">Tempo do planejamento</strong>
      <AnelProgresso atual={decorridos} total={total} rotulo="Dias do planejamento" cor="contextual" formato="fracao" tamanho={64}/>
    </div>
  </div>;
}
