/** Disponibilidade, cobertura e ausência de requisitos são dimensões distintas. */
export function apresentarFracao(feitas?: number | null, total?: number | null) {
  const valido = typeof feitas === 'number' && typeof total === 'number' && Number.isSafeInteger(feitas) && Number.isSafeInteger(total) && feitas >= 0 && total >= 0 && feitas <= total;
  if (!valido) return { texto: '—', percentual: null, estado: 'indisponivel' } as const;
  if (total === 0) return { texto: '0/0', percentual: 0, estado: 'sem-requisitos' } as const;
  return { texto: `${feitas}/${total}`, percentual: 100 * feitas / total, estado: 'aplicavel' } as const;
}

/** Usa as três classificações documentais, sem novos limiares arbitrários. */
export function tomComprovacao(feitas?: number | null, total?: number | null): 'neutro' | 'insuficiente' | 'parcial' | 'completo' {
  const fracao = apresentarFracao(feitas, total);
  if (fracao.estado !== 'aplicavel') return 'neutro';
  if (fracao.percentual === 100) return 'completo';
  return fracao.percentual === 0 ? 'insuficiente' : 'parcial';
}
export const CORES_COMPROVACAO = {
  neutro: 'text-foreground/60', insuficiente: 'text-red-700 dark:text-red-300',
  parcial: 'text-amber-700 dark:text-amber-300', completo: 'text-emerald-700 dark:text-emerald-400',
} as const;
