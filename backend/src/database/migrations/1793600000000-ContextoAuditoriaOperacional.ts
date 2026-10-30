import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TEC07-AJUSTES-02-01. Não reescreve eventos históricos e não exige FK:
 * histórico deve continuar disponível mesmo se a entidade raiz deixar de existir.
 */
export class ContextoAuditoriaOperacional1793600000000 implements MigrationInterface {
  name = 'ContextoAuditoriaOperacional1793600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "eventos_auditoria" ADD COLUMN "contrato_id" uuid NULL');
    await queryRunner.query('CREATE INDEX "idx_eventos_auditoria_contrato" ON "eventos_auditoria" ("contrato_id", "registrado_em") WHERE "contrato_id" IS NOT NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_eventos_auditoria_contrato"');
    await queryRunner.query('ALTER TABLE "eventos_auditoria" DROP COLUMN "contrato_id"');
  }
}
