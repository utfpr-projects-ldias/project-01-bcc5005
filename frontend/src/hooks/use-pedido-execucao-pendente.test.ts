import { act, renderHook, waitFor } from '@testing-library/react';
import { usePedidoExecucaoPendente, type PedidoExecucaoPendente } from './use-pedido-execucao-pendente';

afterEach(()=>sessionStorage.clear());
it('mantém o pedido original após remontagem e o isola por conta',async()=>{
  const pedido:PedidoExecucaoPendente={id:'uuid',valor:'1.001',data:'2026-11-01',observacao:'lote',ocorrenciaId:'o',endpoint:'OCORRENCIA'};
  const inicial=renderHook(()=>usePedidoExecucaoPendente('a:c:o'));
  await waitFor(()=>expect(inicial.result.current.pronto).toBe(true));
  act(()=>inicial.result.current.definir(pedido)); inicial.unmount();
  const novo=renderHook(({chave})=>usePedidoExecucaoPendente(chave),{initialProps:{chave:'a:c:o'}});
  await waitFor(()=>expect(novo.result.current.pedido).toEqual(pedido));
  novo.rerender({chave:'b:c:o'});
  expect(novo.result.current.pedido).toBeNull();
  await waitFor(()=>expect(novo.result.current.pronto).toBe(true));
  novo.rerender({chave:'a:c:o'});
  await waitFor(()=>expect(novo.result.current.pedido).toEqual(pedido));
  act(()=>novo.result.current.definir(null));
  expect(sessionStorage.getItem('pi:execucao-pendente:a:c:o')).toBeNull();
});
