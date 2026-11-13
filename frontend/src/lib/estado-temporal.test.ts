import { estadoTemporal } from './estado-temporal';

test('início do período gera estado temporal em andamento, sem conclusão física', () => {
  expect(estadoTemporal('NAO_INICIADO', '2026-11-01', '2026-11-12')).toBe('EM_ANDAMENTO');
  expect(estadoTemporal('NAO_INICIADO', '2026-11-30', '2026-11-12')).toBe('NAO_INICIADO');
});
test('não sobrescreve estados de revisão, aprovação ou encerramento', () => {
  for (const status of ['EM_REVISAO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO','CONCLUIDO','ENCERRADA']) {
    expect(estadoTemporal(status, '2026-01-01', '2026-11-12')).toBe(status);
  }
});
test('sem início não infere atividade', () => {
  expect(estadoTemporal('NAO_INICIADO', null, '2026-11-12')).toBe('NAO_INICIADO');
});
