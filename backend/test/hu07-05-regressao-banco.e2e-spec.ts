import 'reflect-metadata';
import { DataSource, type QueryRunner } from 'typeorm';
import { CriarEntregaveisEvidenciasEsperadas1793700000000 } from
  '../src/database/migrations/1793700000000-CriarEntregaveisEvidenciasEsperadas.js';

/**
 * HU07-05: usa PostgreSQL REAL no banco app_hu07_test e schema exclusivo.
 * Não simula persistência, FK, ENUM, NUMERIC ou checklist. Não usa DB DEV.
 * A execução HTTP autenticada no navegador fica para HU07-06.
 */
const url = process.env.HU07_TEST_DATABASE_URL;
const describeBanco = url ? describe : describe.skip;

describeBanco('HU07-05 — cinco tipos, vínculos e checklist no PostgreSQL', () => {
  let db: DataSource | undefined;
  let qr: QueryRunner | undefined;
  let schema: string;
  let contratoA: string;
  let contratoB: string;
  let etapaA: string;
  let etapaB: string;
  let entregavelUnico: string;

  async function registrar(tipo: string, adicionais: Record<string, unknown> = {},
    contratoId = contratoA, etapaId = etapaA): Promise<string> {
    const nomes = ['contrato_id', 'etapa_id', 'nome', 'tipo', ...Object.keys(adicionais)];
    const valores = [contratoId, etapaId, `Teste ${tipo}`, tipo, ...Object.values(adicionais)];
    const parametros = nomes.map((_, i) => `$${i + 1}`).join(', ');
    const resultado = await qr!.query(`INSERT INTO entregaveis (${nomes.map(x => `"${x}"`).join(', ')})
      VALUES (${parametros}) RETURNING id`, valores) as Array<{ id: string }>;
    return resultado[0].id;
  }

  beforeAll(async () => {
    if (!url) throw new Error('HU07_TEST_DATABASE_URL obrigatório');
    const banco = decodeURIComponent(new URL(url).pathname.slice(1));
    if (!banco.endsWith('_hu07_test')) throw new Error('Acesso negado: não usar banco de desenvolvimento');
    db = await new DataSource({ type: 'postgres', url, entities: [], synchronize: false }).initialize();
    qr = db.createQueryRunner(); await qr.connect();
    schema = `hu07_05_${process.pid}_${Date.now()}`;
    await qr.query(`CREATE SCHEMA "${schema}"`);
    await qr.query(`SET search_path TO "${schema}"`);
    await qr.query('CREATE TABLE usuarios (id uuid PRIMARY KEY)');
    await qr.query('CREATE TABLE contratos (id uuid PRIMARY KEY)');
    await qr.query('CREATE TABLE etapas (id uuid PRIMARY KEY, contrato_id uuid NOT NULL REFERENCES contratos(id))');
    const cs = await qr.query('INSERT INTO contratos(id) VALUES (gen_random_uuid()), (gen_random_uuid()) RETURNING id') as Array<{ id: string }>;
    [contratoA, contratoB] = cs.map(x => x.id);
    const es = await qr.query('INSERT INTO etapas(id, contrato_id) VALUES (gen_random_uuid(), $1), (gen_random_uuid(), $2) RETURNING id', [contratoA, contratoB]) as Array<{ id: string }>;
    [etapaA, etapaB] = es.map(x => x.id);
    await new CriarEntregaveisEvidenciasEsperadas1793700000000().up(qr);
  }, 30000);

  afterAll(async () => {
    if (qr) {
      try {
        await qr.query('SET search_path TO public');
        if (schema) await qr.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally { await qr.release(); }
    }
    if (db?.isInitialized) await db.destroy();
  });

  it('persiste os cinco tipos com vínculo duplo e sem execução/comprovação artificial', async () => {
    entregavelUnico = await registrar('UNICO', { criterio_conclusao: 'Ata assinada' });
    await registrar('QUANTITATIVO', { quantidade_prevista: '10.125', unidade_medida: 'horas' });
    await registrar('RECORRENTE', { periodicidade: 'MENSAL', configuracao_periodicidade: { versao: 1 } });
    await registrar('CONTINUO', { criterio_conclusao: 'Checkpoints de execução' });
    await registrar('MARCO', { criterio_conclusao: 'Evento documental verificável' });
    const linhas = await qr!.query(`SELECT tipo::text AS tipo, contrato_id, etapa_id,
      quantidade_realizada, percentual_execucao, situacao_comprovacao, status_execucao
      FROM entregaveis ORDER BY tipo::text`) as Array<Record<string, unknown>>;
    expect(linhas.map(l => l.tipo)).toEqual(['CONTINUO', 'MARCO', 'QUANTITATIVO', 'RECORRENTE', 'UNICO']);
    for (const linha of linhas) {
      expect(linha.contrato_id).toBe(contratoA);
      expect(linha.etapa_id).toBe(etapaA);
      expect(linha.quantidade_realizada).toBeNull();
      expect(linha.percentual_execucao).toBeNull();
      expect(linha.situacao_comprovacao).toBeNull();
      expect(linha.status_execucao).toBeNull();
    }
    const qtd = await qr!.query(`SELECT quantidade_prevista FROM entregaveis WHERE tipo='QUANTITATIVO'`) as Array<{ quantidade_prevista: string }>;
    expect(qtd[0].quantidade_prevista).toBe('10.125');
  });

  it('recusa etapa de outro contrato por FK composta, inclusive com ID verdadeiro', async () => {
    await expect(registrar('UNICO', {}, contratoA, etapaB)).rejects.toMatchObject({ code: '23503' });
    await expect(registrar('UNICO', {}, contratoB, etapaA)).rejects.toMatchObject({ code: '23503' });
    expect(await qr!.query(`SELECT COUNT(*)::int AS total FROM entregaveis WHERE contrato_id=$1`, [contratoB]))
      .toEqual([{ total: 0 }]);
  });

  it('recusa quantitativo zero/negativo e recorrente sem configuração ou personalizada', async () => {
    for (const valor of ['0', '-1']) {
      await expect(registrar('QUANTITATIVO', { quantidade_prevista: valor, unidade_medida: 'horas' }))
        .rejects.toMatchObject({ code: '23514' });
    }
    await expect(registrar('RECORRENTE')).rejects.toMatchObject({ code: '23514' });
    await expect(registrar('RECORRENTE', { periodicidade: 'MENSAL', configuracao_periodicidade: { versao: 1, dias: [5] } }))
      .rejects.toMatchObject({ code: '23514' });
    await expect(registrar('RECORRENTE', { periodicidade: 'PERSONALIZADA', configuracao_periodicidade: { versao: 1 } }))
      .rejects.toMatchObject({ code: '22P02' });
  });

  it('checklist mantém IDs, obrigatoriedade e segregação de execução após alteração', async () => {
    const itens = await qr!.query(`INSERT INTO evidencias_esperadas
      (entregavel_id, tipo_evidencia, descricao, obrigatoria)
      VALUES ($1, 'ATA', 'Documento obrigatório', true), ($1, 'FOTO', 'Registro visual', false)
      RETURNING id, tipo_evidencia, obrigatoria`, [entregavelUnico]) as Array<{ id: string; obrigatoria: boolean }>;
    expect(itens.map(i => i.obrigatoria)).toEqual([true, false]);
    await qr!.query('UPDATE evidencias_esperadas SET obrigatoria=true WHERE id=$1', [itens[1].id]);
    const depois = await qr!.query(`SELECT id, tipo_evidencia, obrigatoria
      FROM evidencias_esperadas WHERE entregavel_id=$1 ORDER BY tipo_evidencia`, [entregavelUnico]) as Array<{ id: string; obrigatoria: boolean }>;
    expect(depois.map(i => i.id).sort()).toEqual(itens.map(i => i.id).sort());
    expect(depois.every(i => i.obrigatoria)).toBe(true);
    const e = await qr!.query('SELECT situacao_comprovacao, percentual_execucao FROM entregaveis WHERE id=$1', [entregavelUnico]) as Array<Record<string, unknown>>;
    expect(e[0]).toEqual({ situacao_comprovacao: null, percentual_execucao: null });
  });

  it('consultar em segunda conexão confirma persistência sem depender do cache do QueryRunner', async () => {
    const outro = db!.createQueryRunner(); await outro.connect();
    try {
      await outro.query(`SET search_path TO "${schema}"`);
      const resultado = await outro.query(`SELECT COUNT(*)::int AS total FROM entregaveis WHERE contrato_id=$1`, [contratoA]) as Array<{ total: number }>;
      expect(resultado[0].total).toBe(5);
      const itens = await outro.query('SELECT COUNT(*)::int AS total FROM evidencias_esperadas WHERE entregavel_id=$1', [entregavelUnico]) as Array<{ total: number }>;
      expect(itens[0].total).toBe(2);
    } finally { await outro.release(); }
  });
});
