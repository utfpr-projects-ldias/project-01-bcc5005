'use client';
import { NavegadorEntregaveis } from './navegador-entregaveis';
import { solicitarNavegacaoInterna } from './navegacao-interna';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';

import { chaveTexto } from '@/lib/repositorio-consultas';
import { resultadoFinalizacao } from '@/lib/finalizados';
import { estadoDoObjeto, rotuloEstadoEntregavel } from '@/lib/identidade-operacional';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { ModalEtapa } from './modal-etapa';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { CHAVES_ENTREGAVEIS } from '@/hooks/use-entregaveis';
import { IconeStatus } from '@/app/components/icones-status';
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { ModalDetalheEntregavel } from './modal-detalhe-entregavel';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import type { ResumoDocumentalEntregavel } from '@/lib/entregaveis';
import { ajustarRestauracaoHistorico } from '@/lib/historico-modal-scroll';
import { FormularioEntregavel } from './formulario-entregavel';
import { criarEntregavel, listarEntregaveisArquivados, detalharEntregavel, concluirEntregavel, reabrirEntregavel, alterarArquivoEntregavel, excluirEntregavelArquivado } from '@/lib/entregaveis';
import type { DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
import type { PermissoesContrato, ModoCalculo } from '@/lib/contratos';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';
import { ROTULOS_TIPO, type Entregavel } from '@/lib/entregaveis';
import { rotuloCodigoPublico } from '@/lib/codigos-publicos';
import { AnelTabela, BarraTabela, CabecalhoColuna, ComprovacaoTabela, IconeTabela, StatusTabela, metricasEntregavel, taxa, ordenarTabela, ordemEstados, useOrdemTabela } from './tabela-operacional';
import { ExplicacaoConclusaoEntregavel } from './explicacao-conclusao-entregavel';

/** HU07-04: listagem real e cadastro sob autorização do backend; edição no detalhe. */
export function EntregaveisDaEtapa({ estadoProprioEtapa, contratoId, etapaId, modoCalculo = 'PONDERADO', dados, carregando, erro, atualizar, podeCriar = false, podeEditar, podeArquivar, permissoes, documental, progressoFisico, dentroModal = false, podeVerArquivados = true, paiArquivado = false, paiEmRevisao = false, paiConcluido = false, paiParcial = false, onDetalheMudou, atualizarDocumental, onHierarquiaAlterada, somenteDetalheId, interno = false, destinoInterno, painelDireitoAberto = false, contextoCadastro, nomeEtapa, onSelecaoInterna }: {
  nomeEtapa?: string; contextoCadastro?: string; onSelecaoInterna?: (id:string|null)=>void; interno?: boolean; destinoInterno?: { id: string; origemRegistro?: import('./execucoes-entregavel').OrigemExecucao }; painelDireitoAberto?: boolean;
  somenteDetalheId?: string; contratoId: string; etapaId: string; modoCalculo?: ModoCalculo; dados?: Entregavel[];
  carregando: boolean; erro?: unknown; atualizar: () => Promise<unknown>; podeCriar?: boolean;
  podeEditar?: boolean; podeArquivar?: boolean; permissoes?: PermissoesContrato; documental?: Record<string, ResumoDocumentalEntregavel>; progressoFisico?: readonly { entregavelId: string; percentualExecucao: number | null; participacaoOperacional?: number | null }[];
  estadoProprioEtapa?: import('@/lib/estado-visivel-contrato').EstadoContextual; dentroModal?: boolean; podeVerArquivados?: boolean; paiArquivado?: boolean; paiEmRevisao?: boolean; paiConcluido?: boolean; paiParcial?: boolean; onDetalheMudou?: (aberto: boolean) => void; atualizarDocumental?: () => void; onHierarquiaAlterada?: () => void;
}) {
  const cacheDetalhe = useRepositorioConsultasOpcional();
  const [explicarId, setExplicarId] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [iniciado, setIniciado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [mostrarLimitePeso, setMostrarLimitePeso] = useState(false);
  // A paleta é da própria etapa, não do contrato que foi arquivado.
  const contextoVisualEtapa = estadoProprioEtapa ?? (paiEmRevisao ? 'revisao' : paiConcluido ? 'concluido' : 'normal');
  const classeAbaAtiva = contextoVisualEtapa === 'pendente' ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-200' : contextoVisualEtapa === 'parcial' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-200' : contextoVisualEtapa === 'nao-iniciado' ? 'bg-slate-500/25 text-foreground' : contextoVisualEtapa === 'arquivado' ? 'bg-amber-500/20 text-amber-200' : contextoVisualEtapa === 'revisao' ? 'bg-teal-700/25 text-teal-200' : contextoVisualEtapa === 'concluido' ? 'bg-violet-500/20 text-violet-200' : contextoVisualEtapa === 'finalizado' ? 'bg-purple-500/20 text-purple-200' : contextoVisualEtapa === 'encerrado' ? 'bg-slate-600/25 text-slate-200' : 'bg-brand-green text-on-brand-green';
  const [abaEntregaveis, setAbaEntregaveis] = useState<'ativos' | 'revisao' | 'pendentes' | 'comprovados' | 'arquivados'>('ativos');
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
    let mutacaoConfirmada = false;
    try {
      await alterarArquivoEntregavel(contratoId, id, acao, acao === 'reativar' ? motivoEntregavel.trim() : undefined);
      mutacaoConfirmada = true;
      // A resposta de sucesso já é autoritativa: retirar da lista imediatamente,
      // antes da leitura secundária do detalhe, que pode falhar ou demorar.
      if (acao === 'arquivar') setOcultadosLocais(atuais => [...new Set([...atuais, id])]);
      else {
        setArquivados(atuais => atuais.filter(item => item.id !== id));
        setOcultadosLocais(atuais => atuais.filter(item => item !== id));
      }
      // A mutação foi confirmada pela API: encerrar a confirmação e o detalhe
      // antes da invalidação do cache, que pode notificar componentes e falhar.
      // Um erro secundário não deve deixar o modal de um item arquivado aberto.
      setConfirmarArquivamento(null); setConfirmarReativacao(null); setMotivoEntregavel('');
      if (detalheId === id) fecharDetalhe(false,true);
      // Recarregar a versão definitiva antes de reexibir a ficha. Isso evita
      // renderizar o snapshot arquivado do cache no primeiro quadro do modal.
      if (acao === 'reativar') {
        try {
          const atual = await detalharEntregavel(contratoId, id);
          cacheDetalhe?.gravar(chaveTexto(CHAVES_ENTREGAVEIS.detalhe(contratoId, id)), atual);
        } catch {
          cacheDetalhe?.invalidar(CHAVES_ENTREGAVEIS.detalhe(contratoId, id));
        }
      } else {
        cacheDetalhe?.invalidar(CHAVES_ENTREGAVEIS.detalhe(contratoId, id));
      }
      // A visão local foi atualizada logo após a confirmação remota.
      (acao === 'arquivar' ? toastAviso : toastSucesso)(acao === 'arquivar' ? 'Entregável arquivado.' : 'Entregável reativado.');
      // Falha de atualização não transforma mutação confirmada em erro.
      atualizarDocumental?.();
      if (mostrarArquivados) {
        const lista = await listarEntregaveisArquivados(contratoId, etapaId).catch(() => null);
        if (lista) setArquivados(acao === 'reativar' ? lista.filter(item => item.id !== id) : lista);
      }
    } catch (e) { setAviso(e instanceof Error ? e.message : 'Não foi possível alterar o arquivamento.'); }
    finally {
      // Uma exceção local depois da confirmação remota (cache, modal, toast)
      // não pode impedir a reconciliação da listagem com o servidor.
      if (mutacaoConfirmada) await Promise.resolve().then(() => atualizar()).catch(() => {});
      setOcupadoArquivo(false);
    }
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
      toastSucesso('Conclusão registrada. A etapa exige decisão própria.');
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
      if (detalheId === id) fecharDetalhe(false,true);
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
  const [detalheId, setDetalheId] = useState<string | null>(somenteDetalheId ?? (destinoInterno?.id || null));
  const [pesquisa, setPesquisa] = useState('');
  const [filtroTipo,setFiltroTipo]=useState('');
  const [tipoPendente,setTipoPendente]=useState('');
  const {ordem:ordemTabela,alternar:alternarOrdem}=useOrdemTabela();
  useEffect(() => {
    if (!destinoInterno) return;
    const quadro = requestAnimationFrame(() => { setDetalheId(destinoInterno.id||null); setEditarAoAbrir(false); });
    return () => cancelAnimationFrame(quadro);
  }, [interno, destinoInterno]);
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
    if (interno || dentroModal) {
      if (detalheId === id) { window.dispatchEvent(new Event('pi:recolher-lista-entregaveis')); return; }
      const gatilho = evento.currentTarget;
      const selecionar = () => {
      window.dispatchEvent(new Event('pi:recolher-lista-entregaveis'));
      setGatilhoDetalhe(gatilho); setEditarAoAbrir(editar); setDetalheId(id); if(interno)onSelecaoInterna?.(id); onDetalheMudou?.(true); };
      if (dentroModal && !interno || solicitarNavegacaoInterna(selecionar)) selecionar(); return;
    }
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
  function fecharDetalhe(pularEdicao = false, forcar = false) {
    if (!detalheId) return;
    if (interno || dentroModal) {
      if (interno && !forcar && !solicitarNavegacaoInterna(() => fecharDetalhe(pularEdicao, true))) return;
      setDetalheId(null); setEditarAoAbrir(false); if(interno)onSelecaoInterna?.(null); onDetalheMudou?.(false); return;
    }
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
  const somaPesosContrato = (dados ?? []).filter(item => item.contratoId === contratoId && !item.arquivadoEm)
    .reduce((total, item) => total + Number(item.peso ?? 0), 0);
  const pesoDisponivel = Math.max(0, 100 - somaPesosContrato);
  // O backend só aplica o teto da soma operacional ao contrato PONDERADO.
  // Contratos SIMPLES admitem mais entregáveis mesmo com soma histórica >= 100%.
  const limitePesoAtingido = modoCalculo === 'PONDERADO' && somaPesosContrato >= 100 - 0.00001;
  const visiveis = dados?.filter((e) => e.contratoId === contratoId && e.etapaId === etapaId && !e.arquivadoEm && !ocultadosLocais.includes(e.id)) ?? [];
  // Finalizados reúne conclusão integral (CONCLUIDO) e encerramento parcial (FINALIZADO).
  // Não soma percentuais e não promove encerrados a 100%.
  const ordenados = [...visiveis].sort((a, b) =>
    (a.inicioPrevisto ?? '9999-12-31').localeCompare(b.inicioPrevisto ?? '9999-12-31') ||
    (a.codigoPublico ?? 0) - (b.codigoPublico ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const pendente = (e: Entregavel) => Boolean(e.regularizacaoDocumentalSolicitada || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''));
  const finalizados = ordenados.filter(e => resultadoFinalizacao('entregavel', e.statusExecucao) !== null && !e.reabertoEm && !pendente(e));
  const filtradosPorSituacao = abaEntregaveis === 'comprovados' ? finalizados :
    abaEntregaveis === 'pendentes' ? ordenados.filter(e=>pendente(e)&&(!tipoPendente || (e.regularizacaoDocumentalSolicitada ? 'REGULARIZACAO' : e.statusExecucao)===tipoPendente)) :
    abaEntregaveis === 'revisao' ? ordenados.filter(e => Boolean(e.reabertoEm) && !pendente(e)) :
    ordenados.filter(e => !pendente(e) && (Boolean(e.reabertoEm) || resultadoFinalizacao('entregavel', e.statusExecucao) === null));
  const corresponde = (e: Entregavel) => `${e.nome} ${e.codigo ?? ''} ${e.codigoPublico ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').includes(pesquisa.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR'));
  const exibidos = filtradosPorSituacao.filter(e=>corresponde(e)&&(!filtroTipo||e.tipo===filtroTipo));
  const dadosLinha=(e:Entregavel)=>{const p=progressoFisico?.find(v=>v.entregavelId===e.id);return {...metricasEntregavel(documental?.[e.id]),execucao:p?.percentualExecucao,participacao:p?.participacaoOperacional,estado:estadoDoObjeto({objeto:'entregavel',status:e.statusExecucao,arquivado:Boolean(e.arquivadoEm),reaberto:Boolean(e.reabertoEm),pendenteConclusao:Boolean(e.regularizacaoDocumentalSolicitada)})};};
  const valorLinha=(e:Entregavel,campo:string)=>{const m=dadosLinha(e);switch(campo){case 'titulo':return e.nome;case 'tipo':return ROTULOS_TIPO[e.tipo];case 'execucao':return m.execucao;case 'peso':return m.participacao;case 'ocorrencias':return taxa(m.ocorrencias);case 'atividades':return taxa(m.atividades);case 'evidencias':return taxa(m.evidencias);case 'comprovacao':return taxa(m.comprovacao);case 'status':return ordemEstados[m.estado];case 'prazo':return e.terminoPrevisto;}};
  const linhasTabela=ordenarTabela(mostrarArquivados?arquivados.filter(e=>corresponde(e)&&(!filtroTipo||e.tipo===filtroTipo)):exibidos,ordemTabela,valorLinha);
  const protegido = erro && typeof erro === 'object' && 'status' in erro &&
    [401, 403, 404].includes((erro as { status?: number }).status ?? -1);
  const lista = !somenteDetalheId && <>
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <AbasRolaveis className="min-w-0 flex-1"><div data-pi-abas-neutras role="tablist" aria-label="Entregáveis da etapa" className={`inline-flex items-center gap-1 rounded-xl border bg-background/70 p-1 ${contextoVisualEtapa === 'arquivado' ? 'border-amber-500/40' : contextoVisualEtapa === 'revisao' ? 'border-teal-700/45' : contextoVisualEtapa === 'concluido' ? 'border-violet-500/40' : contextoVisualEtapa === 'encerrado' ? 'border-slate-500/40' : 'border-brand-green/25'}`}>
        <button type="button" role="tab" aria-selected={abaEntregaveis === 'ativos'} onClick={() => setAbaEntregaveis('ativos')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-none ${abaEntregaveis === 'ativos' ? classeAbaAtiva : 'text-foreground/70 hover:bg-brand-green/10 hover:text-foreground'}`}>
          <span className="inline-flex items-center gap-1.5"><IconeStatus tipo="ativas"/>Ativos</span>
        </button>
        <button type="button" role="tab" aria-selected={abaEntregaveis === 'revisao'} onClick={() => setAbaEntregaveis('revisao')}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-none ${abaEntregaveis === 'revisao' ? classeAbaAtiva : 'text-foreground/65 hover:bg-teal-700/10'}`}> <span className="inline-flex items-center gap-1.5"><IconeStatus tipo="revisao"/>Em revisão</span></button>
        <button type="button" role="tab" aria-selected={abaEntregaveis === 'pendentes'} onClick={() => setAbaEntregaveis('pendentes')}
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${abaEntregaveis === 'pendentes' ? classeAbaAtiva : 'text-foreground/65 hover:bg-yellow-500/10'}`}><span className="inline-flex items-center gap-1.5"><IconeStatus tipo="pendentes"/>Pendentes de conclusão</span></button>
        <button type="button" role="tab" aria-selected={abaEntregaveis === 'comprovados'}
          aria-label="Entregáveis finalizados" onClick={() => setAbaEntregaveis('comprovados')}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-none ${abaEntregaveis === 'comprovados' ? classeAbaAtiva : 'text-foreground/65 hover:bg-violet-500/10'}`}>
          <span className="inline-flex items-center gap-1.5"><IconeStatus tipo="concluidas"/>Finalizados</span>
        </button>
        {podeVerArquivados && <button type="button" role="tab" aria-selected={mostrarArquivados}
          aria-label="Entregáveis arquivados" title="Entregáveis arquivados" onClick={() => void alternarArquivados()}
          className={`inline-flex h-9 w-10 items-center justify-center rounded-lg transition-colors ${mostrarArquivados ? 'bg-amber-500/20 text-amber-200' : 'text-foreground/65 hover:bg-amber-500/10 hover:text-amber-200'}`}>
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg>
        </button>}
      </div></AbasRolaveis>
      {abaEntregaveis === 'ativos' && podeCriar && !paiBloqueado && !erro && <button type="button" disabled={salvando} aria-expanded={aberto}
        aria-controls={`cadastro-entregavel-${etapaId}`} data-pi-cadastro-neutro data-tec08-acao-criar
        onClick={() => {
          if (!aberto && dados && limitePesoAtingido) { setMostrarLimitePeso(true); return; }
          setIniciado(true); setAberto(anterior => !anterior); setAviso('');
        }}
        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-on-brand-green transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
        {aberto ? 'Cadastrando entregável' : 'Novo entregável'}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
          className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${aberto ? 'rotate-180' : ''}`}>
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>}
    </div>
    <div className="pi-ferramentas-etapa-v24">      {abaEntregaveis === 'pendentes' && <select aria-label="Tipo de solicitação do entregável" className="pi-filtro-sublinhado" value={tipoPendente} onChange={e=>setTipoPendente(e.target.value)}><option value="">Todas as solicitações</option><option value="PENDENTE_CONCLUSAO">Pendente de conclusão</option><option value="PENDENTE_CONCLUSAO_PARCIAL">Pendente de conclusão parcial</option><option value="PENDENTE_ENCERRAMENTO">Pendente de encerramento</option><option value="REGULARIZACAO">Regularização documental</option></select>}
      <select aria-label="Tipo de entregável" value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} className="pi-filtro-sublinhado"><option value="">Todos os tipos</option>{Object.entries(ROTULOS_TIPO).map(([id,rotulo])=><option key={id} value={id}>{rotulo}</option>)}</select>
<div className="pi-busca-operacional w-60 max-w-full min-w-0"><label className="sr-only" htmlFor={`${marcadorModal}-pesquisa`}>Pesquisar entregável</label><input id={`${marcadorModal}-pesquisa`} placeholder="Pesquisar entregável..." type="search" value={pesquisa} onChange={e=>setPesquisa(e.target.value)} className="w-full min-w-0 rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm"/></div></div>
    {mostrarLimitePeso && modoCalculo === 'PONDERADO' && <ConfirmacaoSimples titulo="Limite do peso operacional"
      descricao={`Os entregáveis deste contrato já representam 100% do peso operacional. Disponível: ${pesoDisponivel.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%. Redistribua os pesos antes de cadastrar outro entregável.`}
      confirmar="Entendi" onCancelar={() => setMostrarLimitePeso(false)} onConfirmar={() => setMostrarLimitePeso(false)} />}
    {aviso && <p role="alert" className="mt-2 text-sm text-error-text">{aviso}</p>}
    {abaEntregaveis === 'ativos' && podeCriar && !paiBloqueado && !erro && iniciado && aberto && typeof document !== 'undefined' && createPortal(
      <ModalEtapa titulo="Novo entregável" contexto={contextoCadastro ?? "Cadastro na etapa selecionada"} camada="edicao" larguraFormulario="entregavel" formularioLongo ocupado={salvando}
        estadoContextual="normal" onFechar={() => { if (!salvando) setAberto(false); }}>
        <div id={`cadastro-entregavel-${etapaId}`} data-tec08-criacao="true">
          <FormularioEntregavel contratoId={contratoId} etapaId={etapaId} pesosContrato={dados} modoCalculo={modoCalculo} onSalvar={cadastrar} onCancelar={() => setAberto(false)}
            onSalvandoMudou={setSalvando} />
        </div>
      </ModalEtapa>, document.body)}
    {!mostrarArquivados && carregando && !dados && !erro && <p role="status" className="mt-3 text-sm">Carregando entregáveis...</p>}
    {!mostrarArquivados && Boolean(erro) && <p role="alert" className="mt-3 break-words text-sm text-error-text">
      {erro instanceof Error ? erro.message : 'Falha ao consultar entregáveis.'}
    </p>}
    {!mostrarArquivados && !carregando && !erro && !exibidos.length && <p className="mt-3 text-sm text-foreground/70">{abaEntregaveis === 'comprovados' ? 'Nenhum entregável finalizado.' : 'Nenhum entregável nesta situação.'}</p>}
    {mostrarArquivados&&!linhasTabela.length&&<p className="text-sm text-foreground/65">Nenhum entregável arquivado encontrado.</p>}
    {!protegido&&(!erro||mostrarArquivados)&&linhasTabela.length>0&&(interno&&detalheId?<ul className="pi-lista-alternancia" aria-label="Entregáveis da etapa">{linhasTabela.map(e=>{const m=dadosLinha(e);return <li key={e.id}><button type="button" aria-current={detalheId===e.id?'true':undefined} onClick={ev=>abrirDetalhe(e.id,ev)} className="pi-titulo-tabela"><IconeTabela estado={m.estado}/><span className="min-w-0 flex-1"><strong className="block truncate" title={e.nome}>{e.nome}</strong><span className="pi-subtitulo-tabela block">{ROTULOS_TIPO[e.tipo]}</span></span><strong className="tabular-nums">{m.execucao==null?'—':`${m.execucao.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}</strong></button></li>;})}</ul>:<div className="pi-tabela-scroll"><table className="pi-tabela-operacional pi-tabela-entregaveis" aria-label="Entregáveis planejados da etapa"><colgroup>{Array.from({length:10},(_,i)=><col key={i}/>)}</colgroup><thead><tr>{[['titulo','Título'],['tipo','Tipo'],['execucao','Execução'],['peso','Contrato'],['ocorrencias','Ocorrências'],['atividades','Atividades'],['evidencias','Evidências'],['comprovacao','Comprovação'],['status','Status'],['prazo','Prazo']].map(([campo,titulo])=><CabecalhoColuna key={campo} campo={campo} titulo={titulo} ordem={ordemTabela} alternar={alternarOrdem}/>)}</tr></thead><tbody>{linhasTabela.map(e=>{const m=dadosLinha(e);return <tr key={e.id} data-entregavel-estado={m.estado} data-arquivado={Boolean(e.arquivadoEm)}><td><Link href={`/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(e.id)}`} onClick={ev=>{if(ev.button!==0||ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.altKey)return;ev.preventDefault();abrirDetalhe(e.id,ev);}} aria-label={e.nome} className="pi-titulo-tabela"><IconeTabela estado={m.estado}/><span className="min-w-0"><strong className="block truncate" title={e.nome}>{e.nome}</strong><span className="pi-subtitulo-tabela block">{rotuloCodigoPublico(e.codigoPublico)}</span></span></Link></td><td>{ROTULOS_TIPO[e.tipo]}</td><td><button type="button" className="pi-acao-tabela" aria-label={`Consultar situação de execução de ${e.nome}`} onClick={()=>setExplicarId(e.id)}><BarraTabela valor={m.execucao}/></button></td><td><strong className="whitespace-nowrap tabular-nums">{m.participacao==null?'—':`${m.participacao.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`}</strong></td><td><AnelTabela nome="Ocorrências" fracao={m.ocorrencias}/></td><td><AnelTabela nome="Atividades" fracao={m.atividades} cor="text-emerald-600 dark:text-emerald-400"/></td><td><AnelTabela nome="Evidências" fracao={m.evidencias} cor="text-teal-600 dark:text-teal-400"/></td><td><ComprovacaoTabela fracao={m.comprovacao}/></td><td><StatusTabela estado={m.estado} rotulo={rotuloEstadoEntregavel(e.statusExecucao,Boolean(e.arquivadoEm),Boolean(e.reabertoEm),Boolean(e.regularizacaoDocumentalSolicitada))}/><EtiquetaAtraso atrasado={e.atrasado} finalizadoComAtraso={e.finalizadoComAtraso}/></td><td className="whitespace-nowrap">{e.terminoPrevisto?.split('-').reverse().join('/')??'—'}</td></tr>;})}</tbody></table></div>)}
    </>;
  const detalhe = detalheId && !protegido && (!erro || mostrarArquivados) && <ModalDetalheEntregavel key={`${detalheId}:${destinoInterno?.id===detalheId?destinoInterno?.origemRegistro??'':''}`} origemRegistro={destinoInterno?.id===detalheId?destinoInterno?.origemRegistro:undefined} interno={interno} contratoId={contratoId} etapaId={etapaId} pesosContrato={dados} modoCalculoContrato={modoCalculo}
    entregavelId={detalheId} itemInicial={[...(dados ?? []), ...arquivados].find(item => item.id === detalheId)}
    retornoContextual={Boolean(somenteDetalheId || dentroModal)} dentroModal={dentroModal} resumoInicial={documental?.[detalheId]} paiConcluido={paiConcluido} paiParcial={paiParcial} paiEmRevisao={paiEmRevisao} verificado={Boolean([...(dados ?? []), ...arquivados].find(e => e.id === detalheId)?.statusExecucao === 'CONCLUIDO' && ![...(dados ?? []), ...arquivados].find(e => e.id === detalheId)?.reabertoEm)} iniciarEditando={editarAoAbrir && !paiBloqueado} paiArquivado={paiArquivado} podeEditar={Boolean(permissoes?.editarEntregaveis) && (podeEditar ?? podeCriar)} permissoes={permissoes}
    podeArquivar={Boolean(podeArquivar) && !paiBloqueado} onArquivar={() => setConfirmarArquivamento(detalheId)}
    onReabrir={() => setConfirmarReabertura(detalheId)} onReativar={() => setConfirmarReativacao(detalheId)}
    onExcluir={() => setConfirmarExclusao(detalheId)}
    focoRetorno={gatilhoDetalhe} onFechar={() => fecharDetalhe()} atualizar={async () => {
      atualizarDocumental?.();
      await atualizar();
      onHierarquiaAlterada?.();
      if (mostrarArquivados) setArquivados(await listarEntregaveisArquivados(contratoId, etapaId));
    }} />;
  return <section data-pi-listagem-etapa data-tec08-contexto-operacional data-tec08-estado={contextoVisualEtapa} aria-label="Entregáveis da etapa" className={interno ? "min-w-0" : somenteDetalheId ? "contents" : `mt-4 min-h-[min(42dvh,400px)] min-w-0 rounded-xl border p-3 sm:p-4 ${contextoVisualEtapa === 'arquivado' ? 'border-amber-500/45 bg-amber-500/[0.04]' : contextoVisualEtapa === 'revisao' ? 'border-teal-700/40 bg-teal-900/[0.05]' : contextoVisualEtapa === 'concluido' ? 'border-violet-500/40 bg-violet-500/[0.04]' : contextoVisualEtapa === 'encerrado' ? 'border-slate-500/40 bg-slate-500/[0.04]' : 'border-brand-green/20 bg-brand-darkgreen/10'}`}>
    {interno ? <NavegadorEntregaveis nomeEtapa={nomeEtapa} selecionado={detalheId} painelDireitoAberto={painelDireitoAberto} lista={lista}>{detalhe}</NavegadorEntregaveis> : <>{lista}{detalhe}</>}
    {explicarId && !protegido && <ExplicacaoConclusaoEntregavel contratoId={contratoId} entregavelId={explicarId} percentual={progressoFisico?.find(p=>p.entregavelId===explicarId)?.percentualExecucao} onFechar={()=>setExplicarId(null)}/>}
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
