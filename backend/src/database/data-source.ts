import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { readdirSync } from 'node:fs';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL não foi definida.');
}

const arquivosMigrations = readdirSync('src/database/migrations')
  .filter((nome) => /^\d{13}-[A-Z][A-Za-z0-9]*\.(?:ts|js)$/.test(nome))
  .sort()
  .map((nome) => `src/database/migrations/${nome}`);

if (!arquivosMigrations.length) {
  throw new Error('Nenhuma migration TypeORM encontrada.');
}

const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,

  entities: ['src/**/*.entity{.ts,.js}'],

  migrations: arquivosMigrations,

  synchronize: false,
});

export default AppDataSource;