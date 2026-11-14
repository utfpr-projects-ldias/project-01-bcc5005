import { ControleLancamentosOcorrencia1797100000000 } from './migrations/1797100000000-ControleLancamentosOcorrencia.js';

describe('migration aditiva dos lançamentos de ocorrências', () => {
  it('cria bloqueio, exclusão lógica e índice restrito aos lançamentos ativos', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new ControleLancamentosOcorrencia1797100000000().up({ query } as never);
    const sql = query.mock.calls.map(([comando]: [string]) => comando).join(' ');
    expect(sql).toContain('bloqueado_em');
    expect(sql).toContain('excluido_em');
    expect(sql).toContain('justificativa_exclusao');
    expect(sql).toContain('WHERE "excluido_em" IS NULL');
  });
});
