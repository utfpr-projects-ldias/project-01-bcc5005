import { MigrationInterface, QueryRunner } from 'typeorm';

/** Permite nova ocorrência para o mesmo período quando uma versão antiga foi
 * substituída, mantendo a ocorrência e seus vínculos na história imutável. */
export class AgendaRecorrenteHistorica1796300000000 implements MigrationInterface {
  name = 'AgendaRecorrenteHistorica1796300000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_ocorrencias_recorrente_periodo"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_ocorrencias_recorrente_periodo"
      ON "ocorrencias" ("entregavel_id", "periodo_inicio", "periodo_fim")
      WHERE "origem" = 'RECORRENTE' AND "substituida_em" IS NULL`);
  }
  async down(_queryRunner: QueryRunner): Promise<void> {
    // Não restaurar o índice antigo se já existirem versões históricas
    // duplicadas. Reverter seria destrutivo ou falharia durante a migração.
    throw new Error('Reversão automática indisponível após versionamento de períodos.');
  }
}
