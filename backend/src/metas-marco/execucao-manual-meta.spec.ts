import { somarExecucoesMeta } from './execucao-manual-meta.js';
import { calcularAvancoMeta } from './calculo-metas.js';
import { quantidadeDecimal } from '../common/quantidade-exata.js';

describe('Execução manual direta da meta quantitativa',()=>{
  it('não reconhece lançamentos pendentes nem rejeitados',()=>{
    expect(somarExecucoesMeta([{quantidade:'2.125',status:'PENDENTE'},{quantidade:'8.001',status:'REJEITADO'}])).toEqual({aprovada:0n,reservada:2125n,pendentes:1});
  });
  it('soma quantidades aprovadas sem perder precisão e reserva separadamente',()=>{
    const r=somarExecucoesMeta([{quantidade:'0.100',status:'APROVADO'},{quantidade:'0.200',status:'APROVADO'},{quantidade:'0.700',status:'PENDENTE'}]);
    expect(r).toEqual({aprovada:300n,reservada:700n,pendentes:1});
    expect(calcularAvancoMeta('QUANTITATIVA',quantidadeDecimal(r.aprovada),'1.000',false)).toBe(30);
  });
  it('reconhece a quantidade integral somente depois da aprovação',()=>{
    const r=somarExecucoesMeta([{quantidade:'1.000',status:'APROVADO'}]);
    expect(calcularAvancoMeta('QUANTITATIVA',quantidadeDecimal(r.aprovada),'1.000',false)).toBe(100);
  });
});
