import { estadoVisualEvidencia } from './estado-visual-evidencia';

test('o status da evidência vem dela, nunca do contrato', () => {
  expect(estadoVisualEvidencia()).toBe('normal');
  expect(estadoVisualEvidencia('SEM_ENVIO')).toBe('normal');
  expect(estadoVisualEvidencia('PENDENTE_VERIFICACAO')).toBe('pendente');
  expect(estadoVisualEvidencia('VERIFICADA')).toBe('concluido');
  expect(estadoVisualEvidencia('PENDENTE_VERIFICACAO', '2026-11-09T10:00:00Z')).toBe('revisao');
  expect(estadoVisualEvidencia('VERIFICADA', null, true)).toBe('arquivado');
  expect(estadoVisualEvidencia('PENDENTE_VERIFICACAO', '2026-11-09T10:00:00Z', true)).toBe('arquivado');
});
