import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RastreabilidadeMedicaoB071798280000000 implements MigrationInterface {
  name = 'RastreabilidadeMedicaoB071798280000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ocorrencias ADD COLUMN origem_medicao_aprovada varchar(16),
      ADD CONSTRAINT ck_b07_origem_medicao CHECK (origem_medicao_aprovada IN ('DECLARACAO','REGISTROS'))`);
    await q.query(`ALTER TABLE execucoes_entregavel ADD COLUMN pedido_original jsonb,
      ADD CONSTRAINT ck_b07_parcela_pedido CHECK (pedido_original IS NULL OR jsonb_typeof(pedido_original)='object')`);
    await q.query(`ALTER TABLE execucoes_quantitativas_diretas ADD COLUMN pedido_original jsonb,
      ADD CONSTRAINT ck_b07_direta_pedido CHECK (pedido_original IS NULL OR jsonb_typeof(pedido_original)='object')`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE execucoes_quantitativas_diretas DROP COLUMN pedido_original');
    await q.query('ALTER TABLE execucoes_entregavel DROP COLUMN pedido_original');
    await q.query('ALTER TABLE ocorrencias DROP COLUMN origem_medicao_aprovada');
  }
}
