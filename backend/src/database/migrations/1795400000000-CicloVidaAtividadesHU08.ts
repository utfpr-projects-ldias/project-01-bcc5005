import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Extensão HU08-05-01: nenhuma atividade existente é removida ou recriada. */
export class CicloVidaAtividadesHU081795400000000 implements MigrationInterface {
  name = 'CicloVidaAtividadesHU081795400000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "atividades" ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'REGISTRADA'`);
    await q.query(`ALTER TABLE "atividades" ADD COLUMN IF NOT EXISTS "verificadaEm" timestamptz NULL`);
    await q.query(`ALTER TABLE "atividades" ADD COLUMN IF NOT EXISTS "arquivadaEm" timestamptz NULL`);
    await q.query(`ALTER TABLE "atividades" ADD CONSTRAINT "ck_hu08_atividade_status" CHECK ("status" IN ('REGISTRADA','VERIFICADA','ARQUIVADA'))`);
    await q.query(`CREATE INDEX "idx_hu08_atividade_contrato_status" ON "atividades"("contratoId", "status")`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "idx_hu08_atividade_contrato_status"`);
    await q.query(`ALTER TABLE "atividades" DROP CONSTRAINT IF EXISTS "ck_hu08_atividade_status"`);
    await q.query(`ALTER TABLE "atividades" DROP COLUMN IF EXISTS "arquivadaEm"`);
    await q.query(`ALTER TABLE "atividades" DROP COLUMN IF EXISTS "verificadaEm"`);
    await q.query(`ALTER TABLE "atividades" DROP COLUMN IF EXISTS "status"`);
  }
}
