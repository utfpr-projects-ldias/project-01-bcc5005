'use client';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { dataPlanejada, ROTULOS_PERIODICIDADE, ROTULOS_TIPO, type Entregavel, type ResumoDocumentalEntregavel } from '@/lib/entregaveis';
import { PainelComprovacaoEvidencia } from './painel-comprovacao-evidencia';
import { listarEvidenciasArquivadas, alterarArquivoEvidencia, criarEvidenciaEsperada, enviarComprovante, consultarEvidencia, reabrirEvidencia, excluirEvidenciaArquivada, CLASSE_STATUS, ROTULO_STATUS, categoriaVisivelEvidencia, type StatusComprovante, aceitarArquivoEvidencia, arquivoCompativelEvidencia } from '@/lib/comprovantes';
import { ModalEtapa } from './modal-etapa';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { HistoricoEntregavel } from './historico-entregavel';
import { AtividadesVinculadas } from './atividades-vinculadas';
import { IconeEvidencia } from './icone-evidencia';
import { estadoVisualEvidencia } from '@/lib/estado-visual-evidencia';
import { nomeArquivoLegivel } from '@/lib/nome-arquivo';
import { rotuloCodigoPublico } from '@/lib/codigos-publicos';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';

type Campo = [nome: string, valor: string | null | undefined];
function Quadro({ titulo, campos, estado = 'normal' }: { titulo: string; campos: Campo[]; estado?: 'normal' | 'concluido' | 'arquivado' }) {
  return <section data-tec08-secao-contextual className={`min-w-0 space-y-2 rounded-xl border p-3 sm:p-4 ${estado === 'arquivado' ? 'border-amber-500/45 bg-amber-500/[0.04]' : estado === 'concluido' ? 'border-violet-400/40 bg-violet-500/[0.04]' : 'border-brand-green/20 bg-brand-darkgreen/5'}`}>
    <h2 className={`text-lg font-semibold ${estado === 'arquivado' ? 'text-amber-200' : estado === 'concluido' ? 'text-violet-200' : 'text-brand-neon'}`}>{titulo}</h2>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm lg:grid-cols-3">
      {campos.map(([nome, valor]) => <div key={nome} className={`min-w-0 ${nome === 'Critério operacional' ? 'col-span-full' : ''}`}><dt className="text-xs text-foreground/60">{nome}</dt>
        <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">{valor?.trim() || 'Não informado'}</dd></div>)}
    </dl>
  </section>;
}
export function ConteudoEntregavel({ item, resumoInicial, podeEditarEsperada = false, podeCriarEvidencia,
  podeArquivarEvidencia, podeReativarEvidencia = false, podeReabrirEvidencia = false, podeExcluirEvidenciaArquivada = false, podeAlterarObrigatoriedade = false, podeEnviarComprovantes = true, podeVerHistorico = false, bloqueadoPorPai = false, paiArquivado = false, paiConcluido = false, contextoModal = false, aoAtualizarEsperada,
  registrarVoltaEvidencia, registrarVoltaEdicao }: {
  item: Entregavel; resumoInicial?: ResumoDocumentalEntregavel; podeEditarEsperada?: boolean;
  podeCriarEvidencia?: boolean; podeArquivarEvidencia?: boolean; podeReativarEvidencia?: boolean; podeReabrirEvidencia?: boolean; podeExcluirEvidenciaArquivada?: boolean; podeAlterarObrigatoriedade?: boolean;
  podeEnviarComprovantes?: boolean; podeVerHistorico?: boolean; bloqueadoPorPai?: boolean; paiArquivado?: boolean; paiConcluido?: boolean; paiEmRevisao?: boolean; contextoModal?: boolean;
  aoAtualizarEsperada?: () => void;
  registrarVoltaEvidencia?: (voltar: (() => void) | null) => void;
  registrarVoltaEdicao?: (voltar: (() => void) | null) => void;
}) {
  const [evidenciaId, setEvidenciaId] = useState<string | null>(null);
  const [editarEvidenciaAberta, setEditarEvidenciaAberta] = useState(false);
  const [edicaoAberta, setEdicaoAberta] = useState(false);
  const voltarEdicaoRef = useRef<(() => void) | null>(null);
  // Um history.back() do editor retorna primeiro à evidência, não à etapa.
  const ignorarRetornoEditor = useRef(false);
  const registrarEditor = useCallback((voltar: (() => void) | null) => {
    if (!voltar && voltarEdicaoRef.current && window.history.state?.__edicaoEvidencia)
      ignorarRetornoEditor.current = true;
    voltarEdicaoRef.current = voltar; setEdicaoAberta(Boolean(voltar)); registrarVoltaEdicao?.(voltar);
  }, [registrarVoltaEdicao]);
  const [versaoEstado, setVersaoEstado] = useState(0);
  const [ocultasLocais, setOcultasLocais] = useState<string[]>([]);
  const evidenciasAtivas = item.evidenciasEsperadas.filter(e => !ocultasLocais.includes(e.id));
  const [historicoExpandido, setHistoricoExpandido] = useState(false);
  const chaveEvidencias = `${item.contratoId}:${item.id}:${item.evidenciasEsperadas.map(e => e.id).join(',')}:${versaoEstado}`;
  const [consultaStatus, setConsultaStatus] = useState<{ chave: string; status: Record<string, { status: StatusComprovante; arquivo: string | null; reabertoEm?: string | null }> }>({ chave: '', status: {} });
  const statusInicialCarregado = item.evidenciasEsperadas.length === 0 ||
    consultaStatus.chave === chaveEvidencias;
  const estadoEvidencias = statusInicialCarregado ? consultaStatus.status : {}; // sem cartão provisório na aba errada
  const [focoRetornoEvidencia, setFocoRetornoEvidencia] = useState<HTMLButtonElement | null>(null);
  useEffect(() => {
    let ativo = true;
    // Máximo de dez registros por entregável. Uma consulta sem sucesso não vira
    // falsamente 'aguardando envio'; o status fica indisponível.
    // A chave inclui a lista de IDs, sem depender da identidade instável do array da API.
    const ids = chaveEvidencias.split(':')[2]?.split(',').filter(Boolean) ?? [];
    if (!ids.length) return;
    void Promise.allSettled(ids.map(id => consultarEvidencia(item.contratoId, item.id, id)))
      .then(resultados => { if (!ativo) return;
        const mapa: Record<string, { status: StatusComprovante; arquivo: string | null; reabertoEm?: string | null }> = {};
        resultados.forEach((resultado, indice) => {
          if (resultado.status === 'fulfilled' && resultado.value.id === ids[indice] &&
            resultado.value.contratoId === item.contratoId && resultado.value.entregavelId === item.id)
            mapa[ids[indice]] = { status: resultado.value.status, arquivo: resultado.value.versoes[0]?.nomeOriginal ?? null, reabertoEm: resultado.value.reabertoEm };
        });
        setConsultaStatus({ chave: chaveEvidencias, status: mapa });
      });
    return () => { ativo = false; };
  }, [chaveEvidencias, item.contratoId, item.id]);
  const atualizarEstadoEvidencias = () => setVersaoEstado(numero => numero + 1);
  const [confirmarReabertura, setConfirmarReabertura] = useState<string | null>(null);
  const [motivoEvidencia, setMotivoEvidencia] = useState('');
  const [confirmarArquivamento, setConfirmarArquivamento] = useState<string | null>(null);
  const [arquivandoItem, setArquivandoItem] = useState(false);
  async function executarReaberturaEvidencia() {
    const id = confirmarReabertura;
    if (!id || arquivandoItem || bloqueadoPorPai || !podeReabrirEvidencia) return;
    setArquivandoItem(true); setErroArquivo('');
    try {
      await reabrirEvidencia(item.contratoId, item.id, id, motivoEvidencia.trim());
      setConfirmarReabertura(null); setMotivoEvidencia('');
      toastSucesso('Evidência reaberta para verificação.');
      atualizarEstadoEvidencias(); aoAtualizarEsperada?.();
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível reabrir a evidência.'); }
    finally { setArquivandoItem(false); }
  }
  async function arquivarEvidenciaDireta() {
    const id = confirmarArquivamento;
    if (!id || arquivandoItem) return;
    setArquivandoItem(true); setErroArquivo('');
    try {
      await alterarArquivoEvidencia(item.contratoId, item.id, id, 'arquivar');
      setConfirmarArquivamento(null);
      setOcultasLocais(atuais => [...new Set([...atuais, id])]);
      // A lista local muda imediatamente; o refresh não esconde/recria o modal.
      if (evidenciaId === id) setEvidenciaId(null);
      toastAviso('Evidência arquivada.');
      atualizarEstadoEvidencias(); aoAtualizarEsperada?.();
      void listarEvidenciasArquivadas(item.contratoId, item.id).then(setArquivadas).catch(() => {});
    } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Não foi possível arquivar a evidência.'); }
    finally { setArquivandoItem(false); }
  }
  const classeAbaAtiva = item.arquivadoEm ? 'bg-amber-500/20 text-amber-200' : item.reabertoEm ? 'bg-teal-700/25 text-teal-200' : item.statusExecucao === 'CONCLUIDO' ? 'bg-violet-500/20 text-violet-200' : 'bg-brand-green text-on-brand-green';
  const [abaChecklist, setAbaChecklist] = useState<'ativas' | 'pendentes' | 'revisao' | 'concluidas' | 'arquivadas'>('ativas');
  const abrirArquivo = abaChecklist === 'arquivadas';
  const [arquivadas, setArquivadas] = useState<Array<{ id: string; codigoPublico?: number; tipoEvidencia: string; obrigatoria: boolean; arquivadoEm: string | null }>>([]);
  const selecionada = (abrirArquivo ? arquivadas.find(e => e.id === evidenciaId) : undefined) ?? item.evidenciasEsperadas.find(e => e.id === evidenciaId) ?? arquivadas.find(e => e.id === evidenciaId);
  const [criandoEvidencia, setCriandoEvidencia] = useState(false);
  const [novoTipo, setNovoTipo] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [novaObrigatoria, setNovaObrigatoria] = useState(true);
  const [novoArquivo, setNovoArquivo] = useState<File | null>(null);
  const [novaEvidenciaCriadaId, setNovaEvidenciaCriadaId] = useState<string | null>(null);
  const [erroCadastro, setErroCadastro] = useState('');
  const [salvandoNova, setSalvandoNova] = useState(false);
  const historicoCadastro = useRef<string | null>(null);
  const sequenciaCadastro = useRef(0);
  function fecharCadastro(forcar = false) {
    if (salvandoNova && !forcar) return;
    setCriandoEvidencia(false);
    setNovoArquivo(null); setNovoTipo(''); setNovaDescricao(''); setNovaObrigatoria(true);
    setNovaEvidenciaCriadaId(null); setErroCadastro('');
    registrarVoltaEvidencia?.(null);
    const marcador = historicoCadastro.current;
    historicoCadastro.current = null;
    if (marcador && window.history.state?.__cadastroEvidencia === marcador) window.history.back();
  }
  function abrirCadastro() {
    if (criandoEvidencia) { fecharCadastro(); return; }
    const marcador = `cadastro-evidencia:${item.id}:${++sequenciaCadastro.current}`;
    const anterior = window.history.state;
    window.history.pushState({ ...(anterior && typeof anterior === 'object' ? anterior : {}), __cadastroEvidencia: marcador }, '', window.location.href);
    historicoCadastro.current = marcador;
    setErroCadastro(''); setNovaEvidenciaCriadaId(null); setCriandoEvidencia(true);
    registrarVoltaEvidencia?.(fecharCadastro);
  }
  useEffect(() => {
    function aoVoltarCadastro() {
      const marcador = historicoCadastro.current;
      if (!marcador || window.history.state?.__cadastroEvidencia === marcador) return;
      historicoCadastro.current = null;
      setCriandoEvidencia(false);
      registrarVoltaEvidencia?.(null);
    }
    window.addEventListener('popstate', aoVoltarCadastro);
    return () => window.removeEventListener('popstate', aoVoltarCadastro);
  }, [registrarVoltaEvidencia]);
  async function adicionarEvidencia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (salvandoNova || bloqueadoPorPai || !(podeCriarEvidencia ?? podeEditarEsperada)) return;
    if (novoArquivo && !arquivoCompativelEvidencia(novoTipo, novoArquivo)) { setErroCadastro('O arquivo não corresponde ao tipo Foto ou Relatório selecionado.'); return; }
    if (!novaEvidenciaCriadaId && novoTipo.trim().length > 60) { setErroCadastro('O título deve ter no máximo 60 caracteres.'); return; }
    setErroCadastro(''); setSalvandoNova(true);
    let id = novaEvidenciaCriadaId;
    try {
      if (!id) {
        const criada = await criarEvidenciaEsperada(item.contratoId, item.id, {
          tipoEvidencia: novoTipo.trim(), descricao: novaDescricao.trim() || null,
          obrigatoria: podeAlterarObrigatoriedade ? novaObrigatoria : true,
        });
        id = criada.id;
        setNovaEvidenciaCriadaId(id);
        // O cadastro já foi confirmado no banco; uma falha no upload não deve duplicá-lo.
        aoAtualizarEsperada?.();
      }
      if (novoArquivo && podeEnviarComprovantes) {
        await enviarComprovante(item.contratoId, item.id, id, novoArquivo, '');
      }
      setSalvandoNova(false); fecharCadastro(true); setNovoTipo(''); setNovaDescricao(''); setNovaObrigatoria(true);
      setNovoArquivo(null); setNovaEvidenciaCriadaId(null);
      atualizarEstadoEvidencias(); aoAtualizarEsperada?.();
    } catch (erro) {
      setErroCadastro(`${id ? 'O cadastro foi salvo. ' : ''}${erro instanceof Error ? erro.message : 'Não foi possível adicionar a evidência.'} ${id ? 'Se houve falha no arquivo, tente novamente sem cadastrar outro item.' : ''}`);
    } finally { setSalvandoNova(false); }
  }
  const [erroArquivo, setErroArquivo] = useState('');
  const [ocupadoArquivo, setOcupadoArquivo] = useState(false);
  const [confirmarReativacao, setConfirmarReativacao] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);
  async function alternarArquivo() {
    if (abrirArquivo) { setEvidenciaId(null); setAbaChecklist('ativas'); return; }
    setErroArquivo('');
    try { const lista = await listarEvidenciasArquivadas(item.contratoId, item.id); setEvidenciaId(null); setArquivadas(lista); setAbaChecklist('arquivadas'); }
    catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Não foi possível consultar evidências arquivadas.'); }
  }
  async function reativar() {
    const id = confirmarReativacao;
    if (!id || ocupadoArquivo || !podeReativarEvidencia || bloqueadoPorPai) return;
    setOcupadoArquivo(true); setErroArquivo('');
    try {
      await alterarArquivoEvidencia(item.contratoId, item.id, id, 'reativar', motivoEvidencia.trim());
      // O item volta às ativas, mas permanece nesta aba de arquivadas.
      // Nenhum detalhe é aberto automaticamente após a atualização.
      setEvidenciaId(null);
      setConfirmarReativacao(null); setMotivoEvidencia('');
      setArquivadas(anterior => anterior.filter(e => e.id !== id));
      setOcultasLocais(atuais => atuais.filter(valor => valor !== id));
      toastSucesso('Evidência reativada.');
      atualizarEstadoEvidencias(); aoAtualizarEsperada?.();
    } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Falha na reativação.'); }
    finally { setOcupadoArquivo(false); }
  }
  // O painel de detalhe tem rolagem própria. Substituir sua árvore por um detalhe
  // pequeno reduz o scrollHeight e faz o navegador voltar o scrollTop para zero.
  // Capturamos a posição ANTES dessa troca e restauramos no commit do React,
  // antes da pintura, sem scrollIntoView e sem alterar a rolagem do contrato.
  const origem = useRef<{ area: HTMLElement | null; topo: number; esquerda: number;
    paginaY: number; paginaX: number; botao: HTMLButtonElement; evidenciaId: string } | null>(null);
  const restaurarAoVoltar = useRef(false);
  const historicoEvidencia = useRef<string | null>(null);
  const sequenciaEvidencia = useRef(0);
  // Cada nivel de detalhe usa uma entrada própria no histórico; o botão voltar
  // do navegador retorna uma evidência ao entregável, sem fechar o modal-pai.
  useEffect(() => {
    const voltarHistorico = () => {
      const marcador = historicoEvidencia.current;
      if (!marcador) return;
      // As entradas aninhadas do editor herdam __modalEvidencia. O primeiro
      // Voltar fecha o editor; o segundo deve fechar a evidência, mesmo se
      // o roteador clonou o marcador para uma entrada intermediária.
      if (ignorarRetornoEditor.current) { ignorarRetornoEditor.current = false; return; }
      if (window.history.state?.__modalEvidencia === marcador) return;
      historicoEvidencia.current = null;
      restaurarAoVoltar.current = true;
      registrarVoltaEvidencia?.(null);
      setEditarEvidenciaAberta(false);
      setEvidenciaId(null);
    };
    window.addEventListener('popstate', voltarHistorico);
    return () => window.removeEventListener('popstate', voltarHistorico);
  }, [registrarVoltaEvidencia]);
  function abrirEvidencia(evento: MouseEvent<HTMLButtonElement>, id: string, editar = false) {
    if (evidenciaId) return; // Evita duplo clique duplicar o histórico e gerar duas camadas.
    const area = evento.currentTarget.closest<HTMLElement>('.overflow-y-auto');
    origem.current = { area, topo: area?.scrollTop ?? 0, esquerda: area?.scrollLeft ?? 0,
      paginaY: window.scrollY, paginaX: window.scrollX, botao: evento.currentTarget, evidenciaId: id };
    restaurarAoVoltar.current = false;
    ignorarRetornoEditor.current = false;
    setFocoRetornoEvidencia(evento.currentTarget);
    setEditarEvidenciaAberta(editar);
    const marcador = `evidencia:${item.id}:${id}:${++sequenciaEvidencia.current}`;
    const estado = window.history.state;
    window.history.pushState({ ...(estado && typeof estado === 'object' ? estado : {}), __modalEvidencia: marcador }, '', window.location.href);
    historicoEvidencia.current = marcador;
    registrarVoltaEvidencia?.(voltarAoEntregavel);
    setEvidenciaId(id);
  }
  function voltarAoEntregavel() {
    restaurarAoVoltar.current = true;
    registrarVoltaEvidencia?.(null);
    setEvidenciaId(null);
    setEditarEvidenciaAberta(false);
    const marcador = historicoEvidencia.current;
    historicoEvidencia.current = null;
    ignorarRetornoEditor.current = false;
    if (marcador && window.history.state?.__modalEvidencia === marcador) window.history.back();
  }
  useLayoutEffect(() => {
    if (evidenciaId !== null || !restaurarAoVoltar.current) return;
    restaurarAoVoltar.current = false;
    const anterior = origem.current;
    origem.current = null;
    if (!anterior) return;
    if (anterior.area?.isConnected) {
      anterior.area.scrollTop = anterior.topo;
      anterior.area.scrollLeft = anterior.esquerda;
    } else if (window.scrollY !== anterior.paginaY || window.scrollX !== anterior.paginaX) {
      // Compatibilidade com a página completa (sem painel modal externo).
      window.scrollTo({ left: anterior.paginaX, top: anterior.paginaY, behavior: 'instant' });
    }
    // O botão original geralmente permanece montado sob a camada aninhada.
    // Localizamos pelo identificador estável para restaurar o foco,
    // dentro do mesmo painel, antes de restaurar o foco sem deslocar a rolagem.
    const raiz = anterior.area?.isConnected ? anterior.area : document;
    const botaoAtual = Array.from(raiz.querySelectorAll<HTMLButtonElement>('[data-evidencia-esperada-id]'))
      .find((botao) => botao.dataset.evidenciaEsperadaId === anterior.evidenciaId);
    if (botaoAtual?.isConnected) botaoAtual.focus({ preventScroll: true });
    else if (anterior.botao.isConnected) anterior.botao.focus({ preventScroll: true });
  }, [evidenciaId]);
  const campos: Campo[] = [
    ['Código', item.codigo], ['Tipo', ROTULOS_TIPO[item.tipo]],
    ['Início previsto', dataPlanejada(item.inicioPrevisto)], ['Término previsto', dataPlanejada(item.terminoPrevisto)],
    ['Responsável cadastral', item.responsavel ? `${item.responsavel.nome || 'Nome não informado'} — ${item.responsavel.email}` : item.responsavelId ? 'Responsável atribuído' : null],
    ...(item.tipo === 'QUANTITATIVO' ? [
      ['Quantidade prevista', item.quantidadePrevista], ['Unidade de medida', item.unidadeMedida],
    ] as Campo[] : []),
    ...(item.tipo === 'RECORRENTE' ? [
      ['Periodicidade', item.periodicidade ? ROTULOS_PERIODICIDADE[item.periodicidade] : null],
      ['Configuração de recorrência', item.configuracaoPeriodicidade ? `Versão ${item.configuracaoPeriodicidade.versao}` : null],
    ] as Campo[] : []),
    ['Peso operacional', item.peso === null ? null : `${item.peso}%`],
    ['Observações', item.observacoes],
    ...(item.criterioConclusao?.trim() ? [['Critério operacional', item.criterioConclusao]] as Campo[] : []),
  ];
  const evidenciaNaAba = (id: string): boolean => {
    const status = estadoEvidencias[id];
    if (abaChecklist === 'concluidas') return status?.status === 'VERIFICADA';
    if (abaChecklist === 'revisao') return Boolean(status?.reabertoEm && status?.status !== 'VERIFICADA');
    if (abaChecklist === 'pendentes') return Boolean(status && status.status !== 'VERIFICADA' && !status.reabertoEm);
    return status?.status !== 'VERIFICADA' && !status?.reabertoEm;
  };
  return <><div data-tec08-contexto-operacional data-tec08-estado={item.arquivadoEm ? 'arquivado' : item.reabertoEm ? 'revisao' : item.statusExecucao === 'CONCLUIDO' ? 'concluido' : 'normal'} className="min-w-0 space-y-3">
    {item.descricao && <p className="whitespace-pre-wrap break-words text-xs text-foreground/75">{item.descricao}</p>}
    <Quadro titulo="Identificação e planejamento" campos={campos} estado={item.arquivadoEm ? 'arquivado' : item.statusExecucao === 'CONCLUIDO' && !item.reabertoEm ? 'concluido' : 'normal'} />
    {podeVerHistorico && <details onToggle={evento => setHistoricoExpandido(evento.currentTarget.open)} className="rounded-xl border border-brand-green/20 px-3 py-2">
      <summary data-tec08-titulo-historico className="cursor-pointer text-sm font-semibold text-brand-neon">Rastreabilidade do entregável</summary>
      {historicoExpandido && <HistoricoEntregavel contratoId={item.contratoId} entregavelId={item.id} versao={versaoEstado} ocultarTitulo />}
    </details>}
    <section className={`min-h-[min(34dvh,300px)] space-y-3 rounded-xl border p-3 sm:p-4 ${item.arquivadoEm ? 'border-amber-500/45 bg-amber-500/[0.04]' : item.statusExecucao === 'CONCLUIDO' ? 'border-violet-400/40 bg-violet-500/[0.04]' : item.reabertoEm ? 'border-teal-700/40 bg-teal-700/[0.04]' : 'border-brand-green/20 bg-brand-darkgreen/5'}`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:flex-nowrap">
        <AbasRolaveis className="min-w-0 flex-1"><div role="tablist" aria-label="Consultar evidências" className={`inline-flex items-center gap-1 rounded-xl border p-1 ${item.arquivadoEm ? 'border-amber-500/40' : item.statusExecucao === 'CONCLUIDO' ? 'border-violet-400/35' : item.reabertoEm ? 'border-teal-700/35' : 'border-brand-green/20'}`}>
          <button type="button" role="tab" aria-selected={abaChecklist === 'ativas'} onClick={() => setAbaChecklist('ativas')}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-none ${abaChecklist === 'ativas' ? classeAbaAtiva : 'text-foreground/65 hover:text-foreground'}`}>Evidências</button>
          <button type="button" role="tab" aria-selected={abaChecklist === 'pendentes'} onClick={() => setAbaChecklist('pendentes')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-none ${abaChecklist === 'pendentes' ? classeAbaAtiva : 'text-foreground/65 hover:bg-violet-500/10'}`}>Pendentes de verificação</button>
          <button type="button" role="tab" aria-selected={abaChecklist === 'revisao'} onClick={() => setAbaChecklist('revisao')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-none ${abaChecklist === 'revisao' ? classeAbaAtiva : 'text-foreground/65 hover:bg-teal-700/10'}`}>Em revisão</button>
          <button type="button" role="tab" aria-selected={abaChecklist === 'concluidas'}
            aria-label="Evidências concluídas" onClick={() => setAbaChecklist('concluidas')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-none ${abaChecklist === 'concluidas' ? classeAbaAtiva : 'text-foreground/65 hover:bg-violet-500/10'}`}>
            ◉ Concluídas
          </button>
          {<button type="button" role="tab" aria-selected={abrirArquivo}
            aria-label="Evidências arquivadas" title="Evidências arquivadas" disabled={criandoEvidencia} onClick={() => void alternarArquivo()}
            className={`inline-flex h-8 w-9 items-center justify-center rounded-lg transition-colors ${abrirArquivo ? 'bg-amber-500/20 text-amber-200' : 'text-amber-300/80 hover:bg-amber-500/10'}`}>
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg>
          </button>}
        </div></AbasRolaveis>
        {abaChecklist === 'ativas' && !bloqueadoPorPai && !paiConcluido && !paiArquivado && (podeCriarEvidencia ?? podeEditarEsperada) && <button type="button" aria-expanded={criandoEvidencia} disabled={item.evidenciasEsperadas.length >= 10 && !criandoEvidencia}
          onClick={abrirCadastro} data-tec08-acao-criar
          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-on-brand-green hover:brightness-110">
          {criandoEvidencia ? 'Cancelar cadastro' : item.evidenciasEsperadas.length >= 10 ? 'Limite de evidências' : 'Nova evidência'}
        </button>}
      </div>
      {!abrirArquivo && <>{(() => {
        const previstas = evidenciasAtivas;
        const resumoValido = resumoInicial?.total === previstas.length && resumoInicial.verificadasTotal !== undefined;
        const verificadas = statusInicialCarregado ? previstas.filter(e => estadoEvidencias[e.id]?.status === 'VERIFICADA').length : resumoValido ? resumoInicial!.verificadasTotal! : 0;
        const contagemDisponivel = statusInicialCarregado || resumoValido;
        return <><p className="min-h-4 text-xs tabular-nums text-foreground/65">{contagemDisponivel ? `${verificadas}/${previstas.length} evidências esperadas` : "Consultando evidências…"}</p>
          <div className="flex h-1.5 max-w-64 gap-0.5 overflow-hidden rounded-full" role="img"
            aria-label={contagemDisponivel ? `${verificadas} de ${previstas.length} evidências previstas verificadas` : 'Consultando comprovação das evidências'}>
            {Array.from({ length: previstas.length }, (_, index) => <span key={index}
              className={`min-w-0 flex-1 rounded-sm ${index < verificadas ? 'bg-violet-500' : 'bg-violet-500/20'}`} />)}
          </div></>;
      })()}
      {criandoEvidencia && createPortal(<ModalEtapa titulo="Nova evidência esperada" contexto="Checklist documental" ocupado={salvandoNova}
        camada="evidencia" compacto estadoContextual="normal" textoFechar="Fechar ×" rotuloFechar="Fechar cadastro de evidência" onFechar={() => fecharCadastro()}>
        <form data-tec08-formulario-contextual data-tec08-criacao="true" aria-label="Cadastrar evidência esperada" onSubmit={e => void adicionarEvidencia(e)}
        className="space-y-3 p-1 text-sm">

        <div className="space-y-1">
          <label htmlFor={`tipo-novo-${item.id}`} className="block">Tipo de evidência</label>
          <select id={`tipo-novo-${item.id}`} required value={novoTipo} onChange={e => { setNovoTipo(e.target.value); setNovoArquivo(null); }}
            className="block w-full rounded-lg border border-brand-green/40 bg-background p-2 text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon">
            <option value="">Selecione o tipo</option>
            <option value="Foto">Foto</option>
            <option value="Relatório">Relatório</option>
          </select>
        </div>
        <label className="block space-y-1">Orientações (opcional)
          <textarea value={novaDescricao} maxLength={130} onChange={e => setNovaDescricao(e.target.value)}
            className="block min-h-20 w-full rounded-lg border border-brand-green/40 bg-background p-2" /></label>
        {podeEnviarComprovantes && <div className="space-y-2">
          <label htmlFor={`arquivo-inicial-${item.id}`} className="block font-medium">Comprovante inicial (opcional)</label>
          <input id={`arquivo-inicial-${item.id}`} type="file" accept={aceitarArquivoEvidencia(novoTipo)}
            className="sr-only" onChange={evento => setNovoArquivo(evento.target.files?.[0] ?? null)} />
          <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-brand-green/25 p-2">
            <label htmlFor={`arquivo-inicial-${item.id}`} className="cursor-pointer rounded-lg border border-brand-green/40 px-3 py-2 text-sm font-medium hover:bg-brand-green/10">Selecionar arquivo</label>
            <span className="min-w-0 flex-1 break-all text-xs text-foreground/70" aria-live="polite">{novoArquivo?.name ?? 'Nenhum arquivo selecionado'}</span>
          </div>
        </div>}
        {podeAlterarObrigatoriedade ? <label className="flex items-center gap-2"><input type="checkbox" checked={novaObrigatoria}
          onChange={e => setNovaObrigatoria(e.target.checked)} /> Obrigatória</label> :
          <p className="text-xs text-foreground/65">Obrigatória por padrão. Somente usuários autorizados podem alterar essa condição.</p>}
        {erroCadastro && <p role="alert" className="text-error-text">{erroCadastro}</p>}
        <button type="submit" disabled={salvandoNova || (!novoTipo.trim() && !novaEvidenciaCriadaId)}
          className="rounded-lg bg-brand-green px-4 py-2 font-semibold text-on-brand-green disabled:opacity-50">
          {salvandoNova ? 'Salvando...' : novaEvidenciaCriadaId ? 'Reenviar comprovante' : novoArquivo ? 'Cadastrar e anexar' : 'Cadastrar evidência'}</button>
        </form>
      </ModalEtapa>, document.body)}
      {!statusInicialCarregado && evidenciasAtivas.length > 0 ? <p role="status" className="min-h-14 text-sm text-foreground/60">Consultando evidências...</p> :
        evidenciasAtivas.length === 0 || !evidenciasAtivas.some(e => evidenciaNaAba(e.id)) ?
          <p className="text-sm text-foreground/65">{abaChecklist === 'concluidas' ? 'Nenhuma evidência verificada.' : abaChecklist === 'revisao' ? 'Nenhuma evidência em revisão.' : 'Nenhuma evidência pendente.'}</p> :
        <div className="space-y-4">{([true, false] as const).map(obrigatoria => {
          const grupo = evidenciasAtivas.filter(e => e.obrigatoria === obrigatoria &&
            evidenciaNaAba(e.id));
          if (!grupo.length) return null;
          return <div key={String(obrigatoria)} className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {obrigatoria ? `Obrigatórias (${grupo.length})` : `Opcionais (${grupo.length})`}
            </h3>
            <ul aria-label={obrigatoria ? 'Evidências obrigatórias' : 'Evidências opcionais'} className="space-y-2">
              {grupo.map(e => <li key={e.id} data-evidencia-estado={estadoVisualEvidencia(estadoEvidencias[e.id]?.status, estadoEvidencias[e.id]?.reabertoEm, Boolean(e.arquivadoEm))} data-tec08-card-evidencia data-tec08-item-clicavel className={`group relative min-w-0 rounded-xl border pb-14 transition-opacity duration-150 ${e.arquivadoEm ? 'border-amber-500/60 bg-background text-foreground' : estadoEvidencias[e.id]?.reabertoEm ? 'border-teal-700/60 bg-background text-foreground' : estadoEvidencias[e.id]?.status === 'VERIFICADA' ? 'border-violet-500/60 bg-background hover:border-violet-400 hover:opacity-100 focus-within:border-violet-400 focus-within:opacity-100' : 'border-brand-green/25 bg-background hover:border-brand-green/50 focus-within:border-brand-neon'}`}>
                <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                  {estadoEvidencias[e.id]?.status === 'VERIFICADA' ? <span aria-label="Evidência com comprovação documental verificada" title="Verificada"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-400/65 bg-violet-500/20 text-violet-200">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
                    </svg>
                  </span> : <IconeEvidencia nome={estadoEvidencias[e.id]?.arquivo} tipo={e.tipoEvidencia} />}
                  <div className="min-w-0 flex-1 text-left">
                    <button type="button" data-evidencia-esperada-id={e.id}
                      onClick={evento => abrirEvidencia(evento, e.id)}
                      aria-label={`Ver detalhes da evidência esperada ${e.tipoEvidencia}`}
                      data-tec08-titulo-evidencia className={`block w-full appearance-none border-0 bg-transparent p-0 text-left break-words text-sm font-semibold focus-visible:outline-2 ${estadoEvidencias[e.id]?.status === 'VERIFICADA'
                      ? 'text-violet-800 dark:text-violet-200'
                      : 'text-brand-neon'}`}>
                      {estadoEvidencias[e.id]?.arquivo ? nomeArquivoLegivel(estadoEvidencias[e.id]?.arquivo ?? '') : e.tipoEvidencia}
                    </button>
                    {(estadoEvidencias[e.id]?.arquivo || e.descricao) && <span className="mt-0.5 block truncate text-xs text-foreground/60">
                      {estadoEvidencias[e.id]?.arquivo ? (categoriaVisivelEvidencia(e.tipoEvidencia, estadoEvidencias[e.id]?.arquivo ?? '') ?? e.tipoEvidencia) : e.descricao}
                    </span>}
                  </div>
                  <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 pl-11 sm:pl-0">
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${estadoEvidencias[e.id]?.reabertoEm ? 'border-teal-600/55 bg-teal-900/20 text-teal-200' : estadoEvidencias[e.id]?.status === 'VERIFICADA' ? 'border-violet-400/45 bg-violet-500/15 text-violet-100' : estadoEvidencias[e.id] ? CLASSE_STATUS[estadoEvidencias[e.id].status] : 'border-foreground/20 text-foreground/60'}`}
                      aria-label={`Status da evidência ${e.tipoEvidencia}`}>
                      {estadoEvidencias[e.id]?.reabertoEm ? 'Em revisão' : estadoEvidencias[e.id] ? ROTULO_STATUS[estadoEvidencias[e.id].status] : 'Status indisponível'}
                    </span>
                    {false && estadoEvidencias[e.id]?.reabertoEm && estadoEvidencias[e.id]?.status !== 'VERIFICADA' &&
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">Em revisão</span>}

                  </div>
                </div>
                {(podeArquivarEvidencia || podeReabrirEvidencia || podeEditarEsperada) && <div className="pointer-events-auto absolute bottom-3 right-3 z-[2] flex max-w-[calc(100%-1.5rem)] shrink-0 flex-nowrap items-center justify-end gap-1.5 rounded-lg bg-background/95 p-0.5">
                  {podeReabrirEvidencia && estadoEvidencias[e.id]?.status === 'VERIFICADA' && <button type="button" title={`Reabrir evidência ${e.tipoEvidencia}`} aria-label={`Reabrir evidência ${e.tipoEvidencia}`} disabled={arquivandoItem || bloqueadoPorPai || paiArquivado || Boolean(item.arquivadoEm)} onClick={() => setConfirmarReabertura(e.id)} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-teal-500/50 bg-teal-950 px-2 text-xs font-semibold text-teal-100 hover:bg-teal-900 disabled:cursor-not-allowed disabled:border-slate-500/35 disabled:bg-slate-700/10 disabled:text-slate-400"><span aria-hidden="true" className="text-base">⟳</span> Reabrir</button>}
                  {podeArquivarEvidencia && <button type="button" title={`Arquivar evidência ${e.tipoEvidencia}`} aria-label={`Arquivar evidência ${e.tipoEvidencia}`}
                    disabled={arquivandoItem || ocupadoArquivo || bloqueadoPorPai || paiArquivado || Boolean(item.arquivadoEm) || estadoEvidencias[e.id]?.status === 'VERIFICADA'} onClick={() => { if (!bloqueadoPorPai && !paiArquivado && !item.arquivadoEm && estadoEvidencias[e.id]?.status !== 'VERIFICADA') setConfirmarArquivamento(e.id); }}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border disabled:cursor-not-allowed ${bloqueadoPorPai ? 'border-slate-500/35 bg-slate-500/10 text-slate-500' : 'border-amber-500/40 text-amber-200 hover:bg-amber-500/15'} disabled:opacity-70`}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg>
                  </button>}
                  {podeEditarEsperada && <button type="button" title={`Editar evidência ${e.tipoEvidencia}`} aria-label={`Editar evidência ${e.tipoEvidencia}`}
                    disabled={bloqueadoPorPai || paiArquivado || Boolean(item.arquivadoEm) || estadoEvidencias[e.id]?.status === 'VERIFICADA'}
                    onClick={evento => { if (!bloqueadoPorPai && !paiArquivado && !item.arquivadoEm) abrirEvidencia(evento, e.id, true); }}
                    data-tec08-acao-evidencia="editar" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-green/40 text-brand-neon hover:bg-brand-green/15 disabled:cursor-not-allowed disabled:border-slate-500/35 disabled:bg-slate-700/10 disabled:text-slate-400">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m15 5 4 4M4 20l4.5-1 11-11a2 2 0 0 0-3-3l-11 11L4 20Z"/></svg>
                  </button>}
                </div>}
              </li>)}</ul>
          </div>;
        })}</div>}</>}
      {erroArquivo && <p role="alert" className="text-sm text-error-text">{erroArquivo}</p>}
      {abrirArquivo && <div role="tabpanel" aria-label="Evidências arquivadas" className="min-h-36 space-y-2">
        {arquivadas.length === 0 ? <p className="text-sm text-foreground/70">Nenhuma evidência arquivada.</p> :
          <ul className="space-y-2">{arquivadas.map(e => <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-[#261d0d] p-3 text-sm text-foreground">
            <button type="button" data-evidencia-esperada-id={e.id} onClick={ev => abrirEvidencia(ev, e.id)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-amber-300">
              <span className="block font-mono text-xs text-foreground/60">{rotuloCodigoPublico(e.codigoPublico)} · {e.obrigatoria ? 'Obrigatória' : 'Opcional'}</span>
              {e.tipoEvidencia}{!e.arquivadoEm && paiArquivado ? ' · somente leitura por arquivamento do pai' : ''}
            </button>
            <div className="flex flex-wrap gap-2">
              {podeReativarEvidencia && Boolean(e.arquivadoEm) && <button type="button" disabled={ocupadoArquivo || bloqueadoPorPai} onClick={() => setConfirmarReativacao(e.id)} className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-amber-900 dark:text-amber-100 hover:bg-amber-500/15 disabled:opacity-50">Reativar</button>}
              {podeExcluirEvidenciaArquivada && Boolean(e.arquivadoEm) && !bloqueadoPorPai && <button type="button" aria-label={`Excluir evidência arquivada ${e.tipoEvidencia}`} disabled={ocupadoArquivo} onClick={() => setConfirmarExclusao(e.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/60 bg-red-600/10 px-3 py-1.5 text-red-100 hover:bg-red-600/20 disabled:opacity-50"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg>Excluir</button>}
            </div>
          </li>)}</ul>}
      </div>}
    </section>
    <AtividadesVinculadas contratoId={item.contratoId} entregavelId={item.id} somenteLeitura={bloqueadoPorPai || paiArquivado || paiConcluido || Boolean(item.arquivadoEm)} ocultarAcessoDiario={contextoModal} />

  </div>
  {selecionada && createPortal(<ModalEtapa titulo={selecionada.tipoEvidencia} codigoPublico={selecionada.codigoPublico} contexto={`Evidência esperada · ${selecionada.obrigatoria ? 'Obrigatória' : 'Opcional'}`}
    camada="evidencia" arquivado={Boolean(selecionada.arquivadoEm)} concluido={!selecionada.arquivadoEm && estadoEvidencias[selecionada.id]?.status === 'VERIFICADA'} revisao={Boolean(estadoEvidencias[selecionada.id]?.reabertoEm)} estadoContextual={estadoEvidencias[selecionada.id]?.status === 'PENDENTE_VERIFICACAO' ? 'pendente' : 'normal'} ocupado={false} focoRetorno={focoRetornoEvidencia}
    textoFechar="Fechar ×" somenteIconeFechar bloqueadoPorSubmodal={edicaoAberta}
    rotuloFechar="Fechar evidência"
    onFechar={() => {
      // O editor pode já estar desmontado após confirmar o comprovante.
      // Nunca deixar o botão Fechar sem ação por estado de edição defasado.
      if (edicaoAberta && document.querySelector('[data-tec08-camada="edicao"]') && voltarEdicaoRef.current) voltarEdicaoRef.current();
      else voltarAoEntregavel();
    }}>
    <section aria-label="Detalhe da evidência esperada" className="min-w-0 space-y-4">
      <PainelComprovacaoEvidencia contratoId={item.contratoId} entregavelId={item.id}
        esperadaId={selecionada.id} podeEditar={!bloqueadoPorPai && podeEditarEsperada && editarEvidenciaAberta && !selecionada.arquivadoEm}
        podeArquivar={!bloqueadoPorPai && (podeArquivarEvidencia ?? podeEditarEsperada) && !selecionada.arquivadoEm} ocultarArquivamento
        podeAlterarObrigatoriedade={!bloqueadoPorPai && podeAlterarObrigatoriedade && editarEvidenciaAberta}
        podeEnviar={!bloqueadoPorPai && podeEnviarComprovantes && editarEvidenciaAberta && !selecionada.arquivadoEm}
        somenteLeitura={!editarEvidenciaAberta}
        registrarVoltaEdicao={registrarEditor} cancelamentoNoCabecalho
        onComprovanteAlterado={() => { atualizarEstadoEvidencias(); aoAtualizarEsperada?.(); }}
        onArquivada={() => { voltarAoEntregavel(); atualizarEstadoEvidencias(); aoAtualizarEsperada?.(); }}
        onPlanejamentoAlterado={() => { atualizarEstadoEvidencias(); aoAtualizarEsperada?.(); }} />
    </section>
  </ModalEtapa>, document.body)}
  {confirmarExclusao && createPortal(<div className="relative z-[160]" onKeyDown={e => e.stopPropagation()}>
    <ConfirmacaoSimples titulo="Excluir evidência arquivada?" perigoso ocupado={ocupadoArquivo}
      descricao="Excluir definitivamente esta evidência de teste, todos os comprovantes e todos os arquivos enviados? Não é possível desfazer."
      confirmar="Excluir definitivamente" onCancelar={() => setConfirmarExclusao(null)} onConfirmar={() => void (async () => {
        const id = confirmarExclusao;
        if (!id || ocupadoArquivo || !podeExcluirEvidenciaArquivada) return;
        setOcupadoArquivo(true); setErroArquivo('');
        try {
          await excluirEvidenciaArquivada(item.contratoId, item.id, id);
          setArquivadas(lista => lista.filter(e => e.id !== id));
          if (evidenciaId === id) setEvidenciaId(null);
          setConfirmarExclusao(null);
          toastSucesso('Evidência excluída com sucesso.');
          atualizarEstadoEvidencias(); aoAtualizarEsperada?.();
        } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Falha ao excluir evidência.'); setConfirmarExclusao(null); }
        finally { setOcupadoArquivo(false); }
      })()} />
  </div>, document.body)}
  {confirmarReativacao && createPortal(<div className="relative z-[160]">
    <ConfirmacaoSimples titulo="Desarquivar evidência?"
      descricao="A evidência voltará ao checklist ativo deste entregável. A alteração será registrada na rastreabilidade e nenhum detalhe será aberto automaticamente."
      confirmar="Confirmar desarquivamento" ocupado={ocupadoArquivo} justificativa={motivoEvidencia} onJustificativaChange={setMotivoEvidencia}
      onCancelar={() => { setConfirmarReativacao(null); setMotivoEvidencia(''); }} onConfirmar={() => void reativar()} />
  </div>, document.body)}
  {confirmarReabertura && createPortal(<div className="relative z-[160]">
    <ConfirmacaoSimples titulo="Reabrir evidência verificada?"
      descricao="A evidência voltará a Pendente de verificação. O comprovante existente e o histórico serão preservados."
      confirmar="Reabrir evidência" ocupado={arquivandoItem} justificativa={motivoEvidencia} onJustificativaChange={setMotivoEvidencia}
      onCancelar={() => { setConfirmarReabertura(null); setMotivoEvidencia(''); }} onConfirmar={() => void executarReaberturaEvidencia()} />
  </div>, document.body)}
  {confirmarArquivamento && createPortal(<div className="relative z-[160]">
    <ConfirmacaoSimples titulo="Arquivar evidência?"
      descricao={`Esta evidência sairá do planejamento ativo, mas os comprovantes e o histórico continuarão preservados. Deseja arquivar “${item.evidenciasEsperadas.find(e => e.id === confirmarArquivamento)?.tipoEvidencia ?? 'esta evidência'}”?`}
      confirmar="Confirmar arquivamento" perigoso ocupado={arquivandoItem}
      onCancelar={() => setConfirmarArquivamento(null)} onConfirmar={() => void arquivarEvidenciaDireta()} />
  </div>, document.body)}
  </>;
}
