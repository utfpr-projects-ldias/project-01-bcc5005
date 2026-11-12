'use client';

import type { Ocorrencia } from '@/hooks/use-ocorrencias';

const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const cores: Record<string, string> = {
  NAO_INICIADO: 'border-neutral-400/50 bg-neutral-500/10 text-foreground',
  EM_ANDAMENTO: 'border-lime-500/60 bg-lime-500/15 text-lime-700 dark:text-lime-200',
  EM_REVISAO: 'border-teal-500/60 bg-teal-500/15 text-teal-800 dark:text-teal-200',
  PENDENTE_CONCLUSAO: 'border-amber-500/65 bg-amber-500/15 text-amber-700 dark:text-amber-200',
  PENDENTE_ENCERRAMENTO: 'border-purple-500/60 bg-purple-500/15 text-purple-700 dark:text-purple-200',
  CONCLUIDO: 'border-violet-500/60 bg-violet-500/15 text-violet-700 dark:text-violet-200',
  ENCERRADA: 'border-purple-500/70 bg-purple-500/20 text-purple-700 dark:text-purple-200',
};
const nomes: Record<string,string> = {
  NAO_INICIADO:'Não iniciada',EM_ANDAMENTO:'Em andamento',EM_REVISAO:'Em revisão',
  PENDENTE_CONCLUSAO:'Pendente de conclusão',PENDENTE_ENCERRAMENTO:'Pendente de encerramento',
  CONCLUIDO:'Concluída',ENCERRADA:'Encerrada',
};
const iso = (v:string|null|undefined):v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
const hoje = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const formatar = (v:string) => v.split('-').reverse().join('/');
const mes = (v:string) => new Date(`${v.slice(0,7)}-01T12:00:00Z`).toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
const periodo = (o:Ocorrencia) => ({inicio:o.periodoInicio||o.dataPrevista||o.periodoFim||'',fim:o.periodoFim||o.dataPrevista||o.periodoInicio||''});
const chave = (o:Ocorrencia) => periodo(o).inicio;

/** Recorrência determina a dimensão da grade: o usuário não escolhe Lista/Calendário.
 * Cada ocorrência continua sendo um registro único do banco, inclusive quando
 * preservada após replanejamento; sua posição visual não muda datas nem cálculo.
 */
export function CalendarioOcorrencias({registros,aoAbrir,periodicidade='DIARIA'}:{
  registros:Ocorrencia[];aoAbrir:(item:Ocorrencia,gatilho:HTMLElement)=>void;periodicidade?:string;
}) {
  const hojeIso=hoje();
  const ativos=registros.filter(o=>!o.substituidaEm);
  const todosConcluidos=ativos.length>0&&ativos.every(o=>o.status==='CONCLUIDO');
  const existeEncerrada=ativos.some(o=>o.status==='ENCERRADA');
  const corTotal=existeEncerrada?'border-purple-500/55 bg-purple-500/[0.04]':todosConcluidos?'border-violet-500/55 bg-violet-500/[0.04]':'border-current/25 bg-background/20';
  const card=(o:Ocorrencia)=>{
    const valor=periodo(o),status=o.substituidaEm?'Arquivada':nomes[o.status]??o.status;
    const cor=o.substituidaEm?'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-200':cores[o.status]??cores.NAO_INICIADO;
    return <button type="button" key={o.id} aria-label={`Abrir ocorrência ${o.titulo}, ${status}, ${formatar(valor.inicio)}`}
      onClick={e=>aoAbrir(o,e.currentTarget)} title={`${o.titulo} — ${status}`}
      className={`block w-full min-w-0 rounded-lg border px-1.5 py-1.5 text-left text-xs font-semibold transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current ${cor}`}>
      <span className="block truncate" title={o.titulo}>{o.titulo}</span>
    </button>;
  };
  const grupos=new Map<string,Ocorrencia[]>();
  const semData:Ocorrencia[]=[];
  const chaveGrupo=(data:string)=>{
    const ano=data.slice(0,4),n=Number(data.slice(5,7));
    if(periodicidade==='ANUAL')return `${ano}-01`;
    if(periodicidade==='SEMESTRAL')return `${ano}-${n<=6?'01':'07'}`;
    if(periodicidade==='TRIMESTRAL')return `${ano}-${String(Math.floor((n-1)/3)*3+1).padStart(2,'0')}`;
    // DIARIA: uma célula por dia; semanal e mensal: um cartão por período.
    return data.slice(0,7);
  };
  registros.forEach(o=>{
    if(!iso(chave(o))){semData.push(o);return;}
    const k=chaveGrupo(chave(o)),grupo=grupos.get(k)??[];
    grupo.push(o);grupos.set(k,grupo);
  });
  const oAtual=(o:Ocorrencia)=>{const p=periodo(o);return p.inicio<=hojeIso&&p.fim>=hojeIso;};
  const atrasado=(o:Ocorrencia)=>periodo(o).fim<hojeIso;
  const tituloGrupo=(k:string)=>{
    if(periodicidade==='ANUAL')return k.slice(0,4);
    if(periodicidade==='SEMESTRAL')return `${k.slice(5)==='01'?'1º':'2º'} semestre de ${k.slice(0,4)}`;
    if(periodicidade==='TRIMESTRAL')return `${Math.floor((Number(k.slice(5))-1)/3)+1}º trimestre de ${k.slice(0,4)}`;
    return mes(`${k}-01`);
  };
  return <div data-pi-calendario-ocorrencias data-periodicidade={periodicidade} aria-label={`Calendário ${periodicidade.toLowerCase()} de ocorrências`} className="min-w-0 space-y-4">
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 ${corTotal}`}>
      <h4 className="font-semibold">Calendário {periodicidade.toLocaleLowerCase('pt-BR')}</h4>
      <span className="text-xs text-foreground/70">{todosConcluidos?'Todos os períodos concluídos':existeEncerrada?'Contém encerramento administrativo':'Situações por período'}</span>
    </div>
    {Array.from(grupos.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([k,itens])=>{
      const ano=Number(k.slice(0,4)),mesNumero=Number(k.slice(5,7));
      const inicio=new Date(Date.UTC(ano,mesNumero-1,1));
      const qtdDias=new Date(Date.UTC(ano,mesNumero,0)).getUTCDate();
      const deslocamento=(inicio.getUTCDay()+6)%7;
      const gradeDiaria=periodicidade==='DIARIA';
      const ordenados=itens.slice().sort((a,b)=>chave(a).localeCompare(chave(b)));
      return <section key={k} className={`min-w-0 overflow-hidden rounded-xl border ${corTotal}`}>
        <h5 className="border-b border-current/15 px-4 py-3 text-base font-semibold capitalize">{tituloGrupo(k)}</h5>
        {gradeDiaria?<div className="w-full overflow-x-auto" tabIndex={0} aria-label={`Dias de ${tituloGrupo(k)}`}>
          <div className="min-w-[620px] p-1 sm:min-w-0">
            <div className="grid grid-cols-7 gap-0.5" aria-hidden="true">{dias.map(d=><span key={d} className="py-2 text-center text-xs font-semibold text-foreground/65">{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-0.5" role="group" aria-label={`Períodos de ${tituloGrupo(k)}`}>
              {Array.from({length:deslocamento},(_,i)=><div key={`offset${i}`} aria-hidden="true" />)}
              {Array.from({length:qtdDias},(_,i)=>{
                const data=`${k}-${String(i+1).padStart(2,'0')}`;
                const itensDoDia=ordenados.filter(o=>periodo(o).inicio===data);
                const atual=hojeIso===data,passado=data<hojeIso;
                return <div key={data} data-dia-atual={atual||undefined}
                  className={`min-h-24 space-y-1 rounded-lg border p-1.5 ${atual?'border-brand-green bg-brand-green/10 ring-1 ring-brand-green/50': 'border-current/15 bg-current/[0.03]'} ${passado?'opacity-65':''}`}>
                  <time dateTime={data} className="flex items-center justify-between gap-1 text-xs font-bold tabular-nums"><span>{i+1}</span>{atual&&<span className="text-[10px] text-brand-neon">Hoje</span>}</time>
                  {itensDoDia.map(card)}
                </div>;
              })}
            </div>
          </div>
        </div>:<div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordenados.map(o=>{
            const p=periodo(o),atual=oAtual(o),passado=atrasado(o);
            return <div key={o.id} className={`space-y-2 rounded-xl border border-current/20 p-3 ${atual?'ring-1 ring-brand-green/70':passado?'opacity-65':''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                <time dateTime={p.inicio}>{formatar(p.inicio)}{p.fim!==p.inicio?` – ${formatar(p.fim)}`:''}</time>
                {atual&&<span className="text-brand-neon">{periodicidade==='SEMANAL'?'Semana atual':periodicidade==='MENSAL'?'Mês atual':'Período atual'}</span>}
              </div>
              {card(o)}
            </div>;
          })}
        </div>}
      </section>;
    })}
    {semData.length>0&&<section className="space-y-2 rounded-xl border border-current/20 p-3"><h5 className="font-semibold">Sem data</h5>{semData.map(card)}</section>}
  </div>;
}
