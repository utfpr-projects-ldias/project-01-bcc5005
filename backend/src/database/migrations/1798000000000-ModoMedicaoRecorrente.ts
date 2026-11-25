import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModoMedicaoRecorrente1798000000000 implements MigrationInterface {
  name = 'ModoMedicaoRecorrente1798000000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "entregaveis" DROP CONSTRAINT "ck_entregaveis_recorrencia"`);
    await q.query(`ALTER TABLE "entregaveis" ADD CONSTRAINT "ck_entregaveis_recorrencia" CHECK (("tipo" = 'RECORRENTE' AND (("periodicidade" IS NULL AND "configuracao_periodicidade" IS NULL) OR ("periodicidade" IS NOT NULL AND "configuracao_periodicidade" IN ('{"versao":1}'::jsonb, '{"versao":1,"modoRegistro":"DESCRITIVO"}'::jsonb, '{"versao":1,"modoRegistro":"QUANTITATIVO"}'::jsonb)))) OR ("tipo" <> 'RECORRENTE' AND "periodicidade" IS NULL AND "configuracao_periodicidade" IS NULL))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "entregaveis" SET "configuracao_periodicidade" = '{"versao":1}'::jsonb WHERE "configuracao_periodicidade" ? 'modoRegistro'`);
    await q.query(`ALTER TABLE "entregaveis" DROP CONSTRAINT "ck_entregaveis_recorrencia"`);
    await q.query(`ALTER TABLE "entregaveis" ADD CONSTRAINT "ck_entregaveis_recorrencia" CHECK (("tipo" = 'RECORRENTE' AND (("periodicidade" IS NULL AND "configuracao_periodicidade" IS NULL) OR ("periodicidade" IS NOT NULL AND "configuracao_periodicidade" = '{"versao":1}'::jsonb))) OR ("tipo" <> 'RECORRENTE' AND "periodicidade" IS NULL AND "configuracao_periodicidade" IS NULL))`);
  }
}
