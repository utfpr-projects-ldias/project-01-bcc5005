import { jest } from '@jest/globals';
import { criarManualDireta, editarManualDireta, validarQuantidadeManual } from './quantidade-manual-direta.js';
import type { Entregavel } from '../entregaveis/entregavel.entity.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import type { EntityManager } from 'typeorm';
const ator={id:'u'} as UsuarioAutenticado;
const dto={id:'l',valor:'2.500',data:'2026-11-24'};
const item=()=>({id:'e',contratoId:'c',tipo:'QUANTITATIVO',unidadeMedida:'un',quantidadePrevista:'10',quantidadeRealizada:null,quantidadeDiretaIntegrada:false} as Entregavel);
const m=(query: (sql:string,params?:unknown[])=>Promise<unknown[]>)=>({query:jest.fn(query)} as unknown as EntityManager);
test.each(['0','-1','2.0001','NaN','1e2'])('rejeita quantidade manual %s',valor=>expect(()=>validarQuantidadeManual(valor)).toThrow());
test('registro direto não cria ocorrência e integra a medição pendente',async()=>{
 const e=item();let inserido=false;
 const registro={id:'l',autor_id:'u',quantidade:'2.500',data_execucao:dto.data,observacao:null,status:'PENDENTE'};
 const manager=m(async sql=>{
   if(sql.startsWith('SELECT 1 FROM ocorrencias'))return [];
   if(sql.startsWith('INSERT INTO execucoes_quantitativas_diretas')){inserido=true;return [];}
   if(sql.startsWith('UPDATE entregaveis'))return [];
   if(sql.includes('UNION ALL'))return [{quantidade:'2.500',situacao:'PENDENTE'}];
   if(sql.startsWith('SELECT *, data_execucao'))return inserido?[registro]:[];
   throw new Error(`SQL inesperado: ${sql}`);
 });
 expect(await criarManualDireta(manager,e,dto,ator)).toEqual({anterior:null,registro});
 expect(e.quantidadeDiretaIntegrada).toBe(true);
});
test('não mistura ocorrência vigente com medição direta',async()=>{
 const manager=m(async()=>[{id:'o'}]);
 await expect(criarManualDireta(manager,item(),dto,ator)).rejects.toThrow('ocorrências existentes');
});


test('correção de quantidade aprovada exige autorização adicional antes da escrita', async () => {
  const registro = {id:'l', quantidade:'2.500', status:'APROVADO'};
  const autorizar = jest.fn(async () => { throw new Error('Sem permissão especial'); });
  let escrita = false;
  const manager = m(async sql => {
    if (sql.startsWith('SELECT 1 FROM ocorrencias')) return [];
    if (sql.startsWith('SELECT *, data_execucao')) return [registro];
    if (sql.startsWith('UPDATE')) escrita = true;
    throw new Error(`SQL inesperado: ${sql}`);
  });
  await expect(editarManualDireta(manager,item(),'l',{valor:'3',data:dto.data,motivo:'Correção com justificativa'},autorizar)).rejects.toThrow('Sem permissão especial');
  expect(autorizar).toHaveBeenCalledTimes(1);
  expect(escrita).toBe(false);
});
