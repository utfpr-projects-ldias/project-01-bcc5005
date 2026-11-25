import { pedidoManual, mesmoPedido } from './pedido-manual.js';
import { validarReenvioManualDireta } from './quantidade-manual-direta.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';

describe('B07 — pedido manual imutável',()=>{
  const pedido={id:'id',valor:'12.500',data:'2026-11-01',observacao:' lote '};
  const original=pedidoManual(pedido);
  const ator={id:'autor'} as UsuarioAutenticado;
  const registro={id:'id',contrato_id:'c',entregavel_id:'e',quantidade:'10.000',data_execucao:'2026-11-02',observacao:'corrigido',autor_id:'autor',status:'APROVADO',decidido_por:null,decidido_em:null,pedido_original:original};
  it('normaliza valores sem arredondar',()=>{
    expect(mesmoPedido(original,pedidoManual({...pedido,valor:'12.5',observacao:'lote'}))).toBe(true);
    expect(mesmoPedido(original,pedidoManual({...pedido,valor:'12.501'}))).toBe(false);
  });
  it('reenvia o original mesmo depois de uma correção',()=>{
    expect(validarReenvioManualDireta(registro,pedido,ator)).toBe(registro);
  });
  it('rejeita outro autor ou pedido',()=>{
    expect(()=>validarReenvioManualDireta(registro,pedido,{...ator,id:'outro'})).toThrow();
    expect(()=>validarReenvioManualDireta(registro,{...pedido,valor:'10'},ator)).toThrow();
  });
});
