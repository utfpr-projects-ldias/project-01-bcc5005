import { jest } from '@jest/globals';
import { aptidaoFisicaParaConclusao } from './conclusao-fisica.js';
import { TipoEntregavel } from './tipo-entregavel.enum.js';

const entregavel = {
  contratoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  tipo: TipoEntregavel.CONTINUO,
  terminoPrevisto: '2026-11-23', percentualExecucao: '100',
};
const manager = { findBy: jest.fn(async () => [{ status:'CONCLUIDO' }]) };

describe('conclusão contínua usa dia civil do contrato', () => {
  afterEach(() => jest.useRealTimers());
  it('não libera conclusão antes da meia-noite de Brasília mesmo se já for outro dia UTC', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-23T02:59:59Z'));
    const resultado = await aptidaoFisicaParaConclusao(manager as never, entregavel as never);
    expect(resultado.apto).toBe(false);
    expect(resultado.motivo).toMatch(/término previsto/);
  });
  it('libera avaliação ao chegar a data local prevista', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-23T03:00:00Z'));
    const resultado = await aptidaoFisicaParaConclusao(manager as never, entregavel as never);
    expect(resultado.apto).toBe(true);
  });
});
