import type { MigrationInterface, QueryRunner } from 'typeorm';
/** Preserva referências, comprovantes e trilha; nunca faz DELETE nem cascata. */
export class ArquivamentoPlanejamento1794200000000 implements MigrationInterface {
  name = 'ArquivamentoPlanejamento1794200000000';
  async up(q: QueryRunner): Promise<void> {
    for (const tabela of ['entregaveis', 'evidencias_esperadas']) {
      await q.query(`ALTER TABLE "${tabela}" ADD COLUMN "arquivado_em" timestamptz NULL`);
      await q.query(`ALTER TABLE "${tabela}" ADD COLUMN "arquivado_por" uuid NULL`);
      await q.query(`ALTER TABLE "${tabela}" ADD CONSTRAINT "fk_${tabela}_arquivado_por" FOREIGN KEY ("arquivado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT`);
      await q.query(`ALTER TABLE "${tabela}" ADD CONSTRAINT "ck_${tabela}_arquivo_consistente" CHECK (("arquivado_em" IS NULL) = ("arquivado_por" IS NULL))`);
      await q.query(`CREATE INDEX "idx_${tabela}_arquivado" ON "${tabela}" ("arquivado_em") WHERE "arquivado_em" IS NOT NULL`);
    }
  }
  async down(q: QueryRunner): Promise<void> {
    for (const tabela of ['evidencias_esperadas', 'entregaveis']) {
      await q.query(`DROP INDEX "idx_${tabela}_arquivado"`);
      await q.query(`ALTER TABLE "${tabela}" DROP CONSTRAINT "ck_${tabela}_arquivo_consistente"`);
      await q.query(`ALTER TABLE "${tabela}" DROP CONSTRAINT "fk_${tabela}_arquivado_por"`);
      await q.query(`ALTER TABLE "${tabela}" DROP COLUMN "arquivado_por"`);
      await q.query(`ALTER TABLE "${tabela}" DROP COLUMN "arquivado_em"`);
    }
  }
}
