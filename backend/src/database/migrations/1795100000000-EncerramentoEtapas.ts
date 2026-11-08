import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Decisão adicional da equipe: encerramento ADMINISTRATIVO não comprova execução. */
export class EncerramentoEtapas1795100000000 implements MigrationInterface {
  name = 'EncerramentoEtapas1795100000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "etapas_status_enum" ADD VALUE IF NOT EXISTS 'ENCERRADA'`);
  }
  async down(): Promise<void> {
    // PostgreSQL não permite excluir valor do enum sem recriar o tipo.
    throw new Error('Migration aditiva: rollback automático inseguro; utilize um backup para recuperação.');
  }
}
