import 'reflect-metadata';
import { DataSource, type QueryRunner } from 'typeorm';
import { CriarEntregaveisEvidenciasEsperadas1793700000000 } from
  '../src/database/migrations/1793700000000-CriarEntregaveisEvidenciasEsperadas.js';

/**
 * Executa SOMENTE com HU07_TEST_DATABASE_URL apontando para banco cujo nome
 * termina com _hu07_test; opera em schema descartável, jamais no DB de dev.
 * Exemplo: HU07_TEST_DATABASE_URL=postgresql://.../app_hu07_test npm run test:e2e -- --runInBand hu07-01-modelagem-banco
 */
const url = process.env.HU07_TEST_DATABASE_URL;
const describeBanco = url ? describe : describe.skip;

describeBanco('HU07-01 — integridade PostgreSQL real em schema isolado', () => {
  let ds: DataSource | undefined;
  let qr: QueryRunner | undefined;
  let schema: string | undefined;
  let contratoA: string;
  let contratoB: string;
  let etapaA: string;
  let etapaB: string;
  let entregavelA: string;

  async function inserirEntregavel(
    contratoId: string, etapaId: string, tipo: string,
    extra = '', params: unknown[] = [],
  ) {
    if (!qr) throw new Error('Banco não inicializado.');
    return qr.query(`
      INSERT INTO entregaveis (contrato_id, etapa_id, nome, tipo ${extra ? ', ' + extra : ''})
      VALUES ($1, $2, 'Obrigação teste', $3 ${params.map((_, i) => ', $' + (i + 4)).join('')})
      RETURNING id
    `, [contratoId, etapaId, tipo, ...params]) as Promise<Array<{ id: string }>>;
  }

  // Consultar pg_catalog explicitamente: DataSource/TypeORM pode manter o schema
  // inicial (public) mesmo após SET search_path nesta conexão de teste.
  async function tabelaExisteNoSchema(nome: string): Promise<boolean> {
    if (!qr || !schema) throw new Error('Schema isolado não inicializado.');
    const linhas = await qr.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS tabela
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = tabela.relnamespace
        WHERE namespace.nspname = $1
          AND tabela.relname = $2
          AND tabela.relkind IN ('r', 'p')
      ) AS existe
    `, [schema, nome]) as Array<{ existe: boolean }>;
    return linhas[0]?.existe === true;
  }

  beforeAll(async () => {
    if (!url) throw new Error('HU07_TEST_DATABASE_URL ausente.');
    const nomeBanco = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    if (!nomeBanco.endsWith('_hu07_test')) {
      throw new Error('Segurança: o banco de testes deve terminar em _hu07_test.');
    }
    ds = await new DataSource({ type: 'postgres', url, entities: [], synchronize: false }).initialize();
    qr = ds.createQueryRunner();
    await qr.connect();
    schema = `hu07_01_${process.pid}_${Date.now()}`;
    await qr.query(`CREATE SCHEMA "${schema}"`);
    await qr.query(`SET search_path TO "${schema}"`);

    // Pré-requisitos mínimos para testar a NOVA migration em isolamento,
    // sem executar migrations anteriores nem alterar o schema public.
    await qr.query(`CREATE TABLE usuarios (id uuid PRIMARY KEY)`);
    await qr.query(`CREATE TABLE contratos (id uuid PRIMARY KEY)`);
    await qr.query(`CREATE TABLE etapas (
      id uuid PRIMARY KEY, contrato_id uuid NOT NULL REFERENCES contratos(id)
    )`);
    const c = await qr.query(`
      INSERT INTO contratos(id) VALUES (gen_random_uuid()), (gen_random_uuid()) RETURNING id
    `) as Array<{ id: string }>;
    [contratoA, contratoB] = c.map(x => x.id);
    const e = await qr.query(`
      INSERT INTO etapas(id, contrato_id) VALUES (gen_random_uuid(), $1), (gen_random_uuid(), $2)
      RETURNING id
    `, [contratoA, contratoB]) as Array<{ id: string }>;
    [etapaA, etapaB] = e.map(x => x.id);
    await new CriarEntregaveisEvidenciasEsperadas1793700000000().up(qr);
  }, 30_000);

  afterAll(async () => {
    if (qr) {
      try {
        await qr.query('SET search_path TO public');
        if (schema) await qr.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally { await qr.release(); }
    }
    if (ds?.isInitialized) await ds.destroy();
  });

  it('persiste os cinco tipos e prova integridade da FK composta', async () => {
    const unico = await inserirEntregavel(contratoA, etapaA, 'UNICO');
    entregavelA = unico[0].id;
    await inserirEntregavel(contratoA, etapaA, 'QUANTITATIVO',
      'quantidade_prevista, unidade_medida', ['5.250', 'unidades']);
    await inserirEntregavel(contratoA, etapaA, 'RECORRENTE',
      'periodicidade, configuracao_periodicidade', ['MENSAL', { versao: 1 }]);
    await inserirEntregavel(contratoA, etapaA, 'CONTINUO');
    await inserirEntregavel(contratoA, etapaA, 'MARCO');
    const tipos = await qr!.query(`SELECT tipo::text AS tipo FROM entregaveis WHERE contrato_id=$1 ORDER BY tipo::text`, [contratoA]) as Array<{ tipo: string }>;
    expect(tipos.map(x => x.tipo)).toEqual(['CONTINUO', 'MARCO', 'QUANTITATIVO', 'RECORRENTE', 'UNICO']);
    await expect(inserirEntregavel(contratoA, etapaB, 'UNICO'))
      .rejects.toMatchObject({ code: '23503' });
    await expect(inserirEntregavel(contratoB, etapaA, 'UNICO'))
      .rejects.toMatchObject({ code: '23503' });
    await expect(qr!.query('DELETE FROM etapas WHERE id=$1', [etapaA]))
      .rejects.toMatchObject({ code: '23503' });
  });

  it('recusa quantidade zero/ausente e configuração recorrente personalizada', async () => {
    for (const args of [
      ['quantidade_prevista, unidade_medida', [0, 'horas']],
      ['unidade_medida', ['horas']],
      ['quantidade_prevista', [1]],
    ] as Array<[string, unknown[]]>) {
      await expect(inserirEntregavel(contratoA, etapaA, 'QUANTITATIVO', args[0], args[1]))
        .rejects.toMatchObject({ code: '23514' });
    }
    await expect(inserirEntregavel(contratoA, etapaA, 'RECORRENTE'))
      .rejects.toMatchObject({ code: '23514' });
    await expect(inserirEntregavel(contratoA, etapaA, 'RECORRENTE',
      'periodicidade, configuracao_periodicidade', ['MENSAL', { versao: 1, intervalo: 4 }]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(inserirEntregavel(contratoA, etapaA, 'RECORRENTE',
      'periodicidade, configuracao_periodicidade', ['PERSONALIZADA', { versao: 1 }]))
      .rejects.toMatchObject({ code: '22P02' });
  });

  it('preserva checklist, flags e separação entre execução e comprovação', async () => {
    const ids = await qr!.query(`
      INSERT INTO evidencias_esperadas(entregavel_id, tipo_evidencia, descricao, obrigatoria)
      VALUES ($1, 'ATA', 'Ata da reunião', true), ($1, 'FOTO', 'Registro visual', false)
      RETURNING id, obrigatoria
    `, [entregavelA]) as Array<{ id: string; obrigatoria: boolean }>;
    expect(ids.map(x => x.obrigatoria)).toEqual([true, false]);
    await qr!.query('UPDATE evidencias_esperadas SET obrigatoria=true WHERE id=$1', [ids[1].id]);
    const linhas = await qr!.query(`SELECT obrigatoria FROM evidencias_esperadas WHERE entregavel_id=$1`, [entregavelA]) as Array<{ obrigatoria: boolean }>;
    expect(linhas.every(x => x.obrigatoria)).toBe(true);
    const estado = await qr!.query(`
      SELECT status_execucao, percentual_execucao, situacao_comprovacao
      FROM entregaveis WHERE id=$1
    `, [entregavelA]) as Array<Record<string, unknown>>;
    expect(estado[0]).toEqual({ status_execucao: null, percentual_execucao: null, situacao_comprovacao: null });
    await expect(qr!.query('DELETE FROM entregaveis WHERE id=$1', [entregavelA]))
      .rejects.toMatchObject({ code: '23503' });
  });

  it('down é reversível dentro de ROLLBACK e preserva tabelas preexistentes', async () => {
    expect(await tabelaExisteNoSchema('entregaveis')).toBe(true);
    expect(await tabelaExisteNoSchema('evidencias_esperadas')).toBe(true);
    await qr!.startTransaction();
    try {
      await new CriarEntregaveisEvidenciasEsperadas1793700000000().down(qr!);
      expect(await tabelaExisteNoSchema('entregaveis')).toBe(false);
      expect(await tabelaExisteNoSchema('evidencias_esperadas')).toBe(false);
      expect(await tabelaExisteNoSchema('etapas')).toBe(true);
      expect(await tabelaExisteNoSchema('contratos')).toBe(true);
    } finally { await qr!.rollbackTransaction(); }
    // O ROLLBACK precisa restaurar ambas as tabelas; pré-existentes permanecem.
    expect(await tabelaExisteNoSchema('entregaveis')).toBe(true);
    expect(await tabelaExisteNoSchema('evidencias_esperadas')).toBe(true);
    expect(await tabelaExisteNoSchema('etapas')).toBe(true);
    expect(await tabelaExisteNoSchema('contratos')).toBe(true);
  });
});
