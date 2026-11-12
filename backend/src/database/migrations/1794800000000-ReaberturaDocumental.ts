import { MigrationInterface, QueryRunner } from 'typeorm';
/** Identifica reabertura explícita em todos os níveis, sem misturar com a execução física. */
export class ReaberturaDocumental1794800000000 implements MigrationInterface {
  name = 'ReaberturaDocumental1794800000000';
  public async up(q: QueryRunner): Promise<void> {
    for (const tabela of ['contratos', 'etapas', 'entregaveis', 'evidencias_esperadas']) {
      await q.query(`ALTER TABLE "${tabela}" ADD COLUMN "reaberto_em" timestamptz`);
    }
  }
  public async down(q: QueryRunner): Promise<void> {
    for (const tabela of ['evidencias_esperadas', 'entregaveis', 'etapas', 'contratos']) {
      await q.query(`ALTER TABLE "${tabela}" DROP COLUMN "reaberto_em"`);
    }
  }
}
