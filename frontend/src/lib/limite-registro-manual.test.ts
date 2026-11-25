import { valorDentroDoSaldo } from './limite-registro-manual';
test('limita quantidades e percentuais sem impedir limpar o campo',()=>{
  expect(valorDentroDoSaldo('',25,3)).toBe(true);
  expect(valorDentroDoSaldo('0',25,3)).toBe(true);
  expect(valorDentroDoSaldo('2',25,3)).toBe(true);
  expect(valorDentroDoSaldo('25',25,3)).toBe(true);
  expect(valorDentroDoSaldo('25,001',25,3)).toBe(false);
  expect(valorDentroDoSaldo('-1',25,3)).toBe(false);
  expect(valorDentroDoSaldo('100,01',100,2)).toBe(false);
  expect(valorDentroDoSaldo('99,99',100,2)).toBe(true);
  expect(valorDentroDoSaldo('1.001',100,2)).toBe(false);
  expect(valorDentroDoSaldo('2',0,3)).toBe(false);
});
