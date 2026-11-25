/** Reaproveita a mesma chave após perda de resposta enquanto o arquivo selecionado permanecer no formulário. */
const pendentes = new WeakMap<File,Map<string,string>>();
export function chaveUpload(arquivo: File, escopo: string, dados: FormData): { chave: string; concluir: () => void } {
  const campos: [string,string][] = [];
  dados.forEach((valor,nome)=>{ if(typeof valor==='string') campos.push([nome,valor]); });
  const assinatura=JSON.stringify([escopo,campos.sort(([a],[b])=>a.localeCompare(b))]);
  const mapa=pendentes.get(arquivo) ?? new Map<string,string>();
  pendentes.set(arquivo,mapa);
  let chave=mapa.get(assinatura);
  if(!chave){
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const h=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
    chave=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    mapa.set(assinatura,chave);
  }
  return {chave,concluir:()=>{ if(mapa.get(assinatura)===chave) mapa.delete(assinatura); }};
}
