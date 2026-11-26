'use client';
import {useId,useState} from 'react';

/** A escolha do destino é explícita quando há vários registros editáveis. */
export function AcaoVincularRegistro({rotulo,opcoes,ocupado,onVincular}:{rotulo:string;opcoes:{id:string;nome:string}[];ocupado?:boolean;onVincular:(id:string)=>void}){
 const id=useId();
 const [escolhido,setEscolhido]=useState('');
 const destino=opcoes.length===1?opcoes[0].id:opcoes.some(o=>o.id===escolhido)?escolhido:'';
 if(!opcoes.length)return null;
 return <div className="pi-card-adicionar-vinculo">
   {opcoes.length>1&&<label className="min-w-0" htmlFor={id}><span className="sr-only">Destino do vínculo</span><select id={id} value={destino} disabled={ocupado} onChange={e=>setEscolhido(e.target.value)}><option value="">Selecione o destino…</option>{opcoes.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}</select></label>}
   <button type="button" disabled={ocupado||!destino} onClick={()=>onVincular(destino)}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>{rotulo}</button>
 </div>;
}
