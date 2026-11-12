import { jest } from '@jest/globals';
import type { QueryRunner } from 'typeorm';
import { ContextoAuditoriaOperacional1793600000000 } from '../database/migrations/1793600000000-ContextoAuditoriaOperacional.js';

describe('TEC07-AJUSTES-02-01 - migration de contexto', () => {
  it('cria coluna opcional e índice sem atualizar ou apagar históricos', async () => {
    const query = jest.fn(async (_sql: string) => []);
    const qr = { query } as unknown as QueryRunner;
    await new ContextoAuditoriaOperacional1793600000000().up(qr);
    const sql = query.mock.calls.map((args) => args[0]).join('; ');
    expect(sql).toMatch(/ADD COLUMN "contrato_id" uuid NULL/);
    expect(sql).toMatch(/CREATE INDEX "idx_eventos_auditoria_contrato"/);
    expect(sql).not.toMatch(/UPDATE |DELETE FROM |DROP TABLE /);
  });

  it('down remove somente suas próprias estruturas', async () => {
    const query = jest.fn(async (_sql: string) => []);
    await new ContextoAuditoriaOperacional1793600000000().down({ query } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toMatch(/DROP INDEX "idx_eventos_auditoria_contrato"/);
    expect(query.mock.calls[1][0]).toMatch(/DROP COLUMN "contrato_id"/);
  });
});
