/** Dias são referências de acompanhamento; registros não são unidades de avanço físico. */
export type ConfirmacaoContinuo={autorId:string;em:string;criterio:string;observacoes:string|null};
export type EstadoDiaContinuo='CONCLUIDO'|'CONCLUIDO_PARCIALMENTE'|'PENDENTE'|'EM_ANDAMENTO'|'ATRASADO'|'SEM_REGISTROS'|'FUTURO';
export type RegistroContinuo={id:string;tipo:'OCORRENCIA'|'ATIVIDADE'|'EVIDENCIA';data:string;status:string;apto:boolean;enviadoEm?:string|null};
export type FrequenciaContinuo='DIARIA'|'SEMANAL'|'MENSAL';
const data=(s:string)=>new Date(`${s}T00:00:00Z`);
export function dataAcompanhamentoValida(d:unknown,inicio:string|null|undefined,fim:string|null|undefined):d is string {
 return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(data(d).getTime())&&data(d).toISOString().slice(0,10)===d&&Boolean(inicio&&fim&&d>=inicio&&d<=fim);
}
/** Prazo do período de referência, e não data da decisão administrativa. */
export function fimPeriodoContinuo(referencia:string,inicio:string|null,fim:string|null,frequencia:FrequenciaContinuo='DIARIA'):string|null {
 if(!dataAcompanhamentoValida(referencia,inicio,fim))return null;
 const d=data(referencia);
 if(frequencia==='SEMANAL')d.setUTCDate(d.getUTCDate()+6-d.getUTCDay());
 if(frequencia==='MENSAL')d.setUTCMonth(d.getUTCMonth()+1,0);
 const limite=d.toISOString().slice(0,10);
 return fim&&limite>fim?fim:limite;
}
export function envioAtrasadoContinuo(referencia:string,envio:string|null|undefined,inicio:string|null,fim:string|null,frequencia:FrequenciaContinuo='DIARIA'){
 const prazo=fimPeriodoContinuo(referencia,inicio,fim,frequencia);
 return Boolean(prazo&&envio&&/^\d{4}-\d{2}-\d{2}$/.test(envio)&&envio>prazo);
}
/** Atraso histórico do Contínuo nunca é inferido do dia de fechamento. */
export function indicadoresPrazoContinuo(estado:string,arquivado:boolean,reaberto:boolean,temAtrasos:boolean){
 return {atrasado:false,finalizadoComAtraso:!arquivado&&!reaberto&&temAtrasos&&['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(estado)};
}
const diasEntre=(a:string,b:string)=>Math.round((data(b).getTime()-data(a).getTime())/86400000);
const encerrado=(r:RegistroContinuo)=>r.status==='ENCERRADA'||r.status==='FINALIZADA';
const completo=(r:RegistroContinuo)=>r.apto||encerrado(r);
const pendente=(r:RegistroContinuo)=>!completo(r)&&(r.status.startsWith('PENDENTE')||['REJEITADA','REJEITADO','SEM_ENVIO','EM_REVISAO','CONCLUIDO_PARCIALMENTE'].includes(r.status));
export function resumirAcompanhamento(inicio:string|null,fim:string|null,registros:RegistroContinuo[],hoje:string,status:string|null,percentualReconhecido:number|null=null,frequencia:FrequenciaContinuo='DIARIA'){
 const distintos=[...new Map(registros.filter(r=>!['ARQUIVADA','ARQUIVADO'].includes(r.status)).map(r=>[`${r.tipo}:${r.id}`,r])).values()];
 const concluidos=distintos.filter(completo).length,pendentes=distintos.filter(pendente).length,total=distintos.length,emExecucao=total-concluidos-pendentes;
 const registrosAtrasados=distintos.filter(r=>dataAcompanhamentoValida(r.data,inicio,fim)&&envioAtrasadoContinuo(r.data,r.enviadoEm,inicio,fim,frequencia)).map(r=>({id:r.id,tipo:r.tipo,data:r.data,prazo:fimPeriodoContinuo(r.data,inicio,fim,frequencia),enviadoEm:r.enviadoEm??null}));
 const chavesAtrasadas=new Set(registrosAtrasados.map(r=>`${r.tipo}:${r.id}`));
 const porDia=new Map<string,RegistroContinuo[]>();
 for(const r of distintos){if(!dataAcompanhamentoValida(r.data,inicio,fim))continue;const lista=porDia.get(r.data)??[];lista.push(r);porDia.set(r.data,lista);}
 const diasRegistrados=[...porDia].sort(([a],[b])=>a.localeCompare(b)).map(([dia,rs])=>({dia,total:rs.length,estado:(rs.some(r=>chavesAtrasadas.has(`${r.tipo}:${r.id}`))?'ATRASADO':rs.some(pendente)?'PENDENTE':rs.some(r=>!completo(r))?'EM_ANDAMENTO':rs.some(r=>r.status==='CONCLUIDO_PARCIALMENTE')?'CONCLUIDO_PARCIALMENTE':'CONCLUIDO') as EstadoDiaContinuo}));
 const dias=inicio&&fim&&dataAcompanhamentoValida(inicio,inicio,fim)&&dataAcompanhamentoValida(fim,inicio,fim)?diasEntre(inicio,fim)+1:0;
 const transcorridos=dias&&inicio?Math.max(0,Math.min(dias,diasEntre(inicio,hoje)+1)):0;
 const vigenciaAtingida=Boolean(dias&&fim&&hoje>=fim);
 // Documento pendente não é impedimento físico por si só. Os gates documentais nativos continuam independentes.
 const operacionaisPendentes=distintos.filter(r=>r.tipo!=='EVIDENCIA'&&!r.apto).length;
 const semPendenciasOperacionais=operacionaisPendentes===0;
 const semDatasInvalidas=distintos.every(r=>dataAcompanhamentoValida(r.data,inicio,fim));
 const apto=vigenciaAtingida&&semPendenciasOperacionais&&semDatasInvalidas;
 // Sem uma medida operacional reconhecida, não inventar avanço intermediário.
 // A aprovação integral/parcial física é a decisão autorizada que reconhece 100%.
 const percentualOficial=['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(status??'')?100:typeof percentualReconhecido==='number'&&Number.isFinite(percentualReconhecido)?Math.max(0,Math.min(99.99,percentualReconhecido)):0;
 return {diasRegistrados,registrosAtrasados,temAtrasos:registrosAtrasados.length>0,total,concluidos,pendentes,emExecucao,dias,transcorridos,prazo:dias?Math.round(transcorridos*10000/dias)/100:null,vigenciaAtingida,semPendenciasOperacionais,semDatasInvalidas,apto,percentualOficial};
}
