import { tituloOcorrenciaRecorrente } from './titulo-recorrente.js';

describe('título automático recorrente', () => {
  const periodo = 'Ocorrência #1 (2026-11-01 a 2026-11-30)';
  it('não ultrapassa o máximo aceito na edição, mesmo com nome extenso', () => {
    const titulo = tituloOcorrenciaRecorrente('Manutenção de computadores e estações de trabalho do contrato', periodo);
    expect(titulo.length).toBeLessThanOrEqual(50);
    expect(titulo).toContain(periodo);
  });
  it('preserva o nome quando há espaço e nunca gera título vazio', () => {
    expect(tituloOcorrenciaRecorrente('TI', 'Semana 1')).toBe('TI - Semana 1');
    expect(tituloOcorrenciaRecorrente('', periodo)).toBe(periodo);
  });
  it('trata sufixo maior que o limite sem ultrapassar a coluna de edição', () => {
    expect(tituloOcorrenciaRecorrente('Entregável', 'X'.repeat(80))).toBe('X'.repeat(50));
  });
});
