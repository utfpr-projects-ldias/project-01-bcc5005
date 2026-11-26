'use client';
import { BotaoExcluirModal, BotaoEditarModal, BotaoAcaoModal, BotaoArquivarModal } from '@/app/components/botoes-modal';
import { modalidadeEncerramento } from '@/lib/modalidade-encerramento';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ROTULOS_TIPO, type Entregavel } from '@/lib/entregaveis';
import { AnelTabela, BarraTabela, CabecalhoColuna, ComprovacaoTabela, IconeTabela, StatusTabela, metricasEntregavel, metricasEtapa, taxa, ordenarTabela, ordemEstados, useOrdemTabela } from './tabela-operacional';
import { estadoDoObjeto, rotuloEstadoEntregavel } from '@/lib/identidade-operacional';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';
import { useEtapas, useMutacoesEtapas, useElegibilidadeEtapa } from '@/hooks/use-etapas';
import { alterarBloqueioOrdemEtapas, type PermissoesContrato, type ModoCalculo } from '@/lib/contratos';
import { useProgresso } from '@/hooks/use-progresso';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import { EntregaveisDaEtapa } from './entregaveis-da-etapa';
import { HistoricoEtapa } from './historico-etapa';
import { etapaNaAba, filtrosEtapas, type AbaEtapas } from '@/lib/filtros-etapas';
import { ErroEtapa, concluirEtapa, finalizarEtapa, solicitarConclusaoEtapa, solicitarEncerramentoEtapa, devolverSolicitacaoEtapa, encerrarEtapa, reabrirEtapaEncerrada, reabrirEtapa, alterarArquivamentoEtapa, excluirEtapaArquivada, type DadosEtapa, type AtualizacaoEtapa, type Etapa } from '@/lib/etapas';
import { FormularioEtapa } from './formulario-etapa';
import { IconeStatus } from '@/app/components/icones-status';
import { rotuloCodigoPublico } from '@/lib/codigos-publicos';
import { sincronizarContrato } from '@/lib/sincronizar-contrato';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { ModalEtapa } from './modal-etapa';

import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { identidadeEtapa } from '@/lib/identidade-etapa';
import { ajustarRestauracaoHistorico } from '@/lib/historico-modal-scroll';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { lerRetornoContrato, limparRetornoContrato } from '@/lib/retorno-contrato';

function dataBR(valor: string | null): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor.split('-').reverse().join('/') : 'Não informada';
}

export function PainelEtapas({ contratoId, vigencia, modoCalculo = 'PONDERADO', habilitado, podeGerenciar, permissoes, contratoArquivado = false, contratoConcluido = false, contratoParcial = false, contratoEmRevisao = false, ordemEtapasBloqueada = false, contratoSuspenso = false, contratoCancelado = false, contratoEncerrado = false, contratoPendenteConclusao = false, onAuditoriaAlterada, onOrdemAlterada, interno = false, destinoInterno, painelDireitoAberto = false, numeroContrato, onFecharConsultaDireta, consultaAvulsa = false }: {
  consultaAvulsa?: boolean; numeroContrato?: string; onFecharConsultaDireta?:()=>void; interno?: boolean; destinoInterno?: { etapaId: string; id: string; origemRegistro?: import('./execucoes-entregavel').OrigemExecucao }; painelDireitoAberto?: boolean;
  contratoId: string; vigencia?: import('@/lib/vigencia-planejamento').VigenciaPlanejamento; modoCalculo?: ModoCalculo; habilitado: boolean; podeGerenciar: boolean; permissoes?: PermissoesContrato;
  contratoArquivado?: boolean; contratoConcluido?: boolean; contratoParcial?: boolean; contratoEmRevisao?: boolean; ordemEtapasBloqueada?: boolean; contratoSuspenso?: boolean; contratoCancelado?: boolean; contratoEncerrado?: boolean; contratoPendenteConclusao?: boolean; onAuditoriaAlterada?: () => void; onOrdemAlterada?: () => Promise<unknown>;
}) {
  const cache = useRepositorioConsultasOpcional();
  const contratoBloqueado = contratoArquivado || contratoConcluido || contratoParcial || contratoSuspenso || contratoCancelado || contratoEncerrado || contratoPendenteConclusao;
  const permiteRegularizar = contratoParcial && !contratoArquivado && !contratoPendenteConclusao && !contratoSuspenso && !contratoCancelado && !contratoEncerrado;
  // 'Pendente de conclusão' não é status operacional CONCLUIDO.
  const consulta = useEtapas(contratoId, habilitado);
  const mutacoes = useMutacoesEtapas(contratoId);
  const [editor, setEditor] = useState<string | null>(null);
  const [detalheModal, setDetalheModal] = useState(consultaAvulsa);
  const detalheEmPagina = interno && !consultaAvulsa && !detalheModal;
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
  const cartoesEtapa = useRef(new Map<string, HTMLTableRowElement>());
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
  const [confirmarFinalizacao, setConfirmarFinalizacao] = useState<string | null>(null);
  const [revisaoHistorico, setRevisaoHistorico] = useState(0);
  const [aprovarConclusao, setAprovarConclusao] = useState<string | null>(null);
  const [aprovarEncerramento, setAprovarEncerramento] = useState<string | null>(null);
  const [devolverPendente, setDevolverPendente] = useState<{id:string;tipo:'conclusao'|'encerramento'} | null>(null);
  const [parcialEtapa, setParcialEtapa] = useState(false);
  const [confirmarConclusaoEtapa, setConfirmarConclusaoEtapa] = useState<string | null>(null);
  const [confirmarExclusaoEtapa, setConfirmarExclusaoEtapa] = useState<string | null>(null);
  const [ocupadoArquivoEtapa, setOcupadoArquivoEtapa] = useState(false);
  const [confirmarArquivoEtapa, setConfirmarArquivoEtapa] = useState<{ id: string; acao: 'arquivar' | 'reativar' } | null>(null);
  const estadoPainel = contratoArquivado ? 'arquivado' : contratoCancelado ? 'cancelado' : contratoSuspenso ? 'suspenso' : contratoEncerrado ? 'encerrado' : contratoEmRevisao ? 'revisao' : (contratoConcluido || contratoPendenteConclusao) ? 'concluido' : 'normal';
  const [buscaEtapa,setBuscaEtapa]=useState('');
  const [filtroSituacao,setFiltroSituacao]=useState<Partial<Record<AbaEtapas,string>>>({});
  const [abaEtapas, setAbaEtapas] = useState<AbaEtapas>('todas');
  const situacaoSelecionada = filtroSituacao[abaEtapas] ?? '';
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
  const idDetalhe = editor?.startsWith('detalhe:') ? editor.slice('detalhe:'.length) : interno ? retornoEdicao : null;
  const itemDetalhe = idDetalhe ? etapas?.find(e => e.id === idDetalhe) : undefined;
  const sobreposicaoAtiva = Boolean(itemDetalhe && detalheEmPagina);
  useEffect(() => {
    if (!sobreposicaoAtiva || window.parent === window) return;
    const informar = (aberta: boolean) => window.parent.postMessage({tipo:'pi:etapa-sobreposta', contratoId, aberta}, window.location.origin);
    informar(true);
    return () => informar(false);
  }, [sobreposicaoAtiva, contratoId]);
  const consultaElegibilidade = useElegibilidadeEtapa(contratoId, itemDetalhe?.id ?? '', habilitado && !erroProtegido && !bloqueio && Boolean(itemDetalhe) && !contratoArquivado);
  const elegibilidade = consultaElegibilidade.erro ? undefined : consultaElegibilidade.dados;
  const destinoAtendido = useRef<typeof destinoInterno>(undefined);
  const [destinoSelecao, setDestinoSelecao] = useState<typeof destinoInterno>();
  const destinoDisponivel = Boolean(destinoInterno && etapas?.some(e => e.id === destinoInterno.etapaId));
  useEffect(() => {
    if (!interno || !destinoInterno || destinoAtendido.current === destinoInterno || !destinoDisponivel) return;
    const quadro = requestAnimationFrame(() => { destinoAtendido.current = destinoInterno; setDetalheModal(consultaAvulsa); setDestinoSelecao(destinoInterno); setEditor(`detalhe:${destinoInterno.etapaId}`); setRetornoEdicao(null); setErroAcao(''); });
    return () => cancelAnimationFrame(quadro);
  }, [interno, destinoInterno, destinoDisponivel, consultaAvulsa]);
  const permissao = (acao: keyof PermissoesContrato) => permissoes?.[acao] ?? podeGerenciar;
  const podeCriarEtapa = habilitado && permissao('criarEtapas') && !erroProtegido && !bloqueio;
  const podeEditarEtapa = habilitado && permissao('editarEtapas') && !erroProtegido && !bloqueio;
  const podeReordenarEtapa = habilitado && permissao('reordenarEtapas') && !erroProtegido && !bloqueio;
  const podeBloquearOrdem = habilitado && permissao('bloquearOrdemEtapas') && !erroProtegido && !bloqueio;
  const podeReabrirEtapaEncerrada = habilitado && Boolean(permissoes?.reabrirEtapasEncerradas) && !erroProtegido && !bloqueio;
  const podeReabrirEtapa = habilitado && Boolean(permissoes?.reabrirEtapas) && !erroProtegido && !bloqueio;
  const podeArquivarEtapa = habilitado && Boolean(permissoes?.arquivarEtapas) && !erroProtegido && !bloqueio;
  const podeReativarEtapa = habilitado && Boolean(permissoes?.reativarEtapas) && !erroProtegido && !bloqueio;
  const podeExcluirEtapa = habilitado && Boolean(permissoes?.excluirEtapasArquivadas) && !erroProtegido && !bloqueio;
  const podeEscrever = !contratoBloqueado && (podeCriarEtapa || podeEditarEtapa);
  const entregaveisQuery = useEntregaveis(contratoId, habilitado && !erroProtegido && !bloqueio && !!etapas);
  const documentalQuery = useResumoDocumentalContrato(contratoId, habilitado && !erroProtegido && !bloqueio && !!etapas);
  const progressoContrato = useProgresso(habilitado ? contratoId : '');
  const {ordem:ordemTabela,alternar:alternarOrdem}=useOrdemTabela();
  const [expandidas,setExpandidas]=useState<string[]>([]);
  const painelEtapaRef=useRef<HTMLDivElement>(null);
  const areaEtapasRef=useRef<HTMLElement>(null);
  const filhosDaEtapa=(etapa:Etapa)=>(entregaveisQuery.dados??[]).filter(e=>e.etapaId===etapa.id&&e.contratoId===contratoId&&!e.arquivadoEm);
  const dadosFilho=(e:Entregavel)=>{
    const p=progressoContrato.progresso?.entregaveis.find(v=>v.entregavelId===e.id);
    return {...metricasEntregavel(documentalQuery.dados?.[e.id]),execucao:p?.percentualExecucao??null,participacao:p?.participacaoOperacional??null,estado:estadoDoObjeto({objeto:'entregavel',status:e.statusExecucao,arquivado:Boolean(e.arquivadoEm),reaberto:Boolean(e.reabertoEm),pendenteConclusao:Boolean(e.regularizacaoDocumentalSolicitada)})};
  };
  const dadosEtapa=(e:Etapa)=>metricasEtapa(e, entregaveisQuery.dados, documentalQuery.dados, progressoContrato.progresso, modoCalculo);
  const valorEtapa=(e:Etapa,campo:string)=>{const m=dadosEtapa(e);switch(campo){case 'titulo':return e.nome;case 'execucao':return m.execucao;case 'entregaveis':return taxa(m.entregaveis);case 'ocorrencias':return taxa(m.ocorrencias);case 'atividades':return taxa(m.atividades);case 'evidencias':return taxa(m.evidencias);case 'comprovacao':return taxa(m.comprovacao);case 'status':return ordemEstados[m.estado];case 'prazo':return e.terminoPrevisto;}};
  const valorFilho=(e:Entregavel,campo:string)=>{const m=dadosFilho(e);switch(campo){case 'titulo':return e.nome;case 'execucao':return m.execucao;case 'ocorrencias':return taxa(m.ocorrencias);case 'atividades':return taxa(m.atividades);case 'evidencias':return taxa(m.evidencias);case 'comprovacao':return taxa(m.comprovacao);case 'status':return ordemEstados[m.estado];case 'prazo':return e.terminoPrevisto;}};


  // As abas são mutuamente exclusivas; cada uma mantém seus próprios filtros.
  const naAba = ordenadas?.filter(etapa => {
    if(buscaEtapa.trim()&&![etapa.nome,etapa.codigo??'',String(etapa.sequencia),...filhosDaEtapa(etapa).map(e=>e.nome)].some(v=>v.toLocaleLowerCase('pt-BR').includes(buscaEtapa.trim().toLocaleLowerCase('pt-BR'))))return false;
    return etapaNaAba(etapa, abaEtapas, situacaoSelecionada);
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
    if (consultaAvulsa && itemDetalhe) onFecharConsultaDireta?.();
    if (interno) setDestinoSelecao(undefined);
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
    if (interno && gatilhoModal?.isConnected) requestAnimationFrame(() => gatilhoModal.focus({preventScroll:true}));
  }

  function abrirModal(destino: string, gatilho: HTMLElement) {
    if (editor === destino) { fecharModal(); return; }
    if (interno && destino.startsWith("detalhe:")) {
      setDetalheModal(consultaAvulsa); setDestinoSelecao(undefined);
    }
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
      setEditor(null); setDetalheEntregavelAberto(false); setRetornoEdicao(null); setDestinoSelecao(undefined);
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

  function notificarAlteracao() {
    if (cache) sincronizarContrato(cache, contratoId);
    setRevisaoHistorico(n => n + 1);
    onAuditoriaAlterada?.();
  }

  async function atualizar() {
    setErroAcao('');
    try { await consulta.atualizar(); cache?.invalidar(['contratos', 'pendentes']); cache?.invalidar(['execucao', contratoId]); setBloqueio(false); }
    catch (erro) {
      if (erro instanceof ErroEtapa && [401, 403, 404].includes(erro.status)) { setBloqueio(true); fecharModal(); }
      setErroAcao(erro instanceof ErroEtapa ? erro.message : 'Não foi possível atualizar as etapas.');
    }
  }

  async function salvar(dados: DadosEtapa, original?: Etapa) {
    try {
      if (editor === 'nova') await mutacoes.criar(dados);
      else if (editor) {
        if (!original || original.id !== editor) throw new Error('Etapa não encontrada para atualização.');
        const campos = ['nome','codigo','descricao','inicioPrevisto','terminoPrevisto','status','observacoes'] as const;
        const alteracoes: AtualizacaoEtapa = {};
        for (const campo of campos) if ((original[campo] ?? null) !== (dados[campo] ?? null)) {
          (alteracoes as Record<string, unknown>)[campo] = dados[campo];
        }
        if (Object.keys(alteracoes).length) {
          if (original.estadoEdicao) alteracoes.estadoAnterior = original.estadoEdicao;
          await mutacoes.editar(editor, alteracoes);
        }
      }
      else return;
      if (retornoEdicao) voltarParaDetalhe(true);
      else fecharModal();
      setErroAcao(''); notificarAlteracao(); toastSucesso('Etapa salva com sucesso.');
    } catch (erro) {
      if (erro instanceof ErroEtapa && [401, 403, 404].includes(erro.status)) { setBloqueio(true); fecharModal(); }
      throw erro;
    }
  }

  async function mover(indice: number, deslocamento: -1 | 1) {
    // Somente a aba principal permite reordenar; itens arquivados conservam sua posição.
    const baseOrdem = etapas?.slice().sort((a,b)=>a.sequencia-b.sequencia);
    const indicesAtivos = baseOrdem?.flatMap((etapa, indiceReal) => etapa.arquivadoEm ? [] : [indiceReal]) ?? [];
    if (!etapas || abaEtapas !== 'todas' || !podeReordenarEtapa || !ordemDestravada || reordenando || salvandoFormulario || indice + deslocamento < 0 || indice + deslocamento >= indicesAtivos.length) return;
    const idsOrdemAtual = baseOrdem!.map((etapa) => etapa.id);
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
      notificarAlteracao();
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
    if (!id || ocupadoArquivoEtapa || !podeReabrirEsteEstado || (detalheEmPagina ? Boolean(destinoSelecao?.id) : detalheEntregavelAberto) || etapaParaReabrir?.conclusaoSolicitadaEm || etapaParaReabrir?.encerramentoSolicitadoEm) return;
    setOcupadoArquivoEtapa(true); setErroAcao('');
    try {
      const alterada = encerramentoAdministrativo
        ? await reabrirEtapaEncerrada(contratoId, id, motivoEtapa.trim())
        : await reabrirEtapa(contratoId, id, motivoEtapa.trim());
      setEtapasLocais(atuais => ({ ...atuais, [id]: alterada }));
      setConfirmarReaberturaEtapa(null); setMotivoEtapa('');
      notificarAlteracao();
      toastSucesso('Etapa reaberta para edição.');
      const [leitura] = await Promise.allSettled([consulta.atualizar(), entregaveisQuery.atualizar(), documentalQuery.atualizar()]);
      if (leitura.status === 'fulfilled') setEtapasLocais({});
    } catch (e) { setErroAcao(e instanceof Error ? e.message : 'Não foi possível reabrir a etapa.'); }
    finally { setOcupadoArquivoEtapa(false); }
  }

  async function alterarArquivoEtapa(id: string, acao: 'arquivar' | 'reativar') {
    if (ocupadoArquivoEtapa) return;
    if (contratoBloqueado || !(acao === 'arquivar' ? podeArquivarEtapa : podeReativarEtapa) || (detalheEmPagina ? Boolean(destinoSelecao?.id) : detalheEntregavelAberto)) {
      setErroAcao('Feche o detalhe do entregável e confira a situação e as permissões do contrato antes de alterar a etapa.'); return;
    }
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
      fecharModal();
      notificarAlteracao();
      (acao === 'arquivar' ? toastAviso : toastSucesso)(acao === 'arquivar' ? 'Etapa arquivada.' : 'Etapa reativada.');
      const resultados = await Promise.allSettled([consulta.atualizar(), entregaveisQuery.atualizar(), documentalQuery.atualizar()]);
      // Preserve locally confirmed order if the read failed after a successful PATCH.
      if (resultados[0].status === 'fulfilled') setEtapasLocais({});
    } catch (e) { setErroAcao(e instanceof Error ? e.message : 'Não foi possível alterar a etapa.'); }
    finally { setOcupadoArquivoEtapa(false); }
  }
  async function excluirEtapa(id: string) {
    if (ocupadoArquivoEtapa) return;
    if (!podeExcluirEtapa || contratoBloqueado || (detalheEmPagina ? Boolean(destinoSelecao?.id) : detalheEntregavelAberto)) {setErroAcao('A situação ou as permissões não permitem excluir a etapa.');return;}
    setOcupadoArquivoEtapa(true); setErroAcao('');
    try {
      await excluirEtapaArquivada(contratoId, id);
      setEtapasLocais(atuais => ({ ...atuais, [id]: null }));
      setConfirmarExclusaoEtapa(null);
      notificarAlteracao();
      if (editor === `detalhe:${id}`) fecharModal();
      toastSucesso('Etapa excluída com sucesso.');
      const [atualizacaoEtapas] = await Promise.allSettled([
        consulta.atualizar(), entregaveisQuery.atualizar(), documentalQuery.atualizar(),
      ]);
      // Se a consulta falhar, manter a exclusão local até uma recarga bem-sucedida.
      if (atualizacaoEtapas.status === 'fulfilled') {
        setEtapasLocais(atuais => { const novos = { ...atuais }; delete novos[id]; return novos; });
      }
    } catch (e) { setErroAcao(e instanceof Error ? e.message : 'Falha ao excluir etapa.'); }
    finally { setOcupadoArquivoEtapa(false); }
  }

  async function executarEncerramentoDireto() {
    const id = confirmarEncerramentoDireto;
    if (!id || !podeEditarEtapa || ocupadoArquivoEtapa || contratoBloqueado) return;
    setOcupadoArquivoEtapa(true); setErroAcao('');
    try {
      const alterada = await solicitarEncerramentoEtapa(contratoId, id, motivoEtapa.trim());
      setEtapasLocais(atuais => ({ ...atuais, [id]: alterada }));
      setConfirmarEncerramentoDireto(null); setMotivoEtapa('');
      notificarAlteracao(); toastSucesso('Solicitação de encerramento enviada para aprovação.');
      const [leitura] = await Promise.allSettled([consulta.atualizar(), entregaveisQuery.atualizar(), documentalQuery.atualizar()]);
      if (leitura.status === 'fulfilled') setEtapasLocais({});
    } catch (erro) { setErroAcao(erro instanceof Error ? erro.message : 'Não foi possível encerrar a etapa.'); }
    finally { setOcupadoArquivoEtapa(false); }
  }

  async function decidirEtapa(tipo:'conclusao'|'encerramento',id:string,decisao:'aprovar'|'devolver') {
    const etapa=etapas?.find(e=>e.id===id);
    if(!etapa||ocupadoArquivoEtapa||(contratoBloqueado && !(permiteRegularizar && etapa.status === 'CONCLUIDO_PARCIALMENTE' && tipo === 'conclusao')))return;
    if(!(tipo==='conclusao'?permissao('concluirEtapas'):permissao('encerrarEtapas')))return;
    setOcupadoArquivoEtapa(true);setErroAcao('');
    try{
      const alterada = decisao === 'devolver' ? await devolverSolicitacaoEtapa(contratoId,id,tipo,motivoEtapa.trim())
        : tipo === 'conclusao' ? await concluirEtapa(contratoId,id) : await encerrarEtapa(contratoId,id,etapa.encerramentoMotivo??'');
      setEtapasLocais(atuais => ({ ...atuais, [id]: alterada }));
      setAprovarConclusao(null);setAprovarEncerramento(null);setDevolverPendente(null);setMotivoEtapa('');
      toastSucesso(decisao==='devolver'?'Solicitação devolvida para revisão.':tipo==='conclusao'?'Etapa concluída após aprovação.':'Etapa encerrada após aprovação.');
      notificarAlteracao();
      const [leitura] = await Promise.allSettled([consulta.atualizar(),entregaveisQuery.atualizar(),documentalQuery.atualizar()]);
      if (leitura.status === 'fulfilled') setEtapasLocais({});
    }catch(erro){setErroAcao(erro instanceof Error?erro.message:'Não foi possível decidir a solicitação.');}
    finally{setOcupadoArquivoEtapa(false);}
  }

  async function executarFinalizacaoEtapa() {
    const id = confirmarFinalizacao;
    if (!id || ocupadoArquivoEtapa || contratoBloqueado || !permissao('concluirEtapas')) return;
    setOcupadoArquivoEtapa(true); setErroAcao('');
    try {
      const alterada = await finalizarEtapa(contratoId, id, motivoEtapa.trim());
      setEtapasLocais(atuais => ({ ...atuais, [id]: alterada }));
      setConfirmarFinalizacao(null); setMotivoEtapa('');
      notificarAlteracao(); toastSucesso('Etapa finalizada administrativamente.');
      const [leitura] = await Promise.allSettled([consulta.atualizar(), entregaveisQuery.atualizar(), documentalQuery.atualizar()]);
      if (leitura.status === 'fulfilled') setEtapasLocais({});
    } catch (erro) { setErroAcao(erro instanceof Error ? erro.message : 'Falha ao finalizar a etapa.'); }
    finally { setOcupadoArquivoEtapa(false); }
  }

  async function executarConclusaoEtapa() {
    const id = confirmarConclusaoEtapa;
    if (!id || ocupadoArquivoEtapa || !permissao('editarEtapas')) return;
    const etapa = etapas?.find(registro => registro.id === id);
    if (contratoBloqueado && !(permiteRegularizar && etapa?.status === 'CONCLUIDO_PARCIALMENTE' && !parcialEtapa)) return;
    if (!etapa) {
      setConfirmarConclusaoEtapa(null);
      setErroAcao('Ainda existem entregáveis ou evidências em revisão.');
      return;
    }
    setOcupadoArquivoEtapa(true); setErroAcao('');
    try {
      const alterada = await solicitarConclusaoEtapa(contratoId, id, parcialEtapa);
      setEtapasLocais(atuais => ({ ...atuais, [id]: alterada }));
      setConfirmarConclusaoEtapa(null);
      notificarAlteracao();
      toastSucesso('Solicitação de conclusão enviada para aprovação.');
      const [leitura] = await Promise.allSettled([consulta.atualizar(), entregaveisQuery.atualizar(), documentalQuery.atualizar()]);
      if (leitura.status === 'fulfilled') setEtapasLocais({});
    } catch (e) { setErroAcao(e instanceof Error ? e.message : 'Falha ao concluir etapa.'); }
    finally { setOcupadoArquivoEtapa(false); }
  }

  return <section ref={areaEtapasRef} data-pi-operacional-neutro data-pi-etapas-internas={interno || undefined} data-pi-etapa-no-espaco={Boolean(itemDetalhe && detalheEmPagina) || undefined} data-pi-painel-contextual data-tec08-estado={estadoPainel} aria-labelledby="titulo-etapas" className={`min-w-0 space-y-4 rounded-2xl border bg-brand-darkgreen/10 p-4 md:p-6 ${contratoPendenteConclusao ? 'border-violet-500/35' : contratoArquivado ? 'border-amber-500/35' : 'border-brand-green/25'}`}>
    <div hidden={consultaAvulsa} inert={interno && Boolean(itemDetalhe) || undefined} aria-hidden={interno && Boolean(itemDetalhe) || undefined} className="space-y-3">
    <div className="pi-barra-planejamento">
      <div className="pi-barra-planejamento-topo">
      <div className="pi-barra-planejamento-abas">
        <h3 id="titulo-etapas" className="sr-only">Planejamento das etapas do contrato</h3>
    <AbasRolaveis><div data-pi-etapas-filtros data-pi-abas-neutras role="tablist" aria-label="Visualizações das etapas" className="pi-abas-etapas-consulta">
      {([{id:'todas',rotulo:'Ativas',icone:'ativas'},{id:'revisao',rotulo:'Em revisão',icone:'revisao'},{id:'pendentes',rotulo:'Pendentes de conclusão',icone:'pendentes'},{id:'concluidas',rotulo:'Finalizadas',icone:'concluidas'}] as const).map(aba=><button key={aba.id} role="tab" aria-selected={abaEtapas===aba.id} type="button" onClick={()=>setAbaEtapas(aba.id)}><IconeStatus tipo={aba.icone}/>{aba.rotulo}</button>)}
      <button role="tab" aria-selected={abaEtapas==='arquivadas'} aria-label="Etapas arquivadas" title="Etapas arquivadas" type="button" onClick={()=>setAbaEtapas('arquivadas')}><IconeStatus tipo="arquivadas"/></button>
    </div></AbasRolaveis>
      </div>
      <div className="pi-barra-planejamento-acoes">
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
          data-pi-acao="primaria" data-pi-cadastro-neutro data-tec08-acao-criar className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-all duration-200 motion-reduce:transition-none hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed ${editor === 'nova' ? 'border-brand-green bg-brand-green text-on-brand-green' : 'border-brand-green bg-brand-green text-on-brand-green hover:brightness-110'} disabled:!border-slate-600/40 disabled:!bg-slate-600/15 disabled:!text-slate-500 disabled:opacity-65 disabled:shadow-none`}>
          <span>{editor === 'nova' ? 'Cadastrando etapa' : 'Nova etapa'}</span>
        </button>}
      </div>
      </div>
    <div data-pi-controles-etapas className="pi-barra-planejamento-filtros">
      <div className="pi-busca-operacional"><input type="search" aria-label="Pesquisar etapa" placeholder="Pesquisar etapa..." maxLength={100} className="w-full rounded-lg border px-3 py-2 text-sm" value={buscaEtapa} onChange={e=>setBuscaEtapa(e.target.value)}/></div>
      <select aria-label={abaEtapas==='pendentes'?'Tipo de solicitação da etapa':'Situação da etapa'} className="pi-filtro-tabela" value={situacaoSelecionada} onChange={e=>setFiltroSituacao(v=>({...v,[abaEtapas]:e.target.value}))}><option value="">{abaEtapas==='pendentes'?'Todas as solicitações':'Todas as situações'}</option>{filtrosEtapas[abaEtapas].map(([valor,rotulo])=><option key={valor} value={valor}>{rotulo}</option>)}</select>
      <button type="button" className="pi-limpar-filtros" disabled={!buscaEtapa && !situacaoSelecionada} onClick={()=>{setBuscaEtapa('');setFiltroSituacao({});}}>Limpar filtros</button>
    </div>
    </div>
    {(erroConsulta || bloqueio) && <button type="button" onClick={() => void atualizar()} disabled={consulta.atualizando} className="rounded-lg border border-current/20 px-3 py-2 text-sm text-foreground/80 hover:bg-current/5 disabled:opacity-50">Tentar novamente</button>}
    {!itemDetalhe && erroAcao && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erroAcao}</p>}
    {reordenando && <p role="status" className="text-sm text-foreground/65">Salvando nova ordem...</p>}
    {consulta.carregando && !etapas && !erroConsulta && !bloqueio && <p role="status" className="text-sm text-foreground/70">Carregando etapas...</p>}
    {Boolean(erroConsulta) && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">
      {erroConsulta instanceof ErroEtapa ? erroConsulta.message : 'Não foi possível consultar as etapas. Tente atualizar.'}
    </p>}
    {bloqueio && !erroConsulta && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">O acesso às etapas precisa ser verificado novamente. Atualize a página.</p>}

    {etapas?.length === 0 && <div data-pi-aviso-neutro className="rounded-xl border border-dashed border-current/20 p-4 text-sm text-foreground/70">
      Ainda não há etapas cadastradas para este contrato. {podeEscrever ? 'Use “Nova etapa” para organizar o planejamento.' : 'O planejamento ainda não foi iniciado.'}
    </div>}
    {etapas && naAba?.length === 0 && etapas.length > 0 && <p className="text-sm text-foreground/65">
      {buscaEtapa.trim()||situacaoSelecionada?'Nenhuma etapa encontrada.':abaEtapas === 'arquivadas' ? 'Nenhuma etapa arquivada.' : abaEtapas === 'concluidas' ? 'Nenhuma etapa concluída.' : abaEtapas === 'revisao' ? 'Nenhuma etapa em revisão.' : 'Nenhuma etapa pendente.'}
    </p>}
    {!!naAba?.length && <div className="pi-tabela-scroll"><table className="pi-tabela-operacional pi-tabela-etapas" aria-label="Etapas e entregáveis"><colgroup>{Array.from({length:9},(_,i)=><col key={i}/>)}<col className="pi-col-acoes"/></colgroup><thead><tr>{[['titulo','Título'],['execucao','Execução'],['entregaveis','Entregáveis'],['ocorrencias','Ocorrências'],['atividades','Atividades'],['evidencias','Evidências'],['comprovacao','Comprovação'],['status','Status'],['prazo','Prazo']].map(([campo,titulo])=><CabecalhoColuna key={campo} campo={campo} titulo={titulo} ordem={ordemTabela} alternar={alternarOrdem}/>)}<th scope="col">Ações</th></tr></thead><tbody>
      {ordenarTabela(naAba,ordemTabela,valorEtapa).map((etapa,indice)=>{
        const m=dadosEtapa(etapa), identidade=identidadeEtapa(etapa), filhos=filhosDaEtapa(etapa), aberto=expandidas.includes(etapa.id)||Boolean(buscaEtapa.trim()&&filhos.some(f=>f.nome.toLocaleLowerCase('pt-BR').includes(buscaEtapa.trim().toLocaleLowerCase('pt-BR'))));
        const indiceAtivo=(ordenadas??[]).filter(e=>!e.arquivadoEm).findIndex(e=>e.id===etapa.id);
        return <Fragment key={etapa.id}><tr data-etapa-estado={identidade.estado} ref={no=>{if(no)cartoesEtapa.current.set(etapa.id,no);else cartoesEtapa.current.delete(etapa.id);}}>
          <td><div className="pi-titulo-com-expansao"><button type="button" className="pi-chevron-tabela" disabled={!filhos.length} aria-expanded={aberto} aria-label={`${aberto?'Recolher':'Expandir'} entregáveis de ${etapa.nome}`} onClick={()=>setExpandidas(v=>v.includes(etapa.id)?v.filter(id=>id!==etapa.id):[...v,etapa.id])}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" style={{transform:aberto?'rotate(180deg)':undefined}}><path d="m5 8 5 5 5-5"/></svg></button><button type="button" className="pi-titulo-tabela" onClick={e=>abrirModal(`detalhe:${etapa.id}`,e.currentTarget)} aria-label={`Abrir detalhes da etapa ${indice+1}: ${etapa.nome}`}><IconeTabela estado={m.estado}/><span className="min-w-0"><strong className="block truncate" title={etapa.nome}>{String(etapa.sequencia).padStart(2,'0')} · {etapa.nome}</strong><span className="pi-subtitulo-tabela block truncate">{rotuloCodigoPublico(etapa.codigoPublico)}{etapa.codigo?` · ${etapa.codigo}`:''}</span></span></button></div></td>
          <td><BarraTabela valor={m.execucao}/></td><td><AnelTabela nome="Entregáveis" fracao={m.entregaveis}/></td><td><AnelTabela nome="Ocorrências" fracao={m.ocorrencias}/></td><td><AnelTabela nome="Atividades" fracao={m.atividades} cor="text-emerald-600 dark:text-emerald-400"/></td><td><AnelTabela nome="Evidências" fracao={m.evidencias} cor="text-teal-600 dark:text-teal-400"/></td><td><ComprovacaoTabela fracao={m.comprovacao}/></td><td><StatusTabela estado={m.estado} rotulo={identidade.rotulo}/></td><td className="whitespace-nowrap">{etapa.terminoPrevisto?dataBR(etapa.terminoPrevisto):'—'}</td>
          <td className="pi-celula-acoes"><div className="pi-reserva-acoes">{!contratoBloqueado&&podeReordenarEtapa&&abaEtapas==='todas'&&!ordemTabela?<div className="pi-acoes-tabela"><button type="button" className="pi-acao-tabela" disabled={!ordemDestravada||reordenando||salvandoFormulario||indiceAtivo<=0} aria-label={`Subir etapa ${etapa.nome}`} onClick={()=>void mover(indiceAtivo,-1)}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path d="M10 15V5m-4 4 4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/></svg></button><button type="button" className="pi-acao-tabela" disabled={!ordemDestravada||reordenando||salvandoFormulario||indiceAtivo<0||indiceAtivo===(ordenadas??[]).filter(e=>!e.arquivadoEm).length-1} aria-label={`Descer etapa ${etapa.nome}`} onClick={()=>void mover(indiceAtivo,1)}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path d="M10 5v10m-4-4 4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg></button></div>:<span className="pi-sem-dados">—</span>}</div></td>
        </tr>{aberto&&filhos.length>0&&<tr className="pi-grupo-entregaveis"><td colSpan={10}><div className="pi-subtabela-wrap"><div className="pi-subtabela-titulo"><span>Entregáveis da etapa</span><span>{filhos.length}</span></div><table className="pi-tabela-operacional pi-subtabela" aria-label={`Entregáveis de ${etapa.nome}`}><colgroup>{Array.from({length:8},(_,i)=><col key={i}/>)}</colgroup><thead><tr>{[['titulo','Entregável'],['execucao','Execução'],['ocorrencias','Ocorrências'],['atividades','Atividades'],['evidencias','Evidências'],['comprovacao','Comprovação'],['status','Status'],['prazo','Prazo']].map(([campo,titulo])=><CabecalhoColuna key={campo} campo={campo} titulo={titulo} ordem={ordemTabela} alternar={alternarOrdem}/>)}</tr></thead><tbody>{ordenarTabela(filhos,ordemTabela,valorFilho).map(e=>{const f=dadosFilho(e);return <tr key={e.id} data-filho="true" className="pi-linha-filha"><td><button type="button" className="pi-titulo-tabela pi-titulo-filho" onClick={ev=>{abrirModal(`detalhe:${etapa.id}`,ev.currentTarget);setDestinoSelecao({etapaId:etapa.id,id:e.id});}}><IconeTabela estado={f.estado}/><span className="min-w-0"><strong className="block truncate" title={e.nome}>{e.nome}</strong><span className="pi-subtitulo-tabela block truncate">{ROTULOS_TIPO[e.tipo]}{f.participacao!=null?` · ${f.participacao.toLocaleString('pt-BR',{maximumFractionDigits:1})}% do contrato`:''}</span></span></button></td><td><BarraTabela valor={f.execucao}/></td><td><AnelTabela nome="Ocorrências" fracao={f.ocorrencias}/></td><td><AnelTabela nome="Atividades" fracao={f.atividades} cor="text-emerald-600 dark:text-emerald-400"/></td><td><AnelTabela nome="Evidências" fracao={f.evidencias} cor="text-teal-600 dark:text-teal-400"/></td><td><ComprovacaoTabela fracao={f.comprovacao}/></td><td><StatusTabela estado={f.estado} rotulo={rotuloEstadoEntregavel(e.statusExecucao,Boolean(e.arquivadoEm),Boolean(e.reabertoEm),Boolean(e.regularizacaoDocumentalSolicitada),Boolean(e.motivoFinalizacao))}/><EtiquetaAtraso atrasado={e.atrasado} finalizadoComAtraso={e.finalizadoComAtraso}/></td><td className="whitespace-nowrap">{e.terminoPrevisto?dataBR(e.terminoPrevisto):'—'}</td></tr>;})}</tbody></table></div></td></tr>}</Fragment>;
      })}</tbody></table></div>}
    </div>
    {consultaAvulsa && !itemDetalhe && !editor && <ModalEtapa neutro titulo={consulta.erro || (consulta.dados && !destinoDisponivel)?"Etapa indisponível":"Consultar registro"} ocupado={false} onFechar={()=>onFecharConsultaDireta?.()} larguraFormulario="registro">{consulta.erro || (consulta.dados && !destinoDisponivel)?<p role="alert">{consulta.erro?'Não foi possível consultar a etapa.':'Etapa não encontrada ou não autorizada.'}</p>:<p role="status">Consultando registro…</p>}</ModalEtapa>}
    {editor && ((editor === 'nova' && podeCriarEtapa) || (itemEditando && podeEditarEtapa) || !!itemDetalhe) && <div ref={painelEtapaRef} data-pi-etapa-dialog={Boolean(itemDetalhe && !detalheEmPagina) || undefined} data-pi-etapa-direta={Boolean(destinoSelecao?.id && !detalheEmPagina) || undefined}><ModalEtapa larguraFormulario={itemDetalhe?undefined:"etapa"} larguraDetalhe={Boolean(itemDetalhe)} ancora={itemDetalhe && detalheEmPagina ? areaEtapasRef : undefined} retornoEsquerda={Boolean(itemDetalhe && detalheEmPagina)} mostrarXComVoltar={false}
      titulo={itemDetalhe ? `${itemDetalhe.sequencia} · ${itemDetalhe.nome}` : editor === 'nova' ? 'Nova etapa' : `Editar etapa · ${itemEditando?.nome ?? ''}`}
      contexto={itemDetalhe ? 'Etapa' : 'Planejamento do contrato'}
      textoFechar="Fechar ×"
      etiquetaNoContexto
      etiqueta={itemDetalhe ? identidadeEtapa(itemDetalhe).rotulo : undefined}
      rotuloFechar={itemDetalhe ? 'Voltar às etapas' : retornoEdicao ? 'Fechar edição da etapa' : 'Fechar edição da etapa'}
      somenteIconeFechar alturaEstavel={Boolean(itemDetalhe)} arquivado={Boolean(itemDetalhe?.arquivadoEm)} concluido={Boolean(itemDetalhe && identidadeEtapa(itemDetalhe).estado === 'concluido')} revisao={Boolean(itemDetalhe?.reabertoEm && !itemDetalhe?.conclusaoSolicitadaEm && !itemDetalhe?.encerramentoSolicitadoEm)}
      estadoContextual={editor === 'nova' ? 'andamento' : itemEditando ? identidadeEtapa(itemEditando).estado : itemDetalhe ? identidadeEtapa(itemDetalhe).estado : 'normal'}
      bloqueadoPorSubmodal={!detalheEmPagina && (detalheEntregavelAberto || Boolean(destinoSelecao?.id))}
      ocupado={salvandoFormulario} focoRetorno={gatilhoModal} onFechar={fecharNivelModal}
      acoes={itemDetalhe ? <>
        {podeEditarEtapa && !itemDetalhe.arquivadoEm && !itemDetalhe.encerramentoSolicitadoEm && (itemDetalhe.status === 'CONCLUIDO_PARCIALMENTE' || !itemDetalhe.conclusaoSolicitadaEm && (Boolean(itemDetalhe.reabertoEm) || !['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status))) && !contratoBloqueado &&
          <BotaoEditarModal rotulo="Editar etapa" onClick={() => { const editar=()=>{setRetornoEdicao(itemDetalhe.id); setEditor(itemDetalhe.id);}; editar(); }} />}
        {itemDetalhe.status === 'CONCLUIDO_PARCIALMENTE' && !itemDetalhe.conclusaoSolicitadaEm && !itemDetalhe.arquivadoEm && (!contratoBloqueado || permiteRegularizar) && permissao('editarEtapas') && <BotaoAcaoModal intencao="solicitar-conclusao" disabled={ocupadoArquivoEtapa || !elegibilidade?.podeSolicitarConclusao} onClick={() => {setErroAcao('');setParcialEtapa(false);setConfirmarConclusaoEtapa(itemDetalhe.id);}}>Solicitar regularização documental</BotaoAcaoModal>}
        {!itemDetalhe.arquivadoEm && (itemDetalhe.conclusaoSolicitadaEm || itemDetalhe.encerramentoSolicitadoEm) ? <div className="flex items-center gap-2" data-pi-decisao-pendente aria-label="Decisão pendente da etapa">
          <button type="button" className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300 disabled:opacity-35" disabled={ocupadoArquivoEtapa || (contratoBloqueado && !(permiteRegularizar && itemDetalhe.status === 'CONCLUIDO_PARCIALMENTE')) || !(itemDetalhe.conclusaoSolicitadaEm ? permissao('concluirEtapas') : permissao('encerrarEtapas'))}
            onClick={() => { setMotivoEtapa(''); setDevolverPendente({id:itemDetalhe.id,tipo:itemDetalhe.conclusaoSolicitadaEm?'conclusao':'encerramento'}); }}>Cancelar</button>
          <button type="button" className="rounded-lg border border-green-600/60 bg-green-600/20 px-3 py-2 text-xs font-semibold text-green-800 hover:bg-green-600/30 dark:text-green-200 disabled:opacity-35" disabled={ocupadoArquivoEtapa || (contratoBloqueado && !(permiteRegularizar && itemDetalhe.status === 'CONCLUIDO_PARCIALMENTE')) || !(itemDetalhe.conclusaoSolicitadaEm ? permissao('concluirEtapas') && elegibilidade?.podeAprovarConclusao : permissao('encerrarEtapas') && elegibilidade?.podeAprovarEncerramento)}
            onClick={() => itemDetalhe.conclusaoSolicitadaEm ? setAprovarConclusao(itemDetalhe.id) : setAprovarEncerramento(itemDetalhe.id)}>Aprovar</button>
        </div> : !itemDetalhe.arquivadoEm && !itemDetalhe.reabertoEm && ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) ? <>
          {!contratoBloqueado && (['ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) ? podeReabrirEtapaEncerrada : podeReabrirEtapa) && <MenuAcoesObjeto rotulo="Reabrir" disabled={ocupadoArquivoEtapa || salvandoFormulario} acaoDireta={()=>{setMotivoEtapa('');setConfirmarReaberturaEtapa(itemDetalhe.id);}}/>}
          {!contratoBloqueado && podeArquivarEtapa && <BotaoArquivarModal rotulo="Arquivar etapa" disabled={ocupadoArquivoEtapa || salvandoFormulario} onClick={()=>{setErroAcao('');setConfirmarArquivoEtapa({id:itemDetalhe.id,acao:'arquivar'});}}/>}
        </> : <MenuAcoesObjeto rotulo={itemDetalhe.arquivadoEm ? 'Reativar' : ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) ? 'Reabrir' : 'Fechar'}
          disabled={ocupadoArquivoEtapa || salvandoFormulario}
          pendenteConclusao={Boolean(itemDetalhe.conclusaoSolicitadaEm)}
          acaoDireta={itemDetalhe.arquivadoEm && podeReativarEtapa && !contratoBloqueado ? () => { setMotivoEtapa(''); setConfirmarArquivoEtapa({id:itemDetalhe.id,acao:'reativar'}); }
            : !podeArquivarEtapa && !itemDetalhe.arquivadoEm && !itemDetalhe.reabertoEm && ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status)
              && (['ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) ? podeReabrirEtapaEncerrada : podeReabrirEtapa) && !contratoBloqueado
              ? () => { setMotivoEtapa(''); setConfirmarReaberturaEtapa(itemDetalhe.id); } : undefined}>
          {!itemDetalhe.arquivadoEm && !['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) && !itemDetalhe.conclusaoSolicitadaEm && !itemDetalhe.encerramentoSolicitadoEm && <>
            <BotaoAcaoModal intencao="solicitar-conclusao" disabled={contratoBloqueado || !podeEditarEtapa || !elegibilidade?.podeSolicitarConclusao}
              title="Requer todos os entregáveis e evidências resolvidos" onClick={()=>{setErroAcao('');setParcialEtapa(false);setConfirmarConclusaoEtapa(itemDetalhe.id);}}>Solicitar conclusão</BotaoAcaoModal>
            <BotaoAcaoModal conclusaoParcial intencao="solicitar-conclusao" disabled={contratoBloqueado || !podeEditarEtapa || !elegibilidade?.podeSolicitarParcial}
              onClick={()=>{setErroAcao('');setParcialEtapa(true);setConfirmarConclusaoEtapa(itemDetalhe.id);}}>Solicitar conclusão parcial</BotaoAcaoModal>
            <BotaoAcaoModal intencao="encerrar" disabled={contratoBloqueado || ocupadoArquivoEtapa || !modalidadeEncerramento(Boolean(podeEditarEtapa && elegibilidade?.podeSolicitarEncerramento),Boolean(permissao('concluirEtapas') && elegibilidade?.podeFinalizar))}
              onClick={()=>{setErroAcao('');setMotivoEtapa('');const acao=modalidadeEncerramento(Boolean(podeEditarEtapa && elegibilidade?.podeSolicitarEncerramento),Boolean(permissao('concluirEtapas') && elegibilidade?.podeFinalizar));if(acao==='finalizar')setConfirmarFinalizacao(itemDetalhe.id);else if(acao==='encerrar')setConfirmarEncerramentoDireto(itemDetalhe.id);}}>Encerrar etapa</BotaoAcaoModal>
          </>}
          {!itemDetalhe.arquivadoEm && !!itemDetalhe.conclusaoSolicitadaEm && <>
            <BotaoAcaoModal intencao="concluir" disabled={!permissao('concluirEtapas')||(contratoBloqueado&&!(permiteRegularizar&&itemDetalhe.status==='CONCLUIDO_PARCIALMENTE'))} onClick={()=>setAprovarConclusao(itemDetalhe.id)}>Aprovar conclusão</BotaoAcaoModal>
            <BotaoAcaoModal intencao="cancelar" disabled={!permissao('concluirEtapas')||(contratoBloqueado&&!(permiteRegularizar&&itemDetalhe.status==='CONCLUIDO_PARCIALMENTE'))} onClick={()=>{setMotivoEtapa('');setDevolverPendente({id:itemDetalhe.id,tipo:'conclusao'});}}>Devolver solicitação</BotaoAcaoModal>
          </>}
          {!itemDetalhe.arquivadoEm && !!itemDetalhe.encerramentoSolicitadoEm && <>
            <BotaoAcaoModal intencao="encerrar" disabled={!permissao('encerrarEtapas')||contratoBloqueado} onClick={()=>setAprovarEncerramento(itemDetalhe.id)}>Aprovar encerramento</BotaoAcaoModal>
            <BotaoAcaoModal intencao="cancelar" disabled={!permissao('encerrarEtapas')||contratoBloqueado} onClick={()=>{setMotivoEtapa('');setDevolverPendente({id:itemDetalhe.id,tipo:'encerramento'});}}>Devolver solicitação</BotaoAcaoModal>
          </>}
          {!itemDetalhe.arquivadoEm && !itemDetalhe.reabertoEm && podeReabrirEtapa && !contratoBloqueado && !itemDetalhe.conclusaoSolicitadaEm && !itemDetalhe.encerramentoSolicitadoEm && !['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) && elegibilidade?.podeReabrirDocumentacao && <BotaoAcaoModal intencao="reabrir" onClick={()=>{setMotivoEtapa('');setConfirmarReaberturaEtapa(itemDetalhe.id);}}>Reabrir</BotaoAcaoModal>}
          {!itemDetalhe.arquivadoEm && !itemDetalhe.reabertoEm && !contratoBloqueado && ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) && (['ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) ? podeReabrirEtapaEncerrada : podeReabrirEtapa) && <BotaoAcaoModal intencao="reabrir" onClick={()=>{setMotivoEtapa('');setConfirmarReaberturaEtapa(itemDetalhe.id);}}>Reabrir</BotaoAcaoModal>}
          {!itemDetalhe.arquivadoEm && podeArquivarEtapa && !contratoBloqueado && <BotaoAcaoModal intencao="arquivar" disabled={ocupadoArquivoEtapa} onClick={()=>{setErroAcao('');setConfirmarArquivoEtapa({id:itemDetalhe.id,acao:'arquivar'});}}>Arquivar</BotaoAcaoModal>}
        </MenuAcoesObjeto>}
        {itemDetalhe.arquivadoEm && podeExcluirEtapa && !contratoBloqueado && <BotaoExcluirModal rotulo="Excluir etapa arquivada" disabled={ocupadoArquivoEtapa} onClick={()=>{setErroAcao('');setConfirmarExclusaoEtapa(itemDetalhe.id);}}/>}
      </> : undefined}>
      {itemDetalhe ? <div data-pi-pagina-etapa={detalheEmPagina || undefined} data-pi-entregavel-selecionado={detalheEmPagina && Boolean(destinoSelecao?.id)} className="min-w-0 space-y-3" aria-label={`Detalhes da etapa ${itemDetalhe.nome}`}>
        {erroAcao && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erroAcao}</p>}
        <details hidden={interno && Boolean(destinoSelecao?.id)} open={!interno || undefined} aria-label="Informações da etapa" data-pi-ficha-neutra className="pi-etapa-informacoes pi-identificacao-contrato pi-informacoes-expansiveis min-w-0 text-sm">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">Informações da etapa</summary>
          <dl className="pi-grade-informacoes-contrato grid min-w-0 sm:grid-cols-2">
            {([['Identificador', rotuloCodigoPublico(itemDetalhe.codigoPublico)], ['Código', itemDetalhe.codigo || 'Não informado'], ['Início previsto', dataBR(itemDetalhe.inicioPrevisto)],
              ['Término previsto', dataBR(itemDetalhe.terminoPrevisto)]] as const)
              .map(([rotulo, valor]) => <div className="min-w-0" key={rotulo}><dt className="text-xs text-foreground/60">{rotulo}</dt><dd className="mt-1 break-words font-medium">{valor}</dd></div>)}
          </dl>
          {itemDetalhe.descricao && <div className="border-t border-current/15 pt-3"><p className="text-xs text-foreground/60">Descrição</p><p className="mt-1 whitespace-pre-wrap break-words text-foreground/85">{itemDetalhe.descricao}</p></div>}
          {itemDetalhe.observacoes && <div className="border-t border-current/15 pt-3"><p className="text-xs text-foreground/60">Observações</p><p className="mt-1 whitespace-pre-wrap break-words text-foreground/80">{itemDetalhe.observacoes}</p></div>}
          {permissao('editarEtapas') && <HistoricoEtapa contratoId={contratoId} etapaId={itemDetalhe.id} revisao={revisaoHistorico} />}
        </details>
        {!(interno && destinoSelecao?.id)&&(()=>{const m=dadosEtapa(itemDetalhe);return <section className="pi-indicadores-etapa-v24" aria-label="Indicadores da etapa"><div><h4>Execução</h4><AnelTabela nome="Execução" valorPercentual={m.execucao} percentualInterno cor="text-emerald-600 dark:text-emerald-400"/></div>{([{nome:'Entregáveis',fracao:m.entregaveis,cor:'text-violet-600 dark:text-violet-400'},{nome:'Ocorrências',fracao:m.ocorrencias,cor:'text-violet-600 dark:text-violet-400'},{nome:'Atividades',fracao:m.atividades,cor:'text-emerald-600 dark:text-emerald-400'},{nome:'Evidências',fracao:m.evidencias,cor:'text-teal-600 dark:text-teal-400'}]).map(v=><div key={v.nome}><h4>{v.nome}</h4><AnelTabela {...v} percentualInterno/><span className="text-xs text-foreground/65">{v.fracao.feitas==null||v.fracao.total==null?'—':`${v.fracao.feitas}/${v.fracao.total}`}</span></div>)}<div><h4>Comprovação</h4><ComprovacaoTabela fracao={m.comprovacao} percentual/><span className="text-xs text-foreground/65">{m.comprovacao.feitas==null||m.comprovacao.total==null?'—':`${m.comprovacao.feitas}/${m.comprovacao.total}`}</span></div></section>;})()}
        {!(detalheEmPagina && destinoSelecao?.id) && !contratoBloqueado && !itemDetalhe.arquivadoEm && consultaElegibilidade.erro != null && <p role="alert" className="text-sm text-error-text">Não foi possível verificar as decisões disponíveis. <button type="button" className="underline" onClick={()=>void consultaElegibilidade.atualizar().catch(()=>{})}>Tentar novamente</button></p>}
        {itemDetalhe.avisoVigencia && !(interno && destinoSelecao?.id) && <p role="note" className="rounded-lg border border-amber-500/35 p-3 text-sm">Atenção: as datas previstas desta etapa estão fora da vigência atual do contrato. Nenhuma data foi alterada automaticamente.</p>}
        <EntregaveisDaEtapa vigencia={vigencia} key={itemDetalhe.id} interno={detalheEmPagina} nomeEtapa={itemDetalhe.nome} painelDireitoAberto={painelDireitoAberto} destinoInterno={destinoSelecao?.etapaId === itemDetalhe.id ? destinoSelecao : undefined} onSelecaoInterna={id => setDestinoSelecao(anterior => id ? anterior?.id === id && anterior.etapaId === itemDetalhe.id ? anterior : { etapaId:itemDetalhe.id,id } : undefined)} contextoCadastro={`${numeroContrato ? `Contrato ${numeroContrato} · ` : ""}Etapa ${itemDetalhe.sequencia} — ${itemDetalhe.nome}`} progressoFisico={progressoContrato.progresso?.entregaveis} modoCalculo={modoCalculo} estadoProprioEtapa={identidadeEtapa(itemDetalhe).estado} contratoId={contratoId} etapaId={itemDetalhe.id} dados={entregaveisQuery.dados}
          carregando={entregaveisQuery.carregando} erro={entregaveisQuery.erro} atualizar={entregaveisQuery.atualizar}
          podeCriar={permissao('criarEntregaveis') && !contratoBloqueado && !itemDetalhe.arquivadoEm && !itemDetalhe.conclusaoSolicitadaEm && !itemDetalhe.encerramentoSolicitadoEm && !['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(itemDetalhe.status)} podeEditar={!contratoBloqueado && permissao('editarEntregaveis')}
          podeArquivar={permissao('arquivarEntregaveis')} paiArquivado={Boolean(contratoArquivado || itemDetalhe.arquivadoEm)} paiEmRevisao={Boolean(itemDetalhe.reabertoEm && itemDetalhe.status !== 'CONCLUIDA' && itemDetalhe.status !== 'ENCERRADA')} paiParcial={(!contratoBloqueado || permiteRegularizar) && itemDetalhe.status === 'CONCLUIDO_PARCIALMENTE' && !itemDetalhe.conclusaoSolicitadaEm && !itemDetalhe.encerramentoSolicitadoEm} paiConcluido={contratoBloqueado || Boolean(itemDetalhe.conclusaoSolicitadaEm || itemDetalhe.encerramentoSolicitadoEm) || (['CONCLUIDA', 'CONCLUIDO_PARCIALMENTE', 'ENCERRADA','FINALIZADA'].includes(itemDetalhe.status) && !itemDetalhe.reabertoEm)} permissoes={permissoes}
          dentroModal documental={documentalQuery.dados} atualizarDocumental={() => { notificarAlteracao(); void consulta.atualizar().catch(() => {}); void documentalQuery.atualizar().catch(() => {}); }}
          onHierarquiaAlterada={() => { notificarAlteracao(); void consulta.atualizar().catch(() => {}); void entregaveisQuery.atualizar().catch(() => {}); void documentalQuery.atualizar().catch(() => {}); }}
          onDetalheMudou={aberto=>{setDetalheEntregavelAberto(aberto);if(!aberto&&destinoSelecao?.id&&!detalheEmPagina)fecharModal();}} />
      </div> : <div id={editor === 'nova' ? 'formulario-nova-etapa' : `formulario-etapa-${editor}`}>
        <FormularioEtapa key={editor} inicial={itemEditando} onSalvar={salvar}
          onCancelar={fecharNivelModal} onSalvandoMudou={setSalvandoFormulario} />
      </div>}
    </ModalEtapa></div>}
    {interno && retornoEdicao && itemEditando && podeEditarEtapa && createPortal(<ModalEtapa titulo={`Editar etapa · ${itemEditando.nome}`} contexto="Dados da etapa" larguraFormulario="etapa" camada="edicao" estadoContextual={identidadeEtapa(itemEditando).estado} ocupado={salvandoFormulario} onFechar={()=>voltarParaDetalhe()}>
      <FormularioEtapa key={itemEditando.id} inicial={itemEditando} onSalvar={salvar} onCancelar={()=>voltarParaDetalhe()} onSalvandoMudou={setSalvandoFormulario}/>
    </ModalEtapa>,document.body)}
    {confirmarArquivoEtapa && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples pendencias={erroAcao ? [erroAcao] : []} titulo={confirmarArquivoEtapa.acao === 'arquivar' ? 'Arquivar etapa?' : 'Reativar etapa?'}
        estadoContextual={etapas?.find(e => e.id === confirmarArquivoEtapa.id)?.reabertoEm ? 'revisao' : 'normal'} cancelarVermelho
        descricao={confirmarArquivoEtapa.acao === 'arquivar' ? 'A etapa sairá da visão principal, mas os seus entregáveis, evidências e arquivos ficarão preservados.' : 'A etapa voltará à lista principal no final da ordem de execução.'}
        confirmar={confirmarArquivoEtapa.acao === 'arquivar' ? 'Confirmar arquivamento' : 'Confirmar reativação'}
        ocupado={ocupadoArquivoEtapa} justificativa={motivoEtapa} onJustificativaChange={confirmarArquivoEtapa.acao === 'reativar' ? setMotivoEtapa : undefined} onCancelar={() => { setConfirmarArquivoEtapa(null); setMotivoEtapa(''); }}
        onConfirmar={() => void alterarArquivoEtapa(confirmarArquivoEtapa.id, confirmarArquivoEtapa.acao)} />
    </div>, document.body)}
    {confirmarEncerramentoDireto && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples pendencias={erroAcao ? [erroAcao] : []} titulo="Solicitar encerramento da etapa?" descricao="A etapa será encerrada no estado atual após aprovação."
        confirmar="Solicitar encerramento" ocupado={ocupadoArquivoEtapa}
        justificativa={motivoEtapa} justificativaMinima={15} onJustificativaChange={setMotivoEtapa}
        onCancelar={() => { setConfirmarEncerramentoDireto(null); setMotivoEtapa(''); }}
        onConfirmar={() => void executarEncerramentoDireto()} />
    </div>, document.body)}
    {confirmarFinalizacao && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples pendencias={erroAcao ? [erroAcao] : []} titulo="Encerrar etapa?" descricao="O encerramento será efetivado nesta decisão, sem uma segunda aprovação. O avanço físico permanece inalterado."
        confirmar="Finalizar etapa" ocupado={ocupadoArquivoEtapa} estadoContextual="finalizado" justificativa={motivoEtapa} justificativaMinima={15} onJustificativaChange={setMotivoEtapa}
        onCancelar={()=>{setConfirmarFinalizacao(null);setMotivoEtapa('');}} onConfirmar={()=>void executarFinalizacaoEtapa()} />
    </div>,document.body)}
    {confirmarReaberturaEtapa && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples pendencias={erroAcao ? [erroAcao] : []} titulo={etapas?.find(item => item.id === confirmarReaberturaEtapa)?.status === 'ENCERRADA' ? 'Reabrir etapa encerrada?' : 'Reabrir etapa concluída?'} descricao="A etapa entrará Em revisão. Entregáveis e evidências não serão reabertos automaticamente. O histórico continuará preservado."
        confirmar="Reabrir etapa" ocupado={ocupadoArquivoEtapa} justificativa={motivoEtapa} justificativaMinima={15} onJustificativaChange={setMotivoEtapa} onCancelar={() => { setConfirmarReaberturaEtapa(null); setMotivoEtapa(''); }}
        onConfirmar={() => void executarReaberturaEtapa()} />
    </div>, document.body)}

    {aprovarConclusao && createPortal(<div className="relative z-[180]"><ConfirmacaoSimples pendencias={erroAcao ? [erroAcao] : []} titulo="Aprovar conclusão da etapa?" descricao={etapas?.find(e=>e.id===aprovarConclusao)?.conclusaoParcialSolicitada ? "Confirma a execução física com pendências documentais. O registro ficará auditado." : "Confirma a execução integral após os requisitos verificados. O registro ficará auditado."} confirmar="Aprovar conclusão" confirmacaoRoxa ocupado={ocupadoArquivoEtapa} onCancelar={()=>setAprovarConclusao(null)} onConfirmar={()=>void decidirEtapa('conclusao',aprovarConclusao,'aprovar')}/></div>,document.body)}
    {aprovarEncerramento && createPortal(<div className="relative z-[180]"><ConfirmacaoSimples pendencias={erroAcao ? [erroAcao] : []} titulo="Aprovar encerramento da etapa?" descricao="Confirma o encerramento no estado atual." confirmar="Aprovar encerramento" estadoContextual="finalizado" ocupado={ocupadoArquivoEtapa} onCancelar={()=>setAprovarEncerramento(null)} onConfirmar={()=>void decidirEtapa('encerramento',aprovarEncerramento,'aprovar')}/></div>,document.body)}
    {devolverPendente && createPortal(<div className="relative z-[180]"><ConfirmacaoSimples pendencias={erroAcao ? [erroAcao] : []} titulo="Devolver solicitação da etapa?" descricao="A decisão será devolvida para revisão e a justificativa ficará no histórico." confirmar="Devolver solicitação" ocupado={ocupadoArquivoEtapa} justificativa={motivoEtapa} justificativaMinima={15} onJustificativaChange={setMotivoEtapa} onCancelar={()=>setDevolverPendente(null)} onConfirmar={()=>void decidirEtapa(devolverPendente.tipo,devolverPendente.id,'devolver')}/></div>,document.body)}
    {confirmarConclusaoEtapa && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples pendencias={erroAcao ? [erroAcao] : []} titulo={parcialEtapa ? "Solicitar conclusão parcial da etapa?" : "Solicitar conclusão da etapa?"} descricao="A etapa será enviada para aprovação. A solicitação não conclui automaticamente a execução e será registrada no histórico."
        confirmar={parcialEtapa?"Solicitar conclusão parcial":"Solicitar conclusão"} confirmacaoRoxa ocupado={ocupadoArquivoEtapa} onCancelar={() => setConfirmarConclusaoEtapa(null)}
        onConfirmar={() => void executarConclusaoEtapa()} />
    </div>, document.body)}
    {confirmarExclusaoEtapa && createPortal(<div className="relative z-[180]">
      <ConfirmacaoSimples pendencias={erroAcao ? [erroAcao] : []} titulo="Excluir etapa arquivada?" perigoso ocupado={ocupadoArquivoEtapa}
        descricao="Excluir definitivamente esta etapa de teste, todos os seus entregáveis, evidências, versões e arquivos? A operação não pode ser desfeita."
        confirmar="Excluir definitivamente" onCancelar={() => setConfirmarExclusaoEtapa(null)} onConfirmar={() => void excluirEtapa(confirmarExclusaoEtapa)} />
    </div>, document.body)}
  </section>;
}
