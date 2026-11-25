import { jest } from '@jest/globals';
import { resumoMedicao } from './medicao-ocorrencia.js';

/** Impede que a contagem operacional volte a aceitar provas revogadas. */
describe('comprovação da ocorrência usa somente evidência atual e ativa', () => {
  it('a consulta exclui checklist arquivado/reaberto e versões antigas', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM ocorrencia_lancamentos')) return [{ total: '1' }];
      if (sql.includes('FROM atividades a')) return [{ registrada: '0', verificada: '0', verificadas: '0', pendentes: '0' }];
      return [{ fotos: '0', relatorios: '0' }];
    });
    const ocorrencia = { id: 'ocorrencia-qa', contratoId: 'contrato-qa',
      metaQuantidade: '1', minimoEvidenciasVerificadas: 1,
      evidenciaExigida: 'RELATORIO', minimoAtividadesVerificadas: 0 };
    const resumo = await resumoMedicao({query} as never, ocorrencia as never);
    expect(resumo.metaAtingida).toBe(true);
    expect(resumo.situacaoComprovacao).toBe('PARCIAL');
    expect(resumo.requisitosAtendidos).toBe(false);
    const sqlProvas = query.mock.calls[2][0];
    for (const regra of ["c.status='VERIFICADA'", 'c.verificado_em IS NOT NULL',
      'ev.arquivado_em IS NULL', 'ev.reaberto_em IS NULL',
      '(n.criado_em,n.id) > (c.criado_em,c.id)']) expect(sqlProvas).toContain(regra);
  });
});
