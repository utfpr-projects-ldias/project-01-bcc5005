'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ModalEtapa } from './modal-etapa';
import { ajustarRestauracaoHistorico } from '@/lib/historico-modal-scroll';
import {
  CATEGORIAS_DOCUMENTO, EXTENSOES_PROVISORIAS, ErroDocumento,
  formatarDataDocumento, formatarTamanhoDocumento, obterDownloadDocumento,
  validarSelecaoDocumento, type CategoriaDocumento, type FiltroCategoriaDocumento,
} from '@/lib/documentos';
import { useDocumentos, useEnviarDocumento } from '@/hooks/use-documentos';
import { IndicadorCarregamento } from '@/app/components/indicador-carregamento';

const categorias = Object.entries(CATEGORIAS_DOCUMENTO) as [CategoriaDocumento, string][];
const selecaoInicial: CategoriaDocumento = 'CONTRATO_PRINCIPAL';
const campos = 'w-full min-w-0 rounded-lg border border-brand-green/40 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-60';
type Filtros = { categoria: FiltroCategoriaDocumento; pagina: number; busca: string };
const filtrosIniciais: Filtros = { categoria: '', pagina: 1, busca: '' };
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
    };
  } catch { return filtrosIniciais; }
}

export function PainelDocumentos({ contratoId, habilitado, podeAnexar }: {
  contratoId: string; habilitado: boolean; podeAnexar: boolean;
}) {
  const [filtros, setFiltros] = useState<Filtros>(() => lerFiltros(contratoId));
  const preparado = useSyncExternalStore(observarCliente, snapshotCliente, snapshotServidor);
  const filtrosAtivos = preparado ? filtros : filtrosIniciais;
  // null: abertura automática da jornada pós-cadastro; boolean: decisão explícita do usuário.
  const [aberturaManual, setAberturaManual] = useState<boolean | null>(null);
  const [categoriaEnvio, setCategoriaEnvio] = useState<CategoriaDocumento>(selecaoInicial);
  const [descricao, setDescricao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroFormulario, setErroFormulario] = useState('');
  const [erroDownload, setErroDownload] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [enviando, setEnviando] = useState(false);
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
  const consulta = useDocumentos(contratoId, filtrosAtivos.categoria, filtrosAtivos.pagina, habilitado && preparado);
  const principais = useDocumentos(contratoId, 'CONTRATO_PRINCIPAL', 1, habilitado && preparado);
  const enviar = useEnviarDocumento(contratoId);
  const protegido = consulta.erro instanceof ErroDocumento && [401, 403, 404].includes(consulta.erro.status);
  const documentos = habilitado && !protegido ? consulta.dados : undefined;
  const itens = documentos?.itens.filter(item => item.nomeOriginal.toLocaleLowerCase('pt-BR').includes(filtrosAtivos.busca.trim().toLocaleLowerCase('pt-BR'))) ?? [];
  const podeEscrever = habilitado && podeAnexar && !protegido;

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
    setSucesso('');
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
  async function anexar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando || !podeEscrever) return;
    setSucesso(''); setErroFormulario('');
    const invalido = validarSelecaoDocumento(arquivo, categoriaEnvio);
    if (invalido) { setErroFormulario(invalido); return; }
    if (descricao.length > 300 || (descricao.trim() === '' && descricao.length > 0)) {
      setErroFormulario('Descrição inválida (máximo de 300 caracteres, sem espaços isolados).'); return;
    }
    enviandoRef.current = true;
    setEnviando(true);
    try {
      await enviar(categoriaEnvio, arquivo!, descricao);
      setSucesso('Documento anexado. O contrato já está salvo e permanece disponível.');
      setArquivo(null); setDescricao('');
      if (inputArquivo.current) inputArquivo.current.value = '';
      atualizarFiltros({ categoria: categoriaEnvio, pagina: 1, busca: '' });
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

  return <section id="documentos-contratuais" aria-labelledby="titulo-documentos" className="min-w-0 space-y-5 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 id="titulo-documentos" className="text-lg font-semibold text-brand-neon">Documentos do contrato</h3>
        <p className="text-sm text-foreground/70">Guarde e consulte aqui os arquivos do contrato. Os comprovantes das atividades ficam na área de evidências.</p>
      </div>
      {podeEscrever && <button type="button" onClick={abrirModal}
        aria-haspopup="dialog" aria-controls="formulario-documento"
        className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-neon">
        Anexar documento
      </button>}
    </div>
    {protegido ? <p role="status" className="text-sm">Acesso documental indisponível.</p> :
      !preparado || principais.carregando ? <p role="status" className="text-sm">Verificando documento principal...</p> :
      principais.erro ? <p role="status" className="text-sm text-foreground/70">Não foi possível confirmar se existe um documento principal.</p> :
      principais.dados?.total === 0 ? <p role="status" data-testid="documento-principal-ausente" className="rounded-lg border border-amber-500/40 p-3 text-sm">Este contrato ainda não tem um documento principal (PDF). Você pode anexá-lo agora ou depois.</p> :
      <p className="text-sm text-foreground/70">Documento principal registrado neste contrato.</p>}

    {podeEscrever && formularioAberto && preparado && createPortal(<ModalEtapa
      titulo="Anexar documento contratual" contexto="Documentos do contrato" rotuloFechar="Fechar anexo de documento"
      ocupado={enviando} focoRetorno={gatilhoModal} onFechar={() => fecharModal()}>
      <div id="formulario-documento">
        <form onSubmit={evento => void anexar(evento)} className="space-y-4" aria-label="Anexar documento contratual" noValidate>
          <p className="text-sm text-foreground/70">Selecione um arquivo para guardar neste contrato. Evidências das atividades são cadastradas em outra área.</p>
          {solicitarPrincipal && <p className="rounded-lg border border-brand-green/30 p-3 text-sm">O cadastro do contrato está concluído. O PDF principal pode ser anexado agora ou posteriormente.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="categoria-documento-envio" className="block text-sm font-medium">Categoria *</label>
              <select id="categoria-documento-envio" className={campos} value={categoriaEnvio} disabled={enviando}
                onChange={e => { setCategoriaEnvio(e.target.value as CategoriaDocumento); setErroFormulario(''); }}>
                {categorias.map(([valor, titulo]) => <option key={valor} value={valor}>{titulo}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="arquivo-documento-envio" className="block text-sm font-medium">Arquivo *</label>
              <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-brand-green/40 bg-background px-2 py-1.5">
                {/* Input nativo permanece acessível e controlado pelo Playwright, mas não exibe
                    rótulos em inglês como Browse / No file selected ao usuário final. */}
                <input ref={inputArquivo} id="arquivo-documento-envio" type="file" className="sr-only"
                  accept={categoriaEnvio === 'CONTRATO_PRINCIPAL' ? '.pdf,application/pdf' : EXTENSOES_PROVISORIAS}
                  disabled={enviando} aria-describedby="ajuda-arquivo-documento arquivo-documento-nome"
                  onChange={e => { setArquivo(e.target.files?.[0] ?? null); setErroFormulario(''); }} />
                <button type="button" disabled={enviando} onClick={() => inputArquivo.current?.click()}
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
            <textarea id="descricao-documento-envio" rows={2} maxLength={300} className={campos} value={descricao} disabled={enviando}
              onChange={e => { setDescricao(e.target.value); setErroFormulario(''); }} />
            <p className="text-xs text-foreground/55">{descricao.length}/300 caracteres</p>
          </div>
          {erroFormulario && <p role="alert" className="break-words text-sm text-error-text">{erroFormulario}</p>}
          {enviando && <div role="progressbar" aria-label="Envio em andamento" aria-valuetext="Enviando e verificando arquivo" className="rounded-lg border border-brand-green/30 p-3 text-sm">
            <IndicadorCarregamento compacto texto="Enviando e verificando arquivo..." />
          </div>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => fecharModal()} disabled={enviando}
              className="rounded-lg border border-brand-green/45 px-4 py-2 text-sm font-semibold hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={enviando || !arquivo}
              className="rounded-lg bg-brand-green px-4 py-2 font-semibold text-on-brand-green disabled:cursor-not-allowed disabled:opacity-50">
              {enviando ? 'Enviando...' : 'Enviar documento'}
            </button>
          </div>
        </form>
      </div>
    </ModalEtapa>, document.body)}
    {sucesso && <p role="status" className="rounded-lg border border-brand-green/40 p-3 text-sm">{sucesso}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><label htmlFor="filtro-categoria-documento" className="block text-sm font-medium">Filtrar por categoria</label>
        <select id="filtro-categoria-documento" className={campos} value={filtrosAtivos.categoria} disabled={!habilitado || !preparado}
          onChange={e => atualizarFiltros({ categoria: e.target.value as FiltroCategoriaDocumento, busca: '', pagina: 1 })}>
          <option value="">Todas as categorias</option>
          {categorias.map(([valor, titulo]) => <option key={valor} value={valor}>{titulo}</option>)}
        </select></div>
      <div className="space-y-1"><label htmlFor="busca-nome-documento" className="block text-sm font-medium">Buscar nome nesta página</label>
        <input id="busca-nome-documento" type="search" maxLength={120} className={campos} value={filtrosAtivos.busca}
          disabled={!habilitado || !preparado} onChange={e => atualizarFiltros({ ...filtrosAtivos, busca: e.target.value })}
          placeholder="Filtrar nomes dos 20 itens desta página" /></div>
    </div>
    <div ref={resultadosRef} data-testid="regiao-resultados-documentos" aria-busy={consulta.carregando || !preparado} className="min-w-0 space-y-3">
    {consulta.carregando || !preparado ? <div role="status" data-testid="resultados-estaveis-carregando"
      className="min-h-40 rounded-lg border border-brand-green/20 bg-background/25 p-3 text-xs text-foreground/60">
      Atualizando documentos desta categoria...
    </div> : consulta.erro ? <div className="space-y-2">
      <p role="alert" className="text-sm text-error-text">{erroMensagem(consulta.erro, 'Falha ao consultar documentos.')}</p>
      <button type="button" onClick={() => void consulta.atualizar().catch(() => {})} className="rounded-lg border border-brand-green/40 px-3 py-2 text-sm">Tentar novamente</button>
    </div> : documentos ? <>
      <p className="text-xs text-foreground/65">{documentos.total} documento(s) nesta categoria · Página {documentos.pagina} de {documentos.totalPaginas}</p>
      {documentos.total === 0 ? <p role="status" className="rounded-lg border border-brand-green/25 p-3 text-sm">Nenhum documento encontrado neste contrato para a categoria selecionada.</p> : itens.length === 0 ?
        <p role="status" className="rounded-lg border border-brand-green/25 p-3 text-sm">Nenhum nome correspondente nesta página. Limpe a busca ou navegue pelas páginas.</p> :
        <ul aria-label="Documentos contratuais" className="space-y-3">{itens.map(documento => <li key={documento.id} className="min-w-0 rounded-xl border border-brand-green/25 bg-background/65 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="break-all font-semibold">{documento.nomeOriginal}</p>
              <p className="mt-1 text-xs text-foreground/70">{CATEGORIAS_DOCUMENTO[documento.categoria]}</p>
            </div>
            <button type="button" disabled={!!baixandoId} onClick={() => void baixar(documento.id, documento.nomeOriginal)}
              aria-label={`Baixar ${documento.nomeOriginal}`}
              className="rounded-lg border border-brand-green/45 px-3 py-2 text-sm font-semibold hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
              {baixandoId === documento.id ? 'Baixando...' : 'Baixar arquivo'}
            </button>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-foreground/55">Autor</dt><dd className="break-words">{documento.autorNome?.trim() || 'Autor registrado'}</dd></div>
            <div><dt className="text-xs text-foreground/55">Incluído em</dt><dd>{formatarDataDocumento(documento.criadoEm)}</dd></div>
            <div><dt className="text-xs text-foreground/55">Tamanho</dt><dd>{formatarTamanhoDocumento(documento.tamanho)}</dd></div>
          </dl>
          {documento.descricao && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground/75">{documento.descricao}</p>}
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
