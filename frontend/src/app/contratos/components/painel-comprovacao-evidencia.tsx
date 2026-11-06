'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ModalEtapa } from './modal-etapa';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { IconeEvidencia } from './icone-evidencia';
import { nomeArquivoLegivel } from '@/lib/nome-arquivo';
import { toastSucesso, toastErro } from '@/app/components/toast-notificacoes';
import {
  aceitarArquivoEvidencia, arquivoCompativelEvidencia,
  baixarComprovante, CLASSE_STATUS, consultarEvidencia, editarEvidencia,
  enviarComprovante, ROTULO_STATUS, verificarComprovante, alterarArquivoEvidencia, type DetalheEvidencia,
  type VersaoComprovante,
} from '@/lib/comprovantes';

/** Painel interno: editar o requisito, enviar o comprovante e verificar são ações independentes. */
export function PainelComprovacaoEvidencia({ contratoId, entregavelId, esperadaId, podeEditar, podeArquivar,
  podeAlterarObrigatoriedade = false, podeEnviar = true, ocultarArquivamento = false, somenteLeitura = false,
  onPlanejamentoAlterado, onArquivada, onComprovanteAlterado, registrarVoltaEdicao }: {
  contratoId: string; entregavelId: string; esperadaId: string; podeEditar: boolean;
  podeArquivar?: boolean; podeAlterarObrigatoriedade?: boolean; podeEnviar?: boolean; ocultarArquivamento?: boolean; somenteLeitura?: boolean;
  onPlanejamentoAlterado?: () => void; onArquivada?: () => void; onComprovanteAlterado?: () => void;
  registrarVoltaEdicao?: (voltar: (() => void) | null) => void;
  cancelamentoNoCabecalho?: boolean;
}) {
  const [dados, setDados] = useState<DetalheEvidencia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(false);
  const [campoInline, setCampoInline] = useState<'titulo' | 'orientacoes' | null>(null);
  const [confirmandoVerificacao, setConfirmandoVerificacao] = useState(false);
  const [tipo, setTipo] = useState('');
  const [descricaoEsperada, setDescricaoEsperada] = useState('');
  const [arquivoEdicao, setArquivoEdicao] = useState<File | null>(null);
  const [anexoInline, setAnexoInline] = useState(false);
  const [confirmandoArquivo, setConfirmandoArquivo] = useState(false);
  const inputArquivoEdicaoRef = useRef<HTMLInputElement>(null);
  const inputPrimeiroComprovanteRef = useRef<HTMLInputElement>(null);
  const botaoArquivarRef = useRef<HTMLButtonElement>(null);
  const marcadorEdicao = useRef<string | null>(null);
  const contadorEdicao = useRef(0);
  function cancelarConfirmacaoArquivo() {
    setConfirmandoArquivo(false);
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => botaoArquivarRef.current?.focus({ preventScroll: true }));
    } else botaoArquivarRef.current?.focus({ preventScroll: true });
  }
  function voltarDaEdicao() {
    setArquivoEdicao(null); setAnexoInline(false); setCampoInline(null); setErro('');
    setEditando(false);
    registrarVoltaEdicao?.(null);
    const marcador = marcadorEdicao.current;
    marcadorEdicao.current = null;
    if (marcador && window.history.state?.__edicaoEvidencia === marcador) window.history.back();
  }
  useEffect(() => {
    const aoVoltar = () => {
      if (!marcadorEdicao.current || window.history.state?.__edicaoEvidencia === marcadorEdicao.current) return;
      marcadorEdicao.current = null;
      registrarVoltaEdicao?.(null);
      setEditando(false);
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, [registrarVoltaEdicao]);
  async function arquivar() {
    setOcupado(true); setErro('');
    try { await alterarArquivoEvidencia(contratoId, entregavelId, esperadaId, 'arquivar');
      const noEditor = editando && marcadorEdicao.current && window.history.state?.__edicaoEvidencia === marcadorEdicao.current;
      if (noEditor) { marcadorEdicao.current = null; registrarVoltaEdicao?.(null); setEditando(false); }
      onArquivada?.();
      if (noEditor) window.history.go(-2); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao arquivar evidência.'); }
    finally { setOcupado(false); setConfirmandoArquivo(false); }
  }
  const recarregar = useCallback(async () => {
    const atual = await consultarEvidencia(contratoId, entregavelId, esperadaId);
    if (atual.contratoId !== contratoId || atual.entregavelId !== entregavelId || atual.id !== esperadaId)
      throw new Error('Dados da evidência não correspondem a este entregável.');
    setDados(atual);
    return atual;
  }, [contratoId, entregavelId, esperadaId]);
  useEffect(() => {
    let ativo = true;
    // Não reaproveitar dados de outra evidência durante uma navegação rápida.
    void consultarEvidencia(contratoId, entregavelId, esperadaId).then(retorno => {
      if (!ativo) return;
      if (retorno.contratoId !== contratoId || retorno.entregavelId !== entregavelId || retorno.id !== esperadaId)
        throw new Error('Dados de evidência incompatíveis');
      setDados(retorno);
    }).catch(e => { if (ativo) setErro(e instanceof Error ? e.message : 'Falha ao consultar evidência.'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [contratoId, entregavelId, esperadaId]);
  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    setOcupado(true); setErro('');
    try { await acao(); await recarregar(); onComprovanteAlterado?.(); toastSucesso(mensagem); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir a operação.'); }
    finally { setOcupado(false); }
  }
  function iniciarEdicao() {
    if (!dados || dados.status === 'VERIFICADA') return;
    setTipo(dados.tipoEvidencia); setDescricaoEsperada(dados.descricao ?? '');
    setArquivoEdicao(null); setEditando(true); setErro('');
    const marcador = `editar-evidencia:${esperadaId}:${++contadorEdicao.current}`;
    const anterior = window.history.state;
    window.history.pushState({ ...(anterior && typeof anterior === 'object' ? anterior : {}), __edicaoEvidencia: marcador }, '', window.location.href);
    marcadorEdicao.current = marcador;
    registrarVoltaEdicao?.(voltarDaEdicao);
  }
  async function salvarCampoInline(campo: 'titulo' | 'orientacoes') {
    if (ocupado || !dados) return;
    const novoTitulo = campo === 'titulo' ? tipo.trim() : dados.tipoEvidencia;
    const novaDescricao = campo === 'orientacoes' ? (descricaoEsperada.trim() || null) : dados.descricao;
    if (!novoTitulo) { setErro('Informe o título da evidência.'); return; }
    if (novaDescricao && novaDescricao.length > 130) { setErro('As orientações devem ter no máximo 130 caracteres.'); return; }
    if (campo === 'titulo' && novoTitulo.length > 60) { setErro('O título deve ter no máximo 60 caracteres.'); return; }
    setOcupado(true); setErro('');
    try {
      if (novoTitulo !== dados.tipoEvidencia || novaDescricao !== dados.descricao) {
        await editarEvidencia(contratoId, entregavelId, esperadaId,
          { tipoEvidencia: novoTitulo, descricao: novaDescricao });
        await recarregar();
        onPlanejamentoAlterado?.();
      }
      setCampoInline(null);
      toastSucesso('Evidência atualizada.');
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Falha ao editar a evidência.'); }
    finally { setOcupado(false); }
  }
  function iniciarCampoInline(campo: 'titulo' | 'orientacoes') {
    if (!dados || dados.status === 'VERIFICADA') return;
    setTipo(dados.tipoEvidencia);
    setDescricaoEsperada(dados.descricao ?? '');
    setErro(''); setCampoInline(campo);
  }
  async function salvarEdicao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado || !arquivoEdicao || !podeEnviar || dados?.status === 'VERIFICADA') return;
    if (!arquivoCompativelEvidencia(dados?.tipoEvidencia ?? '', arquivoEdicao)) {
      setErro('Formato incompatível com o tipo de evidência selecionado.'); return;
    }
    setOcupado(true); setErro('');
    let uploadConfirmado = false;
    try {
      // O upload altera somente a versão atual deste requisito.
      await enviarComprovante(contratoId, entregavelId, esperadaId, arquivoEdicao, '');
      uploadConfirmado = true;
      setArquivoEdicao(null);
      onComprovanteAlterado?.();
      await recarregar();
      voltarDaEdicao();
      toastSucesso('Arquivo enviado para verificação.');
    } catch (falha) {
      const motivo = falha instanceof Error ? falha.message : 'Não foi possível concluir a operação.';
      // Não pedir novo upload se a API confirmou a gravação e apenas o refresh falhou.
      if (uploadConfirmado) onComprovanteAlterado?.();
      await recarregar().catch(() => {});
      setErro(uploadConfirmado ? `Arquivo recebido, mas houve falha ao atualizar a consulta: ${motivo}` : motivo);
    } finally { setOcupado(false); }
  }
  /** Primeiro comprovante: formulário compacto dentro do próprio card, sem novo modal. */
  async function enviarPrimeiroComprovante(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado || !arquivoEdicao || !podeEnviar || !dados || dados.versoes.length || arquivada) return;
    if (!arquivoCompativelEvidencia(dados.tipoEvidencia, arquivoEdicao)) {
      setErro('Formato incompatível com o tipo de evidência.'); return;
    }
    setOcupado(true); setErro('');
    try {
      await enviarComprovante(contratoId, entregavelId, esperadaId, arquivoEdicao, '');
      setArquivoEdicao(null); setAnexoInline(false);
      await recarregar(); onComprovanteAlterado?.();
      toastSucesso('Comprovante anexado.');
    } catch (falha) {
      toastErro(falha instanceof Error ? falha.message : 'Não foi possível anexar o comprovante.');
      setErro(falha instanceof Error ? falha.message : 'Não foi possível anexar o comprovante.');
    } finally { setOcupado(false); }
  }
  async function alterarObrigatoriedade(obrigatoria: boolean) {
    if (ocupado || !podeAlterarObrigatoriedade || !dados || dados.arquivadoEm || dados.entregavelArquivadoEm || dados.status === 'VERIFICADA') return;
    setOcupado(true); setErro('');
    try {
      await editarEvidencia(contratoId, entregavelId, esperadaId, { obrigatoria });
      await recarregar();
      onPlanejamentoAlterado?.();
      toastSucesso(`Evidência definida como ${obrigatoria ? 'obrigatória' : 'opcional'}.`);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível alterar a obrigatoriedade.');
    } finally { setOcupado(false); }
  }
  async function baixar(v: VersaoComprovante) {
    setErro('');
    try { await baixarComprovante(contratoId, entregavelId, esperadaId, v); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha no download.'); }
  }
  if (carregando && !dados) return <p role="status" className="text-sm text-foreground/70">Consultando evidência...</p>;
  if (!dados) return <p role="alert" className="text-sm text-error-text">{erro || 'Evidência indisponível.'}</p>;
  const ultima = dados.versoes[0];
  const arquivada = Boolean(dados.arquivadoEm || dados.entregavelArquivadoEm);
  const confirmacaoArquivo = confirmandoArquivo && <div role="alertdialog" aria-label="Confirmar arquivamento da evidência"
    className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
    <p>Arquivar esta evidência? Os comprovantes enviados serão preservados. Você poderá reativá-la em Arquivadas.</p>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" disabled={ocupado} onClick={cancelarConfirmacaoArquivo} className="rounded-lg border border-brand-green/30 px-3 py-1.5 text-xs">Cancelar</button>
      <button type="button" disabled={ocupado} onClick={() => void arquivar()} className="rounded-lg border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100">Confirmar arquivamento</button>
    </div>
  </div>;
  const editorArquivo = editando && createPortal(<ModalEtapa titulo={ultima ? 'Substituir comprovante' : 'Anexar comprovante'}
    contexto="Arquivo da evidência" camada="edicao" compacto ocupado={ocupado} textoFechar="Fechar ×"
    somenteIconeFechar rotuloFechar="Cancelar edição do arquivo" onFechar={voltarDaEdicao}>
    <section aria-label="Edição individual da evidência" data-testid="painel-edicao-evidencia" className="space-y-3">
      <form aria-label="Enviar comprovação" onSubmit={e => void salvarEdicao(e)} className="space-y-4 text-sm">
        <p className="text-sm text-foreground/70">{ultima ? 'Escolha o novo arquivo para criar outra versão. A versão anterior ficará preservada.' : 'Escolha o primeiro comprovante desta evidência.'}</p>
        <label className="block space-y-2"><span className="text-sm font-medium">{ultima ? 'Novo arquivo' : 'Arquivo'}</span>
          <input ref={inputArquivoEdicaoRef} id={`editar-arquivo-${esperadaId}`}
            aria-label={ultima ? 'Substituir arquivo (opcional)' : 'Anexar arquivo (opcional)'}
            type="file" accept={aceitarArquivoEvidencia(dados.tipoEvidencia)}
            onChange={evento => setArquivoEdicao(evento.target.files?.[0] ?? null)} className="sr-only" />
          <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-brand-green/25 p-2">
            <button type="button" onClick={() => inputArquivoEdicaoRef.current?.click()}
              className="rounded-lg border border-brand-green/30 px-3 py-2 text-sm font-semibold hover:bg-brand-green/10">Selecionar arquivo</button>
            <span className="min-w-0 flex-1 break-all text-xs text-foreground/70">{arquivoEdicao?.name ? nomeArquivoLegivel(arquivoEdicao.name) : 'Nenhum arquivo selecionado'}</span>
          </div>
        </label>
        <div className="flex justify-end border-t border-brand-green/15 pt-3" role="group" aria-label="Ações de edição da evidência">
          <button type="submit" disabled={ocupado || !arquivoEdicao}
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green disabled:opacity-50">
            {ocupado ? 'Enviando...' : ultima ? 'Substituir anexo' : 'Anexar comprovante'}
          </button>
        </div>
      </form>
    </section>
  </ModalEtapa>, document.body);
  return <><div className="space-y-3" data-testid="painel-comprovacao-evidencia">
    <div className="flex items-center gap-2">
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${CLASSE_STATUS[dados.status]}`}
        data-testid="status-verificacao">{ROTULO_STATUS[dados.status]}</span>
      {dados.podeVerificar && dados.versoes[0]?.status === 'PENDENTE_VERIFICACAO' && !Boolean(dados.arquivadoEm || dados.entregavelArquivadoEm) && <button type="button"
        disabled={ocupado} aria-label="Verificar comprovante" onClick={() => setConfirmandoVerificacao(true)}
        className="ml-auto rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">Verificar</button>}
      {!ocultarArquivamento && (podeArquivar ?? podeEditar) && !arquivada && dados.status !== 'VERIFICADA' && <button type="button" ref={botaoArquivarRef} disabled={ocupado}
        aria-label="Arquivar evidência" title="Arquivar evidência"
        onClick={() => setConfirmandoArquivo(true)} className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg>
      </button>}
    </div>
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        {campoInline === 'titulo' ? <div className="min-w-0 flex-1"><label htmlFor={`titulo-inline-${esperadaId}`} className="sr-only">Tipo da evidência</label>
          <select id={`titulo-inline-${esperadaId}`} value={tipo === 'Foto' || tipo === 'Relatório' ? tipo : '__legado'}
            onChange={e => setTipo(e.target.value)}
            className="w-full rounded-lg border border-brand-green/35 bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-brand-neon">
            {tipo !== 'Foto' && tipo !== 'Relatório' && <option value="__legado" disabled>Tipo anterior: {tipo}</option>}
            <option value="Foto">Foto</option>
            <option value="Relatório">Relatório</option>
          </select></div>
          : <span title={dados.tipoEvidencia} className="min-w-0 flex-1 truncate font-semibold text-foreground">{dados.tipoEvidencia}</span>}
        {!somenteLeitura && podeEditar && !arquivada && dados.status !== 'VERIFICADA' && <div className="flex shrink-0 items-center gap-1">
          {campoInline === 'titulo' ? <><button type="button" disabled={ocupado} onClick={() => void salvarCampoInline('titulo')}
              aria-label="Salvar tipo da evidência" className="rounded-lg bg-brand-green px-2 py-1 text-xs font-semibold text-on-brand-green">Salvar</button>
            <button type="button" onClick={() => setCampoInline(null)} aria-label="Cancelar edição do tipo"
              className="rounded-lg border border-brand-green/25 px-2 py-1 text-xs">Cancelar</button></> :
            <button type="button" aria-label="Editar tipo da evidência" title="Editar tipo da evidência" onClick={() => iniciarCampoInline('titulo')}
              className="rounded-md p-1 text-foreground/65 hover:text-brand-neon focus-visible:outline-2 focus-visible:outline-brand-neon">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 5 4 4M4 20l4.5-1 11-11a2 2 0 0 0-3-3l-11 11L4 20Z"/></svg>
            </button>}
        </div>}
      </div>
      {(dados.descricao || podeEditar) && <div className="space-y-1 border-t border-brand-green/10 pt-2">
        <div className="flex items-center justify-between gap-2"><span className="text-xs text-foreground/55">Orientações</span>
          {!somenteLeitura && podeEditar && !arquivada && dados.status !== 'VERIFICADA' && (campoInline === 'orientacoes' ? <div className="flex gap-1">
            <button type="button" disabled={ocupado} onClick={() => void salvarCampoInline('orientacoes')} aria-label="Salvar orientações"
              className="rounded-lg bg-brand-green px-2 py-1 text-xs text-on-brand-green">Salvar</button>
            <button type="button" onClick={() => setCampoInline(null)} aria-label="Cancelar edição das orientações"
              className="rounded-lg border border-brand-green/25 px-2 py-1 text-xs">Cancelar</button>
          </div> : <button type="button" aria-label="Editar orientações" title="Editar orientações" onClick={() => iniciarCampoInline('orientacoes')}
            className="rounded-md p-1 text-foreground/65 hover:text-brand-neon">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 5 4 4M4 20l4.5-1 11-11a2 2 0 0 0-3-3l-11 11L4 20Z"/></svg>
          </button>)}</div>
        {campoInline === 'orientacoes' ? <><label htmlFor={`orientacoes-inline-${esperadaId}`} className="sr-only">Orientações da evidência</label>
          <textarea id={`orientacoes-inline-${esperadaId}`} maxLength={130} rows={2} value={descricaoEsperada}
            onChange={e => setDescricaoEsperada(e.target.value)} className="w-full resize-y rounded-lg border border-brand-green/20 bg-transparent px-2 py-1 text-sm outline-none focus:border-brand-neon" /></>
          : <p className="whitespace-pre-wrap break-words text-xs text-foreground/70">{dados.descricao || 'Nenhuma orientação registrada'}</p>}
      </div>}
    </div>
    {!editando && confirmacaoArquivo}
    {arquivada && <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">Evidência arquivada. Arquivos e histórico disponíveis para consulta.</p>}
    <section aria-label="Comprovação da evidência" className="space-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-brand-green/20 bg-brand-darkgreen/5 p-3">
        {anexoInline && arquivoEdicao && !ultima && podeEnviar && !arquivada ?
          <form aria-label="Anexar comprovante" onSubmit={e => void enviarPrimeiroComprovante(e)}
            className="flex min-w-0 w-full flex-wrap items-center gap-2">
            <IconeEvidencia nome={arquivoEdicao.name} tipo={dados.tipoEvidencia} />
            <span aria-live="polite" className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground"
              title={arquivoEdicao.name}>{nomeArquivoLegivel(arquivoEdicao.name)}</span>
            <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
              <button type="button" className="rounded-lg px-2 py-2 text-xs text-foreground/70 hover:bg-brand-green/10"
                disabled={ocupado} onClick={() => { setAnexoInline(false); setArquivoEdicao(null); }}>Cancelar</button>
              <button type="submit" disabled={ocupado} className="rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-on-brand-green disabled:opacity-50">
                {ocupado ? 'Enviando...' : 'Anexar'}
              </button>
            </div>
          </form> : <>
          {ultima ? <div className="flex min-w-0 flex-1 items-center gap-3">
            <IconeEvidencia nome={ultima.nomeOriginal} tipo={dados.tipoEvidencia} />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold">{nomeArquivoLegivel(ultima.nomeOriginal)}</p>
              <p className="text-xs text-foreground/60">Versão atual · {new Date(ultima.criadoEm).toLocaleString('pt-BR')}</p>
            </div>
          </div> : <span className="min-w-0 flex-1 text-sm text-foreground/65">Nenhum comprovante registrado.</span>}
          <div className="flex shrink-0 items-center gap-2 self-start">
            {!somenteLeitura && !arquivada && podeEnviar && ultima?.status !== 'VERIFICADA' && <button type="button" aria-label={ultima ? 'Substituir comprovante' : 'Anexar comprovante'}
              title={ultima ? 'Editar arquivo do comprovante' : 'Selecionar comprovante'}
              disabled={ocupado} onClick={() => { if (ultima) iniciarEdicao(); else inputPrimeiroComprovanteRef.current?.click(); }}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-brand-green/35 text-brand-neon transition-colors hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-50">
              {ultima ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5 4 4M4 20l4.5-1 11-11a2 2 0 0 0-3-3l-11 11L4 20Z"/></svg> :
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m20 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9.9-9.9a3.7 3.7 0 0 1 5.3 5.3l-10 10a1.8 1.8 0 0 1-2.6-2.6l8.8-8.8"/></svg>}
            </button>}
            {ultima && <button type="button" aria-label="Baixar comprovante" title="Baixar comprovante" onClick={() => void baixar(ultima)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-brand-green/30 hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon">
              <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3"/></svg>
            </button>}
          </div>
        </>}
        {!somenteLeitura && !ultima && podeEnviar && !arquivada && <input ref={inputPrimeiroComprovanteRef}
          aria-label="Selecionar arquivo" type="file" accept={aceitarArquivoEvidencia(dados.tipoEvidencia)}
          className="sr-only" onChange={evento => { const escolhido = evento.target.files?.[0] ?? null;
            setArquivoEdicao(escolhido); setAnexoInline(Boolean(escolhido)); evento.currentTarget.value = ''; }} />}
      </div>
      {!somenteLeitura && podeAlterarObrigatoriedade && !arquivada && dados.status !== 'VERIFICADA' && <label className="inline-flex items-center gap-2 px-1 text-xs text-foreground/70">
        <input type="checkbox" checked={dados.obrigatoria} disabled={ocupado}
          onChange={e => void alterarObrigatoriedade(e.target.checked)} /> Evidência obrigatória
      </label>}
    </section>
    <details aria-label="Histórico da evidência" className="group rounded-xl border border-brand-green/20 bg-brand-darkgreen/5 p-3 sm:p-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 focus-visible:outline-2 focus-visible:outline-brand-neon [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-neon"><svg aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 5 7 7-7 7"/></svg>Rastreabilidade da evidência</span>
        <span className="text-xs text-foreground/60">{dados.historico?.length ?? 0} eventos · expandir histórico</span>
      </summary>
      <div className="mt-3 border-t border-brand-green/15 pt-3">
      {dados.historico?.length ? <ol className="space-y-2 border-l-2 border-brand-green/20 pl-3 text-xs">
        {dados.historico.map(ev => <li key={ev.id} className="relative space-y-1 before:absolute before:-left-[18px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-brand-green">
          <p className="font-semibold">{ev.descricao}</p>
          {ev.nomeAnterior && ev.nomeAtual && <p className="break-words text-foreground/80">Nome anterior: {ev.nomeAnterior} · Novo nome: {ev.nomeAtual}</p>}
          {ev.nomeArquivo && <p className="break-all text-foreground/85">Arquivo: {ev.nomeArquivo}</p>}
          <p className="text-foreground/65">{new Date(ev.ocorridoEm).toLocaleString('pt-BR')}
            {ev.ator ? ` · ${ev.ator.nome} (${ev.ator.email})` : ' · usuário não identificado'}</p>
        </li>)}
      </ol> : <p className="text-xs text-foreground/65">Não existem eventos específicos disponíveis nesta consulta.</p>}
      {dados.versoes.length > 1 && <details className="rounded-lg border border-brand-green/20 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-brand-neon">Versões anteriores preservadas · {dados.versoes.length - 1}</summary>
        <ul className="mt-3 space-y-2">{dados.versoes.slice(1).map(v => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-green/15 pt-2 text-xs">
          <div className="min-w-0"><p className="break-all font-semibold">{nomeArquivoLegivel(v.nomeOriginal)}</p>
            <p className="text-foreground/60">{new Date(v.criadoEm).toLocaleString('pt-BR')} · {ROTULO_STATUS[v.status]}</p></div>
          <button type="button" onClick={() => void baixar(v)} className="rounded-lg border border-brand-green/40 px-3 py-1.5">Baixar versão</button>
        </li>)}</ul>
      </details>}
      </div>
    </details>
    {erro && <p role="alert" className="rounded-lg border border-red-500/35 p-3 text-sm text-error-text">{erro}</p>}
  </div>
  {editorArquivo}
  {confirmandoVerificacao && ultima && createPortal(<div className="relative z-[170]">
    <ConfirmacaoSimples titulo="Confirmar verificação da evidência?"
      descricao={`Confirme somente se você baixou e analisou “${ultima.nomeOriginal}” e verificou que corresponde ao requisito desta evidência. A decisão será registrada na rastreabilidade; não conclui a execução física.`}
      confirmar="Confirmar verificação" cancelarVermelho ocupado={ocupado} onCancelar={() => setConfirmandoVerificacao(false)}
      onConfirmar={() => { setConfirmandoVerificacao(false); void executar(() => verificarComprovante(contratoId, entregavelId, esperadaId, ultima.id), 'Comprovante verificado e registrado na auditoria.'); }} />
  </div>, document.body)}
  </>;
}
