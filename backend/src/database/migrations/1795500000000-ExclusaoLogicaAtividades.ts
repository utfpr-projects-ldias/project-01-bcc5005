import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adição isolada; sem DROP TABLE e sem modificar migrations já aplicadas. */
export class ExclusaoLogicaAtividades1795500000000 implements MigrationInterface {
  name = 'ExclusaoLogicaAtividades1795500000000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE "atividades" ADD COLUMN IF NOT EXISTS "excluidaEm" timestamptz NULL');
    await q.query('CREATE INDEX IF NOT EXISTS "idx_hu08_atividade_ativa" ON "atividades" ("contratoId", "dataHora" DESC) WHERE "excluidaEm" IS NULL');
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX IF EXISTS "idx_hu08_atividade_ativa"');
    await q.query('ALTER TABLE "atividades" DROP COLUMN IF EXISTS "excluidaEm"');
  }
}
