import { MigrationInterface, QueryRunner } from 'typeorm';

/** Associa comprovantes reais a atividades sem copiar nem reclassificar arquivos. */
export class VinculosComprovantesAtividade1796700000000 implements MigrationInterface {
  name = 'VinculosComprovantesAtividade1796700000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE UNIQUE INDEX "uq_atividades_id_contrato_vinculos_evidencia" ON "atividades" ("id", "contratoId")`);
    await q.query(`CREATE UNIQUE INDEX "uq_comprovantes_id_contrato_vinculos_atividade" ON "comprovantes_evidencia" ("id", "contrato_id")`);
    await q.query(`CREATE TABLE "atividade_comprovantes" (
      "atividade_id" uuid NOT NULL,
      "comprovante_id" uuid NOT NULL,
      "contrato_id" uuid NOT NULL,
      "vinculado_por" uuid NOT NULL,
      "vinculado_em" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_atividade_comprovantes" PRIMARY KEY ("atividade_id", "comprovante_id"),
      CONSTRAINT "fk_atividade_comprovantes_atividade_contrato"
        FOREIGN KEY ("atividade_id", "contrato_id") REFERENCES "atividades"("id", "contratoId") ON DELETE CASCADE,
      CONSTRAINT "fk_atividade_comprovantes_comprovante_contrato"
        FOREIGN KEY ("comprovante_id", "contrato_id") REFERENCES "comprovantes_evidencia"("id", "contrato_id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE INDEX "idx_atividade_comprovantes_contrato" ON "atividade_comprovantes" ("contrato_id")`);
  }

  async down(q: QueryRunner): Promise<void> {
    const linhas: Array<{ total: string }> = await q.query(`SELECT COUNT(*)::text AS total FROM "atividade_comprovantes"`);
    if (Number(linhas[0]?.total ?? 0) > 0) throw new Error('Existem vínculos de evidências com atividades. Rollback recusado para preservar histórico.');
    await q.query(`DROP TABLE "atividade_comprovantes"`);
    await q.query(`DROP INDEX "uq_atividades_id_contrato_vinculos_evidencia"`);
    await q.query(`DROP INDEX "uq_comprovantes_id_contrato_vinculos_atividade"`);
  }
}
