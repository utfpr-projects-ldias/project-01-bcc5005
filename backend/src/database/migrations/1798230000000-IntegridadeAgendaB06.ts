import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Intervalos civis inclusivos: versões históricas podem coexistir, mas
 * dois períodos ativos de uma mesma série nunca podem ocupar o mesmo dia.
 * A constraint valida também os dados existentes, sem reescrevê-los. */
export class IntegridadeAgendaB061798230000000 implements MigrationInterface {
  name = 'IntegridadeAgendaB061798230000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await q.query(`ALTER TABLE ocorrencias ADD CONSTRAINT ex_b06_agenda_sem_sobreposicao
      EXCLUDE USING gist (entregavel_id WITH =, daterange(periodo_inicio,periodo_fim,'[]') WITH &&)
      WHERE (origem='RECORRENTE' AND substituida_em IS NULL)`);
    await q.query(`CREATE INDEX idx_b06_ocorrencias_inicio_previsto ON ocorrencias(contrato_id,periodo_inicio,id)
      WHERE substituida_em IS NULL AND status='NAO_INICIADO' AND periodo_inicio IS NOT NULL`);
    await q.query(`CREATE INDEX idx_b06_ocorrencias_data_prevista ON ocorrencias(contrato_id,data_prevista,id)
      WHERE substituida_em IS NULL AND status='NAO_INICIADO' AND periodo_inicio IS NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX idx_b06_ocorrencias_data_prevista');
    await q.query('DROP INDEX idx_b06_ocorrencias_inicio_previsto');
    await q.query('ALTER TABLE ocorrencias DROP CONSTRAINT ex_b06_agenda_sem_sobreposicao');
    // A extensão pode ser utilizada por outras constraints; não removê-la.
  }
}
