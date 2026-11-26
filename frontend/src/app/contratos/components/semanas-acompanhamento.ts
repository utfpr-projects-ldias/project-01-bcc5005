/** Semanas civis (domingo a sábado), apenas para navegação; não criam obrigações. */
export type SemanaAcompanhamento={inicio:string;fim:string;chave:string;rotulo:string;mes:string};
const civil=(d:Date)=>d.toISOString().slice(0,10);
const data=(s:string)=>new Date(`${s}T12:00:00Z`);
export function somarDias(d:string,n:number){const dt=data(d);dt.setUTCDate(dt.getUTCDate()+n);return civil(dt);}
const mesNome=(d:string)=>data(d).toLocaleDateString('pt-BR',{month:'long',timeZone:'UTC'});
export function semanaDe(d:string,inicio:string,fim:string):SemanaAcompanhamento{
 const chave=somarDias(d,-data(d).getUTCDay()),ultimo=somarDias(chave,6);
 const a=chave<inicio?inicio:chave,b=ultimo>fim?fim:ultimo;
 const cruza=a.slice(0,7)!==b.slice(0,7);
 return {inicio:a,fim:b,chave,rotulo:cruza?`${Number(a.slice(-2))}/${a.slice(5,7)}–${Number(b.slice(-2))}/${b.slice(5,7)}`:`${Number(a.slice(-2))}–${Number(b.slice(-2))}`,mes:cruza?`${mesNome(a)} / ${mesNome(b)}`:mesNome(a)};
}
export function semanasDoMes(mes:string,inicio:string,fim:string){
 const primeiro=`${mes}-01`,dt=data(primeiro);dt.setUTCMonth(dt.getUTCMonth()+1);dt.setUTCDate(0);
 const a=primeiro<inicio?inicio:primeiro,b=civil(dt)>fim?fim:civil(dt),resultado:SemanaAcompanhamento[]=[];
 if(a>b)return resultado;
 for(let d=a;d<=b;){const s=semanaDe(d,inicio,fim);resultado.push(s);d=somarDias(somarDias(s.chave,6),1);}
 return resultado;
}
export function estadoDaSemana(s:SemanaAcompanhamento,estado:(dia:string)=>string){
 const estados=new Set<string>();for(let d=s.inicio;d<=s.fim;d=somarDias(d,1))estados.add(estado(d));
 for(const e of ['ATRASADO','PENDENTE','CONCLUIDO_PARCIALMENTE','EM_ANDAMENTO','CONCLUIDO','NAO_AVALIADO','SEM_REGISTROS','FUTURO'])if(estados.has(e))return e;
 return 'SEM_REGISTROS';
}

/** Intervalos mensais limitados à vigência, sem criar obrigações. */
export function mesesDoAno(ano:string,inicio:string,fim:string):SemanaAcompanhamento[]{
 return Array.from({length:12},(_,i)=>`${ano}-${String(i+1).padStart(2,'0')}`).flatMap(m=>{
  const primeiro=`${m}-01`,dt=data(primeiro);dt.setUTCMonth(dt.getUTCMonth()+1);dt.setUTCDate(0);
  const a=primeiro<inicio?inicio:primeiro,b=civil(dt)>fim?fim:civil(dt);
  return a>b?[]:[{inicio:a,fim:b,chave:m,rotulo:`${Number(a.slice(-2))}–${Number(b.slice(-2))}`,mes:mesNome(a)}];
 });
}
export function limitarDataAcompanhamento(d:string,inicio:string,fim:string){return d<inicio?inicio:d>fim?fim:d;}
