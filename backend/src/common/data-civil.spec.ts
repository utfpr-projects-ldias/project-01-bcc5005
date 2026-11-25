import { hojeCivil, FUSO_CONTRATUAL } from './data-civil.js';

describe('calendário civil contratual', () => {
  it('usa o calendário de Brasília, e não o dia UTC, antes da meia-noite local', () => {
    expect(FUSO_CONTRATUAL).toBe('America/Sao_Paulo');
    expect(hojeCivil(new Date('2026-11-23T02:59:59.000Z'))).toBe('2026-11-22');
    expect(hojeCivil(new Date('2026-11-23T03:00:00.000Z'))).toBe('2026-11-23');
  });
  it('não depende do fuso de execução do processo para formatar a data', () => {
    expect(hojeCivil(new Date('2026-11-22T12:30:00.000Z'))).toBe('2026-11-22');
  });
});
