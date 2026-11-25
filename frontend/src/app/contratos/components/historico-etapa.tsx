"use client";
import { useEffect, useState } from "react";
import { consultarHistoricoEtapa } from "@/lib/etapas";

/** Linha do tempo sanitizada da etapa e dos entregáveis subordinados. */
export function HistoricoEtapa({ contratoId, etapaId, revisao = 0 }: { contratoId: string; etapaId: string; revisao?: number }) {
  const [aberto, setAberto] = useState(false);
  const [todos, setTodos] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [dados, setDados] = useState<{ chave: string; eventos: Awaited<ReturnType<typeof consultarHistoricoEtapa>>; erro?: string } | null>(null);
  const chave = `${contratoId}:${etapaId}:${revisao}:${tentativa}`;
  useEffect(() => {
    if (!aberto) return;
    const c = new AbortController();
    void consultarHistoricoEtapa(contratoId, etapaId, c.signal)
      .then(eventos => { if (!c.signal.aborted) setDados({ chave, eventos }); })
      .catch((erro: unknown) => { if (!c.signal.aborted) {
        const status = erro && typeof erro === 'object' && 'status' in erro ? erro.status : undefined;
        const mensagem = status === 403 ? 'Sem permissão para consultar o histórico da etapa.' : status === 401 ? 'Sua sessão expirou.' : status === 404 ? 'Etapa indisponível.' : 'Não foi possível consultar o histórico da etapa.';
        setDados({ chave, eventos: [], erro: mensagem });
      } });
    return () => c.abort();
  }, [aberto, chave, contratoId, etapaId]);
  const atual = dados?.chave === chave ? dados : null;
  return <section data-pi-historico-neutro data-tec08-historico-entidade aria-label="Histórico da etapa" className="pi-historico-compacto mt-3 text-sm">
    <button type="button" aria-expanded={aberto} onClick={() => setAberto(v => !v)} className="pi-historico-gatilho flex w-full items-center gap-2 text-left font-semibold text-foreground">
      <svg aria-hidden="true" className={`h-4 w-4 shrink-0 ${aberto?'':'-rotate-90'}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m5 7 5 5 5-5"/></svg><span>Histórico da etapa</span>
    </button>
    {aberto && <div className="pi-historico-corpo space-y-2">
      {!atual ? <p role="status">Consultando histórico…</p> : atual.erro ? <div className="flex flex-wrap items-center justify-between gap-2"><p role="alert">{atual.erro}</p><button type="button" className="rounded-md border border-current/20 px-3 py-1.5 text-xs" onClick={()=>setTentativa(v=>v+1)}>Tentar novamente</button></div> : <>
        {atual.eventos.length === 0 && <p className="text-foreground/65">Nenhum evento registrado.</p>}
        <ol className="space-y-2 border-l border-current/20 pl-4">
          {(todos ? atual.eventos : atual.eventos.slice(0, 5)).map(evento => <li key={evento.id} className="relative min-w-0 space-y-0.5 text-xs before:absolute before:-left-[19px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-slate-400">
            <p className="font-semibold">{evento.descricao}</p>
            {evento.contexto && <p className="break-words text-foreground/75">{evento.contexto}</p>}
            {evento.nomeArquivo && <p className="break-all text-foreground/75">Arquivo: {evento.nomeArquivo}</p>}
            {evento.justificativa && <p className="break-words text-foreground/80">Justificativa: {evento.justificativa}</p>}
            <p className="break-words text-foreground/70">Responsável: {evento.ator ? (evento.ator.nome ? `${evento.ator.nome} (${evento.ator.email})` : evento.ator.email) : 'autor não disponível'}</p>
            <time dateTime={evento.ocorridoEm} className="text-foreground/60">{new Date(evento.ocorridoEm).toLocaleString('pt-BR')}</time>
          </li>)}
        </ol>
        {atual.eventos.length > 5 && <button className="rounded-lg border border-current/20 px-3 py-1 text-xs" type="button" onClick={() => setTodos(v => !v)}>{todos ? 'Mostrar recentes' : 'Ver mais eventos'}</button>}
      </>}
    </div>}
  </section>;
}
