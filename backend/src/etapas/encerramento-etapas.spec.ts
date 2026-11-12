import { jest } from '@jest/globals';
import type { QueryRunner } from 'typeorm';
import { EncerramentoEtapas1795100000000 } from '../database/migrations/1795100000000-EncerramentoEtapas.js';
import { StatusEtapa } from './status-etapa.enum.js';
import { permissoesEfetivas, ACAO_PERMISSAO } from '../autorizacao/permissoes-granulares.js';

/** Regressão da decisão de domínio: encerrar NÃO equivale a comprovar execução. */
describe('TEC08-03 — encerramento administrativo de etapas', () => {
  it('o status administrativo é diferente da conclusão automática', () => {
    expect(StatusEtapa.ENCERRADA).not.toBe(StatusEtapa.CONCLUIDA);
    expect(Object.values(StatusEtapa)).toContain('ENCERRADA');
  });

  it('a migration apenas adiciona valor, sem resetar ou truncar dados', async () => {
    const sql: string[] = [];
    const runner = { query: jest.fn(async (statement: string) => { sql.push(statement); return []; }) } as unknown as QueryRunner;
    await new EncerramentoEtapas1795100000000().up(runner);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain('ALTER TYPE "etapas_status_enum" ADD VALUE IF NOT EXISTS');
    expect(sql.join(' ')).not.toMatch(/TRUNCATE|DELETE FROM|DROP TABLE|DROP TYPE/);
  });

  it('edição, conclusão, encerramento e reabertura da encerrada não herdam autorizações', () => {
    const padrao = permissoesEfetivas('GESTOR', true, { editarEtapas: true, concluirEtapas: true });
    expect(padrao.encerrarEtapas).toBe(false);
    expect(padrao.reabrirEtapasEncerradas).toBe(false);
    const delegado = permissoesEfetivas('COLABORADOR', false, { encerrarEtapas: true });
    expect(delegado.encerrarEtapas).toBe(true);
    expect(delegado.editarEtapas).toBe(false);
    expect(delegado.reabrirEtapasEncerradas).toBe(false);
    expect(ACAO_PERMISSAO['etapas:encerrar']).toBe('encerrarEtapas');
    expect(ACAO_PERMISSAO['etapas:reabrir-encerrada']).toBe('reabrirEtapasEncerradas');
  });
});
