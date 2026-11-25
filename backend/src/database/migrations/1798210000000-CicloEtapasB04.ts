import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Valida os registros existentes; não corrige nem descarta solicitações legadas. */
export class CicloEtapasB041798210000000 implements MigrationInterface {
  name = 'CicloEtapasB041798210000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE etapas ADD CONSTRAINT ck_b04_solicitacao_etapa CHECK (
      ((conclusao_solicitada_em IS NULL AND conclusao_solicitada_por IS NULL AND NOT conclusao_parcial_solicitada)
        OR (conclusao_solicitada_em IS NOT NULL AND conclusao_solicitada_por IS NOT NULL AND arquivado_em IS NULL
          AND (status IN ('PLANEJADA','EM_ANDAMENTO') OR (status='CONCLUIDO_PARCIALMENTE' AND NOT conclusao_parcial_solicitada))))
      AND ((encerramento_solicitado_em IS NULL AND encerramento_solicitado_por IS NULL AND encerramento_motivo IS NULL)
        OR (encerramento_solicitado_em IS NOT NULL AND encerramento_solicitado_por IS NOT NULL AND arquivado_em IS NULL
          AND status IN ('PLANEJADA','EM_ANDAMENTO') AND encerramento_motivo IS NOT NULL
          AND length(btrim(encerramento_motivo)) BETWEEN 15 AND 200))
      AND (conclusao_solicitada_em IS NULL OR encerramento_solicitado_em IS NULL))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE etapas DROP CONSTRAINT ck_b04_solicitacao_etapa');
  }
}
