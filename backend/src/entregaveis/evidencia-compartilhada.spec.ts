import { destinosEvidencia } from './evidencia-compartilhada.js';
import { normalizarVinculoQuantidade, validarOcorrenciaQuantidade, quantidadeDiretaEvidencias } from './quantidade-evidencias.js';
import type { Entregavel } from './entregavel.entity.js';
import type { EntityManager } from 'typeorm';
import { jest } from '@jest/globals';
const e1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const e2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const r1='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const valor={quantidadeExecutada:'55',origemQuantidade:'NOVA_EXECUCAO' as const,referenciaExecucao:'lote 1'};
const e={id:e1,contratoId:e2,tipo:'QUANTITATIVO',unidadeMedida:'computadores',quantidadePrevista:'55',quantidadeRealizada:null} as Entregavel;
const manager=(linhas:unknown[])=>({query:jest.fn(async()=>linhas)} as unknown as EntityManager);

test('compartilhar mantém um requisito por destino e não aceita IDs ambíguos',()=>{
  expect(destinosEvidencia(JSON.stringify([{entregavelId:e1,esperadaId:r1},{entregavelId:e2,esperadaId:null}]))).toHaveLength(2);
  expect(()=>destinosEvidencia(JSON.stringify([{entregavelId:e1,esperadaId:r1},{entregavelId:e1.toUpperCase(),esperadaId:null}]))).toThrow();
  expect(()=>destinosEvidencia(JSON.stringify([{entregavelId:e1,esperadaId:null,percentual:100}]))).toThrow();
  expect(()=>destinosEvidencia('invalido')).toThrow();
});
test('quantidade direta exige meta, unidade e ausência de outra fonte de medição',async()=>{
  const v=normalizarVinculoQuantidade(valor);
  expect(v?.ocorrenciaQuantidadeId).toBeNull();
  await expect(validarOcorrenciaQuantidade(manager([]),e,v)).resolves.toBeUndefined();
  await expect(validarOcorrenciaQuantidade(manager([{}]),e,v)).rejects.toThrow();
  await expect(validarOcorrenciaQuantidade(manager([]),{...e,quantidadeRealizada:'1'} as Entregavel,v)).rejects.toThrow();
  await expect(validarOcorrenciaQuantidade(manager([]),{...e,tipo:'RECORRENTE'} as Entregavel,v)).rejects.toThrow();
  await expect(validarOcorrenciaQuantidade(manager([]),e,normalizarVinculoQuantidade({...valor,origemQuantidade:'COMPROVACAO'}))).rejects.toThrow();
});
test('projeção da medição direta separa aprovação de pendência',async()=>{
  expect(await quantidadeDiretaEvidencias(manager([]),e)).toBeNull();
  expect(await quantidadeDiretaEvidencias(manager([{reconhecida:'55.000',pendentes:1}]),{...e,quantidadeDiretaIntegrada:true} as Entregavel)).toEqual({reconhecida:'55.000',pendentes:1});
});

test('destinos distintos recebem contribuições explícitas e vínculos próprios',()=>{
  const destinos=[{entregavelId:e1,esperadaId:null,quantidadeExecutada:'55.125',ocorrenciaId:r1,ocorrenciaIds:[r1]}, {entregavelId:e2,esperadaId:null,percentualExecucao:'20.50'}];
  expect(destinosEvidencia(JSON.stringify(destinos))).toEqual(destinos);
  for(const invalido of [{quantidadeExecutada:'0'},{quantidadeExecutada:'1.2345'},{percentualExecucao:'100.01'},{percentualExecucao:'0'},{quantidadeExecutada:'2',percentualExecucao:'2'},{ocorrenciaIds:[r1,r1]},{ocorrenciaId:r1}]){
    expect(()=>destinosEvidencia(JSON.stringify([{entregavelId:e1,esperadaId:null,...invalido}]))).toThrow();
  }
});
