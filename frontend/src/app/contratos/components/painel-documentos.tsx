'use client';
import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';
import { toastAviso, toastSucesso } from '@/app/components/toast-notificacoes';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ModalEtapa } from './modal-etapa';
import { IconeStatus } from '@/app/components/icones-status';
import { BotaoEditarModal, BotaoAcaoModal } from '@/app/components/botoes-modal';
import { ajustarRestauracaoHistorico } from '@/lib/historico-modal-scroll';
import {
  CATEGORIAS_DOCUMENTO, EXTENSOES_PROVISORIAS, ErroDocumento,
  formatarDataDocumento, formatarTamanhoDocumento, obterDownloadDocumento,
  validarSelecaoDocumento, type CategoriaDocumento, type FiltroCategoriaDocumento, type SituacaoDocumentoFiltro,
} from '@/lib/documentos';
import { useDocumentos, useEnviarDocumento } from '@/hooks/use-documentos';
import { IndicadorCarregamento } from '@/app/components/indicador-carregamento';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { arquivarDocumento, reativarDocumento, editarDocumento, verificarDocumento, reabrirDocumento, type DocumentoContratual } from '@/lib/documentos';

const categorias = Object.entries(CATEGORIAS_DOCUMENTO) as [CategoriaDocumento, string][];
const selecaoInicial: CategoriaDocumento = 'CONTRATO_PRINCIPAL';
const campos = 'w-full min-w-0 rounded-lg border border-brand-green/40 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-60';
type Filtros = { categoria: FiltroCategoriaDocumento; pagina: number; busca: string; arquivados: boolean; situacao: SituacaoDocumentoFiltro };
const filtrosIniciais: Filtros = { categoria: '', pagina: 1, busca: '', arquivados: false, situacao: 'ATIVOS' };
// useSyncExternalStore mantém a primeira renderização de SSR/hidratação consistente,
// sem recorrer a setState síncrono dentro de efeitos (React 19 / ESLint).
const observarCliente = () => () => {};
const snapshotCliente = () => true;
const snapshotServidor = () => false;

/** Dados de consulta ficam no cache privado do ProvedorConsultas; persistimos apenas filtros inofensivos por contrato. */
function lerFiltros(contratoId: string): Filtros {
  try {
    const json = sessionStorage.getItem(`tec08-documentos-filtro:${contratoId}`);
    if (!json) return filtrosIniciais;
    const f = JSON.parse(json) as Partial<Filtros>;
    return {
      categoria: f.categoria && Object.hasOwn(CATEGORIAS_DOCUMENTO, f.categoria) ? f.categoria : '',
      pagina: Number.isInteger(f.pagina) && f.pagina! >= 1 && f.pagina! <= 10000 ? f.pagina! : 1,
      busca: typeof f.busca === 'string' ? f.busca.slice(0, 120) : '',
      arquivados: f.arquivados === true || f.situacao === 'ARQUIVADO',
      situacao: ['ATIVOS','PENDENTE_VERIFICACAO','EM_REVISAO','VERIFICADO','ARQUIVADO'].includes(f.situacao ?? '') ? f.situacao! : f.arquivados ? 'ARQUIVADO' : 'ATIVOS',
    };
  } catch { return filtrosIniciais; }
}

export function PainelDocumentos({ contratoId, habilitado, podeAnexar,
  podeEditarMetadados = podeAnexar, podeArquivarDocumentos = podeAnexar, podeReativarDocumentos = false, podeArquivarPrincipal = false, podeReativarPrincipal = false, podeVerificarDocumentos = false, podeReabrirDocumentos = false, podeVerificarPrincipal = false, podeReabrirPrincipal = false, permitirRegularizarPrincipal = false, somenteLeitura = false, estadoContextual = 'normal', onDocumentoAlterado }: {
  contratoId: string; habilitado: boolean; podeAnexar: boolean;
  podeEditarMetadados?: boolean; podeArquivarDocumentos?: boolean; podeReativarDocumentos?: boolean; podeExcluirDocumentosArquivados?: boolean; podeArquivarPrincipal?: boolean; podeReativarPrincipal?: boolean; podeExcluirPrincipal?: boolean; podeVerificarDocumentos?: boolean; podeReabrirDocumentos?: boolean; podeVerificarPrincipal?: boolean; podeReabrirPrincipal?: boolean; permitirRegularizarPrincipal?: boolean; somenteLeitura?: boolean; estadoContextual?: EstadoContextual; onDocumentoAlterado?: () => void;
}) {
  const [filtros, setFiltros] = useState<Filtros>(() => lerFiltros(contratoId));
  const preparado = useSyncExternalStore(observarCliente, snapshotCliente, snapshotServidor);
  const filtrosAtivos = preparado ? filtros : filtrosIniciais;
  // null: abertura automática da jornada pós-cadastro; boolean: decisão explícita do usuário.
  const [aberturaManual, setAberturaManual] = useState<boolean | null>(null);
  const [categoriaEnvio, setCategoriaEnvio] = useState<CategoriaDocumento>(podeAnexar ? selecaoInicial : 'ANEXO');
  const [descricao, setDescricao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroFormulario, setErroFormulario] = useState('');
  const [erroDownload, setErroDownload] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [documentoEdicao, setDocumentoEdicao] = useState<DocumentoContratual | null>(null);
  const [categoriaEdicao, setCategoriaEdicao] = useState<CategoriaDocumento>('ANEXO');
  const [descricaoEdicao, setDescricaoEdicao] = useState('');
  const [documentoArquivar, setDocumentoArquivar] = useState<DocumentoContratual | null>(null);
  const [documentoDetalhe, setDocumentoDetalhe] = useState<DocumentoContratual | null>(null);
  const [documentoVerificar, setDocumentoVerificar] = useState<DocumentoContratual | null>(null);
  const [documentoReabrir, setDocumentoReabrir] = useState<DocumentoContratual | null>(null);
  const [documentoReativar, setDocumentoReativar] = useState<DocumentoContratual | null>(null);
  const [motivoDocumento, setMotivoDocumento] = useState('');
  const [ocultos, setOcultos] = useState<Set<string>>(() => new Set());
  const [salvandoMetadados, setSalvandoMetadados] = useState(false);
  const [erroMetadados, setErroMetadados] = useState('');
  const [baixandoId, setBaixandoId] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const resultadosRef = useRef<HTMLDivElement>(null);
  const alturaUltimosResultados = useRef(160);
  const [gatilhoModal, setGatilhoModal] = useState<HTMLButtonElement | null>(null);
  const modalId = useId();
  const sequenciaModal = useRef(0);
  const historicoModal = useRef<string | null>(null);
  const posicaoModal = useRef<{ x: number; y: number; restauracao: ScrollRestoration } | null>(null);
  const enviandoRef = useRef(false);
  const consulta = useDocumentos(contratoId, filtrosAtivos.categoria, filtrosAtivos.pagina, habilitado && preparado, filtrosAtivos.arquivados, filtrosAtivos.situacao);
  const totalAtivos = useDocumentos(contratoId, '', 1, habilitado && preparado);
  const totalArquivados = useDocumentos(contratoId, '', 1, habilitado && preparado, true);
  const totalRegistrados = totalAtivos.dados && totalArquivados.dados
    ? totalAtivos.dados.total + totalArquivados.dados.total : null;
  const limiteAtingido = totalRegistrados !== null && totalRegistrados >= 20;
  const principais = useDocumentos(contratoId, 'CONTRATO_PRINCIPAL', 1, habilitado && preparado);
  const enviar = useEnviarDocumento(contratoId);
  const protegido = consulta.erro instanceof ErroDocumento && [401, 403, 404].includes(consulta.erro.status);
  const documentos = habilitado && !protegido ? consulta.dados : undefined;
  const itens = documentos?.itens.filter(item => !ocultos.has(`${filtrosAtivos.arquivados ? 'arquivados' : 'ativos'}:${item.id}`) && item.nomeOriginal.toLocaleLowerCase('pt-BR').includes(filtrosAtivos.busca.trim().toLocaleLowerCase('pt-BR'))) ?? [];
  const podeEscrever = habilitado && podeAnexar && (!somenteLeitura || (permitirRegularizarPrincipal && principais.dados?.total === 0)) && !protegido;
  const podeEditarRegistro = habilitado && podeEditarMetadados && !protegido;
  const podeArquivarRegistro = habilitado && podeArquivarDocumentos && !protegido;
  const podeReativarRegistro = habilitado && podeReativarDocumentos && !protegido;
  const permiteVerificar = (documento: DocumentoContratual) => habilitado && !protegido && (documento.categoria === 'CONTRATO_PRINCIPAL' ? podeVerificarPrincipal : podeVerificarDocumentos);
  const permiteReabrir = (documento: DocumentoContratual) => habilitado && !protegido && (documento.categoria === 'CONTRATO_PRINCIPAL' ? podeReabrirPrincipal : podeReabrirDocumentos);
  const permiteArquivar = (documento: DocumentoContratual) => habilitado && !protegido && (documento.categoria === 'CONTRATO_PRINCIPAL' ? podeArquivarPrincipal : podeArquivarRegistro);
  const permiteReativar = (documento: DocumentoContratual) => habilitado && !protegido && (documento.categoria === 'CONTRATO_PRINCIPAL' ? podeReativarPrincipal : podeReativarRegistro);

  // Não reabrir automaticamente após recarregar um contrato cujo PDF já foi enviado.
  const solicitarPrincipal = preparado && !principais.carregando && principais.dados?.total === 0 &&
    new URLSearchParams(window.location.search).get('anexarDocumento') === 'principal';
  const formularioAberto = podeEscrever && (aberturaManual ?? solicitarPrincipal);
  // O modal abre sobre a página, sem scrollIntoView nem mudança de layout do contrato.
  // Entrada temporária do histórico: Voltar do navegador/mouse fecha somente o modal,
  // seguindo o mesmo padrão do painel de etapas já utilizado no projeto.
  const restaurarPosicao = useCallback(() => {
    const anterior = posicaoModal.current;
    posicaoModal.current = null;
    if (!anterior) return;
    const restaurar = () => {
      if (Math.abs(window.scrollX - anterior.x) > 1 || Math.abs(window.scrollY - anterior.y) > 1) {
        window.scrollTo({ left: anterior.x, top: anterior.y, behavior: 'instant' });
      }
      ajustarRestauracaoHistorico(anterior.restauracao);
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(restaurar);
    else restaurar();
  }, []);

  useEffect(() => {
    if (!formularioAberto || historicoModal.current) return;
    const marcador = `${modalId}:${++sequenciaModal.current}`;
    const anterior = window.history.state;
    posicaoModal.current = {
      x: window.scrollX, y: window.scrollY, restauracao: window.history.scrollRestoration,
    };
    ajustarRestauracaoHistorico('manual');
    window.history.pushState({ ...(anterior && typeof anterior === 'object' ? anterior : {}), __modalDocumento: marcador }, '', window.location.href);
    historicoModal.current = marcador;
  }, [formularioAberto, modalId]);

  useEffect(() => {
    function voltar() {
      const marcador = historicoModal.current;
      if (!marcador || window.history.state?.__modalDocumento === marcador) return;
      if (enviandoRef.current) {
        const atual = window.history.state;
        window.history.pushState({ ...(atual && typeof atual === 'object' ? atual : {}), __modalDocumento: marcador }, '', window.location.href);
        return;
      }
      historicoModal.current = null;
      setAberturaManual(false);
      restaurarPosicao();
    }
    window.addEventListener('popstate', voltar);
    return () => window.removeEventListener('popstate', voltar);
  }, [restaurarPosicao]);

  useEffect(() => () => {
    // Se o componente for desmontado por navegação, não manter scrollRestoration manual.
    if (posicaoModal.current) ajustarRestauracaoHistorico(posicaoModal.current.restauracao);
  }, []);

  function fecharModal(forcar = false) {
    if (enviandoRef.current && !forcar) return;
    const marcador = historicoModal.current;
    historicoModal.current = null;
    setAberturaManual(false);
    if (marcador && window.history.state?.__modalDocumento === marcador) window.history.back();
    restaurarPosicao();
  }

  function abrirModal(evento: MouseEvent<HTMLButtonElement>) {
    setGatilhoModal(evento.currentTarget);
    setErroFormulario('');

    // Principal já cadastrado: a lista de opções não mostra esta categoria,
    // portanto o valor do select também precisa ser válido antes de abrir.
    if (somenteLeitura && permitirRegularizarPrincipal) setCategoriaEnvio('CONTRATO_PRINCIPAL');
    else if (principais.dados?.total && categoriaEnvio === 'CONTRATO_PRINCIPAL') setCategoriaEnvio('ANEXO');
    setAberturaManual(true);
  }

  function atualizarFiltros(novos: Filtros) {
    setFiltros(novos);
    try { sessionStorage.setItem(`tec08-documentos-filtro:${contratoId}`, JSON.stringify(novos)); } catch { /* armazenamento de preferência opcional */ }
  }
  // As consultas por categoria têm chaves próprias. Quando uma categoria é selecionada,
  // manter a altura da região de resultados evita a página dar um salto enquanto o GET responde.
  // Sem espelhar dados entre contratos ou exibir informações de uma categoria errada.
  useLayoutEffect(() => {
    const caixa = resultadosRef.current;
    if (!caixa) return;
    if (consulta.carregando || !preparado) {
      caixa.style.minHeight = `${alturaUltimosResultados.current}px`;
    } else if (consulta.dados !== undefined && !consulta.erro) {
      // Manter a geometria nas trocas de filtro. Limitar a reserva a 720px
      // evita um bloco excessivo quando a página antiga tinha muitos arquivos.
      alturaUltimosResultados.current = Math.max(160, Math.min(720, caixa.offsetHeight));
      caixa.style.minHeight = `${alturaUltimosResultados.current}px`;
    } else {
      caixa.style.minHeight = `${alturaUltimosResultados.current}px`;
    }
  }, [consulta.carregando, consulta.dados, consulta.erro, preparado, filtrosAtivos.busca]);

  function erroMensagem(erro: unknown, padrao: string) {
    return erro instanceof Error ? erro.message : padrao;
  }
  async function salvarMetadados(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (somenteLeitura || !documentoEdicao || !podeEditarRegistro || documentoEdicao.categoria === 'CONTRATO_PRINCIPAL' || salvandoMetadados) return;
    setSalvandoMetadados(true); setErroMetadados('');
    try {
      if (descricaoEdicao !== (documentoEdicao.descricao ?? '') && descricaoEdicao.length > 70) {
        throw new Error('Descrição nova ou alterada: máximo de 70 caracteres. O texto antigo será preservado até ser editado.');
      }
      await editarDocumento(contratoId, documentoEdicao.id, {
        categoria: categoriaEdicao,
        ...(descricaoEdicao !== (documentoEdicao.descricao ?? '') ? { descricao: descricaoEdicao } : {}),
      });
      await Promise.allSettled([consulta.atualizar(), principais.atualizar(), totalAtivos.atualizar(), totalArquivados.atualizar()]);
      setDocumentoEdicao(null);
      onDocumentoAlterado?.();
      toastSucesso('Documento atualizado.');
    } catch (erro) { setErroMetadados(erroMensagem(erro, 'Não foi possível atualizar o documento.')); }
    finally { setSalvandoMetadados(false); }
  }
  async function confirmarVerificacao() {
    const documento = documentoVerificar;
    if (!documento || salvandoMetadados || (somenteLeitura && !(permitirRegularizarPrincipal && documento.categoria === 'CONTRATO_PRINCIPAL')) || !permiteVerificar(documento)) return;
    setSalvandoMetadados(true); setErroMetadados('');
    try {
      const verificado = await verificarDocumento(contratoId, documento.id);
      setDocumentoDetalhe(atual => atual?.id === documento.id ? verificado : atual);
      setDocumentoVerificar(null); onDocumentoAlterado?.(); toastSucesso('Documento verificado.');
      await Promise.allSettled([consulta.atualizar(), principais.atualizar(), totalAtivos.atualizar()]);
    } catch (e) { setDocumentoVerificar(null); setErroMetadados(erroMensagem(e, 'Não foi possível verificar o documento.')); }
    finally { setSalvandoMetadados(false); }
  }
  async function confirmarReaberturaDocumento() {
    const documento = documentoReabrir;
    if (!documento || salvandoMetadados || somenteLeitura || !permiteReabrir(documento)) return;
    setSalvandoMetadados(true); setErroMetadados('');
    try {
      const reaberto = await reabrirDocumento(contratoId, documento.id, motivoDocumento.trim());
      setDocumentoDetalhe(atual => atual?.id === documento.id ? reaberto : atual);
      setDocumentoReabrir(null); setMotivoDocumento(''); onDocumentoAlterado?.(); toastAviso('Documento em revisão: nova verificação necessária.');
      await Promise.allSettled([consulta.atualizar(), principais.atualizar(), totalAtivos.atualizar()]);
    } catch (e) { setErroMetadados(erroMensagem(e, 'Não foi possível reabrir o documento.')); }
    finally { setSalvandoMetadados(false); }
  }
  async function confirmarArquivamento() {
    if (somenteLeitura || !documentoArquivar || !permiteArquivar(documentoArquivar) || salvandoMetadados) return;
    setSalvandoMetadados(true); setErroMetadados('');
    try {
      await arquivarDocumento(contratoId, documentoArquivar.id);
      setOcultos(anteriores => { const novo = new Set(anteriores); novo.delete(`arquivados:${documentoArquivar.id}`); novo.add(`ativos:${documentoArquivar.id}`); return novo; });
      setDocumentoDetalhe(null); setDocumentoArquivar(null); setDocumentoEdicao(null);
      onDocumentoAlterado?.();
      toastAviso('Documento arquivado.');
      await Promise.allSettled([consulta.atualizar(), principais.atualizar(), totalAtivos.atualizar(), totalArquivados.atualizar()]);
    } catch (erro) { setErroMetadados(erroMensagem(erro, 'Não foi possível arquivar o documento.')); }
    finally { setSalvandoMetadados(false); }
  }
  /** Reativação somente de arquivados; backend valida permissão e estado. */
  async function reativarArquivado(documento: DocumentoContratual) {
    if (!permiteReativar(documento) || salvandoMetadados || !documento.arquivadoEm) return;
    setSalvandoMetadados(true); setErroMetadados('');
    try {
      await reativarDocumento(contratoId, documento.id, motivoDocumento.trim());
      setOcultos(anteriores => { const novo = new Set(anteriores); novo.delete(`ativos:${documento.id}`); novo.add(`arquivados:${documento.id}`); return novo; });
      setDocumentoDetalhe(null); setDocumentoReativar(null); setMotivoDocumento('');
      onDocumentoAlterado?.();
      toastSucesso('Documento reativado.');
      await Promise.allSettled([consulta.atualizar(), principais.atualizar(), totalAtivos.atualizar(), totalArquivados.atualizar()]);
    } catch (erro) { setErroMetadados(erroMensagem(erro, 'Não foi possível reativar o documento.')); }
    finally { setSalvandoMetadados(false); }
  }
  async function anexar(evento: FormEvent<HTMLFormElement>) {
    if (somenteLeitura && (!permitirRegularizarPrincipal || categoriaEnvio !== 'CONTRATO_PRINCIPAL')) return;
    evento.preventDefault();
    if (enviando || !podeEscrever) return;
    if (limiteAtingido) { setErroFormulario('O contrato atingiu 20 documentos, incluindo arquivados.'); return; }
    setErroFormulario('');
    const invalido = validarSelecaoDocumento(arquivo, categoriaEnvio);
    if (invalido) { setErroFormulario(invalido); return; }
    if (descricao.length > 70 || (descricao.trim() === '' && descricao.length > 0)) {
      setErroFormulario('Descrição inválida (máximo de 70 caracteres, sem espaços isolados).'); return;
    }
    enviandoRef.current = true;
    setEnviando(true);
    try {
      await enviar(categoriaEnvio, arquivo!, descricao);
      onDocumentoAlterado?.();
      toastSucesso('Documento anexado.');
      setArquivo(null); setDescricao('');
      if (inputArquivo.current) inputArquivo.current.value = '';
      // Cadastro não altera silenciosamente a categoria escolhida pelo usuário.
      // Apenas a consulta é invalidada pelo hook de upload. Se estiver nos
      // arquivados, a nova inclusão fica na aba Ativos.
      if (filtrosAtivos.arquivados || filtrosAtivos.situacao !== 'ATIVOS') atualizarFiltros({ ...filtrosAtivos, arquivados: false, situacao: 'ATIVOS', pagina: 1 });
      fecharModal(true);
    } catch (erro) {
      // Preservar File, categoria e descrição para nova tentativa; não recadastrar o contrato.
      setErroFormulario(erroMensagem(erro, 'Falha no upload. Tente novamente.'));
    } finally { enviandoRef.current = false; setEnviando(false); }
  }
  async function baixar(documentoId: string, nomeOriginal: string) {
    if (baixandoId || !habilitado) return;
    setErroDownload(''); setBaixandoId(documentoId);
    let endereco: string | null = null;
    try {
      const blob = await obterDownloadDocumento(contratoId, documentoId);
      endereco = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = endereco; link.download = nomeOriginal;
      document.body.appendChild(link);
      link.click(); link.remove();
    } catch (erro) {
      setErroDownload(erroMensagem(erro, 'Não foi possível baixar o documento.'));
    } finally {
      if (endereco) {
        const usado = endereco;
        window.setTimeout(() => URL.revokeObjectURL(usado), 60_000);
      }
      setBaixandoId(null);
    }
  }

  return <section data-pi-painel-contextual data-tec08-contexto-operacional data-tec08-estado={estadoContextual} id="documentos-contratuais" aria-labelledby="titulo-documentos" className="min-w-0 space-y-4 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h3 data-pi-titulo id="titulo-documentos" className="text-lg font-semibold text-foreground">Documentos</h3>
          <AbasRolaveis><div role="tablist" aria-label="Situação dos documentos" className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-brand-green/20 p-1">
            {([['ATIVOS', 'Ativos'], ['PENDENTE_VERIFICACAO', 'Pendentes de verificação'],
              ['EM_REVISAO', 'Em revisão'], ['VERIFICADO', 'Verificados'], ['ARQUIVADO', 'Arquivados']] as const)
              .map(([opcao, rotulo]) => <button type="button" role="tab" key={opcao}
              aria-label={opcao === 'ATIVOS' ? 'Documentos ativos' : opcao === 'ARQUIVADO' ? 'Documentos arquivados' : `Documentos: ${rotulo}`} aria-selected={filtrosAtivos.situacao === opcao}
              onClick={() => atualizarFiltros({ ...filtrosAtivos, situacao: opcao, arquivados: opcao === 'ARQUIVADO', pagina: 1, busca: '' })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filtrosAtivos.situacao === opcao
                ? opcao === 'ARQUIVADO' ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-700 text-white' : 'text-foreground/65 hover:bg-slate-700/30 hover:text-foreground'}`}>
              {opcao === 'ARQUIVADO' ? <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg> : <><IconeStatus tipo={opcao === 'ATIVOS' ? 'ativas' : opcao === 'EM_REVISAO' ? 'revisao' : opcao === 'PENDENTE_VERIFICACAO' ? 'pendentes' : 'concluidas'}/>{rotulo}</>}
            </button>)}
          </div></AbasRolaveis>
        </div>

      </div>
      {podeEscrever && <button data-pi-acao="primaria" data-tec08-acao="anexar-documento" data-tec08-contextual type="button" onClick={abrirModal} disabled={limiteAtingido}
        aria-haspopup="dialog" aria-controls="formulario-documento"
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green shadow-sm transition duration-150 hover:brightness-110 hover:shadow-[0_0_0_3px_rgba(84,211,56,0.16)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-neon">
        <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M13 2v7h7M12 13v6m-3-3h6"/>
        </svg>
        Anexar documento
      </button>}
    </div>
    {protegido ? <p role="status" className="text-sm">Acesso documental indisponível.</p> :
      !preparado || principais.carregando ? <p role="status" className="text-sm">Verificando documento principal...</p> :
      principais.erro ? <p role="status" className="text-sm text-foreground/70">Não foi possível confirmar se existe um documento principal.</p> :
      principais.dados?.total === 0 ? <p role="status" data-testid="documento-principal-ausente" className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">Documento principal (PDF) pendente de anexação.</p> : !principais.dados?.itens.some(d => Boolean(d.verificadoEm && !d.reabertoEm && !d.arquivadoEm)) ?
      <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">O PDF principal ainda precisa ser verificado para permitir a conclusão definitiva do contrato.</p> : null}

    {totalRegistrados !== null && totalRegistrados >= 18 && <p className="text-xs text-amber-200" aria-label="Limite de documentos">{20 - totalRegistrados} arquivo(s) disponíveis.</p>}
    {limiteAtingido && <p role="alert" className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-200">Limite de 20 documentos atingido. Arquivar não libera vagas.</p>}
    <p className="text-xs text-foreground/55">Máximo de 20 documentos por contrato (inclusive arquivados) e 10 anexos arquivados. Arquivar não permite apagar o histórico.</p>
    {podeEscrever && formularioAberto && preparado && createPortal(<ModalEtapa estadoContextual="normal"
      titulo="Anexar documento contratual" contexto="Documentos do contrato" rotuloFechar="Fechar anexo de documento"
      ocupado={enviando} focoRetorno={gatilhoModal} onFechar={() => fecharModal()}>
      <div id="formulario-documento">
        <form data-pi-formulario onSubmit={evento => void anexar(evento)} className="space-y-4" aria-label="Anexar documento contratual" noValidate>
          <p className="text-sm text-foreground/70">Selecione um arquivo para guardar neste contrato. Evidências das atividades são cadastradas em outra área.</p>
          {solicitarPrincipal && <p className="rounded-lg border border-brand-green/30 p-3 text-sm">O cadastro do contrato está concluído. O PDF principal pode ser anexado agora ou posteriormente.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="categoria-documento-envio" className="block text-sm font-medium">Categoria *</label>
              <select id="categoria-documento-envio" className={campos} value={categoriaEnvio} disabled={enviando || (somenteLeitura && permitirRegularizarPrincipal)}
                onChange={e => { setCategoriaEnvio(e.target.value as CategoriaDocumento); setErroFormulario(''); }}>
                {categorias.filter(([valor]) => (somenteLeitura && permitirRegularizarPrincipal) ? valor === 'CONTRATO_PRINCIPAL' : (valor !== 'CONTRATO_PRINCIPAL' || (podeAnexar && !principais.dados?.total))).map(([valor, titulo]) => <option key={valor} value={valor}>{titulo}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="arquivo-documento-envio" className="block text-sm font-medium">Arquivo *</label>
              <div data-pi-superficie className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-brand-green/40 bg-background px-2 py-1.5">
                {/* Input nativo permanece acessível e controlado pelo Playwright, mas não exibe
                    rótulos em inglês como Browse / No file selected ao usuário final. */}
                <input ref={inputArquivo} id="arquivo-documento-envio" type="file" className="sr-only"
                  accept={categoriaEnvio === 'CONTRATO_PRINCIPAL' ? '.pdf,application/pdf' : EXTENSOES_PROVISORIAS}
                  disabled={enviando} aria-describedby="ajuda-arquivo-documento arquivo-documento-nome"
                  onChange={e => { setArquivo(e.target.files?.[0] ?? null); setErroFormulario(''); }} />
                <button data-pi-acao="secundaria" type="button" disabled={enviando} onClick={() => inputArquivo.current?.click()}
                  className="rounded-md border border-brand-green/45 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-brand-green/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-neon disabled:opacity-50">
                  Escolher arquivo
                </button>
                <span id="arquivo-documento-nome" aria-live="polite" className="min-w-0 flex-1 break-all text-sm text-foreground/70">
                  {arquivo?.name ?? 'Nenhum arquivo selecionado'}
                </span>
              </div>
            </div>
          </div>
          <p id="ajuda-arquivo-documento" className="text-xs text-foreground/65">
            {categoriaEnvio === 'CONTRATO_PRINCIPAL'
              ? 'Documento principal: selecione um PDF de até aproximadamente 16 MB.'
              : 'Arquivos aceitos: PDF, PNG, JPG, WebP e TXT. Tamanho máximo: aproximadamente 16 MB por arquivo.'}
          </p>
          {arquivo && <p className="min-w-0 break-all text-xs text-foreground/70">Selecionado: {arquivo.name} ({formatarTamanhoDocumento(arquivo.size)})</p>}
          <div className="space-y-1">
            <label htmlFor="descricao-documento-envio" className="block text-sm font-medium">Descrição (opcional)</label>
            <textarea id="descricao-documento-envio" rows={2} maxLength={70} className={campos} value={descricao} disabled={enviando}
              onChange={e => { setDescricao(e.target.value); setErroFormulario(''); }} />
            <p className="text-xs text-foreground/55">{descricao.length}/70 caracteres</p>
          </div>
          {erroFormulario && <p role="alert" className="break-words text-sm text-error-text">{erroFormulario}</p>}
          {enviando && <div role="progressbar" aria-label="Envio em andamento" aria-valuetext="Enviando e verificando arquivo" className="rounded-lg border border-brand-green/30 p-3 text-sm">
            <IndicadorCarregamento compacto texto="Enviando e verificando arquivo..." />
          </div>}
          <div className="flex flex-wrap justify-end gap-2">
            <button data-pi-acao="secundaria" type="button" onClick={() => fecharModal()} disabled={enviando}
              className="rounded-lg border border-brand-green/45 px-4 py-2 text-sm font-semibold hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">Cancelar</button>
            <button data-pi-acao="primaria" type="submit" disabled={enviando || !arquivo}
              className="rounded-lg bg-brand-green px-4 py-2 font-semibold text-on-brand-green disabled:cursor-not-allowed disabled:opacity-50">
              {enviando ? 'Enviando...' : 'Enviar documento'}
            </button>
          </div>
        </form>
      </div>
    </ModalEtapa>, document.body)}
    {erroMetadados && !documentoEdicao && !documentoArquivar && <p role="alert" className="text-sm text-error-text">{erroMetadados}</p>}
    {(podeEditarRegistro || podeArquivarRegistro) && documentoEdicao && createPortal(<ModalEtapa titulo={`${documentoEdicao.categoria === 'CONTRATO_PRINCIPAL' ? 'Documento principal' : 'Documento'} · ${documentoEdicao.nomeOriginal}`}
      contexto="Metadados documentais" estadoContextual={documentoEdicao.arquivadoEm ? 'arquivado' : documentoEdicao.reabertoEm ? 'revisao' : documentoEdicao.verificadoEm ? 'concluido' : 'pendente'} compacto ocupado={salvandoMetadados} onFechar={() => setDocumentoEdicao(null)}>
      <form data-pi-formulario data-tec08-formulario-contextual onSubmit={evento => void salvarMetadados(evento)} className="space-y-4" aria-label="Editar metadados do documento">
        {documentoEdicao.categoria !== 'CONTRATO_PRINCIPAL' && podeEditarRegistro && <>
        <label className="block text-sm">Categoria
          <select className={`${campos} mt-1`} value={categoriaEdicao} onChange={e => setCategoriaEdicao(e.target.value as CategoriaDocumento)}>
            {categorias.filter(([valor]) => valor !== 'CONTRATO_PRINCIPAL').map(([valor, titulo]) => <option key={valor} value={valor}>{titulo}</option>)}
          </select>
        </label>
        <label className="block text-sm">Descrição
          <textarea className={`${campos} mt-1`} rows={2} maxLength={Math.max(70, documentoEdicao?.descricao?.length ?? 0)} value={descricaoEdicao} onChange={e => setDescricaoEdicao(e.target.value)} />
        </label>
        </>}
        {erroMetadados && <p role="alert" className="text-xs text-error-text">{erroMetadados}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-green/15 pt-3">
          <div className="flex gap-2"><button data-pi-acao="secundaria" type="button" disabled={salvandoMetadados} onClick={() => setDocumentoEdicao(null)} className="rounded-lg border border-brand-green/30 px-3 py-2 text-sm">Cancelar</button>
            {documentoEdicao.categoria !== 'CONTRATO_PRINCIPAL' && podeEditarRegistro && <button data-pi-acao="primaria" type="submit" disabled={salvandoMetadados} className="rounded-lg bg-brand-green px-3 py-2 text-sm font-semibold text-on-brand-green">Salvar alterações</button>}</div>
        </div>
      </form>
    </ModalEtapa>, document.body)}
    {documentoArquivar && createPortal(<div className="relative z-[160]"><ConfirmacaoSimples titulo="Arquivar documento?"
      descricao={`“${documentoArquivar.nomeOriginal}” ficará na consulta de arquivados, com arquivo e auditoria preservados. Arquivar não libera vaga no limite de 20.`}
      confirmar="Arquivar documento" perigoso ocupado={salvandoMetadados}
      onCancelar={() => { setDocumentoArquivar(null); setErroMetadados(''); }} onConfirmar={() => void confirmarArquivamento()} /></div>, document.body)}

    {documentoDetalhe && createPortal(<ModalEtapa titulo={documentoDetalhe.nomeOriginal} contexto="Documento contratual" acoes={<>
      {podeEditarRegistro && !somenteLeitura && !documentoDetalhe.arquivadoEm && !documentoDetalhe.verificadoEm && documentoDetalhe.categoria !== 'CONTRATO_PRINCIPAL' && <BotaoEditarModal rotulo="Editar metadados do documento" onClick={() => { setDocumentoEdicao(documentoDetalhe); setCategoriaEdicao(documentoDetalhe.categoria); setDescricaoEdicao(documentoDetalhe.descricao ?? ''); setErroMetadados(''); }} />}
      <MenuAcoesObjeto rotulo={documentoDetalhe.arquivadoEm || !!documentoDetalhe.verificadoEm ? 'Reabrir' : 'Fechar'} disabled={somenteLeitura || salvandoMetadados}
        acaoDireta={documentoDetalhe.arquivadoEm && permiteReativar(documentoDetalhe) ? () => setDocumentoReativar(documentoDetalhe)
          : !documentoDetalhe.arquivadoEm && !!documentoDetalhe.verificadoEm && permiteReabrir(documentoDetalhe) ? () => setDocumentoReabrir(documentoDetalhe) : undefined}>
        {!documentoDetalhe.arquivadoEm && !documentoDetalhe.verificadoEm && permiteArquivar(documentoDetalhe) &&
          <BotaoAcaoModal intencao="arquivar" disabled={somenteLeitura || salvandoMetadados} onClick={() => { setDocumentoArquivar(documentoDetalhe); setErroMetadados(''); }}>Arquivar</BotaoAcaoModal>}
        {!!documentoDetalhe.arquivadoEm && permiteReativar(documentoDetalhe) &&
          <BotaoAcaoModal intencao="reativar" disabled={somenteLeitura || salvandoMetadados} onClick={() => setDocumentoReativar(documentoDetalhe)}>⟳ Reativar</BotaoAcaoModal>}
      </MenuAcoesObjeto>
    </>} estadoContextual={documentoDetalhe.arquivadoEm ? 'arquivado' : documentoDetalhe.reabertoEm ? 'revisao' : documentoDetalhe.verificadoEm ? 'concluido' : 'pendente'} compacto ocupado={!!baixandoId} onFechar={() => setDocumentoDetalhe(null)}>
      <div className="space-y-3" aria-label="Detalhes do documento contratual">
        {(!documentoDetalhe.arquivadoEm && !documentoDetalhe.verificadoEm && permiteVerificar(documentoDetalhe)) &&
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-amber-200">Pendente de verificação</span>
            <button type="button" disabled={salvandoMetadados || (somenteLeitura && !(permitirRegularizarPrincipal && documentoDetalhe.categoria === 'CONTRATO_PRINCIPAL'))}
              onClick={() => setDocumentoVerificar(documentoDetalhe)}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">✓ Verificar</button>
          </div>}
        <dl data-pi-superficie className={`grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-2 ${documentoDetalhe.arquivadoEm ? 'border-amber-500/40' : documentoDetalhe.reabertoEm ? 'border-teal-500/40' : documentoDetalhe.verificadoEm ? 'border-violet-500/40' : 'border-amber-500/40'}`}>
          {([['Situação', documentoDetalhe.arquivadoEm ? 'Arquivado' : documentoDetalhe.reabertoEm ? 'Em revisão' : documentoDetalhe.verificadoEm ? 'Verificado' : 'Pendente de verificação'],
             ['Categoria', CATEGORIAS_DOCUMENTO[documentoDetalhe.categoria]],
             ['Arquivo', documentoDetalhe.nomeOriginal],
             ['Tamanho', formatarTamanhoDocumento(documentoDetalhe.tamanho)],
             ['Incluído em', formatarDataDocumento(documentoDetalhe.criadoEm)],
             ...(documentoDetalhe.arquivadoEm ? [['Arquivado em', formatarDataDocumento(documentoDetalhe.arquivadoEm)] as const] : []),
             ['Responsável', documentoDetalhe.autorNome || 'Autor registrado'],
             ['Descrição', documentoDetalhe.descricao || 'Não informada']] as const).map(([rotulo, valor]) =>
            <div key={rotulo} className="min-w-0"><dt className="text-xs text-foreground/60">{rotulo}</dt><dd className="mt-1 break-words">{valor}</dd></div>)}
        </dl>
        <button data-pi-acao="secundaria" type="button" onClick={() => void baixar(documentoDetalhe.id, documentoDetalhe.nomeOriginal)} disabled={!!baixandoId}
          className="rounded-lg border border-current/30 px-4 py-2 text-sm font-semibold text-foreground/80 hover:bg-foreground/10 disabled:opacity-50">Baixar arquivo</button>
      </div>
    </ModalEtapa>, document.body)}
    {documentoVerificar && createPortal(<div className="relative z-[160]"><ConfirmacaoSimples
      titulo="Verificar documento?" descricao={`Confirme a conferência de “${documentoVerificar.nomeOriginal}”. Esta decisão será auditada.`}
      confirmar="Verificar documento" ocupado={salvandoMetadados}
      onCancelar={() => setDocumentoVerificar(null)} onConfirmar={() => void confirmarVerificacao()}/></div>, document.body)}
    {documentoReabrir && createPortal(<div className="relative z-[160]"><ConfirmacaoSimples
      titulo="Reabrir verificação?" descricao={`“${documentoReabrir.nomeOriginal}” voltará à revisão e precisará de nova verificação.`}
      confirmar="Reabrir verificação" ocupado={salvandoMetadados}
      justificativa={motivoDocumento} onJustificativaChange={setMotivoDocumento}
      onCancelar={() => { setDocumentoReabrir(null); setMotivoDocumento(''); }} onConfirmar={() => void confirmarReaberturaDocumento()}/></div>, document.body)}
    {documentoReativar && createPortal(<div className="relative z-[160]"><ConfirmacaoSimples titulo="Reativar documento?"
      descricao={`“${documentoReativar.nomeOriginal}” voltará à aba de documentos ativos sem alterar o arquivo original nem seu histórico.`}
      confirmar="Confirmar reativação" ocupado={salvandoMetadados}
      justificativa={motivoDocumento} onJustificativaChange={setMotivoDocumento}
      onCancelar={() => { setDocumentoReativar(null); setMotivoDocumento(''); }} onConfirmar={() => void reativarArquivado(documentoReativar)} /></div>, document.body)}


    <div className="space-y-3" aria-label="Filtros de documentos">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,230px)]">
        <div className="min-w-0 space-y-1"><label htmlFor="busca-nome-documento" className="block text-sm font-medium">Buscar documento nesta página</label>
          <input id="busca-nome-documento" type="search" maxLength={120} className={campos} value={filtrosAtivos.busca}
            disabled={!habilitado || !preparado} onChange={e => atualizarFiltros({ ...filtrosAtivos, busca: e.target.value })}
            placeholder="Nome do arquivo..." /></div>
        <div className="min-w-0 space-y-1"><label htmlFor="filtro-categoria-documento" className="block text-sm font-medium">Categoria</label>
          <select id="filtro-categoria-documento" className={campos} value={filtrosAtivos.categoria} disabled={!habilitado || !preparado}
            onChange={e => atualizarFiltros({ ...filtrosAtivos, categoria: e.target.value as FiltroCategoriaDocumento, busca: '', pagina: 1 })}>
            <option value="">Todas as categorias</option>
            {categorias.map(([valor, titulo]) => <option key={valor} value={valor}>{titulo}</option>)}
          </select></div>
      </div>
    </div>
    <div ref={resultadosRef} data-testid="regiao-resultados-documentos" aria-busy={consulta.carregando || !preparado} className="min-w-0 space-y-3">
    {consulta.carregando || !preparado ? <div role="status" data-testid="resultados-estaveis-carregando"
      className="min-h-40 rounded-lg border border-brand-green/20 bg-background/25 p-3 text-xs text-foreground/60">
      Atualizando documentos desta categoria...
    </div> : consulta.erro ? <div className="space-y-2">
      <p role="alert" className="text-sm text-error-text">{erroMensagem(consulta.erro, 'Falha ao consultar documentos.')}</p>
      <button type="button" onClick={() => void consulta.atualizar().catch(() => {})} className="rounded-lg border border-brand-green/40 px-3 py-2 text-sm">Tentar novamente</button>
    </div> : documentos ? <>
      {documentos.total > 0 && <p className="text-xs text-foreground/60">{documentos.total} documento(s) · Página {documentos.pagina} de {documentos.totalPaginas}</p>}
      {documentos.total === 0 ? <p role="status" className="rounded-lg border border-brand-green/25 p-3 text-sm">{filtrosAtivos.arquivados ? 'Nenhum documento arquivado.' : 'Nenhum documento anexado ao contrato nesta categoria.'}</p> : itens.length === 0 ?
        <p role="status" className="rounded-lg border border-brand-green/25 p-3 text-sm">Nenhum nome correspondente nesta página. Limpe a busca ou navegue pelas páginas.</p> :
        <ul aria-label="Documentos contratuais" className="space-y-2">{itens.map(documento => <li key={documento.id} onClick={event => {
            if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) return;
            setDocumentoDetalhe(documento);
          }} data-pi-documento data-tec08-contexto-operacional data-tec08-estado={documento.arquivadoEm ? 'arquivado' : documento.reabertoEm ? 'revisao' : documento.verificadoEm ? 'concluido' : 'pendente'}
          className={`min-w-0 cursor-pointer rounded-xl border bg-background px-3 py-3 transition-colors hover:bg-slate-500/10 ${documento.arquivadoEm ? 'border-amber-500/60' : documento.reabertoEm ? 'border-teal-600/60' : documento.verificadoEm ? 'border-violet-400/60' : 'border-brand-green/25'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => setDocumentoDetalhe(documento)} aria-haspopup="dialog" data-pi-titulo aria-label={`Ver detalhes de ${documento.nomeOriginal}`}
                className="break-all text-left text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-amber-300">
                {documento.nomeOriginal}
              </button>
              <p className="mt-1 text-xs text-foreground/65">{CATEGORIAS_DOCUMENTO[documento.categoria]} · {formatarTamanhoDocumento(documento.tamanho)} · {formatarDataDocumento(documento.criadoEm)} · {documento.autorNome?.trim() || 'Autor registrado'}</p>
              {documento.descricao && <p className="mt-1 break-words text-xs text-foreground/60">{documento.descricao}</p>}
              <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs ${documento.arquivadoEm ? 'border-amber-500/50 text-amber-200' : documento.reabertoEm ? 'border-teal-500/50 text-teal-200' : documento.verificadoEm ? 'border-violet-500/50 text-violet-200' : 'border-yellow-500/50 text-yellow-700 dark:text-yellow-200'}`}>
                {documento.arquivadoEm ? 'Arquivado' : documento.reabertoEm ? 'Em revisão' : documento.verificadoEm ? 'Verificado' : 'Pendente de verificação'}</span>
            </div>
          </div>
        </li>)}</ul>}
      {documentos.totalPaginas > 1 && <nav aria-label="Páginas dos documentos" className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={filtrosAtivos.pagina <= 1} className="rounded-lg border border-brand-green/45 px-3 py-2 text-sm disabled:opacity-40"
          onClick={() => atualizarFiltros({ ...filtrosAtivos, pagina: filtrosAtivos.pagina - 1, busca: '' })}>Página anterior</button>
        <span className="text-sm">{documentos.pagina} / {documentos.totalPaginas}</span>
        <button type="button" disabled={filtrosAtivos.pagina >= documentos.totalPaginas} className="rounded-lg border border-brand-green/45 px-3 py-2 text-sm disabled:opacity-40"
          onClick={() => atualizarFiltros({ ...filtrosAtivos, pagina: filtrosAtivos.pagina + 1, busca: '' })}>Próxima página</button>
      </nav>}
    </> : null}
    </div>
    {erroDownload && <p role="alert" className="break-words text-sm text-error-text">{erroDownload} <span>Se o arquivo estiver indisponível, tente novamente mais tarde.</span></p>}
  </section>;
}
