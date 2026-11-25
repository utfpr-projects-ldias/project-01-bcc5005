import type { DataSource } from 'typeorm';

export type RegistroMigration = { name: string; timestamp: string | number };
type Leitor = { query(sql: string): Promise<unknown> };
type MigrationCarregada = { name?: string; constructor: { name: string } };

/** Não cria tabela, não altera schema e não depende da ordem física de inserção. */
export async function lerHistoricoMigrations(db: Leitor): Promise<RegistroMigration[] | null> {
  const [tabela] = await db.query(`SELECT to_regclass('migrations') IS NOT NULL AS existe`) as { existe: boolean }[];
  if (!tabela?.existe) return null;
  return await db.query('SELECT name, timestamp FROM "migrations"') as RegistroMigration[];
}

/** Aceita migrations históricas inseridas posteriormente, mas nunca entradas
 * desconhecidas, repetidas ou com timestamp que não corresponde à classe. */
export function historicoCompativel(migrations: readonly MigrationCarregada[], registros: readonly RegistroMigration[], completo: boolean): boolean {
  if (!migrations.length) return false;
  const esperadas = new Map<string, string>();
  const timestamps = new Set<string>();
  for (const m of migrations) {
    const nome = m.name ?? m.constructor.name;
    const timestamp = /\d{13}$/.exec(nome)?.[0];
    if (!timestamp || esperadas.has(nome) || timestamps.has(timestamp)) return false;
    esperadas.set(nome, timestamp); timestamps.add(timestamp);
  }
  const vistos = new Set<string>();
  for (const r of registros) {
    if (vistos.has(r.name) || !esperadas.has(r.name) || esperadas.get(r.name) !== String(r.timestamp)) return false;
    vistos.add(r.name);
  }
  return !completo || vistos.size === esperadas.size;
}

export async function verificarSchema(db: DataSource): Promise<boolean> {
  if (!db.isInitialized || !db.migrations.length) return false;
  const historico = await lerHistoricoMigrations(db);
  return historico !== null && historicoCompativel(db.migrations, historico, true);
}
