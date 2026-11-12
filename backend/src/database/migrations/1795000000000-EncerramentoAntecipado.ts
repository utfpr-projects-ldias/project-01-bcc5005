import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Extensão explícita ao PRD: ENCERRADO não significa CONCLUIDO. */
export class EncerramentoAntecipado1795000000000 implements MigrationInterface {
  name = 'EncerramentoAntecipado1795000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "contratos_status_enum" ADD VALUE IF NOT EXISTS 'ENCERRADO'`);
    await queryRunner.query(`ALTER TABLE "contratos" ADD COLUMN "encerrado_em" timestamptz`);
    await queryRunner.query(`ALTER TABLE "contratos" ADD COLUMN "encerrado_por" uuid`);
    await queryRunner.query(`ALTER TABLE "contratos" ADD COLUMN "motivo_encerramento" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "contratos" ADD CONSTRAINT "fk_contratos_encerrado_por"
      FOREIGN KEY ("encerrado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL`);
  }

  async down(): Promise<void> {
    // PostgreSQL não oferece DROP VALUE em enums. Reverter o enum exigiria
    // recriar o tipo, coordenar todas as referências e preservar o histórico.
    throw new Error('Migração de encerramento é aditiva e não possui rollback automático seguro; restaure backup em ambiente de recuperação.');
  }
}
