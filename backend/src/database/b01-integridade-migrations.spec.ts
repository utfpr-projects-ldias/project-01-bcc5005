import { describe, expect, it, jest } from '@jest/globals';
import type { QueryRunner } from 'typeorm';
import { PrepararUuidOsspMetasMarco1797250000000 } from './migrations/1797250000000-PrepararUuidOsspMetasMarco.js';
import { CorrigirDisparoModoOcorrencias1797400000000 } from './migrations/1797400000000-CorrigirDisparoModoOcorrencias.js';

describe('B01 — migrations incrementais de integridade', () => {
  it('prepara uuid-ossp antes do DDL histórico de metas sem mudar seus dados', async () => {
    const query = jest.fn(async (_sql: string) => []);
    await new PrepararUuidOsspMetasMarco1797250000000().up({ query } as unknown as QueryRunner);
    const comandos = query.mock.calls.map(([sql]) => sql);
    expect(comandos[0]).toContain('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    expect(comandos[1]).toContain("to_regprocedure('uuid_generate_v4()')");
    expect(comandos.join(' ')).not.toMatch(/DROP\s+EXTENSION|UPDATE\s+"metas_marco"/i);
    expect(1797250000000).toBeLessThan(1797300000000);
  });

  it('inclui modo_registro no disparo de validação de ocorrência', async () => {
    const query = jest.fn(async (_sql: string) => []);
    await new CorrigirDisparoModoOcorrencias1797400000000().up({ query } as unknown as QueryRunner);
    const comandos = query.mock.calls.map(([sql]) => sql);
    expect(comandos[0]).toContain('RAISE NOTICE');
    expect(comandos[0]).toContain('MANUAL_QUANTITATIVA');
    expect(comandos[0]).toContain('MANUAL_DESCRITIVA');
    expect(comandos[1]).toContain('DROP TRIGGER "trg_ocorrencias_validar_origem"');
    expect(comandos[2]).toMatch(/BEFORE INSERT OR UPDATE OF[\s\S]*"modo_registro"/);
    expect(comandos[2]).toContain('fn_ocorrencias_validar_origem_hu09');
    expect(comandos.join(' ')).not.toMatch(/DELETE\s+FROM\s+"ocorrencias"/i);
  });

  it('reversão da correção de trigger restaura o disparo antigo, sem apagar dados', async () => {
    const query = jest.fn(async (_sql: string) => []);
    await new CorrigirDisparoModoOcorrencias1797400000000().down({ query } as unknown as QueryRunner);
    const comandos = query.mock.calls.map(([sql]) => sql);
    expect(comandos[1]).toMatch(/BEFORE INSERT OR UPDATE OF[\s\S]*"origem"/);
    expect(comandos[1]).not.toContain('"modo_registro"');
  });
});
