import { jest } from '@jest/globals';
import type { QueryRunner } from 'typeorm';
import { SolicitacoesEtapas1796600000000 } from './migrations/1796600000000-SolicitacoesEtapas.js';

/** As solicitações persistem sem converter a fase operacional em CONCLUIDA. */
describe('PATCH35 — solicitações administrativas de etapa', () => {
  it('inclui colunas novas sem reescrever os estados ou apagar registros', async () => {
    const sql: string[] = [];
    const runner = { query: jest.fn(async (query: string) => { sql.push(query); return []; }) } as unknown as QueryRunner;
    const migration = new SolicitacoesEtapas1796600000000();
    expect(migration.name).toBe('SolicitacoesEtapas1796600000000');
    await migration.up(runner);
    expect(sql).toHaveLength(5);
    expect(sql.join(' ')).toContain('conclusao_solicitada_em');
    expect(sql.join(' ')).toContain('encerramento_solicitado_em');
    expect(sql.join(' ')).toContain('encerramento_motivo');
    expect(sql.join(' ')).not.toMatch(/TRUNCATE|DELETE\s+FROM|DROP\s+TABLE|UPDATE\s+"etapas"/i);
  });
  it('reverte apenas quando não há solicitações pendentes', async () => {
    const sql: string[] = [];
    const runner = { query: jest.fn(async (query: string) => { sql.push(query); return query.startsWith('SELECT') ? [{ total:'1' }] : []; }) } as unknown as QueryRunner;
    await expect(new SolicitacoesEtapas1796600000000().down(runner)).rejects.toThrow(/solicitações/);
    expect(sql.some(query => /DROP COLUMN/.test(query))).toBe(false);
  });
});
