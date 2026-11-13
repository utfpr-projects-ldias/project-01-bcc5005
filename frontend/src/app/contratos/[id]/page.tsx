'use client';
import { BotaoAcaoModal } from '@/app/components/botoes-modal';
import { PainelExecucaoContextual } from '@/app/execucao/components/painel-execucao';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';

import { useConsulta } from '@/app/components/provedor-consultas';
import { buscarFuncionarioPorId } from '@/lib/admin-usuarios';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { chaveTexto } from '@/lib/repositorio-consultas';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { IndicadorAvancoFinalizado } from '../components/indicador-avanco-finalizado';
import { solicitarConclusaoContrato, consultarElegibilidadeConclusao, arquivarContrato, concluirContrato, finalizarContrato, devolverContratoParaRevisao, fecharRevisaoContrato, reabrirContrato, encerrarContratoAntecipadamente, cancelarContrato, reverterCancelamentoContrato, suspenderContrato, retomarContrato } from '@/lib/contratos';
import { useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { useParams } from 'next/navigation';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useContrato, useAcessoContrato, useResponsaveis, useMutacoesContrato, usePendentesConclusao } from '@/hooks/use-contratos';
import { useEtapas } from '@/hooks/use-etapas';
import { useDocumentos } from '@/hooks/use-documentos';
import { consultarHistoricoContrato } from '@/lib/contratos';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import { contratoDocumentalmenteConcluido } from '@/lib/situacao-documental-etapa';
import { faseEmRevisao } from '@/lib/estado-visivel-contrato';
import { dataCivil, MODOS, STATUS, rotuloCodigoPublico, ConfirmacaoVigenciaNecessaria, type DadosContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from '../components/area-contratos';
import { PainelEtapas } from '../components/painel-etapas';
import { PainelDocumentos } from '../components/painel-documentos';
import { ResumoPlanejamentoContrato } from '../components/resumo-planejamento-contrato';
import { HistoricoContrato } from '../components/historico-contrato';
import { AtividadesVinculadas } from '../components/atividades-vinculadas';
import { PainelOcorrencias } from '@/app/ocorrencias/components/painel-ocorrencias';
import { IconeAtividades, IconeOcorrencias } from '@/app/components/icones-operacionais';
import { FormularioContrato } from '../components/formulario-contrato';
import { ModalEtapa } from '../components/modal-etapa';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';

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
  const cache = useRepositorioConsultas();
  const [abaExecucao, setAbaExecucao] = useState<'geral' | 'ocorrencias'>('geral');
  const [abaContrato, setAbaContrato] = useState<'visao' | 'execucao' | 'etapas' | 'atividades' | 'documentos'>('visao');
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
  const [confirmarReabertura, setConfirmarReabertura] = useState(false);
  const [confirmarConclusao, setConfirmarConclusao] = useState(false);
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
  function registrarAtualizacaoHistorico() {
    cache.invalidar(['contratos', 'historico-revisao', id]);
    cache.invalidar(['contratos', 'elegibilidade-conclusao', id]);
    void elegibilidadeQuery.atualizar().catch(() => {});
    void principalQuery.atualizar().catch(() => {});
    setVersaoHistorico(atual => atual + 1);
  }
  const documentalmenteConcluido = Boolean(contrato && contratoDocumentalmenteConcluido(
    { ...contrato, reabertoEm: null }, etapasDocumentais.dados, entregaveisDocumentais.dados, resumoDocumental.dados));
  const administrador = perfil?.perfil === 'ADMINISTRADOR';
  const concluido = Boolean(contrato && contrato.status === 'CONCLUIDO' && !contrato.reabertoEm);
  const finalizado = Boolean(contrato && contrato.status === 'FINALIZADO' && !contrato.reabertoEm);
  const encerrado = Boolean(contrato && contrato.status === 'ENCERRADO' && !contrato.reabertoEm);
  const cancelado = contrato?.status === 'CANCELADO';
  const suspenso = contrato?.status === 'SUSPENSO';
  const podeSuspender = Boolean(contrato && !contrato.conclusaoSolicitadaEm && !contrato.arquivadoEm && !suspenso && ['PLANEJAMENTO','EM_EXECUCAO','EM_ENCERRAMENTO'].includes(contrato.status) && (administrador || acessoQuery.dados?.permissoes?.suspenderContrato));
  const podeRetomar = Boolean(contrato && !contrato.arquivadoEm && suspenso && (administrador || acessoQuery.dados?.permissoes?.retomarContrato));
  const podeCancelarContrato = Boolean(contrato && !contrato.conclusaoSolicitadaEm && !contrato.arquivadoEm && !cancelado &&
    ['PLANEJAMENTO', 'EM_EXECUCAO'].includes(contrato.status) &&
    (administrador || acessoQuery.dados?.permissoes?.cancelarContrato));
  const podeReverterCancelamento = Boolean(contrato && !contrato.arquivadoEm && cancelado &&
    (administrador || acessoQuery.dados?.permissoes?.reverterCancelamentoContrato));
  const podeDeliberar = Boolean(administrador || acessoQuery.dados?.permissoes?.concluirContrato);
  const pendenciasQuery = usePendentesConclusao(Boolean(perfil?.ativo && contrato));
  const pendenteConclusao = Boolean(contrato?.conclusaoSolicitadaEm && !contrato.arquivadoEm &&
    !contrato.reabertoEm && !['CONCLUIDO','FINALIZADO','ENCERRADO','SUSPENSO','CANCELADO'].includes(contrato.status));
  const podeSolicitarConclusao = Boolean(contrato && !pendenteConclusao && !contrato.arquivadoEm &&
    (administrador || acessoQuery.dados?.permissoes?.editarContrato) && elegibilidadeQuery.dados?.apto);
  const motivoIndisponibilidadeConclusao = elegibilidadeQuery.carregando ? 'Verificando requisitos...' :
    elegibilidadeQuery.erro ? 'Falha ao verificar os requisitos da conclusão.' :
    elegibilidadeQuery.dados?.pendencias?.[0] ?? 'A conclusão não está disponível para este contrato.';
  const emRevisao = Boolean(contrato?.reabertoEm && !contrato.arquivadoEm && !suspenso && !cancelado && !encerrado && !pendenteConclusao);
  const revisaoConcluivel = emRevisao && documentalmenteConcluido;
  const podeConcluir = pendenteConclusao;
  const podeFecharRevisao = revisaoConcluivel && Boolean(etapasDocumentais.dados?.filter(e => !e.arquivadoEm).every(e => !e.reabertoEm && e.status === 'CONCLUIDA'));
  const bloqueioOperacional = concluido || encerrado || cancelado || suspenso || pendenteConclusao;
  const podeEncerrar = Boolean(contrato && !contrato.conclusaoSolicitadaEm && !contrato.arquivadoEm && !['CONCLUIDO', 'ENCERRADO', 'SUSPENSO', 'CANCELADO'].includes(contrato.status) &&
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
    ...(perfil?.ativo && perfil.perfil === 'ADMINISTRADOR' ? [{
      id: perfil.id, nome: perfil.nome, email: perfil.email, perfil: perfil.perfil,
      ativo: perfil.ativo, criadoEm: '',
    }] : []),
    ...(responsaveisQuery.dados?.usuarios ?? []),
  ];
  // Evita options com a mesma key quando a consulta retorna a conta ADMIN.
  const responsaveis = responsaveisPossiveis.filter((u, indice, todos) => todos.findIndex(v => v.id === u.id) === indice);
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
      if (evento.data?.tipo === 'pi:acao-contrato' && evento.data?.contratoId === id) {
        const acao = evento.data?.acao;
        if (acao === 'suspender' && podeSuspender) setConfirmarSuspensao(true);
        else if (acao === 'cancelar' && podeCancelarContrato) setCancelamentoAberto(true);
        else if (acao === 'reverter-cancelamento' && podeReverterCancelamento) setConfirmarReversaoCancelamento(true);
        else if (acao === 'retomar' && podeRetomar) setConfirmarRetomada(true);
        else if (acao === 'reabrir' && contrato && ['CONCLUIDO','FINALIZADO','ENCERRADO'].includes(contrato.status) && (administrador || acessoQuery.dados?.permissoes?.reabrirContrato)) setConfirmarReabertura(true);
        else if (acao === 'encerrar' && podeEncerrar) setAbrirEncerramento(true);
        else if (acao === 'finalizar' && podeDeliberar && contrato && !contrato.arquivadoEm && !['SUSPENSO','CANCELADO','CONCLUIDO','FINALIZADO','ENCERRADO'].includes(contrato.status)) setConfirmarFinalizacao(true);
        else if (acao === 'solicitar-conclusao' && podeSolicitarConclusao) setConfirmarSolicitacao(true);
        else if (acao === 'aprovar-conclusao' && pendenteConclusao && podeDeliberar) setConfirmarConclusao(true);
        else if (acao === 'devolver-conclusao' && pendenteConclusao && podeDeliberar) setConfirmarDevolucao(true);
      }
    }
    window.addEventListener('message', receber);
    return () => window.removeEventListener('message', receber);
  // Ações do modal contextual sempre usam a autorização e a situação atuais.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painelInterno, id, podeAbrirEdicao, contrato?.id, contrato?.status, contrato?.arquivadoEm, editarAberto,
      podeSuspender, podeCancelarContrato, podeReverterCancelamento, podeRetomar, podeEncerrar, podeDeliberar, podeSolicitarConclusao, pendenteConclusao, administrador, acessoQuery.dados?.permissoes?.reabrirContrato]);
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
      await mutacoes.editar(contrato.id, impactoVigenciaPendente.dados, impactoVigenciaPendente.impacto.confirmacao);
      setImpactoVigenciaPendente(null);
      registrarAtualizacaoHistorico();
      toastSucesso('Vigência atualizada, mantendo a rastreabilidade das ocorrências.');
      fecharEdicao();
    } catch (erro) {
      setImpactoVigenciaPendente(null);
      setErroEdicao(erro instanceof Error ? erro.message : 'Não foi possível confirmar a vigência.');
    } finally { setSalvandoEdicao(false); }
  }
  async function salvarEdicao(dados: DadosContrato) {
    if (!contrato || !podeAbrirEdicao || salvandoEdicao) return;
    setSalvandoEdicao(true); setErroEdicao('');
    try {
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
        await mutacoes.editar(contrato.id, dados);
        registrarAtualizacaoHistorico();
        toastSucesso('Contrato atualizado. Alteração preservada na rastreabilidade.');
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
    if (!contrato || !podeSolicitarConclusao || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await solicitarConclusaoContrato(contrato.id);
      cache.gravar(chaveTexto(['contratos','detalhe',contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      setConfirmarSolicitacao(false);
      cache.invalidar(['contratos','lista']); cache.invalidar(['contratos','pendentes']);
      cache.invalidar(['contratos','elegibilidade-conclusao', contrato.id]);
      await Promise.allSettled([contratoQuery.atualizar(), elegibilidadeQuery.atualizar()]);
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
      cache.invalidar(['contratos', 'detalhe', contrato.id]); cache.invalidar(['execucao', contrato.id]);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['contratos', 'pendentes']);
      cache.invalidar(['contratos', 'elegibilidade-conclusao', contrato.id]);
      await Promise.allSettled([contratoQuery.atualizar(), principalQuery.atualizar(), elegibilidadeQuery.atualizar()]);
      toastSucesso('Contrato concluído após confirmação autorizada.');
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível concluir o contrato.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function executarFinalizacao() {
    if (!contrato || !podeDeliberar || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await finalizarContrato(contrato.id, motivoFinalizacao.trim());
      cache.gravar(chaveTexto(['contratos','detalhe',contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      cache.invalidar(['execucao',contrato.id]);cache.invalidar(['contratos','lista']);
      setConfirmarFinalizacao(false);setMotivoFinalizacao('');
      await contratoQuery.atualizar();
      toastSucesso('Contrato finalizado administrativamente. Progresso físico preservado.');
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
      cache.invalidar(['contratos', 'detalhe', contrato.id]); cache.invalidar(['execucao', contrato.id]);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['contratos', 'pendentes']);
      await contratoQuery.atualizar();
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
      cache.invalidar(['contratos', 'detalhe', contrato.id]); cache.invalidar(['execucao', contrato.id]);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['contratos', 'pendentes']);
      await Promise.allSettled([contratoQuery.atualizar(), acessoQuery.atualizar()]);
      setConfirmarRetomada(false); setMotivoDecisao(''); toastSucesso('Contrato retomado na situação anterior à suspensão.');
    } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Não foi possível retomar o contrato.'); }
    finally { setAlterandoArquivo(false); }
  }
  function comunicarDecisaoContrato(atualizado: import('@/lib/contratos').Contrato) {
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
      cache.invalidar(['execucao', contrato.id]);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['contratos', 'pendentes']);
      await Promise.allSettled([contratoQuery.atualizar(), pendenciasQuery.atualizar(), acessoQuery.atualizar()]);
      (reverter ? toastSucesso : toastAviso)(reverter ? 'Cancelamento revertido. Contrato voltou a Planejamento.' :
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
      cache.invalidar(['contratos', 'detalhe', contrato.id]); cache.invalidar(['execucao', contrato.id]);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['contratos', 'pendentes']);
      await contratoQuery.atualizar();
      toastAviso('Contrato encerrado antecipadamente. Progresso incompleto preservado na auditoria.');
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Falha ao encerrar contrato antecipadamente.'); }
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
      cache.invalidar(['contratos', 'detalhe', contrato.id]); cache.invalidar(['execucao', contrato.id]);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['contratos', 'pendentes']);
      cache.invalidar(['contratos', 'historico-revisao', contrato.id]);
      await Promise.allSettled([contratoQuery.atualizar(), pendenciasQuery.atualizar()]);
      toastAviso('Conclusão devolvida para revisão. Decisão registrada no histórico.');
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
      cache.invalidar(['contratos', 'detalhe', contrato.id]); cache.invalidar(['execucao', contrato.id]);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['contratos', 'pendentes']);
      cache.invalidar(['contratos', 'historico-revisao', contrato.id]);
      await Promise.allSettled([contratoQuery.atualizar(), pendenciasQuery.atualizar()]);
      toastSucesso('Revisão encerrada. O contrato está pendente de conclusão autorizada.');
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
      cache.invalidar(['contratos', 'detalhe', contrato.id]); cache.invalidar(['execucao', contrato.id]);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['contratos', 'pendentes']);
      await contratoQuery.atualizar();
      toastSucesso('Contrato reaberto para edição.');
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível reabrir o contrato.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function alterarArquivo() {
    if (!administrador || !contrato || contrato.arquivadoEm || bloqueioOperacional || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      const atualizado = await arquivarContrato(contrato.id);
      cache.gravar(chaveTexto(['contratos', 'detalhe', contrato.id]), atualizado);
      comunicarDecisaoContrato(atualizado);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['contratos', 'pendentes']);
      cache.invalidar(['contratos', 'detalhe', contrato.id]); cache.invalidar(['execucao', contrato.id]);
      cache.invalidar(['contratos', 'acesso', contrato.id]);
      setConfirmarArquivo(false);
      {
        const marcador = marcadorEdicao.current;
        marcadorEdicao.current = null;
        setEditarAberto(false);
        if (marcador && window.history.state?.__editarContrato === marcador) window.history.back();
      }
      await contratoQuery.atualizar();
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
  return <div className="contrato-detalhe-documental" data-arquivado={Boolean(contrato?.arquivadoEm)}
    data-tec08-estado={contrato?.arquivadoEm ? 'arquivado' : cancelado ? 'cancelado' : suspenso ? 'suspenso' : finalizado ? 'finalizado' : encerrado ? 'encerrado' : emRevisao ? 'revisao' : (concluido || pendenteConclusao) ? 'concluido' : 'normal'}><AreaContratos titulo="Detalhes do contrato">
    {erroArquivo && <Aviso erro>{erroArquivo}</Aviso>}
    {carregando ? <Aviso>Carregando contrato...</Aviso> : erro ? <Aviso erro>{erro}</Aviso> : contrato ? <>
      {!painelInterno && <header className="flex min-w-0 items-center gap-3 py-1">
        <Link href="/contratos" data-tec08-voltar-contratos aria-label="Voltar aos contratos" title="Voltar aos contratos"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green/10 text-brand-neon transition-colors hover:bg-brand-green/20 focus-visible:outline-2 focus-visible:outline-brand-neon">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div className="min-w-0 flex-1"><h2 title={contrato.numeroContrato} className={`contrato-detalhe-titulo break-words text-lg font-bold ${contrato.arquivadoEm ? 'text-amber-200' : cancelado ? 'text-red-300' : suspenso ? 'text-yellow-200' : finalizado ? 'text-purple-300' : encerrado ? 'text-slate-200' : (concluido || pendenteConclusao) ? 'text-violet-300' : emRevisao ? 'text-teal-200' : 'text-brand-neon'}`}>{contrato.numeroContrato}</h2>
          <p className="mt-0.5 text-xs text-foreground/65">Código {rotuloCodigoPublico(contrato.codigoPublico)} · {contrato.arquivadoEm ? 'Arquivado' : encerrado ? 'Encerrado' : emRevisao ? 'Em revisão' : pendenteConclusao ? 'Pendente de conclusão' : STATUS[contrato.status]}</p></div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {emRevisao && <><span className="rounded-full border border-teal-500/55 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-foreground">Em revisão</span><span className="rounded-full border border-foreground/20 bg-background px-2.5 py-1 text-xs text-foreground/80">{faseEmRevisao(contrato.status)}</span></>}
          {finalizado && <IndicadorAvancoFinalizado contratoId={contrato.id} />}
          {finalizado && <span className="rounded-full border border-purple-500/60 bg-purple-500/20 px-3 py-1 text-xs font-semibold text-purple-700 dark:text-purple-200">Encerrado — execução parcial</span>}
          {pendenteConclusao && <span className="rounded-full border border-violet-400/60 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">Pendente de conclusão</span>}
          <span data-tec08-modo-contrato className="hidden rounded-full bg-brand-green/10 px-3 py-1 text-xs font-medium sm:inline-flex">{MODOS[contrato.modoCalculo]}</span>
        </div>
      </header>}
      <div data-testid="barra-navegacao-contrato" className={`sticky top-2 z-30 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-1 shadow-sm backdrop-blur-sm ${contrato.arquivadoEm ? 'border-amber-500/50' : suspenso ? 'border-amber-500/50' : encerrado ? 'border-slate-500/50' : emRevisao ? 'border-teal-700/45' : (concluido || pendenteConclusao) ? 'border-violet-400/45' : 'border-brand-green/25'}`}>
        <AbasRolaveis className="w-full sm:w-auto sm:flex-1"><div role="tablist" data-tec08-abas-contrato aria-label="Seções do contrato" className="flex max-w-full items-center gap-1">
          {([
            { id: 'visao', nome: 'Visão geral', icon: <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></> },
            { id: 'etapas', nome: 'Etapas', icon: <><path d="M5 4v16M9 6h11M9 12h11M9 18h11"/></> },
            { id: 'execucao', nome: 'Execução', icon: <><path d="M4 19h16"/><path d="M7 15l3-3 3 2 4-6"/><circle cx="7" cy="15" r="1"/><circle cx="10" cy="12" r="1"/><circle cx="13" cy="14" r="1"/><circle cx="17" cy="8" r="1"/></> },
            { id: 'atividades', nome: 'Atividades', icon: <IconeAtividades tamanho={16} /> },
            { id: 'documentos', nome: 'Documentos', icon: <><path d="M6 3h8l5 5v13H6zM14 3v6h5M9 14h7m-7 4h7"/></> },
          ] as const).map(aba => <button key={aba.id} role="tab" type="button" id={`tab-${aba.id}`}
            aria-controls={`painel-${aba.id}`} aria-selected={abaContrato === aba.id} onClick={() => setAbaContrato(aba.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${abaContrato === aba.id ? 'text-foreground' : 'text-foreground/70 hover:bg-brand-green/10'}`}>
            <span aria-hidden="true" className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
              {aba.id === 'visao' || aba.id === 'execucao' || aba.id === 'etapas' || aba.id === 'documentos'
                ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{aba.icon}</svg>
                : aba.icon}
            </span>
            {aba.nome}</button>)}
        </div></AbasRolaveis>

      </div>
      {pendenteConclusao && podeDeliberar && !principalVerificado &&
        <div id="aviso-pdf-principal-conclusao" data-testid="aviso-pdf-principal-conclusao" role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">{principalAtivo ? 'Verifique o PDF principal para aprovar.' : 'Falta anexar e verificar o PDF principal para aprovar.'}</p>
          </div>
          <button type="button" onClick={() => setAbaContrato('documentos')}
            className="shrink-0 rounded-lg border border-amber-300/70 bg-amber-300/15 px-3 py-2 text-xs font-semibold text-amber-100 hover:border-amber-200 hover:bg-amber-300/25 focus-visible:outline-2 focus-visible:outline-amber-200">
            Ir para Documentos
          </button>
        </div>}
      <div className="min-w-0">
        <div className="min-w-0 space-y-4">
          <section data-tec08-aba-contrato role="tabpanel" id="painel-visao" aria-labelledby="tab-visao" hidden={abaContrato !== 'visao'} className={abaContrato !== 'visao' ? 'hidden' : 'space-y-4'}>
            {!pendenteConclusao && !principalQuery.carregando && !principalVerificado && (documentalmenteConcluido || etapasDocumentais.dados?.some(etapa => etapa.status === 'CONCLUIDA')) &&
              <div role="status" data-testid="aviso-pdf-principal-visao" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/45 bg-amber-500/10 p-3 text-sm text-foreground">
                <p className="min-w-0 flex-1">{principalAtivo ? 'Falta verificar o PDF principal.' : 'Falta anexar e verificar o PDF principal.'}</p>
                <button type="button" onClick={() => setAbaContrato('documentos')} className="shrink-0 rounded-lg border border-amber-500/60 px-3 py-2 font-semibold text-foreground hover:bg-amber-500/15">Ir para Documentos</button>
              </div>}
            {!painelInterno && <section data-tec08-secao-contrato className="space-y-3" aria-label="Planejamento do contrato">
              <h3 className={`text-sm font-semibold ${contrato.arquivadoEm ? "text-amber-200" : cancelado ? "text-red-300" : suspenso ? "text-yellow-200" : encerrado ? "text-slate-200" : emRevisao ? "text-teal-200" : (concluido || pendenteConclusao) ? "text-violet-200" : "text-brand-neon"}`}>Planejamento do contrato</h3>
              <ResumoPlanejamentoContrato contratoId={contrato.id} variante="detalhe" contratoArquivado={Boolean(contrato.arquivadoEm)} contratoSuspenso={suspenso} contratoEmRevisao={emRevisao} contratoEncerrado={encerrado} contratoConcluido={concluido || pendenteConclusao} contratoCancelado={cancelado} />
            </section>}

            <section data-tec08-secao-contrato aria-label="Informações do contrato" className="rounded-xl border border-brand-green/20 bg-brand-darkgreen/5 px-4 py-2">
              <h3 data-tec08-acento-contrato className="py-2 text-sm font-semibold text-brand-neon">Informações do contrato</h3>
              <details role="region" aria-label="Identificação do contrato" className="group border-t border-brand-green/15 py-2" open>
                <summary data-tec08-acento-hover-contrato className="cursor-pointer py-1 text-sm font-semibold transition-colors hover:text-brand-neon">Identificação</summary>
                <dl className="mt-3 grid min-w-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {([['Objeto contratual', contrato.objeto], ['Número', contrato.numeroContrato], ['Código', rotuloCodigoPublico(contrato.codigoPublico)], ['Órgão contratante', contrato.orgaoContratante],
                    ['Processo administrativo', contrato.processoAdministrativo], ['Unidade responsável', contrato.unidadeResponsavel]] as Par[])
                    .map(([rotulo, valor]) => <div key={rotulo} className={`min-w-0 ${rotulo === 'Órgão contratante' || rotulo === 'Objeto contratual' ? 'sm:col-span-2 lg:col-span-2' : ''}`}>
                      <dt className="text-xs text-foreground/55">{rotulo}</dt>
                      <dd className="mt-0.5 max-h-28 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{valor || 'Não informado'}</dd>
                    </div>)}
                </dl>
              </details>
              <details className="border-t border-brand-green/15 py-2" open>
                <summary data-tec08-acento-hover-contrato className="cursor-pointer py-1 text-sm font-semibold transition-colors hover:text-brand-neon">Vigência e execução</summary>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{([['Início', dataBR(contrato.inicioVigencia)], ['Término', dataBR(contrato.terminoVigencia)], ['Assinatura', dataBR(contrato.dataAssinatura)], ['Status', contrato.arquivadoEm ? 'Arquivado' : encerrado ? 'Encerrado' : emRevisao ? `Em revisão · ${faseEmRevisao(contrato.status)}` : pendenteConclusao ? 'Pendente de conclusão' : STATUS[contrato.status]], ['Cálculo', MODOS[contrato.modoCalculo]]] as Par[]).map(([rotulo, valor]) => <div key={rotulo}><dt className="text-xs text-foreground/55">{rotulo}</dt><dd className="mt-0.5 break-words">{valor || 'Não informado'}</dd></div>)}</dl>
              </details>
              <details className="border-t border-brand-green/15 py-2" open>
                <summary data-tec08-acento-hover-contrato className="cursor-pointer py-1 text-sm font-semibold transition-colors hover:text-brand-neon">Responsáveis</summary>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{([['Responsável interno', responsavelVisivel], ['Fiscal/gestor público', contrato.fiscalGestor]] as Par[]).map(([rotulo, valor]) => <div key={rotulo}><dt className="text-xs text-foreground/55">{rotulo}</dt><dd className="mt-0.5 break-words">{valor || 'Não informado'}</dd></div>)}</dl>
              </details>
            </section>

            <HistoricoContrato estado={contrato.arquivadoEm ? "arquivado" : cancelado ? "cancelado" : suspenso ? "suspenso" : encerrado ? "encerrado" : concluido || pendenteConclusao ? "concluido" : emRevisao ? "revisao" : "normal"} contratoId={contrato.id} versao={`${contrato.status}:${contrato.reabertoEm ?? ''}:${contratoQuery.dados?.numeroContrato ?? ''}:${abaContrato}:${versaoHistorico}`} />
            <section data-tec08-secao-contrato aria-label="Descrição e observações" className="space-y-2 rounded-xl border border-brand-green/15 bg-brand-darkgreen/5 p-3 text-sm">
              <details className="group/descricao" open={!contrato.descricao || contrato.descricao.length < 240}>
                <summary data-tec08-acento-contrato className="cursor-pointer py-1 text-sm font-semibold text-brand-neon">Descrição</summary>
                <p className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground/85">{contrato.descricao || 'Não informada'}</p>
              </details>
              <details className="group/observacoes" open={!contrato.observacoes || contrato.observacoes.length < 180}>
                <summary data-tec08-acento-contrato className="cursor-pointer border-t border-brand-green/10 pt-3 text-sm font-semibold text-brand-neon">Observações</summary>
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground/70">{contrato.observacoes || 'Nenhuma observação'}</p>
              </details>
            </section>


          </section>
          <section data-tec08-aba-contrato role="tabpanel" id="painel-execucao" aria-labelledby="tab-execucao" hidden={abaContrato !== 'execucao'} className={abaContrato !== 'execucao' ? 'hidden' : 'space-y-4'}>
            <nav role="tablist" aria-label="Seções da execução" className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-current/25 bg-background/60 p-1">
              <button role="tab" type="button" id="execucao-tab-geral" aria-controls="execucao-conteudo-geral" aria-selected={abaExecucao === 'geral'} onClick={() => setAbaExecucao('geral')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${abaExecucao === 'geral' ? 'bg-current/10 underline underline-offset-4' : 'text-foreground/75 hover:bg-foreground/5'}`}>Geral</button>
              <button role="tab" type="button" id="execucao-tab-ocorrencias" aria-controls="execucao-conteudo-ocorrencias" aria-selected={abaExecucao === 'ocorrencias'} onClick={() => setAbaExecucao('ocorrencias')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${abaExecucao === 'ocorrencias' ? 'bg-current/10 underline underline-offset-4' : 'text-foreground/75 hover:bg-foreground/5'}`}><IconeOcorrencias tamanho={16} /> Ocorrências</button>
            </nav>
            <div role="tabpanel" id="execucao-conteudo-geral" aria-labelledby="execucao-tab-geral" hidden={abaExecucao !== 'geral'} className={abaExecucao !== 'geral' ? 'hidden' : undefined}><PainelExecucaoContextual contratoId={contrato.id} estadoContextual={contrato.arquivadoEm ? 'arquivado' : cancelado ? 'cancelado' : suspenso ? 'suspenso' : finalizado ? 'finalizado' : encerrado ? 'encerrado' : emRevisao ? 'revisao' : (concluido || pendenteConclusao) ? 'concluido' : 'normal'} /></div>
            <div role="tabpanel" id="execucao-conteudo-ocorrencias" aria-labelledby="execucao-tab-ocorrencias" hidden={abaExecucao !== 'ocorrencias'} className={abaExecucao !== 'ocorrencias' ? 'hidden' : undefined}><PainelOcorrencias contratoId={contrato.id} estadoContextual={contrato.arquivadoEm ? 'arquivado' : cancelado ? 'cancelado' : suspenso ? 'suspenso' : finalizado ? 'finalizado' : encerrado ? 'encerrado' : emRevisao ? 'revisao' : (concluido || pendenteConclusao) ? 'concluido' : 'normal'} somenteLeitura={Boolean(contrato.arquivadoEm || cancelado || encerrado || suspenso || concluido || contrato.status === 'EM_ENCERRAMENTO')} embutido /></div>
          </section>
          <section data-tec08-aba-contrato role="tabpanel" id="painel-atividades" aria-labelledby="tab-atividades" hidden={abaContrato !== 'atividades'} className={abaContrato !== 'atividades' ? 'hidden' : 'space-y-4'}>
            <AtividadesVinculadas contratoId={contrato.id} estadoContextual={contrato.arquivadoEm ? 'arquivado' : cancelado ? 'cancelado' : suspenso ? 'suspenso' : finalizado ? 'finalizado' : encerrado ? 'encerrado' : emRevisao ? 'revisao' : (concluido || pendenteConclusao) ? 'concluido' : 'normal'} visivel={abaContrato === 'atividades'} somenteLeitura={Boolean(contrato.arquivadoEm || cancelado || encerrado || suspenso || concluido || contrato.status === 'EM_ENCERRAMENTO')} ocultarAcessoDiario />
          </section>
          <section data-tec08-aba-contrato role="tabpanel" id="painel-etapas" aria-labelledby="tab-etapas" hidden={abaContrato !== 'etapas'} className={abaContrato !== 'etapas' ? 'hidden' : 'space-y-4'}>
            <PainelEtapas key={`etapas:${contrato.id}`} contratoId={contrato.id} habilitado={!!perfil?.ativo}
              podeGerenciar={podeEditar} permissoes={acessoQuery.dados?.permissoes} contratoArquivado={Boolean(contrato.arquivadoEm)} contratoConcluido={concluido} contratoPendenteConclusao={pendenteConclusao} contratoEmRevisao={emRevisao} contratoEncerrado={encerrado}
              ordemEtapasBloqueada={Boolean(contrato.ordemEtapasBloqueada)} contratoSuspenso={suspenso} contratoCancelado={cancelado}
              onAuditoriaAlterada={registrarAtualizacaoHistorico}
              onOrdemAlterada={async () => { registrarAtualizacaoHistorico(); await contratoQuery.atualizar(); }} />
          </section>
          <section data-tec08-aba-contrato role="tabpanel" id="painel-documentos" aria-labelledby="tab-documentos" hidden={abaContrato !== 'documentos'} className={abaContrato !== 'documentos' ? 'hidden' : 'space-y-4'}>
            <PainelDocumentos key={`documentos:${contrato.id}`} contratoId={contrato.id} estadoContextual={contrato.arquivadoEm ? 'arquivado' : cancelado ? 'cancelado' : suspenso ? 'suspenso' : finalizado ? 'finalizado' : encerrado ? 'encerrado' : emRevisao ? 'revisao' : (concluido || pendenteConclusao) ? 'concluido' : 'normal'} onDocumentoAlterado={registrarAtualizacaoHistorico} habilitado={!!perfil?.ativo} somenteLeitura={Boolean(contrato.arquivadoEm || bloqueioOperacional)} permitirRegularizarPrincipal={Boolean(!contrato.arquivadoEm && !['CANCELADO','SUSPENSO','ENCERRADO','CONCLUIDO','FINALIZADO'].includes(contrato.status) && !principalVerificado)}
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
        {(!painelInterno || Boolean(contrato.observacoes?.trim())) && <footer data-tec08-contexto-operacional data-tec08-estado={contrato.arquivadoEm ? 'arquivado' : cancelado ? 'cancelado' : suspenso ? 'suspenso' : finalizado ? 'finalizado' : encerrado ? 'encerrado' : emRevisao ? 'revisao' : (concluido || pendenteConclusao) ? 'concluido' : 'normal'} className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/70 px-4 py-3" aria-label="Observações e ações do contrato">
          {Boolean(contrato.observacoes?.trim()) && <p className="min-w-0 flex-1 truncate text-xs text-foreground/65" title={contrato.observacoes ?? ''}>{contrato.observacoes}</p>}
        <div className="flex min-w-0 items-center justify-end gap-2">
          {!painelInterno && <MenuAcoesObjeto rotulo="Fechar contrato" disabled={alterandoArquivo}>
           {podeSuspender && <BotaoAcaoModal intencao="suspender" disabled={alterandoArquivo} onClick={() => setConfirmarSuspensao(true)}>⏸ Suspender contrato</BotaoAcaoModal>}
           {podeCancelarContrato && <BotaoAcaoModal intencao="cancelar" disabled={alterandoArquivo} onClick={() => setCancelamentoAberto(true)}>✕ Cancelar contrato</BotaoAcaoModal>}
           {podeEncerrar && <BotaoAcaoModal intencao="encerrar" disabled={alterandoArquivo} onClick={() => setAbrirEncerramento(true)}>⚑ Encerrar antecipadamente</BotaoAcaoModal>}
          {!finalizado && !concluido && !encerrado && !cancelado && !suspenso && !contrato.arquivadoEm && !pendenteConclusao && (administrador || acessoQuery.dados?.permissoes?.editarContrato) &&
            <BotaoAcaoModal intencao="solicitar-conclusao" disabled={!podeSolicitarConclusao || alterandoArquivo} title={!podeSolicitarConclusao ? motivoIndisponibilidadeConclusao : 'Solicitar aprovação da conclusão integral'}
              onClick={() => setConfirmarSolicitacao(true)}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="m7 11 2 2 3-4M14 10h4M7 17h11"/></svg>Solicitar conclusão
            </BotaoAcaoModal>}
          {pendenteConclusao && podeDeliberar ? <>
            <button type="button" data-tec08-decisao="rejeitar" onClick={() => setConfirmarDevolucao(true)} disabled={alterandoArquivo}
              aria-label="Não aprovar conclusão" title="Não aprovar e devolver o contrato para revisão"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-500 bg-red-700 px-2.5 text-xs font-semibold text-white hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-red-300 disabled:opacity-50"><span aria-hidden="true">✕</span> Não aprovar</button>
            <button type="button" data-tec08-decisao="aprovar" onClick={() => setConfirmarConclusao(true)} disabled={alterandoArquivo || !principalVerificado || principalQuery.carregando}
              title={principalQuery.carregando ? 'Consultando a situação do PDF principal' : !principalVerificado ? pendenciaPrincipal : 'Aprovar conclusão do contrato'}
              aria-label="Aprovar conclusão do contrato"
              aria-describedby={!principalVerificado ? 'aviso-pdf-principal-conclusao' : undefined}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 ${principalVerificado ? 'border-violet-500 bg-violet-700 text-white hover:bg-violet-600' : 'border-violet-500/45 bg-violet-950/20 text-violet-200/40 disabled:cursor-not-allowed'}`}><span aria-hidden="true">✓</span> Aprovar</button>
          </> : contrato.arquivadoEm ? null : (concluido || encerrado) && (administrador || acessoQuery.dados?.permissoes?.reabrirContrato) ? (
            <button type="button" onClick={() => setConfirmarReabertura(true)} disabled={alterandoArquivo}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/60 bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-teal-300 disabled:opacity-50" aria-label="Reabrir contrato concluído"><span aria-hidden="true">⟳</span> Reabrir contrato</button>
          ) : podeFecharRevisao && podeEditar ? (
            <button type="button" data-tec08-decisao="fechamento" aria-label={tituloFechamento} disabled={alterandoArquivo}
              onClick={() => setConfirmarFechamentoRevisao(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-violet-400/55 bg-violet-700 px-3 text-xs font-semibold text-white hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-50"><span aria-hidden="true">✓</span>{tituloFechamento}</button>
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
          {!contrato.arquivadoEm && administrador && !bloqueioOperacional &&
            <button type="button" onClick={() => setConfirmarArquivo(true)} disabled={alterandoArquivo}
              aria-label="Arquivar contrato" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-500/45 bg-amber-500/10 px-3 text-xs font-semibold text-foreground hover:bg-amber-500/20 disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg> Arquivar
            </button>}

          </MenuAcoesObjeto>}
        </div>
        </footer>}
    </> : <Aviso erro>Contrato não encontrado.</Aviso>}
    {editarAberto && contrato && podeAbrirEdicao && <ModalEtapa titulo={`Editar contrato · ${contrato.numeroContrato}`}
      estadoContextual={contrato.arquivadoEm ? "arquivado" : cancelado ? "cancelado" : suspenso ? "suspenso" : encerrado ? "encerrado" : emRevisao ? "revisao" : (concluido || pendenteConclusao) ? "concluido" : "normal"}
      contexto="Dados administrativos do contrato" textoFechar="Fechar ×" rotuloFechar="Fechar edição do contrato"
      bloqueadoPorSubmodal={confirmarArquivo} ocupado={salvandoEdicao || alterandoArquivo} onFechar={fecharEdicao}>
      <div data-tec08-formulario-contextual className="space-y-4" data-testid="modal-edicao-contrato">
        {erroEdicao && <Aviso erro>{erroEdicao}</Aviso>}
        {administrador && responsaveisQuery.carregando && <p role="status" className="text-sm text-foreground/70">Carregando responsáveis...</p>}
        {Boolean(responsaveisQuery.erro) && <Aviso erro>Não foi possível consultar os responsáveis. Nenhuma atribuição será alterada automaticamente.</Aviso>}
        <FormularioContrato key={contrato.id} inicial={contrato} responsaveis={responsaveis}
          onSalvar={salvarEdicao} onCancelar={fecharEdicao} salvando={salvandoEdicao}
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
    {confirmarFinalizacao && contrato && <ModalEtapa titulo="Finalizar contrato" contexto="Fechamento administrativo parcial" estadoContextual="finalizado" ocupado={alterandoArquivo} onFechar={() => setConfirmarFinalizacao(false)}>
      <div className="space-y-4 text-sm"><p>Para finalizar, todas as etapas e entregáveis precisam estar resolvidos, com ao menos um encerramento administrativo. A porcentagem real continuará visível e não passará automaticamente a 100%.</p>
        <label className="block font-semibold">Justificativa (15 a 200 caracteres)<textarea rows={4} maxLength={200} value={motivoFinalizacao} onChange={e => setMotivoFinalizacao(e.target.value)} className="mt-2 w-full rounded-lg border border-purple-500/40 bg-background p-3" /></label>
        <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border px-4 py-2" onClick={() => setConfirmarFinalizacao(false)}>Cancelar</button><button type="button" disabled={alterandoArquivo || motivoFinalizacao.trim().length < 15} className="rounded-lg bg-purple-700 px-4 py-2 font-semibold text-white disabled:opacity-40" onClick={() => void executarFinalizacao()}>Finalizar</button></div>
      </div>
    </ModalEtapa>}
    {abrirEncerramento && contrato && <ModalEtapa titulo="Encerrar contrato"
      contexto="Decisão excepcional e auditada" estadoContextual="encerrado" ocupado={alterandoArquivo} onFechar={() => setAbrirEncerramento(false)}>
      <div className="space-y-4">
        <p className="text-sm text-foreground/80">Esta decisão não significa conclusão integral. O progresso das etapas, entregáveis e evidências será preservado, inclusive as pendências.</p>
        <label className="block space-y-2 text-sm font-medium" htmlFor="motivo-encerramento">Justificativa obrigatória (15 a 200 caracteres)
          <textarea id="motivo-encerramento" value={motivoEncerramento} maxLength={200} rows={4}
            onChange={e => setMotivoEncerramento(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-500/60 bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-slate-300" />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setAbrirEncerramento(false)} disabled={alterandoArquivo}
            className="rounded-lg border border-foreground/30 px-4 py-2 text-sm">Voltar</button>
          <button type="button" onClick={() => void executarEncerramento()}
            disabled={alterandoArquivo || motivoEncerramento.trim().length < 15}
            className="rounded-lg border border-slate-500 bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Confirmar encerramento antecipado</button>
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
      titulo="Solicitar conclusão do contrato?"
      descricao="A execução e os documentos obrigatórios foram verificados. O pedido será registrado e ficará aguardando a decisão de quem possui permissão para aprovar."
      confirmar="Solicitar conclusão" confirmacaoRoxa ocupado={alterandoArquivo} cancelarVermelho={false}
      onCancelar={() => setConfirmarSolicitacao(false)} onConfirmar={() => void executarSolicitacaoConclusao()} />}
    {confirmarConclusao && contrato && <ConfirmacaoSimples
      titulo="Aprovar conclusão do contrato?"
      descricao="Aprovar confirma definitivamente a conclusão. É obrigatório ter PDF principal ativo e verificado, etapas e entregáveis concluídos. A decisão será auditada."
      confirmar="Aprovar conclusão" confirmacaoRoxa cancelarVermelho ocupado={alterandoArquivo}
      onCancelar={() => setConfirmarConclusao(false)} onConfirmar={() => void executarConclusao()} />}
    {confirmarDevolucao && contrato && <ConfirmacaoSimples
      titulo="Não aprovar a conclusão do contrato?"
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
      titulo={encerrado ? 'Reabrir contrato encerrado?' : 'Reabrir contrato concluído?'}
      descricao={`O contrato deixará de ficar ${encerrado ? 'Encerrado' : 'Concluído'} e passará para Em revisão. Etapas, entregáveis e evidências continuarão no estado atual e poderão ser reabertos separadamente. O histórico será preservado.`}
      confirmar="Reabrir contrato" estadoContextual={encerrado ? 'encerrado' : 'concluido'} preservarCorOrigem ocupado={alterandoArquivo} justificativa={motivoDecisao} onJustificativaChange={setMotivoDecisao} onCancelar={() => setConfirmarReabertura(false)}
      onConfirmar={() => void executarReabertura()} />}
    {confirmarArquivo && contrato && <ConfirmacaoSimples
      titulo='Arquivar contrato?'
      descricao='O contrato ficará em Arquivados. Os documentos e o histórico serão preservados. Para reativá-lo, utilize a aba Arquivados.'
      confirmar='Arquivar contrato'
      ocupado={alterandoArquivo}
      onCancelar={() => { if (!alterandoArquivo) setConfirmarArquivo(false); }}
      onConfirmar={() => void alterarArquivo()}
    />}
  </AreaContratos></div>;
}
