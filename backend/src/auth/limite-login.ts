/** Limite local por endereço de conexão, sem confiar em X-Forwarded-For.
 * O proxy de produção deverá impor sua própria limitação distribuída. */
export function criarLimiteLogin(janelaMs = 300_000, maxTentativas = 60, maxEnderecos = 10_000) {
  const entradas = new Map<string, {ate: number; tentativas: number}>();
  let proximaLimpeza = 0;
  return (endereco: string, agora = Date.now()): number => {
    if (agora >= proximaLimpeza) {
      for (const [chave, entrada] of entradas) if (entrada.ate <= agora) entradas.delete(chave);
      proximaLimpeza = agora + janelaMs;
    }
    const anterior = entradas.get(endereco);
    if (anterior && anterior.ate > agora) {
      if (anterior.tentativas >= maxTentativas) return Math.max(1, Math.ceil((anterior.ate - agora) / 1000));
      anterior.tentativas++;
      return 0;
    }
    if (!anterior && entradas.size >= maxEnderecos) return Math.max(1, Math.ceil((proximaLimpeza - agora) / 1000));
    entradas.set(endereco, {ate: agora + janelaMs, tentativas: 1});
    return 0;
  };
}
