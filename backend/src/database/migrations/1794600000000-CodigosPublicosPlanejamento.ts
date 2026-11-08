import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Códigos são identificadores imutáveis; sequence PostgreSQL é segura sob concorrência.
 * Existing contract codes are preserved; next codes start after current maximum.
 * Gaps are expected if a transaction fails or an item is deleted.
 */
export class CodigosPublicosPlanejamento1794600000000 implements MigrationInterface {
  name = 'CodigosPublicosPlanejamento1794600000000';
  async up(q: QueryRunner): Promise<void> {
    for (const [tabela, seq] of [
      ['etapas', 'seq_etapas_codigo_publico'],
      ['entregaveis', 'seq_entregaveis_codigo_publico'],
      ['evidencias_esperadas', 'seq_evidencias_codigo_publico'],
    ]) {
      await q.query(`CREATE SEQUENCE "${seq}" AS integer START WITH 1 INCREMENT BY 1 NO CYCLE`);
      await q.query(`ALTER TABLE "${tabela}" ADD COLUMN "codigo_publico" integer`);
      await q.query(`WITH numeros AS (
        SELECT id, row_number() OVER (ORDER BY id)::integer AS n FROM "${tabela}"
      ) UPDATE "${tabela}" AS t SET "codigo_publico" = n.n FROM numeros AS n WHERE t.id = n.id`);
      await q.query(`SELECT setval('${seq}', COALESCE((SELECT MAX(codigo_publico) FROM "${tabela}"), 1), (SELECT COUNT(*) > 0 FROM "${tabela}"))`);
      await q.query(`ALTER TABLE "${tabela}" ALTER COLUMN "codigo_publico" SET DEFAULT nextval('${seq}')`);
      await q.query(`ALTER TABLE "${tabela}" ALTER COLUMN "codigo_publico" SET NOT NULL`);
      await q.query(`ALTER TABLE "${tabela}" ADD CONSTRAINT "uq_${tabela}_codigo_publico" UNIQUE ("codigo_publico")`);
    }
    // Existing public contract codes are strings of five digits. Preserve their labels.
    await q.query(`CREATE SEQUENCE seq_contratos_codigo_publico AS integer START WITH 1 INCREMENT BY 1 NO CYCLE`);
    await q.query(`SELECT setval('seq_contratos_codigo_publico',
      COALESCE((SELECT MAX(codigo_publico::integer) FROM contratos), 1),
      (SELECT COUNT(*) > 0 FROM contratos))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP SEQUENCE seq_contratos_codigo_publico');
    for (const [tabela, seq] of [
      ['evidencias_esperadas', 'seq_evidencias_codigo_publico'],
      ['entregaveis', 'seq_entregaveis_codigo_publico'],
      ['etapas', 'seq_etapas_codigo_publico'],
    ]) {
      await q.query(`ALTER TABLE "${tabela}" DROP CONSTRAINT "uq_${tabela}_codigo_publico"`);
      await q.query(`ALTER TABLE "${tabela}" DROP COLUMN "codigo_publico"`);
      await q.query(`DROP SEQUENCE "${seq}"`);
    }
  }
}
