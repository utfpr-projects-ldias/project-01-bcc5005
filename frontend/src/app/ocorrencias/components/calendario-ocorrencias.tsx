'use client';
import { MetricasCartaoOcorrencia } from '@/app/contratos/components/agenda-contrato';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';


import { useMemo, useState } from 'react';
import type { Ocorrencia } from '@/hooks/use-ocorrencias';
import { estadoTemporal } from '@/lib/estado-temporal';

const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const cores: Record<string, string> = {
  NAO_INICIADO: 'border-neutral-400/50 bg-neutral-400/10 text-neutral-700 dark:text-neutral-200',
  EM_ANDAMENTO: 'border-brand-green/55 bg-brand-green/10 text-brand-neon',
  EM_REVISAO: 'border-teal-500/60 bg-teal-500/15 text-teal-800 dark:text-teal-200',
  PENDENTE_CONCLUSAO_PARCIAL: 'border-amber-500/65 bg-amber-500/15 text-amber-700 dark:text-amber-200',
  CONCLUIDO_PARCIALMENTE: 'border-violet-500/60 bg-violet-500/15 text-violet-700 dark:text-violet-200',
  PENDENTE_CONCLUSAO: 'border-amber-500/65 bg-amber-500/15 text-amber-700 dark:text-amber-200',
  PENDENTE_ENCERRAMENTO: 'border-purple-500/60 bg-purple-500/15 text-purple-700 dark:text-purple-200',
  CONCLUIDO: 'border-violet-500/60 bg-violet-500/15 text-violet-700 dark:text-violet-200',
  ENCERRADA: 'border-purple-500/70 bg-purple-500/20 text-purple-700 dark:text-purple-200',
};
const nomes: Record<string,string> = {
  NAO_INICIADO:'Não iniciada',EM_ANDAMENTO:'Em andamento',EM_REVISAO:'Em revisão',
  PENDENTE_CONCLUSAO:'Pendente de conclusão',PENDENTE_ENCERRAMENTO:'Pendente de encerramento',
  CONCLUIDO:'Concluída',CONCLUIDO_PARCIALMENTE:'Concluída parcialmente',PENDENTE_CONCLUSAO_PARCIAL:'Pendente de conclusão parcial',ENCERRADA:'Encerrada',
};
const dots: Record<string, string> = {
  NAO_INICIADO: 'bg-neutral-400',
  EM_ANDAMENTO: 'bg-green-500',
  EM_REVISAO: 'bg-teal-400',
  PENDENTE_CONCLUSAO: 'bg-amber-400',
  PENDENTE_ENCERRAMENTO: 'bg-purple-400',
  CONCLUIDO: 'bg-violet-400',
  CONCLUIDO_PARCIALMENTE: 'bg-violet-400',
  PENDENTE_CONCLUSAO_PARCIAL: 'bg-amber-400',
  ENCERRADA: 'bg-purple-500',
};
const iso = (v:string|null|undefined):v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
const hoje = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const formatar = (v:string) => v.split('-').reverse().join('/');
const mes = (v:string) => new Date(`${v.slice(0,7)}-01T12:00:00Z`).toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
const periodo = (o:Ocorrencia) => ({inicio:o.periodoInicio||o.dataPrevista||o.periodoFim||'',fim:o.periodoFim||o.dataPrevista||o.periodoInicio||''});
const chave = (o:Ocorrencia) => periodo(o).inicio;
const ordemStatus = ['EM_ANDAMENTO','EM_REVISAO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO','NAO_INICIADO','CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADA','ARQUIVADA'];

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
export function CalendarioOcorrencias({registros,registrosVisiveis=registros,aoAbrir,periodicidade='DIARIA',resumoCompleto=false}:{
  registros:Ocorrencia[];registrosVisiveis?:Ocorrencia[];aoAbrir:(item:Ocorrencia,gatilho:HTMLElement)=>void;periodicidade?:string;resumoCompleto?:boolean;
}) {
  const hojeIso=hoje();
  const [mesSelecionado, setMesSelecionado] = useState('');
  const [diaSelecionado, setDiaSelecionado] = useState('');
  const ativos=registros.filter(o=>!o.substituidaEm);
  const visiveis = useMemo(()=>new Set(registrosVisiveis.map(o=>o.id)),[registrosVisiveis]);
  const todosConcluidos=resumoCompleto&&ativos.length>0&&ativos.every(o=>['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status));
  const existeEncerrada=ativos.some(o=>o.status==='ENCERRADA');
  // A superfície do calendário pertence ao ENTREGÁVEL. Nenhuma ocorrência
  // pode mudar borda/fundo do calendário inteiro; apenas seus próprios cards.
  const corTotal='pi-agenda-superficie';
  const {datados,semData}=useMemo(()=>({datados:registros.filter(o=>iso(chave(o))),semData:registros.filter(o=>!iso(chave(o)))}),[registros]);
  // Interseção com o mês selecionado, sem materializar todos os meses ou duplicar registros.
  const primeiroMes=datados.map(o=>periodo(o).inicio.slice(0,7)).sort()[0];
  const ultimoMes=datados.map(o=>periodo(o).fim.slice(0,7)).sort().at(-1);
  const tituloGrupo=(k:string)=>{
    return mes(`${k}-01`);
  };
  const mesHoje=hojeIso.slice(0,7);
  const chaveAtiva = mesSelecionado || (primeiroMes && ultimoMes && mesHoje>=primeiroMes && mesHoje<=ultimoMes ? mesHoje : primeiroMes ?? mesHoje);
  const moverMes = (deslocamento:number) => {
    const data=new Date(`${chaveAtiva}-01T00:00:00Z`);
    data.setUTCMonth(data.getUTCMonth()+deslocamento);
    const mesNovo=data.toISOString().split('T')[0].slice(0,7);
    if (!/^\d{4}-\d{2}$/.test(mesNovo) || mesNovo.startsWith('0000-')) return;
    setMesSelecionado(mesNovo); setDiaSelecionado('');
  };
  const limiteMes = new Date(`${chaveAtiva}-01T00:00:00Z`);
  limiteMes.setUTCMonth(limiteMes.getUTCMonth()+1); limiteMes.setUTCDate(0);
  const ultimoDia=limiteMes.toISOString().slice(0,10);
  const itensAtivos = useMemo(() => datados.filter(o=>periodo(o).inicio<=ultimoDia && periodo(o).fim>=`${chaveAtiva}-01`).sort((a,b)=>chave(a).localeCompare(chave(b)) || a.titulo.localeCompare(b.titulo)), [datados,chaveAtiva,ultimoDia]);
  const itensPorDia = useMemo(() => {
    const mapa = new Map<string, Ocorrencia[]>();
    for (let i=1;i<=Number(ultimoDia.slice(8));i++) {
      const dia=`${chaveAtiva}-${String(i).padStart(2,'0')}`;
      const lista=itensAtivos.filter(o=>periodo(o).inicio<=dia && periodo(o).fim>=dia);
      if(lista.length) mapa.set(dia,lista.sort((a,b)=>ordemStatus.indexOf(statusVisual(a,hojeIso))-ordemStatus.indexOf(statusVisual(b,hojeIso))||a.titulo.localeCompare(b.titulo)));
    }
    return mapa;
  }, [itensAtivos, hojeIso, chaveAtiva, ultimoDia]);

  // Seleção efetiva derivada do mês e dos períodos: nenhuma microtask
  // altera estado após o render, evitando seleção obsoleta na troca de mês.
  const diaEfetivo = useMemo(() => {
    if (!chaveAtiva) return '';
    const opcoes = Array.from(itensPorDia.keys()).filter(v => v.startsWith(`${chaveAtiva}-`)).sort();
    if (diaSelecionado.startsWith(`${chaveAtiva}-`))
      return diaSelecionado;
    const alvoHoje = hojeIso.startsWith(chaveAtiva) ? hojeIso : '';
    return alvoHoje && (itensPorDia.has(alvoHoje) || !opcoes.length) ? alvoHoje : (opcoes[0] ?? `${chaveAtiva}-01`);
  }, [chaveAtiva, diaSelecionado, itensPorDia, hojeIso]);

  const calendarioVazio = Boolean(chaveAtiva) && !Array.from(itensPorDia.keys()).some(v => v.startsWith(`${chaveAtiva}-`));
  const ocorrenciasDoDia = (itensPorDia.get(diaEfetivo) ?? []).filter(o=>visiveis.has(o.id));
  const outrosRegistros = itensAtivos.filter(o=>visiveis.has(o.id) && !ocorrenciasDoDia.some(d=>d.id===o.id));

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
        </span><EtiquetaAtraso atrasado={o.atrasado} finalizadoComAtraso={o.finalizadoComAtraso} feminino/>
      </div>
      <MetricasCartaoOcorrencia ocorrencia={o}/>
      {o.observacoes && !compacto && <p className="mt-2 line-clamp-2 text-xs opacity-80">{o.observacoes}</p>}
    </button>;
  };

  return <div data-pi-calendario-ocorrencias data-periodicidade={periodicidade} aria-label={`Calendário ${periodicidade === 'DIARIA' ? 'diário' : periodicidade.toLowerCase()} de ocorrências`} className="min-w-0 space-y-3">
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
      const inicio=new Date(`${chaveAtiva}-01T00:00:00Z`);
      const qtdDias=Number(ultimoDia.slice(8));
      const deslocamento=(inicio.getUTCDay()+6)%7;
      return <section className={`min-w-0 overflow-hidden rounded-xl border ${corTotal}`}>
        <div className="grid min-h-[30rem] min-w-0 gap-0 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.95fr)]">
          <div className="min-w-0 border-b border-current/10 p-3 lg:border-b-0 lg:border-r">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h5 className="text-sm font-semibold">Ocorrências por dia</h5>
              <span className="text-xs text-foreground/60">{itensAtivos.filter(o=>visiveis.has(o.id)).length} visíveis de {itensAtivos.length}</span>
            </div>
            <div className="w-full overflow-x-auto" tabIndex={0} aria-label={`Dias de ${tituloGrupo(chaveAtiva)}`}>
              <div className="min-w-[560px]">
                <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden="true">{dias.map(d=><span key={d} className="py-2 text-center text-[11px] font-semibold text-foreground/65">{d}</span>)}</div>
                <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Períodos de ${tituloGrupo(chaveAtiva)}`}>
                  {Array.from({length:deslocamento},(_,i)=><div key={`offset${i}`} aria-hidden="true" className="min-h-[60px] rounded-xl border border-transparent" />)}
                  {Array.from({length:qtdDias},(_,i)=>{
                    const data=`${chaveAtiva}-${String(i+1).padStart(2,'0')}`;
                    const itensDoDia=itensPorDia.get(data) ?? [];
                    const atual=hojeIso===data;
                    const selecionado=diaEfetivo===data;
                    const passado=data<hojeIso;
                    const resumo = ordemStatus.map(status=>({status,qtd:itensDoDia.filter(o=>statusVisual(o,hojeIso)===status).length})).filter(item=>item.qtd>0);
                    return <button type="button" key={data} data-pi-dia-calendario data-hoje={atual} data-passado={passado} data-selecionado={selecionado} data-dia-atual={atual||undefined} data-pi-dia-selecionado={selecionado || undefined} aria-pressed={selecionado}
                      onClick={() => setDiaSelecionado(data)}
                      className={`min-h-[60px] rounded-xl border p-2 text-left transition focus-visible:outline-2 focus-visible:outline-current ${selecionado ? 'pi-agenda-dia-selecionado' : atual ? 'pi-agenda-dia-atual' : 'border-current/15 bg-current/[0.03]'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <time dateTime={data} className="text-sm font-semibold tabular-nums">{i+1}</time>

                      </div>
                      {itensDoDia.length > 0 ? <>
                        <div className="mt-2 flex flex-wrap gap-1" aria-label={`${itensDoDia.length} ocorrências neste dia`} title={`${itensDoDia.filter(o=>visiveis.has(o.id)).length} visíveis de ${itensDoDia.length} no dia (marcadores da agenda integral)`}>{resumo.map(item => <span key={item.status} title={`${item.qtd} ${nomeStatus(item.status).toLowerCase()}`} className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${corPonto(item.status)}`}>{item.qtd}</span>)}</div>
                      </> : null}
                    </button>;
                  })}
                </div>
              </div>
            </div>
          </div>
          <aside className="pi-agenda-painel-dia min-w-0 p-3">
            <div className="flex items-center justify-between gap-2 border-b border-current/10 pb-2">
              <div>
                <h5 className="text-sm font-semibold">{diaEfetivo ? formatar(diaEfetivo) : 'Selecione um dia'}</h5>
                <p className="text-xs text-foreground/60">{ocorrenciasDoDia.length ? `${ocorrenciasDoDia.length} ocorrência(s) neste dia` : 'Nenhuma ocorrência corresponde aos filtros neste dia.'}</p>
              </div>
            </div>
            <div className="mt-3 min-h-[22rem] space-y-2 overflow-y-auto pr-1">
              {ocorrenciasDoDia.map(item => cardResumo(item))}
              {!ocorrenciasDoDia.length && <div className="flex h-full min-h-[20rem] items-center justify-center rounded-xl border border-dashed border-current/20 bg-background/45 p-4 text-center text-sm text-foreground/60">
                {calendarioVazio ? 'Ainda não há ocorrências neste período.' : 'Nenhum registro neste dia para o filtro selecionado.'}
              </div>}
            </div>
          </aside>
        </div>
      </section>;
    })()}


    {outrosRegistros.length>0&&<section className="space-y-2 rounded-xl border p-3 pi-agenda-superficie"><h5 className="text-sm font-semibold">Outros registros do período ({outrosRegistros.length})</h5>{outrosRegistros.map(item=>cardResumo(item,true))}</section>}
    {semData.some(o=>visiveis.has(o.id))&&<section className="space-y-2 rounded-xl border border-current/20 p-3"><h5 className="font-semibold">Sem data</h5>{semData.filter(o=>visiveis.has(o.id)).map(item => cardResumo(item, true))}</section>}
  </div>;
}
