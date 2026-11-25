import { jest } from '@jest/globals';
import type { DataSource, QueryRunner } from 'typeorm';
import { executarMigracoesSerializadas } from './executar-migrations.js';
const registro = {name:'Teste1790000000001',timestamp:'1790000000001'};
function simular(adquirido = true, registros: unknown[] = []) {
  let historico = registros;
  const query = jest.fn(async (sql: string, _args?: unknown[]) => {
    if (sql.includes('pg_try_advisory_lock')) return [{adquirido}];
    if (sql.includes('pg_advisory_unlock')) return [{pg_advisory_unlock:true}];
    if (sql.includes('to_regclass')) return [{existe:true}];
    if (sql.includes('SELECT name, timestamp')) return historico;
    throw new Error(sql);
  });
  const release = jest.fn(async () => {});
  const runner = {query,release,connect:jest.fn(async () => {})} as unknown as QueryRunner;
  const db = {createQueryRunner:()=>runner,migrations:[{name:registro.name}]} as unknown as DataSource;
  const executar = jest.fn(async (_db: DataSource, qr: QueryRunner) => {
    expect(qr).toBe(runner);
    historico = [registro];
  });
  return {db,runner,query,release,executar};
}
describe('serialização de migrations', () => {
  it('mantém lock na mesma conexão até verificar o histórico final', async () => {
    const s=simular(); await executarMigracoesSerializadas(s.db,s.executar);
    const sql=s.query.mock.calls.map(([q])=>q);
    expect(sql[0]).toContain('pg_try_advisory_lock');
    expect(sql.at(-1)).toContain('pg_advisory_unlock');
    expect(s.executar).toHaveBeenCalledTimes(1);
    expect(s.release).toHaveBeenCalledTimes(1);
  });
  it('não executa DDL se outra sessão detém o lock', async () => {
    const s=simular(false);
    await expect(executarMigracoesSerializadas(s.db,s.executar)).rejects.toThrow('Outra execução');
    expect(s.executar).not.toHaveBeenCalled();expect(s.query).toHaveBeenCalledTimes(1);expect(s.release).toHaveBeenCalledTimes(1);
  });
  it('não executa DDL com histórico divergente', async () => {
    const s=simular(true,[{...registro,timestamp:'0'}]);
    await expect(executarMigracoesSerializadas(s.db,s.executar)).rejects.toThrow('Histórico');
    expect(s.executar).not.toHaveBeenCalled();expect(s.query.mock.calls.at(-1)?.[0]).toContain('pg_advisory_unlock');
  });
  it('libera o lock após falha no DDL', async () => {
    const s=simular();s.executar.mockRejectedValueOnce(new Error('DDL inválido'));
    await expect(executarMigracoesSerializadas(s.db,s.executar)).rejects.toThrow('DDL inválido');
    expect(s.query.mock.calls.at(-1)?.[0]).toContain('pg_advisory_unlock');expect(s.release).toHaveBeenCalledTimes(1);
  });
  it('falha se executor não registra a migration',async()=>{
    const s=simular();s.executar.mockImplementationOnce(async()=>{});
    await expect(executarMigracoesSerializadas(s.db,s.executar)).rejects.toThrow('Histórico incompleto');
  });
});
