import { normalizarVinculoQuantidade, validarReferenciaComprovacao } from './quantidade-evidencias.js';
const dados = { quantidadeExecutada: '25.125', ocorrenciaQuantidadeId: 'ocorrencia', origemQuantidade: 'NOVA_EXECUCAO' as const, referenciaExecucao: '  Lote  A ' };
test('quantidade não vinculada a uma ocorrência não pode ser declarada', () => {
  expect(() => normalizarVinculoQuantidade({ quantidadeExecutada: '25' })).toThrow();
});
test('nova execução mantém referência normalizada e uma única ocorrência', () => {
  expect(normalizarVinculoQuantidade(dados)).toEqual({ quantidadeDeclarada:'25.125', ocorrenciaQuantidadeId:'ocorrencia', origemQuantidade:'NOVA_EXECUCAO', referenciaExecucao:'lote a' });
});
test('prova de quantidade já registrada mantém natureza documental', () => {
  expect(normalizarVinculoQuantidade({ ...dados, origemQuantidade:'COMPROVACAO' })?.origemQuantidade).toBe('COMPROVACAO');
});
test('quantidades negativas, zero e metadados sem quantidade são recusados', () => {
  expect(() => normalizarVinculoQuantidade({...dados, quantidadeExecutada:'0'})).toThrow();
  expect(() => normalizarVinculoQuantidade({...dados, quantidadeExecutada:'-1'})).toThrow();
  expect(() => normalizarVinculoQuantidade({ocorrenciaQuantidadeId:'x'})).toThrow();
  expect(normalizarVinculoQuantidade({})).toBeNull();
});


test('R41: comprovante deve referenciar execução válida na mesma ocorrência e não exceder sua quantidade', () => {
  const fonte = { ocorrenciaId:'oc-1', referencia:'manual:l-1', quantidade:'25.000', rotulo:'Lançamento' };
  expect(validarReferenciaComprovacao([fonte], 'oc-1', 'manual:l-1','25')).toBe(fonte);
  expect(() => validarReferenciaComprovacao([fonte], 'oc-2','manual:l-1','25')).toThrow();
  expect(() => validarReferenciaComprovacao([fonte], 'oc-1','manual:inexistente','25')).toThrow();
  expect(() => validarReferenciaComprovacao([fonte], 'oc-1','manual:l-1','26')).toThrow();
});

test('saldo quantitativo direto reserva também as declarações pendentes', async () => {
  const { exigirSaldoQuantidadeDireta } = await import('./quantidade-evidencias.js');
  const meta = { id: 'e', contratoId: 'c', tipo: 'QUANTITATIVO', quantidadePrevista: '20' } as Parameters<typeof exigirSaldoQuantidadeDireta>[1];
  const manager = (quantidade: string) => ({query: async () => [
    {quantidade:'15',situacao:'APROVADO'}, {quantidade,situacao:'PENDENTE'}, {quantidade:'100',situacao:'REJEITADO'}, {quantidade:'100',situacao:'APROVADO',referenciaExecucao:'manual:id'},
  ]}) as unknown as Parameters<typeof exigirSaldoQuantidadeDireta>[0];
  await expect(exigirSaldoQuantidadeDireta(manager('5'),meta)).resolves.toBeUndefined();
  await expect(exigirSaldoQuantidadeDireta(manager('5.001'),meta)).rejects.toThrow('meta disponível');
});

test('comprovação direta identifica a fonte e não exige ocorrência artificial',()=>{
  expect(normalizarVinculoQuantidade({quantidadeExecutada:'2',origemQuantidade:'COMPROVACAO',referenciaExecucao:'manual:abc'})).toMatchObject({ocorrenciaQuantidadeId:null,origemQuantidade:'COMPROVACAO'});
  const fonte={ocorrenciaId:'',referencia:'manual:abc',quantidade:'2',rotulo:'Manual'};
  expect(validarReferenciaComprovacao([fonte],'','manual:abc','2')).toBe(fonte);
  expect(()=>validarReferenciaComprovacao([fonte],'','manual:abc','3')).toThrow();
});
