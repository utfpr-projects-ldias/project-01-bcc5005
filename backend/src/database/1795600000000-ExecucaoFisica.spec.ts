import { jest } from '@jest/globals';
import { ExecucaoFisicaTEC091795600000000 } from './migrations/1795600000000-ExecucaoFisica.js';
test('TEC09 migration adiciona campos sem reinterpretar dados existentes',async()=>{
 const query=jest.fn(async (_sql:string)=>undefined);const m=new ExecucaoFisicaTEC091795600000000();await m.up({query} as never);
 const sql=query.mock.calls.map(c=>c[0]).join('\n');expect(sql).toContain('data_efetiva_marco');expect(sql).toContain('substituida_em');expect(sql).toContain('agenda_inicio_futuro');expect(sql).not.toMatch(/UPDATE |DELETE |DROP /i);
 query.mockClear();await m.down({query} as never);expect(query.mock.calls[0][0]).toContain('rollback destrutivo recusado');
});
