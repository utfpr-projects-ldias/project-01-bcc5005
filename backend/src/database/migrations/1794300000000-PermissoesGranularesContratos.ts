import type { MigrationInterface, QueryRunner } from 'typeorm';
/** Somente adição: vínculos existentes continuam com os direitos do modelo legado. */
export class PermissoesGranularesContratos1794300000000 implements MigrationInterface {
  name = 'PermissoesGranularesContratos1794300000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE "permissoes_contrato" ADD COLUMN "permissoes_detalhadas" jsonb NULL');
    await q.query('ALTER TABLE "evidencias_esperadas" ALTER COLUMN "obrigatoria" SET DEFAULT true');
    await q.query(`ALTER TABLE "permissoes_contrato" ADD CONSTRAINT "ck_permissoes_detalhadas_objeto" CHECK ("permissoes_detalhadas" IS NULL OR jsonb_typeof("permissoes_detalhadas") = 'object')`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE "evidencias_esperadas" ALTER COLUMN "obrigatoria" SET DEFAULT false');
    await q.query('ALTER TABLE "permissoes_contrato" DROP CONSTRAINT "ck_permissoes_detalhadas_objeto"');
    await q.query('ALTER TABLE "permissoes_contrato" DROP COLUMN "permissoes_detalhadas"');
  }
}
