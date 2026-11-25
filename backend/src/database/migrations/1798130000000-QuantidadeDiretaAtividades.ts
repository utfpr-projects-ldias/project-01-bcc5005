import type { MigrationInterface, QueryRunner } from 'typeorm';
export class QuantidadeDiretaAtividades1798130000000 implements MigrationInterface {
  name='QuantidadeDiretaAtividades1798130000000';
  async up(q:QueryRunner) {
    await q.query(`CREATE TABLE atividade_entregavel_medicoes (
      atividade_id uuid NOT NULL REFERENCES atividades(id) ON DELETE CASCADE,
      entregavel_id uuid NOT NULL REFERENCES entregaveis(id) ON DELETE CASCADE,
      contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
      quantidade numeric(18,3) NOT NULL CHECK(quantidade>0),
      PRIMARY KEY(atividade_id,entregavel_id))`);
    await q.query(`CREATE INDEX idx_atividade_entregavel_medicoes_destino ON atividade_entregavel_medicoes(contrato_id,entregavel_id)`);
  }
  async down(q:QueryRunner) {
    const [r]=await q.query(`SELECT EXISTS(SELECT 1 FROM atividade_entregavel_medicoes) AS possui`);
    if(r.possui)throw new Error('Existem medições diretas de atividades; preserve o histórico antes de reverter.');
    await q.query(`DROP TABLE atividade_entregavel_medicoes`);
  }
}
