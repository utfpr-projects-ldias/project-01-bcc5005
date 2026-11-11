import { jest } from '@jest/globals';

import type { QueryRunner } from 'typeorm';

import { CriarOcorrenciasHU091795300000000 } from './migrations/1795300000000-CriarOcorrenciasHU09.js';

function capturar() {
  const sql: string[] = [];

  const runner = {
    query: jest.fn(async (comando: string) => {
      sql.push(comando);
      return [];
    }),
  } as unknown as QueryRunner;

  return {
    sql,
    runner,
  };
}

function normalizarSql(sql: string): string {
  return sql
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

describe('HU09-01 — migration aditiva de ocorrências', () => {
  it('cria os tipos de origem e status', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().up(runner);

    const ddl = sql.join('\n');

    expect(ddl).toContain('CREATE TYPE "ocorrencias_origem_enum"');

    expect(ddl).toContain('CREATE TYPE "ocorrencias_status_enum"');

    expect(ddl).toContain("'RECORRENTE'");

    expect(ddl).toContain("'MANUAL_QUANTITATIVA'");

    expect(ddl).toContain("'NAO_INICIADO'");

    expect(ddl).toContain("'EM_ANDAMENTO'");

    expect(ddl).toContain("'CONCLUIDO'");
  });

  it('cria ocorrência com FK composta para entregável e contrato', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().up(runner);

    const ddl = sql.join('\n');

    expect(ddl).toContain('CREATE TABLE "ocorrencias"');

    expect(ddl).toContain('FOREIGN KEY ("entregavel_id", "contrato_id")');

    expect(ddl).toContain('REFERENCES "entregaveis" ("id", "contrato_id")');

    expect(ddl).toContain('ON DELETE RESTRICT');

    expect(ddl).toContain('ON UPDATE RESTRICT');

    expect(ddl).toContain("c.conname = 'uq_entregaveis_id_contrato'");
    expect(ddl).toContain('pg_constraint');
    expect(ddl).toContain("c.contype = 'u'");
    expect(ddl).toContain("ARRAY['id', 'contrato_id']::name[]");
    expect(ddl).not.toContain('CREATE UNIQUE INDEX "uq_entregaveis_id_contrato"');

    expect(ddl).toContain('"uq_ocorrencias_id_contrato"');
  });

  it('utiliza datas civis e quantidade NUMERIC', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().up(runner);

    const ddl = sql.join('\n');

    expect(ddl).toContain('"periodo_inicio" date NULL');

    expect(ddl).toContain('"periodo_fim" date NULL');

    expect(ddl).toContain('"data_prevista" date NULL');

    expect(ddl).toContain('"data_realizada" date NULL');

    expect(ddl).toContain('"quantidade_realizada" numeric(18,3) NULL');

    expect(ddl).toContain('"ck_ocorrencias_periodo_datas"');

    expect(ddl).toContain('"ck_ocorrencias_quantidade"');

    expect(ddl).not.toMatch(/\b(?:FLOAT|DOUBLE PRECISION)\b/i);
  });

  it('implementa unicidade parcial somente para ocorrências recorrentes', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().up(runner);

    const ddl = normalizarSql(sql.join('\n'));

    expect(ddl).toContain(
      'CREATE UNIQUE INDEX "uq_ocorrencias_recorrente_periodo"',
    );

    expect(ddl).toContain('ON "ocorrencias" (');

    expect(ddl).toContain('"entregavel_id", "periodo_inicio", "periodo_fim"');

    expect(ddl).toContain(`WHERE "origem" = 'RECORRENTE'`);

    /**
     * A restrição é parcial: MANUAL_QUANTITATIVA
     * não participa da unicidade recorrente.
     */
    expect(ddl).not.toContain(
      `WHERE "origem" IN ('RECORRENTE', 'MANUAL_QUANTITATIVA')`,
    );
  });

  it('impede origem incompatível com o tipo do entregável', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().up(runner);

    const ddl = sql.join('\n');

    expect(ddl).toContain(
      'CREATE OR REPLACE FUNCTION "fn_ocorrencias_validar_origem_hu09"()',
    );

    expect(ddl).toContain("NEW.origem = 'RECORRENTE'");

    expect(ddl).toContain("tipo_entregavel <> 'RECORRENTE'");

    expect(ddl).toContain("NEW.origem = 'MANUAL_QUANTITATIVA'");

    expect(ddl).toContain("tipo_entregavel <> 'QUANTITATIVO'");

    expect(ddl).toContain('CREATE TRIGGER "trg_ocorrencias_validar_origem"');
  });

  it('cria índices de agenda por período, contrato e data prevista', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().up(runner);

    const ddl = normalizarSql(sql.join('\n'));

    expect(ddl).toContain('"idx_ocorrencias_agenda_periodo"');

    expect(ddl).toContain('"idx_ocorrencias_agenda_data_prevista"');

    expect(ddl).toContain('"idx_ocorrencias_entregavel_periodo"');

    expect(ddl).toContain('("contrato_id", "data_prevista", "status")');
  });

  it('adiciona vínculo opcional e compatível com atividades HU08', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().up(runner);

    const ddl = sql.join('\n');

    expect(ddl).toContain('ALTER TABLE "atividades"');

    expect(ddl).toContain('ADD COLUMN "ocorrenciaId" uuid NULL');

    expect(ddl).toContain('FOREIGN KEY ("ocorrenciaId", "contratoId")');

    expect(ddl).toContain('REFERENCES "ocorrencias" ("id", "contrato_id")');

    expect(ddl).toContain('"fk_atividades_ocorrencia_contrato"');

    expect(ddl).toContain('"idx_atividades_ocorrencia"');

    /**
     * Não deve existir preenchimento obrigatório retroativo,
     * exclusão ou atualização das atividades existentes.
     */
    expect(ddl).not.toMatch(
      /\b(?:UPDATE\s+"atividades"|DELETE\s+FROM\s+"atividades"|TRUNCATE)\b/i,
    );
  });

  it('não utiliza cascata destrutiva nas relações operacionais', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().up(runner);

    const ddl = sql.join('\n');

    expect(ddl).toContain('ON DELETE RESTRICT');

    expect(ddl).not.toContain('ON DELETE CASCADE');

    expect(ddl).not.toContain('ON UPDATE CASCADE');
  });

  it('é estritamente aditiva e não elimina registros preexistentes', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().up(runner);

    const ddl = sql.join('\n');

    expect(ddl).toContain('CREATE TABLE "ocorrencias"');

    expect(ddl).toContain('ADD COLUMN "ocorrenciaId" uuid NULL');

    expect(ddl).not.toMatch(/\b(?:TRUNCATE|DELETE FROM)\b/i);

    expect(ddl).not.toMatch(/\bDROP TABLE\b/i);

    expect(sql).toHaveLength(16);
  });

  it('protege ocorrências persistidas durante a reversão', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().down(runner);

    const ddl = sql.join('\n');

    expect(sql[0]).toContain('IF EXISTS');

    expect(sql[0]).toContain('FROM "ocorrencias"');

    expect(sql[0]).toContain('RAISE EXCEPTION');

    expect(ddl).toContain('DROP TABLE "ocorrencias"');

    expect(ddl).toContain('DROP COLUMN "ocorrenciaId"');

    expect(ddl).toContain('DROP TYPE "ocorrencias_status_enum"');

    expect(ddl).toContain('DROP TYPE "ocorrencias_origem_enum"');

    expect(sql).toHaveLength(14);
  });

  it('reverte objetos na ordem de dependência', async () => {
    const { sql, runner } = capturar();

    await new CriarOcorrenciasHU091795300000000().down(runner);

    const indiceFkAtividade = sql.findIndex((comando) =>
      comando.includes('DROP CONSTRAINT "fk_atividades_ocorrencia_contrato"'),
    );

    const indiceColunaAtividade = sql.findIndex((comando) =>
      comando.includes('DROP COLUMN "ocorrenciaId"'),
    );

    const indiceTabelaOcorrencias = sql.findIndex((comando) =>
      comando.includes('DROP TABLE "ocorrencias"'),
    );

    const indiceTipoStatus = sql.findIndex((comando) =>
      comando.includes('DROP TYPE "ocorrencias_status_enum"'),
    );

    // A constraint preexistente é compartilhada com comprovantes documentais.
    // O down() da HU09 jamais deve eliminar sua chave de referência.
    expect(sql.join('\n')).not.toContain('DROP INDEX "uq_entregaveis_id_contrato"');

    expect(indiceFkAtividade).toBeGreaterThan(0);

    expect(indiceColunaAtividade).toBeGreaterThan(indiceFkAtividade);

    expect(indiceTabelaOcorrencias).toBeGreaterThan(indiceColunaAtividade);

    expect(indiceTipoStatus).toBeGreaterThan(indiceTabelaOcorrencias);
  });
});
