import { MigrationInterface, QueryRunner } from 'typeorm';

/** Persistência da solicitação; a decisão continua sujeita a aprovação separada. */
export class SolicitacaoConclusaoContratos1796500000000 implements MigrationInterface {
  name = 'SolicitacaoConclusaoContratos1796500000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "contratos" ADD COLUMN "conclusao_solicitada_em" timestamptz NULL`);
    await q.query(`ALTER TABLE "contratos" ADD COLUMN "conclusao_solicitada_por" uuid NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    const registros: Array<{ total: string }> = await q.query(`SELECT COUNT(*)::text AS total FROM "contratos" WHERE "conclusao_solicitada_em" IS NOT NULL`);
    if (Number(registros[0]?.total ?? 0)) throw new Error('Existem solicitações de conclusão que não podem ser descartadas.');
    await q.query(`ALTER TABLE "contratos" DROP COLUMN "conclusao_solicitada_por"`);
    await q.query(`ALTER TABLE "contratos" DROP COLUMN "conclusao_solicitada_em"`);
  }
}
