import { jest } from '@jest/globals';
import type { EntityManager } from 'typeorm';
import type { Contrato } from '../contratos/contrato.entity.js';
import { impactoVigencia } from './impacto-vigencia.js';

const contrato = {
  id: '11111111-1111-4111-8111-111111111111',
  inicioVigencia: '2035-01-01', terminoVigencia: '2035-12-31',
} as Contrato;
const ocorrencia = {
  id: '22222222-2222-4222-8222-222222222222', entregavel_id: 'e1',
  periodo_inicio: '2035-12-01', periodo_fim: '2035-12-31',
  status: 'NAO_INICIADO', data_realizada: null, quantidade_realizada: null,
  observacoes: null, vinculada: true,
};

test('prévia reconhece vínculos N:N de atividades, preservando ocorrência histórica', async () => {
  const consultas: string[] = [];
  const manager = { query: jest.fn(async (sql: string) => {
    consultas.push(sql);
    return sql.includes('FROM ocorrencias o') ? [ocorrencia] : [];
  }) } as unknown as EntityManager;
  const resultado = await impactoVigencia(manager, contrato, '2035-01-01', '2035-11-30');
  expect(consultas[0]).toContain('atividade_ocorrencias');
  expect(consultas[0]).toContain('ao."ocorrenciaId" = o.id');
  expect(consultas[0]).toContain('ao."contratoId" = o.contrato_id');
  expect(resultado.preservadasFora).toBe(1);
  expect(resultado.futurasFora).toBe(0);
  expect(resultado.bloqueado).toBe(false);
});

test('ocorrência futura sem atividade continua a bloquear redução da vigência', async () => {
  const manager = { query: jest.fn(async (sql: string) => sql.includes('FROM ocorrencias o')
    ? [{ ...ocorrencia, vinculada: false }] : []) } as unknown as EntityManager;
  const resultado = await impactoVigencia(manager, contrato, '2035-01-01', '2035-11-30');
  expect(resultado.bloqueado).toBe(true);
  expect(resultado.futurasFora).toBe(1);
});


test('B03: ocorrência manual com data prevista e sem período também afeta vigência', async () => {
  const manager = {query:jest.fn(async (sql:string) => sql.includes('FROM ocorrencias o') ? [{...ocorrencia,periodo_inicio:null,periodo_fim:null,data_prevista:'2035-12-15',vinculada:false}] : [])} as unknown as EntityManager;
  const r=await impactoVigencia(manager,contrato,'2035-01-01','2035-11-30');
  expect(r.futurasFora).toBe(1);
  expect(r.bloqueado).toBe(true);
});

test('B03: etapa com planejamento futuro fora da vigência bloqueia redução', async () => {
  const manager = {query:jest.fn(async (sql:string) => sql.includes('FROM ocorrencias o') ? [] : [{id:'etapa',nome:'Etapa futura',inicio_previsto:'2035-12-01',termino_previsto:'2035-12-31',agenda_inicio_futuro:null,estado:'PLANEJADA'}])} as unknown as EntityManager;
  const r=await impactoVigencia(manager,contrato,'2035-01-01','2035-11-30');
  expect(r.planosFora).toEqual([{id:'etapa',nome:'Etapa futura'}]);
  expect(r.bloqueado).toBe(true);
});


test.each([
  ['2035-12-15',null,null],
  [null,'2035-01-10',null],
  [null,null,'2035-12-15'],
])('B03: fronteira futura isolada %s / %s / %s não escapa da vigência', async (inicio,termino,agenda) => {
  const manager={query:jest.fn(async(sql:string)=>sql.includes('FROM ocorrencias o') ? [] : [{id:'p',nome:'Planejamento',inicio_previsto:inicio,termino_previsto:termino,agenda_inicio_futuro:agenda,estado:'PLANEJADA'}])} as unknown as EntityManager;
  const resultado=await impactoVigencia(manager,contrato,'2035-02-01','2035-11-30');
  expect(resultado.bloqueado).toBe(true);
  expect(resultado.planosFora).toEqual([{id:'p',nome:'Planejamento'}]);
});
