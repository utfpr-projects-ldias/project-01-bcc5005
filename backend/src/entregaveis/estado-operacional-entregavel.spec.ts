import { estadoOperacionalEntregavel, estadoOcorrenciaReconhecida, indicadoresPrazo, indicadoresPrazoEntregavel } from './estado-operacional-entregavel.js';
import { StatusExecucaoEntregavel as S } from './status-execucao-entregavel.enum.js';
import { StatusOcorrencia as O } from '../ocorrencias/status-ocorrencia.enum.js';
const novo = { statusExecucao: S.NAO_INICIADO, reabertoEm: null, arquivadoEm: null, dataEfetivaMarco: null };
const prevista = { status: O.NAO_INICIADO, dataRealizada: null, substituidaEm: null };

test.each(['UNICO','QUANTITATIVO','RECORRENTE','CONTINUO','MARCO'])('novo %s sem fatos de execução permanece não iniciado', () => {
  expect(estadoOperacionalEntregavel(novo,0,[])).toBe(S.NAO_INICIADO);
  expect(estadoOperacionalEntregavel(novo,0,[prevista])).toBe(S.NAO_INICIADO);
});
test('execução reconhecida inicia obrigação; 100% não significa decisão de conclusão', () => {
  expect(estadoOperacionalEntregavel(novo,20,[])).toBe(S.EM_ANDAMENTO);
  expect(estadoOperacionalEntregavel(novo,100,[])).toBe(S.EM_ANDAMENTO);
  expect(estadoOperacionalEntregavel(novo,0,[])).toBe(S.NAO_INICIADO);
});
test('ocorrência efetivamente iniciada pode manter o agregado em zero', () => {
  expect(estadoOperacionalEntregavel(novo,0,[{...prevista,status:O.EM_ANDAMENTO}])).toBe(S.EM_ANDAMENTO);
  expect(estadoOperacionalEntregavel(novo,0,[{...prevista,status:O.EM_ANDAMENTO,substituidaEm:new Date()}])).toBe(S.NAO_INICIADO);
});
test.each([S.PENDENTE_CONCLUSAO,S.PENDENTE_CONCLUSAO_PARCIAL,S.PENDENTE_ENCERRAMENTO,S.CONCLUIDO,S.CONCLUIDO_PARCIALMENTE,S.FINALIZADO])('preserva decisão %s', status => {
  expect(estadoOperacionalEntregavel({...novo,statusExecucao:status},0,[])).toBe(status);
  expect(estadoOperacionalEntregavel({...novo,statusExecucao:status},100,[])).toBe(status);
});
test('atraso é independente do percentual, não começa no próprio vencimento', () => {
  for (const s of [S.NAO_INICIADO,S.EM_ANDAMENTO,S.PENDENTE_CONCLUSAO,S.PENDENTE_CONCLUSAO_PARCIAL,'EM_REVISAO']) {
    expect(indicadoresPrazo('2026-11-23',s,false,null,'2026-11-24')).toEqual({atrasado:true,finalizadoComAtraso:false});
    expect(indicadoresPrazo('2026-11-24',s,false,null,'2026-11-24').atrasado).toBe(false);
  }
  expect(indicadoresPrazo(null,S.EM_ANDAMENTO,false,null,'2026-11-24').atrasado).toBe(false);
});
test('prazo global não herda atraso da ocorrência; fechamento tardio mantém histórico', () => {
  expect(indicadoresPrazo('2026-11-20',O.EM_ANDAMENTO,false,null,'2026-11-24').atrasado).toBe(true);
  expect(indicadoresPrazo('2026-11-30',S.EM_ANDAMENTO,false,null,'2026-11-24').atrasado).toBe(false);
  expect(indicadoresPrazo('2026-11-20',S.FINALIZADO,false,'2026-11-22','2026-11-24')).toEqual({atrasado:false,finalizadoComAtraso:true});
  expect(indicadoresPrazo('2026-11-20',S.CONCLUIDO,false,'2026-11-20','2026-11-24')).toEqual({atrasado:false,finalizadoComAtraso:false});
  expect(indicadoresPrazo('2026-11-20',S.EM_ANDAMENTO,true,null,'2026-11-24').atrasado).toBe(false);
});
test('histórico usa data civil brasileira: 01h UTC ainda é o dia anterior em São Paulo', () => {
  expect(indicadoresPrazoEntregavel({terminoPrevisto:'2026-11-20',arquivadoEm:null,finalizadoEm:new Date('2026-11-21T01:00:00Z')},S.CONCLUIDO,'2026-11-24').finalizadoComAtraso).toBe(false);
});

test('medição individual reconhecida inicia o período sem alterar o percentual consolidado recorrente', () => {
  const status = estadoOcorrenciaReconhecida(prevista,{progressoPercentual:10,quantidadeExecutada:0});
  expect(status).toBe(O.EM_ANDAMENTO);
  expect(estadoOperacionalEntregavel(novo,0,[{...prevista,status}])).toBe(S.EM_ANDAMENTO);
  expect(estadoOcorrenciaReconhecida(prevista,{progressoPercentual:0,quantidadeExecutada:0})).toBe(O.NAO_INICIADO);
  expect(estadoOcorrenciaReconhecida({...prevista,status:O.ENCERRADA},{progressoPercentual:40,quantidadeExecutada:4})).toBe(O.ENCERRADA);
});

test('R51: reabertura restaura atraso ativo sem converter decisão histórica em conclusão vigente', () => {
  const base = {terminoPrevisto:'2026-11-20',arquivadoEm:null,finalizadoEm:new Date('2026-11-22T12:00:00Z')};
  expect(indicadoresPrazoEntregavel({...base,reabertoEm:new Date('2026-11-23T12:00:00Z')},S.CONCLUIDO,'2026-11-24')).toEqual({atrasado:true,finalizadoComAtraso:false});
  expect(indicadoresPrazoEntregavel(base,S.CONCLUIDO,'2026-11-24')).toEqual({atrasado:false,finalizadoComAtraso:true});
});
