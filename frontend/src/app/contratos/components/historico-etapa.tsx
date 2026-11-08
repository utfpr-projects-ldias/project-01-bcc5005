"use client";
import { useEffect, useState } from "react";
import { consultarHistoricoEtapa } from "@/lib/etapas";

/** Linha do tempo sanitizada da etapa e dos entregáveis subordinados. */
export function HistoricoEtapa({ contratoId, etapaId }: { contratoId: string; etapaId: string }) {
  const [aberto, setAberto] = useState(false);
  const [todos, setTodos] = useState(false);
  const [dados, setDados] = useState<{ chave: string; eventos: Awaited<ReturnType<typeof consultarHistoricoEtapa>>; erro?: string } | null>(null);
  const chave = `${contratoId}:${etapaId}`;
  useEffect(() => {
    if (!aberto) return;
    const c = new AbortController();
    void consultarHistoricoEtapa(contratoId, etapaId, c.signal)
      .then(eventos => { if (!c.signal.aborted) setDados({ chave, eventos }); })
      .catch(() => { if (!c.signal.aborted) setDados({ chave, eventos: [], erro: 'Não foi possível consultar a rastreabilidade da etapa.' }); });
    return () => c.abort();
  }, [aberto, chave, contratoId, etapaId]);
  const atual = dados?.chave === chave ? dados : null;
  return <section aria-label="Rastreabilidade da etapa" className="rounded-xl border border-brand-green/25 p-3 text-sm">
    <button type="button" aria-expanded={aberto} onClick={() => setAberto(v => !v)} className="flex w-full items-center justify-between gap-3 text-left font-semibold text-brand-neon">
      <span>Rastreabilidade da etapa</span><span aria-hidden="true">{aberto ? '−' : '+'}</span>
    </button>
    {aberto && <div className="mt-3 space-y-2">
      {!atual ? <p role="status">Consultando histórico…</p> : atual.erro ? <p role="alert">{atual.erro}</p> : <>
        {atual.eventos.length === 0 && <p className="text-foreground/65">Nenhum evento registrado.</p>}
        <ol className="space-y-3 border-l border-brand-green/25 pl-4">
          {(todos ? atual.eventos : atual.eventos.slice(0, 5)).map(evento => <li key={evento.id} className="space-y-1 text-xs">
            <p className="font-semibold">{evento.descricao}</p>
            {evento.contexto && <p className="break-words text-foreground/75">{evento.contexto}</p>}
            {evento.nomeArquivo && <p className="break-all text-foreground/75">Arquivo: {evento.nomeArquivo}</p>}
            {evento.justificativa && <p className="break-words text-foreground/80">Justificativa: {evento.justificativa}</p>}
            <p className="break-words text-foreground/70">Responsável: {evento.ator ? `${evento.ator.nome} (${evento.ator.email})` : 'autor não disponível'}</p>
            <time dateTime={evento.ocorridoEm} className="text-foreground/60">{new Date(evento.ocorridoEm).toLocaleString('pt-BR')}</time>
          </li>)}
        </ol>
        {atual.eventos.length > 5 && <button className="rounded-lg border border-brand-green/30 px-3 py-1 text-xs" type="button" onClick={() => setTodos(v => !v)}>{todos ? 'Mostrar recentes' : 'Ver mais eventos'}</button>}
      </>}
    </div>}
  </section>;
}
