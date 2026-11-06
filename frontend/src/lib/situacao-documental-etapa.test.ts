import { situacaoDocumentalEtapa, contratoDocumentalmenteConcluido, entregavelDocumentalmenteConcluido } from './situacao-documental-etapa';
import type { Etapa } from './etapas';
import type { Entregavel } from './entregaveis';
const etapa = { id:'etapa', status:'EM_ANDAMENTO' } as Etapa;
const entregavel = { id:'entregavel' } as Entregavel;
const resumoCompleto = { entregavel: { obrigatorias: 1, verificadas: 1 } } as never;
const resumoIncompleto = { entregavel: { obrigatorias: 1, verificadas: 0 } } as never;
test('comprovacao obrigatoria completa apresenta etapa como concluida', () => {
  expect(situacaoDocumentalEtapa(etapa, [entregavel], resumoCompleto)).toBe('CONCLUIDA');
});
test('retirar comprovacao ou arquivar ultimo entregavel regride indicador documental', () => {
  const concluida = { ...etapa, status: 'CONCLUIDA' as const };
  expect(situacaoDocumentalEtapa(concluida, [entregavel], resumoIncompleto)).toBe('EM_ANDAMENTO');
  expect(situacaoDocumentalEtapa(concluida, [], {})).toBe('EM_ANDAMENTO');
  expect(situacaoDocumentalEtapa(concluida, [entregavel], resumoCompleto)).toBe('CONCLUIDA');
});
test('nao transforma ausencia de consulta em falta de comprovacao', () => {
  const concluida = { ...etapa, status: 'CONCLUIDA' as const };
  expect(situacaoDocumentalEtapa(concluida, undefined, undefined)).toBe('CONCLUIDA');
  expect(situacaoDocumentalEtapa(etapa, [], {})).toBe('EM_ANDAMENTO');
});

test('evidência opcional também conclui a APRESENTAÇÃO documental quando todas estiverem verificadas', () => {
  const opcionalVerificada = { entregavel: { obrigatorias: 0, verificadas: 0, total: 1, verificadasTotal: 1 } };
  expect(situacaoDocumentalEtapa(etapa, [entregavel], opcionalVerificada)).toBe('CONCLUIDA');
  const opcionalPendente = { entregavel: { obrigatorias: 0, verificadas: 0, total: 1, verificadasTotal: 0 } };
  expect(situacaoDocumentalEtapa(etapa, [entregavel], opcionalPendente)).toBe('EM_ANDAMENTO');
});

test('todas as evidências ativas contam: obrigatória verificada com opcional pendente ainda não é completa', () => {
  expect(situacaoDocumentalEtapa(etapa, [entregavel], {
    entregavel: { obrigatorias: 1, verificadas: 1, total: 2, verificadasTotal: 1 },
  })).toBe('EM_ANDAMENTO');
  expect(situacaoDocumentalEtapa(etapa, [entregavel], {
    entregavel: { obrigatorias: 1, verificadas: 1, total: 2, verificadasTotal: 2 },
  })).toBe('CONCLUIDA');
});

// Reabertura explícita não fecha novamente sem uma nova ação, mesmo com filhos verificados.
test('etapa explicitamente reaberta não volta sozinha ao estado documental concluído', () => {
  const reaberta = { ...etapa, status: 'EM_ANDAMENTO' as const, reabertoEm: '2026-11-06T15:00:00Z' };
  expect(situacaoDocumentalEtapa(reaberta, [entregavel], resumoCompleto)).toBe('EM_ANDAMENTO');
});
test('entregável reaberto não é considerado documentalmente concluído', () => {
  expect(entregavelDocumentalmenteConcluido(
    { reabertoEm:'2026-11-06T15:00:00Z' }, { obrigatorias:1, verificadas:1, total:1, verificadasTotal:1 } as never
  )).toBe(false);
});
test('reabrir etapa não reabre entregável e contrato continua documentalmente pendente', () => {
  const e = { ...entregavel, etapaId:'etapa', arquivadoEm:null, reabertoEm:null } as Entregavel;
  const etapaReaberta = { ...etapa, arquivadoEm:null, reabertoEm:'2026-11-06T15:00:00Z' } as Etapa;
  expect(entregavelDocumentalmenteConcluido(e, { total:1, verificadasTotal:1 } as never)).toBe(true);
  expect(contratoDocumentalmenteConcluido({reabertoEm:null}, [etapaReaberta], [e],
    { [e.id]: { total:1, verificadasTotal:1 } as never })).toBe(false);
});
