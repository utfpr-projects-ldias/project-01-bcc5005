import type { Atividade, OrdemDiario } from '@/hooks/use-atividades';
const dia = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
const titulo = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'numeric',month:'long',year:'numeric'});
/** Mantém a ordem global entregue pela API. Agrupa somente quando a ordenação é cronológica;
 * ordenar por duração e reagrupar por data destruiria a ordem numérica. */
export function agruparDiario<T extends Pick<Atividade,'id'|'dataHora'>>(itens:T[],ordem:OrdemDiario){
 const unicos=[...new Map(itens.map(a=>[a.id,a])).values()];
 if(ordem==='duracao-desc'||ordem==='duracao-asc')return [{chave:'duracao',rotulo:ordem==='duracao-desc'?'Maior duração primeiro':'Menor duração primeiro',itens:unicos}];
 const grupos=new Map<string,{chave:string;rotulo:string;itens:T[]}>();
 for(const a of unicos){const data=new Date(a.dataHora);const valida=Number.isFinite(data.getTime());const chave=valida?dia.format(data):'sem-data';let g=grupos.get(chave);if(!g){g={chave,rotulo:valida?titulo.format(data):'Data não informada',itens:[]};grupos.set(chave,g);}g.itens.push(a);}
 return [...grupos.values()];
}
