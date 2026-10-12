import 'reflect-metadata';
import { DataSource } from 'typeorm';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL não foi definida.');
}

const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,

  entities: ['src/**/*.entity{.ts,.js}'],

  migrations: ['src/database/migrations/*{.ts,.js}'],

  synchronize: false,
});

export default AppDataSource;