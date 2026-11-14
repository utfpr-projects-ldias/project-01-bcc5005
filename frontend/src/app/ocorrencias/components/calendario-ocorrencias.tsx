'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Ocorrencia } from '@/hooks/use-ocorrencias';
import { estadoTemporal } from '@/lib/estado-temporal';

const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const cores: Record<string, string> = {
  NAO_INICIADO: 'border-brand-green/40 bg-brand-green/10 text-brand-neon',
  EM_ANDAMENTO: 'border-brand-green/55 bg-brand-green/10 text-brand-neon',
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
const dots: Record<string, string> = {
  NAO_INICIADO: 'bg-green-500',
  EM_ANDAMENTO: 'bg-green-500',
  EM_REVISAO: 'bg-teal-400',
  PENDENTE_CONCLUSAO: 'bg-amber-400',
  PENDENTE_ENCERRAMENTO: 'bg-purple-400',
  CONCLUIDO: 'bg-violet-400',
  ENCERRADA: 'bg-purple-500',
};
const iso = (v:string|null|undefined):v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
const hoje = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const formatar = (v:string) => v.split('-').reverse().join('/');
const mes = (v:string) => new Date(`${v.slice(0,7)}-01T12:00:00Z`).toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
const periodo = (o:Ocorrencia) => ({inicio:o.periodoInicio||o.dataPrevista||o.periodoFim||'',fim:o.periodoFim||o.dataPrevista||o.periodoInicio||''});
const chave = (o:Ocorrencia) => periodo(o).inicio;
const ordemStatus = ['EM_ANDAMENTO','EM_REVISAO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO','NAO_INICIADO','CONCLUIDO','ENCERRADA'];

function statusVisual(o: Ocorrencia, hojeIso: string) {
  return o.substituidaEm ? 'ARQUIVADA' : estadoTemporal(o.status, periodo(o).inicio, hojeIso);
}
function classeStatus(status: string) {
  return status === 'ARQUIVADA'
    ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-200'
    : cores[status] ?? cores.NAO_INICIADO;
}
function nomeStatus(status: string) {
  return status === 'ARQUIVADA' ? 'Arquivada' : nomes[status] ?? status;
}
function corPonto(status: string) {
  return status === 'ARQUIVADA' ? 'bg-amber-400' : dots[status] ?? 'bg-neutral-400';
}

/** Recorrência determina a dimensão da grade: o usuário não escolhe Lista/Calendário.
 * Cada ocorrência continua sendo um registro único do banco, inclusive quando
 * preservada após replanejamento; sua posição visual não muda datas nem cálculo.
 */
export function CalendarioOcorrencias({registros,aoAbrir,periodicidade='DIARIA'}:{
  registros:Ocorrencia[];aoAbrir:(item:Ocorrencia,gatilho:HTMLElement)=>void;periodicidade?:string;
}) {
  const hojeIso=hoje();
  const [mesSelecionado, setMesSelecionado] = useState('');
  const [diaSelecionado, setDiaSelecionado] = useState('');
  const ativos=registros.filter(o=>!o.substituidaEm);
  const todosConcluidos=ativos.length>0&&ativos.every(o=>o.status==='CONCLUIDO');
  const existeEncerrada=ativos.some(o=>o.status==='ENCERRADA');
  // A superfície do calendário pertence ao ENTREGÁVEL. Nenhuma ocorrência
  // pode mudar borda/fundo do calendário inteiro; apenas seus próprios cards.
  const corTotal='pi-agenda-superficie';
  const {grupos,semData}=useMemo(()=>{
    const grupos=new Map<string,Ocorrencia[]>();
    const semData:Ocorrencia[]=[];
    registros.forEach(o=>{
      if(!iso(chave(o))){semData.push(o);return;}
      const k=chave(o).slice(0,7),grupo=grupos.get(k)??[];
      grupo.push(o);grupos.set(k,grupo);
    });
    return {grupos,semData};
  },[registros]);
  const tituloGrupo=(k:string)=>{
    return mes(`${k}-01`);
  };
  const chaves = Array.from(grupos.keys()).sort();
  const chaveAtiva = mesSelecionado || (chaves.includes(hojeIso.slice(0,7)) ? hojeIso.slice(0,7) : chaves[0] ?? hojeIso.slice(0,7));
  const moverMes = (deslocamento:number) => {
    const [ano,numero]=chaveAtiva.split('-').map(Number);
    const data=new Date(Date.UTC(ano,numero-1+deslocamento,1));
    setMesSelecionado(`${data.getUTCFullYear()}-${String(data.getUTCMonth()+1).padStart(2,'0')}`);
    setDiaSelecionado('');
  };
  const itensAtivos = useMemo(() => (grupos.get(chaveAtiva) ?? []).slice().sort((a,b)=>chave(a).localeCompare(chave(b)) || a.titulo.localeCompare(b.titulo)), [grupos, chaveAtiva]);

  const itensPorDia = useMemo(() => {
    const mapa = new Map<string, Ocorrencia[]>();
    for (const item of itensAtivos) {
      const data = periodo(item).inicio;
      const lista = mapa.get(data) ?? [];
      lista.push(item);
      mapa.set(data, lista);
    }
    for (const lista of mapa.values()) {
      lista.sort((a,b) => ordemStatus.indexOf(statusVisual(a, hojeIso)) - ordemStatus.indexOf(statusVisual(b, hojeIso)) || a.titulo.localeCompare(b.titulo));
    }
    return mapa;
  }, [itensAtivos, hojeIso]);

  useEffect(() => {
    if (!chaveAtiva) { if (diaSelecionado) setDiaSelecionado(''); return; }
    // Grade mensal utilizada para todos os recorrentes, independentemente da periodicidade.
    const opcoes = Array.from(itensPorDia.keys()).filter(v => v.startsWith(`${chaveAtiva}-`)).sort();
    const alvoHoje = hojeIso.startsWith(chaveAtiva) ? hojeIso : '';
    if (diaSelecionado.startsWith(`${chaveAtiva}-`) && (itensPorDia.has(diaSelecionado) || !opcoes.length)) return;
    setDiaSelecionado(alvoHoje && (itensPorDia.has(alvoHoje) || !opcoes.length) ? alvoHoje : (opcoes[0] ?? `${chaveAtiva}-01`));
  }, [chaveAtiva, diaSelecionado, itensPorDia, hojeIso, periodicidade]);


  const calendarioVazio = Boolean(chaveAtiva) && !Array.from(itensPorDia.keys()).some(v => v.startsWith(`${chaveAtiva}-`));
  const ocorrenciasDoDia = itensPorDia.get(diaSelecionado) ?? [];

  const cardResumo = (o: Ocorrencia, compacto = false) => {
    const p = periodo(o);
    const visual = statusVisual(o, hojeIso);
    const status = nomeStatus(visual);
    const cor = classeStatus(visual);
    return <button type="button" key={o.id} aria-label={`Abrir ocorrência ${o.titulo}, ${status}, ${formatar(p.inicio)}`}
      onClick={e=>aoAbrir(o,e.currentTarget)}
      className={`group block w-full min-w-0 rounded-xl border p-3 text-left transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-current ${cor} ${compacto ? 'py-2.5' : ''}`}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" title={o.titulo}>{o.titulo}</p>
          <p className="mt-1 text-[11px] opacity-80">{formatar(p.inicio)}{p.fim!==p.inicio?` – ${formatar(p.fim)}`:''}</p>
        </div>
        <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${cor}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${corPonto(visual)}`} aria-hidden="true" />
          {status}
        </span>
      </div>
      {o.observacoes && !compacto && <p className="mt-2 line-clamp-2 text-xs opacity-80">{o.observacoes}</p>}
    </button>;
  };

  return <div data-pi-calendario-ocorrencias data-periodicidade={periodicidade} aria-label={`Calendário ${periodicidade.toLowerCase()} de ocorrências`} className="min-w-0 space-y-3">
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${corTotal}`}>
      <div>
        <h4 className="font-semibold capitalize">{chaveAtiva ? tituloGrupo(chaveAtiva) : `Calendário ${periodicidade.toLocaleLowerCase('pt-BR')}`}</h4>

      </div>
      <div className="flex items-center gap-1">
        <span className="mr-1 hidden text-xs text-foreground/65 sm:inline">{todosConcluidos?'Concluído':existeEncerrada?'Encerramento registrado':'Por período'}</span>
        <button type="button" aria-label="Período anterior" onClick={()=>moverMes(-1)} className="rounded-lg border border-current/20 px-2 py-1 text-sm transition hover:bg-current/10 disabled:opacity-30">‹</button>
        <button type="button" aria-label="Próximo período" onClick={()=>moverMes(1)} className="rounded-lg border border-current/20 px-2 py-1 text-sm transition hover:bg-current/10 disabled:opacity-30">›</button>
      </div>
    </div>

    {chaveAtiva && (() => {
      const ano=Number(chaveAtiva.slice(0,4)),mesNumero=Number(chaveAtiva.slice(5,7));
      const inicio=new Date(Date.UTC(ano,mesNumero-1,1));
      const qtdDias=new Date(Date.UTC(ano,mesNumero,0)).getUTCDate();
      const deslocamento=(inicio.getUTCDay()+6)%7;
      return <section className={`min-w-0 overflow-hidden rounded-xl border ${corTotal}`}>
        <div className="grid min-h-[30rem] min-w-0 gap-0 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.95fr)]">
          <div className="min-w-0 border-b border-current/10 p-3 lg:border-b-0 lg:border-r">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h5 className="text-sm font-semibold">Ocorrências por dia</h5>
              <span className="text-xs text-foreground/60">{itensAtivos.length} ocorrência(s)</span>
            </div>
            <div className="w-full overflow-x-auto" tabIndex={0} aria-label={`Dias de ${tituloGrupo(chaveAtiva)}`}>
              <div className="min-w-[560px]">
                <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden="true">{dias.map(d=><span key={d} className="py-2 text-center text-[11px] font-semibold text-foreground/65">{d}</span>)}</div>
                <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Períodos de ${tituloGrupo(chaveAtiva)}`}>
                  {Array.from({length:deslocamento},(_,i)=><div key={`offset${i}`} aria-hidden="true" className="min-h-[84px] rounded-xl border border-transparent" />)}
                  {Array.from({length:qtdDias},(_,i)=>{
                    const data=`${chaveAtiva}-${String(i+1).padStart(2,'0')}`;
                    const itensDoDia=itensPorDia.get(data) ?? [];
                    const atual=hojeIso===data;
                    const selecionado=diaSelecionado===data;
                    const passado=data<hojeIso;
                    const resumo = ordemStatus.map(status=>({status,qtd:itensDoDia.filter(o=>statusVisual(o,hojeIso)===status).length})).filter(item=>item.qtd>0);
                    return <button type="button" key={data} data-dia-atual={atual||undefined} data-pi-dia-selecionado={selecionado || undefined} aria-pressed={selecionado}
                      onClick={() => setDiaSelecionado(data)}
                      className={`min-h-[84px] rounded-xl border p-2 text-left transition focus-visible:outline-2 focus-visible:outline-current ${selecionado ? 'pi-agenda-dia-selecionado' : atual ? 'pi-agenda-dia-atual' : 'border-current/15 bg-current/[0.03]'} ${passado?'opacity-80':''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <time dateTime={data} className="text-sm font-semibold tabular-nums">{i+1}</time>

                      </div>
                      {itensDoDia.length > 0 ? <>
                        <div className="mt-2 flex flex-wrap gap-1" aria-label={`${itensDoDia.length} ocorrências neste dia`}>{resumo.map(item => <span key={item.status} title={`${item.qtd} ${nomeStatus(item.status).toLowerCase()}`} className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${corPonto(item.status)}`}>{item.qtd}</span>)}</div>
                      </> : <p className="mt-4 text-[11px] text-foreground/45">Sem registros</p>}
                    </button>;
                  })}
                </div>
              </div>
            </div>
          </div>
          <aside className="pi-agenda-painel-dia min-w-0 p-3">
            <div className="flex items-center justify-between gap-2 border-b border-current/10 pb-2">
              <div>
                <h5 className="text-sm font-semibold">{diaSelecionado ? formatar(diaSelecionado) : 'Selecione um dia'}</h5>
                <p className="text-xs text-foreground/60">{ocorrenciasDoDia.length ? `${ocorrenciasDoDia.length} ocorrência(s) neste dia` : 'Nenhuma ocorrência planejada para este dia.'}</p>
              </div>
            </div>
            <div className="mt-3 min-h-[22rem] space-y-2 overflow-y-auto pr-1">
              {ocorrenciasDoDia.map(item => cardResumo(item))}
              {!ocorrenciasDoDia.length && <div className="flex h-full min-h-[20rem] items-center justify-center rounded-xl border border-dashed border-current/20 bg-background/45 p-4 text-center text-sm text-foreground/60">
                {calendarioVazio ? 'Ainda não há ocorrências neste período.' : 'Escolha um dia com registros para ver os detalhes.'}
              </div>}
            </div>
          </aside>
        </div>
      </section>;
    })()}


    {semData.length>0&&<section className="space-y-2 rounded-xl border border-current/20 p-3"><h5 className="font-semibold">Sem data</h5>{semData.map(item => cardResumo(item, true))}</section>}
  </div>;
}
