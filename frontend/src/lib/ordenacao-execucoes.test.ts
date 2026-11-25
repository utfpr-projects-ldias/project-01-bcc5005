import { ordenarHistoricoExecucao } from './ordenacao-execucoes';
const itens=[{chave:'manual:1',data:'2026-11-19',contribuicao:2},{chave:'evidencia:1',data:'2026-11-23',contribuicao:10},{chave:'atividade:1',data:'2026-11-22',contribuicao:5},{chave:'ocorrencia:1',data:'',contribuicao:null}];
test.each([['recentes',['evidencia:1','atividade:1','manual:1','ocorrencia:1']],['antigos',['manual:1','atividade:1','evidencia:1','ocorrencia:1']],['maior',['evidencia:1','atividade:1','manual:1','ocorrencia:1']],['menor',['manual:1','atividade:1','evidencia:1','ocorrencia:1']]] as const)('R49 ordena todas as origens: %s',(ordem,esperado)=>{
  expect(ordenarHistoricoExecucao(itens,ordem).map(i=>i.chave)).toEqual(esperado);
  expect(itens[0].chave).toBe('manual:1');
});
