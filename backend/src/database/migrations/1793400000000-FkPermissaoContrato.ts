import type { MigrationInterface, QueryRunner } from 'typeorm';

/** TEC07-AJUSTES-01: adiciona FK sem reescrever migrations já aplicadas. */
export class FkPermissaoContrato1793400000000 implements MigrationInterface {
  name = 'FkPermissaoContrato1793400000000';
  async up(q: QueryRunner): Promise<void> {
    const [resultado] = await q.query(`
      SELECT COUNT(*)::int AS total FROM permissoes_contrato p
      LEFT JOIN contratos c ON c.id = p.contrato_id WHERE c.id IS NULL
    `) as Array<{total: number}>;
    if (Number(resultado.total) > 0) {
      throw new Error('Migration não aplicada: permissões órfãs existentes. Investigar sem remover registros.');
    }
    await q.query(`ALTER TABLE "permissoes_contrato" ADD CONSTRAINT "fk_permissoes_contrato_contrato"
      FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE RESTRICT`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE "permissoes_contrato" DROP CONSTRAINT "fk_permissoes_contrato_contrato"');
  }
}
