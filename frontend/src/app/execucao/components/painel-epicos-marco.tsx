'use client';
import { useEffect, useState } from 'react';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { PainelMetasMarco } from '@/app/contratos/components/painel-metas-marco';
import { listarMetasMarco, type ResumoMetasMarco } from '@/lib/metas-marco';

/** Um card por entregável MARCO: preparação das metas ≠ progresso físico do Marco. */
export function PainelEpicosMarco({ contratoId, somenteLeitura=false }: {contratoId:string;somenteLeitura?:boolean}) {
  const entregaveis=useEntregaveis(contratoId);
  const acesso=useAcessoContrato(contratoId);
  const marcos=(entregaveis.dados??[]).filter(e=>e.tipo==='MARCO'&&!e.arquivadoEm);
  const [resumos,setResumos]=useState<Record<string,ResumoMetasMarco>>({});
  const [selecionado,setSelecionado]=useState<string|null>(null);
  const ids=marcos.map(e=>e.id).join(',');
  useEffect(()=>{let ativo=true;
    void Promise.allSettled(ids.split(',').filter(Boolean).map(async id=>({id, resumo:await listarMetasMarco(contratoId,id)})))
      .then(resultados=>{if(!ativo)return;const mapa:Record<string,ResumoMetasMarco>={};for(const r of resultados)if(r.status==='fulfilled')mapa[r.value.id]=r.value.resumo;setResumos(mapa);});
    return()=>{ativo=false;};
  },[contratoId,ids]);
  return <section className="space-y-4 rounded-xl border border-current/20 p-4" aria-label="Épicos: Marcos do contrato">
    <header><h3 className="font-semibold">Épicos (Marcos)</h3><p className="mt-1 text-xs text-foreground/65">Marcos planejados por entregável. Preparação e conclusão física são distintas.</p></header>
    {entregaveis.carregando&&<p role="status" className="text-sm">Consultando Marcos...</p>}
    {marcos.length===0&&!entregaveis.carregando&&<p className="text-sm text-foreground/60">Este contrato ainda não possui entregáveis do tipo Marco.</p>}
    <div className="space-y-3">{marcos.map(e=>{const r=resumos[e.id];const porcentagem=r?.percentualPreparacao??0;
      return <article key={e.id} className="space-y-3 rounded-xl border border-violet-500/30 p-4">
        <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><h4 className="truncate font-semibold" title={e.nome}>{e.nome}</h4>
          <p className="mt-1 text-xs text-foreground/65">{r?.concluidas??0}/{r?.total??0} metas atendidas · {e.statusExecucao==='CONCLUIDO'?'Marco atingido':e.statusExecucao==='FINALIZADO'?'Encerrado':'Em preparação'}</p></div>
          <button type="button" aria-expanded={selecionado===e.id} onClick={()=>setSelecionado(v=>v===e.id?null:e.id)} className="rounded-lg border border-violet-500/40 px-3 py-2 text-xs font-semibold">{selecionado===e.id?'Ocultar metas':'Ver metas'}</button></div>
        <div className="flex justify-between text-xs"><span>Preparação</span><strong>{porcentagem.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</strong></div>
        <div role="progressbar" aria-label={`Preparação de ${e.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentagem} className="h-2 overflow-hidden rounded-full bg-current/10"><div className="h-full rounded-full bg-violet-500" style={{width:`${Math.max(0,Math.min(100,porcentagem))}%`}}/></div>
        {selecionado===e.id&&<PainelMetasMarco contratoId={contratoId} entregavelId={e.id} permissoes={acesso.dados?.permissoes} readOnly={somenteLeitura||Boolean(['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao??''))} onAtualizar={()=>{void entregaveis.atualizar();void listarMetasMarco(contratoId,e.id).then(r=>setResumos(v=>({...v,[e.id]:r}))).catch(()=>{});}}/>}
      </article>;
    })}</div>
  </section>;
}
