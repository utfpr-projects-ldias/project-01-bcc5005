import type { DetalheEvidencia, StatusComprovante, VinculoCompartilhado, VinculoLocalEvidencia } from './comprovantes';

export type DestinoVinculoEvidencia = {
  contratoId: string; contrato: string; entregavelId: string; entregavel: string; esperadaId: string;
  status: StatusComprovante; vinculos?: VinculoLocalEvidencia[]; compartilhado?: VinculoCompartilhado;
  atual: boolean; podeEditar: boolean;
};
export type AbaVinculosEvidencia = 'contratos' | 'entregaveis' | 'ocorrencias' | 'atividades';

/** A origem local pode também aparecer na lista de compartilhamentos. Nunca conte o mesmo destino duas vezes. */
export function destinosVinculadosEvidencia(dados: DetalheEvidencia): DestinoVinculoEvidencia[] {
  const chave = (d: { contratoId:string; entregavelId:string; esperadaId:string }) => `${d.contratoId}:${d.entregavelId}:${d.esperadaId}`;
  const mapa = new Map<string,DestinoVinculoEvidencia>();
  for (const v of dados.compartilhamentosPreliminares??[]) mapa.set(chave(v), {...v,status:'SEM_ENVIO',vinculos:v.vinculosAtuais,atual:false,podeEditar:false});
  for (const v of dados.compartilhamentos??[]) if(v.vigente) mapa.set(chave(v), {...v,vinculos:v.vinculosAtuais,compartilhado:v,atual:false,podeEditar:!!v.podeEditarVinculos});
  const local = {contratoId:dados.contratoId,entregavelId:dados.entregavelId,esperadaId:dados.id};
  const anterior=mapa.get(chave(local));
  mapa.set(chave(local), {...local,contrato:dados.contrato??anterior?.contrato??'atual',entregavel:dados.entregavel??anterior?.entregavel??'Entregável atual',status:dados.status,vinculos:dados.vinculosAtuais??anterior?.vinculos,atual:true,compartilhado:anterior?.compartilhado,podeEditar:dados.podeEditarVinculos!==false});
  return [...mapa.values()].sort((a,b)=>Number(b.atual)-Number(a.atual)||a.contrato.localeCompare(b.contrato,'pt-BR')||a.entregavel.localeCompare(b.entregavel,'pt-BR'));
}

/** Um registro pode estar vinculado a dois entregáveis: o contador conta o registro, não as cópias. */
export function registrosVinculadosEvidencia(destinos: DestinoVinculoEvidencia[], tipo:'ocorrencia'|'atividade') {
  const mapa = new Map<string,{id:string;titulo:string;contratoId:string;contrato:string;destinos:string[]}>();
  for(const d of destinos) for(const v of d.vinculos??[]) if(v.tipo===tipo){
    const chave=`${d.contratoId}:${v.id}`, existente=mapa.get(chave);
    if(existente){if(!existente.destinos.includes(d.entregavel))existente.destinos.push(d.entregavel);}
    else mapa.set(chave,{id:v.id,titulo:v.titulo,contratoId:d.contratoId,contrato:d.contrato,destinos:[d.entregavel]});
  }
  return [...mapa.values()];
}
export function totaisVinculosEvidencia(destinos: DestinoVinculoEvidencia[]): Record<AbaVinculosEvidencia,number|null> {
  const completos=destinos.every(d=>Array.isArray(d.vinculos));
  return {contratos:new Set(destinos.map(d=>d.contratoId)).size,entregaveis:new Set(destinos.map(d=>`${d.contratoId}:${d.entregavelId}`)).size,
    ocorrencias:completos?registrosVinculadosEvidencia(destinos,'ocorrencia').length:null,atividades:completos?registrosVinculadosEvidencia(destinos,'atividade').length:null};
}

export function itensVinculosEvidencia(dados?:DetalheEvidencia) {
  const totais=dados?totaisVinculosEvidencia(destinosVinculadosEvidencia(dados)):null;
  return ([['contratos','Contratos'],['entregaveis','Entregáveis'],['ocorrencias','Ocorrências'],['atividades','Atividades']] as const).map(([chave,rotulo])=>({rotulo,total:totais?.[chave]??null}));
}
