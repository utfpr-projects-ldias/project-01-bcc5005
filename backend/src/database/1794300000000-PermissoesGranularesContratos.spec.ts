import { PermissoesGranularesContratos1794300000000 } from './migrations/1794300000000-PermissoesGranularesContratos.js';

test('migration 15 é aditiva e reversível, sem deletar vínculos', async () => {
  const comandos: string[] = [];
  const q = { query: async (sql: string) => { comandos.push(sql); return []; } };
  const migration = new PermissoesGranularesContratos1794300000000();
  await migration.up(q as never);
  expect(comandos.join('\n')).toMatch(/ADD COLUMN "permissoes_detalhadas" jsonb NULL/);
  expect(comandos.join('\n')).toMatch(/ALTER COLUMN "obrigatoria" SET DEFAULT true/);
  expect(comandos.join('\n')).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/i);
  comandos.length = 0;
  await migration.down(q as never);
  expect(comandos.join('\n')).toContain('DROP COLUMN "permissoes_detalhadas"');
});
