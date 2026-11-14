'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { PermissoesContrato } from '@/lib/contratos';
import { candidatosMetaMarco, criarMetaMarco, decidirVinculoMeta, editarMetaMarco, listarMetasMarco, vincularMetaMarco,
  type DadosMetaMarco, type MetaMarco, type ResumoMetasMarco, type TipoMetaMarco } from '@/lib/metas-marco';

const INPUT = 'mt-1 w-full min-w-0 rounded-lg border border-current/25 bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35';
const TIPOS: {id:TipoMetaMarco;rotulo:string}[] = [
  {id:'OCORRENCIA',rotulo:'Ocorrências'}, {id:'ATIVIDADE',rotulo:'Atividades'}, {id:'EVIDENCIA',rotulo:'Evidências'},
];
const vazio:DadosMetaMarco={titulo:'',tipo:'OCORRENCIA',quantidadeExigida:1,dataPrevista:null,inicioPrevisto:null,terminoPrevisto:null,observacoes:null};
const percent = (valor:number) => Math.max(0,Math.min(100,valor));
function Progresso({valor, nome}:{valor:number;nome:string}) {return <div role="progressbar" aria-label={nome} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(valor)} className="h-2 overflow-hidden rounded-full bg-foreground/10"><span className="block h-full rounded-full bg-violet-500" style={{width:`${percent(valor)}%`}}/></div>;}
export function PainelMetasMarco({contratoId,entregavelId,permissoes,readOnly=false,onAtualizar}: {
  contratoId:string;entregavelId:string;permissoes?:PermissoesContrato;readOnly?:boolean;onAtualizar?:()=>void;
}) {
  const [resumo,setResumo]=useState<ResumoMetasMarco|null>(null);
  const [carregando,setCarregando]=useState(true);
  const [ocupado,setOcupado]=useState(false);
  const [erro,setErro]=useState('');
  const [tipo,setTipo]=useState<TipoMetaMarco>('OCORRENCIA');
  const [form,setForm]=useState<DadosMetaMarco|null>(null);
  const [editarId,setEditarId]=useState<string|null>(null);
  const [expandida,setExpandida]=useState<string|null>(null);
  const [candidatos,setCandidatos]=useState<{id:string;titulo:string}[]>([]);
  const [registro,setRegistro]=useState('');
  const [justificativa,setJustificativa]=useState('');
  const atualizar=useCallback(async()=>{const r=await listarMetasMarco(contratoId,entregavelId);setResumo(r);},[contratoId,entregavelId]);
  useEffect(()=>{let ativo=true;listarMetasMarco(contratoId,entregavelId).then(r=>{if(ativo){setResumo(r);setErro('');}}).catch(e=>{if(ativo)setErro(e instanceof Error?e.message:'Não foi possível consultar metas.');}).finally(()=>{if(ativo)setCarregando(false);});return()=>{ativo=false;};},[contratoId,entregavelId]);
  const permitido=(chave: keyof PermissoesContrato)=>!readOnly&&Boolean(permissoes?.[chave]);
  async function executar(fn:()=>Promise<unknown>) {if(ocupado)return;setOcupado(true);setErro('');try{await fn();await atualizar();onAtualizar?.();}catch(e){setErro(e instanceof Error?e.message:'Operação não realizada.');}finally{setOcupado(false);}}
  async function enviar(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!form)return;
    if(!form.titulo.trim()||form.quantidadeExigida<1||form.quantidadeExigida>100){setErro('Informe título e quantidade de 1 a 100.');return;}
    const dados = {...form,titulo:form.titulo.trim(),dataPrevista:form.dataPrevista||null,inicioPrevisto:form.inicioPrevisto||null,terminoPrevisto:form.terminoPrevisto||null};
    await executar(async()=>{if(editarId){const {tipo: _tipo, ...alteracoes}=dados;void _tipo;await editarMetaMarco(contratoId,entregavelId,editarId,alteracoes);}else await criarMetaMarco(contratoId,entregavelId,dados);setForm(null);setEditarId(null);});
  }
  async function abrirMeta(meta:MetaMarco){if(expandida===meta.id){setExpandida(null);return;}setExpandida(meta.id);setRegistro('');setCandidatos([]);setErro('');try{setCandidatos(await candidatosMetaMarco(contratoId,entregavelId,meta.id));}catch(e){setErro(e instanceof Error?e.message:'Não foi possível consultar registros.');}}
  if(carregando)return <p role="status" className="p-4 text-sm">Carregando metas do Marco...</p>;
  return <section className="min-w-0 space-y-4 rounded-xl border border-current/20 p-4" aria-label="Metas preparatórias do Marco">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Metas do Marco</h3><p className="text-xs text-foreground/60">Preparação operacional, independente da conclusão física 0% ou 100%.</p></div>
      {permitido('criarMetasMarco')&&<button type="button" disabled={ocupado} onClick={()=>{setForm({...vazio,tipo});setEditarId(null);}} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Nova meta</button>}
    </header>
    {erro&&<p role="alert" className="rounded-lg border border-red-500/35 p-2 text-sm text-red-400">{erro}</p>}
    <div className="space-y-2 rounded-lg border border-violet-500/20 p-3">
      <div className="flex justify-between text-sm"><strong>Preparação das metas</strong><span>{resumo?.concluidas??0}/{resumo?.total??0} atendidas · {resumo?.percentualPreparacao??0}%</span></div>
      <Progresso nome="Progresso de preparação do Marco" valor={resumo?.percentualPreparacao??0}/>
    </div>
    <div role="tablist" aria-label="Categorias das metas" className="flex flex-wrap gap-1">{TIPOS.map(t=><button type="button" role="tab" aria-selected={tipo===t.id} key={t.id} onClick={()=>{setTipo(t.id);setForm(null);setExpandida(null);}}
      className={`rounded-lg border px-3 py-2 text-xs font-semibold ${tipo===t.id?'border-violet-500/55 bg-violet-500/15':'border-current/15'}`}>{t.rotulo} ({(resumo?.metas??[]).filter(x=>x.tipo===t.id).length})</button>)}</div>
    {form&&<form className="space-y-3 rounded-xl border border-violet-500/35 p-3" onSubmit={e=>void enviar(e)}>
      <strong className="text-sm">{editarId?'Editar meta':'Nova meta'} · {TIPOS.find(t=>t.id===form.tipo)?.rotulo}</strong>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs sm:col-span-2">Título<input autoFocus required maxLength={60} className={INPUT} value={form.titulo} onChange={e=>setForm(f=>f?{...f,titulo:e.target.value}:f)}/></label>
        <label className="text-xs">Quantidade de registros exigida<input required type="number" min={1} max={100} step={1} className={INPUT} value={form.quantidadeExigida} onChange={e=>setForm(f=>f?{...f,quantidadeExigida:Number(e.target.value)}:f)}/></label>
        <label className="text-xs">Data prevista (opcional)<input type="date" className={INPUT} value={form.dataPrevista??''} onChange={e=>setForm(f=>f?{...f,dataPrevista:e.target.value||null,inicioPrevisto:null,terminoPrevisto:null}:f)}/></label>
        <label className="text-xs">Início previsto (alternativo)<input type="date" className={INPUT} disabled={!!form.dataPrevista} value={form.inicioPrevisto??''} onChange={e=>setForm(f=>f?{...f,inicioPrevisto:e.target.value||null}:f)}/></label>
        <label className="text-xs">Término previsto (alternativo)<input type="date" className={INPUT} disabled={!!form.dataPrevista} value={form.terminoPrevisto??''} onChange={e=>setForm(f=>f?{...f,terminoPrevisto:e.target.value||null}:f)}/></label>
      </div>
      <div className="flex justify-end gap-2"><button type="button" onClick={()=>setForm(null)} className="rounded-lg border border-current/25 px-3 py-2 text-xs">Cancelar</button><button disabled={ocupado} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Salvar meta</button></div>
    </form>}
    {(resumo?.metas??[]).filter(m=>m.tipo===tipo).length===0&&<p className="rounded-lg border border-dashed border-current/20 p-4 text-sm text-foreground/65">Nenhuma meta cadastrada nesta categoria.</p>}
    {(resumo?.metas??[]).filter(m=>m.tipo===tipo).map(m=><article key={m.id} className="min-w-0 space-y-3 rounded-xl border border-violet-500/25 p-3">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm" title={m.titulo}>{m.titulo}</strong>
        <p className="mt-1 text-xs text-foreground/65">{m.dataPrevista||([m.inicioPrevisto,m.terminoPrevisto].filter(Boolean).join(' até '))||'Sem data obrigatória'}</p></div>
        {permitido('editarMetasMarco')&&<button type="button" className="shrink-0 rounded-lg border border-current/25 px-2 py-1 text-xs" onClick={()=>{setEditarId(m.id);setForm({titulo:m.titulo,tipo:m.tipo,quantidadeExigida:m.quantidadeExigida,dataPrevista:m.dataPrevista,inicioPrevisto:m.inicioPrevisto,terminoPrevisto:m.terminoPrevisto,observacoes:m.observacoes});}}>Editar</button>}</div>
      <div className="flex items-center justify-between text-xs"><span>{m.quantidadeAprovada}/{m.quantidadeExigida} vínculos válidos</span><strong>{m.percentualPreparacao.toFixed(0)}%</strong></div>
      <Progresso nome={`Progresso de ${m.titulo}`} valor={m.percentualPreparacao}/>
      <button type="button" className="rounded-lg border border-current/25 px-3 py-2 text-xs" aria-expanded={expandida===m.id} onClick={()=>void abrirMeta(m)}>{expandida===m.id?'Ocultar vínculos':'Gerenciar vínculos'}</button>
      {expandida===m.id&&<div className="space-y-3 border-t border-current/15 pt-3">
        {m.vinculos.length===0&&<p className="text-xs text-foreground/60">Nenhum vínculo solicitado.</p>}
        {m.vinculos.map(v=><div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-current/15 p-2 text-xs">
          <div className="min-w-0"><span className="font-semibold">{v.status==='APROVADO'?v.elegivel?'Aprovado':'Revalidação necessária':'Pendente de aprovação'}</span>
            <p className="truncate text-foreground/55" title={v.ocorrenciaId||v.atividadeId||v.comprovanteId||''}>{v.ocorrenciaId||v.atividadeId||v.comprovanteId}</p></div>
          {v.status==='PENDENTE'&&permitido('aprovarVinculosMetasMarco')&&<div className="flex gap-2"><button type="button" disabled={ocupado} onClick={()=>void executar(()=>decidirVinculoMeta(contratoId,entregavelId,m.id,v.id,false,justificativa))} className="rounded-lg border border-red-500/50 px-2 py-1 text-red-400">Rejeitar</button>
            <button type="button" disabled={ocupado} onClick={()=>void executar(()=>decidirVinculoMeta(contratoId,entregavelId,m.id,v.id,true))} className="rounded-lg bg-green-600 px-2 py-1 font-semibold text-white">Aprovar</button></div>}</div>)}
        {permitido('vincularMetasMarco')&&<div className="space-y-2">
          <label className="text-xs">Selecionar {TIPOS.find(t=>t.id===m.tipo)?.rotulo.toLowerCase()} já concluídas/verificadas
            <select className={INPUT} value={registro} onChange={e=>setRegistro(e.target.value)}><option value="">Selecione um registro...</option>{candidatos.map(c=><option key={c.id} value={c.id}>{c.titulo}</option>)}</select></label>
          <div className="flex justify-end"><button type="button" disabled={ocupado||!registro} onClick={()=>void executar(async()=>{await vincularMetaMarco(contratoId,entregavelId,m.id,registro);setRegistro('');})}
            className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Solicitar vínculo</button></div>
        </div>}
      </div>}
    </article>)}
  </section>;
}
