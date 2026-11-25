/** Unidade inteira de 0,0001 ponto percentual; evita erro de ponto flutuante. */
export function calcularDistribuicaoPesos(valores:readonly string[]) {
  const inteiros=valores.map(v=>{const n=v.trim().replace(',','.');if(!/^\d{1,3}(?:\.\d{1,4})?$/.test(n))return null;const [i,d='']=n.split('.');const u=Number(i)*10000+Number(d.padEnd(4,'0'));return u>=0&&u<=1000000?u:null;});
  const total=inteiros.reduce<number>((s,v)=>s+(v??0),0);
  return {soma:total/10000,valida:inteiros.length>0&&inteiros.every(v=>v!==null)&&total===1000000};
}
