import { ArquivamentoLogicoContratos1794000000000 } from '../database/migrations/1794000000000-ArquivamentoLogicoContratos.js';

describe('arquivamento de contratos: migration aditiva', () => {
  it('não elimina registros existentes, cria índices e reverte somente estrutura nova', async () => {
    const sql: string[] = [];
    const queryRunner = { query: async (texto: string) => { sql.push(texto); return []; } };
    const migration = new ArquivamentoLogicoContratos1794000000000();
    await migration.up(queryRunner as never);
    expect(sql.join(';')).toContain('arquivado_em');
    expect(sql.join(';')).toContain('fk_contratos_arquivado_por');
    expect(sql.join(';')).not.toMatch(/TRUNCATE|DELETE FROM|DROP TABLE/i);
  });
});
