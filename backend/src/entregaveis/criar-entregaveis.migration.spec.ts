import { jest } from '@jest/globals';
import type { QueryRunner } from 'typeorm';
import { CriarEntregaveisEvidenciasEsperadas1793700000000 } from '../database/migrations/1793700000000-CriarEntregaveisEvidenciasEsperadas.js';

const capturar = () => {
  const sql: string[] = [];
  const runner = { query: jest.fn(async (comando: string) => { sql.push(comando); return []; }) } as unknown as QueryRunner;
  return { sql, runner };
};

describe('HU07-01 — migration aditiva', () => {
  it('cria FK composta, tabelas, cinco tipos, checklist e índices sem UPDATE/DELETE', async () => {
    const { sql, runner } = capturar();
    await new CriarEntregaveisEvidenciasEsperadas1793700000000().up(runner);
    const ddl = sql.join('\n');
    expect(ddl).toContain('ADD CONSTRAINT "uq_etapas_id_contrato"');
    expect(ddl).toContain('FOREIGN KEY ("etapa_id", "contrato_id")');
    expect(ddl).toContain('REFERENCES "etapas"("id", "contrato_id")');
    expect(ddl).toContain('CREATE TABLE "entregaveis"');
    expect(ddl).toContain('CREATE TABLE "evidencias_esperadas"');
    expect(ddl).toContain('ON DELETE RESTRICT');
    expect(ddl).toContain(`"configuracao_periodicidade" = '{"versao":1}'::jsonb`);
    expect(ddl).toContain('"situacao_comprovacao" "entregaveis_situacao_comprovacao_enum" NULL');
    expect(ddl).toContain('"percentual_execucao" numeric(5,2) NULL');
    expect(ddl).not.toMatch(/\b(?:TRUNCATE|UPDATE|DELETE FROM)\b/i);
    expect(ddl).not.toMatch(/\b(?:valor_financeiro|nota_fiscal|pagamento|empenho)\b/i);
    expect(sql.length).toBe(12);
  });
  it('down remove objetos em ordem de dependência, sem apagar contratos e etapas', async () => {
    const { sql, runner } = capturar();
    await new CriarEntregaveisEvidenciasEsperadas1793700000000().down(runner);
    expect(sql).toHaveLength(12);
    expect(sql.join('\n')).toContain('DROP TABLE "evidencias_esperadas"');
    expect(sql.join('\n')).toContain('DROP TABLE "entregaveis"');
    expect(sql[sql.length - 1]).toBe('ALTER TABLE "etapas" DROP CONSTRAINT "uq_etapas_id_contrato"');
    expect(sql.join('\n')).not.toContain('DROP TABLE "etapas"');
  });
});
