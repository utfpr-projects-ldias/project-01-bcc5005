import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prepara, antes de 1797300000000-MetasMarco, a função UUID exigida
 * pelo DDL histórico. Não altera a migration já entregue nem dados de domínio.
 * Em banco que já aplicou MetasMarco, a extensão normalmente já existe;
 * a execução tardia desta preparação é idempotente.
 */
export class PrepararUuidOsspMetasMarco1797250000000 implements MigrationInterface {
  name = 'PrepararUuidOsspMetasMarco1797250000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await q.query(`
      DO $$
      BEGIN
        IF to_regprocedure('uuid_generate_v4()') IS NULL THEN
          RAISE EXCEPTION
            'A função uuid_generate_v4() não está visível no search_path da conexão de migrations.';
        END IF;
      END;
      $$
    `);
  }

  // A extensão é potencialmente compartilhada com outras tabelas/sistemas.
  // Reverter esta migration não deve removê-la e invalidar defaults existentes.
  async down(_q: QueryRunner): Promise<void> {}
}
