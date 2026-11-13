import { quantidadeApiParaBR, quantidadeBRParaApi } from './numero-quantidade-br';

describe('quantidades pt-BR: distinguir milhares de decimais sem modificar valores da API', () => {
  it.each([
    ['20.000', '20000'],
    ['1', '1'],
    ['1.234,500', '1234.5'],
    ['0,125', '0.125'],
    ['20', '20'],
  ])('interpreta %s como %s', (entrada, esperado) => {
    expect(quantidadeBRParaApi(entrada)).toBe(esperado);
  });
  it.each(['', '-1', '1.00', '1,2345', '20.00,500', 'abc'])('rejeita entrada ambígua %s', entrada => {
    expect(quantidadeBRParaApi(entrada)).toBeNull();
  });
  it('apresenta valor antigo do banco 20.000 como 20, e não vinte mil', () => {
    expect(quantidadeApiParaBR('20.000')).toBe('20');
    expect(quantidadeApiParaBR('20000.000')).toBe('20.000');
  });
});
