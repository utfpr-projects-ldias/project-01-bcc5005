import { jest } from '@jest/globals';
import { TravaOrdemEtapasContratos1794500000000 } from './migrations/1794500000000-TravaOrdemEtapasContratos.js';

it('migration aditiva inicializa destravado e não apaga contratos, arquivos ou usuários', async () => {
  const consulta = jest.fn(async (_sql: string) => undefined);
  const migration = new TravaOrdemEtapasContratos1794500000000();
  await migration.up({ query: consulta } as never);
  expect(consulta).toHaveBeenCalledTimes(1);
  expect(consulta).toHaveBeenCalledWith('ALTER TABLE "contratos" ADD COLUMN "ordem_etapas_bloqueada" boolean NOT NULL DEFAULT false');
  expect(consulta.mock.calls[0][0]).not.toMatch(/\b(?:DELETE|TRUNCATE|DROP)\b/i);
});
