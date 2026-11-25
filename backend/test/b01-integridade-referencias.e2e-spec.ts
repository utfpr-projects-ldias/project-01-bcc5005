import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { ExecucoesIntegradas1797700000000 } from '../src/database/migrations/1797700000000-ExecucoesIntegradas.js';
import { IntegridadeReferenciasExecucaoB011798270000000 } from '../src/database/migrations/1798270000000-IntegridadeReferenciasExecucaoB01.js';
import { executarMigracoesSerializadas } from '../src/database/executar-migrations.js';

const url = process.env.B01_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('B01 — integridade referencial e serialização PostgreSQL', () => {
  let db: DataSource;
  let q: QueryRunner;
  const schema = `b01_${randomUUID().replace(/-/g,'')}`;
  const contrato = randomUUID(), entregavel = randomUUID(), a = randomUUID(), b = randomUUID(), autor = randomUUID();
  const originA = randomUUID(), originB = randomUUID(), originDireta = randomUUID();
  const prova = randomUUID();
  async function inserir(id: string, ocorrencia: string|null, referencia: string|null) {
    await q.query(`INSERT INTO execucoes_entregavel
      (id,contrato_id,entregavel_id,ocorrencia_id,origem,origem_id,referencia_id,centesimos,status,data_execucao,autor_id,autor_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDENTE','2026-11-25',$9,'QA')`,
    [id,contrato,entregavel,ocorrencia,referencia?'EVIDENCIA':'MANUAL',referencia?randomUUID():null,referencia,referencia?0:2000,autor]);
  }
  beforeAll(async () => {
    if (!url || !decodeURIComponent(new URL(url).pathname).endsWith('_b01_test')) throw new Error('Banco isolado obrigatório');
    db = new DataSource({type:'postgres',url,entities:[],synchronize:false,installExtensions:false});
    await db.initialize();
    q=db.createQueryRunner(); await q.connect();
    await q.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public');
    await q.query(`CREATE SCHEMA "${schema}"`);
    await q.query(`SET search_path TO "${schema}", public`);
    await q.query('CREATE TABLE entregaveis (id uuid PRIMARY KEY, contrato_id uuid NOT NULL, UNIQUE(id,contrato_id))');
    await q.query('CREATE TABLE ocorrencias (id uuid PRIMARY KEY, contrato_id uuid NOT NULL, UNIQUE(id,contrato_id))');
    await new ExecucoesIntegradas1797700000000().up(q);
    await q.query('INSERT INTO entregaveis VALUES ($1,$2)',[entregavel,contrato]);
    await q.query('INSERT INTO ocorrencias VALUES ($1,$3),($2,$3)',[a,b,contrato]);
    await inserir(originA,a,null); await inserir(originB,b,null); await inserir(originDireta,null,null);
    // Falha sobre dado legado incompatível precisa reverter integralmente o DDL.
    const legado=randomUUID(); await inserir(legado,a,originB);
    await q.startTransaction();
    try {
      await expect(new IntegridadeReferenciasExecucaoB011798270000000().up(q)).rejects.toMatchObject({code:'23503'});
    } finally { await q.rollbackTransaction(); }
    await q.query('DELETE FROM execucoes_entregavel WHERE id=$1',[legado]);
    await q.startTransaction();
    try { await new IntegridadeReferenciasExecucaoB011798270000000().up(q); await q.commitTransaction(); }
    catch (e) { await q.rollbackTransaction(); throw e; }
    await inserir(prova,a,originA);
  },30000);
  afterAll(async () => {
    if(q && !q.isReleased) {
      try { await q.query('SET search_path TO public'); await q.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await q.release(); }
    }
    if(db?.isInitialized) await db.destroy();
  });
  it('aceita prova no mesmo escopo, inclusive execução direta',async()=>{
    await inserir(randomUUID(),a,originA); await inserir(randomUUID(),null,originDireta);
  });
  it('rejeita referência cruzada, direta incompatível, cadeia e autorreferência',async()=>{
    for(const [ocorrencia,referencia] of [[a,originB],[a,originDireta],[null,originA],[a,prova]] as const)
      await expect(inserir(randomUUID(),ocorrencia,referencia)).rejects.toMatchObject({code:'23503'});
    const id=randomUUID(); await expect(inserir(id,a,id)).rejects.toMatchObject({code:'23503'});
  });
  it('protege também alterações da origem enquanto há provas vinculadas',async()=>{
    await expect(q.query('UPDATE execucoes_entregavel SET ocorrencia_id=$1 WHERE id=$2',[b,originA])).rejects.toMatchObject({code:'23503'});
  });
  it('não permite que outra sessão inicie DDL enquanto o lock está ocupado',async()=>{
    await q.query('SELECT pg_advisory_lock(194832,179827)');
    try {
      let iniciou=false;
      await expect(executarMigracoesSerializadas(db,async()=>{iniciou=true;})).rejects.toThrow('Outra execução');
      expect(iniciou).toBe(false);
    } finally { await q.query('SELECT pg_advisory_unlock(194832,179827)'); }
  });
});
