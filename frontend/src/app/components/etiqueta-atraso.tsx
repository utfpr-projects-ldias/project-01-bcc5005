/** O prazo é avaliado no backend em dia civil contratual. Nunca substitui o estado operacional. */
export function EtiquetaAtraso({ atrasado, finalizadoComAtraso, feminino = false }: { atrasado?: boolean; finalizadoComAtraso?: boolean; feminino?: boolean }) {
  if (!atrasado && !finalizadoComAtraso) return null;
  return <span data-pi-indicador-atraso className="inline-flex shrink-0 items-center rounded-full border border-red-500/50 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold leading-tight text-red-700 dark:text-red-300">{atrasado ? (feminino ? 'Atrasada' : 'Atrasado') : (feminino ? 'Finalizada após o prazo' : 'Finalizado após o prazo')}</span>;
}
