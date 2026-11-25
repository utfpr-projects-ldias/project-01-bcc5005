import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SolicitacaoEncerramentoContrato1797900000000 implements MigrationInterface {
  name = 'SolicitacaoEncerramentoContrato1797900000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE contratos ADD COLUMN encerramento_solicitado boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE contratos ADD CONSTRAINT ck_contrato_solicitacao_encerramento CHECK (NOT encerramento_solicitado OR (conclusao_solicitada_em IS NOT NULL AND conclusao_solicitada_por IS NOT NULL AND NOT conclusao_parcial_solicitada AND motivo_encerramento IS NOT NULL AND encerrado_em IS NULL))`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Não converte solicitações pendentes em outro tipo de decisão silenciosamente.
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM contratos WHERE encerramento_solicitado) THEN RAISE EXCEPTION 'Resolva as solicitações de encerramento antes de reverter esta migration'; END IF; END $$`);
    await q.query(`ALTER TABLE contratos DROP CONSTRAINT ck_contrato_solicitacao_encerramento, DROP COLUMN encerramento_solicitado`);
  }
}
