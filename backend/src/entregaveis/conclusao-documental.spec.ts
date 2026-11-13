import { jest } from '@jest/globals';
import { documentacaoVerificada } from './conclusao-documental.js';
import type { EntityManager } from 'typeorm';
const manager = (dados: Record<string, number>) => ({ query: async () => [dados] }) as unknown as EntityManager;
const pronta = { etapas:1, entregaveis:1, evidencias:2, verificadas:2, etapas_sem_entregavel:0, entregaveis_sem_evidencia:0 };
describe('fechamento documental sem presumir estado operacional', () => {
  test('evidências verificadas completam toda a documentação', async () => {
    expect(await documentacaoVerificada(manager(pronta), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(true);
  });
  test('uma evidência pendente impede conclusão', async () => {
    expect(await documentacaoVerificada(manager({...pronta, verificadas:1}), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false);
  });
  test('sem itens ou com filhos vazios jamais fecha por 0/0', async () => {
    expect(await documentacaoVerificada(manager({...pronta, etapas:0, entregaveis:0,evidencias:0,verificadas:0}), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false);
    expect(await documentacaoVerificada(manager({...pronta, entregaveis_sem_evidencia:1}), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false);
  });
});

import { filhosPendentesDeConclusao, concluirEtapaAposFilhos } from './conclusao-documental.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { StatusEtapa } from '../etapas/status-etapa.enum.js';

describe('cascata segura e auditável', () => {
  const contrato = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const idEtapa = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  function cenario(pendentes: boolean, verificada = true) {
    const etapa = { id: idEtapa, contratoId: contrato, status: StatusEtapa.EM_ANDAMENTO,
      arquivadoEm: null, reabertoEm: null as Date | null, conclusaoSolicitadaEm: null as Date | null, conclusaoSolicitadaPor: null as string | null };
    const salvar = jest.fn(async (e: unknown) => e);
    const query = jest.fn(async (sql: string) => sql.includes('AS pendentes')
      ? [{ pendentes }] : [{...pronta, verificadas: verificada ? 2 : 1}]);
    const m = { query, getRepository: () => ({findOneBy: async () => etapa, save: salvar}) } as unknown as EntityManager;
    return { etapa, salvar, m };
  }
  test('filho em revisão bloqueia a etapa mesmo com todos os documentos verificados', async () => {
    const a = cenario(true);
    const auditoria = jest.fn(async () => {});
    expect(await filhosPendentesDeConclusao(a.m, contrato, idEtapa)).toBe(true);
    expect(await concluirEtapaAposFilhos(a.m, contrato, idEtapa, auditoria)).toBe(false);
    expect(a.salvar).not.toHaveBeenCalled();
    expect(auditoria).not.toHaveBeenCalled();
  });
  test('primeira elegibilidade gera solicitação pendente, sem fechar a etapa', async () => {
    const a = cenario(false);
    const auditoria = jest.fn(async () => {});
    expect(await concluirEtapaAposFilhos(a.m, contrato, idEtapa, auditoria)).toBe(true);
    expect(a.etapa.status).toBe(StatusEtapa.EM_ANDAMENTO);
    expect(a.etapa.conclusaoSolicitadaEm).toBeInstanceOf(Date);
    expect(a.salvar).toHaveBeenCalledTimes(1);
    expect(auditoria).toHaveBeenCalledTimes(1);
  });
  test('etapa explicitamente reaberta não solicita conclusão automática', async () => {
    const a = cenario(false);
    a.etapa.reabertoEm = new Date('2026-11-06T12:00:00Z');
    const auditoria = jest.fn(async () => {});
    expect(await concluirEtapaAposFilhos(a.m, contrato, idEtapa, auditoria)).toBe(false);
    expect(a.salvar).not.toHaveBeenCalled();
  });
  test('um comprovante ainda pendente impede a cascata', async () => {
    const a = cenario(false, false);
    const auditoria = jest.fn(async () => {});
    expect(await concluirEtapaAposFilhos(a.m, contrato, idEtapa, auditoria)).toBe(false);
    expect(a.salvar).not.toHaveBeenCalled();
  });
});

test('SQL de conclusão ignora opcionais, preserva obrigatórias e não conclui por 0/0', async () => {
  const sql: string[] = [];
  const m = { query: async (q: string) => { sql.push(q); return [{ etapas:1, entregaveis:1, evidencias:1, verificadas:1, etapas_sem_entregavel:0, entregaveis_sem_evidencia:0 }]; } } as unknown as EntityManager;
  expect(await documentacaoVerificada(m, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(true);
  expect(sql[0]).toContain('ev.obrigatoria IS TRUE');
});
