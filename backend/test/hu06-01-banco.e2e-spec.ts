import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { CriarUsuarios1792540000000 } from '../src/database/migrations/1792540000000-CriarUsuarios.js';
import { CriarPermissoesContrato1793000000000 } from '../src/database/migrations/1793000000000-CriarPermissoesContrato.js';
import { CriarEventosAuditoria1793100000000 } from '../src/database/migrations/1793100000000-CriarEventosAuditoria.js';
import { CriarContratos1793200000000 } from '../src/database/migrations/1793200000000-CriarContratos.js';
import { AdicionarNomeUsuarios1793300000000 } from '../src/database/migrations/1793300000000-AdicionarNomeUsuarios.js';
import { FkPermissaoContrato1793400000000 } from '../src/database/migrations/1793400000000-FkPermissaoContrato.js';
import { CriarEtapas1793500000000 } from '../src/database/migrations/1793500000000-CriarEtapas.js';

/**
 * Este teste altera APENAS um banco descartável cujo nome termina em
 * _hu06_test. Nunca usar DATABASE_URL de desenvolvimento/produção.
 *
 * Rodar com HU06_TEST_DATABASE_URL="postgresql://.../app_hu06_test"
 * npm run test:e2e -- --runInBand hu06-01-banco
 */
const testUrl = process.env.HU06_TEST_DATABASE_URL;
const describeNoBanco = testUrl ? describe : describe.skip;
const MIGRATIONS = [
  CriarUsuarios1792540000000,
  CriarPermissoesContrato1793000000000,
  CriarEventosAuditoria1793100000000,
  CriarContratos1793200000000,
  AdicionarNomeUsuarios1793300000000,
  FkPermissaoContrato1793400000000,
  CriarEtapas1793500000000,
];

describeNoBanco('HU06-01 — integração PostgreSQL isolada', () => {
  let ds: DataSource;
  let contratoId: string;
  let primeiraId: string;
  let segundaId: string;

  const abrir = async () => {
    if (!testUrl) throw new Error('HU06_TEST_DATABASE_URL obrigatória.');
    const nomeBanco = decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ''));
    if (!nomeBanco.endsWith('_hu06_test')) {
      throw new Error('Segurança: o nome do banco deve terminar em _hu06_test.');
    }
    return new DataSource({
      type: 'postgres', url: testUrl, synchronize: false, migrations: MIGRATIONS,
    }).initialize();
  };

  beforeAll(async () => {
    ds = await abrir();
    await ds.runMigrations();
    const [contrato] = await ds.query(`
      INSERT INTO contratos
        (numero_contrato, orgao_contratante, objeto, inicio_vigencia,
         termino_vigencia, status, modo_calculo)
      VALUES ('HU06/TESTE', 'Órgão teste', 'Contrato isolado',
              '2026-10-01', '2027-10-01', 'PLANEJAMENTO', 'SIMPLES')
      RETURNING id
    `) as Array<{ id: string }>;
    contratoId = contrato.id;
  });

  afterAll(async () => {
    if (!ds?.isInitialized) return;
    try {
      if (contratoId) {
        await ds.query('DELETE FROM etapas WHERE contrato_id = $1', [contratoId]);
        await ds.query('DELETE FROM contratos WHERE id = $1', [contratoId]);
      }
    } finally {
      await ds.destroy();
    }
  });

  it('persiste 2 etapas, sequências e UUIDs depois de reconectar ao banco', async () => {
    const [etapa1] = await ds.query(`
      INSERT INTO etapas (contrato_id, codigo, nome, sequencia, inicio_previsto)
      VALUES ($1, 'ET01', 'Planejamento', 1, '2026-10-03') RETURNING id
    `, [contratoId]) as Array<{ id: string }>;
    const [etapa2] = await ds.query(`
      INSERT INTO etapas (contrato_id, codigo, nome, sequencia, termino_previsto)
      VALUES ($1, 'ET02', 'Execução', 2, '2027-09-25') RETURNING id
    `, [contratoId]) as Array<{ id: string }>;
    primeiraId = etapa1.id;
    segundaId = etapa2.id;

    await ds.destroy();
    ds = await abrir();
    const etapas = await ds.query(`
      SELECT id, nome, sequencia, status, inicio_previsto, termino_previsto
      FROM etapas WHERE contrato_id = $1 ORDER BY sequencia
    `, [contratoId]) as Array<Record<string, unknown>>;
    expect(etapas.map((e) => [e.id, e.sequencia])).toEqual([
      [primeiraId, 1], [segundaId, 2],
    ]);
    expect(etapas[0].status).toBe('PLANEJADA');
    expect(etapas[0].inicio_previsto).toBeTruthy();
    expect(etapas[1].termino_previsto).toBeTruthy();
  });

  it('rejeita FK inválida, sequência duplicada, sequência não positiva e datas invertidas', async () => {
    const idInexistente = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await expect(ds.query(`
      INSERT INTO etapas (contrato_id, nome, sequencia) VALUES ($1, 'Órfã', 1)
    `, [idInexistente])).rejects.toMatchObject({ code: '23503' });
    await expect(ds.query(`
      INSERT INTO etapas (contrato_id, nome, sequencia) VALUES ($1, 'Duplicada', 1)
    `, [contratoId])).rejects.toMatchObject({ code: '23505' });
    await expect(ds.query(`
      INSERT INTO etapas (contrato_id, nome, sequencia) VALUES ($1, 'Inválida', 0)
    `, [contratoId])).rejects.toMatchObject({ code: '23514' });
    await expect(ds.query(`
      INSERT INTO etapas (contrato_id, nome, sequencia, inicio_previsto, termino_previsto)
      VALUES ($1, 'Prazo inválido', 3, '2026-11-10', '2026-11-09')
    `, [contratoId])).rejects.toMatchObject({ code: '23514' });
    await expect(ds.query('DELETE FROM contratos WHERE id = $1', [contratoId]))
      .rejects.toMatchObject({ code: '23503' });
  });

  it('permite reordenar dentro de uma transação usando constraint adiável', async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query('SET CONSTRAINTS "uq_etapas_contrato_sequencia" DEFERRED');
      await qr.query('UPDATE etapas SET sequencia = 2 WHERE id = $1', [primeiraId]);
      await qr.query('UPDATE etapas SET sequencia = 1 WHERE id = $1', [segundaId]);
      await qr.commitTransaction();
    } catch (erro) {
      await qr.rollbackTransaction();
      throw erro;
    } finally {
      await qr.release();
    }
    const etapas = await ds.query(
      'SELECT id FROM etapas WHERE contrato_id = $1 ORDER BY sequencia', [contratoId],
    ) as Array<{ id: string }>;
    expect(etapas.map((e) => e.id)).toEqual([segundaId, primeiraId]);
  });

  it('down é executável e reversível dentro de ROLLBACK, sem apagar base existente', async () => {
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await new CriarEtapas1793500000000().down(qr);
      expect(await qr.hasTable('etapas')).toBe(false);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
    expect(await ds.query('SELECT COUNT(*)::int AS n FROM etapas WHERE contrato_id = $1', [contratoId]))
      .toEqual([{ n: 2 }]);
    expect(await ds.query(`SELECT to_regclass('public.contratos') IS NOT NULL AS presente`))
      .toEqual([{ presente: true }]);
  });
});
