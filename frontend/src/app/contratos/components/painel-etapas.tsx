'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useEtapas, useMutacoesEtapas } from '@/hooks/use-etapas';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { EntregaveisDaEtapa } from './entregaveis-da-etapa';
import { ErroEtapa, STATUS_ETAPA, type DadosEtapa, type Etapa } from '@/lib/etapas';
import { FormularioEtapa } from './formulario-etapa';
import { ModalEtapa } from './modal-etapa';
import { IndicadorCarregamento } from '@/app/components/indicador-carregamento';
import { useAtualizacaoVisivel } from '@/hooks/use-atualizacao-visivel';
import { ajustarRestauracaoHistorico } from '@/lib/historico-modal-scroll';

function dataBR(valor: string | null): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor.split('-').reverse().join('/') : 'Não informada';
}

export function PainelEtapas({ contratoId, habilitado, podeGerenciar }: {
  contratoId: string; habilitado: boolean; podeGerenciar: boolean;
}) {
  const consulta = useEtapas(contratoId, habilitado);
  const mutacoes = useMutacoesEtapas(contratoId);
  const [editor, setEditor] = useState<string | null>(null);
  const [gatilhoModal, setGatilhoModal] = useState<HTMLButtonElement | null>(null);
  const identificadorModal = useId();
  const sequenciaModal = useRef(0);
  const historicoModal = useRef<string | null>(null);
  const posicaoModal = useRef<{ x: number; y: number; restauracao: ScrollRestoration } | null>(null);
  // FLIP: conservar a geometria pré-troca para animar os cartões reais, e não só os botões.
  const cartoesEtapa = useRef(new Map<string, HTMLLIElement>());
  const posicoesAnteriores = useRef(new Map<string, number>());
  const atualizacaoVisivel = useAtualizacaoVisivel();
  const [ordemProvisoria, setOrdemProvisoria] = useState<string[] | null>(null);
  const [reordenando, setReordenando] = useState(false);
  const [salvandoFormulario, setSalvandoFormulario] = useState(false);
  const [erroAcao, setErroAcao] = useState('');
  const [avisoAcao, setAvisoAcao] = useState('');
  const [bloqueio, setBloqueio] = useState(false);
  const erroConsulta = consulta.erro;
  const erroProtegido = erroConsulta instanceof ErroEtapa && [401, 403, 404].includes(erroConsulta.status);
  const etapas = habilitado && !erroProtegido && !bloqueio ? consulta.dados : undefined;
  const ordenadas = ordemProvisoria && etapas ? ordemProvisoria.map((id) => etapas.find((e) => e.id === id)).filter((e): e is Etapa => !!e) : etapas;
  const itemEditando = editor && editor !== 'nova' ? etapas?.find((e) => e.id === editor) : undefined;
  const podeEscrever = habilitado && podeGerenciar && !erroProtegido && !bloqueio;
  const entregaveisQuery = useEntregaveis(contratoId, habilitado && !erroProtegido && !bloqueio && !!etapas);

  const restaurarPosicaoModal = useCallback(() => {
    const anterior = posicaoModal.current;
    posicaoModal.current = null;
    if (!anterior) return;
    // Não depender do scroll automático do histórico após uma navegação same-document.
    const restaurar = () => {
      if (Math.abs(window.scrollY - anterior.y) > 1 || Math.abs(window.scrollX - anterior.x) > 1) {
        window.scrollTo({ left: anterior.x, top: anterior.y, behavior: 'instant' });
      }
      ajustarRestauracaoHistorico(anterior.restauracao);
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(restaurar);
    else restaurar();
  }, []);

  function fecharModal() {
    const marcador = historicoModal.current;
    historicoModal.current = null;
    setEditor(null);
    if (marcador && window.history.state?.__modalEtapa === marcador) {
      // Remove a entrada temporária. Não navegar para a página anterior ao contrato.
      window.history.back();
    }
    restaurarPosicaoModal();
  }

  function abrirModal(destino: string, gatilho: HTMLButtonElement) {
    if (editor === destino) { fecharModal(); return; }
    if (!historicoModal.current) {
      const marcador = `${identificadorModal}:${++sequenciaModal.current}`;
      const estado = window.history.state;
      const estadoPreservado = estado && typeof estado === 'object' ? estado : {};
      posicaoModal.current = {
        x: window.scrollX, y: window.scrollY,
        restauracao: window.history.scrollRestoration,
      };
      ajustarRestauracaoHistorico('manual');
      // Preservar o estado do Next.js (__NA, etc.) é necessário para o App Router.
      window.history.pushState({ ...estadoPreservado, __modalEtapa: marcador }, '', window.location.href);
      historicoModal.current = marcador;
    }
    setGatilhoModal(gatilho);
    setEditor(destino);
    setErroAcao('');
  }

  useEffect(() => {
    function voltarNoHistorico() {
      const marcador = historicoModal.current;
      if (!marcador || window.history.state?.__modalEtapa === marcador) return;
      if (salvandoFormulario) {
        // Salvar está em andamento: impedir que o próximo Voltar saia do contrato.
        const estado = window.history.state;
        window.history.pushState({ ...(estado && typeof estado === 'object' ? estado : {}), __modalEtapa: marcador }, '', window.location.href);
        return;
      }
      // Voltar físico do mouse, Alt+Esquerda e botão do navegador chegam aqui.
      historicoModal.current = null;
      setEditor(null);
      restaurarPosicaoModal();
    }
    window.addEventListener('popstate', voltarNoHistorico);
    return () => window.removeEventListener('popstate', voltarNoHistorico);
  }, [salvandoFormulario, restaurarPosicaoModal]);

  const chaveOrdem = ordenadas?.map((item) => item.id).join('|') ?? '';
  function capturarPosicoes() {
    posicoesAnteriores.current = new Map(Array.from(cartoesEtapa.current, ([id, no]) => [id, no.getBoundingClientRect().top]));
  }
  useLayoutEffect(() => {
    const anteriores = posicoesAnteriores.current;
    posicoesAnteriores.current = new Map();
    if (!anteriores.size || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    for (const [id, no] of cartoesEtapa.current) {
      const topAnterior = anteriores.get(id);
      if (topAnterior === undefined || !no.isConnected) continue;
      const deslocamento = topAnterior - no.getBoundingClientRect().top;
      if (Math.abs(deslocamento) < 2 || typeof no.animate !== 'function') continue;
      no.animate(
        [{ transform: `translateY(${deslocamento}px)` }, { transform: 'translateY(0)' }],
        { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
  }, [chaveOrdem]);

  async function atualizar() {
    setErroAcao(''); setAvisoAcao('');
    try { await consulta.atualizar(); setBloqueio(false); }
    catch (erro) {
      if (erro instanceof ErroEtapa && [401, 403, 404].includes(erro.status)) { setBloqueio(true); fecharModal(); }
      setErroAcao(erro instanceof ErroEtapa ? erro.message : 'Não foi possível atualizar as etapas.');
    }
  }

  async function salvar(dados: DadosEtapa) {
    try {
      if (editor === 'nova') await mutacoes.criar(dados);
      else if (editor) await mutacoes.editar(editor, dados);
      else return;
      fecharModal(); setErroAcao(''); setAvisoAcao('Etapa salva com sucesso.');
    } catch (erro) {
      if (erro instanceof ErroEtapa && [401, 403, 404].includes(erro.status)) { setBloqueio(true); fecharModal(); }
      throw erro;
    }
  }

  async function mover(indice: number, deslocamento: -1 | 1) {
    if (!etapas || !podeEscrever || reordenando || salvandoFormulario || indice + deslocamento < 0 || indice + deslocamento >= etapas.length) return;
    const idsOrdemAtual = etapas.map((etapa) => etapa.id);
    const idsOrdemNova = [...idsOrdemAtual];
    [idsOrdemNova[indice], idsOrdemNova[indice + deslocamento]] = [idsOrdemNova[indice + deslocamento], idsOrdemNova[indice]];
    capturarPosicoes();
    // Força o commit da troca antes da chamada de rede, inclusive em respostas rápidas.
    // O useLayoutEffect aplica FLIP antes da pintura, evitando o salto seco.
    flushSync(() => { setOrdemProvisoria(idsOrdemNova); setReordenando(true); });
    setErroAcao(''); setAvisoAcao('');
    try {
      await mutacoes.reordenar(idsOrdemAtual, idsOrdemNova);
      setAvisoAcao('Ordem das etapas salva.');
    } catch (erro) {
      const conhecido = erro instanceof ErroEtapa;
      setErroAcao(conhecido ? erro.message : 'Não foi possível reordenar. A ordem anterior foi restaurada.');
      if (conhecido && [401, 403, 404].includes(erro.status)) { setBloqueio(true); fecharModal(); }
      if (conhecido && erro.status === 409) void consulta.atualizar().catch(() => {});
    } finally {
      // Na reversão por erro, a posição original também retorna com animação.
      capturarPosicoes();
      setOrdemProvisoria(null); setReordenando(false);
    }
  }

  return <section aria-labelledby="titulo-etapas" className="min-w-0 space-y-4 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 id="titulo-etapas" className="text-lg font-semibold text-brand-neon">Etapas do contrato</h3>
        <p className="mt-1 text-sm text-foreground/65">Planejamento das etapas em sequência, vinculado a este contrato.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void atualizacaoVisivel.executar(atualizar).catch(() => {})} disabled={!habilitado || consulta.atualizando || atualizacaoVisivel.ocupado || reordenando || salvandoFormulario}
          aria-busy={consulta.atualizando || atualizacaoVisivel.ocupado} className="inline-flex min-h-10 min-w-36 items-center justify-center rounded-lg border border-brand-green/40 px-3 py-2 text-sm transition-colors hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-wait disabled:opacity-60">{consulta.atualizando || atualizacaoVisivel.ocupado ? <IndicadorCarregamento compacto texto="Atualizando..." /> : 'Atualizar etapas'}</button>
        {podeEscrever && <button type="button" onClick={(evento) => abrirModal('nova', evento.currentTarget)}
          disabled={reordenando || salvandoFormulario} aria-expanded={editor === 'nova'} aria-controls="formulario-nova-etapa"
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-all duration-200 motion-reduce:transition-none hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed ${editor === 'nova' ? 'border-brand-green bg-brand-green/15 text-brand-neon' : 'border-brand-green bg-brand-green text-on-brand-green hover:brightness-110'} disabled:opacity-100`}>
          <span>{editor === 'nova' ? 'Cadastrando etapa' : 'Nova etapa'}</span>
        </button>}
      </div>
    </div>
    {erroAcao && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erroAcao}</p>}
    {avisoAcao && <p role="status" className="text-sm text-brand-neon">{avisoAcao}</p>}
    {reordenando && <p role="status" className="text-sm text-foreground/65">Salvando nova ordem...</p>}
    {consulta.carregando && !etapas && !erroConsulta && !bloqueio && <p role="status" className="text-sm text-foreground/70">Carregando etapas...</p>}
    {Boolean(erroConsulta) && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">
      {erroConsulta instanceof ErroEtapa ? erroConsulta.message : 'Não foi possível consultar as etapas. Tente atualizar.'}
    </p>}
    {bloqueio && !erroConsulta && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">O acesso às etapas precisa ser verificado novamente. Atualize a página.</p>}

    {etapas?.length === 0 && <div className="rounded-xl border border-dashed border-brand-green/30 p-4 text-sm text-foreground/70">
      Ainda não há etapas cadastradas para este contrato. {podeEscrever ? 'Use “Nova etapa” para organizar o planejamento.' : 'O planejamento ainda não foi iniciado.'}
    </div>}
    {!!ordenadas?.length && <ol aria-label="Etapas em ordem de execução" className="space-y-3">
      {ordenadas.map((etapa, indice) => <li key={etapa.id} ref={(no) => { if (no) cartoesEtapa.current.set(etapa.id, no); else cartoesEtapa.current.delete(etapa.id); }} className="min-w-0 rounded-xl border border-brand-green/25 bg-background/70 p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/55">Etapa {indice + 1} {etapa.codigo ? `· ${etapa.codigo}` : ''}</p>
            <h4 className="break-words font-semibold">{etapa.nome}</h4>
            <p className="text-sm text-foreground/70">{STATUS_ETAPA[etapa.status]}</p>
          </div>
          {podeEscrever && <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={reordenando || salvandoFormulario || indice === 0} onClick={() => void mover(indice, -1)}
              aria-label={`Subir etapa ${etapa.nome}`} className="inline-flex items-center gap-1 rounded-lg border border-brand-green/45 px-3 py-2 text-sm font-medium transition-all duration-200 hover:border-brand-neon hover:bg-brand-green/20 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-brand-green/45 disabled:hover:bg-transparent disabled:hover:shadow-none"><span aria-hidden="true">↑</span> Subir</button>
            <button type="button" disabled={reordenando || salvandoFormulario || indice === ordenadas.length - 1} onClick={() => void mover(indice, 1)}
              aria-label={`Descer etapa ${etapa.nome}`} className="inline-flex items-center gap-1 rounded-lg border border-brand-green/45 px-3 py-2 text-sm font-medium transition-all duration-200 hover:border-brand-neon hover:bg-brand-green/20 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-brand-green/45 disabled:hover:bg-transparent disabled:hover:shadow-none"><span aria-hidden="true">↓</span> Descer</button>
            <button type="button" disabled={reordenando || salvandoFormulario}
              onClick={(evento) => abrirModal(etapa.id, evento.currentTarget)}
              aria-expanded={editor === etapa.id} aria-controls={`formulario-etapa-${etapa.id}`}
              aria-label={editor === etapa.id ? `Editando etapa ${etapa.nome}` : `Editar etapa ${etapa.nome}`}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-200 motion-reduce:transition-none hover:bg-brand-green/15 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-default ${editor === etapa.id ? 'border-brand-green bg-brand-green/15 text-brand-neon' : 'border-brand-green/40 hover:bg-brand-green/10'} ${reordenando ? 'opacity-40' : ''}`}>
              {editor === etapa.id ? 'Editando' : 'Editar'}
            </button>
          </div>}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-foreground/55">Início previsto</dt><dd>{dataBR(etapa.inicioPrevisto)}</dd></div>
          <div><dt className="text-xs text-foreground/55">Término previsto</dt><dd>{dataBR(etapa.terminoPrevisto)}</dd></div>
        </dl>
        {etapa.descricao && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground/75">{etapa.descricao}</p>}
        {etapa.observacoes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground/65"><strong>Observações:</strong> {etapa.observacoes}</p>}
        {etapa.avisoVigencia && <p role="note" className="mt-3 rounded-lg border border-amber-600/45 p-3 text-sm text-foreground">
          Atenção: as datas previstas desta etapa estão fora da vigência atual do contrato. Revise o planejamento; nenhuma data foi alterada automaticamente.
        </p>}
        <EntregaveisDaEtapa contratoId={contratoId} etapaId={etapa.id}
          dados={entregaveisQuery.dados} erro={entregaveisQuery.erro}
          carregando={entregaveisQuery.carregando} atualizar={entregaveisQuery.atualizar} podeCriar={podeEscrever} />

      </li>)}
    </ol>}
    {podeEscrever && editor && <ModalEtapa titulo={editor === 'nova' ? 'Nova etapa' : `Editar etapa · ${itemEditando?.nome ?? ''}`}
      ocupado={salvandoFormulario} focoRetorno={gatilhoModal} onFechar={fecharModal}>
      <div id={editor === 'nova' ? 'formulario-nova-etapa' : `formulario-etapa-${editor}`}>
        <FormularioEtapa key={editor} inicial={itemEditando} onSalvar={salvar}
          onCancelar={fecharModal} onSalvandoMudou={setSalvandoFormulario} />
      </div>
    </ModalEtapa>}
  </section>;
}
