"use client";
import { useCallback, useEffect, useState } from 'react';

export type PedidoExecucaoPendente = { id:string; valor:string; data:string; observacao:string; ocorrenciaId:string|null; endpoint:'OCORRENCIA'|'ENTREGAVEL'|'META_MARCO' };
function valido(p: unknown): p is PedidoExecucaoPendente {
  if(!p || typeof p!=='object')return false;
  const v=p as Partial<PedidoExecucaoPendente>;
  return typeof v.id==='string' && typeof v.valor==='string' && typeof v.data==='string' && typeof v.observacao==='string' &&
    (v.ocorrenciaId===null || typeof v.ocorrenciaId==='string') && ['OCORRENCIA','ENTREGAVEL','META_MARCO'].includes(v.endpoint??'');
}
/** Persistência de um pedido indeterminado nesta aba, separado por conta/recurso. */
export function usePedidoExecucaoPendente(chave:string|null) {
  const [estado,setEstado]=useState<{chave:string|null;pedido:PedidoExecucaoPendente|null}>({chave:null,pedido:null});
  const storage=chave?`pi:execucao-pendente:${chave}`:null;
  useEffect(()=>{
    let ativo=true;
    queueMicrotask(()=>{
      if(!ativo)return;
      let pedido:PedidoExecucaoPendente|null=null;
      try {const bruto=storage?sessionStorage.getItem(storage):null;const p:unknown=bruto?JSON.parse(bruto):null;if(valido(p))pedido=p;}catch{/* estado em memória continua disponível */}
      setEstado({chave:storage,pedido});
    });
    return ()=>{ativo=false;};
  },[storage]);
  const definir=useCallback((pedido:PedidoExecucaoPendente|null)=>{
    if(!storage)return;
    try{if(pedido)sessionStorage.setItem(storage,JSON.stringify(pedido));else sessionStorage.removeItem(storage);}catch{/* armazenamento indisponível */}
    setEstado({chave:storage,pedido});
  },[storage]);
  return {pronto:!!storage&&estado.chave===storage,pedido:estado.chave===storage?estado.pedido:null,definir};
}
