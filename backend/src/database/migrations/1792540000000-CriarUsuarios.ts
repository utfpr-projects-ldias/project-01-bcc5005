import type { MigrationInterface, QueryRunner } from 'typeorm';

/** TEC07-01: extensão do domínio, sem alterar as tabelas do SuperTokens (st_*). */
export class CriarUsuarios1792540000000 implements MigrationInterface {
  name = 'CriarUsuarios1792540000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "usuarios_perfil_enum" AS ENUM (
        'ADMINISTRADOR', 'GESTOR', 'COLABORADOR'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "usuarios" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "supertokens_user_id" varchar(255) NOT NULL,
        "email" varchar(320) NOT NULL,
        "perfil" "usuarios_perfil_enum" NOT NULL,
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_usuarios" PRIMARY KEY ("id"),
        CONSTRAINT "uq_usuarios_supertokens_user_id" UNIQUE ("supertokens_user_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_usuarios_email" ON "usuarios" ("email")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_usuarios_email"`);
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(`DROP TYPE "usuarios_perfil_enum"`);
  }
}
