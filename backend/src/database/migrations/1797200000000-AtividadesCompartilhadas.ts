import { MigrationInterface, QueryRunner } from 'typeorm';

/** Grupo multicontrato: atividades locais preservam vínculos, medições e decisões por contrato. */
export class AtividadesCompartilhadas1797200000000 implements MigrationInterface {
  name = 'AtividadesCompartilhadas1797200000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "atividades_compartilhadas" (
      "id" uuid PRIMARY KEY,
      "criado_por" uuid NOT NULL,
      "criado_em" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(`ALTER TABLE "atividades" ADD COLUMN "atividade_compartilhada_id" uuid NULL`);
    await q.query(`ALTER TABLE "atividades" ADD CONSTRAINT "fk_atividades_grupo"
      FOREIGN KEY ("atividade_compartilhada_id") REFERENCES "atividades_compartilhadas"("id") ON DELETE RESTRICT`);
    await q.query(`CREATE UNIQUE INDEX "uq_atividades_grupo_contrato"
      ON "atividades" ("atividade_compartilhada_id", "contratoId")
      WHERE "atividade_compartilhada_id" IS NOT NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "uq_atividades_grupo_contrato"`);
    await q.query(`ALTER TABLE "atividades" DROP CONSTRAINT "fk_atividades_grupo"`);
    await q.query(`ALTER TABLE "atividades" DROP COLUMN "atividade_compartilhada_id"`);
    await q.query(`DROP TABLE "atividades_compartilhadas"`);
  }
}
