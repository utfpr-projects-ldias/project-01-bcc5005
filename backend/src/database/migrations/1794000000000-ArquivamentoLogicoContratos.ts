import { MigrationInterface, QueryRunner } from 'typeorm';

/** Arquivamento é independente do status operacional e não apaga nenhum vínculo histórico. */
export class ArquivamentoLogicoContratos1794000000000 implements MigrationInterface {
  name = 'ArquivamentoLogicoContratos1794000000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE "contratos" ADD COLUMN "arquivado_em" timestamptz NULL');
    await q.query('ALTER TABLE "contratos" ADD COLUMN "arquivado_por" uuid NULL');
    await q.query('ALTER TABLE "contratos" ADD CONSTRAINT "fk_contratos_arquivado_por" FOREIGN KEY ("arquivado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT');
    await q.query('ALTER TABLE "contratos" ADD CONSTRAINT "ck_contratos_arquivamento_consistente" CHECK (("arquivado_em" IS NULL) = ("arquivado_por" IS NULL))');
    await q.query('CREATE INDEX "idx_contratos_arquivados" ON "contratos" ("arquivado_em") WHERE "arquivado_em" IS NOT NULL');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX "idx_contratos_arquivados"');
    await q.query('ALTER TABLE "contratos" DROP CONSTRAINT "ck_contratos_arquivamento_consistente"');
    await q.query('ALTER TABLE "contratos" DROP CONSTRAINT "fk_contratos_arquivado_por"');
    await q.query('ALTER TABLE "contratos" DROP COLUMN "arquivado_por"');
    await q.query('ALTER TABLE "contratos" DROP COLUMN "arquivado_em"');
  }
}
