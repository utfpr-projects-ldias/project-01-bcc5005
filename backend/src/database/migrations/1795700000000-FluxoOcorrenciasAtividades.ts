import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Aditiva: não altera status ou quantidade de registros anteriores. */
export class FluxoOcorrenciasAtividades1795700000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "ocorrencias_status_enum" ADD VALUE IF NOT EXISTS 'PENDENTE_CONCLUSAO'`);
    await q.query(`ALTER TYPE "ocorrencias_status_enum" ADD VALUE IF NOT EXISTS 'EM_REVISAO'`);
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN "meta_quantidade" numeric(18,3) NULL`);
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN "quantidade_aprovada" numeric(18,3) NULL`);
    await q.query(`ALTER TABLE "atividades" ADD COLUMN "quantidade_execucao" numeric(18,3) NULL`);
    await q.query(`ALTER TABLE "ocorrencias" ADD CONSTRAINT "ck_ocorrencias_meta_quantidade" CHECK ("meta_quantidade" IS NULL OR "meta_quantidade" > 0)`);
    await q.query(`ALTER TABLE "atividades" ADD CONSTRAINT "ck_atividades_quantidade_execucao" CHECK ("quantidade_execucao" IS NULL OR "quantidade_execucao" >= 0)`);
    await q.query(`ALTER TABLE "ocorrencias" ADD CONSTRAINT "ck_ocorrencias_quantidade_aprovada" CHECK ("quantidade_aprovada" IS NULL OR "quantidade_aprovada" >= 0)`);
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: Array<{ pendentes: string }> = await q.query(`SELECT COUNT(*)::text AS pendentes FROM "ocorrencias" WHERE "meta_quantidade" IS NOT NULL OR "quantidade_aprovada" IS NOT NULL OR status::text IN ('PENDENTE_CONCLUSAO','EM_REVISAO')`);
    const atividades: Array<{ pendentes: string }> = await q.query(`SELECT COUNT(*)::text AS pendentes FROM "atividades" WHERE "quantidade_execucao" IS NOT NULL`);
    if (Number(rows[0]?.pendentes) > 0 || Number(atividades[0]?.pendentes) > 0) throw new Error('Rollback negado: existem fatos quantitativos que precisam ser preservados');
    await q.query(`ALTER TABLE "atividades" DROP CONSTRAINT "ck_atividades_quantidade_execucao"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP CONSTRAINT "ck_ocorrencias_quantidade_aprovada"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP CONSTRAINT "ck_ocorrencias_meta_quantidade"`);
    await q.query(`ALTER TABLE "atividades" DROP COLUMN "quantidade_execucao"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN "quantidade_aprovada"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN "meta_quantidade"`);
    // Valores ENUM permanecem. Remoção é irreversível com segurança sem recriar o tipo.
  }
}
