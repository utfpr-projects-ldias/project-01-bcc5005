'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
import { concluirEntregavel, editarEntregavel, consultarHistoricoEntregavel, type Entregavel, type ResumoDocumentalEntregavel } from '@/lib/entregaveis';
import { FormularioEntregavel } from './formulario-entregavel';
import { ConteudoEntregavel } from './conteudo-entregavel';
import { ModalEtapa } from './modal-etapa';
import type { DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
import type { PermissoesContrato } from '@/lib/contratos';
import { toastSucesso } from '@/app/components/toast-notificacoes';
import { comprovacaoDocumentalCompleta } from '@/lib/situacao-documental-etapa';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';

/** Consulta o detalhe real no backend, sem confiar só na listagem em cache. */
export function ModalDetalheEntregavel({ contratoId, etapaId, entregavelId, itemInicial, podeEditar, focoRetorno, onFechar, atualizar, permissoes, dentroModal = false, iniciarEditando = false, paiArquivado = false, paiConcluido = false, paiEmRevisao = false, verificado = false, resumoInicial }: {
  contratoId: string; etapaId: string; entregavelId: string; itemInicial?: Entregavel; podeEditar: boolean;
  focoRetorno: HTMLElement | null; onFechar: () => void;
  atualizar: () => Promise<unknown>;
  permissoes?: PermissoesContrato; dentroModal?: boolean; iniciarEditando?: boolean; paiArquivado?: boolean; paiConcluido?: boolean; paiEmRevisao?: boolean; verificado?: boolean; resumoInicial?: ResumoDocumentalEntregavel;
}) {
  const consulta = useDetalheEntregavel(contratoId, entregavelId);
  const [editando, setEditando] = useState(iniciarEditando && !paiArquivado);
  const marcadorEdicaoEntregavel = useRef<string | null>(null);
  function voltarDaEdicaoEntregavel() {
    // O lápis do CARD já abriu este modal editando. Cancelar precisa retornar
    // à etapa diretamente, não converter o formulário num segundo modal de detalhe.
    if (iniciarEditando) { onFechar(); return; }
    setEditando(false);
    const marcador = marcadorEdicaoEntregavel.current;
    marcadorEdicaoEntregavel.current = null;
    if (marcador && window.history.state?.__editarEntregavel === marcador) window.history.back();
  }
  useEffect(() => {
    const voltar = () => {
      if (!marcadorEdicaoEntregavel.current || window.history.state?.__editarEntregavel === marcadorEdicaoEntregavel.current) return;
      marcadorEdicaoEntregavel.current = null;
      setEditando(false);
    };
    window.addEventListener('popstate', voltar);
    return () => window.removeEventListener('popstate', voltar);
  }, []);
  const [salvando, setSalvando] = useState(false);
  const [confirmarConclusao, setConfirmarConclusao] = useState(false);
  const [erroConclusao, setErroConclusao] = useState('');
  const [ajusteEntregavel, setAjusteEntregavel] = useState<{ chave: string; alterou: boolean } | null>(null);
  const voltarEvidencia = useRef<(() => void) | null>(null);
  const voltarEdicaoEvidencia = useRef<(() => void) | null>(null);
  const [nivel, setNivel] = useState<'entregavel' | 'evidencia' | 'editar-evidencia'>('entregavel');
  function fecharNivel() {
    if (voltarEdicaoEvidencia.current) { voltarEdicaoEvidencia.current(); return; }
    if (voltarEvidencia.current) { voltarEvidencia.current(); return; }
    if (editando) { voltarDaEdicaoEntregavel(); return; }
    onFechar();
  }
  const registrarEvidencia = useCallback((voltar: (() => void) | null) => {
    voltarEvidencia.current = voltar;
    setNivel(voltar ? 'evidencia' : 'entregavel');
    if (!voltar) voltarEdicaoEvidencia.current = null;
  }, []);
  const registrarEdicaoEvidencia = useCallback((voltar: (() => void) | null) => {
    voltarEdicaoEvidencia.current = voltar;
    setNivel(voltar ? 'editar-evidencia' : 'evidencia');
  }, []);
  const erro = consulta.erro;
  // Uma resposta em cache de outro contrato/etapa nunca pode ser apresentada.
  const consultaValida = consulta.dados?.id === entregavelId && consulta.dados.contratoId === contratoId &&
    consulta.dados.etapaId === etapaId ? consulta.dados : undefined;
  const itemInicialValido = itemInicial?.id === entregavelId && itemInicial.contratoId === contratoId &&
    itemInicial.etapaId === etapaId ? itemInicial : undefined;
  // O item da listagem é apenas um pré-carregamento VISUAL enquanto o GET
  // autoritativo está pendente. Ao receber resposta, nunca substituí-la pelo
  // cache da lista: isso exibiria dados incorretos em 403/404 ou troca de contrato.
  // Mesmo uma resposta de outro contrato/etapa deve falhar fechada.
  const item = erro ? undefined : consulta.dados !== undefined
    ? consultaValida
    : consulta.carregando ? itemInicialValido : undefined;
  const chaveRevisaoEntregavel = item?.reabertoEm ? `${item.id}:${item.reabertoEm}` : '';
  useEffect(() => {
    if (!item?.reabertoEm) return;
    const controller = new AbortController();
    const inicio = new Date(item.reabertoEm).getTime();
    void consultarHistoricoEntregavel(contratoId, entregavelId, controller.signal).then(eventos => {
      if (controller.signal.aborted) return;
      setAjusteEntregavel({ chave: chaveRevisaoEntregavel, alterou: eventos.some(evento =>
        new Date(evento.ocorridoEm).getTime() > inicio &&
        /(?:EDITAD|ALTERAD|ANEXAD|ARQUIVAD|REATIVAD|CRIAD|CONFIGURAD)/.test(evento.acao)) });
    }).catch(() => { if (!controller.signal.aborted) setAjusteEntregavel({ chave: chaveRevisaoEntregavel, alterou: false }); });
    return () => controller.abort();
  }, [chaveRevisaoEntregavel, contratoId, entregavelId, item?.reabertoEm]);
  const tituloConclusaoEntregavel = item?.reabertoEm
    ? ajusteEntregavel?.chave === chaveRevisaoEntregavel && ajusteEntregavel.alterou ? 'Concluir ajustes' : 'Fechar novamente'
    : 'Concluir entregável';
  const bloqueioArquivo = paiArquivado || Boolean(item?.arquivadoEm);
  const bloqueioEdicao = bloqueioArquivo || paiConcluido;
  async function salvar(dados: DadosPlanejamentoEntregavel) {
    if (bloqueioEdicao || verificado || item?.statusExecucao === 'CONCLUIDO') return;
    // O checklist não pertence à edição cadastral do entregável. Enviar o array
    // antigo aqui poderia sobrescrever uma alteração concorrente de UM item ou
    // remover um comprovante vinculado ao registro esperado.
    const planejamento: Partial<DadosPlanejamentoEntregavel> = { ...dados };
    delete planejamento.evidenciasEsperadas;
    await editarEntregavel(contratoId, entregavelId, planejamento);
    voltarDaEdicaoEntregavel();
    toastSucesso('Planejamento atualizado.');
    void consulta.atualizar().catch(() => {});
    void atualizar().catch(() => {});
  }
  const podeConcluir = Boolean(item && consulta.dados && !bloqueioEdicao && (item.reabertoEm || item.statusExecucao !== 'CONCLUIDO') && !editando &&
    permissoes?.concluirEntregaveis && comprovacaoDocumentalCompleta(resumoInicial) &&
    item.evidenciasEsperadas.filter(ev => !ev.arquivadoEm).every(ev => !ev.reabertoEm));
  async function concluir() {
    if (!podeConcluir || salvando) return;
    setSalvando(true); setErroConclusao('');
    try {
      await concluirEntregavel(contratoId, entregavelId);
      setConfirmarConclusao(false);
      toastSucesso('Entregável concluído; a etapa será concluída se todos os filhos estiverem prontos.');
      await Promise.allSettled([consulta.atualizar(), atualizar()]);
    } catch (error) { setErroConclusao(error instanceof Error ? error.message : 'Falha ao concluir entregável.'); }
    finally { setSalvando(false); }
  }
  return createPortal(<ModalEtapa camada={dentroModal ? "aninhada" : "principal"} contexto="Entregável do contrato" titulo={item?.nome ?? 'Detalhes do entregável'} codigoPublico={item?.codigoPublico}
    retornoEsquerda={!editando} alturaEstavel formularioLongo={editando}
    arquivado={bloqueioArquivo} revisao={Boolean(item?.reabertoEm && !bloqueioArquivo)} concluido={!bloqueioArquivo && !item?.reabertoEm && !editando && item?.statusExecucao === 'CONCLUIDO'} estadoContextual={paiEmRevisao ? 'revisao' : 'normal'}

    ocultarFechar={editando}
    rotuloFechar={nivel !== 'entregavel' || editando ? 'Voltar ao nível anterior' : 'Voltar à etapa'}
    textoFechar='← Etapa'
    bloqueadoPorSubmodal={nivel !== 'entregavel'}
    acoes={podeConcluir ? <button type="button" onClick={() => setConfirmarConclusao(true)}
      className="rounded-lg border border-violet-500 bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-violet-300">
      ✓ {tituloConclusaoEntregavel}
    </button> : undefined}
    ocupado={salvando} focoRetorno={focoRetorno} onFechar={fecharNivel}>
    <div className="min-w-0 space-y-4" data-testid="modal-detalhe-entregavel">
      {consulta.carregando && !item && <p role="status">Carregando dados do entregável...</p>}
      {Boolean(erro) && <p role="alert" className="text-error-text">{erro instanceof Error ? erro.message : 'Não foi possível consultar o entregável.'}</p>}
      {!consulta.carregando && !erro && !item && <p role="alert">Entregável não encontrado ou sem acesso neste contrato.</p>}
      {erroConclusao && <p role="alert" className="text-error-text">{erroConclusao}</p>}
      {item && <>
        {bloqueioArquivo && <span className="inline-flex rounded-full border border-amber-400/50 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-100">Arquivado — somente leitura</span>}
        {!editando && (item.reabertoEm || verificado) && <div className="flex flex-wrap gap-2">
          {item.reabertoEm && <span className="rounded-full border border-teal-600/55 bg-teal-900/20 px-3 py-1 text-xs font-semibold text-teal-200">Em revisão</span>}
          {verificado && !item.reabertoEm && <span className="rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-100">{item.statusExecucao === "CONCLUIDO" ? "Concluído" : "Comprovação verificada"}</span>}
        </div>}
        {editando && !bloqueioEdicao && !verificado && item.statusExecucao !== 'CONCLUIDO' ? <FormularioEntregavel key={item.id} contratoId={contratoId} etapaId={etapaId} inicial={item}
          onSalvar={salvar} onCancelar={voltarDaEdicaoEntregavel}
          onSalvandoMudou={setSalvando}
          podeAlterarObrigatoriedade={permissoes?.alterarObrigatoriedade ?? false} />
          : <ConteudoEntregavel item={item} resumoInicial={resumoInicial} podeEditarEsperada={!bloqueioEdicao && !verificado && item.statusExecucao !== 'CONCLUIDO' && (permissoes?.editarEvidencias ?? podeEditar)}
              podeCriarEvidencia={!bloqueioEdicao && !verificado && item.statusExecucao !== 'CONCLUIDO' && (permissoes?.criarEvidencias ?? podeEditar)}
              podeArquivarEvidencia={(permissoes?.arquivarEvidencias ?? podeEditar) && !bloqueioEdicao}
              podeReativarEvidencia={Boolean(permissoes?.reativarEvidencias) && !bloqueioEdicao}
              podeReabrirEvidencia={Boolean(permissoes?.reabrirEvidencias) && !bloqueioEdicao}
              podeExcluirEvidenciaArquivada={!bloqueioEdicao && (permissoes?.excluirEvidenciasArquivadas ?? false)}
              podeAlterarObrigatoriedade={!bloqueioEdicao && (permissoes?.alterarObrigatoriedade ?? false)}
              podeEnviarComprovantes={!bloqueioEdicao && (permissoes?.enviarComprovantes ?? podeEditar)} podeVerHistorico={podeEditar}
              paiArquivado={bloqueioArquivo} paiConcluido={!bloqueioArquivo && item.statusExecucao === 'CONCLUIDO'} paiEmRevisao={paiEmRevisao} bloqueadoPorPai={bloqueioEdicao || verificado || item.statusExecucao === 'CONCLUIDO'}
              registrarVoltaEvidencia={registrarEvidencia} registrarVoltaEdicao={registrarEdicaoEvidencia}
              aoAtualizarEsperada={() => { void consulta.atualizar().catch(() => {}); void atualizar().catch(() => {}); }} />}
      </>}
    </div>
    {confirmarConclusao && <ConfirmacaoSimples titulo={`${tituloConclusaoEntregavel}?`}
      descricao="As evidências já estão verificadas. A conclusão será auditada e a etapa será concluída se todos os seus entregáveis estiverem prontos. O contrato exige confirmação própria."
      confirmar={tituloConclusaoEntregavel} confirmacaoRoxa cancelarVermelho ocupado={salvando}
      onCancelar={() => setConfirmarConclusao(false)} onConfirmar={() => void concluir()} />}
  </ModalEtapa>, document.body);
}
