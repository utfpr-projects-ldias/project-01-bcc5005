'use client';
import type { Ocorrencia } from '@/hooks/use-ocorrencias';
const percentual=(valor:number)=>Math.min(100,Math.max(0,valor));
const dia=(v:string)=>Date.parse(`${v}T00:00:00Z`);
export function ProgressoSerieRecorrente({registros,inicio,fim}:{registros:Ocorrencia[];inicio:string|null;fim:string|null}) {
  const ativos=registros.filter(o=>!o.substituidaEm);
  const concluidos=ativos.filter(o=>o.status==='CONCLUIDO');
  const pesos=ativos.map(o=>o.pesoPeriodo==null?null:Number(o.pesoPeriodo));
  const parcial=pesos.some(p=>p!==null)&&pesos.some(p=>p===null);
  const soma=pesos.reduce<number>((a,b)=>a+(b??0),0);
  const pesosValidos=pesos.length>0&&pesos.every(p=>p!==null&&p>=0)&&Math.abs(soma-100)<0.00001;
  const pesoConcluido=ativos.reduce((a,o,i)=>a+(o.status==='CONCLUIDO'?(pesos[i]??0):0),0);
  const progresso=pesosValidos?percentual(pesoConcluido):parcial?null:ativos.length?percentual(concluidos.length/ativos.length*100):0;
  const hoje=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const diasTotais=inicio&&fim?(dia(fim)-dia(inicio))/86400000+1:0;
  const diasDecorridos=inicio&&fim?Math.max(0,Math.min(diasTotais,(dia(hoje)-dia(inicio))/86400000+1)):0;
  const tempo=diasTotais>0?percentual(diasDecorridos/diasTotais*100):null;
  return <div className="grid gap-3 rounded-xl border border-current/20 bg-current/[0.025] p-3 sm:grid-cols-2">
    <div className="space-y-1"><div className="flex justify-between gap-2 text-xs"><strong>Execução das ocorrências</strong><span>{progresso===null?'Pesos incompletos':`${progresso.toFixed(1).replace('.',',')}%`}</span></div>
      <div role="progressbar" aria-label="Avanço das ocorrências" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso??undefined} className="h-2.5 overflow-hidden rounded-full bg-current/10"><div style={{width:`${progresso??0}%`}} className="h-full rounded-full bg-violet-500"/></div>
      <p className="text-xs text-foreground/65">{concluidos.length}/{ativos.length} concluídas{pesosValidos?' · ponderado por período':''}</p></div>
    <div className="space-y-1"><div className="flex justify-between gap-2 text-xs"><strong>Tempo do planejamento</strong><span>{tempo==null?'Datas indisponíveis':`${tempo.toFixed(1).replace('.',',')}%`}</span></div>
      <div role="progressbar" aria-label="Tempo transcorrido" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tempo??undefined} className="h-2.5 overflow-hidden rounded-full bg-current/10"><div style={{width:`${tempo??0}%`}} className="h-full rounded-full bg-teal-500"/></div>
      <p className="text-xs text-foreground/65">{Math.round(diasDecorridos)} de {Math.round(diasTotais)} dias · não equivale ao progresso físico</p></div>
  </div>;
}
