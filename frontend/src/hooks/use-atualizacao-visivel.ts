'use client';
import { useRef, useState } from 'react';

/** Estado visual mínimo de 650ms; trava síncrona, sem atrasar o início da requisição. */
export function useAtualizacaoVisivel() {
  const ocupadoRef = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  async function executar(acao: () => Promise<unknown>): Promise<void> {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    setOcupado(true);
    const iniciou = Date.now();
    try { await acao(); }
    finally {
      const restante = Math.max(0, 650 - (Date.now() - iniciou));
      if (restante) await new Promise<void>((resolve) => setTimeout(resolve, restante));
      ocupadoRef.current = false;
      setOcupado(false);
    }
  }
  return { ocupado, executar };
}
