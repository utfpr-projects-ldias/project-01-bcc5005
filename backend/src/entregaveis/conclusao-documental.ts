import type { EntityManager } from 'typeorm';
/**
 * True somente quando cada nível ativo contém pelo menos um filho e cada
 * evidência ativa possui versão mais recente verificada. Sem conclusão por 0/0.
 * Reaberturas explícitas são verificadas separadamente nas entidades.
 */
export async function documentacaoVerificada(m: EntityManager, contratoId: string, etapaId: string | null = null,
  entregavelId: string | null = null): Promise<boolean> {
  const rows = await m.query(`
    SELECT COUNT(DISTINCT et.id)::int AS etapas,
           COUNT(DISTINCT en.id)::int AS entregaveis,
           COUNT(DISTINCT ev.id)::int AS evidencias,
           COUNT(DISTINCT ev.id) FILTER (WHERE v.status = 'VERIFICADA')::int AS verificadas,
           COUNT(DISTINCT et.id) FILTER (WHERE en.id IS NULL)::int AS etapas_sem_entregavel,
           COUNT(DISTINCT en.id) FILTER (WHERE ev.id IS NULL)::int AS entregaveis_sem_evidencia
      FROM etapas et
      LEFT JOIN entregaveis en ON en.etapa_id = et.id AND en.arquivado_em IS NULL
      LEFT JOIN evidencias_esperadas ev ON ev.entregavel_id = en.id AND ev.arquivado_em IS NULL
      LEFT JOIN LATERAL (
        SELECT ce.status FROM comprovantes_evidencia ce
          WHERE ce.evidencia_esperada_id = ev.id
          ORDER BY ce.criado_em DESC, ce.id DESC LIMIT 1
      ) v ON TRUE
     WHERE et.contrato_id = $1 AND et.arquivado_em IS NULL
       AND ($2::uuid IS NULL OR et.id = $2::uuid)
       AND ($3::uuid IS NULL OR en.id = $3::uuid)
  `, [contratoId, etapaId, entregavelId]) as Array<Record<string, number | string>>;
  const r = rows[0];
  return !!r && Number(r.etapas) > 0 && Number(r.entregaveis) > 0 && Number(r.evidencias) > 0 &&
    Number(r.verificadas) === Number(r.evidencias) &&
    Number(r.etapas_sem_entregavel) === 0 && Number(r.entregaveis_sem_evidencia) === 0;
}
