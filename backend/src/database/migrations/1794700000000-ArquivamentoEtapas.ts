import type { MigrationInterface, QueryRunner } from 'typeorm';
export class ArquivamentoEtapas1794700000000 implements MigrationInterface {
  name = 'ArquivamentoEtapas1794700000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE "etapas" ADD COLUMN "arquivado_em" timestamptz');
    await q.query('ALTER TABLE "etapas" ADD COLUMN "arquivado_por" uuid');
    await q.query('ALTER TABLE "etapas" ADD CONSTRAINT "fk_etapas_arquivado_por" FOREIGN KEY ("arquivado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT');
    await q.query('ALTER TABLE "etapas" ADD CONSTRAINT "ck_etapas_arquivamento" CHECK (("arquivado_em" IS NULL) = ("arquivado_por" IS NULL))');
    await q.query('CREATE INDEX "idx_etapas_arquivadas" ON "etapas" ("arquivado_em") WHERE "arquivado_em" IS NOT NULL');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX "idx_etapas_arquivadas"');
    await q.query('ALTER TABLE "etapas" DROP CONSTRAINT "ck_etapas_arquivamento"');
    await q.query('ALTER TABLE "etapas" DROP CONSTRAINT "fk_etapas_arquivado_por"');
    await q.query('ALTER TABLE "etapas" DROP COLUMN "arquivado_por"');
    await q.query('ALTER TABLE "etapas" DROP COLUMN "arquivado_em"');
  }
}
