'use client';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { intervaloPrevisto } from '@/lib/entregaveis';
import { useEtapas, useMutacoesEtapas } from '@/hooks/use-etapas';
import { alterarBloqueioOrdemEtapas, type PermissoesContrato } from '@/lib/contratos';
import { useProgresso } from '@/hooks/use-progresso';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import { EntregaveisDaEtapa } from './entregaveis-da-etapa';
import { HistoricoEtapa } from './historico-etapa';
import { ErroEtapa, STATUS_ETAPA, concluirEtapa, solicitarConclusaoEtapa, solicitarEncerramentoEtapa, devolverSolicitacaoEtapa, encerrarEtapa, reabrirEtapaEncerrada, reabrirEtapa, alterarArquivamentoEtapa, excluirEtapaArquivada, type DadosEtapa, type Etapa } from '@/lib/etapas';
import { FormularioEtapa } from './formulario-etapa';
import { resultadoFinalizacao } from '@/lib/finalizados';
import { IconeStatus } from '@/app/components/icones-status';
import { rotuloCodigoPublico } from '@/lib/codigos-publicos';
import { etapaPodeSerConcluida } from '@/lib/situacao-documental-etapa';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { ModalEtapa } from './modal-etapa';
import { BotaoEditarModal, BotaoAcaoModal } from '@/app/components/botoes-modal';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { estadoDoObjeto } from '@/lib/identidade-operacional';
import { ajustarRestauracaoHistorico } from '@/lib/historico-modal-scroll';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { lerRetornoContrato, limparRetornoContrato } from '@/lib/retorno-contrato';

function dataBR(valor: string | null): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor.split('-').reverse().join('/') : 'Não informada';
}

export function PainelEtapas({ contratoId, habilitado, podeGerenciar, permissoes, contratoArquivado = false, contratoConcluido = false, contratoEmRevisao = false, ordemEtapasBloqueada = false, contratoSuspenso = false, contratoCancelado = false, contratoEncerrado = false, contratoPendenteConclusao = false, onAuditoriaAlterada, onOrdemAlterada }: {
  contratoId: string; habilitado: boolean; podeGerenciar: boolean; permissoes?: PermissoesContrato;
  contratoArquivado?: boolean; contratoConcluido?: boolean; contratoEmRevisao?: boolean; ordemEtapasBloqueada?: boolean; contratoSuspenso?: boolean; contratoCancelado?: boolean; contratoEncerrado?: boolean; contratoPendenteConclusao?: boolean; onAuditoriaAlterada?: () => void; onOrdemAlterada?: () => Promise<unknown>;
}) {
  const cache = useRepositorioConsultasOpcional();
  const contratoBloqueado = contratoArquivado || contratoConcluido || contratoSuspenso || contratoCancelado || contratoEncerrado || contratoPendenteConclusao;
  // 'Pendente de conclusão' não é status operacional CONCLUIDO.
  const consulta = useEtapas(contratoId, habilitado);
  const mutacoes = useMutacoesEtapas(contratoId);
  const [editor, setEditor] = useState<string | null>(null);
  const [retornoEdicao, setRetornoEdicao] = useState<string | null>(null);
  const subModalHistorico = useRef<string | null>(null);
  const ignorarRetornoProgramatico = useRef(false);
  const [detalheEntregavelAberto, setDetalheEntregavelAberto] = useState(false);
  const [gatilhoModal, setGatilhoModal] = useState<HTMLElement | null>(null);
  const identificadorModal = useId();
  const sequenciaModal = useRef(0);
  const historicoModal = useRef<string | null>(null);
  const posicaoModal = useRef<{ x: number; y: number; restauracao: ScrollRestoration } | null>(null);
  // FLIP: conservar a geometria pré-troca para animar os cartões reais, e não só os botões.
  const cartoesEtapa = useRef(new Map<string, HTMLLIElement>());
  const posicoesAnteriores = useRef(new Map<string, number>());
  const [ordemProvisoria, setOrdemProvisoria] = useState<string[] | null>(null);
  const [reordenando, setReordenando] = useState(false);
  // Estado global, persistido no contrato e validado na transação do backend.
  // Nunca permitir que um controle de sessão ignore uma trava imposta pelo administrador.
  const ordemDestravada = !ordemEtapasBloqueada;
  const [alterandoBloqueio, setAlterandoBloqueio] = useState(false);
  const [salvandoFormulario, setSalvandoFormulario] = useState(false);
  const [confirmarReaberturaEtapa, setConfirmarReaberturaEtapa] = useState<string | null>(null);
  const [confirmarEncerramentoDireto, setConfirmarEncerramentoDireto] = useState<string | null>(null);
  const [motivoEtapa, setMotivoEtapa] = useState('');
  const [aprovarConclusao, setAprovarConclusao] = useState<string | null>(null);
  const [aprovarEncerramento, setAprovarEncerramento] = useState<string | null>(null);
  const [devolverPendente, setDevolverPendente] = useState<{id:string;tipo:'conclusao'|'encerramento'} | null>(null);
  const [confirmarConclusaoEtapa, setConfirmarConclusaoEtapa] = useState<string | null>(null);
  const [confirmarExclusaoEtapa, setConfirmarExclusaoEtapa] = useState<string | null>(null);
  const [ocupadoArquivoEtapa, setOcupadoArquivoEtapa] = useState(false);
  const [confirmarArquivoEtapa, setConfirmarArquivoEtapa] = useState<{ id: string; acao: 'arquivar' | 'reativar' } | null>(null);
  const estadoPainel = contratoArquivado ? 'arquivado' : contratoCancelado ? 'cancelado' : contratoSuspenso ? 'suspenso' : contratoEncerrado ? 'encerrado' : contratoEmRevisao ? 'revisao' : (contratoConcluido || contratoPendenteConclusao) ? 'concluido' : 'normal';
  const classeAbaAtiva = contratoPendenteConclusao ? 'bg-violet-700 text-white' : contratoArquivado ? 'bg-amber-500/20 text-amber-900 dark:text-amber-200' : (contratoSuspenso || contratoCancelado || contratoEncerrado) ? 'bg-slate-700 text-white' : contratoConcluido ? 'bg-violet-500/20 text-violet-800 dark:text-violet-200' : contratoEmRevisao ? 'bg-teal-700/25 text-teal-200' : 'bg-brand-green text-on-brand-green';
  const [abaEtapas, setAbaEtapas] = useState<'todas' | 'revisao' | 'pendentes' | 'concluidas' | 'arquivadas'>('todas');
  const [etapasLocais, setEtapasLocais] = useState<Record<string, Etapa | null>>({});
  const [erroAcao, setErroAcao] = useState('');
  const [bloqueio, setBloqueio] = useState(false);
  const erroConsulta = consulta.erro;
  const erroProtegido = erroConsulta instanceof ErroEtapa && [401, 403, 404].includes(erroConsulta.status);
  const etapas = habilitado && !erroProtegido && !bloqueio ? consulta.dados?.map(e =>
    Object.prototype.hasOwnProperty.call(etapasLocais, e.id) ? etapasLocais[e.id] : e
  ).filter((e): e is Etapa => e !== null) : undefined;
  const ordenadas = ordemProvisoria && etapas ? ordemProvisoria.map((id) => etapas.find((e) => e.id === id)).filter((e): e is Etapa => !!e) : etapas?.slice().sort((a, b) => a.sequencia - b.sequencia);
  const itemEditando = editor && editor !== 'nova' && !editor.startsWith('detalhe:') ? etapas?.find((e) => e.id === editor) : undefined;
  const itemDetalhe = editor?.startsWith('detalhe:') ? etapas?.find(e => e.id === editor.slice('detalhe:'.length)) : undefined;
  const permissao = (acao: keyof PermissoesContrato) => permissoes?.[acao] ?? podeGerenciar;
  const podeCriarEtapa = habilitado && permissao('criarEtapas') && !erroProtegido && !bloqueio;
  const podeEditarEtapa = habilitado && permissao('editarEtapas') && !erroProtegido && !bloqueio;
  const podeReordenarEtapa = habilitado && permissao('reordenarEtapas') && !erroProtegido && !bloqueio;
  const podeBloquearOrdem = habilitado && permissao('bloquearOrdemEtapas') && !erroProtegido && !bloqueio;
  const podeEncerrarEtapa = habilitado && Boolean(permissoes?.encerrarEtapas) && !erroProtegido && !bloqueio;
  const podeReabrirEtapaEncerrada = habilitado && Boolean(permissoes?.reabrirEtapasEncerradas) && !erroProtegido && !bloqueio;
  const podeReabrirEtapa = habilitado && Boolean(permissoes?.reabrirEtapas) && !erroProtegido && !bloqueio;
  const podeArquivarEtapa = habilitado && Boolean(permissoes?.arquivarEtapas) && !erroProtegido && !bloqueio;
  const podeReativarEtapa = habilitado && Boolean(permissoes?.reativarEtapas) && !erroProtegido && !bloqueio;
  const podeExcluirEtapa = habilitado && Boolean(permissoes?.excluirEtapasArquivadas) && !erroProtegido && !bloqueio;
  const podeEscrever = !contratoBloqueado && (podeCriarEtapa || podeEditarEtapa);
  const entregaveisQuery = useEntregaveis(contratoId, habilitado && !erroProtegido && !bloqueio && !!etapas);
  const documentalQuery = useResumoDocumentalContrato(contratoId, habilitado && !erroProtegido && !bloqueio && !!etapas);
  const progressoContrato = useProgresso(habilitado ? contratoId : '');

  // Todas preserva a ordem verdadeira (inclusive etapas concluídas);
  // somente as arquivadas saem da visão principal.
  const naAba = ordenadas?.filter(etapa => {
    if (abaEtapas === 'arquivadas') return Boolean(etapa.arquivadoEm);
    if (etapa.arquivadoEm) return false;
    if (abaEtapas === 'revisao') return Boolean(etapa.reabertoEm);
    if (abaEtapas === 'pendentes') return Boolean(etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm) || (entregaveisQuery.dados ?? []).some(e => e.etapaId === etapa.id && ['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''));
    if (abaEtapas === 'concluidas') return !etapa.reabertoEm && (resultadoFinalizacao('etapa', etapa.status) !== null);
    return (!etapa.conclusaoSolicitadaEm && !etapa.encerramentoSolicitadoEm) && (resultadoFinalizacao('etapa', etapa.status) === null || Boolean(etapa.reabertoEm)); // Ativas exclui as concluídas.
  });

  // Recuperar a leitura da página completa apenas quando a altura REAL do
  // contrato suporta a coordenada salva. O registro só sai de sessionStorage
  // depois de 30 quadros estáveis; rerenders não perdem a tentativa.
  const retornoPronto = Boolean(etapas && entregaveisQuery.dados !== undefined &&
    !entregaveisQuery.carregando && !entregaveisQuery.erro && habilitado);
  useEffect(() => {
    if (!retornoPronto) return;
    const alvo = lerRetornoContrato(contratoId);
    if (!alvo) return;
    let cancelado = false;
    let id = 0;
    let quadros = 0;
    let estaveis = 0;
    const recuperar = () => {
      if (cancelado) return;
      quadros += 1;
      const maximo = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maximo >= alvo.y - 2) {
        if (Math.abs(window.scrollY - alvo.y) > 2 || Math.abs(window.scrollX - alvo.x) > 2) {
          window.scrollTo({ left: alvo.x, top: alvo.y, behavior: 'instant' });
          estaveis = 0;
        } else {
          estaveis += 1;
        }
        if (estaveis >= 30) {
          limparRetornoContrato(contratoId);
          return;
        }
      }
      // Permitir consultas e cartões tardios (até ~20 s). Se não houver altura
      // suficiente, guardar o marcador para uma nova tentativa após reload.
      if (quadros < 1200) id = window.requestAnimationFrame(recuperar);
    };
    id = window.requestAnimationFrame(recuperar);
    return () => { cancelado = true; window.cancelAnimationFrame(id); };
  }, [contratoId, retornoPronto]);

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
    setDetalheEntregavelAberto(false);
    setRetornoEdicao(null);
    const sub = subModalHistorico.current;
    subModalHistorico.current = null;
    if (sub && window.history.state?.__editarEtapa === sub) {
      window.history.go(-2);
    } else if (marcador && window.history.state?.__modalEtapa === marcador) {
      // Remove a entrada temporária. Não navegar para a página anterior ao contrato.
      window.history.back();
    }
    restaurarPosicaoModal();
  }

  function abrirModal(destino: string, gatilho: HTMLElement) {
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
    setDetalheEntregavelAberto(false);
    setEditor(destino);
    setErroAcao('');
  }

  function voltarParaDetalhe(aposSalvar = false) {
    if (!retornoEdicao || (salvandoFormulario && !aposSalvar)) return;
    const marcador = subModalHistorico.current;
    subModalHistorico.current = null;
    setEditor(`detalhe:${retornoEdicao}`);
    setRetornoEdicao(null);
    if (marcador && window.history.state?.__editarEtapa === marcador) {
      ignorarRetornoProgramatico.current = true;
      window.history.back();
    }
  }

  function fecharNivelModal() {
    if (retornoEdicao) voltarParaDetalhe();
    else fecharModal();
  }

  useEffect(() => {
    function voltarNoHistorico() {
      // Um voltar programático do editor para o detalhe não fecha o modal-pai.
      if (ignorarRetornoProgramatico.current) { ignorarRetornoProgramatico.current = false; return; }
      const sub = subModalHistorico.current;
      if (sub && window.history.state?.__editarEtapa !== sub) {
        subModalHistorico.current = null;
        if (retornoEdicao) { setEditor(`detalhe:${retornoEdicao}`); setRetornoEdicao(null); }
        return;
      }
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
  }, [salvandoFormulario, restaurarPosicaoModal, retornoEdicao]);

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
    setErroAcao('');
    try { await consulta.atualizar(); cache?.invalidar(['contratos', 'pendentes']); cache?.invalidar(['execucao', contratoId]); setBloqueio(false); }
    catch (erro) {
      if (erro instanceof ErroEtapa && [401, 403, 404].includes(erro.status)) { setBloqueio(true); fecharModal(); }
      setErroAcao(erro instanceof ErroEtapa ? erro.message : 'Não foi possível atualizar as etapas.');
    }
  }

  async function salvar(dados: DadosEtapa) {
    try {
      if (editor === 'nova') await mutacoes.criar(dados);
      else if (editor) {
        const original = etapas?.find(e => e.id === editor);
        if (!original) throw new Error('Etapa não encontrada para atualização.');
        const campos = ['nome','codigo','descricao','inicioPrevisto','terminoPrevisto','status','observacoes'] as const;
        const alteracoes: Partial<DadosEtapa> = {};
        for (const campo of campos) if ((original[campo] ?? null) !== (dados[campo] ?? null)) {
          (alteracoes as Record<string, unknown>)[campo] = dados[campo];
        }
        if (Object.keys(alteracoes).length) await mutacoes.editar(editor, alteracoes);
      }
      else return;
      if (retornoEdicao) voltarParaDetalhe(true);
      else fecharModal();
      setErroAcao(''); onAuditoriaAlterada?.(); toastSucesso('Etapa salva com sucesso.');
    } catch (erro) {
      if (erro instanceof ErroEtapa && [401, 403, 404].includes(erro.status)) { setBloqueio(true); fecharModal(); }
      throw erro;
    }
  }

  async function mover(indice: number, deslocamento: -1 | 1) {
    // Somente a aba principal permite reordenar; itens arquivados conservam sua posição.
    const indicesAtivos = etapas?.flatMap((etapa, indiceReal) => etapa.arquivadoEm ? [] : [indiceReal]) ?? [];
    if (!etapas || abaEtapas !== 'todas' || !podeReordenarEtapa || !ordemDestravada || reordenando || salvandoFormulario || indice + deslocamento < 0 || indice + deslocamento >= indicesAtivos.length) return;
    const idsOrdemAtual = etapas.map((etapa) => etapa.id);
    const idsOrdemNova = [...idsOrdemAtual];
    const origem = indicesAtivos[indice], destino = indicesAtivos[indice + deslocamento];
    [idsOrdemNova[origem], idsOrdemNova[destino]] = [idsOrdemNova[destino], idsOrdemNova[origem]];
    capturarPosicoes();
    // Força o commit da troca antes da chamada de rede, inclusive em respostas rápidas.
    // O useLayoutEffect aplica FLIP antes da pintura, evitando o salto seco.
    flushSync(() => { setOrdemProvisoria(idsOrdemNova); setReordenando(true); });
    setErroAcao('');
    try {
      await mutacoes.reordenar(idsOrdemAtual, idsOrdemNova);
      onAuditoriaAlterada?.();
      toastSucesso('Ordem das etapas salva.');
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

  async function alternarBloqueioOrdem() {
    if (!podeBloquearOrdem || contratoBloqueado || alterandoBloqueio || reordenando || salvandoFormulario) return;
    setAlterandoBloqueio(true); setErroAcao('');
    try {
      await alterarBloqueioOrdemEtapas(contratoId, !ordemEtapasBloqueada);
      await onOrdemAlterada?.();
      toastSucesso(ordemEtapasBloqueada ? 'Reordenação das etapas liberada.' : 'Reordenação das etapas bloqueada.');
    } catch (erro) {
      setErroAcao(erro instanceof Error ? erro.message : 'Não foi possível alterar a trava do contrato.');
    } finally { setAlterandoBloqueio(false); }
  }

  async function executarReaberturaEtapa(idDireto?: string) {
    if (contratoBloqueado) return;
    const id = idDireto ?? confirmarReaberturaEtapa;
    const etapaParaReabrir = etapas?.find(item => item.id === id);
    const encerramentoAdministrativo = etapaParaReabrir?.status === 'ENCERRADA' || etapaParaReabrir?.status === 'FINALIZADA';
    const podeReabrirEsteEstado = encerramentoAdministrativo ? podeReabrirEtapaEncerrada : podeReabrirEtapa;
    if (!id || ocupadoArquivoEtapa || !podeReabrirEsteEstado || detalheEntregavelAberto) return;
    setOcupadoArquivoEtapa(true); setErroAcao('');
    try {
      const alterada = encerramentoAdministrativo
        ? await reabrirEtapaEncerrada(contratoId, id, motivoEtapa.trim())
        : await reabrirEtapa(contratoId, id, motivoEtapa.trim());
      setEtapasLocais(atuais => ({ ...atuais, [id]: alterada }));
      setConfirmarReaberturaEtapa(null); setMotivoEtapa('');
      onAuditoriaAlterada?.();
      toastSucesso('Etapa reaberta para edição.');
      await consulta.atualizar(); cache?.invalidar(['contratos', 'pendentes']); cache?.invalidar(['execucao', contratoId]); setEtapasLocais({});
    } catch (e) { setErroAcao(e instanceof Error ? e.message : 'Não foi possível reabrir a etapa.'); }
    finally { setOcupadoArquivoEtapa(false); }
  }

  async function alterarArquivoEtapa(id: string, acao: 'arquivar' | 'reativar') {
    if (!(acao === 'arquivar' ? podeArquivarEtapa : podeReativarEtapa) || ocupadoArquivoEtapa || detalheEntregavelAberto) return;
    setOcupadoArquivoEtapa(true); setErroAcao('');
    try {
      const alterada = await alterarArquivamentoEtapa(contratoId, id, acao, acao === 'reativar' ? motivoEtapa.trim() : undefined);
      // Keep all displayed positions coherent while revalidating the server data.
      // The server performs the same reordering atomically under a contract lock.
      const listaBase = (etapas ?? []).map(registro => registro.id === id ? alterada : registro);
      const ativas = listaBase.filter(registro => !registro.arquivadoEm && registro.id !== id);
      const arquivadas = listaBase.filter(registro => Boolean(registro.arquivadoEm) && registro.id !== id);
      if (acao === 'arquivar') arquivadas.push(alterada);
      else ativas.push(alterada);
      const novaOrdem = [...ativas, ...arquivadas];
      setEtapasLocais(atuais => ({ ...atuais, ...Object.fromEntries(novaOrdem.map((registro, indice) =>
        [registro.id, { ...registro, sequencia: indice + 1 }])) }));
      setConfirmarArquivoEtapa(null); setMotivoEtapa('');
      onAuditoriaAlterada?.();
      (acao === 'arquivar' ? toastAviso : toastSucesso)(acao === 'arquivar' ? 'Etapa arquivada.' : 'Etapa reativada.');
      const resultados = await Promise.allSettled([consulta.atualizar(), entregaveisQuery.atualizar(), documentalQuery.atualizar()]);
      // Preserve locally confirmed order if the read failed after a successful PATCH.
      if (resultados[0].status === 'fulfilled') setEtapasLocais({});
    } catch (e) { setErroAcao(e instanceof Error ? e.message : 'Não foi possível alterar a etapa.'); }
    finally { setOcupadoArquivoEtapa(false); }
  }
  async function excluirEtapa(id: string) {
    if (!podeExcluirEtapa || ocupadoArquivoEtapa || detalheEntregavelAberto) return;
    setOcupadoArquivoEtapa(true); setErroAcao('');
    try {
      await excluirEtapaArquivada(contratoId, id);
      setEtapasLocais(atuais => ({ ...atuais, [id]: null }));
      setConfirmarExclusaoEtapa(null);
      onAuditoriaAlterada?.();
      if (editor === `detalhe:${id}`) fecharModal();
      toastSucesso('Etapa excluída com sucesso.');
      const [atualizacaoEtapas] = await Promise.allSettled([
        consulta.atualizar(), entregaveisQuery.atualizar(), documentalQuery.atualizar(),
      ]);
      // Se a consulta falhar, manter a exclusão local até uma recarga bem-sucedida.
      if (atualizacaoEtapas.status === 'fulfilled') {
        setEtapasLocais(atuais => { const novos = { ...atuais }; delete novos[id]; return novos; });
      }
    } catch (e) { setErroAcao(e instanceof Error ? e.message : 'Falha ao excluir etapa.'); setConfirmarExclusaoEtapa(null); }
    finally { setOcupadoArquivoEtapa(false); }
  }

  async function executarEncerramentoDireto() {
    const id = confirmarEncerramentoDireto;
    if (!id || !podeEditarEtapa || ocupadoArquivoEtapa || contratoBloqueado) return;
    setOcupadoArquivoEtapa(true); setErroAcao('');
    try {
      await solicitarEncerramentoEtapa(contratoId, id, motivoEtapa.trim());
      setConfirmarEncerramentoDireto(null); setMotivoEtapa('');
      onAuditoriaAlterada?.(); toastSucesso('Solicitação de encerramento enviada para aprovação.');
      await Promise.allSettled([consulta.atualizar(), entregaveisQuery.atualizar(), documentalQuery.atualizar()]);
      cache?.invalidar(['contratos', 'pendentes']); cache?.invalidar(['execucao', contratoId]);
    } catch (erro) { setErroAcao(erro instanceof Error ? erro.message : 'Não foi possível encerrar a etapa.'); }
    finally { setOcupadoArquivoEtapa(false); }
  }

  async function decidirEtapa(tipo:'conclusao'|'encerramento',id:string,decisao:'aprovar'|'devolver') {
    const etapa=etapas?.find(e=>e.id===id);
    if(!etapa||ocupadoArquivoEtapa||contratoBloqueado)return;
    if(decisao==='aprovar' && !(tipo==='conclusao'?permissao('concluirEtapas'):permissao('encerrarEtapas')))return;
    setOcupadoArquivoEtapa(true);setErroAcao('');
    try{
      if(decisao==='devolver')await devolverSolicitacaoEtapa(contratoId,id,tipo,motivoEtapa.trim());
      else if(tipo==='conclusao')await concluirEtapa(contratoId,id);
      else await encerrarEtapa(contratoId,id,etapa.encerramentoMotivo??'');
      setAprovarConclusao(null);setAprovarEncerramento(null);setDevolverPendente(null);setMotivoEtapa('');
      toastSucesso(decisao==='devolver'?'Solicitação devolvida para revisão.':tipo==='conclusao'?'Etapa concluída após aprovação.':'Etapa encerrada após aprovação.');
      onAuditoriaAlterada?.();
      await Promise.allSettled([consulta.atualizar(),entregaveisQuery.atualizar(),documentalQuery.atualizar()]);
      cache?.invalidar(['contratos','pendentes']);cache?.invalidar(['execucao',contratoId]);
    }catch(erro){setErroAcao(erro instanceof Error?erro.message:'Não foi possível decidir a solicitação.');}
    finally{setOcupadoArquivoEtapa(false);}
  }

  async function executarConclusaoEtapa() {
    const id = confirmarConclusaoEtapa;
    if (!id || ocupadoArquivoEtapa || contratoBloqueado || !permissao('editarEtapas')) return;
    const etapa = etapas?.find(registro => registro.id === id);
    if (!etapa || !etapaPodeSerConcluida(etapa, entregaveisQuery.dados, documentalQuery.dados)) {
      setConfirmarConclusaoEtapa(null);
      setErroAcao('Ainda existem entregáveis ou evidências em revisão. Conclua os filhos primeiro.');
      return;
    }
    setOcupadoArquivoEtapa(true); setErroAcao('');
    try {
      await solicitarConclusaoEtapa(contratoId, id);
      setConfirmarConclusaoEtapa(null);
      onAuditoriaAlterada?.();
      toastSucesso('Solicitação de conclusão enviada para aprovação.');
      await Promise.allSettled([consulta.atualizar(), entregaveisQuery.atualizar(), documentalQuery.atualizar()]);
      cache?.invalidar(['contratos', 'pendentes']); cache?.invalidar(['execucao', contratoId]);
    } catch (e) { setErroAcao(e instanceof Error ? e.message : 'Falha ao concluir etapa.'); }
    finally { setOcupadoArquivoEtapa(false); }
  }

  return <section data-pi-painel-contextual data-tec08-estado={estadoPainel} aria-labelledby="titulo-etapas" className={`min-w-0 space-y-4 rounded-2xl border bg-brand-darkgreen/10 p-4 md:p-6 ${contratoPendenteConclusao ? 'border-violet-500/35' : contratoArquivado ? 'border-amber-500/35' : 'border-brand-green/25'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-2">
        <h3 id="titulo-etapas" className="sr-only">Planejamento das etapas do contrato</h3>
    <AbasRolaveis><div data-pi-etapas-filtros role="tablist" aria-label="Visualizações das etapas" className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-xl border border-brand-green/25 bg-background/70 p-1">
      <button role="tab" aria-selected={abaEtapas === 'todas'} type="button" onClick={() => setAbaEtapas('todas')}
        className={`rounded-lg px-3 py-2 text-sm font-semibold transition-none ${abaEtapas === 'todas' ? classeAbaAtiva : 'text-foreground/65 hover:bg-brand-green/10'}`}><span className="inline-flex items-center gap-1.5"><IconeStatus tipo="ativas"/>Ativas</span></button>
      <button role="tab" type="button" aria-selected={abaEtapas === 'revisao'} onClick={() => setAbaEtapas('revisao')}
        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-none ${abaEtapas === 'revisao' ? classeAbaAtiva : 'text-foreground/65 hover:bg-teal-700/10'}`}><span className="inline-flex items-center gap-1.5"><IconeStatus tipo="revisao"/>Em revisão</span></button>
      <button role="tab" aria-selected={abaEtapas === 'pendentes'} type="button" onClick={() => setAbaEtapas('pendentes')} className={`rounded-lg px-3 py-2 text-xs font-semibold ${abaEtapas === 'pendentes' ? classeAbaAtiva : 'text-foreground/65 hover:bg-purple-500/10'}`}><span className="inline-flex items-center gap-1.5"><IconeStatus tipo="pendentes"/>Pendentes de conclusão</span></button>
      <button role="tab" aria-selected={abaEtapas === 'concluidas'} type="button" onClick={() => setAbaEtapas('concluidas')}
        className={`rounded-lg px-3 py-2 text-sm font-semibold transition-none ${abaEtapas === 'concluidas' ? classeAbaAtiva : 'text-foreground/65 hover:bg-violet-500/10'}`}><span className="inline-flex items-center gap-1.5"><IconeStatus tipo="concluidas"/>Finalizadas</span></button>
      <button role="tab" aria-selected={abaEtapas === 'arquivadas'} aria-label="Etapas arquivadas" title="Etapas arquivadas" type="button" onClick={() => setAbaEtapas('arquivadas')}
        className={`inline-flex h-9 w-10 items-center justify-center rounded-lg transition-none ${abaEtapas === 'arquivadas' ? 'bg-amber-500/20 text-amber-900 dark:text-amber-200' : 'text-foreground/65 hover:bg-amber-500/10'}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg>
      </button>
    </div></AbasRolaveis>
        <p className="text-sm text-foreground/65">Planejamento das etapas em sequência, vinculado a este contrato.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {abaEtapas === 'todas' && !contratoBloqueado && podeBloquearOrdem && <button type="button" onClick={() => void alternarBloqueioOrdem()}
          disabled={contratoBloqueado || alterandoBloqueio || reordenando || salvandoFormulario}
          aria-label={ordemEtapasBloqueada ? 'Desbloquear ordem das etapas' : 'Bloquear ordem das etapas'}
          aria-pressed={ordemEtapasBloqueada}
          title={ordemEtapasBloqueada ? 'Ordem bloqueada para todos neste contrato — liberar' : 'Bloquear reordenação para todos neste contrato'}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300 disabled:opacity-50 ${ordemEtapasBloqueada
            ? 'border border-amber-500/65 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
            : 'border border-slate-500/25 bg-slate-500/5 text-slate-400 hover:border-slate-400/45 hover:bg-slate-500/10 hover:text-slate-200'}`}>
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10" width="14" height="11" rx="2"/>
            {ordemEtapasBloqueada ? <path d="M8 10V7a4 4 0 1 1 8 0v3"/> : <path d="M8 10V7a4 4 0 0 1 8 0"/>}
          </svg>
        </button>}
        {abaEtapas === 'todas' && !contratoBloqueado && podeCriarEtapa && <button type="button" onClick={(evento) => abrirModal('nova', evento.currentTarget)}
          disabled={reordenando || salvandoFormulario || contratoBloqueado} aria-expanded={editor === 'nova'} aria-controls="formulario-nova-etapa"
          data-pi-acao="primaria" data-tec08-acao-criar className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-all duration-200 motion-reduce:transition-none hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed ${editor === 'nova' ? 'border-brand-green bg-brand-green text-on-brand-green' : 'border-brand-green bg-brand-green text-on-brand-green hover:brightness-110'} disabled:!border-slate-600/40 disabled:!bg-slate-600/15 disabled:!text-slate-500 disabled:opacity-65 disabled:shadow-none`}>
          <span>{editor === 'nova' ? 'Cadastrando etapa' : 'Nova etapa'}</span>
        </button>}
      </div>
    </div>
    {(erroConsulta || bloqueio) && <button type="button" onClick={() => void atualizar()} disabled={consulta.atualizando} className="rounded-lg bg-brand-green/10 px-3 py-2 text-sm text-brand-neon disabled:opacity-50">Tentar novamente</button>}
    {erroAcao && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erroAcao}</p>}
    {reordenando && <p role="status" className="text-sm text-foreground/65">Salvando nova ordem...</p>}
    {consulta.carregando && !etapas && !erroConsulta && !bloqueio && <p role="status" className="text-sm text-foreground/70">Carregando etapas...</p>}
    {Boolean(erroConsulta) && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">
      {erroConsulta instanceof ErroEtapa ? erroConsulta.message : 'Não foi possível consultar as etapas. Tente atualizar.'}
    </p>}
    {bloqueio && !erroConsulta && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">O acesso às etapas precisa ser verificado novamente. Atualize a página.</p>}

    {etapas?.length === 0 && <div className="rounded-xl border border-dashed border-brand-green/30 p-4 text-sm text-foreground/70">
      Ainda não há etapas cadastradas para este contrato. {podeEscrever ? 'Use “Nova etapa” para organizar o planejamento.' : 'O planejamento ainda não foi iniciado.'}
    </div>}
    {etapas && naAba?.length === 0 && etapas.length > 0 && <p className="text-sm text-foreground/65">
      {abaEtapas === 'arquivadas' ? 'Nenhuma etapa arquivada.' : abaEtapas === 'concluidas' ? 'Nenhuma etapa concluída.' : abaEtapas === 'revisao' ? 'Nenhuma etapa em revisão.' : 'Nenhuma etapa pendente.'}
    </p>}
    {!!naAba?.length && <ol aria-label={abaEtapas === 'todas' ? 'Etapas em ordem de execução' : abaEtapas === 'concluidas' ? 'Etapas finalizadas' : 'Etapas arquivadas'} className="grid gap-3">
      {naAba.map((etapa, indice) => {
        const itens = entregaveisQuery.dados?.filter(entregavel => entregavel.etapaId === etapa.id && entregavel.contratoId === contratoId && !entregavel.arquivadoEm) ?? [];
        const concluidos = itens.filter(entregavel => {
          return entregavel.statusExecucao === 'CONCLUIDO' && !entregavel.reabertoEm;
        }).length;
        const evidenciasPrevistas = itens.reduce((total, entregavel) => total + (documentalQuery.dados?.[entregavel.id]?.obrigatorias ?? entregavel.evidenciasEsperadas.filter(e => !e.arquivadoEm && e.obrigatoria !== false).length), 0);
        const evidenciasVerificadas = itens.reduce((total, entregavel) => total + (documentalQuery.dados?.[entregavel.id]?.verificadas ?? 0), 0);
        const etapaComprovada = !etapa.reabertoEm && etapa.status === 'CONCLUIDA';
        const etapaEncerrada = !etapa.reabertoEm && etapa.status === 'ENCERRADA';
        const etapaFinalizada = !etapa.reabertoEm && etapa.status === 'FINALIZADA';
        const fisicos = itens.map(e => progressoContrato.progresso?.entregaveis.find(p => p.entregavelId === e.id)?.percentualExecucao ?? null);
        const valorFisicoEtapa = fisicos.length && fisicos.every(v => v !== null) ? fisicos.reduce((n,v) => n + (v ?? 0), 0) / fisicos.length : null;
        // A comprovação de cada filho segue como indicador separado; não altera
        // retroativamente o status CONCLUIDA persistido da etapa.
        const arquivamentoHerdado = Boolean(etapa.arquivadoEm); // o arquivamento do contrato não muda o estado dos filhos
        const statusVisivel = etapa.status;
        return <li key={etapa.id} data-etapa-estado={arquivamentoHerdado ? 'arquivada' : etapaFinalizada ? 'finalizada' : etapaEncerrada ? 'encerrada' : etapaComprovada ? 'concluida' : etapa.reabertoEm ? 'reaberta' : 'normal'} data-tec08-item-clicavel ref={(no) => { if (no) cartoesEtapa.current.set(etapa.id, no); else cartoesEtapa.current.delete(etapa.id); }}
          onClick={(evento) => { if (!(evento.target instanceof Element) || evento.target.closest('button,a,input,textarea,select,[role="dialog"]')) return; abrirModal(`detalhe:${etapa.id}`, evento.currentTarget as HTMLElement); }}
          className={`group min-w-0 rounded-xl border p-3 transition-opacity duration-150 sm:p-4 ${arquivamentoHerdado ? 'border-amber-500/65 bg-amber-500/[0.09] text-amber-100' : etapaFinalizada ? 'border-purple-500/65 bg-purple-500/[0.12] text-purple-200' : etapaEncerrada ? 'border-slate-500/60 bg-background text-foreground' : etapaComprovada
            ? 'border-violet-500/60 bg-violet-500/[0.06] opacity-90 hover:border-violet-400 hover:opacity-100'
            : etapa.reabertoEm ? 'border-green-500/45 bg-green-900/[0.12] hover:border-green-400/55' : 'border-brand-green/25 bg-background hover:border-brand-green/55'}`}>
          {etapaFinalizada && <div className="mb-3 flex flex-wrap items-center justify-end gap-2 text-xs font-semibold text-purple-700 dark:text-purple-300"><span className="rounded-full border border-purple-500/55 bg-purple-500/20 px-2.5 py-1">Encerrada</span><span className="rounded-lg border border-purple-500/40 px-2.5 py-1 tabular-nums">{valorFisicoEtapa === null ? 'Execução não calculável' : `${valorFisicoEtapa.toLocaleString('pt-BR',{maximumFractionDigits:2})}% realizado`}</span></div>}
          <div className="flex min-w-0 flex-wrap items-start gap-3">
            <div aria-label={`Posição ${etapa.sequencia}${etapaComprovada ? ', documentação completa' : ''}`}
              className="flex w-11 shrink-0 flex-col items-center gap-1.5 pt-0.5">
              <span className={`self-start pl-1 text-xs font-semibold tabular-nums ${arquivamentoHerdado ? 'text-foreground/80' : etapaEncerrada ? 'text-slate-400' : etapaComprovada ? 'text-violet-800 dark:text-violet-200' : 'text-foreground/65'}`}>
                {String(etapa.sequencia).padStart(2, '0')}
              </span>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${arquivamentoHerdado ? 'border-amber-400/65 bg-amber-500/20 text-amber-900 dark:text-amber-200' : etapaEncerrada ? 'border-slate-500/60 bg-slate-500/10 text-slate-700 dark:text-slate-300' : etapaComprovada
                ? 'border-violet-400/65 bg-violet-500/20 text-violet-800 dark:text-violet-200'
                : etapa.reabertoEm ? 'border-brand-green/30 bg-brand-green/10 text-brand-neon/75' : 'border-brand-green/30 bg-brand-green/10 text-brand-neon/75'}`}>
                {etapaComprovada ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
                </svg> : <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
                  <circle cx="12" cy="12" r="8" />
                </svg>}
              </span>
            </div>
            <button type="button" onClick={(evento) => abrirModal(`detalhe:${etapa.id}`, evento.currentTarget)}
              aria-label={`Abrir detalhes da etapa ${indice + 1}: ${etapa.nome}`} aria-haspopup="dialog"
              className="min-w-0 flex-1 basis-[12rem] space-y-1 text-left focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-brand-neon">
              <span className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden">
                <span className={`min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-sm font-semibold group-hover:underline ${arquivamentoHerdado ? 'text-foreground' : etapaEncerrada ? 'text-slate-700 dark:text-slate-300' : etapaComprovada ? 'text-violet-700 dark:text-violet-200' : etapa.reabertoEm ? 'text-foreground'  : 'text-brand-neon'}`}>{etapa.nome}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${arquivamentoHerdado ? 'border-amber-400/45 text-white/85' : etapaEncerrada ? 'border-slate-500/60 bg-slate-500/10 text-slate-700 dark:text-slate-300' : etapaComprovada ? 'border-violet-400/50 bg-violet-500/10 text-violet-700 dark:text-violet-200' : etapa.reabertoEm ? 'border-green-500/60 bg-green-500/15 text-green-300' : 'border-brand-green/25 text-foreground/75'}`}>{etapa.arquivadoEm ? 'Arquivada' : etapa.reabertoEm ? 'Reaberta' : STATUS_ETAPA[statusVisivel]}</span>
                {etapa.reabertoEm && !etapa.arquivadoEm && <span className="rounded-full border border-foreground/20 bg-background px-2 py-0.5 text-[10px] text-foreground/80">{STATUS_ETAPA[statusVisivel]}</span>}
              </span>
              <span className={`block max-w-full break-words [overflow-wrap:anywhere] text-xs ${arquivamentoHerdado ? 'text-foreground/70' : 'text-foreground/60'}`}><span className="font-mono">{rotuloCodigoPublico(etapa.codigoPublico)}</span>{etapa.codigo ? ` · ${etapa.codigo}` : ''}{intervaloPrevisto(etapa.inicioPrevisto, etapa.terminoPrevisto) ? ` · ${intervaloPrevisto(etapa.inicioPrevisto, etapa.terminoPrevisto)}` : ''}</span>
              <span className="mt-2 grid max-w-[510px] gap-3 sm:grid-cols-2">
                {([['Entregáveis', concluidos, itens.length], ['Evidências', evidenciasVerificadas, evidenciasPrevistas]] as const).map(([rotulo, feitos, total]) => <span key={rotulo} className="block min-w-0 space-y-1">
                  <span className={`flex items-center gap-2 text-xs ${arquivamentoHerdado ? 'text-foreground/80' : 'text-foreground/75'}`}><span>{rotulo}</span><strong className="tabular-nums text-foreground">{feitos}/{total}</strong></span>
                  <span data-tec08-progresso-entidade role="img" aria-label={`${feitos} de ${total} ${rotulo.toLowerCase()} documentalmente comprovados; não é execução física`}
                    className={`flex h-1.5 max-w-52 gap-[3px] overflow-hidden rounded-full ${arquivamentoHerdado ? 'bg-amber-500/20' : etapa.reabertoEm ? 'bg-brand-green/15' : 'bg-violet-500/15'}`}>
                    {total > 0 ? Array.from({ length: Math.min(total, 10) }, (_, n) => <span key={n} data-tec08-progresso-preenchido={n < Math.round(feitos / total * Math.min(total,10)) ? "true" : "false"} className={`min-w-0 flex-1 rounded-sm ${n < Math.round(feitos / total * Math.min(total,10)) ? arquivamentoHerdado ? 'bg-amber-400' : etapa.reabertoEm ? 'bg-brand-green' : 'bg-violet-500' : arquivamentoHerdado ? 'bg-amber-500/20' : etapa.reabertoEm ? 'bg-brand-green/15' : 'bg-violet-500/15'}`} />) : <span className="h-full w-full rounded-full bg-violet-500/15" />}
                  </span>
                </span>)}
              </span>
            </button>
            {!contratoBloqueado && (podeEditarEtapa || podeReordenarEtapa || podeArquivarEtapa || podeReativarEtapa || podeExcluirEtapa || podeReabrirEtapa || podeReabrirEtapaEncerrada || podeEncerrarEtapa) && <div className="flex w-full shrink-0 flex-wrap items-start justify-end gap-1.5 self-start pt-1 sm:w-auto sm:pt-0">
              {podeReordenarEtapa && abaEtapas === 'todas' && <>
                <button type="button" disabled={contratoBloqueado || !ordemDestravada || reordenando || salvandoFormulario || indice === 0} onClick={() => void mover(indice, -1)}
                  aria-label={`Subir etapa ${etapa.nome}`} title={ordemDestravada ? 'Subir etapa' : 'Ordem bloqueada para todo este contrato'}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-brand-green/35 text-sm transition-colors hover:bg-brand-green/20 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-35">↑</button>
                <button type="button" disabled={contratoBloqueado || !ordemDestravada || reordenando || salvandoFormulario || indice === naAba.length - 1} onClick={() => void mover(indice, 1)}
                  aria-label={`Descer etapa ${etapa.nome}`} title={ordemDestravada ? 'Descer etapa' : 'Ordem bloqueada para todo este contrato'}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-brand-green/35 text-sm transition-colors hover:bg-brand-green/20 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-35">↓</button>
              </>}

            </div>}
          </div>
        </li>;
      })}
    </ol>}
    {editor && ((editor === 'nova' && podeCriarEtapa) || (itemEditando && podeEditarEtapa) || !!itemDetalhe) && <ModalEtapa
      titulo={itemDetalhe ? `${itemDetalhe.sequencia} · ${itemDetalhe.nome}` : editor === 'nova' ? 'Nova etapa' : `Editar etapa · ${itemEditando?.nome ?? ''}`}
      contexto={itemDetalhe ? 'Etapa do contrato' : 'Planejamento do contrato'} codigoPublico={itemDetalhe?.codigoPublico}
      textoFechar="Fechar ×"
      etiqueta={itemDetalhe ? itemDetalhe.arquivadoEm ? 'Arquivada' : itemDetalhe.conclusaoSolicitadaEm ? 'Pendente de conclusão' : itemDetalhe.encerramentoSolicitadoEm ? 'Pendente de encerramento' : itemDetalhe.reabertoEm ? 'Reaberta' : STATUS_ETAPA[itemDetalhe.status] : undefined}
      rotuloFechar={itemDetalhe ? 'Voltar às etapas' : retornoEdicao ? 'Fechar edição da etapa' : 'Fechar edição da etapa'}
      somenteIconeFechar alturaEstavel={Boolean(itemDetalhe)} arquivado={Boolean(itemDetalhe?.arquivadoEm)} concluido={Boolean(itemDetalhe && itemDetalhe.status === 'CONCLUIDA' && !itemDetalhe.reabertoEm)} revisao={Boolean(itemDetalhe?.reabertoEm)}
      estadoContextual={editor === 'nova' ? 'normal' : !itemEditando?.arquivadoEm && !itemDetalhe?.arquivadoEm && (itemEditando?.status ?? itemDetalhe?.status) === 'PLANEJADA' ? 'andamento' : estadoDoObjeto({objeto:'etapa', status:itemEditando?.status ?? itemDetalhe?.status, arquivado:Boolean(itemEditando?.arquivadoEm || itemDetalhe?.arquivadoEm), reaberto:Boolean(itemEditando?.reabertoEm || itemDetalhe?.reabertoEm)})}
      bloqueadoPorSubmodal={detalheEntregavelAberto}
      ocupado={salvandoFormulario} focoRetorno={gatilhoModal} onFechar={fecharNivelModal}
      acoes={itemDetalhe ? <>
        {podeEditarEtapa && !itemDetalhe.arquivadoEm && !itemDetalhe.conclusaoSolicitadaEm && !itemDetalhe.encerramentoSolicitadoEm && !contratoBloqueado &&
          <BotaoEditarModal rotulo="Editar etapa" onClick={() => { setRetornoEdicao(itemDetalhe.id); setEditor(itemDetalhe.id); }} />}
        <MenuAcoesObjeto rotulo={itemDetalhe.arquivadoEm || ['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) ? 'Reabrir' : 'Fechar'}
          disabled={ocupadoArquivoEtapa || salvandoFormulario}
          pendenteConclusao={Boolean(!['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) && (itemDetalhe.conclusaoSolicitadaEm || etapaPodeSerConcluida(itemDetalhe,entregaveisQuery.dados,documentalQuery.dados)))}
          acaoDireta={itemDetalhe.arquivadoEm && podeReativarEtapa && !contratoBloqueado ? () => { void alterarArquivoEtapa(itemDetalhe.id, 'reativar'); }
            : !itemDetalhe.arquivadoEm && !itemDetalhe.reabertoEm && ['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status)
              && (['ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) ? podeReabrirEtapaEncerrada : podeReabrirEtapa) && !contratoBloqueado
              ? () => { setMotivoEtapa(''); setConfirmarReaberturaEtapa(itemDetalhe.id); } : undefined}>
          {!itemDetalhe.arquivadoEm && !['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) && !itemDetalhe.conclusaoSolicitadaEm && !itemDetalhe.encerramentoSolicitadoEm && <>
            <BotaoAcaoModal intencao="solicitar-conclusao" disabled={contratoBloqueado || !podeEditarEtapa || !etapaPodeSerConcluida(itemDetalhe,entregaveisQuery.dados,documentalQuery.dados)}
              title="Requer todos os entregáveis e evidências resolvidos" onClick={()=>setConfirmarConclusaoEtapa(itemDetalhe.id)}>Solicitar conclusão</BotaoAcaoModal>
            <BotaoAcaoModal intencao="encerrar" disabled={contratoBloqueado || !podeEditarEtapa || etapaPodeSerConcluida(itemDetalhe,entregaveisQuery.dados,documentalQuery.dados)}
              title="Encerramento administrativo com justificativa quando a execução integral não foi comprovada" onClick={()=>{setMotivoEtapa('');setConfirmarEncerramentoDireto(itemDetalhe.id);}}>Solicitar encerramento</BotaoAcaoModal>
          </>}
          {!!itemDetalhe.conclusaoSolicitadaEm && <>
            <BotaoAcaoModal intencao="concluir" disabled={!permissao('concluirEtapas')||contratoBloqueado} onClick={()=>setAprovarConclusao(itemDetalhe.id)}>Aprovar conclusão</BotaoAcaoModal>
            <BotaoAcaoModal intencao="cancelar" disabled={!permissao('concluirEtapas')||contratoBloqueado} onClick={()=>{setMotivoEtapa('');setDevolverPendente({id:itemDetalhe.id,tipo:'conclusao'});}}>Devolver solicitação</BotaoAcaoModal>
          </>}
          {!!itemDetalhe.encerramentoSolicitadoEm && <>
            <BotaoAcaoModal intencao="encerrar" disabled={!permissao('encerrarEtapas')||contratoBloqueado} onClick={()=>setAprovarEncerramento(itemDetalhe.id)}>Aprovar encerramento</BotaoAcaoModal>
            <BotaoAcaoModal intencao="cancelar" disabled={!permissao('encerrarEtapas')||contratoBloqueado} onClick={()=>{setMotivoEtapa('');setDevolverPendente({id:itemDetalhe.id,tipo:'encerramento'});}}>Devolver solicitação</BotaoAcaoModal>
          </>}
          {!itemDetalhe.arquivadoEm && podeArquivarEtapa && !contratoBloqueado && !itemDetalhe.conclusaoSolicitadaEm && !itemDetalhe.encerramentoSolicitadoEm &&
            !(itemDetalhe.status==='CONCLUIDA' && !itemDetalhe.reabertoEm) &&
            <BotaoAcaoModal intencao="arquivar" disabled={ocupadoArquivoEtapa} onClick={()=>setConfirmarArquivoEtapa({id:itemDetalhe.id,acao:'arquivar'})}>Arquivar</BotaoAcaoModal>}
        </MenuAcoesObjeto>
        {!itemDetalhe.arquivadoEm && ['ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) && podeArquivarEtapa && !contratoBloqueado && <button type="button" title="Arquivar etapa finalizada" aria-label="Arquivar etapa finalizada" onClick={() => setConfirmarArquivoEtapa({id:itemDetalhe.id, acao:'arquivar'})} disabled={ocupadoArquivoEtapa} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-orange-500/45 bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-500/20 disabled:opacity-40"><IconeStatus tipo="arquivadas" /></button>}
      </> : undefined}>
      {itemDetalhe ? <div className="min-w-0 space-y-4" aria-label={`Detalhes da etapa ${itemDetalhe.nome}`}>
        <dl data-tec08-secao-contextual className="grid gap-3 rounded-xl border border-brand-green/20 p-4 text-sm sm:grid-cols-2">
          {([['Código', itemDetalhe.codigo || 'Não informado'], ['Início previsto', dataBR(itemDetalhe.inicioPrevisto)],
            ['Término previsto', dataBR(itemDetalhe.terminoPrevisto)]] as const)
            .map(([rotulo, valor]) => <div key={rotulo}><dt className="text-xs text-foreground/60">{rotulo}</dt><dd className="mt-1 break-words">{valor}</dd></div>)}
        </dl>
        {itemDetalhe.descricao && <p className="whitespace-pre-wrap break-words text-sm text-foreground/80">{itemDetalhe.descricao}</p>}
        {itemDetalhe.observacoes && <p className="whitespace-pre-wrap break-words text-sm text-foreground/70"><strong>Observações:</strong> {itemDetalhe.observacoes}</p>}
        <HistoricoEtapa contratoId={contratoId} etapaId={itemDetalhe.id} />
        {itemDetalhe.avisoVigencia && <p role="note" className="rounded-lg border border-amber-500/35 p-3 text-sm">Atenção: as datas previstas desta etapa estão fora da vigência atual do contrato. Nenhuma data foi alterada automaticamente.</p>}
        <EntregaveisDaEtapa estadoProprioEtapa={itemDetalhe.arquivadoEm ? 'arquivado' : itemDetalhe.reabertoEm ? 'revisao' : itemDetalhe.status === 'CONCLUIDA' ? 'concluido' : itemDetalhe.status === 'FINALIZADA' ? 'finalizado' : itemDetalhe.status === 'ENCERRADA' ? 'encerrado' : 'normal'} contratoId={contratoId} etapaId={itemDetalhe.id} dados={entregaveisQuery.dados}
          carregando={entregaveisQuery.carregando} erro={entregaveisQuery.erro} atualizar={entregaveisQuery.atualizar}
          podeCriar={permissao('criarEntregaveis') && !contratoBloqueado && !itemDetalhe.arquivadoEm && !itemDetalhe.conclusaoSolicitadaEm && !itemDetalhe.encerramentoSolicitadoEm && !['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status)} podeEditar={permissao('editarEntregaveis')}
          podeArquivar={permissao('arquivarEntregaveis')} paiArquivado={Boolean(contratoArquivado || itemDetalhe.arquivadoEm)} paiEmRevisao={Boolean(itemDetalhe.reabertoEm && itemDetalhe.status !== 'CONCLUIDA' && itemDetalhe.status !== 'ENCERRADA')} paiConcluido={contratoConcluido || contratoEncerrado || (['CONCLUIDA', 'ENCERRADA'].includes(itemDetalhe.status) && !itemDetalhe.reabertoEm)} permissoes={permissoes}
          dentroModal documental={documentalQuery.dados} atualizarDocumental={() => { cache?.invalidar(['contratos', 'pendentes']); cache?.invalidar(['execucao', contratoId]); void consulta.atualizar().catch(() => {}); void documentalQuery.atualizar().catch(() => {}); }}
          onHierarquiaAlterada={() => { onAuditoriaAlterada?.(); cache?.invalidar(['entregaveis', 'contrato', contratoId]); cache?.invalidar(['etapas', 'contrato', contratoId]); cache?.invalidar(['contratos', 'pendentes']); cache?.invalidar(['execucao', contratoId]); cache?.invalidar(['contratos', 'detalhe', contratoId]); void consulta.atualizar().catch(() => {}); void entregaveisQuery.atualizar().catch(() => {}); void documentalQuery.atualizar().catch(() => {}); }}
          onDetalheMudou={setDetalheEntregavelAberto} />
      </div> : <div id={editor === 'nova' ? 'formulario-nova-etapa' : `formulario-etapa-${editor}`}>
        <FormularioEtapa key={editor} inicial={itemEditando} onSalvar={salvar}
          onCancelar={fecharNivelModal} onSalvandoMudou={setSalvandoFormulario} />
      </div>}
    </ModalEtapa>}
    {confirmarArquivoEtapa && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples titulo={confirmarArquivoEtapa.acao === 'arquivar' ? 'Arquivar etapa?' : 'Reativar etapa?'}
        estadoContextual={etapas?.find(e => e.id === confirmarArquivoEtapa.id)?.reabertoEm ? 'revisao' : 'normal'} cancelarVermelho
        descricao={confirmarArquivoEtapa.acao === 'arquivar' ? 'A etapa sairá da visão principal, mas os seus entregáveis, evidências e arquivos ficarão preservados.' : 'A etapa voltará à lista principal no final da ordem de execução.'}
        confirmar={confirmarArquivoEtapa.acao === 'arquivar' ? 'Confirmar arquivamento' : 'Confirmar reativação'}
        ocupado={ocupadoArquivoEtapa} justificativa={motivoEtapa} onJustificativaChange={confirmarArquivoEtapa.acao === 'reativar' ? setMotivoEtapa : undefined} onCancelar={() => { setConfirmarArquivoEtapa(null); setMotivoEtapa(''); }}
        onConfirmar={() => void alterarArquivoEtapa(confirmarArquivoEtapa.id, confirmarArquivoEtapa.acao)} />
    </div>, document.body)}
    {confirmarEncerramentoDireto && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples titulo="Solicitar encerramento da etapa?" descricao="A justificativa será encaminhada para aprovação do encerramento administrativo. O percentual físico não será alterado."
        confirmar="Solicitar encerramento" ocupado={ocupadoArquivoEtapa}
        justificativa={motivoEtapa} justificativaMinima={15} onJustificativaChange={setMotivoEtapa}
        onCancelar={() => { setConfirmarEncerramentoDireto(null); setMotivoEtapa(''); }}
        onConfirmar={() => void executarEncerramentoDireto()} />
    </div>, document.body)}
    {confirmarReaberturaEtapa && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples titulo={etapas?.find(item => item.id === confirmarReaberturaEtapa)?.status === 'ENCERRADA' ? 'Reabrir etapa encerrada?' : 'Reabrir etapa concluída?'} descricao="A etapa ficará marcada como Reaberta. Entregáveis e evidências não serão reabertos automaticamente. O histórico continuará preservado."
        confirmar="Reabrir etapa" ocupado={ocupadoArquivoEtapa} justificativa={motivoEtapa} justificativaMinima={15} onJustificativaChange={setMotivoEtapa} onCancelar={() => { setConfirmarReaberturaEtapa(null); setMotivoEtapa(''); }}
        onConfirmar={() => void executarReaberturaEtapa()} />
    </div>, document.body)}

    {aprovarConclusao && createPortal(<div className="relative z-[180]"><ConfirmacaoSimples titulo="Aprovar conclusão da etapa?" descricao="Confirma a execução integral após os requisitos verificados. O registro ficará auditado." confirmar="Aprovar conclusão" confirmacaoRoxa ocupado={ocupadoArquivoEtapa} onCancelar={()=>setAprovarConclusao(null)} onConfirmar={()=>void decidirEtapa('conclusao',aprovarConclusao,'aprovar')}/></div>,document.body)}
    {aprovarEncerramento && createPortal(<div className="relative z-[180]"><ConfirmacaoSimples titulo="Aprovar encerramento da etapa?" descricao="Confirma o encerramento administrativo sem alterar o avanço físico realizado." confirmar="Aprovar encerramento" estadoContextual="finalizado" ocupado={ocupadoArquivoEtapa} onCancelar={()=>setAprovarEncerramento(null)} onConfirmar={()=>void decidirEtapa('encerramento',aprovarEncerramento,'aprovar')}/></div>,document.body)}
    {devolverPendente && createPortal(<div className="relative z-[180]"><ConfirmacaoSimples titulo="Devolver solicitação da etapa?" descricao="A decisão será devolvida para revisão e a justificativa ficará no histórico." confirmar="Devolver solicitação" ocupado={ocupadoArquivoEtapa} justificativa={motivoEtapa} justificativaMinima={15} onJustificativaChange={setMotivoEtapa} onCancelar={()=>setDevolverPendente(null)} onConfirmar={()=>void decidirEtapa(devolverPendente.tipo,devolverPendente.id,'devolver')}/></div>,document.body)}
    {confirmarConclusaoEtapa && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples titulo="Solicitar conclusão da etapa?" descricao="A etapa será enviada para aprovação. A solicitação não conclui automaticamente a execução e será registrada no histórico."
        confirmar="Solicitar conclusão" confirmacaoRoxa ocupado={ocupadoArquivoEtapa} onCancelar={() => setConfirmarConclusaoEtapa(null)}
        onConfirmar={() => void executarConclusaoEtapa()} />
    </div>, document.body)}
    {confirmarExclusaoEtapa && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples titulo="Excluir etapa arquivada?" perigoso ocupado={ocupadoArquivoEtapa}
        descricao="Excluir definitivamente esta etapa de teste, todos os seus entregáveis, evidências, versões e arquivos? A operação não pode ser desfeita."
        confirmar="Excluir definitivamente" onCancelar={() => setConfirmarExclusaoEtapa(null)} onConfirmar={() => void excluirEtapa(confirmarExclusaoEtapa)} />
    </div>, document.body)}
  </section>;
}
