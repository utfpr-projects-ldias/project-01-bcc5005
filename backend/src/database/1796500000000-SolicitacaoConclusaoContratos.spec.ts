import type { QueryRunner } from 'typeorm';
import { SolicitacaoConclusaoContratos1796500000000 } from './migrations/1796500000000-SolicitacaoConclusaoContratos.js';

describe('Migration de solicitação contratual', () => {
  it('adiciona os dois atributos opcionais de forma independente da coluna de status', async () => {
    const query = jest.fn(async (_sql: string) => [] as unknown[]);
    await new SolicitacaoConclusaoContratos1796500000000().up({ query } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledTimes(2);
    const sql = query.mock.calls.map(([s]) => s).join(' ');
    expect(sql).toContain('conclusao_solicitada_em');
    expect(sql).toContain('conclusao_solicitada_por');
    expect(sql).not.toContain('DROP TABLE');
  });
});
