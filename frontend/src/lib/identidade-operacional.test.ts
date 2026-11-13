import { CLASSES_ACAO_MENU, estadoDoObjeto } from './identidade-operacional';

test.each([
  ['contrato', 'CANCELADO', 'cancelado'],
  ['contrato', 'ENCERRADO', 'encerrado'],
  ['contrato', 'FINALIZADO', 'finalizado'],
  ['contrato', 'CONCLUIDO', 'concluido'],
  ['contrato', 'PLANEJAMENTO', 'nao-iniciado'],
  ['etapa', 'CONCLUIDA', 'concluido'],
  ['etapa', 'ENCERRADA', 'encerrado'],
  ['etapa', 'FINALIZADA', 'finalizado'],
  ['entregavel', 'PENDENTE_CONCLUSAO', 'concluido'],
  ['ocorrencia', 'PENDENTE_ENCERRAMENTO', 'finalizado'],
  ['atividade', 'PENDENTE_CONCLUSAO', 'concluido'],
  ['atividade', 'VERIFICADA', 'concluido'],
  ['evidencia', 'PENDENTE_VERIFICACAO', 'pendente'],
  ['evidencia', 'SEM_ENVIO', 'pendente'],
  ['documento', 'VERIFICADO', 'concluido'],
] as const)('%s com status %s usa identidade %s', (objeto, status, esperado) => {
  expect(estadoDoObjeto({ objeto, status })).toBe(esperado);
});

test('arquivamento prevalece; revisão é uma reabertura, nunca muda o dado original', () => {
  expect(estadoDoObjeto({ objeto: 'entregavel', status: 'CONCLUIDO', arquivado: true })).toBe('arquivado');
  expect(estadoDoObjeto({ objeto: 'evidencia', status: 'VERIFICADA', reaberto: true })).toBe('revisao');
});

test('ações com consequências distintas têm identidades distintas', () => {
  expect(CLASSES_ACAO_MENU.cancelar).not.toBe(CLASSES_ACAO_MENU.concluir);
  expect(CLASSES_ACAO_MENU.encerrar).not.toBe(CLASSES_ACAO_MENU.reabrir);
  expect(CLASSES_ACAO_MENU.arquivar).not.toBe(CLASSES_ACAO_MENU.excluir);
});
