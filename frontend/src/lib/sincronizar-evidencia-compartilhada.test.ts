import { RepositorioConsultas, chaveTexto } from './repositorio-consultas';
import { sincronizarEvidenciaCompartilhada, observarRegistrosCompartilhados, EVENTO_REGISTROS_COMPARTILHADOS } from './sincronizar-evidencia-compartilhada';

test('envio compartilhado revalida entregáveis dos dois contratos', async () => {
  const cache=new RepositorioConsultas();
  const a=chaveTexto(['entregaveis','contrato','a']);
  const b=chaveTexto(['entregaveis','contrato','b']);
  const consultarA=jest.fn(async()=>['novo-a']), consultarB=jest.fn(async()=>['novo-b']);
  await Promise.all([cache.buscar(a,consultarA,{validadeMs:10000}),cache.buscar(b,consultarB,{validadeMs:10000})]);
  const pararA=cache.observar(a,()=>{}), pararB=cache.observar(b,()=>{});
  sincronizarEvidenciaCompartilhada(cache);
  await Promise.all([cache.buscar(a,consultarA,{validadeMs:10000}),cache.buscar(b,consultarB,{validadeMs:10000})]);
  expect(consultarA).toHaveBeenCalledTimes(2); expect(consultarB).toHaveBeenCalledTimes(2);
  pararA();pararB();
});

 test('um sinal recebido de outra aba invalida evidências, atividades e consultas diretas', async () => {
   const cache=new RepositorioConsultas();
   const chaves=[chaveTexto(['evidencias','destino']),chaveTexto(['atividades','destino'])];
   const consultar=jest.fn(async()=>['atualizado']);
   await Promise.all(chaves.map(chave=>cache.buscar(chave,consultar,{validadeMs:10000})));
   const parar=chaves.map(chave=>cache.observar(chave,()=>{}));
   const direto=jest.fn();
   window.addEventListener(EVENTO_REGISTROS_COMPARTILHADOS,direto);
   const fechar=observarRegistrosCompartilhados(cache);
   try {
     window.dispatchEvent(new StorageEvent('storage',{key:'pi:registros-compartilhados-v1',newValue:'1'}));
     await Promise.all(chaves.map(chave=>cache.buscar(chave,consultar,{validadeMs:10000})));
     expect(consultar).toHaveBeenCalledTimes(4);
     expect(direto).toHaveBeenCalledTimes(1);
   } finally { fechar(); parar.forEach(f=>f());window.removeEventListener(EVENTO_REGISTROS_COMPARTILHADOS,direto); }
 });
