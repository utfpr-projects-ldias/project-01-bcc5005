'use client';
import {quantidadeBRParaApi} from '@/lib/numero-quantidade-br';
export function ParticipacaoOcorrencia({total,outras,meta}:{total:number;outras:number;meta:string;onMeta:(v:string)=>void;disabled?:boolean}){
 if(!(total>0))return null;
 const atual=100*Number(quantidadeBRParaApi(meta)??0)/total,restante=100-100*outras/total-atual;
 const fmt=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:2});
 return <div className="pi-participacao-calculada text-sm"><span className="block text-foreground/65">Participação calculada</span><strong className="block text-xl tabular-nums">{fmt(atual)}%</strong><span className={`block text-xs ${restante<-.00001?'text-error-text':'text-foreground/65'}`}>{restante<-.00001?'Acima da meta total: ':'Disponível: '}{fmt(Math.abs(restante))}%</span></div>;
}
