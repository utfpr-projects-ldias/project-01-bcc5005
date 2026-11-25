import { incluiRegistroCalendario as inclui } from './filtros-calendario-registros';
test('ocorrências concluídas e não concluídas são grupos complementares',()=>{
  expect(inclui('ocorrencias','CONCLUIDO','CONCLUIDAS')).toBe(true);
  expect(inclui('ocorrencias','CONCLUIDO_PARCIALMENTE','NAO_CONCLUIDAS')).toBe(true);
  expect(inclui('ocorrencias','EM_ANDAMENTO','CONCLUIDAS')).toBe(false);
});
test('verificação é distinta de registro, pendência e rejeição',()=>{
  expect(inclui('atividades','VERIFICADA','VERIFICADAS')).toBe(true);
  expect(inclui('evidencias','REJEITADA','NAO_VERIFICADAS')).toBe(true);
  expect(inclui('manuais','APROVADO','VERIFICADAS')).toBe(true);
  expect(inclui('manuais','PENDENTE','NAO_VERIFICADAS')).toBe(true);
  expect(inclui('evidencias','ARQUIVADA','')).toBe(false);
});

test('execuções oferecem grupos fixos e não incluem registros inativos',()=>{
  expect(inclui('execucoes','APROVADO','VERIFICADAS')).toBe(true);
  expect(inclui('execucoes','PENDENTE','NAO_VERIFICADAS')).toBe(true);
  expect(inclui('execucoes','REJEITADO','NAO_VERIFICADAS')).toBe(true);
  expect(inclui('execucoes','APROVADO','NAO_VERIFICADAS')).toBe(false);
  expect(inclui('execucoes','INATIVO','NAO_VERIFICADAS')).toBe(false);
  expect(inclui('execucoes','INATIVO','')).toBe(false);
});
