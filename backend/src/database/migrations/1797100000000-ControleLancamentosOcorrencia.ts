import { MigrationInterface, QueryRunner } from 'typeorm';

/** Protege lançamentos individuais e preserva exclusões na auditoria; nunca apaga histórico. */
export class ControleLancamentosOcorrencia1797100000000 implements MigrationInterface {
  name = 'ControleLancamentosOcorrencia1797100000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ocorrencia_lancamentos"
      ADD COLUMN "bloqueado_em" timestamptz NULL,
      ADD COLUMN "bloqueado_por" uuid NULL,
      ADD COLUMN "excluido_em" timestamptz NULL,
      ADD COLUMN "excluido_por" uuid NULL,
      ADD COLUMN "justificativa_exclusao" varchar(25) NULL`);
    await q.query(`CREATE INDEX "idx_ocorrencia_lancamentos_ativos"
      ON "ocorrencia_lancamentos" ("contrato_id", "ocorrencia_id") WHERE "excluido_em" IS NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "idx_ocorrencia_lancamentos_ativos"`);
    for (const nome of ['justificativa_exclusao','excluido_por','excluido_em','bloqueado_por','bloqueado_em'])
      await q.query(`ALTER TABLE "ocorrencia_lancamentos" DROP COLUMN "${nome}"`);
  }
}
