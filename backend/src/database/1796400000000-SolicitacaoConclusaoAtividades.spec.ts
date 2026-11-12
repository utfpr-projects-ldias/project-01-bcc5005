import { jest } from '@jest/globals';
import { SolicitacaoConclusaoAtividades1796400000000 } from './migrations/1796400000000-SolicitacaoConclusaoAtividades.js';

describe('HU08 — migration de solicitação de conclusão', () => {
  it('aceita PENDENTE_CONCLUSAO sem excluir os estados antigos', async () => {
    const query = jest.fn(async (_sql: string) => []);
    await new SolicitacaoConclusaoAtividades1796400000000().up({ query } as never);
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1]?.[0])).toContain("'PENDENTE_CONCLUSAO'");
    expect(String(query.mock.calls[1]?.[0])).toContain("'VERIFICADA'");
  });
  it('recusa rollback de solicitação ainda pendente', async () => {
    const query = jest.fn(async (_sql: string) => [{ total: '1' }]);
    await expect(new SolicitacaoConclusaoAtividades1796400000000().down({ query } as never)).rejects.toThrow(/Não é possível reverter/);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
