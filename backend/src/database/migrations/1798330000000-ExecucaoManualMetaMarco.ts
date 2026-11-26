import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ExecucaoManualMetaMarco1798330000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE UNIQUE INDEX uq_meta_marco_modalidade ON metas_marco(id,contrato_id,tipo)`);
    await q.query(`CREATE TABLE execucoes_metas_marco (
      id uuid PRIMARY KEY, meta_id uuid NOT NULL, contrato_id uuid NOT NULL,
      tipo_meta varchar(12) NOT NULL DEFAULT 'QUANTITATIVA' CHECK (tipo_meta='QUANTITATIVA'),
      quantidade numeric(18,3) NOT NULL CHECK (quantidade > 0), data_execucao date NOT NULL,
      observacao varchar(300), autor_id uuid NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(),
      status varchar(12) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','APROVADO','REJEITADO')),
      decidido_por uuid, decidido_em timestamptz, motivo varchar(300), pedido_original jsonb NOT NULL,
      CONSTRAINT fk_execucao_meta_marco FOREIGN KEY(meta_id,contrato_id,tipo_meta) REFERENCES metas_marco(id,contrato_id,tipo) ON DELETE RESTRICT,
      CONSTRAINT ck_execucao_meta_decisao CHECK ((status='PENDENTE' AND decidido_por IS NULL AND decidido_em IS NULL) OR (status<>'PENDENTE' AND decidido_por IS NOT NULL AND decidido_em IS NOT NULL))
    )`);
    await q.query(`CREATE INDEX idx_execucao_meta_marco ON execucoes_metas_marco(meta_id,contrato_id,status)`);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE execucoes_metas_marco'); await q.query('DROP INDEX uq_meta_marco_modalidade'); }
}
