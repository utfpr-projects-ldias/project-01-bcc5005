'use client';
import { formatarPercentualSemAnteciparConclusao } from '@/lib/apresentacao-indicadores';
import { NavegadorEntregaveis } from './navegador-entregaveis';
import { solicitarNavegacaoInterna } from './navegacao-interna';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';

import { chaveTexto } from '@/lib/repositorio-consultas';
import { abaDoEntregavel, filtrosEntregaveis, situacaoFiltroEntregavel } from '@/lib/filtros-entregaveis';
import { estadoDoObjeto, rotuloEstadoEntregavel } from '@/lib/identidade-operacional';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';
import { createPortal } from 'react-dom';
import { ModalEtapa } from './modal-etapa';
import { sincronizarContrato } from '@/lib/sincronizar-contrato';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { CHAVES_ENTREGAVEIS } from '@/hooks/use-entregaveis';
import { IconeStatus } from '@/app/components/icones-status';
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { ModalDetalheEntregavel } from './modal-detalhe-entregavel';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import type { ResumoDocumentalEntregavel } from '@/lib/entregaveis';
import { ajustarRestauracaoHistorico } from '@/lib/historico-modal-scroll';
import { IconeTipoEntregavel } from './icone-tipo-entregavel';
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
export function EntregaveisDaEtapa({ estadoProprioEtapa, contratoId, etapaId, vigencia, modoCalculo = 'PONDERADO', dados, carregando, erro, atualizar, podeCriar = false, podeEditar, podeArquivar, permissoes, documental, progressoFisico, dentroModal = false, podeVerArquivados = true, paiArquivado = false, paiEmRevisao = false, paiConcluido = false, paiParcial = false, onDetalheMudou, atualizarDocumental, onHierarquiaAlterada, somenteDetalheId, interno = false, destinoInterno, painelDireitoAberto = false, contextoCadastro, nomeEtapa, onSelecaoInterna }: {
  vigencia?: import('@/lib/vigencia-planejamento').VigenciaPlanejamento; nomeEtapa?: string; contextoCadastro?: string; onSelecaoInterna?: (id:string|null)=>void; interno?: boolean; destinoInterno?: { id: string; origemRegistro?: import('./execucoes-entregavel').OrigemExecucao }; painelDireitoAberto?: boolean;
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
    if (ocupadoArquivo) return;
    if (paiBloqueado || (acao === 'reativar' && !permissoes?.reativarEntregaveis) || (acao === 'arquivar' && !podeArquivar)) {setAviso('A situação da etapa ou as permissões não permitem alterar o arquivamento.');return;}
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
  const [filtrosSituacao,setFiltrosSituacao]=useState<Partial<Record<typeof abaEntregaveis,string>>>({});
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
      if (dentroModal && !interno || solicitarNavegacaoInterna(selecionar, true)) selecionar(); return;
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
      if (interno && !forcar && !solicitarNavegacaoInterna(() => fecharDetalhe(pularEdicao, true), true)) return;
      setDetalheId(null); setEditarAoAbrir(false); if(interno)onSelecaoInterna?.(null); onDetalheMudou?.(false);
      if (interno && historico.current && window.history.state?.__modalEntregavel === historico.current) {
        historico.current = null;
        window.history.back();
      }
      if (gatilhoDetalhe?.isConnected) requestAnimationFrame(() => gatilhoDetalhe.focus({preventScroll:true}));
      return;
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
  // Dentro da etapa ancorada, reservar um nível também no histórico do iframe.
  // Assim o Voltar nativo não salta diretamente para o contrato ou para a carteira.
  useEffect(() => {
    if (!interno || !detalheId || historico.current || !window.history.state?.__modalEtapa) return;
    const marcador = `${marcadorModal}:${detalheId}`;
    window.history.pushState({ ...window.history.state, __modalEntregavel: marcador }, '', window.location.href);
    historico.current = marcador;
  }, [interno, detalheId, marcadorModal]);
  useEffect(() => {
    const voltar = () => {
      const marcador = historico.current;
      if (!marcador || window.history.state?.__modalEntregavel === marcador) return;
      if (interno) {
        // Restaurar o nível quando há formulário pendente; o descarte confirmado
        // fecha normalmente e remove a entrada. Sem rascunho, fechar uma vez.
        const fechar = () => {
          historico.current = null;
          setDetalheId(null); setEditarAoAbrir(false); onSelecaoInterna?.(null); onDetalheMudou?.(false);
        };
        const continuar = () => { fechar(); if (window.history.state?.__modalEntregavel === marcador) window.history.back(); };
        if (!solicitarNavegacaoInterna(continuar, true)) {
          window.history.pushState({ ...window.history.state, __modalEntregavel: marcador }, '', window.location.href);
          return;
        }
        fechar(); return;
      }
      historico.current = null;
      setDetalheId(null);
      onDetalheMudou?.(false);
      restaurar();
    };
    window.addEventListener('popstate', voltar);
    return () => window.removeEventListener('popstate', voltar);
  }, [restaurar, onDetalheMudou, interno, onSelecaoInterna]);
  useEffect(() => () => {
    if (posicao.current) ajustarRestauracaoHistorico(posicao.current.restauracao);
  }, []);
  async function cadastrar(dados: DadosPlanejamentoEntregavel) {
    if (paiBloqueado || !podeCriar) throw new Error('O contexto não permite cadastrar entregáveis no estado atual.');
    await criarEntregavel(contratoId, dados);
    if (cacheDetalhe) sincronizarContrato(cacheDetalhe, contratoId);
    setAberto(false); setIniciado(false); toastSucesso('Entregável cadastrado com sucesso.');
    // Se a leitura falhar depois do POST, o sucesso do cadastro não se perde.
    await atualizar().catch(() => {});
    atualizarDocumental?.();
  }
  // Nunca exibir um item cujo contrato/etapa nao corresponda ao contexto visivel.
  const visiveis = dados?.filter((e) => e.contratoId === contratoId && e.etapaId === etapaId && !e.arquivadoEm && !ocultadosLocais.includes(e.id)) ?? [];
  // Finalizados reúne conclusão integral (CONCLUIDO) e encerramento parcial (FINALIZADO).
  // Não soma percentuais e não promove encerrados a 100%.
  const ordenados = [...visiveis].sort((a, b) =>
    (a.inicioPrevisto ?? '9999-12-31').localeCompare(b.inicioPrevisto ?? '9999-12-31') ||
    (a.codigoPublico ?? 0) - (b.codigoPublico ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const filtradosPorSituacao = ordenados.filter(e => abaDoEntregavel(e) === abaEntregaveis);
  const corresponde = (e: Entregavel) => `${e.nome} ${e.codigo ?? ''} ${e.codigoPublico ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').includes(pesquisa.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR'));
  const rotuloSituacao = situacaoFiltroEntregavel;
  const baseDaAba = mostrarArquivados ? arquivados : filtradosPorSituacao;
  const opcoesSituacao = filtrosEntregaveis[abaEntregaveis];
  const filtroSalvo = filtrosSituacao[abaEntregaveis] ?? '';
  const situacaoSelecionada = opcoesSituacao.includes(filtroSalvo) ? filtroSalvo : '';
  const exibidos = baseDaAba.filter(e=>corresponde(e)&&(!filtroTipo||e.tipo===filtroTipo)&&(!situacaoSelecionada||rotuloSituacao(e)===situacaoSelecionada));
  const dadosLinha=(e:Entregavel)=>{const p=progressoFisico?.find(v=>v.entregavelId===e.id);return {...metricasEntregavel(documental?.[e.id]),execucao:p?.percentualExecucao,participacao:p?.participacaoOperacional,estado:estadoDoObjeto({objeto:'entregavel',status:e.statusExecucao,arquivado:Boolean(e.arquivadoEm),reaberto:Boolean(e.reabertoEm),pendenteConclusao:Boolean(e.regularizacaoDocumentalSolicitada)})};};
  const valorLinha=(e:Entregavel,campo:string)=>{const m=dadosLinha(e);switch(campo){case 'titulo':return e.nome;case 'tipo':return ROTULOS_TIPO[e.tipo];case 'execucao':return m.execucao;case 'peso':return m.participacao;case 'ocorrencias':return taxa(m.ocorrencias);case 'atividades':return taxa(m.atividades);case 'evidencias':return taxa(m.evidencias);case 'comprovacao':return taxa(m.comprovacao);case 'status':return ordemEstados[m.estado];case 'prazo':return e.terminoPrevisto;}};
  const linhasTabela=ordenarTabela(exibidos,ordemTabela,valorLinha);
  const protegido = erro && typeof erro === 'object' && 'status' in erro &&
    [401, 403, 404].includes((erro as { status?: number }).status ?? -1);
  const lista = !somenteDetalheId && <>
    <div className="pi-barra-planejamento-topo">
      <AbasRolaveis className="pi-barra-planejamento-abas"><div data-pi-abas-neutras role="tablist" aria-label="Entregáveis da etapa" className={`inline-flex items-center gap-1 rounded-xl border bg-background/70 p-1 ${contextoVisualEtapa === 'arquivado' ? 'border-amber-500/40' : contextoVisualEtapa === 'revisao' ? 'border-teal-700/45' : contextoVisualEtapa === 'concluido' ? 'border-violet-500/40' : contextoVisualEtapa === 'encerrado' ? 'border-slate-500/40' : 'border-brand-green/25'}`}>
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
          setIniciado(true); setAberto(anterior => !anterior); setAviso('');
        }}
        className="pi-barra-planejamento-acoes inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-on-brand-green transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
        {aberto ? 'Cadastrando entregável' : 'Novo entregável'}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
          className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${aberto ? 'rotate-180' : ''}`}>
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>}
    </div>
    <div className="pi-filtros-entregaveis pi-barra-planejamento-filtros">
      <div className="pi-busca-operacional pi-busca-entregavel"><label className="sr-only" htmlFor={`${marcadorModal}-pesquisa`}>Pesquisar entregável</label><input id={`${marcadorModal}-pesquisa`} placeholder="Pesquisar entregável..." type="search" maxLength={100} value={pesquisa} onChange={e=>setPesquisa(e.target.value)}/></div>
      <div className="pi-filtros-entregaveis-direita">
        <select aria-label={abaEntregaveis==='pendentes'?'Tipo de solicitação do entregável':'Situação do entregável'} className="pi-filtro-entregavel" value={situacaoSelecionada} onChange={e=>setFiltrosSituacao(v=>({...v,[abaEntregaveis]:e.target.value}))}><option value="">{abaEntregaveis==='pendentes'?'Todas as solicitações':'Todas as situações'}</option>{opcoesSituacao.map(rotulo=><option key={rotulo} value={rotulo}>{rotulo}</option>)}</select>
        <button type="button" className="pi-limpar-filtros" disabled={!pesquisa&&!filtroTipo&&!situacaoSelecionada} onClick={()=>{setPesquisa('');setFiltroTipo('');setFiltrosSituacao({});}}>Limpar filtros</button>
      </div>
    </div>
    <AbasRolaveis><div role="group" aria-label="Tipo de entregável" className="pi-abas-tipos-entregaveis">
      <button type="button" aria-pressed={!filtroTipo} onClick={()=>setFiltroTipo('')}><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/></svg>Todos</button>
      {(Object.entries(ROTULOS_TIPO) as [Entregavel['tipo'],string][]).map(([tipo,rotulo])=><button key={tipo} type="button" aria-pressed={filtroTipo===tipo} onClick={()=>setFiltroTipo(tipo)}><IconeTipoEntregavel tipo={tipo}/>{rotulo}</button>)}
    </div></AbasRolaveis>
    {aviso && <p role="alert" className="mt-2 text-sm text-error-text">{aviso}</p>}
    {abaEntregaveis === 'ativos' && podeCriar && !paiBloqueado && !erro && iniciado && aberto && typeof document !== 'undefined' && createPortal(
      <ModalEtapa titulo="Novo entregável" contexto={contextoCadastro ?? "Cadastro na etapa selecionada"} camada="edicao" larguraFormulario="entregavel" formularioLongo ocupado={salvando}
        estadoContextual="normal" onFechar={() => { if (!salvando) setAberto(false); }}>
        <div id={`cadastro-entregavel-${etapaId}`} data-tec08-criacao="true">
          <FormularioEntregavel vigencia={vigencia} contratoId={contratoId} etapaId={etapaId} pesosContrato={dados} modoCalculo={modoCalculo} podeConfigurarPesos={Boolean(permissoes?.configurarPesos)} onSalvar={cadastrar} onCancelar={() => setAberto(false)}
            onSalvandoMudou={setSalvando} />
        </div>
      </ModalEtapa>, document.body)}
    {!mostrarArquivados && carregando && !dados && !erro && <p role="status" className="mt-3 text-sm">Carregando entregáveis...</p>}
    {!mostrarArquivados && Boolean(erro) && <p role="alert" className="mt-3 break-words text-sm text-error-text">
      {erro instanceof Error ? erro.message : 'Falha ao consultar entregáveis.'}
    </p>}
    {!mostrarArquivados && !carregando && !erro && !exibidos.length && <p className="mt-3 text-sm text-foreground/70">{abaEntregaveis === 'comprovados' ? 'Nenhum entregável finalizado.' : 'Nenhum entregável nesta situação.'}</p>}
    {mostrarArquivados&&!linhasTabela.length&&<p className="text-sm text-foreground/65">Nenhum entregável arquivado encontrado.</p>}
    {!protegido&&(!erro||mostrarArquivados)&&linhasTabela.length>0&&(interno&&detalheId?<ul className="pi-lista-alternancia" aria-label="Entregáveis da etapa">{linhasTabela.map(e=>{const m=dadosLinha(e);return <li key={e.id} className="pi-alternancia-entregavel"><button type="button" aria-current={detalheId===e.id?'true':undefined} onClick={ev=>abrirDetalhe(e.id,ev)} className="pi-titulo-tabela"><IconeTabela estado={m.estado}/><span className="min-w-0"><strong className="block truncate" title={e.nome}>{e.nome}</strong><span className="pi-subtitulo-tabela block">{ROTULOS_TIPO[e.tipo]}</span></span></button><strong className="tabular-nums shrink-0">{m.execucao==null?'—':formatarPercentualSemAnteciparConclusao(m.execucao,1)}</strong></li>;})}</ul>:<div className="pi-tabela-scroll"><table className="pi-tabela-operacional pi-tabela-entregaveis" aria-label="Entregáveis planejados da etapa"><colgroup>{Array.from({length:10},(_,i)=><col key={i}/>)}</colgroup><thead><tr>{[['titulo','Título'],['tipo','Tipo'],['execucao','Execução'],['peso','Contrato'],['ocorrencias','Ocorrências'],['atividades','Atividades'],['evidencias','Evidências'],['comprovacao','Comprovação'],['status','Status'],['prazo','Prazo']].map(([campo,titulo])=><CabecalhoColuna key={campo} campo={campo} titulo={titulo} ordem={ordemTabela} alternar={alternarOrdem}/>)}</tr></thead><tbody>{linhasTabela.map(e=>{const m=dadosLinha(e);return <tr key={e.id} data-entregavel-estado={m.estado} data-arquivado={Boolean(e.arquivadoEm)}><td><button type="button" onClick={ev=>abrirDetalhe(e.id,ev)} aria-label={e.nome} className="pi-titulo-tabela"><IconeTabela estado={m.estado}/><span className="min-w-0"><strong className="block truncate" title={e.nome}>{e.nome}</strong><span className="pi-subtitulo-tabela block">{rotuloCodigoPublico(e.codigoPublico)}</span></span></button></td><td>{ROTULOS_TIPO[e.tipo]}</td><td><button type="button" className="pi-acao-tabela" aria-label={`Consultar situação de execução de ${e.nome}`} onClick={()=>setExplicarId(e.id)}><BarraTabela valor={m.execucao}/></button></td><td><strong className="whitespace-nowrap tabular-nums">{m.participacao==null?'—':`${m.participacao.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`}</strong></td><td><AnelTabela nome="Ocorrências" fracao={m.ocorrencias}/></td><td><AnelTabela nome="Atividades" fracao={m.atividades} cor="text-emerald-600 dark:text-emerald-400"/></td><td><AnelTabela nome="Evidências" fracao={m.evidencias} cor="text-teal-600 dark:text-teal-400"/></td><td><ComprovacaoTabela fracao={m.comprovacao}/></td><td><StatusTabela estado={m.estado} rotulo={rotuloEstadoEntregavel(e.statusExecucao,Boolean(e.arquivadoEm),Boolean(e.reabertoEm),Boolean(e.regularizacaoDocumentalSolicitada),Boolean(e.motivoFinalizacao),e.tipo==='CONTINUO'&&Boolean(e.finalizadoComAtraso))}/><EtiquetaAtraso atrasado={e.atrasado} finalizadoComAtraso={e.tipo!=='CONTINUO'&&e.finalizadoComAtraso}/></td><td className="whitespace-nowrap">{e.terminoPrevisto?.split('-').reverse().join('/')??'—'}</td></tr>;})}</tbody></table></div>)}
    </>;
  const detalhe = detalheId && !protegido && (!erro || mostrarArquivados) && <ModalDetalheEntregavel vigencia={vigencia} key={`${detalheId}:${destinoInterno?.id===detalheId?destinoInterno?.origemRegistro??'':''}`} origemRegistro={destinoInterno?.id===detalheId?destinoInterno?.origemRegistro:undefined} interno={interno} contratoId={contratoId} etapaId={etapaId} pesosContrato={dados} modoCalculoContrato={modoCalculo}
    entregavelId={detalheId} itemInicial={[...(dados ?? []), ...arquivados].find(item => item.id === detalheId)}
    retornoContextual={Boolean(somenteDetalheId || dentroModal)} dentroModal={dentroModal} resumoInicial={documental?.[detalheId]} paiConcluido={paiConcluido} paiParcial={paiParcial} paiEmRevisao={paiEmRevisao} verificado={Boolean([...(dados ?? []), ...arquivados].find(e => e.id === detalheId)?.statusExecucao === 'CONCLUIDO' && ![...(dados ?? []), ...arquivados].find(e => e.id === detalheId)?.reabertoEm)} iniciarEditando={editarAoAbrir && !paiBloqueado} paiArquivado={paiArquivado} podeEditar={Boolean(permissoes?.editarEntregaveis) && (podeEditar ?? podeCriar)} permissoes={permissoes}
    podeArquivar={Boolean(podeArquivar) && !paiBloqueado} onArquivar={() => {setAviso('');setConfirmarArquivamento(detalheId);}}
    onReabrir={() => {setAviso('');setConfirmarReabertura(detalheId);}} onReativar={() => {setAviso('');setConfirmarReativacao(detalheId);}}
    onExcluir={() => {setAviso('');setConfirmarExclusao(detalheId);}}
    focoRetorno={gatilhoDetalhe} onFechar={() => fecharDetalhe()} atualizar={async () => {
      atualizarDocumental?.();
      await atualizar();
      onHierarquiaAlterada?.();
      if (mostrarArquivados) setArquivados(await listarEntregaveisArquivados(contratoId, etapaId));
    }} />;
  return <section data-pi-operacional-neutro data-pi-listagem-etapa data-tec08-contexto-operacional data-tec08-estado={contextoVisualEtapa} aria-label="Entregáveis da etapa" className={interno ? "min-w-0" : somenteDetalheId ? "contents" : `mt-4 min-h-[min(42dvh,400px)] min-w-0 rounded-xl border p-3 sm:p-4 ${contextoVisualEtapa === 'arquivado' ? 'border-amber-500/45 bg-amber-500/[0.04]' : contextoVisualEtapa === 'revisao' ? 'border-teal-700/40 bg-teal-900/[0.05]' : contextoVisualEtapa === 'concluido' ? 'border-violet-500/40 bg-violet-500/[0.04]' : contextoVisualEtapa === 'encerrado' ? 'border-slate-500/40 bg-slate-500/[0.04]' : 'border-brand-green/20 bg-brand-darkgreen/10'}`}>
    {interno ? <NavegadorEntregaveis nomeEtapa={nomeEtapa} selecionado={detalheId} painelDireitoAberto={painelDireitoAberto} lista={lista}>{detalhe}</NavegadorEntregaveis> : <>{lista}{detalhe}</>}
    {explicarId && !protegido && <ExplicacaoConclusaoEntregavel contratoId={contratoId} entregavelId={explicarId} percentual={progressoFisico?.find(p=>p.entregavelId===explicarId)?.percentualExecucao} onFechar={()=>setExplicarId(null)}/>}
    {confirmarReabertura && <ConfirmacaoSimples pendencias={aviso ? [aviso] : []} titulo="Reabrir entregável concluído?"
      descricao="O entregável ficará Reaberto. Etapa e evidências verificadas permanecerão em seus estados anteriores até reabertura específica. O histórico será preservado."
      confirmar="Reabrir entregável" ocupado={ocupadoArquivo} justificativa={motivoEntregavel} onJustificativaChange={setMotivoEntregavel} onCancelar={() => { setConfirmarReabertura(null); setMotivoEntregavel(''); }}
      onConfirmar={() => void executarReabertura()} />}
    {confirmarArquivamento && <ConfirmacaoSimples pendencias={aviso ? [aviso] : []} titulo="Arquivar entregável?" descricao="O entregável será retirado dos ativos, mantendo arquivos e histórico para reativação."
      confirmar="Confirmar arquivamento" ocupado={ocupadoArquivo} onCancelar={() => setConfirmarArquivamento(null)}
      onConfirmar={() => void alterarArquivo(confirmarArquivamento, 'arquivar')} />}
    {confirmarReativacao && <ConfirmacaoSimples pendencias={aviso ? [aviso] : []} titulo="Reativar entregável?"
      descricao="O entregável voltará à lista ativa da etapa, preservando seu checklist e comprovantes."
      confirmar="Confirmar reativação" ocupado={ocupadoArquivo} justificativa={motivoEntregavel} onJustificativaChange={setMotivoEntregavel} onCancelar={() => { setConfirmarReativacao(null); setMotivoEntregavel(''); }}
      onConfirmar={() => void alterarArquivo(confirmarReativacao, 'reativar')} />}
    {confirmarConclusao && <ConfirmacaoSimples titulo="Concluir entregável?" descricao="A conclusão exige evidências verificadas e será registrada na auditoria."
      confirmar="Concluir entregável" ocupado={ocupadoArquivo} onCancelar={() => setConfirmarConclusao(null)}
      onConfirmar={() => void executarConclusao()} />}
    {confirmarExclusao && <ConfirmacaoSimples pendencias={aviso ? [aviso] : []} titulo="Excluir entregável arquivado?" perigoso
      descricao="Serão removidos definitivamente o entregável e seus dependentes, incluindo comprovantes e arquivos. Esta ação não pode ser desfeita."
      confirmar="Excluir definitivamente" ocupado={ocupadoArquivo} onCancelar={() => setConfirmarExclusao(null)} onConfirmar={() => void excluirArquivado()} />}
  </section>;
}
