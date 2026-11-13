import { contextoDaDecisao, coresDecisao } from './cores-decisoes';

describe('cor das decisões administrativas', () => {
  test.each([
    ['Cancelar contrato', 'cancelado'],
    ['Suspender contrato', 'suspenso'],
    ['Encerrar contrato', 'encerrado'],
    ['Solicitar encerramento', 'finalizado'],
    ['Finalizar entregável', 'finalizado'],
    ['Aprovar conclusão de ocorrência', 'concluido'],
    ['Arquivar evidência', 'arquivado'],
    ['Reabrir contrato cancelado', 'revisao'],
    ['Reativar evidência arquivada', 'revisao'],
    ['Cancelar solicitação de conclusão', 'revisao'],
  ] as const)('%s recebe estado %s', (acao, esperado) => {
    expect(contextoDaDecisao(acao)).toBe(esperado);
    expect(coresDecisao(contextoDaDecisao(acao)).borda).not.toContain('brand-green');
  });
  test('a ação arquivar prevalece sobre o estado concluído do registro', () => {
    expect(contextoDaDecisao('Arquivar atividade', 'concluido')).toBe('arquivado');
  });
  test('edição comum não assume cor de encerramento', () => {
    expect(contextoDaDecisao('Editar contrato')).toBe('normal');
  });
});
