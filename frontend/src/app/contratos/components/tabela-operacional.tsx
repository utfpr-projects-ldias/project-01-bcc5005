'use client';
import { useState } from 'react';
import { CORES_COMPROVACAO, apresentarFracao, tomComprovacao } from '@/lib/apresentacao-indicadores';
import type { Etapa } from '@/lib/etapas';
import type { ProgressoContrato } from '@/hooks/use-progresso';
import { identidadeEtapa } from '@/lib/identidade-etapa';
import { resultadoFinalizacao } from '@/lib/finalizados';
import type { Entregavel, ResumoDocumentalEntregavel } from '@/lib/entregaveis';
import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { IconeEtapa } from '@/app/components/icone-etapa';
import type { IconeEtapa as TipoIcone } from '@/lib/identidade-etapa';

export type ValorOrdem = string | number | null | undefined;
export type Fracao = { feitas?: number; total?: number };
export type OrdemTabela = { campo: string; direcao: 1 | -1 } | null;
export function ordenarTabela<T>(itens: readonly T[], ordem: OrdemTabela, valor: (item: T, campo: string) => ValorOrdem): T[] {
  if (!ordem) return [...itens];
  return [...itens].sort((a,b) => {
    const x=valor(a,ordem.campo), y=valor(b,ordem.campo);
    if (x==null || x==='') return y==null || y==='' ? 0 : 1;
    if (y==null || y==='') return -1;
    return ordem.direcao*(typeof x==='number' && typeof y==='number' ? x-y : String(x).localeCompare(String(y),'pt-BR',{numeric:true,sensitivity:'base'}));
  });
}
export function useOrdemTabela(){
  const [ordem,setOrdem]=useState<OrdemTabela>(null);
  const alternar=(campo:string)=>setOrdem(atual=>atual?.campo!==campo?{campo,direcao:1}:atual.direcao===1?{campo,direcao:-1}:null);
  return {ordem,alternar,restaurar:()=>setOrdem(null)};
}
export function CabecalhoColuna({campo,titulo,ordem,alternar}:{campo:string;titulo:string;ordem:OrdemTabela;alternar:(campo:string)=>void}){
  const ativa=ordem?.campo===campo;
  return <th scope="col" aria-sort={ativa?(ordem.direcao===1?'ascending':'descending'):'none'}><button className="pi-coluna-ordenavel" type="button" onClick={()=>alternar(campo)} title={`${titulo} — ${ativa?(ordem.direcao===1?'Ordenar decrescente':'Restaurar ordem original'):'Ordenar crescente'}`}><span>{titulo}</span><svg aria-hidden="true" className={ativa?'pi-seta-ativa':'pi-seta-neutra'} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={ativa?(ordem.direcao===1?'M8 13V3M4 7l4-4 4 4':'M8 3v10m-4-4 4 4 4-4'):'M5 13V3L2 6m3-3 3 3m3-3v10l-3-3m3 3 3-3'}/></svg></button></th>;
}
export function taxa(f?:Fracao):number|null {const v=apresentarFracao(f?.feitas,f?.total);return v.estado==='aplicavel'?v.percentual:null;}
export function AnelTabela({fracao,nome,cor='text-violet-600 dark:text-violet-400',percentualInterno=false,valorPercentual}:{fracao?:Fracao;nome:string;cor?:string;percentualInterno?:boolean;valorPercentual?:number|null}){
  const f=valorPercentual!=null&&Number.isFinite(valorPercentual)?{estado:'aplicavel' as const,percentual:Math.min(100,Math.max(0,valorPercentual)),texto:`${valorPercentual.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}:apresentarFracao(fracao?.feitas,fracao?.total);
  if(f.estado!=='aplicavel'&&percentualInterno)return <svg className="pi-anel-tabela" role="img" aria-label={`${nome}: sem valor aplicável`} viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="4"/><text x="24" y="24" dominantBaseline="central" textAnchor="middle" fill="currentColor" fontSize="12">—</text></svg>;
  if(f.estado!=='aplicavel')return <span className="pi-sem-dados" title={`${nome}: ${f.estado==='sem-requisitos'?'sem registros':'indisponível'}`}>—</span>;
  const rotulo=percentualInterno?`${f.percentual.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`:f.texto;
  return <svg className="pi-anel-tabela" role="img" aria-label={`${nome}: ${f.texto}`} viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="4"/>{f.percentual>0&&<circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" className={cor} strokeWidth="4" pathLength="100" strokeDasharray={`${f.percentual} 100`} strokeLinecap="round" transform="rotate(-90 24 24)"/>}<text x="24" y="24" dominantBaseline="central" textAnchor="middle" fill="currentColor" fontSize={rotulo.length>7?8:rotulo.length>5?10:12} fontWeight="600">{rotulo}</text></svg>;
}
export function ComprovacaoTabela({fracao,percentual=false}:{fracao?:Fracao;percentual?:boolean}){const f=apresentarFracao(fracao?.feitas,fracao?.total);return f.estado==='aplicavel'?<strong className={`pi-comprovacao-tabela ${CORES_COMPROVACAO[tomComprovacao(fracao?.feitas,fracao?.total)]}`} title="Exigências documentais atendidas">{percentual?`${f.percentual.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`:f.texto}</strong>:<span className="pi-sem-dados">—</span>;}
export function BarraTabela({valor}:{valor?:number|null}){return valor==null||!Number.isFinite(valor)?<span className="pi-sem-dados">—</span>:<span className="pi-barra-tabela" aria-label={`${valor}% de execução física`}><span aria-hidden="true"><i style={{width:`${Math.max(0,Math.min(100,valor))}%`}}/></span><strong>{valor.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</strong></span>;}
const icones:Record<EstadoContextual,TipoIcone>={normal:'andamento','nao-iniciado':'planejamento',andamento:'andamento',pendente:'pendente',parcial:'parcial',revisao:'revisao',concluido:'concluida',finalizado:'encerrada',arquivado:'arquivada',suspenso:'pendente',encerrado:'encerrada',cancelado:'encerrada'};
export function IconeTabela({estado}:{estado:EstadoContextual}){return <span className="pi-icone-tabela" data-situacao={estado}><IconeEtapa tipo={icones[estado]}/></span>;}
export function StatusTabela({estado,rotulo}:{estado:EstadoContextual;rotulo:string}){return <span className="pi-status-tabela" data-situacao={estado} title={rotulo}>{rotulo}</span>;}
export const ordemEstados:Record<EstadoContextual,number>={'nao-iniciado':0,normal:1,andamento:1,revisao:2,pendente:3,parcial:4,concluido:5,finalizado:6,encerrado:6,suspenso:7,cancelado:8,arquivado:9};
export function metricasEntregavel(r?:ResumoDocumentalEntregavel){return {
  ocorrencias:{feitas:r?.ocorrenciasFinalizadas,total:r?.ocorrenciasTotal}, atividades:{feitas:r?.atividadesVerificadas,total:r?.atividadesTotal},
  evidencias:{feitas:r?.verificadasTotal??r?.verificadas,total:r?.total??r?.obrigatorias}, comprovacao:{feitas:r?.exigenciasDocumentaisAtendidas??r?.verificadas,total:r?.exigenciasDocumentaisTotal??r?.obrigatorias},
};}
export function somarFracoes(fracoes:Fracao[]):Fracao {return fracoes.every(f=>f.feitas!=null&&f.total!=null)?{feitas:fracoes.reduce((s,f)=>s+f.feitas!,0),total:fracoes.reduce((s,f)=>s+f.total!,0)}:{};}

/** Agregação única da etapa, também usada na expansão da carteira. */
export function metricasEtapa(etapa: Etapa, itens: Entregavel[] | undefined, resumo: Record<string, ResumoDocumentalEntregavel> | undefined, progresso: ProgressoContrato | null, modo = progresso?.modoCalculo) {
  const filhos = (itens ?? []).filter(e => e.etapaId === etapa.id && e.contratoId === etapa.contratoId && !e.arquivadoEm);
  const porId = new Map(progresso?.entregaveis.map(e => [e.entregavelId, e]));
  const ms = filhos.map(e => ({...metricasEntregavel(resumo?.[e.id]), execucao: porId.get(e.id)?.percentualExecucao ?? null, participacao: porId.get(e.id)?.participacaoOperacional ?? null}));
  const docs = filhos.map(e => resumo?.[e.id]);
  const atividades = docs.every(d => Array.isArray(d?.atividadesIds) && Array.isArray(d?.atividadesIdsVerificadas)) ? {total:new Set(docs.flatMap(d => d!.atividadesIds!)).size, feitas:new Set(docs.flatMap(d => d!.atividadesIdsVerificadas!)).size} : filhos.length === 1 ? ms[0].atividades : {};
  const pesos = ms.reduce((s,m) => s+(m.participacao??0),0);
  const execucao = modo && ms.length && ms.every(m=>m.execucao!=null) ? modo==='PONDERADO' ? (pesos>0 && ms.every(m=>m.participacao!=null) ? ms.reduce((s,m)=>s+(m.execucao??0)*(m.participacao??0),0)/pesos : null) : ms.reduce((s,m)=>s+(m.execucao??0),0)/ms.length : null;
  return {execucao, entregaveis:itens?{total:filhos.length,feitas:filhos.filter(f=>!f.reabertoEm&&!f.regularizacaoDocumentalSolicitada&&resultadoFinalizacao('entregavel',f.statusExecucao)).length}:{}, ocorrencias:itens?somarFracoes(ms.map(m=>m.ocorrencias)):{}, atividades:itens?atividades:{}, evidencias:itens?somarFracoes(ms.map(m=>m.evidencias)):{}, comprovacao:itens?somarFracoes(ms.map(m=>m.comprovacao)):{}, estado:identidadeEtapa(etapa).estado};
}
