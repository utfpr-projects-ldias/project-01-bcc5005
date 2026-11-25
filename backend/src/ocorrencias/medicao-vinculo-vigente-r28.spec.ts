import { jest } from '@jest/globals';
import type { EntityManager } from 'typeorm';
import { Ocorrencia } from './ocorrencia.entity.js';
import { resumoMedicao } from './medicao-ocorrencia.js';

const o = Object.assign(new Ocorrencia(), { id: 'o', contratoId: 'c', metaQuantidade: '10',
  minimoAtividadesVerificadas: 0, minimoEvidenciasVerificadas: 0, evidenciaExigida: 'NENHUMA' });

describe('R28 — apuração por vínculos vigentes', () => {
  it('SQL não inclui quantidade órfã unicamente pela existência da linha de medição', async () => {
    const consultas: string[] = [];
    const manager = { query: jest.fn(async (sql: string) => {
      consultas.push(sql);
      if (sql.includes('FROM ocorrencia_lancamentos')) return [{total: '0'}];
      if (sql.includes('FROM atividades a')) return [{registrada: '0', verificada: '0', verificadas: '0', pendentes: '0'}];
      return [{total: '0', fotos: '0', relatorios: '0'}];
    }) } as unknown as EntityManager;
    await resumoMedicao(manager, o);
    const sql = consultas.find(q => q.includes('FROM atividades a')) ?? '';
    expect(sql).toContain('EXISTS (');
    expect(sql).toContain('atividade_ocorrencias ao');
    expect(sql).toContain('a."ocorrenciaId"=$1');
    expect(sql).not.toContain('OR am.atividade_id IS NOT NULL');
  });
});
