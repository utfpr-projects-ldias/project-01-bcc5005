import type { MigrationInterface, QueryRunner } from 'typeorm';

/** RF-19/20/22: declaração preliminar separada do arquivo e do avanço reconhecido. */
export class RascunhoEnvioEvidencia1798160000000 implements MigrationInterface {
  name = 'RascunhoEnvioEvidencia1798160000000';
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE evidencias_esperadas ADD COLUMN rascunho_envio jsonb
      CHECK (rascunho_envio IS NULL OR jsonb_typeof(rascunho_envio) = 'object')`);
  }
  async down(q: QueryRunner) {
    const [r] = await q.query('SELECT EXISTS(SELECT 1 FROM evidencias_esperadas WHERE rascunho_envio IS NOT NULL) AS possui');
    if (r.possui) throw new Error('Preserve as declarações preliminares antes de reverter a migration.');
    await q.query('ALTER TABLE evidencias_esperadas DROP COLUMN rascunho_envio');
  }
}
