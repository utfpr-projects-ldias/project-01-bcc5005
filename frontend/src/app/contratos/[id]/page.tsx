'use client';
import { modalidadeEncerramento } from '@/lib/modalidade-encerramento';
import { useCamadaInterativa } from '@/lib/camadas-interativas';
import { rotuloPrazoVigencia } from '@/lib/prazo-vigencia';
import { BotaoAcaoModal } from '@/app/components/botoes-modal';
import { NavegacaoContrato, type PaginaContrato } from '../components/navegacao-contrato';
import { ModalConfigurarExecucao } from '@/app/execucao/components/painel-execucao';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';

import { useConsulta } from '@/app/components/provedor-consultas';
import { buscarFuncionarioPorId } from '@/lib/admin-usuarios';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { chaveTexto } from '@/lib/repositorio-consultas';
import { chaveInicioTemporal, EVENTO_AGENDA_OCORRENCIAS_ALTERADA } from '@/lib/inicio-temporal-ocorrencias';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { IndicadorAvancoFinalizado } from '../components/indicador-avanco-finalizado';
import { solicitarConclusaoContrato, consultarElegibilidadeConclusao, arquivarContrato, concluirContrato, finalizarContrato, devolverContratoParaRevisao, fecharRevisaoContrato, reabrirContrato, encerrarContratoAntecipadamente, cancelarContrato, reverterCancelamentoContrato, suspenderContrato, retomarContrato, reativarContrato, consultarElegibilidadeExclusao, excluirContratoArquivado } from '@/lib/contratos';
import { useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { useParams } from 'next/navigation';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useContrato, useAcessoContrato, useResponsaveis, useMutacoesContrato } from '@/hooks/use-contratos';
import { useEtapas } from '@/hooks/use-etapas';
import { useDocumentos } from '@/hooks/use-documentos';
import { consultarHistoricoContrato } from '@/lib/contratos';
import { CHAVES_ENTREGAVEIS, useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import { detalharEntregavel, type Entregavel } from '@/lib/entregaveis';
import { solicitarNavegacaoInterna } from '../components/navegacao-interna';
import { contratoDocumentalmenteConcluido } from '@/lib/situacao-documental-etapa';
import { faseEmRevisao, estadoContextualContrato } from '@/lib/estado-visivel-contrato';
import { dataCivil, MODOS, STATUS, rotuloCodigoPublico, ConfirmacaoVigenciaNecessaria, type DadosContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from '../components/area-contratos';
import { EntregaveisDaEtapa } from '../components/entregaveis-da-etapa';
import { PainelEtapas } from '../components/painel-etapas';
import { PainelDocumentos } from '../components/painel-documentos';
import { ResumoPlanejamentoContrato } from '../components/resumo-planejamento-contrato';
import { SetaPainelContrato } from '../components/painel-lateral-contrato';
import { HistoricoContrato } from '../components/historico-contrato';
import { useEstadoCalendario } from '../components/estado-calendario';
import { CalendarioRegistros } from '../components/calendario-registros';
import { RegistroContratoAvulso, type AlvoRegistroContrato } from '../components/registro-contrato-avulso';
import { NovoRegistroContrato } from '../components/novo-registro-contrato';
import type { OrigemExecucao } from '../components/execucoes-entregavel';
import { AgendaContrato } from '../components/agenda-contrato';
import { EvidenciasConsolidadas } from '../components/evidencias-consolidadas';
import { AtividadesVinculadas } from '../components/atividades-vinculadas';
import { PainelOcorrencias } from '@/app/ocorrencias/components/painel-ocorrencias';
import { estadoEdicaoContrato, prepararEdicaoContrato } from '@/lib/contratos';
import { sincronizarContrato } from '@/lib/sincronizar-contrato';
import { FormularioContrato } from '../components/formulario-contrato';
import { ModalEtapa } from '../components/modal-etapa';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { IconeConclusao, IconeReabertura } from '@/app/components/icones-ciclo-vida';

type Par = [titulo: string, valor: string | null | undefined];
function dataBR(valor: string | null | undefined): string {
  const data = dataCivil(valor);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.split('-').reverse().join('/') : 'Não informado';
}
export default function DetalheContratoPage() {
  const { id } = useParams<{ id: string }>();
  // A rota é infraestrutura interna do iframe; nunca mostra navegação duplicada.
  const painelInterno = useSyncExternalStore(() => () => {},
    () => new URLSearchParams(window.location.search).get('painel') === '1', () => false);
  const [estadoPainel, setEstadoPainel] = useState({compacto:false,aberto:false});
  const abrirPainelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!painelInterno || window.parent === window) return;
    const receber = (evento: MessageEvent) => {
      if (evento.origin !== window.location.origin || evento.source !== window.parent || evento.data?.contratoId !== id || evento.data.tipo !== 'pi:estado-painel-contrato') return;
      if (typeof evento.data.compacto !== 'boolean' || typeof evento.data.aberto !== 'boolean') return;
      setEstadoPainel({compacto:evento.data.compacto,aberto:evento.data.aberto});
      if (evento.data.restaurarFoco === true) {
        requestAnimationFrame(() => { window.focus(); (abrirPainelRef.current ?? document.querySelector<HTMLElement>('[aria-label="Abrir navegação do contrato"]'))?.focus({preventScroll:true}); });
      }
    };
    window.addEventListener('message',receber);
    window.parent.postMessage({tipo:'pi:painel-contrato-pronto',contratoId:id},window.location.origin);
    return () => window.removeEventListener('message',receber);
  },[painelInterno,id]);
  const cache = useRepositorioConsultas();
  const [editarExecucao, setEditarExecucao] = useState(false);
  const [abaContrato, setAbaContrato] = useState<PaginaContrato>('visao');
  const calendario=useEstadoCalendario();
  const [contextoAgenda,setContextoAgenda]=useState<'ocorrencias'|'atividades'|'evidencias'|'manuais'>('ocorrencias');
  const [identificacaoExpandida, setIdentificacaoExpandida] = useState(false);
  const [registroAvulso,setRegistroAvulso]=useState<{alvo:AlvoRegistroContrato;gatilho:HTMLElement|null}|null>(null);
  const [abrirOcorrenciaGeral, setAbrirOcorrenciaGeral] = useState<string | null>(null);
  const [etapaDireta,setEtapaDireta]=useState<{etapaId:string;id:string}|undefined>();
  const destinoInicialAtendido=useRef<string|null>(null);
  const raizContrato=useRef<HTMLDivElement>(null);
  useCamadaInterativa(painelInterno&&abaContrato!=='visao',()=>raizContrato.current,()=>{const voltar=()=>setAbaContrato('visao');if(solicitarNavegacaoInterna(voltar))voltar();},10);
  const [consultaLateral,setConsultaLateral]=useState<Entregavel|null>(null);
  const [entregavelLateral,setEntregavelLateral]=useState<(Entregavel & {origemRegistro?:OrigemExecucao})|null>(null);
  const abrirEntregavelRef = useRef<(id:string, origem?:HTMLElement, origemRegistro?:OrigemExecucao)=>void>(()=>{});
  // Pós-cadastro: revelar a seção documental antes de abrir o modal solicitado.
  // Leitura apenas após montar evita divergência entre SSR e hidratação.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('anexarDocumento') !== 'principal') return;
    // Após o paint de hidratação, sem setState síncrono no corpo do effect.
    const quadro = window.requestAnimationFrame(() => setAbaContrato('documentos'));
    return () => window.cancelAnimationFrame(quadro);
  }, []);
  const [versaoHistorico, setVersaoHistorico] = useState(0);
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  const [acaoArquivado, setAcaoArquivado] = useState<'reativar' | 'excluir' | null>(null);
  const [erroAcaoArquivado, setErroAcaoArquivado] = useState('');
  const [confirmarReabertura, setConfirmarReabertura] = useState(false);
  const [confirmarConclusao, setConfirmarConclusao] = useState(false);
  const [solicitacaoParcial,setSolicitacaoParcial] = useState(false);
  const [confirmarSolicitacao, setConfirmarSolicitacao] = useState(false);
  const [confirmarFinalizacao, setConfirmarFinalizacao] = useState(false);
  const [motivoFinalizacao, setMotivoFinalizacao] = useState('');
  const [confirmarDevolucao, setConfirmarDevolucao] = useState(false);
  const [abrirEncerramento, setAbrirEncerramento] = useState(false);
  const [mudancaSituacaoPendente, setMudancaSituacaoPendente] = useState<DadosContrato | null>(null);
  const [cancelamentoAberto, setCancelamentoAberto] = useState(false);
  const [confirmarReversaoCancelamento, setConfirmarReversaoCancelamento] = useState(false);
  const [confirmarSuspensao, setConfirmarSuspensao] = useState(false);
  const [confirmarRetomada, setConfirmarRetomada] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [motivoEncerramento, setMotivoEncerramento] = useState('');
  const [motivoDecisao, setMotivoDecisao] = useState('');
  const [confirmarFechamentoRevisao, setConfirmarFechamentoRevisao] = useState(false);
  const [editarAberto, setEditarAberto] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState('');
  const identificadorEdicao = useId();
  const marcadorEdicao = useRef<string | null>(null);
  const [alterandoArquivo, setAlterandoArquivo] = useState(false);
  const [erroArquivo, setErroArquivo] = useState('');
  const { dados: perfil, carregando: verificando, erro: erroPerfil } = useMeuPerfil();
  const contratoQuery = useContrato(id, !!perfil?.ativo);
  const acessoQuery = useAcessoContrato(id, !!perfil?.ativo);
  const erroConsulta = erroPerfil || contratoQuery.erro || acessoQuery.erro;
  const erro = erroConsulta instanceof Error ? erroConsulta.message : erroConsulta ? 'Não foi possível consultar o contrato.' : '';
  // Nunca desmontar todo o detalhe durante uma revalidação com dados já confirmados.
  // As mutações atualizam a entrada exata de cache antes da nova consulta, evitando
  // uma piscada em que o cartão recém-reativado volta a parecer arquivado.
  const carregando = verificando || (!!perfil?.ativo && (contratoQuery.carregando || acessoQuery.carregando));
  const contrato = !erroConsulta && perfil?.ativo ? contratoQuery.dados : undefined;
  const contratoIdTemporal = contrato?.id;
  useEffect(() => {
    if (!contratoIdTemporal) return;
    let dia = chaveInicioTemporal(contratoIdTemporal);
    const revisar = () => {
      dia = chaveInicioTemporal(contratoIdTemporal);
      // GETs recalculam a projeção do estado e os atrasos. Abrir o contrato
      // não inicia trabalho que ainda está apenas planejado.
      cache.invalidar(['ocorrencias', contratoIdTemporal]);
      cache.invalidar(['execucao', contratoIdTemporal]);
      cache.invalidar(['entregaveis', 'contrato', contratoIdTemporal]);
      cache.invalidar(['contratos', 'elegibilidade-conclusao', contratoIdTemporal]);
      if (window.parent !== window) window.parent.postMessage({tipo:'pi:estrutura-operacional-atualizada',contratoId:contratoIdTemporal},window.location.origin);
    };
    const agendaAlterada = (evento: Event) => {
      if ((evento as CustomEvent<{contratoId:string}>).detail?.contratoId === contratoIdTemporal) revisar();
    };
    const visivel = () => { if (document.visibilityState === 'visible' && chaveInicioTemporal(contratoIdTemporal) !== dia) revisar(); };
    const relogio = window.setInterval(() => {
      if (chaveInicioTemporal(contratoIdTemporal) !== dia) revisar();
    }, 60_000);
    window.addEventListener(EVENTO_AGENDA_OCORRENCIAS_ALTERADA, agendaAlterada);
    document.addEventListener('visibilitychange', visivel);
    return () => {
      window.removeEventListener(EVENTO_AGENDA_OCORRENCIAS_ALTERADA, agendaAlterada);
      document.removeEventListener('visibilitychange', visivel);
      window.clearInterval(relogio);
    };
  }, [contratoIdTemporal, cache]);
  // O status operacional é independente da comprovação documental.
  const etapasDocumentais = useEtapas(id, Boolean(contrato));
  const entregaveisDocumentais = useEntregaveis(id, Boolean(contrato));
  const resumoDocumental = useResumoDocumentalContrato(id, Boolean(contrato));
  const principalQuery = useDocumentos(id, 'CONTRATO_PRINCIPAL', 1, Boolean(contrato));
  const elegibilidadeQuery = useConsulta(['contratos','elegibilidade-conclusao',id],
    (signal) => consultarElegibilidadeConclusao(id, signal), {habilitada: Boolean(contrato), validadeMs: 8000});
  const principalVerificado = Boolean(Array.isArray(principalQuery.dados?.itens) &&
    principalQuery.dados.itens.some(d => d.verificadoEm && !d.reabertoEm && !d.arquivadoEm));
  // Estados distintos: carregar, não anexado, aguardando verificação, verificado.
  // Um PDF presente, porém reaberto ou não verificado, não autoriza conclusão.
  const principalAtivo = Boolean(principalQuery.dados?.itens?.some(d => !d.arquivadoEm));
  const pendenciaPrincipal = principalQuery.carregando
    ? 'Consultando a verificação do PDF principal...'
    : principalAtivo
      ? 'O PDF principal já está anexado, mas precisa ser verificado (ou reverificado).'
      : 'Nenhum PDF principal ativo foi anexado a este contrato.';
  const historicoRevisao = useConsulta(['contratos', 'historico-revisao', id, contrato?.reabertoEm ?? '', versaoHistorico],
    (signal) => consultarHistoricoContrato(id, signal),
    { habilitada: Boolean(contrato?.reabertoEm), validadeMs: 6_000 });
  const houveAjustes = Boolean(contrato?.reabertoEm && historicoRevisao.dados?.some(evento =>
    new Date(evento.ocorridoEm).getTime() > new Date(contrato.reabertoEm!).getTime() &&
    /(?:EDITAD|ALTERAD|ANEXAD|ARQUIVAD|REATIVAD|VERIFICAD|CONFIGURAD|CRIAD)/.test(evento.acao)));
  const tituloFechamento = houveAjustes ? 'Enviar ajustes para aprovação' : 'Fechar novamente';
  function registrarAtualizacaoHistorico(cacheAtualizado = false) {
    if(!cacheAtualizado){
    cache.invalidar(['contratos', 'historico-revisao', id]);
    cache.invalidar(['contratos', 'elegibilidade-conclusao', id]);
    void elegibilidadeQuery.atualizar().catch(() => {});
    void principalQuery.atualizar().catch(() => {});
    void etapasDocumentais.atualizar().catch(() => {});
    void entregaveisDocumentais.atualizar().catch(() => {});
    void resumoDocumental.atualizar().catch(() => {});
    cache.invalidar(['execucao', id]);
    cache.invalidar(['contratos', 'pendentes']);
    }
    setVersaoHistorico(atual => atual + 1);
    if (window.parent !== window)
      window.parent.postMessage({ tipo: 'pi:estrutura-operacional-atualizada', contratoId: id }, window.location.origin);
  }
  const refAtualizacaoOperacional = useRef(registrarAtualizacaoHistorico);
  useEffect(() => { refAtualizacaoOperacional.current = registrarAtualizacaoHistorico; });
  useEffect(() => {
    function atualizar(evento: Event) {
      const detalhe = (evento as CustomEvent<{ contratoId: string; cacheAtualizado?: boolean }>).detail;
      if (detalhe?.contratoId === id) refAtualizacaoOperacional.current(Boolean(detalhe.cacheAtualizado));
    }
    window.addEventListener('pi:estrutura-operacional-atualizada', atualizar);
    return () => window.removeEventListener('pi:estrutura-operacional-atualizada', atualizar);
  }, [id]);
  const documentalmenteConcluido = Boolean(contrato && contratoDocumentalmenteConcluido(
    { ...contrato, reabertoEm: null }, etapasDocumentais.dados, entregaveisDocumentais.dados, resumoDocumental.dados));
  const administrador = perfil?.perfil === 'ADMINISTRADOR';
  const concluido = Boolean(contrato && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(contrato.status) && !contrato.reabertoEm);
  const finalizado = Boolean(contrato && contrato.status === 'FINALIZADO' && !contrato.reabertoEm);
  const encerrado = Boolean(contrato && contrato.status === 'ENCERRADO' && !contrato.reabertoEm);
  const cancelado = contrato?.status === 'CANCELADO';
  const suspenso = contrato?.status === 'SUSPENSO';
  const podeSuspender = Boolean(contrato && !contrato.conclusaoSolicitadaEm && !contrato.arquivadoEm && !suspenso && ['PLANEJAMENTO','EM_EXECUCAO','EM_ENCERRAMENTO'].includes(contrato.status) && (administrador || acessoQuery.dados?.permissoes?.suspenderContrato));
  const podeRetomar = Boolean(contrato && !contrato.arquivadoEm && suspenso && (administrador || acessoQuery.dados?.permissoes?.retomarContrato));
  const podeCancelarContrato = Boolean(contrato && !contrato.conclusaoSolicitadaEm && !contrato.arquivadoEm && !cancelado &&
    ['PLANEJAMENTO', 'EM_EXECUCAO', 'EM_ENCERRAMENTO'].includes(contrato.status) &&
    (administrador || acessoQuery.dados?.permissoes?.cancelarContrato));
  const podeReverterCancelamento = Boolean(contrato && !contrato.arquivadoEm && cancelado &&
    (administrador || acessoQuery.dados?.permissoes?.reverterCancelamentoContrato));
  const podeDeliberar = Boolean(administrador || acessoQuery.dados?.permissoes?.concluirContrato);
  const podeFinalizar = Boolean(podeDeliberar && elegibilidadeQuery.dados?.podeFinalizar);
  const pendenteConclusao = Boolean(contrato?.conclusaoSolicitadaEm && !contrato.arquivadoEm &&
    !contrato.reabertoEm && !['CONCLUIDO','FINALIZADO','ENCERRADO','SUSPENSO','CANCELADO'].includes(contrato.status));
  const estadoVisualContrato = estadoContextualContrato(contrato ?? undefined, pendenteConclusao);
  const podeSolicitarConclusao = Boolean(contrato && !pendenteConclusao && !contrato.arquivadoEm &&
    (administrador || acessoQuery.dados?.permissoes?.editarContrato) && elegibilidadeQuery.dados?.apto);
  const podeSolicitarParcial = Boolean(contrato && !pendenteConclusao && !contrato.arquivadoEm && (administrador || acessoQuery.dados?.permissoes?.editarContrato) && elegibilidadeQuery.dados?.aptoParcial);
  const motivoIndisponibilidadeConclusao = elegibilidadeQuery.carregando ? 'Verificando requisitos...' :
    elegibilidadeQuery.erro ? 'Falha ao verificar os requisitos da conclusão.' :
    elegibilidadeQuery.dados?.pendencias?.[0] ?? 'A conclusão não está disponível para este contrato.';
  const emRevisao = Boolean(contrato?.reabertoEm && !contrato.arquivadoEm && !suspenso && !cancelado && !encerrado && !pendenteConclusao);
  const podeConcluir = pendenteConclusao;
  const pdfAptoParaDecisao = Boolean(contrato?.encerramentoSolicitado || contrato?.conclusaoParcialSolicitada || principalVerificado);
  const podeFecharRevisao = emRevisao && Boolean(elegibilidadeQuery.dados?.apto);
  const bloqueioOperacional = concluido || encerrado || finalizado || cancelado || suspenso || pendenteConclusao;
  const podeArquivarContrato = Boolean(administrador && contrato && !contrato.arquivadoEm && !pendenteConclusao && !suspenso && !cancelado);
  const podeEncerrar = Boolean(contrato && !contrato.conclusaoSolicitadaEm && !contrato.arquivadoEm && !['CONCLUIDO', 'CONCLUIDO_PARCIALMENTE', 'ENCERRADO', 'FINALIZADO', 'SUSPENSO', 'CANCELADO'].includes(contrato.status) &&
    (administrador || acessoQuery.dados?.permissoes?.encerrarContrato));
  // A etapa pode ser reaberta enquanto o contrato aguarda conclusão explícita;
  // o bloqueio integral só ocorre após o status operacional CONCLUIDO.
  const podeEditar = !erroConsulta && !contrato?.arquivadoEm && !bloqueioOperacional &&
    !!(acessoQuery.dados?.permissoes?.editarContrato ?? acessoQuery.dados?.podeEditar) &&
    !!perfil?.ativo;
  // A autorização das decisões contratuais é granular e independente da edição.
  // Contratos aguardando decisão não oferecem edição de status como atalho
  // para contornar a aprovação. Ações próprias continuam na barra superior.
  const podeAbrirEdicao = !pendenteConclusao && (podeEditar || podeSuspender || podeCancelarContrato ||
    podeReverterCancelamento || podeEncerrar);
  const responsaveisQuery = useResponsaveis(Boolean(editarAberto && administrador && podeEditar));
  // A lista administrativa de funcionários deliberadamente omite a conta ADMIN.
  // A própria conta pode, contudo, constar como responsável cadastral.
  const responsaveisPossiveis = [
    ...(perfil?.ativo && perfil.perfil === 'ADMINISTRADOR' && typeof perfil.id === 'string' && perfil.id.length > 0 ? [{
      id: perfil.id, nome: perfil.nome, email: perfil.email, perfil: perfil.perfil,
      ativo: perfil.ativo, criadoEm: '',
    }] : []),
    ...(responsaveisQuery.dados?.usuarios ?? []),
  ];
  // Evita options com a mesma key quando a consulta retorna a conta ADMIN.
  const responsaveis = responsaveisPossiveis.filter((u, indice, todos) =>
    typeof u.id === 'string' && u.id.length > 0 && todos.findIndex(v => v.id === u.id) === indice);
  const mutacoes = useMutacoesContrato();
  function abrirEdicao() {
    if (!podeAbrirEdicao || !contrato || editarAberto) return;
    // Fecha detalhes do entregável, ocorrência e evidências antes de abrir o
    // editor. Evita formulários em camadas concorrentes dentro do iframe.
    window.dispatchEvent(new Event('pi:fechar-modais-operacionais'));
    const estado = window.history.state;
    const marcador = `${identificadorEdicao}:${contrato.id}`;
    window.history.pushState({ ...(estado && typeof estado === 'object' ? estado : {}), __editarContrato: marcador }, '', window.location.href);
    marcadorEdicao.current = marcador;
    setErroEdicao(''); setEditarAberto(true);
  }
  // A engrenagem do painel lateral solicita a edição ao conteúdo de mesma origem.
  // A autorização continua sendo validada neste componente e pela API.
  useEffect(() => {
    if (!painelInterno) return;
    function receber(evento: MessageEvent) {
      if (evento.origin !== window.location.origin || evento.source !== window.parent) return;
      if (evento.data?.tipo === 'pi:editar-contrato' && evento.data?.contratoId === id) abrirEdicao();
      if (evento.data?.tipo === 'pi:editar-execucao' && evento.data?.contratoId === id && (administrador || acessoQuery.dados?.permissoes?.configurarPesos)) { window.dispatchEvent(new Event('pi:recolher-navegacao-contrato')); window.dispatchEvent(new Event('pi:recolher-lista-entregaveis')); setEditarExecucao(true); }
      if (evento.data?.tipo === 'pi:acao-contrato' && evento.data?.contratoId === id) {
        const acao = evento.data?.acao;
        if ((acao === 'reativar' || acao === 'excluir') && administrador && contrato?.arquivadoEm && !alterandoArquivo) { setMotivoDecisao(''); setErroAcaoArquivado(''); setAcaoArquivado(acao); }
        else if (acao === 'suspender' && podeSuspender) setConfirmarSuspensao(true);
        else if (acao === 'cancelar' && podeCancelarContrato) setCancelamentoAberto(true);
        else if (acao === 'reverter-cancelamento' && podeReverterCancelamento) setConfirmarReversaoCancelamento(true);
        else if (acao === 'retomar' && podeRetomar) setConfirmarRetomada(true);
        else if (acao === 'reabrir' && contrato && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADO'].includes(contrato.status) && (administrador || acessoQuery.dados?.permissoes?.reabrirContrato)) setConfirmarReabertura(true);
        else if (acao === 'encerrar' && podeEncerrar) setAbrirEncerramento(true);
        else if (acao === 'finalizar' && podeFinalizar) setConfirmarFinalizacao(true);
        else if (acao === 'solicitar-conclusao' && podeSolicitarConclusao) {setSolicitacaoParcial(false);setConfirmarSolicitacao(true);}
        else if (acao === 'solicitar-conclusao-parcial' && podeSolicitarParcial) {setSolicitacaoParcial(true);setConfirmarSolicitacao(true);}
        else if (acao === 'arquivar' && podeArquivarContrato) setConfirmarArquivo(true);
        else if (acao === 'aprovar-conclusao' && pendenteConclusao && podeDeliberar) setConfirmarConclusao(true);
        else if (acao === 'devolver-conclusao' && pendenteConclusao && podeDeliberar) setConfirmarDevolucao(true);
      }
    }
    window.addEventListener('message', receber);
    return () => window.removeEventListener('message', receber);
  // Ações do modal contextual sempre usam a autorização e a situação atuais.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painelInterno, id, podeAbrirEdicao, contrato?.id, contrato?.status, contrato?.arquivadoEm, editarAberto,
      podeSuspender, podeCancelarContrato, podeReverterCancelamento, podeRetomar, podeEncerrar, podeArquivarContrato, podeDeliberar, podeFinalizar, podeSolicitarConclusao, podeSolicitarParcial, pendenteConclusao, administrador, alterandoArquivo, acessoQuery.dados?.permissoes?.reabrirContrato, acessoQuery.dados?.permissoes?.configurarPesos]);
  useEffect(() => {
    if (!contrato?.id) return;
    let versao = 0; let controller: AbortController | undefined; let quadroInicial: number | undefined;
    const abrir = (selecionado:string, _origem?:HTMLElement, origemRegistro?:OrigemExecucao) => {
      if (!solicitarNavegacaoInterna(() => abrir(selecionado,_origem,origemRegistro))) return;
      const atual=++versao;
      controller?.abort();controller=new AbortController();
      const sinal=controller.signal;
      void detalharEntregavel(id,selecionado,sinal).then(item=>{
        if (sinal.aborted || atual!==versao || item.id!==selecionado || item.contratoId!==id) return;
        const navegar=()=>{if(sinal.aborted||atual!==versao)return;
        window.dispatchEvent(new Event('pi:recolher-lista-entregaveis'));
        window.dispatchEvent(new Event('pi:recolher-navegacao-contrato'));
        window.dispatchEvent(new Event('pi:fechar-menus'));
        cache.gravar(chaveTexto(CHAVES_ENTREGAVEIS.detalhe(id,item.id)),item);
        setEtapaDireta(undefined);setEntregavelLateral({...item,origemRegistro});
        setAbaContrato('etapas');};
        if(solicitarNavegacaoInterna(navegar)) navegar();
      }).catch(()=>{if(!sinal.aborted && atual===versao) toastAviso('Não foi possível abrir o entregável.');});
    };
    abrirEntregavelRef.current=abrir;
    if(painelInterno&&destinoInicialAtendido.current!==id){
      quadroInicial=requestAnimationFrame(()=>{
        destinoInicialAtendido.current=id;
        const params=new URLSearchParams(window.location.search), etapa=params.get('etapa'), entregavel=params.get('entregavel');
        if(entregavel)abrir(entregavel);
        else if(etapa){setEtapaDireta({etapaId:etapa,id:''});setAbaContrato('etapas');}
      });
    }
    const receber=(evento:MessageEvent)=>{
      if (!painelInterno || evento.origin!==window.location.origin || evento.source!==window.parent || evento.data?.tipo!=='pi:abrir-entregavel' || evento.data?.contratoId!==id || typeof evento.data?.entregavelId!=='string') return;
      if(document.querySelector('[data-tec08-modal]'))return;
      const escolhido=evento.data.entregavelId as string;
      const atual=++versao;controller?.abort();controller=new AbortController();const sinal=controller.signal;
      void detalharEntregavel(id,escolhido,sinal).then(item=>{
        if(sinal.aborted||atual!==versao||item.id!==escolhido||item.contratoId!==id)return;
        cache.gravar(chaveTexto(CHAVES_ENTREGAVEIS.detalhe(id,item.id)),item);
        setConsultaLateral(item);
      }).catch(()=>{if(!sinal.aborted&&atual===versao)toastAviso('Não foi possível abrir o entregável.');});
    };
    const cancelar=()=>{versao++;controller?.abort();};
    window.addEventListener('message',receber);
    window.addEventListener('pi:fechar-modais-operacionais',cancelar);
    return ()=>{if(quadroInicial!==undefined)cancelAnimationFrame(quadroInicial);versao++;controller?.abort();abrirEntregavelRef.current=()=>{};window.removeEventListener('message',receber);window.removeEventListener('pi:fechar-modais-operacionais',cancelar);};
  },[painelInterno,contrato?.id,id,cache]);
  function fecharEdicao() {
    if (salvandoEdicao || alterandoArquivo) return;
    if (confirmarArquivo) { setConfirmarArquivo(false); return; }
    const marcador = marcadorEdicao.current;
    marcadorEdicao.current = null;
    setEditarAberto(false);
    if (marcador && window.history.state?.__editarContrato === marcador) window.history.back();
  }
  useEffect(() => {
    const voltar = () => {
      if (!marcadorEdicao.current || window.history.state?.__editarContrato === marcadorEdicao.current) return;
      marcadorEdicao.current = null;
      setConfirmarArquivo(false);
      setEditarAberto(false);
    };
    window.addEventListener('popstate', voltar);
    return () => window.removeEventListener('popstate', voltar);
  }, []);
  const [impactoVigenciaPendente, setImpactoVigenciaPendente] = useState<ConfirmacaoVigenciaNecessaria | null>(null);
  async function confirmarImpactoVigencia() {
    if (!contrato || !impactoVigenciaPendente || salvandoEdicao) return;
    setSalvandoEdicao(true); setErroEdicao('');
    try {
      const atualizado = await mutacoes.editar(contrato.id, impactoVigenciaPendente.dados, impactoVigenciaPendente.impacto.confirmacao);
      comunicarDecisaoContrato(atualizado, true);
      setImpactoVigenciaPendente(null);
      toastSucesso('Vigência atualizada, mantendo a rastreabilidade das ocorrências.');
      fecharEdicao();
    } catch (erro) {
      setImpactoVigenciaPendente(null);
      setErroEdicao(erro instanceof Error ? erro.message : 'Não foi possível confirmar a vigência.');
    } finally { setSalvandoEdicao(false); }
  }
  async function salvarEdicao(dados: DadosContrato, base: import('@/lib/contratos').Contrato | undefined = contrato) {
    if (!contrato || !base || !podeAbrirEdicao || salvandoEdicao) return;
    setSalvandoEdicao(true); setErroEdicao('');
    try {
      if (estadoEdicaoContrato(base) !== estadoEdicaoContrato(contrato)) throw new Error('O contrato foi alterado após a abertura do formulário. Reabra a edição antes de salvar.');
      if (dados.status === 'ENCERRADO' && contrato.status !== 'ENCERRADO') {
        if (!podeEncerrar) throw new Error('Sem permissão de encerramento antecipado neste contrato.');
        // A decisão nunca transporta mudanças cadastrais silenciosamente.
        const campos = ['numeroContrato', 'orgaoContratante', 'objeto', 'processoAdministrativo',
          'unidadeResponsavel', 'descricao', 'dataAssinatura', 'inicioVigencia', 'terminoVigencia',
          'responsavelInternoId', 'fiscalGestor', 'modoCalculo', 'observacoes'] as const;
        const alterouCadastro = campos.some(chave => {
          const antigo = ['dataAssinatura', 'inicioVigencia', 'terminoVigencia'].includes(chave)
            ? (typeof contrato[chave] === 'string' ? contrato[chave]?.slice(0, 10) : null)
            : contrato[chave];
          return (dados[chave] ?? null) !== (antigo ?? null);
        });
        if (alterouCadastro) throw new Error('Salve as alterações cadastrais antes de encerrar antecipadamente.');
        setSalvandoEdicao(false);
        fecharEdicao();
        setMotivoEncerramento('');
        setAbrirEncerramento(true);
        return;
      }
      if (dados.status === 'CANCELADO' && contrato.status !== 'CANCELADO') {
        if (!podeCancelarContrato) throw new Error('Sem permissão para cancelar este contrato.');
        // Não descartar alterações de cadastro silenciosamente numa decisão especial.
        const campos = ['numeroContrato','orgaoContratante','objeto','processoAdministrativo',
          'unidadeResponsavel','descricao','dataAssinatura','inicioVigencia','terminoVigencia',
          'responsavelInternoId','fiscalGestor','modoCalculo','observacoes'] as const;
        const alterouCadastro = campos.some(chave => {
          const anterior = ['dataAssinatura','inicioVigencia','terminoVigencia'].includes(chave)
            ? (typeof contrato[chave] === 'string' ? contrato[chave]?.slice(0,10) : null)
            : contrato[chave];
          return (dados[chave] ?? null) !== (anterior ?? null);
        });
        if (alterouCadastro) throw new Error('Salve as alterações de cadastro antes de cancelar. A decisão exige confirmação própria.');
        // A decisão exige justificativa e endpoint especializado; nunca um PATCH direto.
        setSalvandoEdicao(false);
        fecharEdicao();
        setCancelamentoAberto(true);
        return;
      }
      if (contrato.status === 'CANCELADO' && dados.status === 'PLANEJAMENTO') {
        if (!podeReverterCancelamento) throw new Error('Sem permissão para reverter cancelamento.');
        setSalvandoEdicao(false);
        fecharEdicao();
        setConfirmarReversaoCancelamento(true);
        return;
      } else if (dados.status === 'SUSPENSO') {
        if (!podeSuspender) throw new Error('Você não tem permissão para suspender este contrato.');
        // Ao alterar situação, não descartar silenciosamente outras edições do formulário.
        const chaves = ['numeroContrato','orgaoContratante','objeto','processoAdministrativo',
          'unidadeResponsavel','descricao','dataAssinatura','inicioVigencia','terminoVigencia',
          'responsavelInternoId','fiscalGestor','modoCalculo','observacoes'] as const;
        const mudou = chaves.some(chave => {
          const anterior = chave === 'dataAssinatura' || chave === 'inicioVigencia' || chave === 'terminoVigencia'
            ? (typeof contrato[chave] === 'string' ? contrato[chave]?.slice(0,10) : null) : contrato[chave];
          return (dados[chave] ?? null) !== (anterior ?? null);
        });
        if (mudou) throw new Error('Salve as outras alterações antes de selecionar Suspenso. A suspensão é uma decisão separada.');
        setSalvandoEdicao(false);
        fecharEdicao();
        setConfirmarSuspensao(true);
        return;
      } else {
        if (!podeEditar) throw new Error('Sem permissão para editar o cadastro deste contrato.');
        // Planejamento e Em execução são fases operacionais comuns. Mesmo ao
        // alterá-las, a revisão permanece aberta; não há confirmação extra.
        // Enviar apenas mudanças efetivas. O PATCH é parcial: não reenviar
        // valores legados acima dos novos limites nem apagar vínculos opcionais.
        const alteracoes = prepararEdicaoContrato(base, dados);
        if (Object.keys(alteracoes).length === 0) {
          toastAviso('Nenhuma alteração identificada no contrato.');
        } else {
          const atualizado = await mutacoes.editar(contrato.id, alteracoes);
          comunicarDecisaoContrato(atualizado, true);
          toastSucesso('Contrato atualizado. Alteração preservada na rastreabilidade.');
        }
      }
      // Navegação permanece no contrato; a consulta é invalidada pela mutação.
      const marcador = marcadorEdicao.current;
      marcadorEdicao.current = null;
      setEditarAberto(false);
      if (marcador && window.history.state?.__editarContrato === marcador) window.history.back();
    } catch (e) {
      if (e instanceof ConfirmacaoVigenciaNecessaria) { setImpactoVigenciaPendente(e); return; }
      setErroEdicao(e instanceof Error ? e.message : 'Falha ao salvar as alterações.');
    }
    finally { setSalvandoEdicao(false); }
  }
  async function executarMudancaSituacao() {
    if (!contrato || !mudancaSituacaoPendente || !podeEditar || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      await mutacoes.editar(contrato.id, mudancaSituacaoPendente);
      registrarAtualizacaoHistorico();
      setMudancaSituacaoPendente(null);
      await contratoQuery.atualizar();
      toastSucesso('Alteração de situação registrada na auditoria.');
    } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Falha ao atualizar situação.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function executarSolicitacaoConclusao() {
    if (!contrato || !(solicitacaoParcial?podeSolicitarParcial:podeSolicitarConclusao) || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await solicitarConclusaoContrato(contrato.id,solicitacaoParcial);
      cache.gravar(chaveTexto(['contratos','detalhe',contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setConfirmarSolicitacao(false);
      toastSucesso('Conclusão solicitada. Aguardando aprovação autorizada.');
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível solicitar conclusão.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function executarConclusao() {
    if (!contrato || contrato.arquivadoEm || !podeConcluir || alterandoArquivo ||
      !(administrador || acessoQuery.dados?.permissoes?.concluirContrato)) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await concluirContrato(contrato.id);
      cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setConfirmarConclusao(false);
      toastSucesso(atualizado.status === 'ENCERRADO' ? 'Encerramento aprovado. Progresso físico preservado.' : 'Contrato concluído após confirmação autorizada.');
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível concluir o contrato.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function executarFinalizacao() {
    if (!contrato || contrato.conclusaoSolicitadaEm || !podeFinalizar || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await finalizarContrato(contrato.id, motivoFinalizacao.trim());
      cache.gravar(chaveTexto(['contratos','detalhe',contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setConfirmarFinalizacao(false);setMotivoFinalizacao('');
      toastSucesso('Encerramento solicitado. Progresso físico preservado.');
    } catch (e) {setErroArquivo(e instanceof Error?e.message:'Não foi possível finalizar o contrato.');}
    finally {setAlterandoArquivo(false);}
  }
  /** Alterações do status especial não passam pela edição administrativa comum. */
  async function executarSuspensao() {
    if (!contrato || !podeSuspender || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await suspenderContrato(contrato.id);
      cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setConfirmarSuspensao(false);
      toastAviso('Contrato suspenso. Prazos e progresso preservados.');
    } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Não foi possível suspender o contrato.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function executarRetomada() {
    if (!contrato || !podeRetomar || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await retomarContrato(contrato.id, motivoDecisao.trim());
      cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setConfirmarRetomada(false); setMotivoDecisao(''); toastSucesso('Contrato retomado na situação anterior à suspensão.');
    } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Não foi possível retomar o contrato.'); }
    finally { setAlterandoArquivo(false); }
  }
  function comunicarDecisaoContrato(atualizado: import('@/lib/contratos').Contrato, jaSincronizado = false) {
    if (!jaSincronizado) sincronizarContrato(cache, atualizado.id);
    setVersaoHistorico(v => v + 1);
    if (painelInterno && window.parent !== window) {
      window.parent.postMessage({ tipo: 'pi:contrato-atualizado', contratoId: id, contrato: atualizado }, window.location.origin);
    }
  }

  async function executarCancelamento(reverter = false) {
    if (!contrato || alterandoArquivo || !(reverter ? podeReverterCancelamento : podeCancelarContrato)) return;
    if (!reverter && (motivoCancelamento.trim().length < 15 || motivoCancelamento.trim().length > 200)) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = reverter
        ? await reverterCancelamentoContrato(contrato.id, motivoDecisao.trim())
        : await cancelarContrato(contrato.id, motivoCancelamento.trim());
      cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setCancelamentoAberto(false); setConfirmarReversaoCancelamento(false); setMotivoCancelamento(''); setMotivoDecisao('');
      (reverter ? toastSucesso : toastAviso)(reverter ? 'Cancelamento revertido. Situação anterior restaurada.' :
        'Contrato cancelado. Histórico preservado.');
    } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Falha na decisão de cancelamento.'); }
    finally { setAlterandoArquivo(false); }
  }

  async function executarEncerramento() {
    if (!contrato || !podeEncerrar || alterandoArquivo || (motivoEncerramento.trim().length < 15 || motivoEncerramento.trim().length > 200)) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await encerrarContratoAntecipadamente(contrato.id, motivoEncerramento.trim());
      cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setAbrirEncerramento(false); setMotivoEncerramento('');
      toastAviso('Encerramento solicitado. Aguarda aprovação.');
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Falha ao solicitar encerramento do contrato.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function executarDevolucaoRevisao() {
    if (!contrato || !podeConcluir || alterandoArquivo ||
      !(administrador || acessoQuery.dados?.permissoes?.concluirContrato)) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await devolverContratoParaRevisao(contrato.id);
      cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setConfirmarDevolucao(false);
      toastAviso(contrato.encerramentoSolicitado ? 'Encerramento devolvido para revisão. Decisão registrada no histórico.' : 'Conclusão devolvida para revisão. Decisão registrada no histórico.');
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível devolver o contrato para revisão.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function executarFechamentoRevisao() {
    if (!contrato || !podeFecharRevisao || !podeEditar || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await fecharRevisaoContrato(contrato.id, motivoDecisao.trim());
      cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setConfirmarFechamentoRevisao(false); setMotivoDecisao('');
      toastSucesso('Revisão encerrada. Solicite a conclusão quando todos os requisitos estiverem atendidos.');
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível encerrar a revisão.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function executarReabertura() {
    if (!contrato || !perfil?.ativo || alterandoArquivo || !(administrador || acessoQuery.dados?.permissoes?.reabrirContrato)) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await reabrirContrato(contrato.id, motivoDecisao.trim());
      cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setConfirmarReabertura(false); setMotivoDecisao('');
      toastSucesso('Contrato reaberto para edição.');
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível reabrir o contrato.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function executarAcaoArquivado() {
    if (!administrador || !contrato?.arquivadoEm || !acaoArquivado || alterandoArquivo) return;
    if (acaoArquivado === 'reativar' && motivoDecisao.trim().length < 15) return;
    setAlterandoArquivo(true); setErroAcaoArquivado('');
    try {
      if (acaoArquivado === 'reativar') {
        const atualizado = await reativarContrato(contrato.id, motivoDecisao.trim());
        cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
        comunicarDecisaoContrato(atualizado);
        toastSucesso('Contrato reativado.');
      } else {
        const elegibilidade = await consultarElegibilidadeExclusao(contrato.id);
        if (!elegibilidade.apto) throw new Error(elegibilidade.motivo ?? 'Exclusão não permitida.');
        const resultado = await excluirContratoArquivado(contrato.id);
        if (!resultado.excluido) throw new Error('Não foi possível excluir o contrato.');
        sincronizarContrato(cache, contrato.id);
        if (resultado.arquivosPendentes > 0) toastAviso('Contrato excluído. Há arquivos pendentes de limpeza.');
        else toastSucesso('Contrato excluído.');
        if (painelInterno && window.parent !== window) window.parent.postMessage({tipo:'pi:contrato-excluido', contratoId:id},window.location.origin);
      }
      setAcaoArquivado(null); setMotivoDecisao('');
    } catch (erro) { setErroAcaoArquivado(erro instanceof Error ? erro.message : 'Não foi possível concluir a operação.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function alterarArquivo() {
    if (!podeArquivarContrato || !contrato || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await arquivarContrato(contrato.id);
      cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setConfirmarArquivo(false);
      {
        const marcador = marcadorEdicao.current;
        marcadorEdicao.current = null;
        setEditarAberto(false);
        if (marcador && window.history.state?.__editarContrato === marcador) window.history.back();
      }
      toastAviso('Contrato arquivado.');
    } catch (erro) {
      setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível atualizar o arquivamento.');
    } finally { setAlterandoArquivo(false); }
  }
  const responsavelId = contrato?.responsavelInternoId ?? null;
  // Administradores podem consultar o nome na API ja existente; outros perfis
  // nao tentam acessar /admin/usuarios nem recebem dados que lhes sao negados.
  const responsavelQuery = useConsulta(
    ['contratos', 'responsavel', responsavelId ?? 'nenhum'],
    () => buscarFuncionarioPorId(responsavelId!),
    { habilitada: Boolean(responsavelId && perfil?.ativo && perfil.perfil === 'ADMINISTRADOR'), validadeMs: 30_000 },
  );
  const responsavelVisivel = responsavelQuery.dados
    ? `${responsavelQuery.dados.nome?.trim() || 'Nome não informado'} — ${responsavelQuery.dados.email}`
    : responsavelId ? 'Responsável interno cadastrado' : null;
  return <div ref={raizContrato} data-pi-aba-secundaria={abaContrato!=='visao'} className="contrato-detalhe-documental" data-arquivado={Boolean(contrato?.arquivadoEm)}
    data-tec08-estado={estadoVisualContrato}><AreaContratos titulo="Detalhes do contrato">
    {erroArquivo && <Aviso erro>{erroArquivo}</Aviso>}
    {carregando ? <Aviso>Carregando contrato...</Aviso> : erro ? <Aviso erro>{erro}</Aviso> : contrato ? <>
      {!painelInterno && <header className="flex min-w-0 items-center gap-3 py-1">
        <Link href="/contratos" data-tec08-voltar-contratos aria-label="Voltar aos contratos" title="Voltar aos contratos"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green/10 text-brand-neon transition-colors hover:bg-brand-green/20 focus-visible:outline-2 focus-visible:outline-brand-neon">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div className="min-w-0 flex-1"><h2 title={contrato.numeroContrato} className={`contrato-detalhe-titulo min-w-0 break-all [overflow-wrap:anywhere] text-lg font-bold ${contrato.arquivadoEm ? 'text-amber-200' : cancelado ? 'text-red-300' : suspenso ? 'text-yellow-200' : finalizado ? 'text-purple-300' : encerrado ? 'text-slate-200' : pendenteConclusao ? 'text-yellow-700 dark:text-yellow-200' : estadoVisualContrato === 'parcial' ? 'text-amber-700 dark:text-amber-200' : concluido ? 'text-violet-300' : emRevisao ? 'text-teal-200' : 'text-brand-neon'}`}>{contrato.numeroContrato}</h2>
          <p className="mt-0.5 text-xs text-foreground/65">Código {rotuloCodigoPublico(contrato.codigoPublico)} · {contrato.arquivadoEm ? 'Arquivado' : encerrado ? 'Encerrado' : emRevisao ? 'Em revisão' : pendenteConclusao ? (contrato.encerramentoSolicitado ? 'Pendente de encerramento' : contrato.conclusaoParcialSolicitada ? 'Pendente de conclusão parcial' : 'Pendente de conclusão') : STATUS[contrato.status]}</p></div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {emRevisao && <><span className="rounded-full border border-teal-500/55 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-foreground">Em revisão</span><span className="rounded-full border border-foreground/20 bg-background px-2.5 py-1 text-xs text-foreground/80">{faseEmRevisao(contrato.status)}</span></>}
          {finalizado && <IndicadorAvancoFinalizado contratoId={contrato.id} />}
          {finalizado && <span className="rounded-full border border-purple-500/60 bg-purple-500/20 px-3 py-1 text-xs font-semibold text-purple-700 dark:text-purple-200">Encerrado — execução parcial</span>}
          {pendenteConclusao && <span className="rounded-full border border-yellow-500/60 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-700 dark:text-yellow-200">{contrato.encerramentoSolicitado ? 'Pendente de encerramento' : contrato.conclusaoParcialSolicitada ? 'Pendente de conclusão parcial' : 'Pendente de conclusão'}</span>}
          <span data-tec08-modo-contrato className="hidden rounded-full bg-brand-green/10 px-3 py-1 text-xs font-medium sm:inline-flex">{MODOS[contrato.modoCalculo]}</span>
        </div>
      </header>}
      <div hidden={painelInterno} className="flex min-w-0 justify-end">
        {!painelInterno && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0" aria-label="Ações do contrato" data-testid="barra-navegacao-contrato">
          {podeEditar && <button type="button" aria-label="Editar contrato" onClick={abrirEdicao}
            disabled={salvandoEdicao || alterandoArquivo}
            className="inline-flex min-h-9 items-center rounded-lg border border-brand-green/45 bg-brand-green/10 px-3 text-xs font-semibold text-foreground hover:bg-brand-green/20 focus-visible:outline-2 focus-visible:outline-brand-green disabled:opacity-50">
            Editar contrato
          </button>}
          {!pendenteConclusao && !concluido && !finalizado && !encerrado && !suspenso && !cancelado && !contrato.arquivadoEm && <MenuAcoesObjeto rotulo="Fechar contrato" disabled={alterandoArquivo} pendenteConclusao={pendenteConclusao}>
           {podeSuspender && <BotaoAcaoModal intencao="suspender" disabled={alterandoArquivo} onClick={() => setConfirmarSuspensao(true)}>⏸ Suspender contrato</BotaoAcaoModal>}
           {podeCancelarContrato && <BotaoAcaoModal intencao="cancelar" disabled={alterandoArquivo} onClick={() => setCancelamentoAberto(true)}>✕ Cancelar contrato</BotaoAcaoModal>}
           {(podeEncerrar || podeFinalizar) && <BotaoAcaoModal intencao="encerrar" disabled={alterandoArquivo || !modalidadeEncerramento(podeEncerrar,podeFinalizar)} onClick={() => modalidadeEncerramento(podeEncerrar,podeFinalizar)==='finalizar'?setConfirmarFinalizacao(true):setAbrirEncerramento(true)}>Solicitar encerramento</BotaoAcaoModal>}
          {!finalizado && !concluido && !encerrado && !cancelado && !suspenso && !contrato.arquivadoEm && !pendenteConclusao && (administrador || acessoQuery.dados?.permissoes?.editarContrato) &&
            <BotaoAcaoModal intencao="solicitar-conclusao" disabled={!podeSolicitarConclusao || alterandoArquivo} title={!podeSolicitarConclusao ? motivoIndisponibilidadeConclusao : 'Solicitar aprovação da conclusão integral'}
              onClick={() => {setSolicitacaoParcial(false);setConfirmarSolicitacao(true);}}>
              Solicitar conclusão
            </BotaoAcaoModal>}
          <BotaoAcaoModal conclusaoParcial intencao="solicitar-conclusao" disabled={!podeSolicitarParcial || alterandoArquivo} onClick={()=>{setSolicitacaoParcial(true);setConfirmarSolicitacao(true);}}>Solicitar conclusão parcial</BotaoAcaoModal>
          {!finalizado && !concluido && !encerrado && !cancelado && !suspenso &&
            !contrato.arquivadoEm && !pendenteConclusao && elegibilidadeQuery.dados && !elegibilidadeQuery.dados.apto &&
            <div role="status" className="max-w-xs rounded-lg border border-amber-500/35 bg-amber-500/[0.06] px-3 py-2 text-xs text-foreground/75">
              <p className="font-semibold">Para solicitar conclusão:</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {(elegibilidadeQuery.dados.pendencias ?? []).map((pendencia, indice) => <li key={`${indice}:${pendencia}`}>{pendencia}</li>)}
              </ul>
            </div>}
          </MenuAcoesObjeto>}
          {contrato.status === 'CONCLUIDO_PARCIALMENTE' && !pendenteConclusao && !contrato.arquivadoEm && (administrador || acessoQuery.dados?.permissoes?.editarContrato) && <BotaoAcaoModal intencao="solicitar-conclusao" disabled={!podeSolicitarConclusao || alterandoArquivo} onClick={() => {setSolicitacaoParcial(false);setConfirmarSolicitacao(true);}}>Solicitar regularização documental</BotaoAcaoModal>}
          {pendenteConclusao && podeDeliberar ? <>
            <button type="button" data-tec08-decisao="rejeitar" onClick={() => setConfirmarDevolucao(true)} disabled={alterandoArquivo}
              aria-label={contrato.encerramentoSolicitado ? "Não aprovar encerramento" : "Não aprovar conclusão"} title="Não aprovar e devolver o contrato para revisão"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-500 bg-red-700 px-2.5 text-xs font-semibold text-white hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-red-300 disabled:opacity-50"><span aria-hidden="true">✕</span> Não aprovar</button>
            <button type="button" data-tec08-decisao="aprovar" onClick={() => setConfirmarConclusao(true)} disabled={alterandoArquivo || !pdfAptoParaDecisao || (!contrato.encerramentoSolicitado && !contrato.conclusaoParcialSolicitada && principalQuery.carregando)}
              title={contrato.encerramentoSolicitado ? 'Aprovar encerramento' : contrato.conclusaoParcialSolicitada ? 'Aprovar conclusão parcial' : principalQuery.carregando ? 'Consultando a situação do PDF principal' : !principalVerificado ? pendenciaPrincipal : 'Aprovar conclusão do contrato'}
              aria-label={contrato.encerramentoSolicitado ? "Aprovar encerramento do contrato" : "Aprovar conclusão do contrato"}
              aria-describedby={!pdfAptoParaDecisao ? 'aviso-pdf-principal-conclusao' : undefined}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 ${pdfAptoParaDecisao ? 'border-violet-500 bg-violet-700 text-white hover:bg-violet-600' : 'border-violet-500/45 bg-violet-950/20 text-violet-200/40 disabled:cursor-not-allowed'}`}><IconeConclusao className="h-4 w-4 shrink-0 text-violet-300" /> Aprovar</button>
          </> : contrato.arquivadoEm ? null : (concluido || encerrado || finalizado) && (administrador || acessoQuery.dados?.permissoes?.reabrirContrato) ? (
            <button type="button" onClick={() => setConfirmarReabertura(true)} disabled={alterandoArquivo}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-400/40 bg-slate-500/10 px-3 text-xs font-semibold text-foreground hover:bg-slate-500/20 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50" aria-label="Reabrir contrato concluído"><IconeReabertura className="h-4 w-4 shrink-0 pi-icone-reabrir-verde" /> Reabrir</button>
          ) : podeFecharRevisao && podeEditar ? (
            <button type="button" data-tec08-decisao="fechamento" aria-label={tituloFechamento} disabled={alterandoArquivo}
              onClick={() => setConfirmarFechamentoRevisao(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-400/55 bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-50"><IconeConclusao className="h-4 w-4 shrink-0 text-violet-400" />{tituloFechamento}</button>
          ) : suspenso ? (
            podeRetomar && <button type="button" onClick={() => setConfirmarRetomada(true)} disabled={alterandoArquivo}
              aria-label="Retomar contrato suspenso" title="Retomar preservando prazos e progresso"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-500/55 bg-amber-500/10 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-500/20 dark:text-amber-100 disabled:opacity-50">⏵ Retomar contrato</button>
          ) : cancelado ? (
            podeReverterCancelamento && <button type="button" onClick={() => setConfirmarReversaoCancelamento(true)} disabled={alterandoArquivo}
              aria-label="Reabrir contrato cancelado" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-500/50 bg-red-950 px-3 text-xs font-semibold text-red-100 hover:bg-red-900 disabled:opacity-50">⟳ Reabrir</button>
          ) : null}
          {/* Controles de manutenção ficam sempre no mesmo bloco da barra superior.
              Encerramento é selecionado no formulário, nunca por botão separado. */}
          {podeArquivarContrato &&
            <button type="button" onClick={() => setConfirmarArquivo(true)} disabled={alterandoArquivo}
              aria-label="Arquivar contrato" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 text-xs font-semibold text-orange-700 dark:text-orange-300 hover:bg-orange-500/20 disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg> Arquivar
            </button>}

        </div>}
      </div>
      <NavegacaoContrato pagina={abaContrato} painelGlobalAberto={estadoPainel.aberto} onPagina={pagina=>{const navegar=()=>{window.dispatchEvent(new Event('pi:fechar-menus'));setAbaContrato(pagina);};if(pagina!==abaContrato&&!solicitarNavegacaoInterna(navegar))return false;navegar();return true;}} acoes={<>{!painelInterno && !contrato.arquivadoEm && !bloqueioOperacional && (administrador||acessoQuery.dados?.permissoes?.configurarPesos) && <button type="button" className="rounded-lg px-3 py-2 text-sm hover:bg-current/10" onClick={()=>setEditarExecucao(true)}>Editar execução</button>}{painelInterno && estadoPainel.compacto && <button ref={abrirPainelRef} type="button" aria-label="Abrir painel do contrato" title="Abrir painel do contrato" aria-haspopup="dialog" aria-expanded={estadoPainel.aberto} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground/80 hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current" onClick={()=>{window.dispatchEvent(new Event('pi:recolher-lista-entregaveis'));window.dispatchEvent(new Event('pi:recolher-navegacao-contrato'));window.parent.postMessage({tipo:'pi:abrir-painel-contrato',contratoId:id},window.location.origin);}}><SetaPainelContrato direcao="esquerda" /></button>}</>}>
      {pendenteConclusao && podeDeliberar && !pdfAptoParaDecisao &&
        <div id="aviso-pdf-principal-conclusao" data-testid="aviso-pdf-principal-conclusao" role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">{principalQuery.carregando ? 'Consultando o PDF principal.' : 'Devolva a solicitação para revisão antes de regularizar o PDF principal e solicitar novamente.'}</p>
          </div>
          <button type="button" onClick={() => setAbaContrato('documentos')}
            className="shrink-0 rounded-lg border border-amber-300/70 bg-amber-300/15 px-3 py-2 text-xs font-semibold text-amber-100 hover:border-amber-200 hover:bg-amber-300/25 focus-visible:outline-2 focus-visible:outline-amber-200">
            Ir para Documentos
          </button>
        </div>}
      <div className="min-w-0">
        <div className="min-w-0 space-y-4">
          <section data-tec08-aba-contrato role="region" id="painel-visao" aria-labelledby="tab-visao" hidden={abaContrato !== 'visao'} className={abaContrato !== 'visao' ? 'hidden' : 'space-y-4'}>
            {!pendenteConclusao && !principalQuery.carregando && !principalVerificado && (documentalmenteConcluido || etapasDocumentais.dados?.some(etapa => etapa.status === 'CONCLUIDA')) &&
              <div role="status" data-testid="aviso-pdf-principal-visao" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/45 bg-amber-500/10 p-3 text-sm text-foreground">
                <p className="min-w-0 flex-1">{principalAtivo ? 'Falta verificar o PDF principal.' : 'Falta anexar e verificar o PDF principal.'}</p>
                <button type="button" onClick={() => setAbaContrato('documentos')} className="shrink-0 rounded-lg border border-amber-500/60 px-3 py-2 font-semibold text-foreground hover:bg-amber-500/15">Ir para Documentos</button>
              </div>}
            {!painelInterno && <section data-tec08-secao-contrato data-pi-informacoes-neutras className="rounded-xl border border-current/20 p-3" aria-label="Planejamento do contrato">
              <ResumoPlanejamentoContrato contratoId={contrato.id} variante="detalhe" contratoArquivado={Boolean(contrato.arquivadoEm)} contratoSuspenso={suspenso} contratoEmRevisao={emRevisao} contratoEncerrado={encerrado} contratoConcluido={concluido || pendenteConclusao} contratoCancelado={cancelado} />
            </section>}

            <section data-pi-visao-geral aria-label="Visão geral do contrato" className="min-w-0 space-y-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-foreground/65">Situação contratual</span>
                <span className="pi-status-contextual text-xs font-medium">{contrato.arquivadoEm?'Arquivado':encerrado?'Encerrado':emRevisao?`Em revisão · ${faseEmRevisao(contrato.status)}`:pendenteConclusao?(contrato.encerramentoSolicitado?'Pendente de encerramento':contrato.conclusaoParcialSolicitada?'Pendente de conclusão parcial':'Pendente de conclusão'):STATUS[contrato.status]}</span>
              </header>
              <dl className="pi-faixa-vigencia grid gap-x-5 gap-y-3">
                {([['Contratante',contrato.orgaoContratante],['Vigência',`${dataBR(contrato.inicioVigencia)} — ${dataBR(contrato.terminoVigencia)}`],['Responsável',responsavelQuery.dados?.nome?.trim() || responsavelVisivel],['Prazo restante',rotuloPrazoVigencia(contrato.terminoVigencia,Boolean(contrato.arquivadoEm||concluido||encerrado||finalizado||cancelado))]] as Par[]).map(([rotulo,valor])=><div key={rotulo} className="min-w-0"><dt className="text-xs text-foreground/60">{rotulo}</dt><dd className="mt-1 break-words text-sm font-medium">{valor||'Não informado'}</dd></div>)}
              </dl>
              <details open={identificacaoExpandida} onToggle={e=>setIdentificacaoExpandida(e.currentTarget.open)} className="pi-identificacao-contrato pi-informacoes-expansiveis" data-pi-informacoes-neutras>
                <summary className="cursor-pointer text-sm font-semibold text-foreground">Informações do contrato</summary>
                <dl className="pi-grade-informacoes-contrato mt-3 grid min-w-0 sm:grid-cols-2">
                  {([['Objeto contratual',contrato.objeto],['Número',contrato.numeroContrato],['Código',rotuloCodigoPublico(contrato.codigoPublico)],['Processo administrativo',contrato.processoAdministrativo],['Unidade responsável',contrato.unidadeResponsavel],['Assinatura',dataBR(contrato.dataAssinatura)],['Fiscal/gestor público',contrato.fiscalGestor],['Cálculo',MODOS[contrato.modoCalculo]],['Descrição',contrato.descricao],['Observações',contrato.observacoes]] as Par[]).map(([rotulo,valor])=><div key={rotulo} className={`min-w-0 ${['Objeto contratual','Descrição','Observações'].includes(rotulo)?'sm:col-span-2':''}`}><dt className="text-xs text-foreground/60">{rotulo}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{valor||'Não informado'}</dd></div>)}
                </dl>
              </details>
              <div className="pi-agenda-contexto flex flex-wrap items-center gap-2" role="group" aria-label="Registros do contrato">{(['ocorrencias','atividades','evidencias','manuais'] as const).map(c=><button key={c} type="button" aria-pressed={contextoAgenda===c} className="pi-filtro-agenda" onClick={()=>setContextoAgenda(c)}>{c==='ocorrencias'?'Ocorrências':c==='atividades'?'Atividades':c==='evidencias'?'Evidências':'Execução manual'}</button>)}<div className="ml-auto"><NovoRegistroContrato contratoId={contrato.id} contexto={contextoAgenda} bloqueado={bloqueioOperacional} abrir={(eid,origem,gatilho)=>setRegistroAvulso({alvo:{tipo:'CADASTRO',entregavelId:eid,origem},gatilho:gatilho??null})}/></div></div>
              {abaContrato==='visao'&&<><CalendarioRegistros abrirRegistroContrato={(alvo,gatilho)=>setRegistroAvulso({alvo,gatilho})} calendario={calendario} contratoId={contrato.id} contexto={contextoAgenda} permissoes={bloqueioOperacional?undefined:acessoQuery.dados?.permissoes} abrir={(eid,origem)=>abrirEntregavelRef.current(eid,origem)} abrirOcorrencia={setAbrirOcorrenciaGeral}/>
              {contextoAgenda==='ocorrencias'&&<AgendaContrato somenteLista calendario={calendario} contratoId={contrato.id} abrirOcorrencia={setAbrirOcorrenciaGeral}/>}
              {contextoAgenda==='atividades'&&<AtividadesVinculadas contratoId={contrato.id} estadoContextual={estadoVisualContrato} somenteLeitura={bloqueioOperacional} ocultarAcessoDiario ocultarCadastro listaCompacta onAbrirEntregavel={(eid,origem)=>abrirEntregavelRef.current(eid,origem)} onAbrirOcorrencia={setAbrirOcorrenciaGeral}/>}
              {contextoAgenda==='evidencias'&&<EvidenciasConsolidadas abrirEvidencia={(entregavelId,id,gatilho)=>setRegistroAvulso({alvo:{tipo:'EVIDENCIA',entregavelId,id},gatilho})} listaCompacta contratoId={contrato.id}/>}</>}
              {abaContrato==='visao'&&<HistoricoContrato contratoId={contrato.id} numeroContrato={contrato.numeroContrato} versao={`${contrato.status}:${contrato.reabertoEm??''}:${versaoHistorico}`}/>}
            </section>


          </section>
          <section data-tec08-aba-contrato role="region" id="painel-etapas" aria-labelledby="tab-etapas" hidden={abaContrato !== 'etapas'} className={abaContrato !== 'etapas' ? 'hidden' : 'space-y-4'}>
            <PainelEtapas vigencia={contrato} interno onFecharConsultaDireta={()=>{if(painelInterno&&new URLSearchParams(window.location.search).get("consultaDireta")==="1")window.parent.postMessage({tipo:"pi:fechar-consulta-direta",contratoId:id},window.location.origin);}} numeroContrato={contrato.numeroContrato} destinoInterno={entregavelLateral ?? etapaDireta} painelDireitoAberto={estadoPainel.aberto} key={`etapas:${contrato.id}`} contratoId={contrato.id} modoCalculo={contrato.modoCalculo} habilitado={!!perfil?.ativo}
              podeGerenciar={podeEditar} permissoes={acessoQuery.dados?.permissoes} contratoArquivado={Boolean(contrato.arquivadoEm)} contratoConcluido={concluido} contratoParcial={contrato.status === 'CONCLUIDO_PARCIALMENTE'} contratoPendenteConclusao={pendenteConclusao} contratoEmRevisao={emRevisao} contratoEncerrado={encerrado}
              ordemEtapasBloqueada={Boolean(contrato.ordemEtapasBloqueada)} contratoSuspenso={suspenso} contratoCancelado={cancelado}
              onAuditoriaAlterada={registrarAtualizacaoHistorico}
              onOrdemAlterada={async () => { registrarAtualizacaoHistorico(); await contratoQuery.atualizar(); }} />
          </section>
          <section data-tec08-aba-contrato role="region" id="painel-documentos" aria-labelledby="tab-documentos" hidden={abaContrato !== 'documentos'} className={abaContrato !== 'documentos' ? 'hidden' : 'space-y-4'}>
            <h2 className="text-base font-semibold">Documentos contratuais</h2>
            <PainelDocumentos key={`documentos:${contrato.id}`} contratoId={contrato.id} estadoContextual={estadoVisualContrato} onDocumentoAlterado={registrarAtualizacaoHistorico} habilitado={!!perfil?.ativo} somenteLeitura={Boolean(contrato.arquivadoEm || bloqueioOperacional)} permitirRegularizarPrincipal={Boolean(!pendenteConclusao && !contrato.arquivadoEm && !['CANCELADO','SUSPENSO','ENCERRADO','CONCLUIDO','FINALIZADO'].includes(contrato.status))}
              podeAnexar={Boolean((administrador || acessoQuery.dados?.permissoes?.anexarDocumentos))}
              podeEditarMetadados={Boolean((administrador || acessoQuery.dados?.permissoes?.editarDocumentos))}
              podeArquivarDocumentos={Boolean((administrador || acessoQuery.dados?.permissoes?.arquivarDocumentos))}
              podeReativarDocumentos={Boolean((administrador || acessoQuery.dados?.permissoes?.reativarDocumentos))}
              podeExcluirDocumentosArquivados={Boolean((administrador || acessoQuery.dados?.permissoes?.excluirDocumentosArquivados))}
              podeArquivarPrincipal={Boolean((administrador || acessoQuery.dados?.permissoes?.arquivarDocumentoPrincipal))}
              podeReativarPrincipal={Boolean((administrador || acessoQuery.dados?.permissoes?.reativarDocumentoPrincipal))}
              podeExcluirPrincipal={Boolean((administrador || acessoQuery.dados?.permissoes?.excluirDocumentoPrincipal))}
              podeVerificarDocumentos={Boolean(administrador || acessoQuery.dados?.permissoes?.verificarDocumentos)}
              podeReabrirDocumentos={Boolean(administrador || acessoQuery.dados?.permissoes?.reabrirDocumentos)}
              podeVerificarPrincipal={Boolean(administrador || acessoQuery.dados?.permissoes?.verificarDocumentoPrincipal)}
              podeReabrirPrincipal={Boolean(administrador || acessoQuery.dados?.permissoes?.reabrirDocumentoPrincipal)} />
          </section>
        </div>

      </div>

      </NavegacaoContrato>
      {consultaLateral&&(()=>{const etapa=etapasDocumentais.dados?.find(e=>e.id===consultaLateral.etapaId); const bloqueada=bloqueioOperacional||!etapa||Boolean(etapa.arquivadoEm||etapa.conclusaoSolicitadaEm||etapa.encerramentoSolicitadoEm)||(['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(etapa.status)&&!etapa.reabertoEm);
        return <EntregaveisDaEtapa vigencia={contrato} key={`consulta-lateral:${consultaLateral.id}`} somenteDetalheId={consultaLateral.id} dentroModal contratoId={contrato.id} etapaId={consultaLateral.etapaId} modoCalculo={contrato.modoCalculo} dados={entregaveisDocumentais.dados??[consultaLateral]} carregando={false} atualizar={entregaveisDocumentais.atualizar} documental={resumoDocumental.dados} permissoes={acessoQuery.dados?.permissoes} podeEditar={!bloqueada&&podeEditar} podeArquivar={!bloqueada&&Boolean(acessoQuery.dados?.permissoes?.arquivarEntregaveis)} paiArquivado={Boolean(contrato.arquivadoEm||etapa?.arquivadoEm)} paiConcluido={bloqueada} paiParcial={Boolean(!contrato.arquivadoEm&&!pendenteConclusao&&['PLANEJAMENTO','EM_EXECUCAO','EM_ENCERRAMENTO','CONCLUIDO_PARCIALMENTE'].includes(contrato.status)&&etapa&&!etapa.arquivadoEm&&!etapa.conclusaoSolicitadaEm&&!etapa.encerramentoSolicitadoEm&&etapa.status==='CONCLUIDO_PARCIALMENTE')} paiEmRevisao={Boolean(etapa?.reabertoEm)} onDetalheMudou={aberto=>{if(!aberto)setConsultaLateral(null);}} onHierarquiaAlterada={registrarAtualizacaoHistorico} atualizarDocumental={()=>{void resumoDocumental.atualizar().catch(()=>{});}}/>;
      })()}
      {registroAvulso&&<RegistroContratoAvulso key={`${registroAvulso.alvo.tipo}:${registroAvulso.alvo.entregavelId}:${registroAvulso.alvo.tipo==='MANUAL'?registroAvulso.alvo.chave:registroAvulso.alvo.tipo==='EVIDENCIA'?registroAvulso.alvo.id:registroAvulso.alvo.origem}`} contratoId={contrato.id} alvo={registroAvulso.alvo} gatilho={registroAvulso.gatilho} bloqueado={bloqueioOperacional} paiArquivado={Boolean(contrato.arquivadoEm)} contratoParcial={contrato.status==='CONCLUIDO_PARCIALMENTE'&&!pendenteConclusao} permissoes={acessoQuery.dados?.permissoes} administrador={administrador} onFechar={()=>setRegistroAvulso(null)}/>}
      {abrirOcorrenciaGeral&&<PainelOcorrencias key={abrirOcorrenciaGeral} contratoId={contrato.id} abrirOcorrenciaId={abrirOcorrenciaGeral} aoFecharOcorrenciaSelecionada={()=>setAbrirOcorrenciaGeral(null)} somenteLeitura={bloqueioOperacional} somenteDetalhe embutido/>}
      {editarExecucao && <ModalConfigurarExecucao contratoId={contrato.id} numeroContrato={contrato.numeroContrato} estadoContextual={estadoVisualContrato} onFechar={()=>setEditarExecucao(false)}/>}
    </> : <Aviso erro>Contrato não encontrado.</Aviso>}
    {editarAberto && contrato && podeAbrirEdicao && <ModalEtapa titulo={`Editar contrato · ${contrato.numeroContrato}`}
      estadoContextual={estadoVisualContrato}
      contexto="Dados administrativos do contrato" larguraFormulario="contrato" textoFechar="Fechar ×" rotuloFechar="Fechar edição do contrato"
      bloqueadoPorSubmodal={confirmarArquivo} ocupado={salvandoEdicao || alterandoArquivo} onFechar={fecharEdicao}>
      <div data-tec08-formulario-contextual className="space-y-4" data-testid="modal-edicao-contrato">
        {erroEdicao && <Aviso erro>{erroEdicao}</Aviso>}
        {administrador && responsaveisQuery.carregando && <p role="status" className="text-sm text-foreground/70">Carregando responsáveis...</p>}
        {Boolean(responsaveisQuery.erro) && <Aviso erro>Não foi possível consultar os responsáveis. Nenhuma atribuição será alterada automaticamente.</Aviso>}
        <FormularioContrato key={contrato.id} inicial={contrato} responsaveis={responsaveis}
          onSalvar={salvarEdicao} onSalvarComBase={salvarEdicao} onCancelar={fecharEdicao} salvando={salvandoEdicao}
          podeDefinirResponsavel={administrador && !responsaveisQuery.erro}
          podeSuspender={podeSuspender} podeCancelar={podeCancelarContrato} podeReverter={podeReverterCancelamento} podeEncerrar={podeEncerrar}
          somenteSituacao={!podeEditar} />
      </div>
    </ModalEtapa>}
    {impactoVigenciaPendente && <ConfirmacaoSimples
      titulo="Confirmar mudança de vigência?"
      descricao={`${impactoVigenciaPendente.impacto.total} ocorrência(s) e ${impactoVigenciaPendente.impacto.planos} planejamento(s) serão preservados; ${impactoVigenciaPendente.impacto.preservadasFora} registro(s) históricos ficarão fora da nova vigência. Nenhuma data será alterada automaticamente.`}
      confirmar="Confirmar alteração" ocupado={salvandoEdicao} estadoContextual="normal"
      onCancelar={() => setImpactoVigenciaPendente(null)} onConfirmar={() => void confirmarImpactoVigencia()} />}
    {mudancaSituacaoPendente && contrato && <ConfirmacaoSimples
      titulo="Confirmar mudança de situação?"
      descricao={mudancaSituacaoPendente.retomarOperacao ? `Encerrar a revisão e continuar em ${STATUS[mudancaSituacaoPendente.status]}?` : `Alterar de ${STATUS[contrato.status]} para ${STATUS[mudancaSituacaoPendente.status]}?`}
      confirmar="Confirmar alteração" cancelarVermelho={false} ocupado={alterandoArquivo}
      onCancelar={() => setMudancaSituacaoPendente(null)} onConfirmar={() => void executarMudancaSituacao()} />}
    {confirmarFinalizacao && contrato && <ModalEtapa titulo="Solicitar encerramento do contrato" contexto="Fechamento administrativo parcial" estadoContextual="finalizado" ocupado={alterandoArquivo} onFechar={() => setConfirmarFinalizacao(false)}>
      <div className="space-y-4 text-sm"><p>Para finalizar, todas as etapas e entregáveis precisam estar resolvidos, com ao menos um encerramento administrativo. A porcentagem real continuará visível e não passará automaticamente a 100%.</p>
        <label className="block font-semibold">Justificativa (15 a 200 caracteres)<textarea rows={4} maxLength={200} value={motivoFinalizacao} onChange={e => setMotivoFinalizacao(e.target.value)} className="mt-2 w-full rounded-lg border border-purple-500/40 bg-background p-3" /></label>
        <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border px-4 py-2" onClick={() => setConfirmarFinalizacao(false)}>Cancelar</button><button type="button" disabled={alterandoArquivo || motivoFinalizacao.trim().length < 15} className="rounded-lg bg-purple-700 px-4 py-2 font-semibold text-white disabled:opacity-40" onClick={() => void executarFinalizacao()}>Solicitar encerramento</button></div>
      </div>
    </ModalEtapa>}
    {abrirEncerramento && contrato && <ModalEtapa titulo="Solicitar encerramento do contrato"
      contexto="Contrato" estadoContextual="encerrado" ocupado={alterandoArquivo} onFechar={() => setAbrirEncerramento(false)}>
      <div className="space-y-4">
        {erroArquivo && <p role="alert" className="text-error-text">{erroArquivo}</p>}
        <p className="text-sm text-foreground/80">O contrato será encerrado no estado atual após aprovação.</p>
        <label className="block space-y-2 text-sm font-medium" htmlFor="motivo-encerramento">Justificativa obrigatória (15 a 200 caracteres)
          <textarea id="motivo-encerramento" value={motivoEncerramento} maxLength={200} rows={4}
            onChange={e => setMotivoEncerramento(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-500/60 bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-slate-300" />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setAbrirEncerramento(false)} disabled={alterandoArquivo}
            className="rounded-lg border border-foreground/30 px-4 py-2 text-sm">Cancelar</button>
          <button type="button" onClick={() => void executarEncerramento()}
            disabled={alterandoArquivo || motivoEncerramento.trim().length < 15}
            className="rounded-lg border border-slate-500 bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Solicitar encerramento</button>
        </div>
      </div>
    </ModalEtapa>}
    {cancelamentoAberto && contrato && <ModalEtapa estadoContextual="cancelado" titulo="Cancelar contrato"
      contexto="Decisão administrativa com permissão independente" ocupado={alterandoArquivo}
      onFechar={() => { if (!alterandoArquivo) setCancelamentoAberto(false); }}>
      <div className="space-y-4">
        <p className="text-sm text-foreground/80">Cancelar não arquiva e não conclui o contrato. Etapas, entregáveis e evidências permanecem no histórico, sem alteração automática.</p>
        <label htmlFor="motivo-cancelamento" className="block space-y-2 text-sm font-medium">
          Justificativa obrigatória (15 a 200 caracteres)
          <textarea id="motivo-cancelamento" rows={4} maxLength={200}
            value={motivoCancelamento} onChange={e => setMotivoCancelamento(e.target.value)}
            className="mt-2 w-full rounded-lg border border-red-500/65 bg-background p-3 text-foreground focus-visible:outline-2 focus-visible:outline-red-400" />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={alterandoArquivo} onClick={() => setCancelamentoAberto(false)}
            className="rounded-lg border border-foreground/30 px-3 py-2 text-sm">Voltar</button>
          <button type="button" disabled={alterandoArquivo || motivoCancelamento.trim().length < 15}
            onClick={() => void executarCancelamento(false)}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-300">Confirmar cancelamento</button>
        </div>
      </div>
    </ModalEtapa>}
    {confirmarRetomada && contrato && <ConfirmacaoSimples
      titulo="Reabrir contrato suspenso?"
      descricao="O contrato retornará à situação registrada antes da suspensão. Prazos, evidências e histórico serão preservados."
      confirmar="Confirmar retomada" cancelarVermelho={false} ocupado={alterandoArquivo}
      justificativa={motivoDecisao} onJustificativaChange={setMotivoDecisao}
      onCancelar={() => setConfirmarRetomada(false)}
      onConfirmar={() => void executarRetomada()} />}
    {confirmarSuspensao && contrato && <ConfirmacaoSimples
      titulo="Suspender contrato?"
      descricao="Suspender interrompe as operações normais, mas preserva os prazos, o planejamento, as evidências e o progresso. A retomada exige permissão separada."
      confirmar="Confirmar suspensão" cancelarVermelho={false} ocupado={alterandoArquivo}
      onCancelar={() => setConfirmarSuspensao(false)} onConfirmar={() => void executarSuspensao()} />}
    {confirmarReversaoCancelamento && contrato && <ConfirmacaoSimples
      titulo="Reabrir contrato cancelado?"
      descricao="Esta ação exige permissão específica. O contrato voltará a Planejamento, sem apagar a decisão anterior da auditoria."
      confirmar="Reabrir contrato" cancelarVermelho={false} ocupado={alterandoArquivo}
      justificativa={motivoDecisao} onJustificativaChange={setMotivoDecisao}
      onCancelar={() => setConfirmarReversaoCancelamento(false)} onConfirmar={() => void executarCancelamento(true)} />}
    {confirmarSolicitacao && contrato && <ConfirmacaoSimples
      titulo={solicitacaoParcial?"Solicitar conclusão parcial do contrato?":"Solicitar conclusão do contrato?"}
      descricao={solicitacaoParcial?"A execução física está integral, mas há documentação pendente. O pedido exige aprovação autorizada.":"A execução e os documentos obrigatórios foram verificados. O pedido ficará aguardando aprovação autorizada."}
      confirmar={solicitacaoParcial?"Solicitar conclusão parcial":"Solicitar conclusão"} confirmacaoRoxa ocupado={alterandoArquivo} cancelarVermelho={false}
      onCancelar={() => setConfirmarSolicitacao(false)} onConfirmar={() => void executarSolicitacaoConclusao()} />}
    {confirmarConclusao && contrato && <ConfirmacaoSimples
      titulo={contrato.encerramentoSolicitado ? "Aprovar encerramento do contrato?" : "Aprovar conclusão do contrato?"}
      descricao={contrato.encerramentoSolicitado ? `Justificativa: ${contrato.motivoEncerramento ?? "—"}` : contrato.conclusaoParcialSolicitada ? "Aprovar reconhece a execução física integral, mantendo as pendências documentais. A decisão será auditada." : "Aprovar confirma a conclusão integral. É obrigatório ter PDF principal ativo e verificado, etapas e entregáveis concluídos. A decisão será auditada."}
      confirmar={contrato.encerramentoSolicitado ? "Aprovar encerramento" : "Aprovar conclusão"} confirmacaoRoxa cancelarVermelho ocupado={alterandoArquivo}
      onCancelar={() => setConfirmarConclusao(false)} onConfirmar={() => void executarConclusao()} />}
    {confirmarDevolucao && contrato && <ConfirmacaoSimples
      titulo={contrato.encerramentoSolicitado ? "Não aprovar o encerramento do contrato?" : "Não aprovar a conclusão do contrato?"}
      descricao="O contrato voltará para revisão. As informações, etapas, entregáveis e documentos serão preservados. Deseja continuar?"
      confirmar="Não aprovar e devolver para revisão" perigoso cancelarVermelho={false} ocupado={alterandoArquivo}
      onCancelar={() => setConfirmarDevolucao(false)} onConfirmar={() => void executarDevolucaoRevisao()} />}
    {confirmarFechamentoRevisao && contrato && <ConfirmacaoSimples
      titulo="Encerrar revisão e encaminhar para aprovação?"
      descricao="Encerrar a revisão e encaminhar o contrato para aprovação? As alterações serão preservadas."
      confirmar={tituloFechamento} confirmacaoRoxa cancelarVermelho={false} ocupado={alterandoArquivo}
      justificativa={motivoDecisao} onJustificativaChange={setMotivoDecisao}
      onCancelar={() => setConfirmarFechamentoRevisao(false)} onConfirmar={() => void executarFechamentoRevisao()} />}
    {confirmarReabertura && contrato && <ConfirmacaoSimples
      titulo={finalizado ? 'Reabrir contrato finalizado?' : encerrado ? 'Reabrir contrato encerrado?' : 'Reabrir contrato concluído?'}
      descricao={`O contrato deixará de ficar ${finalizado ? 'Finalizado' : encerrado ? 'Encerrado' : 'Concluído'} e passará para Em revisão. Etapas, entregáveis e evidências continuarão no estado atual e poderão ser reabertos separadamente. O histórico será preservado.`}
      confirmar="Reabrir contrato" estadoContextual={finalizado ? 'finalizado' : encerrado ? 'encerrado' : 'concluido'} preservarCorOrigem ocupado={alterandoArquivo} justificativa={motivoDecisao} onJustificativaChange={setMotivoDecisao} onCancelar={() => setConfirmarReabertura(false)}
      onConfirmar={() => void executarReabertura()} />}
    {acaoArquivado && contrato?.arquivadoEm && administrador && <ConfirmacaoSimples
      titulo={acaoArquivado === 'reativar' ? 'Reativar contrato?' : 'Excluir contrato arquivado?'}
      descricao={acaoArquivado === 'reativar' ? 'Restaurar o contrato preservando registros e histórico.' : 'A exclusão é definitiva e depende da elegibilidade conferida pelo servidor.'}
      confirmar={acaoArquivado === 'reativar' ? 'Reativar' : 'Excluir definitivamente'} perigoso={acaoArquivado === 'excluir'}
      ocupado={alterandoArquivo} pendencias={erroAcaoArquivado ? [erroAcaoArquivado] : []}
      justificativa={motivoDecisao} onJustificativaChange={acaoArquivado === 'reativar' ? setMotivoDecisao : undefined}
      onCancelar={()=>setAcaoArquivado(null)} onConfirmar={()=>void executarAcaoArquivado()} />}
    {confirmarArquivo && contrato && <ConfirmacaoSimples
      titulo='Arquivar contrato?'
      descricao='O contrato ficará em Arquivados. Os documentos e o histórico serão preservados. Para reativá-lo, abra o contrato e selecione Reativar.'
      confirmar='Arquivar contrato'
      ocupado={alterandoArquivo}
      onCancelar={() => { if (!alterandoArquivo) setConfirmarArquivo(false); }}
      onConfirmar={() => void alterarArquivo()}
    />}
  </AreaContratos></div>;
}
