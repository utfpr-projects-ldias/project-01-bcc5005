'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
import { concluirEntregavel, transicaoAdministrativaEntregavel, editarEntregavel, consultarHistoricoEntregavel, type Entregavel, type ResumoDocumentalEntregavel } from '@/lib/entregaveis';
import { FormularioEntregavel } from './formulario-entregavel';
import { ConteudoEntregavel } from './conteudo-entregavel';
import { ModalEtapa } from './modal-etapa';
import type { DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
import type { PermissoesContrato } from '@/lib/contratos';
import { toastSucesso } from '@/app/components/toast-notificacoes';
import { comprovacaoDocumentalCompleta } from '@/lib/situacao-documental-etapa';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { useAtividades } from '@/hooks/use-atividades';
import { useProgresso } from '@/hooks/use-progresso';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { IconeEngrenagem } from '@/app/components/icone-engrenagem';

/** Consulta o detalhe real no backend, sem confiar só na listagem em cache. */
export function ModalDetalheEntregavel({ contratoId, etapaId, entregavelId, podeEditar, focoRetorno, onFechar, atualizar, permissoes, dentroModal = false, iniciarEditando = false, paiArquivado = false, paiConcluido = false, paiEmRevisao = false, verificado = false, resumoInicial, podeArquivar = false, onArquivar, onReabrir, onReativar, onExcluir }: {
  contratoId: string; etapaId: string; entregavelId: string; itemInicial?: Entregavel; podeEditar: boolean;
  focoRetorno: HTMLElement | null; onFechar: () => void;
  atualizar: () => Promise<unknown>;
  permissoes?: PermissoesContrato; dentroModal?: boolean; iniciarEditando?: boolean; paiArquivado?: boolean; paiConcluido?: boolean; paiEmRevisao?: boolean; verificado?: boolean; resumoInicial?: ResumoDocumentalEntregavel;
  podeArquivar?: boolean; onArquivar?: () => void; onReabrir?: () => void; onReativar?: () => void; onExcluir?: () => void;
}) {
  const consulta = useDetalheEntregavel(contratoId, entregavelId);
  const execucao = useProgresso(contratoId);
  // Verificação documental isolada não basta: o backend também exige que as
  // atividades vinculadas estejam verificadas. Consultar sem paginação total.
  const pendenciasAtividades = useAtividades(contratoId, { entregavelId, status: 'REGISTRADA', page: 1, limit: 1 });
  const [editando, setEditando] = useState(Boolean(iniciarEditando && !paiArquivado && podeEditar && permissoes?.editarEntregaveis));
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
  const [confirmarEncerramento, setConfirmarEncerramento] = useState(false);
  const [motivoEncerramento, setMotivoEncerramento] = useState('');
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
  // O item da listagem é apenas um pré-carregamento VISUAL enquanto o GET
  // autoritativo está pendente. Ao receber resposta, nunca substituí-la pelo
  // cache da lista: isso exibiria dados incorretos em 403/404 ou troca de contrato.
  // Mesmo uma resposta de outro contrato/etapa deve falhar fechada.
  const item = erro ? undefined : consulta.dados !== undefined
    ? consultaValida
    : undefined; // Não renderizar um status anterior durante reativação/reabertura.
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
    if (bloqueioEdicao || verificado || ['CONCLUIDO','FINALIZADO'].includes(item?.statusExecucao ?? '')) return;
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
  const podeConcluir = Boolean(item?.statusExecucao === 'PENDENTE_CONCLUSAO' && consulta.dados && !bloqueioEdicao && !editando &&
    permissoes?.concluirEntregaveis && !pendenciasAtividades.loading && !pendenciasAtividades.atualizando && !pendenciasAtividades.erro &&
    pendenciasAtividades.total === 0 && comprovacaoDocumentalCompleta(resumoInicial) &&
    item.evidenciasEsperadas.filter(ev => !ev.arquivadoEm && ev.obrigatoria).every(ev => !ev.reabertoEm));
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
  async function transicionar(acao: 'solicitar-conclusao' | 'solicitar-encerramento' | 'aprovar-encerramento') {
    if (!item || salvando) return;
    setSalvando(true); setErroConclusao('');
    try {
      await transicaoAdministrativaEntregavel(contratoId, entregavelId, acao,
        acao === 'solicitar-encerramento' ? motivoEncerramento.trim() : undefined);
      setConfirmarEncerramento(false); setMotivoEncerramento('');
      toastSucesso(acao === 'aprovar-encerramento' ? 'Entregável finalizado sem alterar o avanço físico.' : 'Solicitação registrada. Aguarda aprovação.');
      await Promise.allSettled([consulta.atualizar(), atualizar()]);
    } catch (erro) {setErroConclusao(erro instanceof Error ? erro.message : 'Não foi possível alterar a situação do entregável.');}
    finally {setSalvando(false);}
  }
  const percentualFisico = execucao.progresso?.entregaveis.find(e => e.entregavelId === entregavelId)?.percentualExecucao;
  const execucaoIntegral = percentualFisico !== null && percentualFisico !== undefined && percentualFisico >= 99.999;
  // Solicitação e aprovação são ações distintas: a solicitação não depende
  // do status PENDENTE_CONCLUSAO, mas exige que os pré-requisitos estejam prontos.
  const podeSolicitarConclusao = Boolean(item && execucaoIntegral && !bloqueioEdicao &&
    !pendenciasAtividades.loading && !pendenciasAtividades.atualizando && !pendenciasAtividades.erro &&
    pendenciasAtividades.total === 0 && comprovacaoDocumentalCompleta(resumoInicial) &&
    item.evidenciasEsperadas.filter(ev => !ev.arquivadoEm && ev.obrigatoria).every(ev => !ev.reabertoEm));
  const podeEditarCadastro = Boolean(podeEditar && permissoes?.editarEntregaveis);
  const abertaParaDecisao = Boolean(item && !item.arquivadoEm && !bloqueioEdicao &&
    !['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(item.statusExecucao ?? ''));
  return createPortal(<ModalEtapa camada={dentroModal ? "aninhada" : "principal"} contexto={editando ? 'Editando entregável' : 'Entregável do contrato'} titulo={item?.nome ?? 'Detalhes do entregável'} codigoPublico={item?.codigoPublico}
    retornoEsquerda={true} formularioLongo={editando}
    etiqueta={item?.arquivadoEm ? 'Arquivado' : item?.reabertoEm ? 'Em revisão' : item?.statusExecucao === 'FINALIZADO' ? 'Encerrado' : item?.statusExecucao === 'PENDENTE_ENCERRAMENTO' ? 'Pendente de encerramento' : item?.statusExecucao === 'PENDENTE_CONCLUSAO' ? 'Pendente de conclusão' : ['CONCLUIDO','FINALIZADO'].includes(item?.statusExecucao ?? '') ? 'Concluído' : item?.statusExecucao === 'EM_ANDAMENTO' ? 'Em andamento' : item ? 'Planejamento' : undefined}
    arquivado={Boolean(item?.arquivadoEm)} revisao={Boolean(item?.reabertoEm && !item?.arquivadoEm)} concluido={!item?.arquivadoEm && !item?.reabertoEm && !editando && ['CONCLUIDO','FINALIZADO'].includes(item?.statusExecucao ?? '')} estadoContextual={item?.arquivadoEm ? 'arquivado' : item?.reabertoEm ? 'revisao' : item?.statusExecucao === 'FINALIZADO' ? 'finalizado' : ['CONCLUIDO','FINALIZADO'].includes(item?.statusExecucao ?? '') ? 'concluido' : 'normal'}

    ocultarFechar={false}
    rotuloFechar={nivel !== 'entregavel' || editando ? 'Voltar ao nível anterior' : 'Voltar à etapa'}
    textoFechar='← Etapa'
    bloqueadoPorSubmodal={nivel !== 'entregavel'}
    acoes={!editando && item ? <>
      {podeEditarCadastro && !bloqueioEdicao && !verificado && !['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') && <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-current transition hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current" onClick={() => setEditando(true)} aria-label="Editar entregável" title="Editar entregável"><IconeEngrenagem /></button>}
      <MenuAcoesObjeto rotulo={item.arquivadoEm || ['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') ? 'Reabrir' : 'Fechar'} disabled={salvando}>
            {abertaParaDecisao && permissoes?.editarEntregaveis && <>
              <button type="button" disabled={salvando || !podeSolicitarConclusao}
                title={!podeSolicitarConclusao ? 'A conclusão requer execução integral, atividades verificadas e documentação válida.' : undefined}
                className="rounded-lg border border-violet-500/50 bg-violet-700 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:border-slate-400/30 disabled:bg-slate-500/15 disabled:text-foreground/45"
                onClick={() => void transicionar('solicitar-conclusao')}>✓ Solicitar conclusão</button>
              <button type="button" disabled={salvando || podeSolicitarConclusao}
                title={podeSolicitarConclusao ? 'A conclusão está disponível; o encerramento administrativo está desabilitado.' : undefined}
                className="rounded-lg border border-purple-500/55 bg-purple-700 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:border-slate-400/30 disabled:bg-slate-500/15 disabled:text-foreground/45"
                onClick={() => setConfirmarEncerramento(true)}>⚑ Solicitar encerramento</button>
            </>}
            {item.statusExecucao === 'PENDENTE_ENCERRAMENTO' && permissoes?.concluirEntregaveis && <button type="button" disabled={salvando} className="rounded-lg bg-purple-700 px-3 py-2 text-white" onClick={() => void transicionar('aprovar-encerramento')}>✓ Aprovar encerramento</button>}
            {item.statusExecucao === 'PENDENTE_CONCLUSAO' && permissoes?.concluirEntregaveis && <button type="button" disabled={salvando || !podeConcluir} className="rounded-lg bg-violet-700 px-3 py-2 text-white disabled:opacity-40" onClick={() => setConfirmarConclusao(true)}>✓ Aprovar conclusão</button>}
            {item.statusExecucao === 'CONCLUIDO' && !item.reabertoEm && permissoes?.reabrirEntregaveis && !bloqueioEdicao && <button type="button" className="rounded-lg bg-emerald-600 px-3 py-2 text-white" onClick={onReabrir}>⟳ Reabrir</button>}
            {!item.arquivadoEm && podeArquivar && !['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') && <button type="button" className="rounded-lg border border-amber-500/45 bg-amber-500/15 px-3 py-2 text-amber-200" onClick={onArquivar}>▣ Arquivar</button>}
            {item.arquivadoEm && permissoes?.reativarEntregaveis && <button type="button" className="rounded-lg bg-emerald-600 px-3 py-2 text-white" onClick={onReativar}>⟳ Reativar</button>}
            {item.arquivadoEm && permissoes?.excluirEntregaveisArquivados && <button type="button" className="rounded-lg border border-red-500/45 bg-red-500/10 px-3 py-2 text-red-300" onClick={onExcluir}>▣ Excluir</button>}
          </MenuAcoesObjeto>
    </> : undefined}
    ocupado={salvando} focoRetorno={focoRetorno} onFechar={fecharNivel}>
    <div className="min-w-0 space-y-4" data-testid="modal-detalhe-entregavel">
      {consulta.carregando && !item && <p role="status">Carregando dados do entregável...</p>}
      {Boolean(erro) && <p role="alert" className="text-error-text">{erro instanceof Error ? erro.message : 'Não foi possível consultar o entregável.'}</p>}
      {!consulta.carregando && !erro && !item && <p role="alert">Entregável não encontrado ou sem acesso neste contrato.</p>}
      {erroConclusao && <p role="alert" className="text-error-text">{erroConclusao}</p>}
      {item && <>
        {editando && podeEditarCadastro && !bloqueioEdicao && !verificado && !['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') ? <FormularioEntregavel key={item.id} contratoId={contratoId} etapaId={etapaId} inicial={item}
          onSalvar={salvar} onCancelar={voltarDaEdicaoEntregavel}
          onSalvandoMudou={setSalvando}
          podeAlterarObrigatoriedade={permissoes?.alterarObrigatoriedade ?? false}
          podeConfigurarPesos={Boolean(permissoes?.configurarPesos)}
          podeReplanejarOcorrencias={Boolean(permissoes?.configurarAgendaOcorrencias)} />
          : <ConteudoEntregavel item={item} resumoInicial={resumoInicial} contextoModal podeEditarEsperada={!bloqueioEdicao && !verificado && !['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') && (permissoes?.editarEvidencias ?? podeEditar)}
              podeCriarEvidencia={!bloqueioEdicao && !verificado && !['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') && (permissoes?.criarEvidencias ?? podeEditar)}
              podeArquivarEvidencia={(permissoes?.arquivarEvidencias ?? podeEditar) && !bloqueioEdicao}
              podeReativarEvidencia={Boolean(permissoes?.reativarEvidencias) && !bloqueioEdicao}
              podeReabrirEvidencia={Boolean(permissoes?.reabrirEvidencias) && !bloqueioEdicao}
              podeExcluirEvidenciaArquivada={!bloqueioEdicao && (permissoes?.excluirEvidenciasArquivadas ?? false)}
              podeAlterarObrigatoriedade={!bloqueioEdicao && (permissoes?.alterarObrigatoriedade ?? false)}
              podeEnviarComprovantes={!bloqueioEdicao && !verificado && !['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') && (permissoes?.enviarComprovantes ?? podeEditar)} podeVerHistorico
              paiArquivado={bloqueioArquivo} paiConcluido={item.statusExecucao === 'CONCLUIDO' && !item.reabertoEm && !item.arquivadoEm} paiEmRevisao={paiEmRevisao} bloqueadoPorPai={bloqueioEdicao || verificado || item.statusExecucao === 'CONCLUIDO'}
              registrarVoltaEvidencia={registrarEvidencia} registrarVoltaEdicao={registrarEdicaoEvidencia}
              aoAtualizarEsperada={() => { void consulta.atualizar().catch(() => {}); void atualizar().catch(() => {}); }} />}
        {!editando && <footer className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-brand-green/20 pt-3" aria-label="Ações do entregável">
          <p className="min-w-0 flex-1 truncate text-xs text-foreground/65" title={item.observacoes ?? ''}>{item.observacoes || 'Sem observações adicionais'}</p>

        </footer>}
      </>}
    </div>
    {confirmarEncerramento && <ModalEtapa titulo="Solicitar encerramento do entregável" contexto="Execução física parcial" estadoContextual="finalizado" camada="edicao" ocupado={salvando} onFechar={() => setConfirmarEncerramento(false)}>
      <div className="space-y-4 text-sm"><p>Encerrar não significa concluir: a porcentagem executada será preservada. A solicitação exige ocorrências resolvidas e aprovação posterior.</p>
        <label className="block font-semibold">Justificativa (15 a 200 caracteres)<textarea className="mt-2 w-full rounded-lg border border-purple-500/40 bg-background p-3" rows={3} maxLength={200} value={motivoEncerramento} onChange={e => setMotivoEncerramento(e.target.value)}/></label>
        {erroConclusao && <p role="alert" className="text-error-text">{erroConclusao}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border px-3 py-2" onClick={() => setConfirmarEncerramento(false)}>Cancelar</button><button type="button" disabled={salvando || motivoEncerramento.trim().length < 15} className="rounded-lg bg-purple-700 px-3 py-2 font-semibold text-white disabled:opacity-40" onClick={() => void transicionar('solicitar-encerramento')}>Enviar solicitação</button></div>
      </div>
    </ModalEtapa>}
    {confirmarConclusao && <ConfirmacaoSimples titulo={`${tituloConclusaoEntregavel}?`}
      descricao="As evidências já estão verificadas. A conclusão será auditada e a etapa será concluída se todos os seus entregáveis estiverem prontos. O contrato exige confirmação própria."
      confirmar={tituloConclusaoEntregavel} confirmacaoRoxa cancelarVermelho ocupado={salvando}
      onCancelar={() => setConfirmarConclusao(false)} onConfirmar={() => void concluir()} />}
  </ModalEtapa>, document.body);
}
