import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Mantém lançamentos antigos reconhecidos; novos registros têm decisão explícita. */
export class RevisaoLancamentosQuantitativos1797800000000 implements MigrationInterface {
  name = 'RevisaoLancamentosQuantitativos1797800000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ocorrencia_lancamentos
      ADD COLUMN status_execucao varchar(12) NOT NULL DEFAULT 'APROVADO',
      ADD COLUMN data_execucao date,
      ADD COLUMN observacao varchar(300),
      ADD COLUMN decidido_por uuid,
      ADD COLUMN decidido_em timestamptz,
      ADD CONSTRAINT ck_lancamento_status_r48 CHECK (status_execucao IN ('PENDENTE','APROVADO','REJEITADO'))`);
    await q.query(`ALTER TABLE atividade_ocorrencia_medicoes ADD COLUMN referencia_execucao varchar(100), ADD CONSTRAINT ck_medicao_referencia_r48 CHECK (referencia_execucao IS NULL OR quantidade=0)`);
    await q.query(`UPDATE ocorrencia_lancamentos SET data_execucao=(criado_em AT TIME ZONE 'America/Sao_Paulo')::date`);
    await q.query(`ALTER TABLE ocorrencia_lancamentos ALTER COLUMN data_execucao SET NOT NULL,
      ALTER COLUMN data_execucao SET DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
      ALTER COLUMN status_execucao SET DEFAULT 'PENDENTE'`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [{total}] = await q.query(`SELECT count(*)::int AS total FROM ocorrencia_lancamentos WHERE status_execucao<>'APROVADO' OR decidido_em IS NOT NULL OR observacao IS NOT NULL`);
    const [{referencias}] = await q.query(`SELECT count(*)::int AS referencias FROM atividade_ocorrencia_medicoes WHERE referencia_execucao IS NOT NULL`);
    if (total || referencias) throw new Error('A reversão eliminaria decisões ou observações de execução.');
    await q.query(`ALTER TABLE atividade_ocorrencia_medicoes DROP CONSTRAINT ck_medicao_referencia_r48, DROP COLUMN referencia_execucao`);
    await q.query(`ALTER TABLE ocorrencia_lancamentos DROP CONSTRAINT ck_lancamento_status_r48,
      DROP COLUMN status_execucao, DROP COLUMN data_execucao, DROP COLUMN observacao, DROP COLUMN decidido_por, DROP COLUMN decidido_em`);
  }
}
