import { basename } from 'node:path';
import { arquivosMigrations } from './opcoes-banco.js';
import { migrationsCompletas } from '../../test/migrations-completas.fixture.js';

test('fixture E2E cobre cada migration da aplicação em ordem cronológica', () => {
  const arquivos = arquivosMigrations().map(nome => basename(nome));
  const esperadas = arquivos.map(nome => nome.slice(0, 13));
  const fixture = migrationsCompletas.map(m => m.name.slice(-13));
  expect(esperadas.length).toBeGreaterThan(0);
  expect(new Set(esperadas).size).toBe(esperadas.length);
  expect(fixture).toEqual(esperadas);
  expect(new Set(migrationsCompletas.map(m => m.name)).size).toBe(fixture.length);
});
