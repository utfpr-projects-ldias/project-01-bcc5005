import type { EntityManager } from 'typeorm';
import type { Ocorrencia } from './ocorrencia.entity.js';
import { proximoStatusAutomatico, resumoMedicao } from './medicao-ocorrencia.js';

const base = (dados: Partial<Ocorrencia> = {}): Ocorrencia => ({
  id: 'oc-1', contratoId: 'contrato-1', status: 'EM_ANDAMENTO' as Ocorrencia['status'],
  evidenciaExigida: 'NENHUMA', minimoAtividadesVerificadas: 0,
  minimoEvidenciasVerificadas: 0, metaQuantidade: '10',
  ...dados,
} as Ocorrencia);

function simular(fotos: number, relatorios: number) {
  const consultar = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes('ocorrencia_lancamentos')) return Promise.resolve([{ total: '10' }]);
    if (sql.includes('atividade_ocorrencia_medicoes')) return Promise.resolve([{ registrada: '0', verificada: '0', verificadas: '0', pendentes: '0' }]);
    return Promise.resolve([{ fotos: String(fotos), relatorios: String(relatorios) }]);
  });
  return { query: consultar } as unknown as EntityManager;
}

describe('requisitos individuais de evidências', () => {
  it('não permite contar uma foto ou relatório duas vezes para satisfazer cotas', async () => {
    const o = base({ minimoFotos: 1, minimoRelatorios: 1, minimoEvidenciasLivres: 1 });
    const parcial = await resumoMedicao(simular(1, 1), o);
    expect(parcial.quantidadeExecutada).toBe(10);
    expect(parcial.metaAtingida).toBe(true);
    expect(parcial.requisitosAtendidos).toBe(false);
    expect(parcial.situacaoComprovacao).toBe('PARCIAL');
    const completa = await resumoMedicao(simular(2, 1), o);
    expect(completa.requisitosAtendidos).toBe(true);
    expect(completa.situacaoComprovacao).toBe('APRESENTADA');
  });

  it('mantém a regra antiga para ocorrências sem colunas individuais configuradas', async () => {
    const o = base({ evidenciaExigida: 'AMBOS', minimoEvidenciasVerificadas: 2 });
    expect((await resumoMedicao(simular(2, 0), o)).requisitosAtendidos).toBe(false);
    expect((await resumoMedicao(simular(1, 1), o)).requisitosAtendidos).toBe(true);
  });

  it('preserva andamento quando a ocorrência ainda não teve registro quantitativo', () => {
    const andamento = base({ metaQuantidade: null, status: 'EM_ANDAMENTO' as Ocorrencia['status'] });
    const resumo = { quantidadeRegistrada: 0, atividadesVerificadas: 0, atividadesPendentes: 0, metaAtingida: false, requisitosAtendidos: false };
    expect(proximoStatusAutomatico(andamento, resumo as Awaited<ReturnType<typeof resumoMedicao>>)).toBe('EM_ANDAMENTO');
  });
});
