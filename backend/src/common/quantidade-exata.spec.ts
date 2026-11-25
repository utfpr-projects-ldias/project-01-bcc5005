import { milesimos, percentualQuantidade, quantidadeDecimal } from './quantidade-exata.js';

describe('quantidade decimal exata', () => {
  it('soma e compara milésimos sem arredondamento binário', () => {
    expect(milesimos('0.100') + milesimos('0.200')).toBe(milesimos('0.300'));
    expect(quantidadeDecimal(milesimos('999999999999999.998') + 1n)).toBe('999999999999999.999');
    expect(milesimos('999999999999999.998')).toBeLessThan(milesimos('999999999999999.999'));
  });
  it('nunca arredonda uma meta incompleta para 100%', () => {
    const meta = milesimos('999999999999999.999');
    expect(percentualQuantidade(meta - 1n, meta)).toBeLessThan(100);
    expect(percentualQuantidade(meta - 1n, meta, false)).toBeLessThan(100);
    expect(percentualQuantidade(meta + 1n, meta)).toBe(100);
    expect(percentualQuantidade(0n, 0n)).toBeNull();
  });
  it.each(['NaN', 'Infinity', '-1', '0.0001', '1e3'])('rejeita decimal inválido: %s', valor => {
    expect(() => milesimos(valor)).toThrow(RangeError);
  });
});
