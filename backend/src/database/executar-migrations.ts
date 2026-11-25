import { MigrationExecutor, type DataSource, type QueryRunner } from 'typeorm';
import { historicoCompativel, lerHistoricoMigrations } from './historico-migrations.js';

// Namespace fixo de dois inteiros, separado dos locks de domínio (bigint).
const LOCK = [194832, 179827] as const;

/** Uma única sessão PostgreSQL detém o lock durante todas as migrations,
 * inclusive entre commits individuais. Funciona também com DB_POOL_MAX=1. */
export async function executarMigracoesSerializadas(db: DataSource,
  executar: (db: DataSource, runner: QueryRunner) => Promise<unknown> = async (dataSource, runner) => {
    const executor = new MigrationExecutor(dataSource, runner);
    executor.transaction = 'each';
    await executor.executePendingMigrations();
  }): Promise<void> {
  const runner = db.createQueryRunner();
  let adquirido = false;
  try {
    await runner.connect();
    const [r] = await runner.query('SELECT pg_try_advisory_lock($1::integer, $2::integer) AS adquirido', [...LOCK]) as { adquirido: boolean }[];
    adquirido = r?.adquirido === true;
    if (!adquirido) throw new Error('Outra execução de migrations está em andamento neste banco. Aguarde seu término e execute novamente.');
    const historico = await lerHistoricoMigrations(runner);
    if (!historicoCompativel(db.migrations, historico ?? [], false))
      throw new Error('Histórico de migrations incompatível com o código. Nenhuma migration foi iniciada.');
    await executar(db, runner);
    const final = await lerHistoricoMigrations(runner);
    if (final === null || !historicoCompativel(db.migrations, final, true))
      throw new Error('Histórico incompleto após as migrations. A API permanecerá indisponível.');
  } finally {
    try {
      if (adquirido) await runner.query('SELECT pg_advisory_unlock($1::integer, $2::integer)', [...LOCK]);
    } finally {
      await runner.release();
    }
  }
}
