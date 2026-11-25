import { alteracoesLegiveis, rotuloEventoOcorrencia } from './historico-legivel';

test('apresenta somente campos alterados em português, preservando valores anteriores', () => {
  expect(alteracoesLegiveis({status:'NAO_INICIADO',titulo:'Teste',observacoes:'Antes'},
    {status:'NAO_INICIADO',titulo:'Teste',observacoes:'Depois'}))
    .toEqual([{campo:'Observações',antes:'Antes',depois:'Depois'}]);
});
test('explica status e valores booleanos sem despejar JSON', () => {
  expect(alteracoesLegiveis({status:'NAO_INICIADO',exigeAtividade:true},
    {status:'EM_ANDAMENTO',exigeAtividade:false}))
    .toEqual([{campo:'Situação',antes:'Não iniciada',depois:'Em andamento'},
      {campo:'Exige atividade',antes:'Sim',depois:'Não'}]);
  expect(rotuloEventoOcorrencia('OCORRENCIA_EDITADA')).toBe('Ocorrência alterada');
});
