import { intervaloPrevisto } from './entregaveis';

test('datas de planejamento não fabricam término nem exibem separador vazio', () => {
  expect(intervaloPrevisto(null, null)).toBeNull();
  expect(intervaloPrevisto('2026-11-12', null)).toBe('Início previsto: 12/11/2026');
  expect(intervaloPrevisto(null, '2026-11-16')).toBe('Término previsto: 16/11/2026');
  expect(intervaloPrevisto('2026-11-12', '2026-11-12')).toBe('12/11/2026');
  expect(intervaloPrevisto('2026-11-12', '2026-11-16')).toBe('12/11/2026 até 16/11/2026');
});
