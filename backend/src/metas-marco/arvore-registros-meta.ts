import type { EntityManager } from 'typeorm';
import type { VinculoMetaMarco, TipoRegistroMeta } from './meta-marco.entity.js';

export type RegistroArvoreMeta = {
  id: string; tipo: TipoRegistroMeta; registroId: string; paiId: string | null;
  direto: boolean; versaoVinculadaAtual: boolean;
};
type Relacao = { tipo: 'ATIVIDADE' | 'EVIDENCIA'; registro_id: string; pai_tipo: 'OCORRENCIA' | 'ATIVIDADE'; pai_registro_id: string; atual: boolean };
const chave = (tipo: TipoRegistroMeta, id: string) => `${tipo}:${id}`;

/** A associação explícita prevalece sobre a indireta. Cada objeto tem uma única
 * representação, sem criar registros ou alterar as relações nativas. */
export function montarArvoreMeta(diretos: RegistroArvoreMeta[], relacoes: Relacao[]): RegistroArvoreMeta[] {
  const mapa = new Map(diretos.map(v => [chave(v.tipo,v.registroId),v]));
  for (const tipo of ['ATIVIDADE','EVIDENCIA'] as const) {
    for (const r of relacoes.filter(x=>x.tipo===tipo).sort((a,b)=>Number(b.atual)-Number(a.atual)||a.pai_registro_id.localeCompare(b.pai_registro_id)||a.registro_id.localeCompare(b.registro_id))) {
      const k=chave(tipo,r.registro_id), pai=mapa.get(chave(r.pai_tipo,r.pai_registro_id));
      if (!pai || mapa.has(k)) continue;
      mapa.set(k,{id:`indireto:${k}`,tipo,registroId:r.registro_id,paiId:pai.id,direto:false,versaoVinculadaAtual:r.atual});
    }
  }
  const todos=[...mapa.values()];
  const ordenar=(pai:string|null):RegistroArvoreMeta[]=>todos.filter(v=>v.paiId===pai).flatMap(v=>[v,...ordenar(v.id)]);
  return ordenar(null);
}

export async function consultarArvoreMeta(m:EntityManager, contratoId:string, entregavelId:string, vinculos:VinculoMetaMarco[]):Promise<RegistroArvoreMeta[]> {
  const diretos:RegistroArvoreMeta[]=vinculos.flatMap(v=>{
    const tipo:TipoRegistroMeta=v.ocorrenciaId?'OCORRENCIA':v.atividadeId?'ATIVIDADE':'EVIDENCIA';
    const registroId=v.ocorrenciaId??v.atividadeId??v.evidenciaEsperadaId;
    return registroId?[{id:v.id,tipo,registroId,paiId:null,direto:true,versaoVinculadaAtual:true}]:[];
  });
  const os=diretos.filter(v=>v.tipo==='OCORRENCIA').map(v=>v.registroId);
  const idsAtividades=diretos.filter(v=>v.tipo==='ATIVIDADE').map(v=>v.registroId);
  if(!os.length&&!idsAtividades.length)return diretos;
  const relacoes=await m.query(`WITH ocorrencias_meta AS (
    SELECT id FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$4 AND id=ANY($2::uuid[]) AND substituida_em IS NULL
  ), atividades_ocorrencias_meta AS (
    SELECT DISTINCT a.id AS atividade_id,o.id AS ocorrencia_id FROM atividades a JOIN ocorrencias_meta o
      ON a."ocorrenciaId"=o.id OR EXISTS(SELECT 1 FROM atividade_ocorrencias ao WHERE ao."atividadeId"=a.id AND ao."ocorrenciaId"=o.id AND ao."contratoId"=$1)
    WHERE a."contratoId"=$1 AND a."excluidaEm" IS NULL AND EXISTS (SELECT 1 FROM atividade_entregaveis ae WHERE ae."atividadeId"=a.id AND ae."entregavelId"=$4)
  ), atividades_meta AS (
    SELECT a.id FROM atividades a WHERE a."contratoId"=$1 AND a."excluidaEm" IS NULL AND EXISTS (SELECT 1 FROM atividade_entregaveis ae WHERE ae."atividadeId"=a.id AND ae."entregavelId"=$4) AND (a.id=ANY($3::uuid[]) OR a.id IN (SELECT atividade_id FROM atividades_ocorrencias_meta))
  ), provas AS (
    SELECT c.evidencia_esperada_id AS registro_id,'OCORRENCIA' AS pai_tipo,oc.ocorrencia_id AS pai_registro_id,c.id,c.criado_em
    FROM ocorrencia_comprovantes oc JOIN ocorrencias_meta o ON o.id=oc.ocorrencia_id JOIN comprovantes_evidencia c ON c.id=oc.comprovante_id AND c.contrato_id=$1 AND c.entregavel_id=$4 WHERE oc.contrato_id=$1
    UNION ALL
    SELECT c.evidencia_esperada_id,'ATIVIDADE',ac.atividade_id,c.id,c.criado_em
    FROM atividade_comprovantes ac JOIN atividades_meta a ON a.id=ac.atividade_id JOIN comprovantes_evidencia c ON c.id=ac.comprovante_id AND c.contrato_id=$1 AND c.entregavel_id=$4 WHERE ac.contrato_id=$1
  ) SELECT 'ATIVIDADE' AS tipo,atividade_id AS registro_id,'OCORRENCIA' AS pai_tipo,ocorrencia_id AS pai_registro_id,true AS atual FROM atividades_ocorrencias_meta
    UNION ALL
    SELECT 'EVIDENCIA',p.registro_id,p.pai_tipo,p.pai_registro_id,NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.contrato_id=$1 AND n.evidencia_esperada_id=p.registro_id AND (n.criado_em,n.id)>(p.criado_em,p.id)) FROM provas p`,[contratoId,os,idsAtividades,entregavelId]) as Relacao[];
  return montarArvoreMeta(diretos,relacoes);
}
