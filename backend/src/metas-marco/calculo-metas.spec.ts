import { calcularAvancoMeta, resumirPreparacao } from './calculo-metas.js';

describe('Preparação ponderada do Marco',()=>{
  it('reconhece objetivo descritivo apenas após decisão',()=>{
    expect(calcularAvancoMeta('DESCRITIVA',null,null,false)).toBe(0);
    expect(calcularAvancoMeta('DESCRITIVA',null,null,true)).toBe(100);
  });
  it('mede quantidade real e não antecipa 100%',()=>{
    expect(calcularAvancoMeta('QUANTITATIVA','6','10',false)).toBe(60);
    expect(calcularAvancoMeta('QUANTITATIVA','11','10',false)).toBe(100);
    expect(calcularAvancoMeta('QUANTITATIVA','999999999999999.998','999999999999999.999',false)).toBeLessThan(100);
  });
  it('usa os pesos absolutos sem normalizar o saldo ainda não distribuído',()=>{
    expect(resumirPreparacao([{pesoCentesimos:6000,percentualPreparacao:100,pronto:true}])).toMatchObject({percentualPreparacao:60,apto:false});
  });
  it('não confunde preparação física e aprovação administrativa',()=>{
    const itens=[{pesoCentesimos:6000,percentualPreparacao:100,pronto:true},{pesoCentesimos:4000,percentualPreparacao:100,pronto:false}];
    expect(resumirPreparacao(itens)).toMatchObject({apto:false});
    itens[1].pronto=true;expect(resumirPreparacao(itens)).toMatchObject({apto:true,percentualPreparacao:100});
  });
  it('não conclui Marco vazio',()=>{expect(resumirPreparacao([])).toMatchObject({apto:false,percentualPreparacao:0});});
});
