import { randomUUID } from 'node:crypto';
import {
  DataSource,
  MigrationExecutor,
  type QueryRunner,
} from 'typeorm';

import { CriarContratos1793200000000 } from '../src/database/migrations/1793200000000-CriarContratos.js';

const describePostgres = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

describePostgres('Migration de contratos — PostgreSQL', () => {
  let dataSource: DataSource | undefined;
  let queryRunner: QueryRunner | undefined;
  let schemaTeste: string | undefined;

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Banco E2E não informado');
    const nomeBanco = decodeURIComponent(new URL(url).pathname.slice(1));
    if (!nomeBanco.endsWith('_migration_test')) {
      throw new Error('Proteção E2E: utilizar banco terminado em _migration_test');
    }

    // O schema é criado antes de inicializar o DataSource que executa a
    // migration: SET search_path sozinho não altera o schema que o TypeORM
    // utiliza ao consultar/registrar sua tabela de migrations.
    schemaTeste = `hu05_05_${randomUUID().replaceAll('-', '')}`;
    const preparacao = await new DataSource({
      type: 'postgres', url, entities: [], synchronize: false,
    }).initialize();
    try {
      await preparacao.query(`CREATE SCHEMA "${schemaTeste}"`);
    } finally {
      await preparacao.destroy();
    }

    dataSource = await new DataSource({
      type: 'postgres', url, schema: schemaTeste,
      entities: [],
      migrations: [CriarContratos1793200000000],
      migrationsTableName: 'migrations_hu05_05',
      synchronize: false,
      logging: false,
    }).initialize();

    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.query(`SET search_path TO "${schemaTeste}"`);

    // A migration histórica referencia usuarios(id). A fixture mantém
    // somente a tabela mínima, sem tocar schemas de outras suítes.
    await queryRunner.query(`
      CREATE TABLE "usuarios" (
        "id" uuid PRIMARY KEY
      )
    `);
  });

  afterAll(async () => {
    if (queryRunner) {
      try {
        if (schemaTeste) {
          await queryRunner.query(
            'SET search_path TO public',
          );

          await queryRunner.query(
            `DROP SCHEMA IF EXISTS "${schemaTeste}" CASCADE`,
          );
        }
      } finally {
        await queryRunner.release();
      }
    }

    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    'aplica a migration uma vez, permite reexecução e persiste contratos',
    async () => {
      if (!dataSource || !queryRunner || !schemaTeste) {
        throw new Error(
          'O PostgreSQL de testes não foi inicializado',
        );
      }

      const executor = new MigrationExecutor(
        dataSource,
        queryRunner,
      );

      const primeiraExecucao =
        await executor.executePendingMigrations();

      expect(
        primeiraExecucao.map((migration) => migration.name),
      ).toContain('CriarContratos1793200000000');

      const segundaExecucao =
        await executor.executePendingMigrations();

      expect(segundaExecucao).toHaveLength(0);

      const linhas = (await queryRunner.query(
        `
          INSERT INTO "contratos" (
            "numero_contrato",
            "orgao_contratante",
            "objeto",
            "inicio_vigencia",
            "termino_vigencia",
            "status",
            "modo_calculo"
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
            "id",
            "inicio_vigencia"::text AS "inicio_vigencia",
            "termino_vigencia"::text AS "termino_vigencia"
        `,
        [
          '2026/001',
          'UTFPR',
          'Prestação de serviços',
          '2026-10-17',
          '2027-10-16',
          'PLANEJAMENTO',
          'SIMPLES',
        ],
      )) as Array<{
        id: string;
        inicio_vigencia: string;
        termino_vigencia: string;
      }>;

      expect(linhas).toHaveLength(1);
      expect(linhas[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(linhas[0].inicio_vigencia).toBe('2026-10-17');
      expect(linhas[0].termino_vigencia).toBe('2027-10-16');

      await expect(
        queryRunner.query(
          `
            INSERT INTO "contratos" (
              "numero_contrato",
              "orgao_contratante",
              "objeto",
              "inicio_vigencia",
              "termino_vigencia",
              "status",
              "modo_calculo"
            )
            VALUES (
              '2026/002',
              'UTFPR',
              'Contrato inválido',
              '2026-10-17',
              '2026-10-16',
              'PLANEJAMENTO',
              'SIMPLES'
            )
          `,
        ),
      ).rejects.toMatchObject({
        driverError: expect.objectContaining({
          code: '23514',
        }),
      });

      const colunas = (await queryRunner.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'contratos'
        `,
        [schemaTeste],
      )) as Array<{ column_name: string }>;

      const nomesColunas = colunas.map(
        (coluna) => coluna.column_name,
      );

      expect(nomesColunas).toContain('id');
      expect(nomesColunas).toContain('inicio_vigencia');
      expect(nomesColunas).toContain('termino_vigencia');

      expect(nomesColunas).not.toEqual(
        expect.arrayContaining([
          'valor',
          'saldo',
          'pagamento',
          'empenho',
        ]),
      );
    },
    30_000,
  );
});