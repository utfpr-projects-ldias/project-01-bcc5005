import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';

/** Caminhos relativos a este módulo: funciona em src e no JavaScript compilado. */
export function arquivosMigrations(): string[] {
  const pasta = new URL('./migrations/', import.meta.url);
  const extensao = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  const nomes = readdirSync(pasta).filter(n => new RegExp(`^\\d{13}-[A-Z][A-Za-z0-9]*\\.${extensao}$`).test(n)).sort();
  if (!nomes.length || new Set(nomes.map(n => n.slice(0, 13))).size !== nomes.length) {
    throw new Error('Migrations ausentes ou com timestamps duplicados. Confira o artefato do backend.');
  }
  return nomes.map(n => fileURLToPath(new URL(n, pasta)));
}

function inteiro(nome: string, padrao: number, minimo: number, maximo: number): number {
  const raw = process.env[nome];
  if (raw === undefined || raw === '') return padrao;
  const valor = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${nome} inválida (esperado inteiro entre ${minimo} e ${maximo}).`);
  }
  return valor;
}

/** Valida a URI sem imprimir credenciais. Compose aceita uma URI percent-encoded explícita. */
export function obterUrlBanco(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não foi definida.');
  try {
    const parsed = new URL(url);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1) || parsed.hash) {
      throw new Error('URI inválida');
    }
    for (const [nome, valor] of [
      ['POSTGRES_USER', decodeURIComponent(parsed.username)],
      ['POSTGRES_PASSWORD', decodeURIComponent(parsed.password)],
      ['POSTGRES_DB', decodeURIComponent(parsed.pathname.slice(1))],
    ]) {
      if (process.env[nome] !== undefined && process.env[nome] !== valor) throw new Error('URI diverge da configuração do banco');
    }
  } catch {
    throw new Error('DATABASE_URL inválida ou incompatível com as credenciais do banco. Use POSTGRES_CONNECTION_URI com credenciais percent-encoded no Compose.');
  }
  return url;
}

export function opcoesBanco(migracao = false) {
  return {
    type: 'postgres',
    url: obterUrlBanco(),
    migrations: arquivosMigrations(),
    migrationsTransactionMode: 'each',
    migrationsRun: false,
    synchronize: false,
    installExtensions: false, // DDL de extensões pertence às migrations.
    poolSize: inteiro('DB_POOL_MAX', 10, 1, 100),
    extra: {
      connectionTimeoutMillis: inteiro('DB_CONNECT_TIMEOUT_MS', 5000, 100, 60000),
      idleTimeoutMillis: 30000,
      lock_timeout: migracao ? inteiro('DB_MIGRATION_LOCK_TIMEOUT_MS', 30000, 0, 2147483647) : inteiro('DB_LOCK_TIMEOUT_MS', 10000, 0, 2147483647),
      statement_timeout: migracao ? inteiro('DB_MIGRATION_STATEMENT_TIMEOUT_MS', 0, 0, 2147483647) : inteiro('DB_STATEMENT_TIMEOUT_MS', 60000, 0, 2147483647),
      application_name: migracao ? 'gestao-contratual-migrations' : 'gestao-contratual',
    },
  } satisfies DataSourceOptions;
}
