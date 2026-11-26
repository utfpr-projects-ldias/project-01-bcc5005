import { formatarPercentualSemAnteciparConclusao } from '@/lib/apresentacao-indicadores';
/** Indicador de avanço físico; recebe o valor calculado pela API, nunca calcula uma nova fórmula. */
export function ProgressoCircular({ valor, nome, tamanho = 'normal', neutro = false, corFisica = false }: { valor: number | null | undefined; nome: string; tamanho?: 'normal' | 'grande'; neutro?: boolean; corFisica?: boolean }) {
  const valido = typeof valor === 'number' && Number.isFinite(valor);
  const porcentagem = valido ? Math.max(0, Math.min(100, valor)) : null;
  const texto = porcentagem === null ? '—' : formatarPercentualSemAnteciparConclusao(porcentagem);
  return <div role="img" aria-label={`Progresso físico de ${nome}: ${porcentagem === null ? 'indisponível' : texto}`}
    data-pi-progresso-circular data-valor-disponivel={porcentagem !== null}
    className={`relative shrink-0 rounded-full bg-transparent text-center font-bold tabular-nums ${tamanho === 'grande' ? 'h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]' : 'h-14 w-14'}`}>
    <svg aria-hidden="true" viewBox="0 0 64 64" className="pointer-events-none block h-full w-full overflow-visible">
      <circle cx="32" cy="32" r="27" strokeWidth="4.5" fill="none" stroke="currentColor" className="text-slate-500/35"/>
      {porcentagem !== null && <circle cx="32" cy="32" r="27" strokeWidth="4.5" strokeLinecap={porcentagem === 0 ? 'butt' : 'round'} fill="none" stroke="currentColor" pathLength="100" strokeDasharray={`${porcentagem} 100`} strokeOpacity={porcentagem === 0 ? 0 : 1} transform="rotate(-90 32 32)" className={`pi-anel-progresso ${corFisica && !neutro ? 'text-green-700 dark:text-green-400' : ''}`} style={corFisica && !neutro ? undefined : {color: neutro ? '#64748b' : 'var(--pi-cor-propria, #799fac)'}}/>}
      <text x="32" y="32" dominantBaseline="central" textAnchor="middle" fontSize={texto.length > 5 ? 10 : texto.length > 4 ? 11 : 14} fontWeight="700" fill="currentColor" className={porcentagem === null ? 'text-foreground/60' : 'text-foreground'}>{texto}</text>
    </svg>
  </div>;
}
