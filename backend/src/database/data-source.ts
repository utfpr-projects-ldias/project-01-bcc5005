import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { fileURLToPath } from 'node:url';
import { opcoesBanco } from './opcoes-banco.js';

const raiz = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const extensao = import.meta.url.endsWith('.ts') ? 'ts' : 'js';

export default new DataSource({
  ...opcoesBanco(true),
  entities: [`${raiz}**/*.entity.${extensao}`],
});
