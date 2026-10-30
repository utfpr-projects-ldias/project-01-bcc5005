import { RepositorioConsultas, chaveTexto } from './repositorio-consultas';

test('deduplica leituras simultaneas', async () => {
  const cache = new RepositorioConsultas(); const consultar = jest.fn(async () => ({ id: 'a' }));
  const chave = chaveTexto(['identidade', 'me']);
  const [a,b] = await Promise.all([cache.buscar(chave, consultar), cache.buscar(chave, consultar)]);
  expect(consultar).toHaveBeenCalledTimes(1); expect(a).toEqual(b);
});
test('logout impede cache de receber resposta da sessao antiga', async () => {
  const cache = new RepositorioConsultas(); let resolver!: (v: {id:string}) => void;
  const chave = chaveTexto(['identidade','me']);
  const antigo = cache.buscar(chave, () => new Promise((r) => { resolver = r; }));
  await Promise.resolve(); cache.limpar(); cache.gravar(chave, {id:'B'});
  resolver({id:'A'}); await antigo;
  expect(cache.ler<{id:string}>(chave).dados).toEqual({id:'B'});
});
test('invalida consultas e nao aceita resposta obsoleta', async () => {
  const cache = new RepositorioConsultas(); let resolver!: (v:string[]) => void;
  const chave = chaveTexto(['contratos','lista']);
  const antigo = cache.buscar(chave, () => new Promise((r) => { resolver = r; }));
  await Promise.resolve(); cache.invalidar(['contratos']); cache.gravar(chave, ['novo']);
  resolver(['antigo']); await antigo;
  expect(cache.ler<string[]>(chave).dados).toEqual(['novo']);
});
test('403 limpa o dado do recurso protegido', async () => {
  const cache = new RepositorioConsultas(); const chave = chaveTexto(['contratos','detalhe','x']);
  cache.gravar(chave,{id:'x'});
  await expect(cache.buscar(chave, async () => { throw { status:403 }; }, { forcar:true })).rejects.toMatchObject({status:403});
  expect(cache.ler(chave).dados).toBeUndefined();
});
