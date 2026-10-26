import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Evento desacoplado das tabelas de usuário e contrato, preservando histórico. */
export class CriarEventosAuditoria1793100000000 implements MigrationInterface {
  name = 'CriarEventosAuditoria1793100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "eventos_auditoria" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ator_supertokens_user_id" varchar(255) NOT NULL,
        "registrado_em" timestamptz NOT NULL DEFAULT now(),
        "acao" varchar(64) NOT NULL,
        "entidade_tipo" varchar(50) NOT NULL,
        "entidade_id" varchar(255) NOT NULL,
        "dados_anteriores" jsonb NULL,
        "dados_posteriores" jsonb NULL,
        CONSTRAINT "pk_eventos_auditoria" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX "idx_eventos_auditoria_entidade" ON "eventos_auditoria" ("entidade_tipo", "entidade_id", "registrado_em")');
    await queryRunner.query('CREATE INDEX "idx_eventos_auditoria_ator" ON "eventos_auditoria" ("ator_supertokens_user_id", "registrado_em")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_eventos_auditoria_ator"');
    await queryRunner.query('DROP INDEX "idx_eventos_auditoria_entidade"');
    await queryRunner.query('DROP TABLE "eventos_auditoria"');
  }
}
