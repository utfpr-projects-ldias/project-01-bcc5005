'use client';
import {useEffect,useState} from 'react';
import {useConsulta} from '@/app/components/provedor-consultas';
import {CampoPercentual} from '@/app/components/campo-percentual';
import type {Resumo} from './execucoes-entregavel';
import type {Entregavel} from '@/lib/entregaveis';
export const numeroContribuicao=(v:string)=>Number(v.replace(',','.'));
export function saldoContribuicao(meta:number,comprometido:number,rascunho:number,casas:number){const fator=10**casas;return Math.max(0,Math.round((meta-comprometido-rascunho)*fator)/fator);}
export function CampoContribuicaoDisponivel({item,ocorrenciaId,meta,modo,valor,onValor,origemId,origem,disabled=false,inline=false,onValidade}:{item:Pick<Entregavel,'id'|'contratoId'|'tipo'|'quantidadePrevista'|'quantidadeRealizada'|'unidadeMedida'>;ocorrenciaId?:string;meta?:number;modo:'percentual'|'quantidade';valor:string;onValor:(v:string)=>void;origemId?:string;origem?:'ATIVIDADE'|'EVIDENCIA';disabled?:boolean;inline?:boolean;onValidade?:(valido:boolean)=>void}){
 const [erro,setErro]=useState(false);const c=item.contratoId,id=item.id;
 const consulta=useConsulta<Resumo>(['execucao',c,'lancamentos',id],async signal=>{const r=await fetch(`${(process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001').replace(/\/$/,'')}/contratos/${encodeURIComponent(c)}/entregaveis/${encodeURIComponent(id)}/lancamentos`,{signal,credentials:'include',cache:'no-store'});if(!r.ok)throw new Error('Saldo indisponível');return r.json();});
 const r=consulta.dados,percentual=modo==='percentual',casas=percentual?2:3;
 const periodo=r?.ocorrencias?.find(o=>o.id===ocorrenciaId);
 const total=percentual?100:meta??Number(ocorrenciaId?periodo?.metaQuantidade:item.quantidadePrevista);
 const exclui=(o:string,id:string|null|undefined)=>!!origemId&&o===origem&&id===origemId;
 const usaPeriodo=!!ocorrenciaId&&(modo==='quantidade'||item.tipo==='RECORRENTE');
 const comprometido=percentual?(usaPeriodo?0:(r?.base??0)/100)+(r?.itens??[]).filter(l=>!l.referenciaId&&!exclui(l.origem,l.origemId)&&(!usaPeriodo||l.ocorrenciaId===ocorrenciaId)).reduce((n,l)=>n+(l.reconhecido+l.reservado)/100,0): (r?.quantitativas??[]).filter(l=>!l.referenciaExecucao&&!exclui(l.origem,l.id)&&(l.situacao==='PENDENTE'||l.situacao==='APROVADO'&&l.contabilizada)&&(l.ocorrenciaId||'')===(ocorrenciaId||'')).reduce((n,l)=>n+Number(l.quantidade??0),0);
 const pronto=!!r&&!consulta.erro&&Number.isFinite(total)&&total>0&&(!percentual||item.tipo==='UNICO'||!!ocorrenciaId);const limite=saldoContribuicao(total,comprometido,0,casas);const digitado=numeroContribuicao(valor)||0;const excede=pronto&&digitado>limite;
 const valido=valor.trim()===''||pronto&&!excede&&Number.isFinite(numeroContribuicao(valor))&&numeroContribuicao(valor)>=0;
 useEffect(()=>{onValidade?.(valido);},[valido,onValidade]);
 const unidade=percentual?'%':` ${item.unidadeMedida??'unidades'}`;const fmt=(v:number)=>v.toLocaleString('pt-BR',{maximumFractionDigits:casas});
 function mudar(v:string){if(!(percentual?/^\d{0,3}(?:[.,]\d{0,2})?$/:/^\d{0,15}(?:[.,]\d{0,3})?$/).test(v))return;if(v===''||pronto&&numeroContribuicao(v)<=limite){setErro(false);onValor(v);}else setErro(true);}
 return <div className="pi-saldo-contribuicao"><label className="block text-sm font-medium">{!inline&&(percentual?'Percentual executado':'Quantidade executada')}{percentual?<CampoPercentual valor={valor} onValor={mudar} disabled={disabled||!pronto} className={inline?"pi-edicao-valor-evidencia font-semibold":"pi-contribuicao-input"} autoFocus={inline} aria-label={inline?"Editar valor da contribuição":undefined} aria-invalid={excede||erro}/>:<span className="pi-contribuicao-quantidade"><input inputMode="decimal" placeholder={`Ex.: 2 ${item.unidadeMedida??'unidades'}`} className={inline?"pi-edicao-valor-evidencia font-semibold":"pi-contribuicao-input"} autoFocus={inline} aria-label={inline?"Editar valor da contribuição":undefined} value={valor} onChange={e=>mudar(e.target.value)} disabled={disabled||!pronto} aria-invalid={excede||erro}/></span>}</label><p className="text-xs text-foreground/65" aria-live="polite">{pronto?<>Disponível: <strong>{fmt(saldoContribuicao(total,comprometido,digitado,casas))}{unidade}</strong></>:consulta.erro?'Não foi possível consultar o saldo.':'Consultando saldo…'}</p>{(erro||excede)&&<p role="alert" className="text-xs text-error-text">O valor não pode exceder {fmt(limite)}{unidade}.</p>}</div>;
}
