'use client';
import { useMemo, useState } from 'react';
import { useOcorrencias, type Ocorrencia } from '@/hooks/use-ocorrencias';
import { useEntregaveis } from '@/hooks/use-entregaveis';

const diaBR = (dia:string) => dia.split('-').reverse().join('/');
const dataAlvo = (o:Ocorrencia) =>
  ['CONCLUIDO','ENCERRADA'].includes(o.status) && o.dataRealizada
    ? o.dataRealizada : o.periodoInicio || o.dataPrevista || o.periodoFim || o.dataRealizada || '';
const grupos = [
  {chave:'ATIVA',titulo:'Em andamento',cor:'bg-lime-500'},
  {chave:'REVISAO',titulo:'Em revisão',cor:'bg-teal-500'},
  {chave:'PENDENTE',titulo:'Pendente',cor:'bg-amber-400'},
  {chave:'CONCLUIDA',titulo:'Concluída',cor:'bg-violet-500'},
  {chave:'ENCERRADA',titulo:'Encerrada',cor:'bg-purple-500'},
  {chave:'NAO_INICIADA',titulo:'Não iniciada',cor:'bg-green-500'},
] as const;
function grupo(o: Ocorrencia, hoje:string) {
  if (o.status==='CONCLUIDO') return 'CONCLUIDA';
  if (o.status==='ENCERRADA') return 'ENCERRADA';
  if (o.status==='EM_REVISAO') return 'REVISAO';
  if (o.status.startsWith('PENDENTE')) return 'PENDENTE';
  if (o.status==='EM_ANDAMENTO' || o.status==='NAO_INICIADO' && (o.periodoInicio || o.dataPrevista || '')<=hoje) return 'ATIVA';
  return 'NAO_INICIADA';
}
const diasSemana = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
/** Consolidação por contrato: a mesma ocorrência aparece uma única vez, pelo dia de referência. */
export function AgendaContrato({ contratoId, abrirOcorrencia }:{ contratoId:string; abrirOcorrencia:(id:string)=>void }) {
  const agenda=useOcorrencias(contratoId);
  const entregaveis=useEntregaveis(contratoId);
  const [selecionado,setSelecionado]=useState('');
  const [mesEscolhido,setMesEscolhido]=useState('');
  const [filtroResumo,setFiltroResumo]=useState<(typeof grupos)[number]['chave']>('ATIVA');
  const hoje=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const registros=useMemo(()=>agenda.ocorrencias.filter(o=>!o.substituidaEm),[agenda.ocorrencias]);
  const meses=Array.from(new Set([...registros.map(o=>dataAlvo(o).slice(0,7)).filter(Boolean),hoje.slice(0,7)])).sort();
  const mes=meses.includes(mesEscolhido)?mesEscolhido:hoje.slice(0,7);
  const indice=meses.indexOf(mes);
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
  const titulos=new Map((entregaveis.dados??[]).map(e=>[e.id,e.nome]));
  const itensResumo=registros.filter(o=>grupo(o,hoje)===filtroResumo).sort((a,b)=>dataAlvo(a).localeCompare(dataAlvo(b)));
  const filtroAtual=grupos.find(g=>g.chave===filtroResumo) ?? grupos[0];
  return <section className="space-y-4" aria-label="Agenda consolidada do contrato">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-base font-semibold text-current">Acompanhamento das ocorrências</h3>
        <p className="text-xs text-foreground/65">Todos os entregáveis e etapas do contrato, por data de execução.</p></div>
      <span className="text-xs text-foreground/65">{registros.length} ocorrência(s)</span>
    </header>
    {agenda.erro ? <p role="alert" className="text-error-text">{agenda.erro}</p> : agenda.loading ? <p role="status">Carregando agenda...</p> : <>
      <div role="group" aria-label="Filtrar ocorrências por situação" className="flex flex-wrap gap-2">{grupos.map(g=>{const n=registros.filter(o=>grupo(o,hoje)===g.chave).length;
        return <button key={g.chave} type="button" aria-pressed={filtroResumo===g.chave} onClick={()=>setFiltroResumo(g.chave)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-current ${filtroResumo===g.chave?'border-current/60 bg-current/15 text-foreground':'border-current/15 text-foreground/70 hover:bg-current/10'}`}><span className={`h-2 w-2 rounded-full ${g.cor}`}/>{g.titulo}: {n}</button>;})}</div>
      <div className="grid min-w-0 overflow-hidden rounded-xl border border-current/20 lg:grid-cols-[minmax(0,1.75fr)_minmax(16rem,1fr)]">
        <div className="min-w-0 space-y-3 border-b border-current/15 p-3 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-bold capitalize">{inicio.toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'})}</h4>
          <div className="flex gap-1"><button type="button" aria-label="Mês anterior" disabled={indice<=0} onClick={()=>setMesEscolhido(meses[indice-1])} className="rounded-lg border border-current/20 px-2 disabled:opacity-30">‹</button>
          <button type="button" aria-label="Próximo mês" disabled={indice<0||indice>=meses.length-1} onClick={()=>setMesEscolhido(meses[indice+1])} className="rounded-lg border border-current/20 px-2 disabled:opacity-30">›</button></div></div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-foreground/60">{diasSemana.map(d=><span key={d}>{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-1">{Array.from({length:deslocamento},(_,i)=><span aria-hidden="true" key={`v${i}`}/>)}
            {Array.from({length:numeroDias},(_,i)=>{const d=`${mes}-${String(i+1).padStart(2,'0')}`;const registrosDoDia=porDia.get(d)??[];
              return <button type="button" key={d} onClick={()=>setSelecionado(d)} aria-pressed={d===dataSelecionada}
                aria-label={`${diaBR(d)}: ${registrosDoDia.length} ocorrência(s)`}
                className={`min-h-[66px] rounded-lg border p-1.5 text-left transition focus-visible:outline-2 focus-visible:outline-current ${d===dataSelecionada?'border-current/60 bg-current/10':'border-current/15 bg-current/[0.02] hover:bg-current/[0.06]'}`}>
                <time dateTime={d} className="text-xs font-semibold">{i+1}</time>
                <span className="mt-1 flex flex-wrap gap-1">{grupos.map(g=>{const n=registrosDoDia.filter(o=>grupo(o,hoje)===g.chave).length;
                  return n>0?<span key={g.chave} title={`${n} ${g.titulo.toLowerCase()}`} className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${g.cor}`}>{n}</span>:null;})}</span>
              </button>;})}</div>
        </div>
        <aside className="min-w-0 space-y-2 p-3" aria-label={`Ocorrências de ${diaBR(dataSelecionada)}`}>
          <h4 className="text-sm font-semibold">{diaBR(dataSelecionada)} · {listagem.length} ocorrência(s)</h4>
          <div className="max-h-[27rem] space-y-2 overflow-y-auto pr-1">{listagem.length===0?<p className="text-sm text-foreground/65">Sem ocorrências nesta data.</p>:listagem.map(o=>{
            const g=grupos.find(g=>g.chave===grupo(o,hoje))??grupos[0];
            return <button key={o.id} type="button" onClick={()=>abrirOcorrencia(o.id)} className="block w-full min-w-0 rounded-xl border border-current/20 bg-current/[0.035] p-3 text-left hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current">
              <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${g.cor}`}/><strong className="min-w-0 flex-1 truncate text-sm" title={o.titulo}>{o.titulo}</strong></span>
              <span className="mt-1 block truncate text-xs text-foreground/65" title={titulos.get(o.entregavelId)??''}>{titulos.get(o.entregavelId)??'Entregável'}</span>
              <span className="mt-1 block text-xs text-foreground/65">{g.titulo}{g.chave==='ATIVA' && (o.periodoFim||o.dataPrevista||'')<hoje?' · Atrasada':''} · {diaBR(dataAlvo(o))}</span>
            </button>;})}</div>
        </aside>
      </div>
      <div className="space-y-2"><h4 className="text-sm font-semibold">{filtroAtual.titulo} ({itensResumo.length})</h4>
        <div className="flex flex-col gap-2">{itensResumo.length===0?<p className="text-sm text-foreground/65">Nenhuma ocorrência nesta situação.</p>:itensResumo.map(o=><button key={o.id} type="button" onClick={()=>abrirOcorrencia(o.id)} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-current/20 bg-current/[0.025] p-3 text-left transition-colors hover:bg-current/[0.07] focus-visible:outline-2 focus-visible:outline-current">
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm" title={o.titulo}>{o.titulo}</strong><span className="mt-1 block text-xs text-foreground/65">{diaBR(o.periodoInicio||o.dataPrevista||'')}{o.periodoFim&&o.periodoInicio!==o.periodoFim?` até ${diaBR(o.periodoFim)}`:''}</span></span>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-current/25 bg-current/[0.04] px-2 py-1 text-[11px] font-semibold`}><span className={`h-2 w-2 rounded-full ${filtroAtual.cor}`} aria-hidden="true" />{filtroAtual.titulo}</span>
        </button>)}</div>
      </div>
    </>}
  </section>;
}
