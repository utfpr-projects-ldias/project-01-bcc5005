import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Marcador durável: não guarda senha nem permite retomar automaticamente uma troca de senha. */
export class BloqueioSessoesB021798190000000 implements MigrationInterface {
  name = 'BloqueioSessoesB021798190000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE usuarios ADD COLUMN bloqueio_sessoes_id uuid NULL');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM usuarios WHERE bloqueio_sessoes_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Existem revogações de sessão pendentes; regularize antes de reverter a migration'; END IF; END $$`);
    await q.query('ALTER TABLE usuarios DROP COLUMN bloqueio_sessoes_id');
  }
}
