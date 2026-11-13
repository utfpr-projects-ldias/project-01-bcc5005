import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Aditiva: não converte encerramentos documentais legados em execução física. */
export class ExecucaoFisicaTEC091795600000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE "entregaveis" ADD COLUMN "data_efetiva_marco" date NULL');
    await q.query('ALTER TABLE "ocorrencias" ADD COLUMN "substituida_em" timestamptz NULL');
    await q.query('ALTER TABLE "entregaveis" ADD COLUMN "agenda_inicio_futuro" date NULL');
    // Um período substituído permanece histórico; reativação preserva o ID original.
  }
  async down(q: QueryRunner): Promise<void> {
    // Recusar rollback destrutivo de fatos físicos/históricos.
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM entregaveis WHERE data_efetiva_marco IS NOT NULL OR agenda_inicio_futuro IS NOT NULL) OR EXISTS (SELECT 1 FROM ocorrencias WHERE substituida_em IS NOT NULL) THEN RAISE EXCEPTION 'TEC09 possui histórico; rollback destrutivo recusado'; END IF; END $$`);
    await q.query('ALTER TABLE "entregaveis" DROP COLUMN "agenda_inicio_futuro"');
    await q.query('ALTER TABLE "ocorrencias" DROP COLUMN "substituida_em"');
    await q.query('ALTER TABLE "entregaveis" DROP COLUMN "data_efetiva_marco"');
  }
}
