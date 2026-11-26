import type { EntityManager } from 'typeorm';
import type { MetaMarco } from './meta-marco.entity.js';
import { milesimos } from '../common/quantidade-exata.js';

export type ExecucaoManualMeta = { id:string; quantidade:string; data:string; observacao:string|null; status:'PENDENTE'|'APROVADO'|'REJEITADO'; autorId:string; motivo:string|null; versao:string; pedidoOriginal: {valor:string;data:string;observacao:string|null} };
export function somarExecucoesMeta(registros: Pick<ExecucaoManualMeta,'quantidade'|'status'>[]) {
  let aprovada=0n, reservada=0n, pendentes=0;
  for(const r of registros){
    if(r.status==='APROVADO')aprovada+=milesimos(r.quantidade);
    if(r.status==='PENDENTE'){reservada+=milesimos(r.quantidade);pendentes++;}
  }
  return {aprovada,reservada,pendentes};
}
export async function listarExecucoesMeta(m:EntityManager,meta:MetaMarco):Promise<ExecucaoManualMeta[]> {
  if(meta.tipo!=='QUANTITATIVA')return [];
  return m.query(`SELECT id,quantidade::text, data_execucao::text AS data, observacao,status,autor_id AS "autorId",motivo,xmin::text AS versao,pedido_original AS "pedidoOriginal" FROM execucoes_metas_marco WHERE meta_id=$1 AND contrato_id=$2 ORDER BY criado_em,id`,[meta.id,meta.contratoId]);
}
