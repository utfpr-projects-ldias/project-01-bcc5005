import { situacaoDocumentalEtapa, contratoDocumentalmenteConcluido, entregavelDocumentalmenteConcluido } from './situacao-documental-etapa';
import type { Etapa } from './etapas';
import type { Entregavel } from './entregaveis';
const etapa = { id:'etapa', status:'EM_ANDAMENTO' } as Etapa;
const entregavel = { id:'entregavel' } as Entregavel;
const resumoCompleto = { entregavel: { obrigatorias: 1, verificadas: 1 } } as never;
const resumoIncompleto = { entregavel: { obrigatorias: 1, verificadas: 0 } } as never;
test('comprovação completa não promove etapa sem status operacional concluído', () => {
  expect(situacaoDocumentalEtapa(etapa, [entregavel], resumoCompleto)).toBe('EM_ANDAMENTO');
});
test('retirar comprovacao ou arquivar ultimo entregavel regride indicador documental', () => {
  const concluida = { ...etapa, status: 'CONCLUIDA' as const };
  expect(situacaoDocumentalEtapa(concluida, [entregavel], resumoIncompleto)).toBe('EM_ANDAMENTO');
  expect(situacaoDocumentalEtapa(concluida, [], {})).toBe('EM_ANDAMENTO');
  expect(situacaoDocumentalEtapa(concluida, [{ ...entregavel, statusExecucao: 'CONCLUIDO' } as Entregavel], resumoCompleto)).toBe('CONCLUIDA');
});
test('nao transforma ausencia de consulta em falta de comprovacao', () => {
  const concluida = { ...etapa, status: 'CONCLUIDA' as const };
  expect(situacaoDocumentalEtapa(concluida, undefined, undefined)).toBe('CONCLUIDA');
  expect(situacaoDocumentalEtapa(etapa, [], {})).toBe('EM_ANDAMENTO');
});

test('evidência opcional também conclui a APRESENTAÇÃO documental quando todas estiverem verificadas', () => {
  const opcionalVerificada = { entregavel: { obrigatorias: 0, verificadas: 0, total: 1, verificadasTotal: 1 } };
  expect(situacaoDocumentalEtapa(etapa, [entregavel], opcionalVerificada)).toBe('EM_ANDAMENTO');
  const opcionalPendente = { entregavel: { obrigatorias: 0, verificadas: 0, total: 1, verificadasTotal: 0 } };
  expect(situacaoDocumentalEtapa(etapa, [entregavel], opcionalPendente)).toBe('EM_ANDAMENTO');
});

test('todas as evidências ativas contam: obrigatória verificada com opcional pendente ainda não é completa', () => {
  expect(situacaoDocumentalEtapa(etapa, [entregavel], {
    entregavel: { obrigatorias: 1, verificadas: 1, total: 2, verificadasTotal: 1 },
  })).toBe('EM_ANDAMENTO');
  expect(situacaoDocumentalEtapa(etapa, [entregavel], {
    entregavel: { obrigatorias: 1, verificadas: 1, total: 2, verificadasTotal: 2 },
  })).toBe('EM_ANDAMENTO');
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

test('contrato aguarda conclusão explícita de filhos ainda abertos, embora documentalmente completos', () => {
  const e = { ...entregavel, etapaId:'etapa', arquivadoEm:null, reabertoEm:null,
    statusExecucao: null } as Entregavel;
  const etapaConcluida = { ...etapa, status:'CONCLUIDA' as const, arquivadoEm:null, reabertoEm:null };
  const resumo = { [e.id]: { total:1, verificadasTotal:1, obrigatorias:1, verificadas:1 } };
  expect(contratoDocumentalmenteConcluido({reabertoEm:null}, [etapaConcluida], [e], resumo)).toBe(false);
  expect(contratoDocumentalmenteConcluido({reabertoEm:null}, [etapaConcluida],
    [{ ...e, statusExecucao:'CONCLUIDO' }], resumo)).toBe(true);
});

import { etapaPodeSerConcluida } from './situacao-documental-etapa';

test('etapa não oferece Concluir quando entregável está em revisão, mesmo com 100% das evidências', () => {
  const filho = { ...entregavel, etapaId: etapa.id, statusExecucao:'EM_ANDAMENTO',
    reabertoEm:'2026-11-07T01:00:00Z', arquivadoEm:null,
    evidenciasEsperadas:[{id:'e1', arquivadoEm:null, reabertoEm:null}] } as Entregavel;
  expect(etapaPodeSerConcluida(etapa, [filho], {
    [filho.id]: {total:1,verificadasTotal:1,obrigatorias:1,verificadas:1},
  })).toBe(false);
});

test('etapa só oferece Concluir se os filhos foram reconcluídos e nenhuma evidência continua em revisão', () => {
  const filho = { ...entregavel, etapaId: etapa.id, statusExecucao:'CONCLUIDO', reabertoEm:null,
    arquivadoEm:null, evidenciasEsperadas:[{id:'e1', arquivadoEm:null, reabertoEm:null}] } as Entregavel;
  const resumo = { [filho.id]: {total:1,verificadasTotal:1,obrigatorias:1,verificadas:1} };
  expect(etapaPodeSerConcluida(etapa, [filho], resumo)).toBe(true);
  expect(etapaPodeSerConcluida(etapa, [{ ...filho, evidenciasEsperadas:[{...filho.evidenciasEsperadas[0], reabertoEm:'2026-11-07T01:20:00Z'}] }], resumo)).toBe(false);
});


test('etapa só exibe Concluída quando cada entregável ativo está concluído, independente do arquivo de filhos arquivados', () => {
  const ativa = { ...entregavel, statusExecucao: 'CONCLUIDO', arquivadoEm: null } as Entregavel;
  const arquivada = { ...entregavel, id: 'outra', statusExecucao: 'NAO_INICIADO', arquivadoEm: '2026-11-08T01:00:00Z' } as Entregavel;
  const concluida = { ...etapa, status: 'CONCLUIDA' as const };
  expect(situacaoDocumentalEtapa(concluida, [ativa, arquivada], resumoCompleto)).toBe('CONCLUIDA');
  expect(situacaoDocumentalEtapa(concluida, [{ ...ativa, statusExecucao: 'EM_ANDAMENTO' }], resumoCompleto)).toBe('EM_ANDAMENTO');
});
