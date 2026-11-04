'use client';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { ModalDetalheEntregavel } from './modal-detalhe-entregavel';
import { indicadoresPlanejamento, resumoComprovacao } from '@/lib/indicadores-planejamento';
import { ajustarRestauracaoHistorico } from '@/lib/historico-modal-scroll';
import { IndicadorCarregamento } from '@/app/components/indicador-carregamento';
import { useAtualizacaoVisivel } from '@/hooks/use-atualizacao-visivel';
import { FormularioEntregavel } from './formulario-entregavel';
import { criarEntregavel } from '@/lib/entregaveis';
import type { DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
import { dataPlanejada, ROTULOS_TIPO, type Entregavel } from '@/lib/entregaveis';

/** HU07-04: listagem real e cadastro sob autorização do backend; edição no detalhe. */
export function EntregaveisDaEtapa({ contratoId, etapaId, dados, carregando, erro, atualizar, podeCriar = false }: {
  contratoId: string; etapaId: string; dados?: Entregavel[];
  carregando: boolean; erro?: unknown; atualizar: () => Promise<unknown>; podeCriar?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [iniciado, setIniciado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [gatilhoDetalhe, setGatilhoDetalhe] = useState<HTMLElement | null>(null);
  const marcadorModal = useId();
  const historico = useRef<string | null>(null);
  const posicao = useRef<{ x: number; y: number; restauracao: ScrollRestoration } | null>(null);
  const restaurar = useCallback(() => {
    const anterior = posicao.current;
    posicao.current = null;
    if (!anterior) return;
    const executar = () => {
      if (Math.abs(window.scrollY - anterior.y) > 1 || Math.abs(window.scrollX - anterior.x) > 1) {
        window.scrollTo({ left: anterior.x, top: anterior.y, behavior: 'instant' });
      }
      ajustarRestauracaoHistorico(anterior.restauracao);
    };
    // A travessia do histórico é assíncrona. Aguardar duas pinturas, mantendo
    // scrollRestoration manual até a posição estar realmente restaurada.
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(executar));
    } else executar();
  }, []);
  function abrirDetalhe(id: string, evento: MouseEvent<HTMLAnchorElement>) {
    if (detalheId) return;
    const marcador = `${marcadorModal}:${id}`;
    posicao.current = { x: window.scrollX, y: window.scrollY, restauracao: window.history.scrollRestoration };
    ajustarRestauracaoHistorico('manual');
    const anterior = window.history.state;
    window.history.pushState({ ...(anterior && typeof anterior === 'object' ? anterior : {}), __modalEntregavel: marcador }, '', window.location.href);
    historico.current = marcador;
    setGatilhoDetalhe(evento.currentTarget);
    setDetalheId(id);
  }
  function fecharDetalhe() {
    if (!detalheId) return;
    const marcador = historico.current;
    setDetalheId(null);
    if (marcador && window.history.state?.__modalEntregavel === marcador) {
      // Não limpar o marcador nem restaurar o scroll antes do popstate: o
      // navegador ainda pode reposicionar a página durante history.back().
      window.history.back();
    } else {
      historico.current = null;
      restaurar();
    }
  }
  useEffect(() => {
    const voltar = () => {
      const marcador = historico.current;
      if (!marcador || window.history.state?.__modalEntregavel === marcador) return;
      historico.current = null;
      setDetalheId(null);
      restaurar();
    };
    window.addEventListener('popstate', voltar);
    return () => window.removeEventListener('popstate', voltar);
  }, [restaurar]);
  useEffect(() => () => {
    if (posicao.current) ajustarRestauracaoHistorico(posicao.current.restauracao);
  }, []);
  const atualizacaoVisivel = useAtualizacaoVisivel();
  async function atualizarVisivel() {
    setAviso('');
    try { await atualizar(); setAviso('Lista de entregáveis atualizada.'); }
    catch { setAviso('Não foi possível atualizar os entregáveis. Tente novamente.'); }
  }
  async function cadastrar(dados: DadosPlanejamentoEntregavel) {
    await criarEntregavel(contratoId, dados);
    setAberto(false); setIniciado(false); setAviso('Entregável cadastrado com sucesso.');
    // Se a leitura falhar depois do POST, o sucesso do cadastro não se perde.
    void atualizar().catch(() => {});
  }
  // Nunca exibir um item cujo contrato/etapa nao corresponda ao contexto visivel.
  const visiveis = dados?.filter((e) => e.contratoId === contratoId && e.etapaId === etapaId) ?? [];
  const indicadores = indicadoresPlanejamento(visiveis);
  const protegido = erro && typeof erro === 'object' && 'status' in erro &&
    [401, 403, 404].includes((erro as { status?: number }).status ?? -1);
  return <section aria-label="Entregáveis da etapa" className="mt-4 min-w-0 rounded-xl border border-brand-green/20 bg-brand-darkgreen/10 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h5 className="font-semibold text-brand-neon">Entregáveis planejados</h5>
      <div className="flex flex-wrap items-center gap-2">
      {podeCriar && !erro && <button type="button" disabled={salvando} aria-expanded={aberto}
        aria-controls={`cadastro-entregavel-${etapaId}`}
        onClick={() => { setIniciado(true); setAberto((anterior) => !anterior); setAviso(''); }}
        className="inline-flex items-center gap-2 rounded-lg border border-brand-green bg-brand-green/15 px-3 py-1.5 text-xs font-semibold text-brand-neon disabled:opacity-50">
        {aberto ? 'Cadastrando entregável' : 'Novo entregável'}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
          className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${aberto ? 'rotate-180' : ''}`}>
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>}
      <button type="button" disabled={carregando || salvando || atualizacaoVisivel.ocupado} aria-busy={atualizacaoVisivel.ocupado}
        onClick={() => void atualizacaoVisivel.executar(atualizarVisivel).catch(() => {})}
        className="inline-flex min-h-9 min-w-40 items-center justify-center rounded-lg border border-brand-green/40 px-3 py-1.5 text-xs transition-colors hover:bg-brand-green/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-neon disabled:cursor-wait disabled:opacity-60">
        {atualizacaoVisivel.ocupado ? <IndicadorCarregamento compacto texto="Atualizando entregáveis..." /> : 'Atualizar entregáveis'}
      </button>
      </div>
    </div>
    <p className="mt-1 text-xs text-foreground/65">Obrigações desta etapa. Evidências esperadas não são comprovação de execução.</p>
    {!erro && !carregando && visiveis.length > 0 && <div data-testid="resumo-execucao-etapa" className="mt-3 grid gap-2 rounded-lg border border-brand-green/20 bg-background/60 p-3 text-xs sm:grid-cols-2">
      <div><strong className="text-foreground">Entregáveis:</strong> {indicadores.total} planejados · {indicadores.comExecucao} com execução registrada · {indicadores.concluidos} concluídos</div>
      <div><strong className="text-foreground">Evidências esperadas:</strong> {indicadores.esperadas} ({indicadores.obrigatorias} obrigatórias)</div>
      <div className="sm:col-span-2 text-foreground/70">{indicadores.comExecucao === 0
        ? 'Avanço físico da etapa: não disponível (execução ainda não registrada).'
        : 'Avanço físico da etapa: depende das regras de cálculo e validação da execução. Não corresponde ao número de evidências planejadas.'}</div>
      {indicadores.total > 0 && indicadores.comExecucao === indicadores.total && <div className="sm:col-span-2">
        <div className="flex justify-between gap-2 text-foreground/80"><span>Proporção de entregáveis concluídos (não é avanço físico)</span>
          <strong>{Math.round(100 * indicadores.concluidos / indicadores.total)}%</strong></div>
        <progress aria-label="Proporção de entregáveis concluídos" className="mt-1 h-2 w-full accent-brand-green"
          max={100} value={100 * indicadores.concluidos / indicadores.total} />
      </div>}
    </div>}
    {aviso && <p role="status" className="mt-2 text-sm text-brand-neon">{aviso}</p>}
    {podeCriar && !erro && iniciado && <div id={`cadastro-entregavel-${etapaId}`} hidden={!aberto} className="mt-3">
      <FormularioEntregavel contratoId={contratoId} etapaId={etapaId} onSalvar={cadastrar} onCancelar={() => setAberto(false)}
        onSalvandoMudou={setSalvando} />
    </div>}
    {carregando && !dados && !erro && <p role="status" className="mt-3 text-sm">Carregando entregáveis...</p>}
    {Boolean(erro) && <p role="alert" className="mt-3 break-words text-sm text-error-text">
      {erro instanceof Error ? erro.message : 'Falha ao consultar entregáveis.'}
    </p>}
    {!carregando && !erro && !visiveis.length && <p className="mt-3 text-sm text-foreground/70">Nenhum entregável cadastrado nesta etapa.</p>}
    {!protegido && !erro && visiveis.length > 0 && <ul aria-label="Entregáveis planejados da etapa" className="mt-3 space-y-2">
      {visiveis.map((e) => <li key={e.id} className="min-w-0 rounded-lg border border-brand-green/20 bg-background/65 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-xs text-foreground/60">{e.codigo ? `Código ${e.codigo} · ` : ''}{ROTULOS_TIPO[e.tipo]}</p>
            <Link href={`/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(e.id)}`}
              onClick={(evento) => {
                // Clique normal abre modal; Ctrl/Cmd/Shift/Alt preservam abrir em nova aba.
                if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.altKey || evento.shiftKey) return;
                evento.preventDefault(); abrirDetalhe(e.id, evento);
              }}
              aria-haspopup="dialog" title={`Abrir detalhes de ${e.nome} em modal`}
              className="mt-1 block break-words text-left font-semibold text-brand-neon underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-neon">
              {e.nome}
            </Link>

          </div>
          <span className="rounded-full border border-brand-green/30 px-2.5 py-1 text-xs">{e.statusExecucao === 'CONCLUIDO' ? 'Concluído' :
            e.statusExecucao === 'EM_ANDAMENTO' ? 'Em andamento' : 'Planejamento'}</span>
        </div>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div><dt className="text-foreground/60">Término previsto</dt><dd>{dataPlanejada(e.terminoPrevisto)}</dd></div>
          <div className="min-w-0"><dt className="text-foreground/60">Responsável cadastral</dt><dd className="break-all">{e.responsavel ? `${e.responsavel.nome || 'Nome não informado'} — ${e.responsavel.email}` : e.responsavelId ? 'Responsável atribuído' : 'Não definido'}</dd></div>
          <div><dt className="text-foreground/60">Evidências esperadas</dt><dd>{e.evidenciasEsperadas.length} cadastradas · {e.evidenciasEsperadas.filter(item => item.obrigatoria).length} obrigatórias</dd></div>
          <div><dt className="text-foreground/60">Comprovação</dt><dd>{resumoComprovacao(e)}</dd></div>
        </dl>
      </li>)}
    </ul>}
    {detalheId && !protegido && !erro && <ModalDetalheEntregavel contratoId={contratoId} etapaId={etapaId}
    entregavelId={detalheId} podeEditar={podeCriar} focoRetorno={gatilhoDetalhe}
    onFechar={fecharDetalhe} atualizar={atualizar} />}
  </section>;
}
