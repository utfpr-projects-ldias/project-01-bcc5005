import { quantidadeApiParaBR, quantidadeBRParaApi, milesimosApi, formatarMilesimos, percentualQuantidadeExata } from './numero-quantidade-br';

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

it('B06: mantém todos os dígitos de numeric(18,3), inclusive o último milésimo',()=>{
  expect(quantidadeApiParaBR('999999999999999.998')).toBe('999.999.999.999.999,998');
  expect(quantidadeBRParaApi('999.999.999.999.999,998')).toBe('999999999999999.998');
  expect(quantidadeBRParaApi('1.000.000.000.000.000')).toBeNull();
});

it('B07: mantém diferença de um milésimo mesmo no limite de numeric(18,3)',()=>{
  const meta=milesimosApi('999999999999999.999'), realizado=milesimosApi('999999999999999.998');
  expect(meta-realizado).toBe(BigInt(1));
  expect(formatarMilesimos(meta-realizado)).toBe('0,001');
  expect(percentualQuantidadeExata(realizado,meta)).toBe(99.999);
  expect(percentualQuantidadeExata(meta,meta)).toBe(100);
});
