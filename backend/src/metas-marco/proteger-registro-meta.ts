import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { TipoRegistroMeta } from './meta-marco.entity.js';

/** Chamado dentro da transação que já bloqueou o contrato. Não altera estados dos filhos. */
export async function exigirRegistroMetaEditavel(m: EntityManager, contratoId:string, tipo:TipoRegistroMeta, id:string, regularizacao=false) {
  const alvo = tipo==='OCORRENCIA' ? 'v.ocorrencia_id=$2' : tipo==='ATIVIDADE' ? `(v.atividade_id=$2 OR EXISTS (
    SELECT 1 FROM atividades a WHERE a.id=$2 AND a."contratoId"=$1 AND (a."ocorrenciaId"=v.ocorrencia_id OR EXISTS (SELECT 1 FROM atividade_ocorrencias ao WHERE ao."atividadeId"=a.id AND ao."contratoId"=$1 AND ao."ocorrenciaId"=v.ocorrencia_id))))` : `(v.evidencia_esperada_id=$2 OR EXISTS (
    SELECT 1 FROM comprovantes_evidencia c WHERE c.contrato_id=$1 AND c.evidencia_esperada_id=$2 AND (
      EXISTS(SELECT 1 FROM ocorrencia_comprovantes oc WHERE oc.contrato_id=$1 AND oc.comprovante_id=c.id AND oc.ocorrencia_id=v.ocorrencia_id) OR
      EXISTS(SELECT 1 FROM atividade_comprovantes ac JOIN atividades a ON a.id=ac.atividade_id AND a."contratoId"=$1 WHERE ac.contrato_id=$1 AND ac.comprovante_id=c.id AND (ac.atividade_id=v.atividade_id OR a."ocorrenciaId"=v.ocorrencia_id OR EXISTS(SELECT 1 FROM atividade_ocorrencias ao WHERE ao."contratoId"=$1 AND ao."atividadeId"=a.id AND ao."ocorrenciaId"=v.ocorrencia_id))))))`;
  const documental = tipo==='EVIDENCIA' ? ` AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia ce WHERE ce.contrato_id=$1 AND ce.evidencia_esperada_id=$2 AND (ce.quantidade_declarada IS NOT NULL OR ce.status='VERIFICADA' OR EXISTS(SELECT 1 FROM execucoes_entregavel l WHERE l.origem='EVIDENCIA' AND l.origem_id=ce.id)))` : '';
  const [r] = await m.query(`SELECT EXISTS(SELECT 1 FROM vinculos_metas_marco v JOIN metas_marco mm ON mm.id=v.meta_id AND mm.contrato_id=v.contrato_id
    WHERE v.contrato_id=$1 AND v.status='APROVADO' AND mm.arquivado_em IS NULL AND mm.estado<>'ABERTA'
    AND NOT($3::boolean AND mm.estado='CONCLUIDA_PARCIALMENTE'${documental}) AND ${alvo}) AS bloqueado`,[contratoId,id,regularizacao]) as {bloqueado:boolean}[];
  if(r?.bloqueado===true) throw new ConflictException('O registro pertence a uma meta do Marco bloqueada. Reabra a meta antes de alterar o registro.');
}
