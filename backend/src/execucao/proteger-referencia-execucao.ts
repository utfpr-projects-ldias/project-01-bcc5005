import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/** Os chamadores mantêm o lock contratual. Referências históricas e em revisão
 * não impedem corrigir a fonte; as verificadas vigentes exigem reabertura. */
export async function protegerReferenciaManual(m: EntityManager, contratoId: string, id: string, modalidade: 'QUANTIDADE'|'PERCENTUAL', origem: 'manual'|'evidencia' = 'manual') {
  const [r] = modalidade === 'QUANTIDADE' ? await m.query(`SELECT EXISTS(
    SELECT 1 FROM atividade_ocorrencia_medicoes am JOIN atividades a ON a.id=am.atividade_id AND a."contratoId"=am.contrato_id
    WHERE am.contrato_id=$1 AND am.referencia_execucao=$2 AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'
    UNION ALL
    SELECT 1 FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
    WHERE c.contrato_id=$1 AND c.origem_quantidade='COMPROVACAO' AND c.referencia_execucao=$2 AND ev.arquivado_em IS NULL
      AND ev.reaberto_em IS NULL AND c.status='VERIFICADA' AND c.verificado_em IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))
  ) AS dependente`, [contratoId, `${origem}:${id}`]) : await m.query(`SELECT EXISTS(
    SELECT 1 FROM execucoes_entregavel ref WHERE ref.contrato_id=$1 AND ref.referencia_id=$2
      AND ((ref.origem='ATIVIDADE' AND EXISTS(SELECT 1 FROM atividades a WHERE a.id=ref.origem_id AND a."contratoId"=$1 AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'))
      OR (ref.origem='EVIDENCIA' AND EXISTS(SELECT 1 FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
        WHERE c.id=ref.origem_id AND c.contrato_id=$1 AND ev.arquivado_em IS NULL AND ev.reaberto_em IS NULL AND c.status='VERIFICADA' AND c.verificado_em IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)))))
  ) AS dependente`,[contratoId,id]);
  if (r?.dependente) throw new ConflictException('Esta execução possui comprovações referenciadas. Reabra primeiro as comprovações verificadas que dependem desta execução.');
}
