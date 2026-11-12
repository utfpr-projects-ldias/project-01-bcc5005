import { act, renderHook } from '@testing-library/react';
import { useAtualizacaoVisivel } from './use-atualizacao-visivel';

test('inicia consulta imediatamente, impede clique duplo e mantém spinner visível por 650ms', async () => {
  jest.useFakeTimers();
  try {
    const { result } = renderHook(() => useAtualizacaoVisivel());
    const tarefa = jest.fn().mockResolvedValue(undefined);
    let primeira!: Promise<void>;
    await act(async () => {
      primeira = result.current.executar(tarefa);
      void result.current.executar(tarefa);
      await Promise.resolve();
    });
    expect(tarefa).toHaveBeenCalledTimes(1);
    expect(result.current.ocupado).toBe(true);
    await act(async () => { await jest.advanceTimersByTimeAsync(650); });
    await primeira;
    expect(result.current.ocupado).toBe(false);
  } finally { jest.useRealTimers(); }
});
