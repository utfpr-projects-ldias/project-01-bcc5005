/** Filtros de situação do calendário; arquivados continuam disponíveis nas listas de histórico. */
export function incluiRegistroCalendario(contexto:string,status:string,filtro:string):boolean {
  if(contexto==='execucoes' && (filtro==='VERIFICADAS'||filtro==='NAO_VERIFICADAS')) return status!=='ARQUIVADA'&&status!=='INATIVO'&&((status==='APROVADO')===(filtro==='VERIFICADAS'));
  if(contexto==='execucoes')return filtro ? status===filtro : status!=='ARQUIVADA'&&status!=='INATIVO';
  if(status==='ARQUIVADA'||status==='INATIVO')return false;
  if(!filtro)return true;
  if(filtro==='CONCLUIDAS'||filtro==='NAO_CONCLUIDAS')return (status==='CONCLUIDO')===(filtro==='CONCLUIDAS');
  if(filtro==='VERIFICADAS'||filtro==='NAO_VERIFICADAS')return ['VERIFICADA','APROVADO'].includes(status)===(filtro==='VERIFICADAS');
  return status===filtro;
}
