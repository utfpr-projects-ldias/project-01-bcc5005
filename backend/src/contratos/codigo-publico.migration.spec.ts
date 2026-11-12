import { jest } from '@jest/globals';
import { CodigoPublicoContratos1793800000000 } from '../database/migrations/1793800000000-CodigoPublicoContratos.js';
import type { QueryRunner } from 'typeorm';

test('migration aditiva preserva UUID, backfill, UNIQUE, CHECK e down reversível', async () => {
  const query = jest.fn<(_s: string) => Promise<unknown>>().mockResolvedValue(undefined);
  const runner = { query } as unknown as QueryRunner;
  const migration = new CodigoPublicoContratos1793800000000();
  await migration.up(runner);
  const sql = query.mock.calls.map(([s]) => s).join('\n');
  expect(sql).toContain('codigo_publico');
  expect(sql).toContain('generate_series(0, 99999)');
  expect(sql).toContain('ORDER BY random()');
  expect(sql).toContain('uq_contratos_codigo_publico');
  expect(sql).toContain('ck_contratos_codigo_publico');
  expect(sql).not.toContain('DROP TABLE');
  query.mockClear();
  await migration.down(runner);
  expect(query.mock.calls.map(([s]) => s).join('\n')).toContain('DROP COLUMN "codigo_publico"');
});
