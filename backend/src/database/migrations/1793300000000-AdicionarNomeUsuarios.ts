import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Nullable para não inventar nomes nem invalidar o Administrador legado. */
export class AdicionarNomeUsuarios1793300000000 implements MigrationInterface {
  name = 'AdicionarNomeUsuarios1793300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "usuarios" ADD COLUMN "nome" varchar(160) NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "usuarios" DROP COLUMN "nome"');
  }
}
