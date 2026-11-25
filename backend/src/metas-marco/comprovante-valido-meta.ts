import type { EntityManager } from 'typeorm';

/** Só a versão mais recente, verificada e de checklist ativo pode sustentar meta.
 * A mesma regra é aplicada a candidatos, aprovação e reavaliação de metas.
 * Mantém a possibilidade de aproveitar comprovante de outro entregável do mesmo contrato.
 */
export async function comprovanteValidoParaMeta(
  m: EntityManager, contratoId: string, comprovanteId: string,
): Promise<boolean> {
  const linhas: Array<{ id: string }> = await m.query(`
    SELECT c.id FROM comprovantes_evidencia c
    JOIN evidencias_esperadas ev ON ev.id = c.evidencia_esperada_id
      AND ev.entregavel_id = c.entregavel_id
    WHERE c.id = $1 AND c.contrato_id = $2
      AND c.status = 'VERIFICADA' AND c.verificado_em IS NOT NULL
      AND ev.arquivado_em IS NULL AND ev.reaberto_em IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM comprovantes_evidencia nova
        WHERE nova.evidencia_esperada_id = c.evidencia_esperada_id
          AND (nova.criado_em, nova.id) > (c.criado_em, c.id)
      ) LIMIT 1`, [comprovanteId, contratoId]);
  return linhas.length > 0;
}

/** Candidatos válidos: a interface nunca oferece versão antiga ou checklist reaberto. */
export async function comprovantesCandidatosMeta(m: EntityManager, contratoId: string): Promise<Array<{ id: string; titulo: string }>> {
  return m.query(`
    SELECT c.id, c.nome_original AS titulo FROM comprovantes_evidencia c
    JOIN evidencias_esperadas ev ON ev.id = c.evidencia_esperada_id
      AND ev.entregavel_id = c.entregavel_id
    WHERE c.contrato_id = $1
      AND c.status = 'VERIFICADA' AND c.verificado_em IS NOT NULL
      AND ev.arquivado_em IS NULL AND ev.reaberto_em IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM comprovantes_evidencia nova
        WHERE nova.evidencia_esperada_id = c.evidencia_esperada_id
          AND (nova.criado_em, nova.id) > (c.criado_em, c.id)
      )
    ORDER BY c.criado_em DESC, c.id DESC`, [contratoId]);
}
