'use client';
import { useProgresso } from '@/hooks/use-progresso';

/** Avanço físico é calculado no servidor, nunca a partir do estado "Finalizado". */
export function IndicadorAvancoFinalizado({ contratoId }: { contratoId: string }) {
  const consulta = useProgresso(contratoId);
  if (consulta.loading) return <span role="status" className="rounded-lg border border-purple-500/30 px-2 py-1 text-xs text-purple-300">Calculando avanço…</span>;
  const avanco = consulta.progresso?.avanco;
  return <span role="status" aria-label={avanco === null || avanco === undefined ? 'Execução física não calculável' : `Execução física ${avanco.toLocaleString('pt-BR',{maximumFractionDigits:2})} por cento`}
    className="inline-flex items-center gap-1 rounded-lg border border-purple-500/60 bg-purple-500/20 px-2.5 py-1 text-xs font-bold tabular-nums text-purple-700 dark:text-purple-200">
    {avanco == null ? '—' : `${avanco.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`} <span className="font-medium">executado</span>
  </span>;
}
