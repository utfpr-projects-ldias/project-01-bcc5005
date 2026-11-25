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
