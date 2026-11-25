import { valorContribuicaoValido } from './validacao-contribuicao';
describe('validação de contribuições da aba Geral',()=>{
  test('percentual respeita o saldo incluindo reservas',()=>{
    expect(valorContribuicaoValido('10',false,1000)).toBe(true);
    expect(valorContribuicaoValido('10,01',false,1000)).toBe(false);
    expect(valorContribuicaoValido('0',false,1000)).toBe(false);
    expect(valorContribuicaoValido('1.001',false,1000)).toBe(false);
  });
  test('quantidade real não é truncada à meta ou a 100',()=>{
    expect(valorContribuicaoValido('125,750',true,0)).toBe(true);
    expect(valorContribuicaoValido('0.001',true,0)).toBe(true);
    expect(valorContribuicaoValido('-1',true,0)).toBe(false);
    expect(valorContribuicaoValido('0.0001',true,0)).toBe(false);
  });
});

test('percentual não pode superar 100 mesmo com saldo inconsistente',()=>{
 expect(valorContribuicaoValido('101',false,20000)).toBe(false);
 expect(valorContribuicaoValido('100',false,10000)).toBe(true);
 expect(valorContribuicaoValido('0,01',false,1)).toBe(true);
 expect(valorContribuicaoValido('2444444444.4',false,10000)).toBe(false);
 expect(valorContribuicaoValido('120',true,10000)).toBe(true);
});
