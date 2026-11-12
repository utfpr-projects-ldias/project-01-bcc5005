import { jest } from '@jest/globals';
import type { QueryRunner } from 'typeorm';

import { CriarEtapas1793500000000 } from '../database/migrations/1793500000000-CriarEtapas.js';

function criarCaptura() {
  const sql: string[] = [];
  const runner = {
    query: jest.fn(async (comando: string) => { sql.push(comando); return []; }),
  } as unknown as QueryRunner;
  return { sql, runner };
}

describe('HU06-01 — migration CriarEtapas', () => {
  it('adiciona somente o novo enum, tabela, FK e índices de etapas', async () => {
    const { sql, runner } = criarCaptura();
    await new CriarEtapas1793500000000().up(runner);
    expect(sql).toHaveLength(3);
    const ddl = sql.join('\n');
    expect(ddl).toContain('CREATE TYPE "etapas_status_enum"');
    expect(ddl).toContain('CREATE TABLE "etapas"');
    expect(ddl).toContain('REFERENCES "contratos"("id")');
    expect(ddl).toContain('ON DELETE RESTRICT');
    expect(ddl).toContain('UNIQUE ("contrato_id", "sequencia") DEFERRABLE INITIALLY IMMEDIATE');
    expect(ddl).toContain('CHECK ("sequencia" > 0)');
    expect(ddl).toContain('"termino_previsto" >= "inicio_previsto"');
    expect(ddl).toContain('CREATE INDEX "idx_etapas_contrato_inicio_previsto"');
    expect(ddl).not.toMatch(/DROP TABLE|TRUNCATE|ALTER TABLE "contratos"/);
  });

  it('reverte somente objetos da HU06-01, em ordem inversa', async () => {
    const { sql, runner } = criarCaptura();
    await new CriarEtapas1793500000000().down(runner);
    expect(sql).toEqual([
      'DROP INDEX "idx_etapas_contrato_inicio_previsto"',
      'DROP TABLE "etapas"',
      'DROP TYPE "etapas_status_enum"',
    ]);
  });
});
