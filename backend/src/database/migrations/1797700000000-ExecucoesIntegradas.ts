import type { MigrationInterface, QueryRunner } from 'typeorm';
export class ExecucoesIntegradas1797700000000 implements MigrationInterface {
  name = 'ExecucoesIntegradas1797700000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE entregaveis ADD COLUMN execucoes_integradas boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE ocorrencias ADD COLUMN execucoes_percentuais boolean NOT NULL DEFAULT false`);
    await q.query(`CREATE TABLE execucoes_entregavel (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), contrato_id uuid NOT NULL, entregavel_id uuid NOT NULL,
      ocorrencia_id uuid, origem varchar(16) NOT NULL CHECK (origem IN ('MANUAL','ATIVIDADE','EVIDENCIA')), origem_id uuid, referencia_id uuid,
      centesimos integer NOT NULL CHECK (centesimos BETWEEN 0 AND 10000),
      centesimos_aprovados integer CHECK (centesimos_aprovados BETWEEN 1 AND centesimos),
      status varchar(12) NOT NULL CHECK (status IN ('PENDENTE','APROVADO','REJEITADO')),
      data_execucao date NOT NULL, observacao varchar(300), autor_id uuid NOT NULL, autor_nome varchar(255) NOT NULL,
      decidido_por uuid, decidido_em timestamptz, criado_em timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT fk_execucoes_entregavel_contrato FOREIGN KEY (entregavel_id,contrato_id) REFERENCES entregaveis(id,contrato_id) ON DELETE RESTRICT,
      CONSTRAINT fk_execucoes_ocorrencia FOREIGN KEY (ocorrencia_id,contrato_id) REFERENCES ocorrencias(id,contrato_id) ON DELETE RESTRICT,
      CONSTRAINT uq_execucoes_escopo UNIQUE(id,contrato_id,entregavel_id),
      CONSTRAINT fk_execucoes_referencia FOREIGN KEY (referencia_id,contrato_id,entregavel_id) REFERENCES execucoes_entregavel(id,contrato_id,entregavel_id) ON DELETE RESTRICT,
      CONSTRAINT ck_execucoes_referencia CHECK ((referencia_id IS NULL AND centesimos>0) OR (referencia_id IS NOT NULL AND centesimos=0 AND origem<>'MANUAL')),
      CONSTRAINT ck_execucoes_origem CHECK ((origem='MANUAL') = (origem_id IS NULL)),
      CONSTRAINT ck_execucoes_decisao CHECK ((decidido_por IS NULL) = (decidido_em IS NULL)),
      CONSTRAINT ck_execucoes_manual CHECK (origem<>'MANUAL' OR ((status='APROVADO')=(centesimos_aprovados IS NOT NULL)))
    )`);
    await q.query(`CREATE INDEX idx_execucoes_entregavel_r47 ON execucoes_entregavel(contrato_id,entregavel_id)`);
    await q.query(`CREATE UNIQUE INDEX uq_execucoes_origem_r47 ON execucoes_entregavel(origem,origem_id) WHERE origem_id IS NOT NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Não apagar lançamentos históricos inadvertidamente durante rollback.
    const [{total}] = await q.query('SELECT count(*)::int AS total FROM execucoes_entregavel');
    if (total) throw new Error('Existem lançamentos integrados; preserve-os antes de reverter a migration.');
    await q.query('DROP TABLE execucoes_entregavel');
    await q.query('ALTER TABLE ocorrencias DROP COLUMN execucoes_percentuais');
    await q.query('ALTER TABLE entregaveis DROP COLUMN execucoes_integradas');
  }
}
