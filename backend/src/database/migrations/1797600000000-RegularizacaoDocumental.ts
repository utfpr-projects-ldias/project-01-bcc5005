import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RegularizacaoDocumental1797600000000 implements MigrationInterface {
  name = 'RegularizacaoDocumental1797600000000';
  async up(q: QueryRunner): Promise<void> {
    for (const tabela of ['entregaveis', 'ocorrencias']) {
      await q.query(`ALTER TABLE ${tabela} ADD COLUMN regularizacao_documental_solicitada boolean NOT NULL DEFAULT false`);
    }
    await q.query(`ALTER TABLE entregaveis ADD CONSTRAINT ck_entregavel_regularizacao_documental CHECK (NOT regularizacao_documental_solicitada OR status_execucao = 'CONCLUIDO_PARCIALMENTE')`);
    await q.query(`ALTER TABLE ocorrencias ADD CONSTRAINT ck_ocorrencia_regularizacao_documental CHECK (NOT regularizacao_documental_solicitada OR status = 'CONCLUIDO_PARCIALMENTE')`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE ocorrencias DROP CONSTRAINT ck_ocorrencia_regularizacao_documental, DROP COLUMN regularizacao_documental_solicitada');
    await q.query('ALTER TABLE entregaveis DROP CONSTRAINT ck_entregavel_regularizacao_documental, DROP COLUMN regularizacao_documental_solicitada');
  }
}
