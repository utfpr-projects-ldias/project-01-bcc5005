import { jest } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { criarProntidao, verificarSchema } from './prontidao.js';

function banco(existe: boolean, executadas: string[]) {
  const query = jest.fn<(...args: unknown[]) => Promise<unknown>>()
    .mockResolvedValueOnce([{ existe }]).mockResolvedValueOnce(executadas.map(name => ({ name: `${name}179000000000${name === 'A' ? 1 : name === 'B' ? 2 : 3}`, timestamp: `179000000000${name === 'A' ? 1 : name === 'B' ? 2 : 3}` })));
  const db = { isInitialized: true, migrations: [{ name: 'A1790000000001' }, { name: 'B1790000000002' }], query } as unknown as DataSource;
  return { db, query };
}

describe('prontidão da API', () => {
  it('não cria a tabela de migrations se ausente', async () => {
    const { db, query } = banco(false, []);
    expect(await verificarSchema(db)).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it.each([{ executadas: ['A'] }, { executadas: ['A', 'C'] }, { executadas: ['A', 'B', 'B'] }])('bloqueia histórico incompatível ($executadas)', async ({ executadas }) => {
    expect(await verificarSchema(banco(true, executadas).db)).toBe(false);
  });
  it('compartilha a consulta e só libera após ambas as dependências', async () => {
    const { db, query } = banco(true, ['A', 'B']);
    const identidade = jest.fn(async () => true);
    const pronta = criarProntidao(db, identidade);
    expect(await Promise.all([pronta(), pronta()])).toEqual([true, true]);
    expect(identidade).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(await pronta()).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('bloqueia a API se a identidade está indisponível', async () => {
    const pronta = criarProntidao(banco(true, ['A', 'B']).db, async () => false);
    expect(await pronta()).toBe(false);
  });
});
