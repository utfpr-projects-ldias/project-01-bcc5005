import { RepositorioConsultas, chaveTexto } from './repositorio-consultas';
import { sincronizarEvidenciaCompartilhada } from './sincronizar-evidencia-compartilhada';

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
