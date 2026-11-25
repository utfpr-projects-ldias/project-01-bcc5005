/** Calcula dias de calendário, sem depender da hora local do navegador. */
export function diasDeVigencia(termino:string|null|undefined, agora=new Date()):number|null {
  if(!termino||!/^\d{4}-\d{2}-\d{2}$/.test(termino))return null;
  const fim=new Date(`${termino}T00:00:00.000Z`);
  if(!Number.isFinite(fim.getTime())||fim.toISOString().slice(0,10)!==termino)return null;
  const hoje=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(agora);
  return Math.round((fim.getTime()-Date.parse(`${hoje}T00:00:00.000Z`))/86400000);
}
export function rotuloPrazoVigencia(termino:string|null|undefined,fechado=false,agora=new Date()):string {
  if(fechado)return 'Fluxo finalizado';
  const dias=diasDeVigencia(termino,agora);
  if(dias===null)return 'Não informado';
  if(dias===0)return 'Vence hoje';
  return dias>0?`${dias} ${dias===1?'dia restante':'dias restantes'}`:`Vencido há ${-dias} ${dias===-1?'dia':'dias'}`;
}
export function formatarVigencia(inicio:string,termino:string):string {
  const br=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)?d.split('-').reverse().join('/'):'—';
  return `${br(inicio)} – ${br(termino)}`;
}
