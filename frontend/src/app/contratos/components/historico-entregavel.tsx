"use client";
import { useEffect, useState } from "react";
import { consultarHistoricoEntregavel, type EventoHistoricoEntregavel } from "@/lib/entregaveis";

/** Leitura somente do contrato autorizado, com eventos ordenados pelo servidor. */
export function HistoricoEntregavel({ contratoId, entregavelId, versao, ocultarTitulo = false }: {
  contratoId: string; entregavelId: string; versao: number; ocultarTitulo?: boolean;
}) {
  const chave = `${contratoId}:${entregavelId}:${versao}`;
  const [consulta, setConsulta] = useState<{ chave: string; eventos: EventoHistoricoEntregavel[]; erro?: string } | null>(null);
  const [expandido, setExpandido] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void consultarHistoricoEntregavel(contratoId, entregavelId, controller.signal)
      .then(eventos => { if (!controller.signal.aborted) setConsulta({ chave, eventos }); })
      .catch(() => { if (!controller.signal.aborted) setConsulta({ chave, eventos: [], erro: 'Histórico indisponível nesta consulta.' }); });
    return () => controller.abort();
  }, [contratoId, entregavelId, chave]);
  const atual = consulta?.chave === chave ? consulta : null;
  const eventos = atual?.eventos ?? [];
  const visiveis = expandido ? eventos : eventos.slice(0, 5);
  return <section aria-label="Histórico do entregável" className="space-y-3 border-t border-brand-green/20 pt-4">
    <div className={`flex flex-wrap items-center gap-2 ${ocultarTitulo ? 'justify-end' : 'justify-between'}`}>
      {!ocultarTitulo && <h2 className="text-sm font-semibold text-brand-neon">Rastreabilidade do entregável</h2>}
      <span className="text-xs text-foreground/60">{atual ? `${eventos.length}${eventos.length === 100 ? '+' : ''} eventos consultados` : 'Carregando histórico…'}</span>
    </div>
    {atual?.erro ? <p role="status" className="text-xs text-foreground/70">{atual.erro}</p> :
      atual && eventos.length === 0 ? <p className="text-xs text-foreground/70">Nenhum evento disponível.</p> : null}
    {visiveis.length > 0 && <ol className="space-y-2 border-l border-brand-green/25 pl-4">
      {visiveis.map(ev => <li key={ev.id} className="relative min-w-0 space-y-0.5 text-xs before:absolute before:-left-[19px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-brand-green">
        <p className="font-semibold text-foreground">{ev.descricao}</p>
        {ev.evidenciaNome && <p className="break-words text-foreground/75">Evidência: {ev.evidenciaNome}</p>}
        {ev.nomeAnterior && ev.nomeAtual && <p className="break-words text-foreground/80">
          {ev.objetoRenomeado ?? 'Item'}: “{ev.nomeAnterior}” → “{ev.nomeAtual}”
        </p>}
        {ev.nomeArquivo && <p className="break-all text-foreground/80">Arquivo: {ev.nomeArquivo}</p>}
        {ev.justificativa && <p className="break-words text-foreground/80">Justificativa: {ev.justificativa}</p>}
        <p className="text-foreground/60"><time dateTime={ev.ocorridoEm}>{new Date(ev.ocorridoEm).toLocaleString('pt-BR')}</time>
          {ev.ator ? ` · ${ev.ator.nome} (${ev.ator.email})` : ' · autor não disponível'}</p>
      </li>)}
    </ol>}
    {eventos.length > 5 && <button type="button" onClick={() => setExpandido(v => !v)}
      aria-expanded={expandido} className="rounded-lg border border-brand-green/30 px-3 py-1.5 text-xs hover:bg-brand-green/10">
      {expandido ? 'Mostrar somente recentes' : `Ver todos os ${eventos.length}${eventos.length === 100 ? '+' : ''} eventos`}
    </button>}
    {eventos.length === 100 && <p className="text-xs text-foreground/60">Exibidos os 100 eventos mais recentes; a consulta completa será disponibilizada pelo módulo de auditoria.</p>}
  </section>;
}
