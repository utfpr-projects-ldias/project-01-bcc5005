import { CLASSES_ACAO_MENU, estadoDoObjeto } from './identidade-operacional';

test.each([
  ['contrato', 'CANCELADO', 'cancelado'],
  ['contrato', 'ENCERRADO', 'encerrado'],
  ['contrato', 'FINALIZADO', 'finalizado'],
  ['contrato', 'CONCLUIDO', 'concluido'],
  ['contrato', 'PLANEJAMENTO', 'andamento'],
  ['etapa', 'PLANEJADA', 'nao-iniciado'],
  ['ocorrencia', 'NAO_INICIADO', 'nao-iniciado'],
  ['etapa', 'CONCLUIDA', 'concluido'],
  ['etapa', 'CONCLUIDO_PARCIALMENTE', 'parcial'],
  ['entregavel', 'CONCLUIDO_PARCIALMENTE', 'parcial'],
  ['etapa', 'ENCERRADA', 'encerrado'],
  ['etapa', 'FINALIZADA', 'finalizado'],
  ['entregavel', 'PENDENTE_CONCLUSAO', 'pendente'],
  ['entregavel', 'NAO_INICIADO', 'nao-iniciado'],
  ['ocorrencia', 'PENDENTE_ENCERRAMENTO', 'pendente'],
  ['atividade', 'PENDENTE_CONCLUSAO', 'pendente'],
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


test('etapa reaberta usa identidade de revisão independentemente do status armazenado', () => {
  expect(estadoDoObjeto({ objeto: 'etapa', status: 'PLANEJADA', reaberto: true })).toBe('revisao');
  expect(estadoDoObjeto({ objeto: 'etapa', status: 'CONCLUIDA', reaberto: true })).toBe('revisao');
  expect(estadoDoObjeto({ objeto: 'etapa', status: 'CONCLUIDA', reaberto: false })).toBe('concluido');
});


test('solicitação pendente prevalece sobre marcador de reabertura antigo', () => {
  expect(estadoDoObjeto({ objeto: 'entregavel', status: 'PENDENTE_CONCLUSAO', reaberto: true })).toBe('pendente');
  expect(estadoDoObjeto({ objeto: 'entregavel', status: 'PENDENTE_ENCERRAMENTO', reaberto: true })).toBe('pendente');
});
