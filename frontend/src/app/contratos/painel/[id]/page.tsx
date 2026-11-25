'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import ConteudoContrato from '../../[id]/page';
const observar=()=>()=>{};
const incorporado=()=>window.parent!==window && new URLSearchParams(window.location.search).get('painel')==='1';
const servidor=()=>false;
/** Superfície interna do modal. Nunca exibe a página legada numa janela principal. */
export default function PainelContratoInterno(){
  const dentro=useSyncExternalStore(observar,incorporado,servidor);
  const router=useRouter();
  useEffect(()=>{if(!incorporado())router.replace('/contratos');},[router]);
  return dentro?<ConteudoContrato/>:null;
}
