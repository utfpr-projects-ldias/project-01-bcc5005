'use client';
import {useEstadoCalendario,type EstadoCalendario} from './estado-calendario';
import { SeletorOrdenacao } from './seletor-ordenacao-contratos';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';

import { useMemo, useState } from 'react';
import { useOcorrencias, type Ocorrencia } from '@/hooks/use-ocorrencias';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { compararAgenda, contadoresOcorrencia, comprovacaoOcorrencia, dataOrdemAgenda, type CampoOrdemAgenda } from '@/lib/resumo-agenda-contrato';

const diaBR = (dia:string) => dia.split('-').reverse().join('/');
export const dataAlvo = (o:Ocorrencia) =>
  ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADA'].includes(o.status) && o.dataRealizada
    ? o.dataRealizada : o.periodoInicio || o.dataPrevista || o.periodoFim || o.dataRealizada || '';
const grupos = [
  {chave:'ATIVA',titulo:'Em andamento',cor:'bg-lime-500'},
  {chave:'REVISAO',titulo:'Em revisão',cor:'bg-teal-500'},
  {chave:'PENDENTE',titulo:'Pendente',cor:'bg-amber-400'},
  {chave:'CONCLUIDA',titulo:'Concluída',cor:'bg-violet-500'},
  {chave:'ENCERRADA',titulo:'Encerrada',cor:'bg-purple-500'},
  {chave:'NAO_INICIADA',titulo:'Não iniciada',cor:'bg-neutral-500'},
  {chave:'ATRASADA',titulo:'Atrasada',cor:'bg-red-400'},
] as const;
function grupo(o: Ocorrencia) {
  if (['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status)) return 'CONCLUIDA';
  if (o.status==='ENCERRADA') return 'ENCERRADA';
  if (o.status==='EM_REVISAO') return 'REVISAO';
  if (o.status.startsWith('PENDENTE')) return 'PENDENTE';
  if (o.status==='EM_ANDAMENTO') return 'ATIVA';
  return 'NAO_INICIADA';
}
function corresponde(o:Ocorrencia, chave:string) { return chave==='TODAS'||(chave==='ATRASADA'?Boolean(o.atrasado):grupo(o)===chave); }
export function apresentacaoOcorrencia(o: Ocorrencia) {
  const g = grupos.find(item => item.chave === grupo(o)) ?? grupos[5];
  switch (o.status) {
    case 'CONCLUIDO_PARCIALMENTE': return {titulo:'Concluída parcialmente',cor:'bg-amber-500'};
    case 'PENDENTE_CONCLUSAO_PARCIAL': return {titulo:'Pendente de conclusão parcial',cor:g.cor};
    case 'PENDENTE_CONCLUSAO': return {titulo:'Pendente de conclusão',cor:g.cor};
    case 'PENDENTE_ENCERRAMENTO': return {titulo:'Pendente de encerramento',cor:g.cor};
    default: return g;
  }
}
const diasSemana = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
/** Consolidação por contrato: a mesma ocorrência aparece uma única vez, pelo dia de referência. */
export function AgendaContrato({ contratoId, abrirOcorrencia, entregavelId, compacto=false,calendario,somenteLista=false }:{ contratoId:string; abrirOcorrencia:(id:string)=>void; entregavelId?:string; compacto?:boolean; calendario?:EstadoCalendario; somenteLista?:boolean }) {
  const agenda=useOcorrencias(contratoId);
  const entregaveis=useEntregaveis(contratoId);
  const local=useEstadoCalendario();
  const {dia:selecionado,setDia:setSelecionado,mes:mesEscolhido,setMes:setMesEscolhido}=calendario??local;
  const [pagina,setPagina]=useState(1);
  const [campoOrdem,setCampoOrdem]=useState<CampoOrdemAgenda>('inicio');
  const [desc,setDesc]=useState(true);
  const [filtroResumo,setFiltroResumo]=useState<(typeof grupos)[number]['chave'] | 'TODAS'>('TODAS');
  const hoje=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const registros=useMemo(()=>agenda.ocorrencias.filter(o=>!o.substituidaEm&&(!entregavelId||o.entregavelId===entregavelId)),[agenda.ocorrencias,entregavelId]);
  const mes=mesEscolhido||hoje.slice(0,7);
  const mudarMes=(delta:number)=>{const d=new Date(`${mes}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+delta);setMesEscolhido(d.toISOString().slice(0,7));setSelecionado(d.toISOString().slice(0,10));};
  const inicio=new Date(`${mes}-01T12:00:00Z`);
  const numeroDias=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).getUTCDate();
  const deslocamento=(inicio.getUTCDay()+6)%7;
  const porDia=new Map<string, Ocorrencia[]>();
  for (const o of registros) {
    const data=dataAlvo(o); if (!data) continue;
    const lista=porDia.get(data)??[];lista.push(o);porDia.set(data,lista);
  }
  const dataSelecionada=selecionado.startsWith(mes)?selecionado:(hoje.startsWith(mes)?hoje:`${mes}-01`);
  const listagem=porDia.get(dataSelecionada)??[];
  const porEntregavel=new Map((entregaveis.dados??[]).map(e=>[e.id,e]));
  const itensResumo=registros.filter(o=>corresponde(o,filtroResumo)).sort((a,b)=>compararAgenda(a,b,porEntregavel,campoOrdem,desc));
  const paginas=Math.max(1,Math.ceil(itensResumo.length/10)), paginaAtual=Math.min(pagina,paginas);
  return <section data-pi-agenda-desktop className={compacto?"pi-calendario-compacto space-y-3":"space-y-3"} aria-label={compacto?"Calendário de ocorrências do entregável":"Agenda consolidada do contrato"}>
    <>
      {!somenteLista&&<div className="pi-agenda-grade min-w-0">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-bold capitalize">{inicio.toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'})}</h4>
          <div className="flex items-center gap-1"><button type="button" className="rounded-md px-2 py-1 text-xs hover:bg-current/10" onClick={()=>{setMesEscolhido(hoje.slice(0,7));setSelecionado(hoje);}}>Hoje</button><button type="button" aria-label="Mês anterior" onClick={()=>mudarMes(-1)} className="pi-agenda-mes" title="Mês anterior">‹</button>
          <button type="button" aria-label="Próximo mês" onClick={()=>mudarMes(1)} className="pi-agenda-mes" title="Próximo mês">›</button></div></div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-foreground/60">{diasSemana.map(d=><span key={d}>{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">{Array.from({length:deslocamento},(_,i)=><span aria-hidden="true" key={`v${i}`}/>)}
            {Array.from({length:numeroDias},(_,i)=>{const d=`${mes}-${String(i+1).padStart(2,'0')}`;const registrosDoDia=porDia.get(d)??[];
              return <button type="button" key={d} onClick={()=>setSelecionado(d)} aria-pressed={d===dataSelecionada} aria-current={d===hoje ? "date" : undefined}
                aria-label={`${diaBR(d)}: ${registrosDoDia.length} ocorrência(s)${registrosDoDia.length?`, ${registrosDoDia.map(o=>`${o.titulo}: ${o.atrasado?'Atrasada':apresentacaoOcorrencia(o).titulo}`).join('; ')}`:''}`}
                data-pi-dia-calendario data-hoje={d===hoje} data-passado={d<hoje} data-selecionado={d===dataSelecionada} className="pi-agenda-dia rounded-md border text-left transition focus-visible:outline-2 focus-visible:outline-current">
                <time dateTime={d} className="text-xs font-semibold">{i+1}</time>
                <span className="pi-agenda-marcadores" aria-hidden="true">{registrosDoDia.slice(0,3).map(o=><span key={o.id} className={`pi-agenda-marcador ${o.atrasado?'bg-red-400':apresentacaoOcorrencia(o).cor}`} title={`${o.titulo} · ${o.atrasado?'Atrasada':apresentacaoOcorrencia(o).titulo}`}/>)}{registrosDoDia.length>3&&<span className="text-[10px] text-foreground/65">+{registrosDoDia.length-3}</span>}</span>
              </button>;})}</div>
        </div>
        <aside className="min-w-0 space-y-2" aria-label={`Ocorrências de ${diaBR(dataSelecionada)}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{diaBR(dataSelecionada)}</h4><span className="text-xs text-foreground/60">{listagem.length} {listagem.length===1?"ocorrência":"ocorrências"}</span></div>
          <div className="max-h-[27rem] space-y-2 overflow-y-auto pr-1">{agenda.erro?<p role="alert">{agenda.erro}</p>:agenda.loading&&registros.length===0?<p role="status">Carregando agenda...</p>:listagem.length===0?<p className="text-sm text-foreground/65">Nenhuma ocorrência nesta data.</p>:listagem.map(o=>{
            const g=apresentacaoOcorrencia(o);
            const e=porEntregavel.get(o.entregavelId);
            const contexto=e?.nome??'Entregável';
            return <button key={o.id} type="button" onClick={evento=>{ evento.preventDefault(); evento.stopPropagation(); abrirOcorrencia(o.id); }} className="pi-agenda-ocorrencia block w-full min-w-0 text-left focus-visible:outline-2 focus-visible:outline-current" data-situacao={grupo(o)} data-atrasado={Boolean(o.atrasado)}>
              <span className="block truncate text-sm font-semibold" title={o.titulo}>{o.titulo}</span>
              <span className="pi-agenda-nome-entregavel mt-0.5 block truncate text-xs text-foreground/65" title={contexto}>{contexto}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1 text-xs"><span className="pi-agenda-status">{g.titulo}</span></span><MetricasCartaoOcorrencia ocorrencia={o}/>
              {o.periodoInicio&&o.periodoFim&&o.periodoInicio!==o.periodoFim&&<span className="mt-0.5 block text-xs text-foreground/55">{diaBR(o.periodoInicio)} – {diaBR(o.periodoFim)}</span>}
              <EtiquetaAtraso atrasado={o.atrasado} finalizadoComAtraso={o.finalizadoComAtraso} feminino/>
            </button>;})}</div>
        </aside>
      </div>}
      <div hidden={compacto} id={compacto?undefined:"resumo-ocorrencias-contrato"} className="space-y-3 border-t border-slate-500/20 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs"><div className="pi-filtros-ocorrencias" role="group" aria-label="Filtrar ocorrências por situação">{grupos.map(g=><button key={g.chave} type="button" aria-pressed={filtroResumo===g.chave} onClick={()=>{setPagina(1);setFiltroResumo(v=>v===g.chave?'TODAS':g.chave);}}><i className={`h-2.5 w-2.5 rounded-full ${g.cor}`} aria-hidden="true"/>{g.titulo}: {registros.filter(o=>corresponde(o,g.chave)).length}</button>)}</div></div>
          <span className="text-xs text-foreground/65">{itensResumo.length} registro(s)</span>
        </div>
        <div className="pi-ordem-ocorrencias-v18"><div className="flex items-center gap-2"><SeletorOrdenacao<CampoOrdemAgenda> valor={campoOrdem} onChange={v=>{setPagina(1);setCampoOrdem(v);}} rotulo="Ordenar ocorrências" rotuloLista="Campo de ordenação" opcoes={[{valor:'inicio',texto:'Data de início'},{valor:'termino',texto:'Data de término'},{valor:'realizado',texto:'Data realizada'},{valor:'avanco',texto:'Avanço'},{valor:'comprovantes',texto:'Comprovantes'}]}/><button type="button" onClick={()=>{setPagina(1);setDesc(v=>!v);}} aria-label={desc?'Ordem decrescente; inverter ordem':'Ordem crescente; inverter ordem'} title={desc?'Ordem decrescente':'Ordem crescente'} className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={desc?'M12 4v16m-5-5 5 5 5-5':'M12 20V4m-5 5 5-5 5 5'}/></svg></button></div></div>
        <div className="pi-lista-ocorrencias-v18 flex flex-col gap-2">{agenda.erro?<p role="alert">{agenda.erro}</p>:agenda.loading&&registros.length===0?<p role="status">Carregando ocorrências…</p>:itensResumo.length===0?<p className="text-sm text-foreground/65">Nenhuma ocorrência encontrada.</p>:itensResumo.slice((paginaAtual-1)*10,paginaAtual*10).map(o=>{
          const e=porEntregavel.get(o.entregavelId);
          const inicio=dataOrdemAgenda(o,e,'inicio'), fim=dataOrdemAgenda(o,e,'termino');
          return <button key={o.id} type="button" onClick={evento=>{evento.preventDefault();evento.stopPropagation();abrirOcorrencia(o.id);}} className="pi-card-ocorrencia-v18 flex w-full min-w-0 flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-current/20 bg-current/[0.035] px-3 py-2.5 text-left hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current">
            <span className="min-w-0 flex-1 basis-[12rem]"><span className="flex flex-wrap items-center gap-2"><strong className="min-w-0 truncate text-sm" title={o.titulo}>{o.titulo}</strong><span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-current/10 px-2 py-1 text-[11px] font-semibold"><span className={`h-2 w-2 rounded-full ${apresentacaoOcorrencia(o).cor}`} aria-hidden="true"/>{apresentacaoOcorrencia(o).titulo}</span><EtiquetaAtraso atrasado={o.atrasado} finalizadoComAtraso={o.finalizadoComAtraso} feminino/></span><span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-foreground/65"><span>{inicio?diaBR(inicio):'Data não informada'}{fim&&fim!==inicio?` até ${diaBR(fim)}`:''}</span><span className="pi-agenda-nome-entregavel truncate" title={e?.nome}>{e?.nome}</span><PesoOcorrencia ocorrencia={o}/></span></span>
            <MetricasCartaoOcorrencia ocorrencia={o}/>
          </button>;
        })}</div>
        <div className="pi-rodape-lista justify-end">{paginas>1&&<nav className="pi-paginacao-registros" aria-label="Paginação das ocorrências"><button type="button" disabled={paginaAtual<=1} onClick={()=>setPagina(paginaAtual-1)}>Anterior</button><span>Página {paginaAtual} de {paginas}</span><button type="button" disabled={paginaAtual>=paginas} onClick={()=>setPagina(paginaAtual+1)}>Próxima</button></nav>}</div>
      </div>
    </>
  </section>;
}

export function PesoOcorrencia({ocorrencia:o}:{ocorrencia:Ocorrencia}) {
  if(o.origem!=='RECORRENTE') return null;
  return <span className="pi-peso-periodo-v18" title="Peso configurado do período no entregável">Peso: <strong>{o.pesoPeriodo==null?'—':`${Number(o.pesoPeriodo).toLocaleString('pt-BR',{maximumFractionDigits:2})}%`}</strong></span>;
}

function AnelRequisito({nome,total,feitas,cor}:{nome:string;total:number;feitas?:number;cor:string}) {
  const rotulo=total===0||feitas===undefined?'—':`${feitas}/${total}`;
  const taxa=total>0&&feitas!==undefined?Math.max(0,Math.min(100,feitas/total*100)):0;
  return <span className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1"><strong className="text-[10px] leading-tight">{nome}</strong><span role="img" aria-label={`${nome}: ${total===0?'sem exigência':feitas===undefined?'indisponível':rotulo}`} className="relative block h-10 w-10"><svg aria-hidden="true" viewBox="0 0 48 48" className="absolute inset-0 h-full w-full"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="4"/>{taxa>0&&<circle cx="24" cy="24" r="20" fill="none" stroke={cor} strokeWidth="4" pathLength="100" strokeDasharray={`${taxa} 100`} transform="rotate(-90 24 24)"/>}</svg><span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums">{rotulo}</span></span></span>;
}

export function MetricasCartaoOcorrencia({ocorrencia:o}:{ocorrencia:Ocorrencia}) {
 const cont=contadoresOcorrencia(o), p=o.progressoPercentual, comp=comprovacaoOcorrencia(o);
 return <span className="pi-ocorrencia-card-metricas pi-metricas-card-v16"><span className="pi-metrica-card"><strong>Avanço</strong><span className="pi-anel-avanco-card" role="img" aria-label={`Avanço: ${p==null?'indisponível':p+'%'}`}><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="4"/>{p!=null&&p>0&&<circle cx="24" cy="24" r="20" fill="none" stroke="#69c994" strokeWidth="4" pathLength="100" strokeDasharray={`${Math.max(0,Math.min(100,p))} 100`} transform="rotate(-90 24 24)"/>}</svg><b>{p==null?'—':`${p.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}</b></span></span><AnelRequisito nome="Atividades" {...cont.atividades} cor="#69c9cd"/><AnelRequisito nome="Evidências" {...cont.evidencias} cor="#a78bfa"/><span className="pi-metrica-card"><strong>Comprovação</strong><b className={`pi-comprovacao-card ${comp.cor}`}>{comp.texto}</b></span></span>;
}
