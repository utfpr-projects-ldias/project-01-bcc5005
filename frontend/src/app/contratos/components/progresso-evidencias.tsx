/** Progresso documental independente do avanço físico do entregável. */
export function ProgressoEvidencias({ verificadas, total, nome }: { verificadas: number; total: number; nome: string }) {
  const parte = total > 0 ? Math.max(0, Math.min(100, (verificadas / total) * 100)) : 0;
  return <div className="mt-2 space-y-1.5">
    <p className="text-xs text-foreground/70">{verificadas}/{total} {total === 1 ? 'evidência obrigatória' : 'evidências obrigatórias'}</p>
    <div role="progressbar" aria-label={`Evidências obrigatórias verificadas de ${nome}; não representa execução física`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.max(0, Math.min(total, verificadas))}
      className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-violet-500/15">
      <div className="h-full rounded-full bg-violet-500" style={{ width: `${parte}%` }} />
    </div>
  </div>;
}
