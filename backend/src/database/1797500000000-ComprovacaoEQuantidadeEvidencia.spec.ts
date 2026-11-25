import { jest } from '@jest/globals';
import type { QueryRunner } from 'typeorm';
import { ComprovacaoEQuantidadeEvidencia1797500000000 } from './migrations/1797500000000-ComprovacaoEQuantidadeEvidencia.js';

describe('migration R40 de estados e quantidade sem perda de histórico', () => {
  test('cria estados parciais, quantidades e recálculo documental transacional', async () => {
    const sql: string[]=[];
    const runner={ query: jest.fn(async (texto: string) => { sql.push(texto); return []; }) };
    await new ComprovacaoEQuantidadeEvidencia1797500000000().up(runner as unknown as QueryRunner);
    const texto=sql.join('\n');
    expect(texto).toContain('CONCLUIDO_PARCIALMENTE');
    expect(texto).toContain('quantidade_declarada');
    expect(texto).toContain('quantidade_aprovada');
    expect(texto).toContain('fn_recalcular_comprovacao_entregavel');
    expect(texto).toContain("'EVIDENCIA_PARCIAL'");
    expect(texto).toContain('IS DISTINCT FROM');
    expect(texto).not.toMatch(/TRUNCATE|DROP TABLE|UPDATE entregaveis SET status_execucao/i);
  });
  test('reversão não apaga medições nem histórico', async () => {
    const query=jest.fn(async (_sql: string): Promise<unknown[]> => []);
    await expect(new ComprovacaoEQuantidadeEvidencia1797500000000().down({ query } as unknown as QueryRunner)).rejects.toThrow('preservar');
    expect(query).not.toHaveBeenCalled();
    const texto=query.mock.calls.map(([sql]) => sql).join('\n');
    expect(texto).not.toContain('DROP COLUMN');
    expect(texto).not.toContain('DROP TABLE');
  });
});
