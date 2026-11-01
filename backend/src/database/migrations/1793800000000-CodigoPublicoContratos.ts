import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Identificador de apresentação; preserva UUID, FKs, vínculos e auditoria. */
export class CodigoPublicoContratos1793800000000 implements MigrationInterface {
  name = 'CodigoPublicoContratos1793800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Falha ANTES de atribuir, sem descartar contratos existentes.
    await queryRunner.query(`
      DO $$ BEGIN
        IF (SELECT count(*) FROM contratos) > 100000 THEN
          RAISE EXCEPTION 'Limite de 100000 códigos públicos de contrato excedido';
        END IF;
      END $$;
    `);
    await queryRunner.query('ALTER TABLE "contratos" ADD COLUMN "codigo_publico" varchar(5)');
    // Backfill aleatório sem colisões, inclusive em uma base já populada.
    await queryRunner.query(`
      WITH contratos_ordenados AS (
        SELECT id, row_number() OVER (ORDER BY random(), id) AS pos FROM contratos
      ), codigos_ordenados AS (
        SELECT lpad(n::text, 5, '0') AS codigo,
               row_number() OVER (ORDER BY random(), n) AS pos
        FROM generate_series(0, 99999) AS g(n)
      )
      UPDATE contratos AS c SET codigo_publico = codigos_ordenados.codigo
      FROM contratos_ordenados, codigos_ordenados
      WHERE c.id = contratos_ordenados.id
        AND contratos_ordenados.pos = codigos_ordenados.pos
    `);
    await queryRunner.query('ALTER TABLE "contratos" ALTER COLUMN "codigo_publico" SET NOT NULL');
    await queryRunner.query(`
      ALTER TABLE "contratos" ADD CONSTRAINT "ck_contratos_codigo_publico"
      CHECK (codigo_publico ~ '^[0-9]{5}$')
    `);
    await queryRunner.query(`
      ALTER TABLE "contratos" ADD CONSTRAINT "uq_contratos_codigo_publico"
      UNIQUE ("codigo_publico")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback de schema não altera registros nem UUIDs; perde somente o novo código.
    await queryRunner.query('ALTER TABLE "contratos" DROP CONSTRAINT "uq_contratos_codigo_publico"');
    await queryRunner.query('ALTER TABLE "contratos" DROP CONSTRAINT "ck_contratos_codigo_publico"');
    await queryRunner.query('ALTER TABLE "contratos" DROP COLUMN "codigo_publico"');
  }
}
