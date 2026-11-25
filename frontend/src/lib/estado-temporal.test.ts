import { estadoTemporal, diaLocalBrasil } from './estado-temporal';

test('chegar ao início previsto não significa iniciar a execução', () => {
  expect(estadoTemporal('NAO_INICIADO', '2026-11-01', '2026-11-12')).toBe('NAO_INICIADO');
  expect(estadoTemporal('EM_ANDAMENTO', '2026-11-01', '2026-11-12')).toBe('EM_ANDAMENTO');
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

test('calendário de São Paulo não libera obrigação contínua pela virada do dia UTC', () => {
  expect(diaLocalBrasil(new Date('2026-11-23T02:30:00Z'))).toBe('2026-11-22');
  expect(diaLocalBrasil(new Date('2026-11-23T03:00:00Z'))).toBe('2026-11-23');
  expect(diaLocalBrasil(new Date('2026-11-23T02:30:00Z')) >= '2026-11-23').toBe(false);
  expect(diaLocalBrasil(new Date('2026-11-23T03:00:00Z')) >= '2026-11-23').toBe(true);
});
