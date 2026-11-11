'use client';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { ModalDetalheEntregavel } from './modal-detalhe-entregavel';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { indicadoresPlanejamento } from '@/lib/indicadores-planejamento';
import type { ResumoDocumentalEntregavel } from '@/lib/entregaveis';
import { ajustarRestauracaoHistorico } from '@/lib/historico-modal-scroll';
import { FormularioEntregavel } from './formulario-entregavel';
import { criarEntregavel, listarEntregaveisArquivados, concluirEntregavel, reabrirEntregavel, alterarArquivoEntregavel, excluirEntregavelArquivado } from '@/lib/entregaveis';
import type { DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
import type { PermissoesContrato } from '@/lib/contratos';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';
import { ROTULOS_TIPO, intervaloPrevisto, type Entregavel } from '@/lib/entregaveis';
import { rotuloCodigoPublico } from '@/lib/codigos-publicos';
import { entregavelDocumentalmenteConcluido } from '@/lib/situacao-documental-etapa';

/** HU07-04: listagem real e cadastro sob autorização do backend; edição no detalhe. */
export function EntregaveisDaEtapa({ estadoProprioEtapa, contratoId, etapaId, dados, carregando, erro, atualizar, podeCriar = false, podeEditar, podeArquivar, permissoes, documental, dentroModal = false, podeVerArquivados = true, paiArquivado = false, paiEmRevisao = false, paiConcluido = false, onDetalheMudou, atualizarDocumental, onHierarquiaAlterada }: {
  contratoId: string; etapaId: string; dados?: Entregavel[];
  carregando: boolean; erro?: unknown; atualizar: () => Promise<unknown>; podeCriar?: boolean;
  podeEditar?: boolean; podeArquivar?: boolean; permissoes?: PermissoesContrato; documental?: Record<string, ResumoDocumentalEntregavel>;
  estadoProprioEtapa?: 'normal' | 'revisao' | 'concluido' | 'arquivado' | 'encerrado'; dentroModal?: boolean; podeVerArquivados?: boolean; paiArquivado?: boolean; paiEmRevisao?: boolean; paiConcluido?: boolean; onDetalheMudou?: (aberto: boolean) => void; atualizarDocumental?: () => void; onHierarquiaAlterada?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [iniciado, setIniciado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');
  // A paleta é da própria etapa, não do contrato que foi arquivado.
  const contextoVisualEtapa = estadoProprioEtapa ?? (paiEmRevisao ? 'revisao' : paiConcluido ? 'concluido' : 'normal');
  const classeAbaAtiva = contextoVisualEtapa === 'arquivado' ? 'bg-amber-500/20 text-amber-200' : contextoVisualEtapa === 'revisao' ? 'bg-teal-700/25 text-teal-200' : contextoVisualEtapa === 'concluido' ? 'bg-violet-500/20 text-violet-200' : contextoVisualEtapa === 'encerrado' ? 'bg-slate-600/25 text-slate-200' : 'bg-brand-green text-on-brand-green';
  const [abaEntregaveis, setAbaEntregaveis] = useState<'ativos' | 'revisao' | 'comprovados' | 'arquivados'>('ativos');
  const mostrarArquivados = abaEntregaveis === 'arquivados';
  const paiBloqueado = paiArquivado || paiConcluido;
  const [arquivados, setArquivados] = useState<Entregavel[]>([]);
  const [ocupadoArquivo, setOcupadoArquivo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);
  const [confirmarArquivamento, setConfirmarArquivamento] = useState<string | null>(null);
  const [confirmarReativacao, setConfirmarReativacao] = useState<string | null>(null);
  const [confirmarReabertura, setConfirmarReabertura] = useState<string | null>(null);
  const [motivoEntregavel, setMotivoEntregavel] = useState('');
  const [confirmarConclusao, setConfirmarConclusao] = useState<string | null>(null);
  const [ocultadosLocais, setOcultadosLocais] = useState<string[]>([]);
  const [editarAoAbrir, setEditarAoAbrir] = useState(false);
  async function alternarArquivados() {
    if (mostrarArquivados) { setAbaEntregaveis('ativos'); return; }
    try { setAbaEntregaveis('arquivados'); const lista = await listarEntregaveisArquivados(contratoId, etapaId); setArquivados(lista); setAviso(''); }
    catch (e) { setAviso(e instanceof Error ? e.message : 'Falha ao consultar entregáveis arquivados.'); }
  }
  async function alterarArquivo(id: string, acao: 'arquivar' | 'reativar') {
    if (paiBloqueado || (acao === 'reativar' && !permissoes?.reativarEntregaveis) || (acao === 'arquivar' && !podeArquivar)) return;
    setOcupadoArquivo(true); setAviso('');
    try {
      await alterarArquivoEntregavel(contratoId, id, acao, acao === 'reativar' ? motivoEntregavel.trim() : undefined);
      // Primeiro atualizar a visão local em uma única pintura; consultas não
      // devem fazer o cartão reaparecer em um intervalo entre requisições.
      if (acao === 'arquivar') setOcultadosLocais(atuais => [...new Set([...atuais, id])]);
      else { setArquivados(atuais => atuais.filter(item => item.id !== id)); setOcultadosLocais(atuais => atuais.filter(item => item !== id)); }
      setConfirmarArquivamento(null); setConfirmarReativacao(null); setMotivoEntregavel('');
      if (detalheId === id) fecharDetalhe();
      (acao === 'arquivar' ? toastAviso : toastSucesso)(acao === 'arquivar' ? 'Entregável arquivado.' : 'Entregável reativado.');
      // Falha de atualização não transforma mutação confirmada em erro.
      await atualizar().catch(() => {});
      atualizarDocumental?.();
      if (mostrarArquivados) {
        const lista = await listarEntregaveisArquivados(contratoId, etapaId).catch(() => null);
        if (lista) setArquivados(acao === 'reativar' ? lista.filter(item => item.id !== id) : lista);
      }
    } catch (e) { setAviso(e instanceof Error ? e.message : 'Não foi possível alterar o arquivamento.'); }
    finally { setOcupadoArquivo(false); }
  }
  async function executarReabertura() {
    const id = confirmarReabertura;
    if (!id || ocupadoArquivo || paiBloqueado || !permissoes?.reabrirEntregaveis) return;
    setOcupadoArquivo(true); setAviso('');
    try {
      await reabrirEntregavel(contratoId, id, motivoEntregavel.trim());
      setConfirmarReabertura(null); setMotivoEntregavel('');
      toastSucesso('Entregável reaberto para edição.');
      await atualizar().catch(() => {});
      atualizarDocumental?.();
      onHierarquiaAlterada?.();
    } catch (erro) { setAviso(erro instanceof Error ? erro.message : 'Não foi possível reabrir o entregável.'); }
    finally { setOcupadoArquivo(false); }
  }
  async function executarConclusao() {
    const id = confirmarConclusao;
    if (!id || ocupadoArquivo || paiBloqueado || !permissoes?.concluirEntregaveis) return;
    setOcupadoArquivo(true); setAviso('');
    try {
      await concluirEntregavel(contratoId, id);
      setConfirmarConclusao(null);
      toastSucesso('Conclusão registrada; a etapa também será concluída se todos os filhos estiverem prontos.');
      await atualizar().catch(() => {});
      atualizarDocumental?.();
      onHierarquiaAlterada?.();
    } catch (erro) { setAviso(erro instanceof Error ? erro.message : 'Não foi possível concluir entregável.'); }
    finally { setOcupadoArquivo(false); }
  }
  async function excluirArquivado() {
    const id = confirmarExclusao;
    if (!id || ocupadoArquivo || paiBloqueado || !permissoes?.excluirEntregaveisArquivados) return;
    setOcupadoArquivo(true);
    setAviso('');
    try {
      await excluirEntregavelArquivado(contratoId, id);
      // O item deixa imediatamente a lista local, sem aguardar a atualização remota.
      setArquivados(atuais => atuais.filter(item => item.id !== id));
      setConfirmarExclusao(null);
      if (detalheId === id) fecharDetalhe();
      toastSucesso('Entregável excluído com sucesso.');
      // Falhas de recarga não desfazem a exclusão já confirmada pela API.
      await atualizar().catch(() => {});
      const lista = await listarEntregaveisArquivados(contratoId, etapaId).catch(() => null);
      if (lista) setArquivados(lista.filter(item => item.id !== id));
      atualizarDocumental?.();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Não foi possível excluir o entregável arquivado.');
    } finally {
      setOcupadoArquivo(false);
    }
  }
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
  function abrirDetalhe(id: string, evento: MouseEvent<HTMLElement>, editar = false) {
    if (detalheId) return;
    const marcador = `${marcadorModal}:${id}`;
    posicao.current = { x: window.scrollX, y: window.scrollY, restauracao: window.history.scrollRestoration };
    ajustarRestauracaoHistorico('manual');
    const anterior = window.history.state;
    window.history.pushState({ ...(anterior && typeof anterior === 'object' ? anterior : {}), __modalEntregavel: marcador }, '', window.location.href);
    historico.current = marcador;
    setGatilhoDetalhe(evento.currentTarget);
    setEditarAoAbrir(editar);
    setDetalheId(id);
    onDetalheMudou?.(true);
  }
  function fecharDetalhe(pularEdicao = false) {
    if (!detalheId) return;
    const marcador = historico.current;
    setDetalheId(null);
    onDetalheMudou?.(false);
    if (marcador && window.history.state?.__modalEntregavel === marcador) {
      // Não limpar o marcador nem restaurar o scroll antes do popstate: o
      // navegador ainda pode reposicionar a página durante history.back().
      // Arquivamento a partir do editor: desfaz a entrada de edição e a do modal
      // em uma única travessia, sem deixar histórico fantasma na navegação.
      if (pularEdicao && window.history.state?.__editarEntregavel) window.history.go(-2);
      else window.history.back();
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
      onDetalheMudou?.(false);
      restaurar();
    };
    window.addEventListener('popstate', voltar);
    return () => window.removeEventListener('popstate', voltar);
  }, [restaurar, onDetalheMudou]);
  useEffect(() => () => {
    if (posicao.current) ajustarRestauracaoHistorico(posicao.current.restauracao);
  }, []);
  async function cadastrar(dados: DadosPlanejamentoEntregavel) {
    if (paiBloqueado) return;
    await criarEntregavel(contratoId, dados);
    setAberto(false); setIniciado(false); toastSucesso('Entregável cadastrado com sucesso.');
    // Se a leitura falhar depois do POST, o sucesso do cadastro não se perde.
    await atualizar().catch(() => {});
    atualizarDocumental?.();
  }
  // Nunca exibir um item cujo contrato/etapa nao corresponda ao contexto visivel.
  const visiveis = dados?.filter((e) => e.contratoId === contratoId && e.etapaId === etapaId && !e.arquivadoEm && !ocultadosLocais.includes(e.id)) ?? [];
  const indicadores = indicadoresPlanejamento(visiveis);
  const concluidos = visiveis.filter(e => e.statusExecucao === 'CONCLUIDO' && !e.reabertoEm);
  const exibidos = abaEntregaveis === 'comprovados' ? concluidos :
    abaEntregaveis === 'revisao' ? visiveis.filter(e => Boolean(e.reabertoEm)) :
    visiveis; // Todas reúne planejamento, revisão/reabertura e concluídos; arquivados ficam em aba própria.
  const protegido = erro && typeof erro === 'object' && 'status' in erro &&
    [401, 403, 404].includes((erro as { status?: number }).status ?? -1);
  return <section data-tec08-contexto-operacional data-tec08-estado={contextoVisualEtapa} aria-label="Entregáveis da etapa" className={`mt-4 min-h-[min(42dvh,400px)] min-w-0 rounded-xl border p-3 sm:p-4 ${contextoVisualEtapa === 'arquivado' ? 'border-amber-500/45 bg-amber-500/[0.04]' : contextoVisualEtapa === 'revisao' ? 'border-teal-700/40 bg-teal-900/[0.05]' : contextoVisualEtapa === 'concluido' ? 'border-violet-500/40 bg-violet-500/[0.04]' : contextoVisualEtapa === 'encerrado' ? 'border-slate-500/40 bg-slate-500/[0.04]' : 'border-brand-green/20 bg-brand-darkgreen/10'}`}>
    <div className="flex min-w-0 flex-nowrap items-center justify-between gap-2">
      <AbasRolaveis className="min-w-0 flex-1"><div role="tablist" aria-label="Entregáveis da etapa" className={`inline-flex items-center gap-1 rounded-xl border bg-background/70 p-1 ${contextoVisualEtapa === 'arquivado' ? 'border-amber-500/40' : contextoVisualEtapa === 'revisao' ? 'border-teal-700/45' : contextoVisualEtapa === 'concluido' ? 'border-violet-500/40' : contextoVisualEtapa === 'encerrado' ? 'border-slate-500/40' : 'border-brand-green/25'}`}>
        <button type="button" role="tab" aria-selected={abaEntregaveis === 'ativos'} onClick={() => setAbaEntregaveis('ativos')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-none ${abaEntregaveis === 'ativos' ? classeAbaAtiva : 'text-foreground/70 hover:bg-brand-green/10 hover:text-foreground'}`}>
          Todas
        </button>
        <button type="button" role="tab" aria-selected={abaEntregaveis === 'revisao'} onClick={() => setAbaEntregaveis('revisao')}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-none ${abaEntregaveis === 'revisao' ? classeAbaAtiva : 'text-foreground/65 hover:bg-teal-700/10'}`}>Em revisão</button>
        <button type="button" role="tab" aria-selected={abaEntregaveis === 'comprovados'}
          aria-label="Entregáveis concluídos" onClick={() => setAbaEntregaveis('comprovados')}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-none ${abaEntregaveis === 'comprovados' ? classeAbaAtiva : 'text-foreground/65 hover:bg-violet-500/10'}`}>
          ◉ Concluídos
        </button>
        {podeVerArquivados && <button type="button" role="tab" aria-selected={mostrarArquivados}
          aria-label="Entregáveis arquivados" title="Entregáveis arquivados" onClick={() => void alternarArquivados()}
          className={`inline-flex h-9 w-10 items-center justify-center rounded-lg transition-colors ${mostrarArquivados ? 'bg-amber-500/20 text-amber-200' : 'text-foreground/65 hover:bg-amber-500/10 hover:text-amber-200'}`}>
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg>
        </button>}
      </div></AbasRolaveis>
      {abaEntregaveis === 'ativos' && podeCriar && !paiBloqueado && !erro && <button type="button" disabled={salvando} aria-expanded={aberto}
        aria-controls={`cadastro-entregavel-${etapaId}`} data-tec08-acao-criar
        onClick={() => { setIniciado(true); setAberto(anterior => !anterior); setAviso(''); }}
        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-on-brand-green transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
        {aberto ? 'Cadastrando entregável' : 'Novo entregável'}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
          className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${aberto ? 'rotate-180' : ''}`}>
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>}
    </div>
    {!mostrarArquivados && !erro && !carregando && visiveis.length > 0 && <div data-testid="resumo-execucao-etapa"
      className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/65">
      <span>{visiveis.length} {visiveis.length === 1 ? 'entregável' : 'entregáveis'} · {indicadores.esperadas} {indicadores.esperadas === 1 ? 'evidência esperada' : 'evidências esperadas'}</span>
    </div>}
    {aviso && <p role="alert" className="mt-2 text-sm text-error-text">{aviso}</p>}
    {abaEntregaveis === 'ativos' && podeCriar && !paiBloqueado && !erro && iniciado && <div id={`cadastro-entregavel-${etapaId}`} hidden={!aberto} data-tec08-criacao="true" className="mt-3">
      <FormularioEntregavel contratoId={contratoId} etapaId={etapaId} onSalvar={cadastrar} onCancelar={() => setAberto(false)}
        podeAlterarObrigatoriedade={permissoes?.alterarObrigatoriedade ?? false}
        podeCriarEvidencias={permissoes?.criarEvidencias ?? podeCriar}
        onSalvandoMudou={setSalvando} />
    </div>}
    {!mostrarArquivados && carregando && !dados && !erro && <p role="status" className="mt-3 text-sm">Carregando entregáveis...</p>}
    {!mostrarArquivados && Boolean(erro) && <p role="alert" className="mt-3 break-words text-sm text-error-text">
      {erro instanceof Error ? erro.message : 'Falha ao consultar entregáveis.'}
    </p>}
    {!mostrarArquivados && !carregando && !erro && !exibidos.length && <p className="mt-3 text-sm text-foreground/70">{abaEntregaveis === 'comprovados' ? 'Nenhum entregável concluído.' : 'Nenhum entregável pendente de comprovação.'}</p>}
    {podeVerArquivados && mostrarArquivados && <section role="tabpanel" className="mt-3 space-y-2" aria-label="Entregáveis arquivados">
      <h6 className="sr-only">Entregáveis arquivados</h6>
      {arquivados.length === 0 ? <p className="text-sm text-foreground/70">Nenhum entregável arquivado nesta etapa.</p> :
        <ul className="space-y-2">{arquivados.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-background p-3 text-foreground">
          <button type="button" onClick={evento => abrirDetalhe(item.id, evento)} aria-haspopup="dialog" className="min-w-0 flex-1 text-left hover:text-foreground focus-visible:outline-2 focus-visible:outline-amber-300">
            <span className="block text-xs font-mono text-foreground/65">{rotuloCodigoPublico(item.codigoPublico)} · Arquivado</span>
            <span className="break-words text-sm font-medium">{item.nome}</span>
          </button>
          <div className="flex flex-wrap gap-2">
            {permissoes?.reativarEntregaveis && <button type="button" disabled={ocupadoArquivo || paiBloqueado} title={paiArquivado ? 'Reative a etapa antes de alterar os entregáveis' : 'Reativar entregável'} onClick={() => setConfirmarReativacao(item.id)}
              className="rounded-lg border border-amber-400/50 px-3 py-2 text-xs font-semibold text-amber-900 dark:text-amber-100 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-700/10 disabled:text-slate-400">Reativar</button>}
            {permissoes?.excluirEntregaveisArquivados && <button type="button" title="Excluir entregável definitivamente" aria-label={`Excluir entregável arquivado ${item.nome}`}
              disabled={ocupadoArquivo || paiBloqueado} onClick={() => setConfirmarExclusao(item.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/55 bg-red-600/10 px-3 py-2 text-xs text-red-100 hover:bg-red-500/20">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>Excluir
            </button>}
          </div>
        </li>)}</ul>}
    </section>}
    {!mostrarArquivados && !protegido && !erro && exibidos.length > 0 && <ul aria-label="Entregáveis planejados da etapa" className="mt-3 space-y-2">
      {exibidos.map((e) => {
        const resumoItem = documental?.[e.id];
        const completo = entregavelDocumentalmenteConcluido(e, resumoItem);
        const concluidoVisual = e.statusExecucao === 'CONCLUIDO' && !e.reabertoEm;
        const comprovacaoSemConclusao = completo && !concluidoVisual && !e.reabertoEm;
        return <li key={e.id} data-tec08-item-clicavel data-entregavel-estado={e.arquivadoEm ? 'arquivado' : concluidoVisual ? 'concluido' : e.reabertoEm ? 'revisao' : 'normal'} className="relative min-w-0">
        <Link href={`/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(e.id)}`}
          onClick={(evento) => {
            // Clique comum abre o detalhe no modal; modificadores permitem nova aba.
            if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.altKey || evento.shiftKey) return;
            evento.preventDefault(); abrirDetalhe(e.id, evento);
          }}
          aria-haspopup="dialog" aria-label={e.nome}
          title={`Abrir detalhes de ${e.nome}`}
          className={`group block min-w-0 cursor-pointer rounded-xl border p-3.5 pb-14 text-left transition-none focus-visible:outline-2 focus-visible:outline-offset-2 ${e.arquivadoEm ? 'border-amber-500/60 bg-background text-foreground focus-visible:outline-amber-300' : e.reabertoEm ? 'border-teal-700/60 bg-background focus-visible:outline-teal-600' : concluidoVisual
            ? 'border-violet-500/65 bg-background hover:border-violet-400 focus-visible:outline-violet-400'
            : comprovacaoSemConclusao ? 'border-brand-green/40 bg-background hover:border-brand-green/55 focus-visible:outline-brand-neon' : 'border-brand-green/20 bg-background hover:border-brand-green/55 focus-visible:outline-brand-neon'}`}>
          <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
            <span aria-label={completo ? 'Entregável com comprovação documental completa' : 'Entregável com comprovação pendente'} title={completo ? 'Comprovação completa' : 'Comprovação pendente'}
              className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${e.arquivadoEm ? 'border-amber-400/65 bg-amber-500/20 text-amber-200' : e.reabertoEm ? 'border-teal-600/60 bg-teal-900/20 text-teal-200' : concluidoVisual ? 'border-violet-400/65 bg-violet-500/20 text-violet-200' : comprovacaoSemConclusao ? 'border-brand-green/50 bg-brand-green/10 text-brand-neon' : 'border-brand-green/30 bg-brand-green/10 text-brand-neon/75'}`}>
              {completo ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
              </svg> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4"><circle cx="12" cy="12" r="8" /></svg>}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className={`min-w-0 break-words text-base font-semibold ${e.arquivadoEm ? 'text-amber-300' : e.reabertoEm ? 'text-teal-300' : concluidoVisual ? 'text-violet-300' : 'text-brand-neon'}`}>{e.nome}</p>
                <span className="shrink-0 font-mono text-xs text-foreground/60">{rotuloCodigoPublico(e.codigoPublico)}</span>
              </div>
              {intervaloPrevisto(e.inicioPrevisto, e.terminoPrevisto) &&
                <p className="mt-1 text-xs text-foreground/80">{intervaloPrevisto(e.inicioPrevisto, e.terminoPrevisto)}</p>}
              <p className="mt-0.5 break-words text-xs text-foreground/70">{e.codigo ? `${e.codigo} · ` : ''}{ROTULOS_TIPO[e.tipo]}</p>
            </div>
            <div className="col-start-3 row-start-1 flex shrink-0 items-center justify-self-end gap-1.5 self-start pl-1">
              <span className={`rounded-full border px-2.5 py-1 text-xs ${e.reabertoEm ? 'border-teal-600/55 bg-teal-900/20 text-teal-200' : concluidoVisual ? 'border-violet-400/55 bg-violet-500/15 text-violet-100' : comprovacaoSemConclusao ? 'border-brand-green/45 bg-brand-green/10 text-foreground' : 'border-brand-green/30'}`}>{e.reabertoEm ? 'Em revisão' : concluidoVisual ? 'Concluído' : e.statusExecucao === 'CONCLUIDO' ? 'Execução concluída' :
                e.statusExecucao === 'EM_ANDAMENTO' ? 'Em andamento' : 'Planejamento'}</span>
              <span aria-hidden="true" className="text-sm text-foreground/65">›</span>
            </div>
          </div>
          {(() => {
            const resumo = documental?.[e.id];
            const total = resumo?.obrigatorias ?? e.evidenciasEsperadas.filter(ev => !ev.arquivadoEm && ev.obrigatoria !== false).length;
            const verificadas = resumo?.verificadas ?? 0;
            return <div className="mt-2 space-y-1.5">
              <div className={`flex flex-wrap items-center justify-between gap-2 text-xs ${e.reabertoEm ? 'text-teal-200/85' : completo ? 'text-foreground/80' : 'text-foreground/65'}`}>
                <span>{`${verificadas}/${total} ${total === 1 ? 'evidência obrigatória' : 'evidências obrigatórias'}`}{comprovacaoSemConclusao ? ' · Comprovação documental completa' : ''}</span>
              </div>
              {total > 0 && <div role="img" aria-label={`${verificadas} de ${total} evidências obrigatórias verificadas; não representa execução física`}
                className="flex h-1.5 max-w-56 gap-0.5 overflow-hidden rounded-full">
                {Array.from({ length: total }, (_, index) => <span key={index} data-tec08-progresso-preenchido={index < verificadas ? "true" : "false"}
                  className={`min-w-0 flex-1 rounded-sm ${index < verificadas ? e.reabertoEm || (paiEmRevisao && !completo) ? 'tec08-progresso-comprovacao bg-teal-600' : 'bg-violet-500' : e.reabertoEm ? 'bg-teal-900/30' : 'bg-violet-500/15'}`} />)}
              </div>}
            </div>;
          })()}
        </Link>
        {(podeArquivar || podeEditar || permissoes?.reabrirEntregaveis) && <div className="absolute bottom-2 right-3 z-[2] flex min-h-9 items-center justify-end gap-1.5 rounded-lg bg-background/95 p-0.5">
          {permissoes?.reabrirEntregaveis && concluidoVisual && !paiBloqueado && <button type="button" aria-label={`Reabrir entregável ${e.nome}`} title="Reabrir entregável verificado" disabled={ocupadoArquivo} onClick={() => setConfirmarReabertura(e.id)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-teal-500/50 bg-teal-950 px-2 text-teal-100 hover:bg-teal-900">⟳ <span className="text-xs font-semibold">Reabrir</span></button>}
          {podeArquivar && <button type="button" disabled={ocupadoArquivo || paiBloqueado || (completo && !e.reabertoEm) || (e.statusExecucao === 'CONCLUIDO' && !e.reabertoEm)} aria-label={`Arquivar entregável ${e.nome}`} title={paiArquivado ? 'Etapa arquivada: reative a etapa antes de arquivar o entregável' : 'Arquivar entregável'}
            onClick={() => setConfirmarArquivamento(e.id)} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border disabled:cursor-not-allowed ${paiArquivado ? 'border-slate-500/35 bg-slate-500/10 text-slate-500' : 'border-amber-500/40 text-amber-200 hover:bg-amber-500/15'} disabled:opacity-70 disabled:!bg-slate-600/10 disabled:!text-slate-400`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg>
          </button>}
          {podeEditar && <button type="button" aria-label={`Editar entregável ${e.nome}`} title={paiArquivado ? 'Contrato ou etapa arquivados: edição bloqueada' : 'Editar entregável'} disabled={paiBloqueado || (completo && !e.reabertoEm) || (e.statusExecucao === 'CONCLUIDO' && !e.reabertoEm)} onClick={evento => abrirDetalhe(e.id, evento, true)}
            data-tec08-editar-entidade className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-green/40 text-brand-neon hover:bg-brand-green/15 disabled:cursor-not-allowed disabled:border-slate-600 disabled:bg-slate-600/10 disabled:text-slate-400 disabled:opacity-65">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m15 5 4 4M4 20l4.5-1 11-11a2 2 0 0 0-3-3l-11 11L4 20Z"/></svg>
          </button>}
        </div>}
      </li>;
      })}
    </ul>}
    {detalheId && !protegido && (!erro || mostrarArquivados) && <ModalDetalheEntregavel contratoId={contratoId} etapaId={etapaId}
    entregavelId={detalheId} itemInicial={[...(dados ?? []), ...arquivados].find(item => item.id === detalheId)}
    dentroModal={dentroModal} resumoInicial={documental?.[detalheId]} paiConcluido={paiConcluido} paiEmRevisao={paiEmRevisao} verificado={Boolean([...(dados ?? []), ...arquivados].find(e => e.id === detalheId)?.statusExecucao === 'CONCLUIDO' && ![...(dados ?? []), ...arquivados].find(e => e.id === detalheId)?.reabertoEm)} iniciarEditando={editarAoAbrir && !paiBloqueado} paiArquivado={paiArquivado} podeEditar={!paiBloqueado && (podeEditar ?? podeCriar)} permissoes={permissoes}
    focoRetorno={gatilhoDetalhe} onFechar={() => fecharDetalhe()} atualizar={async () => {
      atualizarDocumental?.();
      await atualizar();
      onHierarquiaAlterada?.();
      if (mostrarArquivados) setArquivados(await listarEntregaveisArquivados(contratoId, etapaId));
    }} />}
    {confirmarReabertura && <ConfirmacaoSimples titulo="Reabrir entregável concluído?"
      descricao="O entregável ficará Reaberto. Etapa e evidências verificadas permanecerão em seus estados anteriores até reabertura específica. O histórico será preservado."
      confirmar="Reabrir entregável" ocupado={ocupadoArquivo} justificativa={motivoEntregavel} onJustificativaChange={setMotivoEntregavel} onCancelar={() => { setConfirmarReabertura(null); setMotivoEntregavel(''); }}
      onConfirmar={() => void executarReabertura()} />}
    {confirmarArquivamento && <ConfirmacaoSimples titulo="Arquivar entregável?" descricao="O entregável será retirado dos ativos, mantendo arquivos e histórico para reativação."
      confirmar="Confirmar arquivamento" ocupado={ocupadoArquivo} onCancelar={() => setConfirmarArquivamento(null)}
      onConfirmar={() => void alterarArquivo(confirmarArquivamento, 'arquivar')} />}
    {confirmarReativacao && <ConfirmacaoSimples titulo="Reativar entregável?"
      descricao="O entregável voltará à lista ativa da etapa, preservando seu checklist e comprovantes."
      confirmar="Confirmar reativação" ocupado={ocupadoArquivo} justificativa={motivoEntregavel} onJustificativaChange={setMotivoEntregavel} onCancelar={() => { setConfirmarReativacao(null); setMotivoEntregavel(''); }}
      onConfirmar={() => void alterarArquivo(confirmarReativacao, 'reativar')} />}
    {confirmarConclusao && <ConfirmacaoSimples titulo="Concluir entregável?" descricao="A conclusão exige evidências verificadas e será registrada na auditoria."
      confirmar="Concluir entregável" ocupado={ocupadoArquivo} onCancelar={() => setConfirmarConclusao(null)}
      onConfirmar={() => void executarConclusao()} />}
    {confirmarExclusao && <ConfirmacaoSimples titulo="Excluir entregável arquivado?" perigoso
      descricao="Serão removidos definitivamente o entregável e seus dependentes, incluindo comprovantes e arquivos. Esta ação não pode ser desfeita."
      confirmar="Excluir definitivamente" ocupado={ocupadoArquivo} onCancelar={() => setConfirmarExclusao(null)} onConfirmar={() => void excluirArquivado()} />}
  </section>;
}
