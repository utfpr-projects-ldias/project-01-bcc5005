import { jest } from '@jest/globals';
import { atividadesPendentesDeVerificacao, filhosPendentesDeConclusao } from './conclusao-documental.js';
const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const etapaId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const entregavelId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('HU08 — conclusão depende de atividades registradas verificadas', () => {
  it('sem atividades registradas não cria obrigação 0/X', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [{ pendentes: false }]);
    expect(await atividadesPendentesDeVerificacao({ query } as never, contratoId, etapaId, entregavelId)).toBe(false);
    const chamada = query.mock.calls[0];
    expect(chamada?.[0]).toContain("at.status IN ('REGISTRADA', 'PENDENTE_CONCLUSAO')");
    expect(chamada?.[0]).toContain('at."excluidaEm" IS NULL');
    expect(chamada?.[0]).toContain('en.etapa_id = $2');
    expect(chamada?.[1]).toEqual([contratoId, etapaId, entregavelId]);
  });
  it('entregável com atividade ainda registrada não pode concluir', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [{ pendentes: true }]);
    expect(await atividadesPendentesDeVerificacao({ query } as never, contratoId, null, entregavelId)).toBe(true);
  });
  it('a conclusão de etapa considera também atividades registradas', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [{ pendentes: true }]);
    expect(await filhosPendentesDeConclusao({ query } as never, contratoId, etapaId)).toBe(true);
    expect(query.mock.calls[0]?.[0]).toContain("at.status IN ('REGISTRADA', 'PENDENTE_CONCLUSAO')");
  });
});
