'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
import { BotaoEditarModal, BotaoAcaoModal } from '@/app/components/botoes-modal';
import { estadoDoObjeto } from '@/lib/identidade-operacional';

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
  // O detalhe pode permanecer montado enquanto a ocorrência/atividade é aprovada
  // em um submodal. Reconsultar execução física e elegibilidade após o evento.
  useEffect(() => {
    const atualizarEstrutura = (evento: Event) => {
      const id = (evento as CustomEvent<{contratoId?:string}>).detail?.contratoId;
      if (id !== contratoId) return;
      void Promise.allSettled([execucao.atualizar(), consulta.atualizar(), pendenciasAtividades.atualizar(), atualizar()]);
    };
    window.addEventListener('pi:estrutura-operacional-atualizada', atualizarEstrutura);
    return () => window.removeEventListener('pi:estrutura-operacional-atualizada', atualizarEstrutura);
  }, [contratoId, execucao.atualizar, consulta.atualizar, pendenciasAtividades.atualizar, atualizar]);
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
    // Enviar apenas campos alterados. Campos legados podem exceder os limites
    // novos, e não devem ser reenviados, truncados ou invalidados sem edição.
    const campos = ['etapaId','nome','tipo','codigo','descricao','responsavelId',
      'inicioPrevisto','terminoPrevisto','quantidadePrevista','unidadeMedida',
      'periodicidade','configuracaoPeriodicidade','peso','criterioConclusao','observacoes'] as const;
    const alteracoes: Partial<DadosPlanejamentoEntregavel> = {};
    for (const campo of campos) {
      const novo = planejamento[campo];
      const atual = item?.[campo];
      const igual = campo === 'configuracaoPeriodicidade' ? JSON.stringify(novo ?? null) === JSON.stringify(atual ?? null)
        : (campo === 'peso' || campo === 'quantidadePrevista') && novo != null && atual != null
          ? Number(novo) === Number(atual)
          : (novo ?? null) === (atual ?? null);
      if (!igual) (alteracoes as Record<string, unknown>)[campo] = novo;
    }
    if (Object.keys(alteracoes).length) await editarEntregavel(contratoId, entregavelId, alteracoes);
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
  const apenasMetadados = Boolean(item && (bloqueioEdicao || verificado ||
    ['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(item.statusExecucao ?? '')));
  const abertaParaDecisao = Boolean(item && !item.arquivadoEm && !bloqueioEdicao &&
    !['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(item.statusExecucao ?? ''));
  return createPortal(<ModalEtapa camada={dentroModal ? "aninhada" : "principal"} contexto={editando ? 'Editando entregável' : 'Entregável do contrato'} titulo={item?.nome ?? 'Detalhes do entregável'} codigoPublico={item?.codigoPublico}
    retornoEsquerda={true} formularioLongo={editando}
    etiqueta={item?.arquivadoEm ? 'Arquivado' : item?.reabertoEm ? 'Em revisão' : item?.statusExecucao === 'FINALIZADO' ? 'Encerrado' : item?.statusExecucao === 'PENDENTE_ENCERRAMENTO' ? 'Pendente de encerramento' : item?.statusExecucao === 'PENDENTE_CONCLUSAO' ? 'Pendente de conclusão' : ['CONCLUIDO','FINALIZADO'].includes(item?.statusExecucao ?? '') ? 'Concluído' : item?.statusExecucao === 'EM_ANDAMENTO' ? 'Em andamento' : item ? 'Planejamento' : undefined}
    arquivado={Boolean(item?.arquivadoEm)} revisao={Boolean(item?.reabertoEm && !item?.arquivadoEm)} concluido={!item?.arquivadoEm && !item?.reabertoEm && !editando && item?.statusExecucao === 'CONCLUIDO'} estadoContextual={estadoDoObjeto({objeto:'entregavel',status:item?.statusExecucao,arquivado:Boolean(item?.arquivadoEm),reaberto:Boolean(item?.reabertoEm)})}

    ocultarFechar={false}
    rotuloFechar={nivel !== 'entregavel' || editando ? 'Voltar ao nível anterior' : 'Voltar à etapa'}
    textoFechar='← Etapa'
    bloqueadoPorSubmodal={nivel !== 'entregavel'}
    acoes={!editando && item ? <>
      {podeEditarCadastro && !bloqueioArquivo && <BotaoEditarModal rotulo="Editar entregável" onClick={() => setEditando(true)} />}
      <MenuAcoesObjeto rotulo={item.arquivadoEm || ['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') ? 'Reabrir' : 'Fechar'} disabled={salvando}
        pendenteConclusao={item.statusExecucao === 'PENDENTE_CONCLUSAO' || podeSolicitarConclusao}
        acaoDireta={item.arquivadoEm && permissoes?.reativarEntregaveis ? onReativar
          : !item.arquivadoEm && !item.reabertoEm && ['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') && permissoes?.reabrirEntregaveis && !bloqueioEdicao ? onReabrir : undefined}>
            {abertaParaDecisao && permissoes?.editarEntregaveis && <>
              <BotaoAcaoModal intencao="solicitar-conclusao" disabled={salvando || !podeSolicitarConclusao}
                title={!podeSolicitarConclusao ? 'A conclusão requer execução integral, atividades verificadas e documentação válida.' : undefined}
                onClick={() => void transicionar('solicitar-conclusao')}>Solicitar conclusão</BotaoAcaoModal>
              <BotaoAcaoModal intencao="solicitar-encerramento" disabled={salvando}
                title="Encerramento administrativo com justificativa, preservando a execução real."
                onClick={() => setConfirmarEncerramento(true)}>⚑ Solicitar encerramento</BotaoAcaoModal>
            </>}
            {item.statusExecucao === 'PENDENTE_ENCERRAMENTO' && permissoes?.concluirEntregaveis && <BotaoAcaoModal intencao="encerrar" disabled={salvando} onClick={() => void transicionar('aprovar-encerramento')}>✓ Aprovar encerramento</BotaoAcaoModal>}
            {item.statusExecucao === 'PENDENTE_CONCLUSAO' && permissoes?.concluirEntregaveis && <BotaoAcaoModal intencao="concluir" disabled={salvando || !podeConcluir} onClick={() => setConfirmarConclusao(true)}>Aprovar conclusão</BotaoAcaoModal>}
            {item.statusExecucao === 'CONCLUIDO' && !item.reabertoEm && permissoes?.reabrirEntregaveis && !bloqueioEdicao && <BotaoAcaoModal intencao="reabrir" onClick={onReabrir}>Reabrir</BotaoAcaoModal>}
            {!item.arquivadoEm && podeArquivar && !['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') && <BotaoAcaoModal intencao="arquivar" onClick={onArquivar}>Arquivar</BotaoAcaoModal>}
            {item.arquivadoEm && permissoes?.reativarEntregaveis && <BotaoAcaoModal intencao="reativar" onClick={onReativar}>⟳ Reativar</BotaoAcaoModal>}
          </MenuAcoesObjeto>
          {item.arquivadoEm && permissoes?.excluirEntregaveisArquivados && <button type="button" onClick={onExcluir} disabled={salvando} title="Excluir entregável arquivado" aria-label="Excluir entregável arquivado" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 transition hover:bg-red-500/20 disabled:opacity-40">×</button>}
    </> : undefined}
    ocupado={salvando} focoRetorno={focoRetorno} onFechar={fecharNivel}>
    <div className="min-w-0 space-y-4" data-testid="modal-detalhe-entregavel">
      {consulta.carregando && !item && <p role="status">Carregando dados do entregável...</p>}
      {Boolean(erro) && <p role="alert" className="text-error-text">{erro instanceof Error ? erro.message : 'Não foi possível consultar o entregável.'}</p>}
      {!consulta.carregando && !erro && !item && <p role="alert">Entregável não encontrado ou sem acesso neste contrato.</p>}
      {erroConclusao && <p role="alert" className="text-error-text">{erroConclusao}</p>}
      {item && <>
        {editando && podeEditarCadastro && !bloqueioArquivo && apenasMetadados ? <FormularioMetadadosEntregavel item={item} ocupado={salvando}
          onCancelar={voltarDaEdicaoEntregavel} onSalvar={async alteracoes => {
            setSalvando(true);try {await editarEntregavel(contratoId, entregavelId, alteracoes);
              toastSucesso('Dados descritivos atualizados.');voltarDaEdicaoEntregavel();
              await Promise.allSettled([consulta.atualizar(),atualizar()]);
            } finally {setSalvando(false);}
          }}/>
          : editando && podeEditarCadastro && !bloqueioEdicao && !verificado && !['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') ? <FormularioEntregavel key={item.id} contratoId={contratoId} etapaId={etapaId} inicial={item}
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
      <div className="space-y-4 text-sm"><p>Encerrar não significa concluir: a porcentagem executada será preservada. A solicitação pode ser feita com ocorrências pendentes; exige justificativa e aprovação posterior. Não representa execução integral.</p>
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

/** Edição cadastral não altera situação, metas, pesos, datas ou evidências de um entregável finalizado. */
function FormularioMetadadosEntregavel({item,ocupado,onSalvar,onCancelar}:{item:Entregavel;ocupado:boolean;
  onSalvar:(campos:Partial<Pick<Entregavel,'nome'|'codigo'|'descricao'|'observacoes'|'criterioConclusao'>>)=>Promise<void>;onCancelar:()=>void}){
  const [nome,setNome]=useState(item.nome);
  const [codigo,setCodigo]=useState(item.codigo??'');
  const [descricao,setDescricao]=useState(item.descricao??'');
  const [observacoes,setObservacoes]=useState(item.observacoes??'');
  const [criterio,setCriterio]=useState(item.criterioConclusao??'');
  const [erro,setErro]=useState('');
  const entradas=[
    {id:'nome',rotulo:'Nome',valor:nome,alterar:setNome,original:item.nome,limite:42,obrigatorio:true},
    {id:'codigo',rotulo:'Código',valor:codigo,alterar:setCodigo,original:item.codigo??'',limite:15},
    {id:'descricao',rotulo:'Descrição',valor:descricao,alterar:setDescricao,original:item.descricao??'',limite:220,textarea:true},
    {id:'criterioConclusao',rotulo:'Critério de conclusão',valor:criterio,alterar:setCriterio,original:item.criterioConclusao??'',limite:350,textarea:true},
    {id:'observacoes',rotulo:'Observações',valor:observacoes,alterar:setObservacoes,original:item.observacoes??'',limite:120,textarea:true},
  ];
  async function enviar(evento:FormEvent){
    evento.preventDefault();if(ocupado)return;
    const alteracoes:Partial<Pick<Entregavel,'nome'|'codigo'|'descricao'|'observacoes'|'criterioConclusao'>>={};
    for(const entrada of entradas){
      if(entrada.valor===entrada.original)continue;
      const texto=entrada.valor.trim();
      if((entrada.obrigatorio&&!texto)||entrada.valor.length>entrada.limite){setErro(`Revise ${entrada.rotulo.toLowerCase()} (até ${entrada.limite} caracteres).`);return;}
      (alteracoes as Record<string,string|null>)[entrada.id]=entrada.obrigatorio?texto:(texto||null);
    }
    if(!Object.keys(alteracoes).length){onCancelar();return;}
    setErro('');try{await onSalvar(alteracoes);}catch(e){setErro(e instanceof Error?e.message:'Falha ao salvar os metadados.');}
  }
  return <form data-pi-edicao-metadados className="space-y-3" onSubmit={e=>void enviar(e)}>
    <p className="text-sm text-foreground/70">Somente dados descritivos: o avanço físico, o estado e o histórico permanecem intactos.</p>
    {entradas.map(entrada=><label key={entrada.id} className="block text-sm font-semibold">{entrada.rotulo}
      {entrada.textarea?<textarea rows={2} maxLength={Math.max(entrada.limite,entrada.original.length)} value={entrada.valor} onChange={e=>entrada.alterar(e.target.value)}
        className="mt-1 w-full min-w-0 rounded-lg border border-current/25 bg-background p-2 text-sm"/>:
        <input maxLength={Math.max(entrada.limite,entrada.original.length)} value={entrada.valor} onChange={e=>entrada.alterar(e.target.value)}
          className="mt-1 w-full min-w-0 rounded-lg border border-current/25 bg-background p-2 text-sm"/>}
      <span className="block text-right text-xs font-normal text-foreground/60">{entrada.valor.length}/{entrada.limite}</span>
    </label>)}
    {erro&&<p role="alert" className="text-sm text-error-text">{erro}</p>}
    <div className="flex justify-end gap-2"><button type="button" disabled={ocupado} onClick={onCancelar} className="rounded-lg border border-current/30 px-3 py-2 text-sm">Cancelar</button>
    <button type="submit" disabled={ocupado} className="rounded-lg bg-brand-green px-3 py-2 text-sm font-semibold text-on-brand-green">{ocupado?'Salvando…':'Salvar alterações'}</button></div>
  </form>;
}
