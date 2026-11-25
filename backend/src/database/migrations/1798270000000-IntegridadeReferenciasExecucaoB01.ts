import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A referência de comprovação não é nova execução. A origem precisa ser uma
 * contribuição real do mesmo contrato, entregável e ocorrência (ou ambas diretas).
 * Colunas derivadas privadas permitem que o próprio FK proteja INSERT e UPDATE,
 * inclusive a alteração concorrente do alvo, sem trigger de verificação sujeito a corrida. */
export class IntegridadeReferenciasExecucaoB011798270000000 implements MigrationInterface {
  name = 'IntegridadeReferenciasExecucaoB011798270000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE execucoes_entregavel
      ADD COLUMN escopo_referencia_b01 text GENERATED ALWAYS AS (COALESCE(ocorrencia_id::text, 'DIRETA')) STORED,
      ADD COLUMN escopo_origem_b01 text GENERATED ALWAYS AS (CASE WHEN referencia_id IS NULL THEN COALESCE(ocorrencia_id::text, 'DIRETA') ELSE NULL END) STORED,
      ADD CONSTRAINT uq_b01_execucao_origem_escopo UNIQUE (id,contrato_id,entregavel_id,escopo_origem_b01)`);
    await q.query(`ALTER TABLE execucoes_entregavel DROP CONSTRAINT fk_execucoes_referencia,
      ADD CONSTRAINT fk_execucoes_referencia FOREIGN KEY (referencia_id,contrato_id,entregavel_id,escopo_referencia_b01)
      REFERENCES execucoes_entregavel(id,contrato_id,entregavel_id,escopo_origem_b01) ON DELETE RESTRICT`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE execucoes_entregavel DROP CONSTRAINT fk_execucoes_referencia,
      ADD CONSTRAINT fk_execucoes_referencia FOREIGN KEY (referencia_id,contrato_id,entregavel_id)
      REFERENCES execucoes_entregavel(id,contrato_id,entregavel_id) ON DELETE RESTRICT,
      DROP CONSTRAINT uq_b01_execucao_origem_escopo, DROP COLUMN escopo_origem_b01, DROP COLUMN escopo_referencia_b01`);
  }
}
