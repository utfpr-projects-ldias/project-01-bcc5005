import { prepararEdicaoContrato, estadoEdicaoContrato, type Contrato, type DadosContrato } from './contratos';
const base: Contrato = {id:'c',codigoPublico:'00001',numeroContrato:'1',processoAdministrativo:null,orgaoContratante:'UTFPR',unidadeResponsavel:null,objeto:'Original',descricao:null,dataAssinatura:null,inicioVigencia:'2035-01-01',terminoVigencia:'2035-12-31',status:'PLANEJAMENTO',responsavelInternoId:null,fiscalGestor:null,modoCalculo:'SIMPLES',observacoes:null};
test('envia somente alteração real e a versão que originou o formulário',()=>{
  const dados:DadosContrato={...base,objeto:'Alterado'};
  expect(prepararEdicaoContrato(base,dados)).toEqual({objeto:'Alterado',estadoAnterior:estadoEdicaoContrato(base)});
  expect(prepararEdicaoContrato(base,{...base,modoCalculo:'PONDERADO'})).toEqual({});
  expect(estadoEdicaoContrato({...base,descricao:'Mudança concorrente'})).not.toBe(estadoEdicaoContrato(base));
});
test('não reenvia metadados de resposta nem campos sem edição',()=>{
  expect(prepararEdicaoContrato(base,{...base,observacoes:'Nova observação',conclusaoSolicitadaEm:'2035-01-01T00:00:00.000Z'})).toEqual({observacoes:'Nova observação',estadoAnterior:estadoEdicaoContrato(base)});
});
