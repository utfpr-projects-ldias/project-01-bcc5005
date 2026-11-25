import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adiciona a etapa de solicitação ao fluxo HU08 sem reescrever as atividades existentes. */
export class SolicitacaoConclusaoAtividades1796400000000 implements MigrationInterface {
  name = 'SolicitacaoConclusaoAtividades1796400000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "atividades" DROP CONSTRAINT IF EXISTS "ck_hu08_atividade_status"`);
    await q.query(`ALTER TABLE "atividades" ADD CONSTRAINT "ck_hu08_atividade_status"
      CHECK ("status" IN ('REGISTRADA','PENDENTE_CONCLUSAO','VERIFICADA','ARQUIVADA'))`);
  }
  async down(q: QueryRunner): Promise<void> {
    const pendentes: Array<{ total: string }> = await q.query(`SELECT COUNT(*)::text AS total FROM "atividades" WHERE "status" = 'PENDENTE_CONCLUSAO'`);
    if (Number(pendentes[0]?.total ?? 0) > 0)
      throw new Error('Não é possível reverter enquanto existirem atividades com conclusão pendente.');
    await q.query(`ALTER TABLE "atividades" DROP CONSTRAINT IF EXISTS "ck_hu08_atividade_status"`);
    await q.query(`ALTER TABLE "atividades" ADD CONSTRAINT "ck_hu08_atividade_status"
      CHECK ("status" IN ('REGISTRADA','VERIFICADA','ARQUIVADA'))`);
  }
}
