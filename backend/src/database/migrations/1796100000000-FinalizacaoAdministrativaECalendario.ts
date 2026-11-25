import { MigrationInterface, QueryRunner } from 'typeorm';

/** Decisão pós-PRD: finalização administrativa independente do progresso físico.
 * O modo de visualização pertence à configuração das ocorrências.
 */
export class FinalizacaoAdministrativaECalendario1796100000000 implements MigrationInterface {
  name = 'FinalizacaoAdministrativaECalendario1796100000000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "ocorrencias_status_enum" ADD VALUE IF NOT EXISTS 'PENDENTE_ENCERRAMENTO'`);
    await q.query(`ALTER TYPE "ocorrencias_status_enum" ADD VALUE IF NOT EXISTS 'ENCERRADA'`);
    await q.query(`ALTER TYPE "entregaveis_status_execucao_enum" ADD VALUE IF NOT EXISTS 'PENDENTE_CONCLUSAO'`);
    await q.query(`ALTER TYPE "entregaveis_status_execucao_enum" ADD VALUE IF NOT EXISTS 'PENDENTE_ENCERRAMENTO'`);
    await q.query(`ALTER TYPE "entregaveis_status_execucao_enum" ADD VALUE IF NOT EXISTS 'FINALIZADO'`);
    await q.query(`ALTER TYPE "etapas_status_enum" ADD VALUE IF NOT EXISTS 'FINALIZADA'`);
    await q.query(`ALTER TYPE "contratos_status_enum" ADD VALUE IF NOT EXISTS 'FINALIZADO'`);
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN IF NOT EXISTS "motivo_encerramento" text`);
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN IF NOT EXISTS "encerrada_em" timestamptz`);
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN IF NOT EXISTS "encerrada_por" uuid`);
    await q.query(`ALTER TABLE "entregaveis" ADD COLUMN IF NOT EXISTS "motivo_finalizacao" text`);
    await q.query(`ALTER TABLE "entregaveis" ADD COLUMN IF NOT EXISTS "finalizado_em" timestamptz`);
    await q.query(`ALTER TABLE "configuracoes_ocorrencias" ADD COLUMN IF NOT EXISTS "modo_visualizacao" varchar(12) NOT NULL DEFAULT 'LISTA'`);
    await q.query(`ALTER TABLE "configuracoes_ocorrencias" ADD CONSTRAINT "ck_configuracoes_ocorrencias_modo_visualizacao" CHECK ("modo_visualizacao" IN ('LISTA','CALENDARIO'))`);
    // O Patch 17 permitia rascunhos incompletos. Novas gravações exigem agora
    // quantidade/unidade/periodicidade via validação de domínio. Sem apagar históricos.
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "configuracoes_ocorrencias" DROP CONSTRAINT IF EXISTS "ck_configuracoes_ocorrencias_modo_visualizacao"`);
    await q.query(`ALTER TABLE "configuracoes_ocorrencias" DROP COLUMN IF EXISTS "modo_visualizacao"`);
    await q.query(`ALTER TABLE "entregaveis" DROP COLUMN IF EXISTS "finalizado_em"`);
    await q.query(`ALTER TABLE "entregaveis" DROP COLUMN IF EXISTS "motivo_finalizacao"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN IF EXISTS "encerrada_por"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN IF EXISTS "encerrada_em"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN IF EXISTS "motivo_encerramento"`);
    // PostgreSQL não remove valores de enum por DROP VALUE; manter histórico.
  }
}
