'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { consultarHistoricoContrato, type EventoHistoricoContrato } from '@/lib/contratos';
import { ModalEtapa } from './modal-etapa';

const formatoData = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const formatoHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
function dataHora(valor: string) {
  const data = new Date(valor);
  return Number.isFinite(data.getTime()) ? `${formatoData.format(data)} · ${formatoHora.format(data)}` : 'Data não informada';
}
function tomEvento(acao: string) {
  if (/REJEIT|CANCEL|EXCLUID|INVALID|SUSPENS/.test(acao)) return 'alerta';
  if (/VERIFICAD|APROVAD|CONCLUID/.test(acao)) return 'reconhecido';
  if (/SOLICIT|PENDENTE/.test(acao)) return 'pendente';
  return 'registro';
}
function Evento({ evento, completo = false }: { evento: EventoHistoricoContrato; completo?: boolean }) {
  return <li className="pi-historico-linha" data-completo={completo}>
    <span className="pi-historico-marcador" data-tom={tomEvento(evento.acao)} aria-hidden="true"/>
    <div className="min-w-0">
      <p className={completo ? 'text-sm font-semibold break-words' : 'text-xs truncate'} title={[evento.descricao,evento.contexto].filter(Boolean).join(' — ')}>{completo ? evento.descricao : evento.descricao.split(" · Campos alterados:")[0]}{!completo && evento.contexto ? ` — ${evento.contexto}` : ''}</p>
      {completo && <div className="mt-1 space-y-1 text-xs text-foreground/65 break-words">
        {evento.contexto && <p>{evento.contexto}</p>}
        {evento.nomeArquivo && <p>Arquivo: {evento.nomeArquivo}</p>}
        {evento.situacaoAnterior && evento.situacaoAtual && <p>{evento.situacaoAnterior} → {evento.situacaoAtual}</p>}
        {evento.justificativa && <p className="whitespace-pre-wrap">Justificativa: {evento.justificativa}</p>}
        {evento.ator && <p>{evento.ator.email}</p>}
      </div>}
    </div>
    <time className="pi-historico-data text-xs text-foreground/60 tabular-nums" dateTime={evento.ocorridoEm}>{dataHora(evento.ocorridoEm)}</time>
  </li>;
}

/** Paginação por cursor, sem perder eventos quando chegam novos registros. */
function HistoricoCompleto({ contratoId, numeroContrato, eventosIniciais, fechar, origem }: { contratoId: string; numeroContrato?: string; eventosIniciais: EventoHistoricoContrato[]; fechar: () => void; origem: HTMLElement | null }) {
  const [eventos, setEventos] = useState(eventosIniciais);
  const [mais, setMais] = useState(eventosIniciais.length === 100);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const requisicao = useRef<AbortController | null>(null);
  useEffect(() => () => requisicao.current?.abort(), []);
  async function carregarMais() {
    if (requisicao.current || !mais || !eventos.length) return;
    const abortador = new AbortController();
    requisicao.current = abortador; setOcupado(true); setErro('');
    try {
      const pagina = await consultarHistoricoContrato(contratoId, abortador.signal, eventos.at(-1)!.id);
      if (!abortador.signal.aborted) {
        setEventos(anteriores => [...new Map([...anteriores, ...pagina].map(e => [e.id, e])).values()]);
        setMais(pagina.length === 100 && pagina.at(-1)?.id !== eventos.at(-1)?.id);
      }
    } catch { if (!abortador.signal.aborted) setErro('Não foi possível consultar os eventos anteriores.'); }
    finally { if (!abortador.signal.aborted) { requisicao.current = null; setOcupado(false); } }
  }
  return createPortal(<ModalEtapa titulo="Histórico do contrato" contexto={numeroContrato ? `Contrato ${numeroContrato}` : 'Contrato'} rotuloFechar="Fechar histórico" larguraAmpla ocupado={false} focoRetorno={origem} onFechar={fechar}>
    <div className="pi-historico-completo">
      {eventos.length ? <ol className="pi-historico-lista">{eventos.map(evento => <Evento key={evento.id} evento={evento} completo/>)}</ol> : <p className="py-6 text-sm text-foreground/65">Nenhuma alteração registrada.</p>}
      {erro && <p role="alert" className="py-2 text-sm text-error-text">{erro}</p>}
      {mais && <div className="flex justify-center py-3"><button type="button" className="rounded-lg border border-current/20 px-4 py-2 text-xs font-semibold hover:bg-current/5 disabled:opacity-50" disabled={ocupado} onClick={carregarMais}>{ocupado ? 'Carregando…' : 'Carregar eventos anteriores'}</button></div>}
    </div>
  </ModalEtapa>, document.body);
}

export function HistoricoContrato({ contratoId, numeroContrato, versao }: { contratoId: string; numeroContrato?: string; versao: string }) {
  const [consulta, setConsulta] = useState<{ chave: string; eventos: EventoHistoricoContrato[]; erro?: string } | null>(null);
  const [selecionados, setSelecionados] = useState<EventoHistoricoContrato[] | null>(null);
  const [gatilho,setGatilho] = useState<HTMLButtonElement|null>(null);
  const chave = `${contratoId}:${versao}`;
  useEffect(() => {
    const abortador = new AbortController();
    void consultarHistoricoContrato(contratoId, abortador.signal)
      .then(eventos => { if (!abortador.signal.aborted) setConsulta({ chave, eventos }); })
      .catch(() => { if (!abortador.signal.aborted) setConsulta({ chave, eventos: [], erro: 'Histórico indisponível ou sem permissão de consulta.' }); });
    return () => abortador.abort();
  }, [contratoId, chave]);
  const atual = consulta?.chave === chave ? consulta : null;
  return <section aria-label="Histórico recente" className="pi-historico-recente">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Histórico recente</h3>
      <button type="button" aria-haspopup="dialog" disabled={!atual || !!atual.erro} className="pi-link-contextual text-xs font-medium disabled:opacity-40" onClick={e => { if(atual){setGatilho(e.currentTarget);setSelecionados(atual.eventos);} }}>Consultar histórico completo</button>
    </header>
    {!atual ? <p role="status" className="py-2 text-xs text-foreground/65">Consultando histórico…</p> : atual.erro ? <p role="status" className="py-2 text-xs text-foreground/65">{atual.erro}</p> : atual.eventos.length ? <ol className="pi-historico-lista">{atual.eventos.slice(0, 4).map(evento => <Evento key={evento.id} evento={evento}/>)}</ol> : <p className="py-2 text-xs text-foreground/65">Nenhuma alteração registrada.</p>}
    {selecionados && <HistoricoCompleto key={contratoId} contratoId={contratoId} numeroContrato={numeroContrato} eventosIniciais={selecionados} fechar={() => setSelecionados(null)} origem={gatilho}/>}
  </section>;
}
