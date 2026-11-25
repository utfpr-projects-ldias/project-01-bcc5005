import { jest } from '@jest/globals';
import { comprovanteValidoParaMeta, comprovantesCandidatosMeta } from './comprovante-valido-meta.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const comprovanteId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function manager(resultado: Array<{id: string; titulo?: string}>) {
  const query = jest.fn(async (_sql: string, _args: unknown[]) => resultado);
  return { query };
}

describe('validade documental em metas do Marco', () => {
  it('aprova somente comprovante verificado, atual, com checklist ativo e não reaberto', async () => {
    const m = manager([{ id: comprovanteId }]);
    expect(await comprovanteValidoParaMeta(m as never, contratoId, comprovanteId)).toBe(true);
    const [sql, params] = m.query.mock.calls[0];
    expect(params).toEqual([comprovanteId, contratoId]);
    for (const regra of ["c.status = 'VERIFICADA'", 'c.verificado_em IS NOT NULL',
      'ev.arquivado_em IS NULL', 'ev.reaberto_em IS NULL',
      'nova.evidencia_esperada_id = c.evidencia_esperada_id', '(nova.criado_em, nova.id) > (c.criado_em, c.id)',
      'ev.entregavel_id = c.entregavel_id']) expect(sql).toContain(regra);
  });
  it('não conta comprovante que já não satisfaz os critérios SQL', async () => {
    const m = manager([]);
    expect(await comprovanteValidoParaMeta(m as never, contratoId, comprovanteId)).toBe(false);
  });
  it('listagem de candidatos tem os mesmos critérios da aprovação', async () => {
    const m = manager([{ id: comprovanteId, titulo: 'Relatório conferido' }]);
    expect(await comprovantesCandidatosMeta(m as never, contratoId)).toEqual([{ id: comprovanteId, titulo: 'Relatório conferido' }]);
    const [sql, params] = m.query.mock.calls[0];
    expect(params).toEqual([contratoId]);
    for (const regra of ["c.status = 'VERIFICADA'", 'c.verificado_em IS NOT NULL',
      'ev.arquivado_em IS NULL', 'ev.reaberto_em IS NULL',
      '(nova.criado_em, nova.id) > (c.criado_em, c.id)']) expect(sql).toContain(regra);
  });
});
