import type { MigrationInterface, QueryRunner } from 'typeorm';
/** RF-14/RF-16: lançamentos manuais quantitativos independentes de ocorrência. */
export class QuantidadeDiretaManual1798150000000 implements MigrationInterface {
  name = 'QuantidadeDiretaManual1798150000000';
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE execucoes_quantitativas_diretas (
      id uuid PRIMARY KEY, contrato_id uuid NOT NULL, entregavel_id uuid NOT NULL,
      quantidade numeric(18,3) NOT NULL CHECK (quantidade > 0),
      data_execucao date NOT NULL, observacao varchar(300),
      autor_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      status varchar(12) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','APROVADO','REJEITADO')),
      decidido_por uuid REFERENCES usuarios(id) ON DELETE RESTRICT, decidido_em timestamptz,
      FOREIGN KEY (entregavel_id, contrato_id) REFERENCES entregaveis(id, contrato_id) ON DELETE RESTRICT,
      CHECK ((status='PENDENTE' AND decidido_por IS NULL AND decidido_em IS NULL) OR (status<>'PENDENTE' AND decidido_por IS NOT NULL AND decidido_em IS NOT NULL))
    )`);
    await q.query('CREATE INDEX idx_execucoes_qdiretas_destino ON execucoes_quantitativas_diretas(contrato_id, entregavel_id)');
  }
  async down(q: QueryRunner) {
    const [r] = await q.query('SELECT EXISTS(SELECT 1 FROM execucoes_quantitativas_diretas) AS possui');
    if (r.possui) throw new Error('Preserve os lançamentos manuais antes de reverter.');
    await q.query('DROP TABLE execucoes_quantitativas_diretas');
  }
}
