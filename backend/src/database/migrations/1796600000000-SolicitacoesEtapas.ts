import { MigrationInterface, QueryRunner } from 'typeorm';

/** Pendências administrativas explícitas da etapa; não convertem execução em conclusão. */
export class SolicitacoesEtapas1796600000000 implements MigrationInterface {
  name = 'SolicitacoesEtapas1796600000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "etapas" ADD COLUMN "conclusao_solicitada_em" timestamptz NULL`);
    await q.query(`ALTER TABLE "etapas" ADD COLUMN "conclusao_solicitada_por" uuid NULL`);
    await q.query(`ALTER TABLE "etapas" ADD COLUMN "encerramento_solicitado_em" timestamptz NULL`);
    await q.query(`ALTER TABLE "etapas" ADD COLUMN "encerramento_solicitado_por" uuid NULL`);
    await q.query(`ALTER TABLE "etapas" ADD COLUMN "encerramento_motivo" varchar(200) NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    const linhas: Array<{total:string}> = await q.query(`SELECT COUNT(*)::text AS total FROM "etapas" WHERE "conclusao_solicitada_em" IS NOT NULL OR "encerramento_solicitado_em" IS NOT NULL`);
    if (Number(linhas[0]?.total ?? 0)>0) throw new Error('Há solicitações de etapas; o histórico não pode ser descartado.');
    await q.query(`ALTER TABLE "etapas" DROP COLUMN "encerramento_motivo"`);
    await q.query(`ALTER TABLE "etapas" DROP COLUMN "encerramento_solicitado_por"`);
    await q.query(`ALTER TABLE "etapas" DROP COLUMN "encerramento_solicitado_em"`);
    await q.query(`ALTER TABLE "etapas" DROP COLUMN "conclusao_solicitada_por"`);
    await q.query(`ALTER TABLE "etapas" DROP COLUMN "conclusao_solicitada_em"`);
  }
}
