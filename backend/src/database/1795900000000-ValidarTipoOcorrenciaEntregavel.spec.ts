import { jest, describe, expect, it } from '@jest/globals';
import type { QueryRunner } from 'typeorm';
import { ValidarTipoOcorrenciaEntregavel1795900000000 } from './migrations/1795900000000-ValidarTipoOcorrenciaEntregavel.js';

describe('HU09: compatibilidade do modo de ocorrência com entregável', () => {
  it('protege quantitativo, descritivo e recorrente na trigger de integridade', async () => {
    const query = jest.fn(async (_sql: string) => undefined);
    const runner = { query } as unknown as QueryRunner;
    await new ValidarTipoOcorrenciaEntregavel1795900000000().up(runner);
    const ddl = query.mock.calls.map(chamada => String(chamada[0])).join('\n');
    expect(ddl).toContain("tipo_entregavel <> 'QUANTITATIVO'");
    expect(ddl).toContain("tipo_entregavel IN ('RECORRENTE', 'QUANTITATIVO')");
    expect(ddl).toContain('MANUAL_DESCRITIVA');
    expect(ddl).toContain('MANUAL_QUANTITATIVA');
  });
});
