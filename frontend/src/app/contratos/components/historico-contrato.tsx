"use client";
import { useEffect, useState } from "react";
import { consultarHistoricoContrato, type EventoHistoricoContrato } from "@/lib/contratos";

/** Trilha em consulta sob demanda; a API devolve projeção sanitizada, sem JSONB de auditoria. */
export function HistoricoContrato({ contratoId, versao, estado = 'normal' }: { contratoId: string; versao: string; estado?: 'normal' | 'revisao' | 'concluido' | 'arquivado' | 'encerrado' }) {
  const [aberto, setAberto] = useState(false);
  const [consulta, setConsulta] = useState<{ chave: string; eventos: EventoHistoricoContrato[]; erro?: string } | null>(null);
  const [todos, setTodos] = useState(false);
  const chave = `${contratoId}:${versao}`;
  useEffect(() => {
    if (!aberto) return;
    const abortador = new AbortController();
    void consultarHistoricoContrato(contratoId, abortador.signal)
      .then(eventos => { if (!abortador.signal.aborted) setConsulta({ chave, eventos }); })
      .catch(() => { if (!abortador.signal.aborted) setConsulta({ chave, eventos: [], erro: 'Rastreabilidade indisponível ou sem permissão de consulta.' }); });
    return () => abortador.abort();
  }, [aberto, contratoId, chave]);
  const atual = consulta?.chave === chave ? consulta : null;
  const eventos = atual?.eventos ?? [];
  const reaberturas = eventos.filter(e => e.acao === 'CONTRATO_REABERTO').length;
  const cores = estado === 'encerrado'
    ? { caixa: 'border-slate-500/45 bg-background', texto: 'text-slate-800 dark:text-slate-200', foco: 'focus-visible:outline-slate-400', linha: 'border-slate-500/35' }
    : estado === 'arquivado'
    ? { caixa: 'border-amber-500/40 bg-amber-500/[0.04]', texto: 'text-amber-200', foco: 'focus-visible:outline-amber-400', linha: 'border-amber-400/30' }
    : estado === 'concluido'
      ? { caixa: 'border-violet-500/30 bg-violet-500/[0.04]', texto: 'text-violet-200', foco: 'focus-visible:outline-violet-400', linha: 'border-violet-400/30' }
      : estado === 'revisao'
        ? { caixa: 'border-emerald-500/30 bg-emerald-500/[0.04]', texto: 'text-emerald-200', foco: 'focus-visible:outline-emerald-400', linha: 'border-emerald-400/30' }
        : { caixa: 'border-brand-green/30 bg-brand-green/[0.04]', texto: 'text-brand-neon', foco: 'focus-visible:outline-brand-neon', linha: 'border-brand-green/30' };
  return <section aria-label="Rastreabilidade do contrato" className={`rounded-xl border p-3 text-sm ${cores.caixa}`}>

    <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto}
      className={`flex w-full items-center justify-between gap-2 rounded-lg py-1 text-left font-semibold focus-visible:outline-2 ${cores.texto} ${cores.foco}`}>
      <span>Rastreabilidade do contrato</span><span aria-hidden="true">{aberto ? '−' : '+'}</span>
    </button>
    {aberto && <div className="mt-3 space-y-3">
      {!atual ? <p role="status" className="text-foreground/70">Consultando histórico…</p> :
        atual.erro ? <p role="status" className="text-foreground/70">{atual.erro}</p> : <>
          <p className="text-xs text-foreground/75">{reaberturas} {reaberturas === 1 ? 'reabertura registrada' : 'reaberturas registradas'} nos {eventos.length} eventos recentes.</p>
          {eventos.length === 0 ? <p className="text-foreground/70">Nenhuma alteração disponível.</p> :
            <ol className={`space-y-2 border-l pl-4 ${cores.linha}`}>
              {(todos ? eventos : eventos.slice(0, 5)).map(e => <li key={e.id} className="space-y-0.5 text-xs">
                <p className="font-semibold text-foreground">{e.descricao}</p>
                {e.contexto && <p className="break-words text-foreground/75">{e.contexto}</p>}
                {e.nomeArquivo && <p className="break-all text-foreground/75">Arquivo: {e.nomeArquivo}</p>}
                {e.justificativa && <p className="whitespace-pre-wrap break-words text-foreground/80"><strong>Justificativa:</strong> {e.justificativa}</p>}
                {e.situacaoAnterior && e.situacaoAtual && <p className="text-foreground/70">{e.situacaoAnterior} → {e.situacaoAtual}</p>}
                <p className="break-words text-foreground/70">Responsável: {e.ator ? `${e.ator.nome} (${e.ator.email})` : 'autor não disponível'}</p>
                <time dateTime={e.ocorridoEm} className="text-foreground/60">{new Date(e.ocorridoEm).toLocaleString('pt-BR')}</time>
              </li>)}
            </ol>}
          {eventos.length > 5 && <button type="button" onClick={() => setTodos(v => !v)} className={`rounded-lg border px-3 py-1 text-xs ${cores.linha} ${cores.texto}`}>{todos ? 'Mostrar recentes' : 'Ver todos os eventos consultados'}</button>}
          {eventos.length === 100 && <p className="text-xs text-foreground/60">Exibidos apenas os 100 eventos mais recentes do contrato.</p>}
        </>}
    </div>}
  </section>;
}
