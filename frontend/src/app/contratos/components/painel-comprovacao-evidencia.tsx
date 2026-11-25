'use client';
import {CampoContribuicaoDisponivel} from './campo-contribuicao-disponivel';
import type {TipoEntregavel} from '@/lib/entregaveis';
import {EditorVinculosLocaisEvidencia} from './editor-vinculos-locais-evidencia';
import {EditorContribuicaoEvidencia} from './editor-contribuicao-evidencia';
import {ContadoresVinculos} from '@/app/components/contadores-vinculos';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { ModalEtapa } from './modal-etapa';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { IconeEvidencia } from './icone-evidencia';
import { estadoVisualEvidencia } from '@/lib/estado-visual-evidencia';
import { nomeArquivoLegivel } from '@/lib/nome-arquivo';
import { toastSucesso, toastErro } from '@/app/components/toast-notificacoes';
import {
  aceitarArquivoEvidencia, arquivoCompativelEvidencia, validarDetalheEvidencia,
  baixarComprovante, CLASSE_STATUS, consultarEvidencia, editarEvidencia,
  enviarComprovante, editarContribuicaoEvidencia, ROTULO_STATUS, verificarComprovante, rejeitarComprovante, alterarArquivoEvidencia, type DetalheEvidencia,
  type VersaoComprovante, type VinculoCompartilhado,
} from '@/lib/comprovantes';

/** Painel interno: editar o requisito, enviar o comprovante e verificar são ações independentes. */
export function PainelComprovacaoEvidencia({ contratoId, entregavelId, esperadaId, podeEditar, podeArquivar,
  podeAlterarObrigatoriedade = false, podeEnviar = true, ocultarArquivamento = false, somenteLeitura = false, anexacaoDireta = false, revisaoConsulta = 0,
  onPlanejamentoAlterado, onArquivada, onComprovanteAlterado, registrarVoltaEdicao, onIntegridadeDetalhe, onDetalheAtualizado, detalheConfirmado }: {
  contratoId: string; entregavelId: string; esperadaId: string; podeEditar: boolean;
  podeArquivar?: boolean; podeAlterarObrigatoriedade?: boolean; podeEnviar?: boolean; ocultarArquivamento?: boolean; somenteLeitura?: boolean; anexacaoDireta?: boolean; revisaoConsulta?: number;
  onPlanejamentoAlterado?: (detalhe?: DetalheEvidencia) => void; onArquivada?: () => void; onComprovanteAlterado?: (detalhe?: DetalheEvidencia) => void;
  detalheConfirmado?: DetalheEvidencia | null;
  registrarVoltaEdicao?: (voltar: (() => void) | null) => void;
  onIntegridadeDetalhe?: (id: string, valido: boolean) => void;
  onDetalheAtualizado?: (detalhe: DetalheEvidencia) => void;
  cancelamentoNoCabecalho?: boolean;
}) {
  const cache = useRepositorioConsultasOpcional();
  const [revisaoCarregada,setRevisaoCarregada] = useState<number|null>(null);
  const [dadosConsultados, setDados] = useState<DetalheEvidencia | null>(null);
  // Só reutiliza uma resposta autoritativa da MESMA revisão e do mesmo objeto.
  const dados = revisaoCarregada === revisaoConsulta ? dadosConsultados :
    detalheConfirmado?.id === esperadaId && detalheConfirmado.contratoId === contratoId && detalheConfirmado.entregavelId === entregavelId
      ? detalheConfirmado : null;
  const contextoPermiteAlterar = dados?.contextoPermiteAlterar !== false;
  const podeAnexar = podeEnviar && contextoPermiteAlterar && (!somenteLeitura || anexacaoDireta);
  const podeEditarMetadados = podeEditar && contextoPermiteAlterar && !somenteLeitura;
  const geracaoLeitura = useRef(0);
  const revisaoAtual = useRef(revisaoConsulta);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [editarVinculos,setEditarVinculos]=useState(false);
  const [editarContribuicao,setEditarContribuicao]=useState(false);
  const [editando, setEditando] = useState(false);
  const [campoInline, setCampoInline] = useState<'titulo' | 'orientacoes' | null>(null);
  const [destinoVerificar,setDestinoVerificar]=useState<VinculoCompartilhado|null>(null);
  const [confirmandoVerificacao, setConfirmandoVerificacao] = useState(false);
  const [confirmandoRejeicao, setConfirmandoRejeicao] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [tipo, setTipo] = useState('');
  const [descricaoEsperada, setDescricaoEsperada] = useState('');
  const [arquivoEdicao, setArquivoEdicao] = useState<File | null>(null);
  const [valorInline,setValorInline]=useState<string|null>(null);
  const [salvandoValor,setSalvandoValor]=useState(false);
  const [saldoInlineValido,setSaldoInlineValido]=useState(false);


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
    const geracao = revisaoAtual.current === revisaoConsulta ? ++geracaoLeitura.current : -1;
    const vigente = () => geracao === geracaoLeitura.current && revisaoAtual.current === revisaoConsulta;
    try {
      const atual = await consultarEvidencia(contratoId, entregavelId, esperadaId);
      validarDetalheEvidencia(atual);
      if (atual.contratoId !== contratoId || atual.entregavelId !== entregavelId || atual.id !== esperadaId)
        throw new Error('Dados da evidência não correspondem a este entregável.');
      if (vigente()) {
        setDados(atual); setErro('');
        onDetalheAtualizado?.(atual);
        onIntegridadeDetalhe?.(esperadaId, true);
      }
      return vigente() ? atual : undefined;
    } catch (falha) {
      if (vigente()) {
        setDados(null);
        onIntegridadeDetalhe?.(esperadaId, false);
        setErro(falha instanceof Error ? falha.message : 'Falha ao consultar evidência.');
      }
      throw falha;
    } finally {
      if (vigente()) { setRevisaoCarregada(revisaoConsulta); setCarregando(false); }
    }
  }, [contratoId, entregavelId, esperadaId, onIntegridadeDetalhe, onDetalheAtualizado, revisaoConsulta]);
  useEffect(() => {
    revisaoAtual.current = revisaoConsulta;
    void recarregar().catch(() => {});
    return () => { geracaoLeitura.current++; };
  }, [recarregar, revisaoConsulta]);
  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    setOcupado(true); setErro('');
    try {
      await acao();
      cache?.invalidar(['contratos']);
      cache?.invalidar(['execucao',contratoId]);
      cache?.invalidar(['ocorrencias',contratoId]);
      cache?.invalidar(['atividades',contratoId]);
      cache?.invalidar(['etapas', 'contrato', contratoId]);
      cache?.invalidar(['entregaveis', 'contrato', contratoId]);
      toastSucesso(mensagem, mensagem.startsWith('Comprovante em revisão') ? 'Em revisão' : 'Comprovante verificado');
      // A mutação já foi confirmada. Uma falha de leitura posterior não deve anunciar falha da decisão.
      const atualizado = await recarregar().catch(() => { setErro('Operação registrada. Não foi possível atualizar os dados da evidência.'); return undefined; });
      onComprovanteAlterado?.(atualizado);
    }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir a operação.'); }
    finally { setOcupado(false); }
  }
  function iniciarEdicao() {
    if (!dados || !podeAnexar || dados.status === 'VERIFICADA') return;
    setTipo(dados.tipoEvidencia); setDescricaoEsperada(dados.descricao ?? '');
    setArquivoEdicao(null); setEditando(true); setErro('');
    const marcador = `editar-evidencia:${esperadaId}:${++contadorEdicao.current}`;
    const anterior = window.history.state;
    window.history.pushState({ ...(anterior && typeof anterior === 'object' ? anterior : {}), __edicaoEvidencia: marcador }, '', window.location.href);
    marcadorEdicao.current = marcador;
    registrarVoltaEdicao?.(voltarDaEdicao);
  }
  async function salvarCampoInline(campo: 'titulo' | 'orientacoes') {
    if (ocupado || !dados || !podeEditarMetadados || dados.status === 'VERIFICADA') return;
    const novoTitulo = campo === 'titulo' ? tipo.trim() : dados.tipoEvidencia;
    const novaDescricao = campo === 'orientacoes' ? (descricaoEsperada.trim() || null) : dados.descricao;
    if (!novoTitulo) { setErro('Informe o título da evidência.'); return; }
    if (novaDescricao && novaDescricao.length > 65 && (campo === 'orientacoes' || novaDescricao !== dados.descricao)) { setErro('As orientações devem ter no máximo 65 caracteres.'); return; }
    if (campo === 'titulo' && novoTitulo.length > 50) { setErro('O título deve ter no máximo 50 caracteres.'); return; }
    setOcupado(true); setErro('');
    try {
      if (novoTitulo !== dados.tipoEvidencia || novaDescricao !== dados.descricao) {
        await editarEvidencia(contratoId, entregavelId, esperadaId,
          { ...(novoTitulo !== dados.tipoEvidencia ? { tipoEvidencia: novoTitulo } : {}), ...(novaDescricao !== dados.descricao ? { descricao: novaDescricao } : {}) });
        const atualizado = await recarregar().catch(() => { setErro('Alteração registrada. Não foi possível atualizar a consulta.'); return undefined; });
        onPlanejamentoAlterado?.(atualizado);
      }
      setCampoInline(null);
      toastSucesso('Evidência atualizada.');
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Falha ao editar a evidência.'); }
    finally { setOcupado(false); }
  }
  function iniciarCampoInline(campo: 'titulo' | 'orientacoes') {
    if (!dados || !podeEditarMetadados || dados.status === 'VERIFICADA') return;
    setTipo(dados.tipoEvidencia);
    setDescricaoEsperada(dados.descricao ?? '');
    setErro(''); setCampoInline(campo);
  }
  async function salvarEdicao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado || !arquivoEdicao || !podeAnexar || dados?.status === 'VERIFICADA') return;
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
      const atualizado = await recarregar().catch(() => undefined);
      voltarDaEdicao();
      onComprovanteAlterado?.(atualizado);
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
    if (ocupado || !arquivoEdicao || !podeAnexar || !dados || dados.versoes.length || arquivada) return;
    if (!arquivoCompativelEvidencia(dados.tipoEvidencia, arquivoEdicao)) {
      setErro('Formato incompatível com o tipo de evidência.'); return;
    }
    setOcupado(true); setErro('');
    try {
      await enviarComprovante(contratoId, entregavelId, esperadaId, arquivoEdicao, '');
      setArquivoEdicao(null); setAnexoInline(false);
      const atualizado = await recarregar().catch(() => { setErro('Arquivo recebido. Não foi possível atualizar a consulta.'); return undefined; }); onComprovanteAlterado?.(atualizado);
      toastSucesso('Comprovante anexado.');
    } catch (falha) {
      toastErro(falha instanceof Error ? falha.message : 'Não foi possível anexar o comprovante.');
      setErro(falha instanceof Error ? falha.message : 'Não foi possível anexar o comprovante.');
    } finally { setOcupado(false); }
  }
  async function alterarObrigatoriedade(obrigatoria: boolean) {
    if (ocupado || !contextoPermiteAlterar || somenteLeitura || !podeAlterarObrigatoriedade || !dados || dados.arquivadoEm || dados.entregavelArquivadoEm || dados.status === 'VERIFICADA') return;
    const obrigatoriaAnterior = dados.obrigatoria;
    // Checkbox controlado: a mudança visual deve ocorrer no mesmo evento do clique.
    // Aguardar o PATCH/GET antes de mudar `checked` faz o React restaurar o valor anterior.
    setDados(atual => atual?.id === esperadaId ? { ...atual, obrigatoria } : atual);
    setOcupado(true); setErro('');
    let gravado = false;
    try {
      await editarEvidencia(contratoId, entregavelId, esperadaId, { obrigatoria });
      gravado = true;
      const atualizado = await recarregar().catch(() => { setErro('Obrigatoriedade salva. Não foi possível atualizar a consulta.'); return undefined; });
      onPlanejamentoAlterado?.(atualizado);
      toastSucesso(`Evidência definida como ${obrigatoria ? 'obrigatória' : 'opcional'}.`);
    } catch (falha) {
      if (!gravado) {
        // Em erro do PATCH, consultar novamente o estado autoritativo. Se a
        // consulta também falhar, desfazer a atualização visual otimista.
        await recarregar().catch(() => {
          setDados(atual => atual?.id === esperadaId ? { ...atual, obrigatoria: obrigatoriaAnterior } : atual);
        });
      }
      setErro(gravado
        ? 'Obrigatoriedade salva, mas não foi possível atualizar a consulta. Tente atualizar a consulta.'
        : falha instanceof Error ? falha.message : 'Não foi possível alterar a obrigatoriedade.');
    } finally { setOcupado(false); }
  }
  async function baixar(v: VersaoComprovante) {
    setErro('');
    try { await baixarComprovante(contratoId, entregavelId, esperadaId, v); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha no download.'); }
  }
  if (!dados && (carregando || revisaoCarregada !== revisaoConsulta)) return <p role="status" className="text-sm text-foreground/70">Consultando evidência...</p>;
  if (!dados) return <div className="space-y-2"><p role="alert" className="text-sm text-error-text">{erro || 'Evidência indisponível.'}</p><button type="button" onClick={() => void recarregar().catch(() => {})} className="rounded-lg border border-current/20 px-3 py-1 text-sm">Tentar novamente</button></div>;
  const ultima = dados.versoes[0];
  const arquivada = Boolean(dados.arquivadoEm || dados.entregavelArquivadoEm);
  const estadoProprio = estadoVisualEvidencia(dados.status, dados.reabertoEm, arquivada);
  const confirmacaoArquivo = confirmandoArquivo && <div role="alertdialog" aria-label="Confirmar arquivamento da evidência"
    className="space-y-2 rounded-lg border border-orange-500/40 bg-orange-500/5 p-3 text-sm">
    <p>Arquivar esta evidência? Os comprovantes enviados serão preservados. Você poderá reativá-la em Arquivadas.</p>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" disabled={ocupado} onClick={cancelarConfirmacaoArquivo} className="rounded-lg border border-brand-green/30 px-3 py-1.5 text-xs">Cancelar</button>
      <button type="button" disabled={ocupado} onClick={() => void arquivar()} className="rounded-lg border border-orange-500/60 bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500">Confirmar arquivamento</button>
    </div>
  </div>;
  const editorArquivo = editando && createPortal(<ModalEtapa titulo={ultima ? 'Substituir comprovante' : 'Anexar comprovante'}
    contexto="Arquivo da evidência" camada="edicao" larguraFormulario="evidencia" compacto estadoContextual={dados.reabertoEm ? 'revisao' : dados.status === 'PENDENTE_VERIFICACAO' ? 'pendente' : 'normal'} ocupado={ocupado} textoFechar="Fechar ×"
    somenteIconeFechar rotuloFechar="Cancelar edição do arquivo" onFechar={voltarDaEdicao}>
    <section aria-label="Edição individual da evidência" data-testid="painel-edicao-evidencia" className="space-y-3">
      <form data-tec08-formulario-contextual aria-label="Enviar comprovação" onSubmit={e => void salvarEdicao(e)} className="pi-form-evidencia space-y-3 text-sm">
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

        <div className="pi-rodape-formulario flex justify-end gap-2 border-t border-current/15 pt-3" role="group" aria-label="Ações de edição da evidência"><button type="button" disabled={ocupado} onClick={voltarDaEdicao} className="rounded-lg border border-current/25 px-3 py-2 text-sm">Cancelar</button>
          <button type="submit" disabled={ocupado || !arquivoEdicao}
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green disabled:opacity-50">
            {ocupado ? 'Enviando...' : ultima ? 'Substituir anexo' : 'Anexar comprovante'}
          </button>
        </div>
      </form>
    </section>
  </ModalEtapa>, document.body);
  return <><div className="space-y-3" data-testid="painel-comprovacao-evidencia" data-evidencia-estado={estadoProprio} data-tec08-painel-evidencia>
    <div className="flex items-center gap-2">
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${dados.reabertoEm && dados.status !== 'VERIFICADA' ? 'border-teal-500/45 bg-teal-500/10 text-teal-800 dark:text-teal-200' : CLASSE_STATUS[dados.status]}`}
        data-testid="status-verificacao">{dados.reabertoEm && dados.status !== 'VERIFICADA' ? `Em revisão · ${ROTULO_STATUS[dados.status]}` : ROTULO_STATUS[dados.status]}</span>
      {dados.podeVerificar && ['PENDENTE_VERIFICACAO','REJEITADA'].includes(dados.versoes[0]?.status??'') && !Boolean(dados.arquivadoEm || dados.entregavelArquivadoEm) && <button type="button"
        disabled={ocupado} aria-label="Verificar comprovante" onClick={() => setConfirmandoVerificacao(true)}
        className="ml-auto rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50">Verificar</button>}
      {dados.podeVerificar && dados.versoes[0]?.status === 'PENDENTE_VERIFICACAO' && !arquivada &&
        <button type="button" disabled={ocupado} aria-label="Devolver para revisão" onClick={() => { setMotivoRejeicao(''); setConfirmandoRejeicao(true); }}
          className="rounded-lg border border-red-500/50 px-3 py-2 text-xs font-semibold text-error-text hover:bg-red-500/10">Revisar</button>}
      {!dados.podeVerificar && dados.versoes[0]?.status === 'PENDENTE_VERIFICACAO' && <span className="text-xs text-foreground/65">Verificação depende de autorização e da situação do registro.</span>}
      {!ocultarArquivamento && contextoPermiteAlterar && (podeArquivar ?? podeEditar) && !arquivada && dados.status !== 'VERIFICADA' && <button type="button" ref={botaoArquivarRef} disabled={ocupado}
        aria-label="Arquivar evidência" title="Arquivar evidência"
        onClick={() => setConfirmandoArquivo(true)} className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-orange-500/50 text-orange-700 hover:bg-orange-500/15 dark:text-orange-300 disabled:opacity-50">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg>
      </button>}
    </div>
    <ContadoresVinculos itens={[{rotulo:"Contratos",total:new Set([contratoId,...(dados.compartilhamentos??[]).filter(v=>v.vigente).map(v=>v.contratoId)]).size},{rotulo:"Entregáveis",total:new Set([entregavelId,...(dados.compartilhamentos??[]).filter(v=>v.vigente).map(v=>v.entregavelId)]).size},{rotulo:"Ocorrências",total:dados.vinculosAtuais?.filter(v=>v.tipo==='ocorrencia').length??null},{rotulo:"Atividades",total:dados.vinculosAtuais?.filter(v=>v.tipo==='atividade').length??null}]}/>{Boolean(dados.vinculosAtuais?.length)&&<details className="text-sm"><summary className="cursor-pointer">Consultar vínculos</summary><ul className="mt-2 space-y-1">{dados.vinculosAtuais?.map(v=><li key={`${v.tipo}:${v.id}`} className="truncate" title={v.titulo}>{v.tipo==='ocorrencia'?'Ocorrência':'Atividade'}: {v.titulo}</li>)}</ul></details>}
    {cache&&podeEditarMetadados&&!arquivada&&dados.status!=='VERIFICADA'&&<button type="button" className="self-start rounded-md border border-current/20 px-3 py-1.5 text-xs" disabled={ocupado} onClick={()=>setEditarVinculos(true)}>Editar vínculos</button>}
    {editarVinculos&&cache&&podeEditarMetadados&&<EditorVinculosLocaisEvidencia dados={dados} fechar={()=>setEditarVinculos(false)} atualizar={async()=>{cache.invalidar(['execucao',contratoId]);cache.invalidar(['ocorrencias',contratoId]);cache.invalidar(['atividades',contratoId]);cache.invalidar(['entregaveis','contrato',contratoId]);const d=await recarregar();onComprovanteAlterado?.(d);}}/>}
    {Boolean(dados.compartilhamentos?.length)&&<details className="rounded-lg border border-current/15 p-3 text-sm"><summary className="cursor-pointer font-medium">Verificações por destino</summary><div className="mt-2 divide-y divide-current/10">{dados.compartilhamentos?.map(v=><div key={v.comprovanteId} className="flex items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="truncate" title={v.entregavel}>{v.entregavel}</p><p className="text-xs text-foreground/65">Contrato {v.contrato} · {v.vigente?ROTULO_STATUS[v.status]:'Versão histórica'}</p></div>{v.podeVerificar&&v.comprovanteId!==dados.versoes[0]?.id&&!somenteLeitura&&<button type="button" disabled={ocupado} onClick={()=>setDestinoVerificar(v)} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Verificar</button>}</div>)}</div></details>}
    {destinoVerificar&&<ConfirmacaoSimples titulo="Verificar evidência neste destino?" descricao={`Contrato ${destinoVerificar.contrato} · ${destinoVerificar.entregavel}. A decisão não altera a verificação nem a execução física de outros destinos.`} confirmar="Verificar" aprovarVerde ocupado={ocupado} onCancelar={()=>setDestinoVerificar(null)} onConfirmar={()=>{const v=destinoVerificar;setOcupado(true);setErro('');void verificarComprovante(v.contratoId,v.entregavelId,v.esperadaId,v.comprovanteId).then(async()=>{setDestinoVerificar(null);cache?.invalidar(['contratos']);cache?.invalidar(['execucao',v.contratoId]);cache?.invalidar(['ocorrencias',v.contratoId]);cache?.invalidar(['atividades',v.contratoId]);cache?.invalidar(['etapas','contrato',v.contratoId]);cache?.invalidar(['entregaveis','contrato',v.contratoId]);await recarregar();onComprovanteAlterado?.();toastSucesso('Evidência verificada neste destino.');}).catch(e=>{setDestinoVerificar(null);setErro(e instanceof Error?e.message:'Não foi possível verificar o destino.');}).finally(()=>setOcupado(false));}}/>}
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        {campoInline === 'titulo' && podeEditarMetadados && !ultima && !arquivada && dados.status !== 'VERIFICADA' ? <div className="min-w-0 flex-1"><label htmlFor={`titulo-inline-${esperadaId}`} className="sr-only">Tipo da evidência</label>
          <select id={`titulo-inline-${esperadaId}`} value={tipo === 'Foto' || tipo === 'Relatório' ? tipo : '__legado'}
            onChange={e => setTipo(e.target.value)}
            className="w-full rounded-lg border border-brand-green/35 bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-brand-neon">
            {tipo !== 'Foto' && tipo !== 'Relatório' && <option value="__legado" disabled>Tipo anterior: {tipo}</option>}
            <option value="Foto">Foto</option>
            <option value="Relatório">Relatório</option>
          </select></div>
          : <span title={dados.tipoEvidencia} className="min-w-0 flex-1 truncate font-semibold text-foreground">{dados.tipoEvidencia}</span>}
        {podeEditarMetadados && !ultima && !arquivada && dados.status !== 'VERIFICADA' && <div className="flex shrink-0 items-center gap-1">
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
          {podeEditarMetadados && !arquivada && dados.status !== 'VERIFICADA' && (campoInline === 'orientacoes' ? <div className="flex gap-1">
            <button type="button" disabled={ocupado} onClick={() => void salvarCampoInline('orientacoes')} aria-label="Salvar orientações"
              className="rounded-lg bg-brand-green px-2 py-1 text-xs text-on-brand-green">Salvar</button>
            <button type="button" onClick={() => setCampoInline(null)} aria-label="Cancelar edição das orientações"
              className="rounded-lg border border-brand-green/25 px-2 py-1 text-xs">Cancelar</button>
          </div> : <button type="button" aria-label="Editar orientações" title="Editar orientações" onClick={() => iniciarCampoInline('orientacoes')}
            className="rounded-md p-1 text-foreground/65 hover:text-brand-neon">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 5 4 4M4 20l4.5-1 11-11a2 2 0 0 0-3-3l-11 11L4 20Z"/></svg>
          </button>)}</div>
        {campoInline === 'orientacoes' && podeEditarMetadados && !arquivada && dados.status !== 'VERIFICADA' ? <><label htmlFor={`orientacoes-inline-${esperadaId}`} className="sr-only">Orientações da evidência</label>
          <textarea id={`orientacoes-inline-${esperadaId}`} maxLength={65} rows={2} value={descricaoEsperada}
            onChange={e => setDescricaoEsperada(e.target.value)} className="w-full resize-y rounded-lg border border-brand-green/20 bg-transparent px-2 py-1 text-sm outline-none focus:border-brand-neon" /><p className="text-right text-xs text-foreground/55">{descricaoEsperada.length}/65</p></>
          : <p className="whitespace-pre-wrap break-words text-xs text-foreground/70">{dados.descricao || 'Nenhuma orientação registrada'}</p>}
      </div>}
    </div>
    {(dados.quantidadeMensuravel || ['UNICO','QUANTITATIVO','RECORRENTE','CONTINUO'].includes(dados.tipoEntregavel??'') || Boolean(dados.ocorrenciasDescritivas?.length) || ultima?.quantidadeDeclarada!=null || ultima?.percentualDeclarado!=null || dados.declaracaoPreliminar) && <section className="pi-evidencia-contribuicao-v21 space-y-3 border-t border-current/15 pt-3">
      <div className="flex items-center justify-between gap-2"><strong>Contribuição da evidência</strong>{!somenteLeitura&&!arquivada&&ultima&&dados.compartilhamentos?.some(v=>v.vigente&&v.comprovanteId!==ultima.id)&&<button type="button" className="text-xs underline" onClick={()=>setEditarContribuicao(true)}>Outros destinos</button>}</div>
      {(()=>{
        const origem=ultima??dados.declaracaoPreliminar;
        const percentual=origem?.percentualDeclarado!=null || (origem?.quantidadeDeclarada==null&&!dados.quantidadeMensuravel&&dados.tipoEntregavel!=='QUANTITATIVO');
        const modalidadeDisponivel=percentual ? dados.tipoEntregavel==='UNICO'||Boolean(dados.ocorrenciasDescritivas?.length) : Boolean(dados.quantidadeMensuravel);
        const declarado=percentual?origem?.percentualDeclarado:origem?.quantidadeDeclarada;
        const ocorrenciaId=percentual?origem?.ocorrenciaPercentualId:origem?.ocorrenciaQuantidadeId;
        const precisaDestino=percentual?dados.tipoEntregavel!=='UNICO':!dados.quantidadeDiretaPermitida;
        const podeAlterar=Boolean((modalidadeDisponivel||origem?.quantidadeDeclarada!=null||origem?.percentualDeclarado!=null)&&dados.podeEditarContribuicao&&!somenteLeitura&&!arquivada&&!origem?.referenciaPercentualId&&origem?.origemQuantidade!=='COMPROVACAO');
        const valor=declarado==null?'—':Number(declarado).toLocaleString('pt-BR',{maximumFractionDigits:percentual?2:3});
        const salvar=async()=>{
          if(!podeAlterar||valorInline===null||salvandoValor||cache&&!saldoInlineValido)return;
          const v=valorInline.trim().replace(',','.');
          if(v&&(!(percentual?/^\d{1,3}(?:\.\d{1,2})?$/:/^\d{1,15}(?:\.\d{1,3})?$/).test(v)||Number(v)<0||percentual&&Number(v)>100)){setErro('Informe uma contribuição válida.');return;}
          const temValor=Boolean(v&&Number(v)>0);
          setSalvandoValor(true);setErro('');
          try{
            await editarContribuicaoEvidencia(contratoId,entregavelId,esperadaId,ultima?.id??'rascunho',{modalidade:temValor?(percentual?'PERCENTUAL':'QUANTITATIVA'):'SEM_CONTRIBUICAO',...(temValor?{valor:v,...(ocorrenciaId?{ocorrenciaId}:{})}:{})});
            setValorInline(null);cache?.invalidar(['execucao',contratoId]);cache?.invalidar(['entregaveis','contrato',contratoId]);cache?.invalidar(['ocorrencias',contratoId]);const atualizado=await recarregar();onComprovanteAlterado?.(atualizado);
          }catch(e){setErro(e instanceof Error?e.message:'Não foi possível alterar a contribuição.');}finally{setSalvandoValor(false);}
        };
        return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div className="min-w-0"><p className="text-xs text-foreground/65">{percentual?'Percentual executado':'Quantidade executada'}</p>{valorInline!==null?<div className="flex items-center gap-2">{cache?<div className="min-w-0 flex-1" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void salvar();}if(e.key==='Escape')setValorInline(null);}}><CampoContribuicaoDisponivel inline item={{id:entregavelId,contratoId,tipo:(dados.tipoEntregavel??'UNICO') as TipoEntregavel,quantidadePrevista:dados.quantidadePrevista??null,quantidadeRealizada:null,unidadeMedida:dados.unidadeMedida??null}} ocorrenciaId={ocorrenciaId??undefined} modo={percentual?'percentual':'quantidade'} origem="EVIDENCIA" origemId={ultima?.id} valor={valorInline} onValor={setValorInline} onValidade={setSaldoInlineValido} disabled={salvandoValor}/></div>:<input autoFocus aria-label="Editar valor da contribuição" className="pi-edicao-valor-evidencia font-semibold" inputMode="decimal" placeholder={percentual?'0%':`Ex.: 2 ${dados.unidadeMedida??'unidades'}`} value={valorInline} onChange={e=>{if((percentual?/^\d{0,3}(?:[.,]\d{0,2})?$/:/^\d{0,15}(?:[.,]\d{0,3})?$/).test(e.target.value))setValorInline(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void salvar();}if(e.key==='Escape')setValorInline(null);}} disabled={salvandoValor}/>}<button type="button" aria-label="Salvar contribuição" disabled={salvandoValor||Boolean(cache&&!saldoInlineValido)} onClick={()=>void salvar()}>✓</button><button type="button" aria-label="Cancelar edição" disabled={salvandoValor} onClick={()=>setValorInline(null)}>×</button></div>:<div className="flex items-center gap-2"><strong>{valor}{declarado!=null?(percentual?'%':` ${dados.unidadeMedida??''}`):''}</strong>{podeAlterar&&<button type="button" aria-label="Editar contribuição" title="Editar contribuição" onClick={()=>{if(precisaDestino&&!ocorrenciaId)setEditarContribuicao(true);else {setSaldoInlineValido(false);setValorInline(declarado==null?'':Number(declarado).toLocaleString('pt-BR',{useGrouping:false,maximumFractionDigits:percentual?2:3}));}}}><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 16-1 5 5-1L20 8l-4-4Z M14 6l4 4"/></svg></button>}</div>}</div>{!modalidadeDisponivel&&declarado==null?<p className="self-end text-xs text-foreground/60">Não há destino de execução compatível nesta configuração. A evidência pode comprovar documentalmente.</p>:!ultima&&<p className="self-end text-xs text-foreground/60">A contribuição será reconhecida somente após o envio e a verificação do comprovante.</p>}</div>;
      })()}
    </section>}
    {editarContribuicao&&<EditorContribuicaoEvidencia dados={dados} fechar={()=>{setEditarContribuicao(false);registrarVoltaEdicao?.(null);}} atualizar={async()=>{cache?.invalidar(['contratos']);cache?.invalidar(['execucao']);cache?.invalidar(['ocorrencias']);cache?.invalidar(['entregaveis']);const d=await recarregar();onComprovanteAlterado?.(d);}}/>}
    {!editando && confirmacaoArquivo}
    {arquivada && <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">Evidência arquivada. Arquivos e histórico disponíveis para consulta.</p>}
    <details data-tec08-secao-filho data-tec08-estado={estadoProprio} data-tec08-historico-evidencia data-pi-historico-neutro aria-label="Histórico da evidência" className="group rounded-xl border border-brand-green/20 bg-brand-darkgreen/5 p-3 sm:p-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 focus-visible:outline-2 focus-visible:outline-brand-neon [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"><svg aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 5 7 7-7 7"/></svg>Rastreabilidade da evidência</span>
        <span className="text-xs text-foreground/60">{dados.historico?.length ?? 0} eventos · expandir histórico</span>
      </summary>
      <div className="mt-3 border-t border-brand-green/15 pt-3">
      {dados.historico?.length ? <ol className="space-y-2 border-l-2 border-brand-green/20 pl-3 text-xs">
        {dados.historico.map(ev => <li key={ev.id} className="relative space-y-1 before:absolute before:-left-[18px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-brand-green">
          <p className="font-semibold">{ev.descricao}</p>
          {ev.nomeAnterior && ev.nomeAtual && <p className="break-words text-foreground/80">Nome anterior: {ev.nomeAnterior} · Novo nome: {ev.nomeAtual}</p>}
          {ev.nomeArquivo && <p className="break-all text-foreground/85">Arquivo: {ev.nomeArquivo}</p>}
          {ev.justificativa && <p className="break-words text-foreground/80">Justificativa: {ev.justificativa}</p>}
          <p className="text-foreground/65">{new Date(ev.ocorridoEm).toLocaleString('pt-BR')}
            {ev.ator ? ` · ${ev.ator.nome} (${ev.ator.email})` : ' · usuário não identificado'}</p>
        </li>)}
      </ol> : <p className="text-xs text-foreground/65">Não existem eventos específicos disponíveis nesta consulta.</p>}
      {dados.versoes.length > 1 && <details className="rounded-lg border border-brand-green/20 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-brand-neon">Versões anteriores preservadas · {dados.versoes.length - 1}</summary>
        <ul className="mt-3 space-y-2">{dados.versoes.slice(1).map(v => <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-green/15 pt-2 text-xs">
          <div className="min-w-0"><p className="break-all font-semibold">{nomeArquivoLegivel(v.nomeOriginal)}</p>
            <p className="text-foreground/60">{new Date(v.criadoEm).toLocaleString('pt-BR')} · {ROTULO_STATUS[v.status]}</p></div>
          <button data-pi-acao="secundaria" type="button" onClick={() => void baixar(v)} className="rounded-lg border border-brand-green/40 px-3 py-1.5">Baixar versão</button>
        </li>)}</ul>
      </details>}
      </div>
    </details>
    <section aria-label="Comprovação da evidência" className="space-y-2">
      <div data-tec08-secao-filho data-tec08-estado={estadoProprio} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-brand-green/20 bg-brand-darkgreen/5 p-3">
        {anexoInline && arquivoEdicao && !ultima && podeAnexar && !arquivada ?
          <form data-tec08-formulario-contextual aria-label="Anexar comprovante" onSubmit={e => void enviarPrimeiroComprovante(e)}
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
            {podeAnexar && !arquivada && ultima?.status !== 'VERIFICADA' && <button type="button" aria-label={ultima ? 'Substituir comprovante' : 'Anexar comprovante'}
              title={ultima ? 'Substituir comprovante' : 'Anexar comprovante'}
              disabled={ocupado} onClick={() => { if (ultima) iniciarEdicao(); else inputPrimeiroComprovanteRef.current?.click(); }}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-brand-green/35 text-brand-neon transition-colors hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m20 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9.9-9.9a3.7 3.7 0 0 1 5.3 5.3l-10 10a1.8 1.8 0 0 1-2.6-2.6l8.8-8.8"/></svg>
            </button>}
            {ultima && <button data-pi-acao="secundaria" type="button" aria-label="Baixar comprovante" title="Baixar comprovante" onClick={() => void baixar(ultima)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-brand-green/30 hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon">
              <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3"/></svg>
            </button>}
          </div>
        </>}
        {podeAnexar && !ultima && !arquivada && <input ref={inputPrimeiroComprovanteRef}
          aria-label="Selecionar arquivo" type="file" accept={aceitarArquivoEvidencia(dados.tipoEvidencia)}
          className="sr-only" onChange={evento => { const escolhido = evento.target.files?.[0] ?? null;
            setArquivoEdicao(escolhido); setAnexoInline(Boolean(escolhido)); evento.currentTarget.value = ''; }} />}
      </div>
      {!somenteLeitura && contextoPermiteAlterar && podeAlterarObrigatoriedade && !arquivada && dados.status !== 'VERIFICADA' && <label className="inline-flex items-center gap-2 px-1 text-xs text-foreground/70">
        <input type="checkbox" checked={dados.obrigatoria} disabled={ocupado}
          onChange={e => void alterarObrigatoriedade(e.target.checked)} /> Evidência obrigatória
      </label>}
    </section>

    {erro && <p role="alert" className="rounded-lg border border-red-500/35 p-3 text-sm text-error-text">{erro}</p>}
  </div>
  {editorArquivo}
  {confirmandoRejeicao && ultima && <ConfirmacaoSimples titulo="Devolver comprovante para revisão?"
    descricao="A versão será preservada, a quantidade verificada deixa de contar e a justificativa será auditada."
    confirmar="Devolver para revisão" perigoso ocupado={ocupado}
    justificativa={motivoRejeicao} onJustificativaChange={setMotivoRejeicao} justificativaMinima={15}
    onCancelar={() => setConfirmandoRejeicao(false)}
    onConfirmar={() => { setConfirmandoRejeicao(false);
      void executar(() => rejeitarComprovante(contratoId, entregavelId, esperadaId, ultima.id, motivoRejeicao.trim()),
        'Comprovante em revisão. A contribuição não será contabilizada.'); }} />}
  {confirmandoVerificacao && ultima && createPortal(<div className="relative z-[170]">
    <ConfirmacaoSimples titulo="Confirmar verificação da evidência?"
      descricao={`Confirme somente se você baixou e analisou “${ultima.nomeOriginal}” e verificou que corresponde ao requisito desta evidência. A decisão será registrada na rastreabilidade. Se houver contribuição física declarada, o valor cadastrado será reconhecido; a conclusão do entregável exige aprovação própria.`}
      confirmar="Confirmar verificação" cancelarVermelho ocupado={ocupado} onCancelar={() => setConfirmandoVerificacao(false)}
      onConfirmar={() => { setConfirmandoVerificacao(false); void executar(() => verificarComprovante(contratoId, entregavelId, esperadaId, ultima.id), 'Comprovante verificado e registrado na auditoria.'); }} />
  </div>, document.body)}
  </>;
}
