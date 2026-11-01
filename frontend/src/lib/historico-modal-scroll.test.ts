import { ajustarRestauracaoHistorico } from './historico-modal-scroll';

describe('HU07 — modo de restauração do histórico fora do render React', () => {
  test('alternância manual/auto é reversível e não adiciona entradas no histórico', () => {
    const anterior = window.history.scrollRestoration;
    const tamanho = window.history.length;
    try {
      ajustarRestauracaoHistorico('manual');
      expect(window.history.scrollRestoration).toBe('manual');
      ajustarRestauracaoHistorico('auto');
      expect(window.history.scrollRestoration).toBe('auto');
      expect(window.history.length).toBe(tamanho);
    } finally {
      ajustarRestauracaoHistorico(anterior);
    }
  });
});
