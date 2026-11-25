export type OrdemHistoricoExecucao = 'recentes'|'antigos'|'maior'|'menor';
export function ordenarHistoricoExecucao<T extends {chave:string;data:string;contribuicao:number|null}>(itens:readonly T[], ordem:OrdemHistoricoExecucao):T[] {
  return [...itens].sort((a,b)=>{
    if(ordem==='maior'||ordem==='menor') {
      const av=a.contribuicao,bv=b.contribuicao;
      const va=av!=null&&Number.isFinite(av),vb=bv!=null&&Number.isFinite(bv);
      if(va!==vb)return va?-1:1;
      if(va&&vb&&av!==bv)return ordem==='maior'?bv-av:av-bv;
    }
    if(Boolean(a.data)!==Boolean(b.data))return a.data?-1:1;
    return (ordem==='antigos'?a.data.localeCompare(b.data):b.data.localeCompare(a.data))||a.chave.localeCompare(b.chave);
  });
}
