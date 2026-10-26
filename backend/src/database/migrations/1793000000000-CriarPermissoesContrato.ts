import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CriarPermissoesContrato1793000000000 implements MigrationInterface {
  name = 'CriarPermissoesContrato1793000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "permissoes_contrato" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "usuario_id" uuid NOT NULL,
        "contrato_id" uuid NOT NULL,
        "pode_editar" boolean NOT NULL DEFAULT false,
        CONSTRAINT "pk_permissoes_contrato" PRIMARY KEY ("id"),
        CONSTRAINT "uq_permissoes_contrato_usuario_contrato" UNIQUE ("usuario_id", "contrato_id"),
        CONSTRAINT "fk_permissoes_contrato_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query('CREATE INDEX "idx_permissoes_contrato_contrato" ON "permissoes_contrato" ("contrato_id")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_permissoes_contrato_contrato"');
    await queryRunner.query('DROP TABLE "permissoes_contrato"');
  }
}
