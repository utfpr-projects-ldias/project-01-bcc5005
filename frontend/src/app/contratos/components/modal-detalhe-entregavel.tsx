'use client';
import { solicitarNavegacaoInterna } from './navegacao-interna';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDetalheEntregavel, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import { concluirEntregavel, transicaoAdministrativaEntregavel, editarEntregavel, consultarHistoricoEntregavel, ErroEntregavel, ROTULOS_TIPO, type Entregavel, type ResumoDocumentalEntregavel } from '@/lib/entregaveis';
import { FormularioEntregavel } from './formulario-entregavel';
import { ConteudoEntregavel } from './conteudo-entregavel';
import { PainelMetasMarco } from './painel-metas-marco';
import { ModalEtapa } from './modal-etapa';
import { prepararEdicaoEntregavel, type DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { sincronizarContrato } from '@/lib/sincronizar-contrato';
import type { PermissoesContrato } from '@/lib/contratos';
import { toastSucesso } from '@/app/components/toast-notificacoes';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { useElegibilidadeEntregavel } from '@/hooks/use-elegibilidade-entregavel';
import { DialogoImpedimentos } from './explicacao-conclusao-entregavel';
import { useProgresso } from '@/hooks/use-progresso';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { BotaoEditarModal, BotaoAcaoModal } from '@/app/components/botoes-modal';
import { estadoDoObjeto, rotuloEstadoEntregavel } from '@/lib/identidade-operacional';

/** Consulta o detalhe real no backend, sem confiar só na listagem em cache. */
export function ModalDetalheEntregavel({ contratoId, etapaId, entregavelId, podeEditar, focoRetorno, onFechar, atualizar, permissoes, dentroModal = false, iniciarEditando = false, secaoInicial = 'informacoes', paiArquivado = false, paiConcluido = false, paiParcial = false, paiEmRevisao = false, verificado = false, resumoInicial: resumoRecebido, podeArquivar = false, onArquivar, onReabrir, onReativar, onExcluir, pesosContrato, modoCalculoContrato, retornoContextual = false, interno = false, origemRegistro }: {
  origemRegistro?: import('./execucoes-entregavel').OrigemExecucao; interno?: boolean; retornoContextual?: boolean; contratoId: string; etapaId: string; entregavelId: string; itemInicial?: Entregavel; podeEditar: boolean;
  modoCalculoContrato?: 'SIMPLES' | 'PONDERADO';
  pesosContrato?: Array<{ id: string; peso: string | null; arquivadoEm?: string | null; etapaArquivada?: boolean }>;
  focoRetorno: HTMLElement | null; onFechar: () => void;
  atualizar: () => Promise<unknown>;
  permissoes?: PermissoesContrato; dentroModal?: boolean; iniciarEditando?: boolean; secaoInicial?: 'informacoes' | 'planejamento'; paiArquivado?: boolean; paiConcluido?: boolean; paiParcial?: boolean; paiEmRevisao?: boolean; verificado?: boolean; resumoInicial?: ResumoDocumentalEntregavel;
  podeArquivar?: boolean; onArquivar?: () => void; onReabrir?: () => void; onReativar?: () => void; onExcluir?: () => void;
}) {
  const cache = useRepositorioConsultasOpcional();
  const consulta = useDetalheEntregavel(contratoId, entregavelId);
  const execucao = useProgresso(contratoId);
  const resumoConsulta = useResumoDocumentalContrato(contratoId, true);
  const resumoInicial = resumoConsulta.dados?.[entregavelId] ?? resumoRecebido;
  const elegibilidadeQuery = useElegibilidadeEntregavel(contratoId, entregavelId);
  const elegibilidade = elegibilidadeQuery.erro || elegibilidadeQuery.carregando || elegibilidadeQuery.atualizando ? undefined : elegibilidadeQuery.dados;
  const [dialogoSolicitacao, setDialogoSolicitacao] = useState<'parcial'|'impedimentos'|null>(null);
  const [abaMarco, setAbaMarco] = useState<'detalhes'|'metas'>('detalhes');
  const [editando, setEditando] = useState(Boolean(iniciarEditando && !paiArquivado && podeEditar && permissoes?.editarEntregaveis));
  const [secaoEdicao, setSecaoEdicao] = useState<'informacoes' | 'planejamento' | 'completo'>(iniciarEditando ? secaoInicial : 'completo');
  const marcadorEdicaoEntregavel = useRef<string | null>(null);
  const edicaoSuja = useRef(false);
  const [confirmarDescarteEdicao,setConfirmarDescarteEdicao]=useState(false);
  function cancelarEdicaoEntregavel() { if (edicaoSuja.current) setConfirmarDescarteEdicao(true); else voltarDaEdicaoEntregavel(); }
  function voltarDaEdicaoEntregavel() {
    // O lápis do CARD já abriu este modal editando. Cancelar precisa retornar
    // à etapa diretamente, não converter o formulário num segundo modal de detalhe.
    edicaoSuja.current = false;
    if (iniciarEditando && !interno) { onFechar(); return; }
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
  const [devolucaoPendente, setDevolucaoPendente] = useState(false);
  const [motivoDevolucao, setMotivoDevolucao] = useState('');
  const [erroConclusao, setErroConclusao] = useState('');
  const [ajusteEntregavel, setAjusteEntregavel] = useState<{ chave: string; alterou: boolean } | null>(null);
  const voltarEvidencia = useRef<(() => void) | null>(null);
  const voltarEdicaoEvidencia = useRef<(() => void) | null>(null);
  const [nivel, setNivel] = useState<'entregavel' | 'evidencia' | 'editar-evidencia'>('entregavel');
  function fecharNivel() {
    if (voltarEdicaoEvidencia.current) { voltarEdicaoEvidencia.current(); return; }
    if (voltarEvidencia.current) { voltarEvidencia.current(); return; }
    if (editando) { cancelarEdicaoEntregavel(); return; }
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
  // Desestruturar funções: somente as operações de atualização (e não todo o
  // estado mutável dos hooks) devem participar das dependências do listener.
  const atualizarExecucao = execucao.atualizar;
  const atualizarConsulta = consulta.atualizar;
  const atualizarPendencias = elegibilidadeQuery.atualizar;
  const atualizarResumo = resumoConsulta.atualizar;
  // O detalhe pode permanecer montado enquanto a ocorrência/atividade é aprovada
  // em um submodal. Reconsultar execução física e elegibilidade após o evento.
  useEffect(() => {
    const atualizarEstrutura = (evento: Event) => {
      const id = (evento as CustomEvent<{contratoId?:string}>).detail?.contratoId;
      if (id !== contratoId) return;
      void Promise.allSettled([atualizarExecucao(), atualizarConsulta(), atualizarPendencias(), atualizarResumo(), atualizar()]);
    };
    window.addEventListener('pi:estrutura-operacional-atualizada', atualizarEstrutura);
    return () => window.removeEventListener('pi:estrutura-operacional-atualizada', atualizarEstrutura);
  }, [contratoId, atualizarExecucao, atualizarConsulta, atualizarPendencias, atualizarResumo, atualizar]);
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
  const regularizacao = item?.statusExecucao === 'CONCLUIDO_PARCIALMENTE';
  const bloqueioDocumental = bloqueioArquivo || (paiConcluido && !(paiParcial && regularizacao));
  async function salvar(dados: DadosPlanejamentoEntregavel, base?: Entregavel) {
    if (!item || !base || bloqueioEdicao || bloqueioFinalizacao || verificado || !podeEditarCadastro)
      throw new ErroEntregavel(409, 'O entregável não permite edição no estado atual.');
    const alteracoes = prepararEdicaoEntregavel(base, dados, secaoEdicao);
    if (Object.keys(alteracoes).length) await editarEntregavel(contratoId, entregavelId, alteracoes);
    voltarDaEdicaoEntregavel();
    toastSucesso('Planejamento atualizado.');
    void atualizarDecisoes();
  }
  const podeConcluir = Boolean(elegibilidade?.podeAprovar && !bloqueioDocumental && !editando && permissoes?.concluirEntregaveis);
  async function atualizarDecisoes() {
    if (cache) sincronizarContrato(cache, contratoId);
    await Promise.allSettled([consulta.atualizar(),execucao.atualizar(),resumoConsulta.atualizar(),elegibilidadeQuery.atualizar(),atualizar()]);
  }
  async function concluir() {
    if (!podeConcluir || salvando) return;
    setSalvando(true); setErroConclusao('');
    try {
      await concluirEntregavel(contratoId, entregavelId);
      setConfirmarConclusao(false);
      toastSucesso('Decisão de conclusão registrada. A etapa requer aprovação própria.', regularizacao ? 'Regularização aprovada' : item?.statusExecucao === 'PENDENTE_CONCLUSAO_PARCIAL' ? 'Conclusão parcial aprovada' : 'Conclusão aprovada');
      await atualizarDecisoes();
    } catch (error) { setErroConclusao(error instanceof Error ? error.message : 'Falha ao concluir entregável.'); }
    finally { setSalvando(false); }
  }
  async function transicionar(acao: 'solicitar-conclusao' | 'solicitar-conclusao-parcial' | 'solicitar-encerramento' | 'aprovar-encerramento') {
    if (!item || salvando || (acao === 'solicitar-conclusao' && !elegibilidade?.podeSolicitarConclusao) ||
        (acao === 'solicitar-conclusao-parcial' && !elegibilidade?.podeSolicitarParcial) ||
        (acao === 'solicitar-encerramento' && !elegibilidade?.podeSolicitarEncerramento) ||
        (acao === 'aprovar-encerramento' && (!permissoes?.concluirEntregaveis || !elegibilidade?.podeAprovarEncerramento))) return;
    setSalvando(true); setErroConclusao('');
    try {
      await transicaoAdministrativaEntregavel(contratoId, entregavelId, acao,
        acao === 'solicitar-encerramento' ? motivoEncerramento.trim() : undefined);
      setConfirmarEncerramento(false); setDialogoSolicitacao(null); setMotivoEncerramento('');
      toastSucesso(acao === 'aprovar-encerramento' ? 'Entregável finalizado sem alterar o avanço físico.' : 'Solicitação registrada. Aguarda aprovação.', acao === 'aprovar-encerramento' ? 'Encerramento aprovado' : acao === 'solicitar-conclusao-parcial' ? 'Conclusão parcial solicitada' : acao === 'solicitar-encerramento' ? 'Encerramento solicitado' : regularizacao ? 'Regularização solicitada' : 'Conclusão solicitada');
      await atualizarDecisoes();
    } catch (erro) {setErroConclusao(erro instanceof Error ? erro.message : 'Não foi possível alterar a situação do entregável.');}
    finally {setSalvando(false);}
  }
  const percentualFisico = execucao.progresso?.entregaveis.find(e => e.entregavelId === entregavelId)?.percentualExecucao;
  const podeSolicitarConclusao = Boolean(elegibilidade?.podeSolicitarConclusao && !bloqueioDocumental);
  const podeSolicitarParcial = Boolean(elegibilidade?.podeSolicitarParcial && !bloqueioEdicao);
  const podeEditarCadastro = Boolean(podeEditar && permissoes?.editarEntregaveis);
  const apenasMetadados = Boolean(item && (bloqueioEdicao || verificado ||
    ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(item.statusExecucao ?? '')));
  const pendenteDecisao = Boolean(item && (item.regularizacaoDocumentalSolicitada || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(item.statusExecucao ?? '')));
  const bloqueioFinalizacao = Boolean(item && (item.regularizacaoDocumentalSolicitada || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(item.statusExecucao ?? '') || (!item.reabertoEm && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(item.statusExecucao ?? ''))));
  const abertaParaDecisao = Boolean(item && !item.arquivadoEm && !bloqueioEdicao &&
    !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(item.statusExecucao ?? ''));
  const formularioEdicao = item ? (editando && podeEditarCadastro && !bloqueioEdicao && !bloqueioFinalizacao && apenasMetadados ? <FormularioMetadadosEntregavel item={item} ocupado={salvando}
          onCancelar={cancelarEdicaoEntregavel} onSalvar={async alteracoes => {
            setSalvando(true);try {await editarEntregavel(contratoId, entregavelId, alteracoes);
              toastSucesso('Dados descritivos atualizados.');voltarDaEdicaoEntregavel();
              await atualizarDecisoes();
            } finally {setSalvando(false);}
          }}/>
          : editando && podeEditarCadastro && !bloqueioEdicao && !bloqueioFinalizacao && !verificado ? <FormularioEntregavel key={item.id} contratoId={contratoId} etapaId={etapaId} inicial={item}
          pesosContrato={pesosContrato ?? execucao.progresso?.entregaveis.map(e => ({ id: e.entregavelId, peso: e.pesoOperacional }))}
          modoCalculo={execucao.progresso?.modoCalculo ?? modoCalculoContrato ?? 'SIMPLES'}
          onSalvar={salvar} onCancelar={cancelarEdicaoEntregavel} secaoEdicao={secaoEdicao}
          onSalvandoMudou={setSalvando}
          podeAlterarObrigatoriedade={permissoes?.alterarObrigatoriedade ?? false}
          podeConfigurarPesos={Boolean(permissoes?.configurarPesos)}
          podeReplanejarOcorrencias={Boolean(permissoes?.configurarAgendaOcorrencias)} /> : null) : null;
  // Consultar antes de montar a janela: evita um diálogo provisório sem título/dados reais.
  if (!interno && !item && !erro && consulta.carregando) return null;
  const conteudo = <ModalEtapa interno={interno} larguraDetalhe={retornoContextual&&!editando&&!interno} larguraFormulario={editando ? "entregavel" : undefined} camada={dentroModal ? "aninhada" : "principal"} contexto={editando && !interno ? 'Editar entregável' : item ? ROTULOS_TIPO[item.tipo] : 'Entregável'} titulo={item?.nome ?? 'Detalhes do entregável'}
    retornoEsquerda={interno || !retornoContextual} formularioLongo={editando && !interno}
    etiquetaNoContexto
    atrasado={item?.atrasado} finalizadoComAtraso={item?.finalizadoComAtraso}
    etiqueta={item ? rotuloEstadoEntregavel(item.statusExecucao, Boolean(item.arquivadoEm), Boolean(item.reabertoEm), Boolean(item.regularizacaoDocumentalSolicitada)) : undefined}
    identidadeEntregavel
    arquivado={Boolean(item?.arquivadoEm)} revisao={Boolean(item?.reabertoEm && !item?.arquivadoEm && !pendenteDecisao)} concluido={!item?.arquivadoEm && !item?.reabertoEm && !editando && item?.statusExecucao === 'CONCLUIDO'} estadoContextual={estadoDoObjeto({objeto:'entregavel',status:item?.statusExecucao,arquivado:Boolean(item?.arquivadoEm),reaberto:Boolean(item?.reabertoEm),pendenteConclusao:Boolean(item?.regularizacaoDocumentalSolicitada)})}

    ocultarFechar={false}
    rotuloFechar={nivel !== 'entregavel' || editando ? 'Voltar ao nível anterior' : retornoContextual ? 'Fechar detalhes do entregável' : 'Voltar à etapa'}
    textoFechar={retornoContextual ? 'Fechar' : '← Etapa'}
    bloqueadoPorSubmodal={nivel !== 'entregavel'}
    acoes={(!editando || interno) && item ? <>
      {podeEditarCadastro && !bloqueioEdicao && !bloqueioFinalizacao && !verificado &&
        <BotaoEditarModal rotulo="Editar entregável" disabled={salvando}
          onClick={() => { const editar=()=>{setSecaoEdicao('completo');setEditando(true);}; if(!interno || solicitarNavegacaoInterna(editar)) editar(); }} />}
      {regularizacao && !pendenteDecisao && !bloqueioDocumental && permissoes?.editarEntregaveis && <BotaoAcaoModal intencao={podeSolicitarConclusao ? "solicitar-conclusao" : "neutra"} disabled={salvando} onClick={() => podeSolicitarConclusao ? void transicionar('solicitar-conclusao') : setDialogoSolicitacao('impedimentos')}>Solicitar regularização documental</BotaoAcaoModal>}
      {pendenteDecisao ? <div className="flex items-center gap-2" aria-label="Decisão pendente do entregável">
        <button type="button" disabled={salvando || !permissoes?.concluirEntregaveis} onClick={() => {setMotivoDevolucao('');setDevolucaoPendente(true);}}
          className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300 disabled:opacity-35">Cancelar</button>
        <button type="button" disabled={salvando || !permissoes?.concluirEntregaveis || (item.statusExecucao === 'PENDENTE_ENCERRAMENTO' ? !elegibilidade?.podeAprovarEncerramento : !podeConcluir)}
          onClick={() => (item.regularizacaoDocumentalSolicitada || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL'].includes(item.statusExecucao ?? '')) ? setConfirmarConclusao(true) : void transicionar('aprovar-encerramento')}
          className="rounded-lg border border-green-600/60 bg-green-600/20 px-3 py-2 text-xs font-semibold text-green-800 hover:bg-green-600/30 dark:text-green-200 disabled:opacity-35">Aprovar</button>
        {permissoes?.concluirEntregaveis && (item.statusExecucao === 'PENDENTE_ENCERRAMENTO' ? !elegibilidade?.podeAprovarEncerramento : !podeConcluir) && <button type="button" onClick={()=>setDialogoSolicitacao('impedimentos')} className="text-xs underline text-foreground/75">Ver impedimentos</button>}
      </div> : <MenuAcoesObjeto rotulo={item.arquivadoEm || ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(item.statusExecucao ?? '') ? 'Reabrir' : 'Fechar'} disabled={salvando}
        pendenteConclusao={['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL'].includes(item.statusExecucao ?? '')}
        acaoDireta={item.arquivadoEm && permissoes?.reativarEntregaveis ? onReativar
          : !item.arquivadoEm && !item.reabertoEm && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(item.statusExecucao ?? '') && permissoes?.reabrirEntregaveis && !bloqueioEdicao ? onReabrir : undefined}>
            {abertaParaDecisao && permissoes?.editarEntregaveis && <>
              <BotaoAcaoModal intencao={podeSolicitarConclusao ? 'solicitar-conclusao' : 'neutra'} disabled={salvando}
                className={!podeSolicitarConclusao ? 'opacity-65' : ''} title={!podeSolicitarConclusao ? 'Consultar impedimentos' : undefined}
                onClick={() => podeSolicitarConclusao ? void transicionar('solicitar-conclusao') : setDialogoSolicitacao('impedimentos')}>Solicitar conclusão</BotaoAcaoModal>
              {podeSolicitarParcial && <BotaoAcaoModal conclusaoParcial intencao="solicitar-conclusao" disabled={salvando}
                onClick={() => {setErroConclusao('');setDialogoSolicitacao('parcial');}}>Solicitar conclusão parcial</BotaoAcaoModal>}
              {elegibilidade?.podeSolicitarEncerramento && <BotaoAcaoModal intencao="solicitar-encerramento" disabled={salvando}
                onClick={() => setConfirmarEncerramento(true)}>Solicitar encerramento</BotaoAcaoModal>}
            </>}
            {item.statusExecucao === 'PENDENTE_ENCERRAMENTO' && permissoes?.concluirEntregaveis && <BotaoAcaoModal intencao="encerrar" disabled={salvando} onClick={() => void transicionar('aprovar-encerramento')}>✓ Aprovar encerramento</BotaoAcaoModal>}
            {['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL'].includes(item.statusExecucao ?? '') && permissoes?.concluirEntregaveis && <BotaoAcaoModal intencao="concluir" disabled={salvando || !podeConcluir} onClick={() => setConfirmarConclusao(true)}>Aprovar conclusão</BotaoAcaoModal>}
            {item.statusExecucao === 'CONCLUIDO' && !item.reabertoEm && permissoes?.reabrirEntregaveis && !bloqueioEdicao && <BotaoAcaoModal intencao="reabrir" onClick={onReabrir}>Reabrir</BotaoAcaoModal>}
            {!item.arquivadoEm && podeArquivar && !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(item.statusExecucao ?? '') && <BotaoAcaoModal intencao="arquivar" onClick={onArquivar}>Arquivar</BotaoAcaoModal>}
            {item.arquivadoEm && permissoes?.reativarEntregaveis && <BotaoAcaoModal intencao="reativar" onClick={onReativar}>⟳ Reativar</BotaoAcaoModal>}
          </MenuAcoesObjeto>}
          {item.arquivadoEm && permissoes?.excluirEntregaveisArquivados && <button type="button" onClick={onExcluir} disabled={salvando} title="Excluir entregável arquivado" aria-label="Excluir entregável arquivado" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 transition hover:bg-red-500/20 disabled:opacity-40">×</button>}
    </> : undefined}
    ocupado={salvando} focoRetorno={focoRetorno} onFechar={fecharNivel}>
    <div className="min-w-0 space-y-4" data-testid="modal-detalhe-entregavel">
      {consulta.carregando && !item && <p role="status">Carregando dados do entregável...</p>}
      {Boolean(erro) && <p role="alert" className="text-error-text">{erro instanceof Error ? erro.message : 'Não foi possível consultar o entregável.'}</p>}
      {!consulta.carregando && !erro && !item && <p role="alert">Entregável não encontrado ou sem acesso neste contrato.</p>}
      {erroConclusao && <p role="alert" className="text-error-text">{erroConclusao}</p>}
      {item && <>
        {item.tipo === 'MARCO' && (!editando || interno) && <div role="tablist" aria-label="Seções do Marco" className="flex gap-1 rounded-lg border border-violet-500/20 p-1">{([['detalhes','Detalhes'],['metas','Metas']] as const).map(([aba,rotulo])=><button key={aba} type="button" role="tab" aria-selected={abaMarco===aba} onClick={()=>setAbaMarco(aba)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${abaMarco===aba?'bg-violet-500/20 text-violet-300':'hover:bg-current/10'}`}>{rotulo}</button>)}</div>}
        {!interno && formularioEdicao ? <div onChangeCapture={()=>{edicaoSuja.current=true;}}>{formularioEdicao}</div>
          : item.tipo === 'MARCO' && abaMarco === 'metas' ? <PainelMetasMarco contratoId={contratoId} entregavelId={item.id} permissoes={permissoes} readOnly={bloqueioEdicao || Boolean(item.arquivadoEm) || bloqueioFinalizacao} onAtualizar={()=>{void atualizarDecisoes();}} />
          : <ConteudoEntregavel origemRegistro={origemRegistro} interno={interno||retornoContextual} participacao={execucao.progresso?.entregaveis.find(e=>e.entregavelId===item.id)?.participacaoOperacional} item={item} resumoInicial={resumoInicial} contextoModal permissoesExecucao={permissoes} somenteLeituraExecucao={bloqueioEdicao || bloqueioFinalizacao || pendenteDecisao || verificado} regularizacaoDocumental={regularizacao && !bloqueioDocumental} podeEditarEsperada={!bloqueioEdicao && !verificado && !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(item.statusExecucao ?? '') && (permissoes?.editarEvidencias ?? podeEditar)}
              podeCriarEvidencia={!bloqueioEdicao && !verificado && !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(item.statusExecucao ?? '') && (permissoes?.criarEvidencias ?? podeEditar)}
              podeArquivarEvidencia={(permissoes?.arquivarEvidencias ?? podeEditar) && !bloqueioEdicao}
              podeReativarEvidencia={Boolean(permissoes?.reativarEvidencias) && !bloqueioEdicao}
              podeReabrirEvidencia={Boolean(permissoes?.reabrirEvidencias) && !bloqueioDocumental && !item.regularizacaoDocumentalSolicitada}
              podeExcluirEvidenciaArquivada={!bloqueioEdicao && (permissoes?.excluirEvidenciasArquivadas ?? false)}
              podeAlterarObrigatoriedade={!bloqueioEdicao && (permissoes?.alterarObrigatoriedade ?? false)}
              podeEnviarComprovantes={!bloqueioDocumental && !item.regularizacaoDocumentalSolicitada && !verificado && !['CONCLUIDO','FINALIZADO'].includes(item.statusExecucao ?? '') && (permissoes?.enviarComprovantes ?? podeEditar)} podeVerHistorico
              paiArquivado={bloqueioArquivo} paiConcluido={item.statusExecucao === 'CONCLUIDO' && !item.reabertoEm && !item.arquivadoEm} paiEmRevisao={paiEmRevisao} bloqueadoPorPai={bloqueioEdicao || verificado || item.statusExecucao === 'CONCLUIDO'}
              registrarVoltaEvidencia={registrarEvidencia} registrarVoltaEdicao={registrarEdicaoEvidencia}
              aoAtualizarEsperada={() => { void atualizarDecisoes(); }} />}
        {!editando && item.observacoes && <footer className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-brand-green/20 pt-3" aria-label="Ações do entregável">
          {item.observacoes && <p className="min-w-0 flex-1 break-words text-xs text-foreground/65">{item.observacoes}</p>}

        </footer>}
      </>}
    </div>
    {confirmarDescarteEdicao && <ConfirmacaoSimples titulo="Descartar alterações?" descricao="As alterações do formulário de edição ainda não foram salvas." confirmar="Descartar alterações" perigoso descarte onCancelar={()=>setConfirmarDescarteEdicao(false)} onConfirmar={()=>{setConfirmarDescarteEdicao(false);voltarDaEdicaoEntregavel();}}/>}
    {dialogoSolicitacao === 'impedimentos' && <DialogoImpedimentos dados={elegibilidade} percentual={percentualFisico} carregando={elegibilidadeQuery.carregando || elegibilidadeQuery.atualizando} onFechar={()=>setDialogoSolicitacao(null)}/>}
    {dialogoSolicitacao === 'parcial' && <ConfirmacaoSimples titulo="Solicitar conclusão parcial?"
      descricao={podeSolicitarParcial || salvando ? "A execução física está completa, mas ainda existem comprovantes pendentes. A solicitação será encaminhada para aprovação, preservando as pendências documentais." : "A elegibilidade mudou. Consulte novamente a situação do entregável."}
      pendencias={[...(elegibilidade?.pendencias ?? []),...(elegibilidade?.impedimentos ?? []),...(erroConclusao ? [erroConclusao] : [])]}
      confirmar="Confirmar solicitação de conclusão parcial" compactoConclusao confirmacaoRoxa cancelarVermelho ocupado={salvando}
      somenteConsulta={!podeSolicitarParcial && !salvando} onCancelar={()=>setDialogoSolicitacao(null)} onConfirmar={()=>void transicionar('solicitar-conclusao-parcial')}/>}
    {devolucaoPendente && <ConfirmacaoSimples titulo="Cancelar solicitação do entregável?" descricao="A solicitação será devolvida para revisão, sem perder a execução física registrada. Informe uma justificativa de 15 a 200 caracteres."
      confirmar="Devolver para revisão" estadoContextual="revisao" cancelarVermelho ocupado={salvando} justificativa={motivoDevolucao} justificativaMinima={15}
      onJustificativaChange={setMotivoDevolucao} onCancelar={() => setDevolucaoPendente(false)}
      onConfirmar={async () => {setSalvando(true);setErroConclusao('');try {await transicaoAdministrativaEntregavel(contratoId,entregavelId,'devolver-solicitacao',motivoDevolucao.trim());setDevolucaoPendente(false);setMotivoDevolucao('');toastSucesso('Solicitação devolvida para revisão.');await atualizarDecisoes();}catch(erro){setErroConclusao(erro instanceof Error?erro.message:'Não foi possível devolver a solicitação.');}finally{setSalvando(false);}}}/>}
    {confirmarEncerramento && <ModalEtapa titulo="Solicitar encerramento do entregável" contexto="Execução física parcial" estadoContextual="finalizado" camada="edicao" ocupado={salvando} onFechar={() => setConfirmarEncerramento(false)}>
      <div className="space-y-4 text-sm"><p>Encerrar não significa concluir: a porcentagem executada será preservada. A solicitação pode ser feita com ocorrências pendentes; exige justificativa e aprovação posterior. Não representa execução integral.</p>
        <label className="block font-semibold">Justificativa (15 a 200 caracteres)<textarea className="mt-2 w-full rounded-lg border border-purple-500/40 bg-background p-3" rows={3} maxLength={200} value={motivoEncerramento} onChange={e => setMotivoEncerramento(e.target.value)}/></label>
        {erroConclusao && <p role="alert" className="text-error-text">{erroConclusao}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border px-3 py-2" onClick={() => setConfirmarEncerramento(false)}>Cancelar</button><button type="button" disabled={salvando || motivoEncerramento.trim().length < 15} className="rounded-lg bg-purple-700 px-3 py-2 font-semibold text-white disabled:opacity-40" onClick={() => void transicionar('solicitar-encerramento')}>Enviar solicitação</button></div>
      </div>
    </ModalEtapa>}
    {confirmarConclusao && <ConfirmacaoSimples titulo={`${tituloConclusaoEntregavel}?`}
      descricao="A decisão será auditada, preservando o avanço físico e a situação documental. Etapa e contrato exigem decisões próprias."
      confirmar={tituloConclusaoEntregavel} confirmacaoRoxa cancelarVermelho ocupado={salvando}
      onCancelar={() => setConfirmarConclusao(false)} onConfirmar={() => void concluir()} />}
  </ModalEtapa>;
  return interno ? <>
    <div data-pi-pagina-entregavel inert={Boolean(formularioEdicao) || undefined}>{conteudo}</div>
    {formularioEdicao && createPortal(<ModalEtapa titulo={`Editar entregável · ${item?.nome ?? ''}`} contexto="Dados do entregável" camada="edicao" larguraFormulario="entregavel" formularioLongo ocupado={salvando} onFechar={cancelarEdicaoEntregavel}><div onChangeCapture={()=>{edicaoSuja.current=true;}}>{formularioEdicao}</div></ModalEtapa>, document.body)}
  </> : createPortal(conteudo, document.body);
}

/** Edição cadastral não altera situação, metas, pesos, datas ou evidências de um entregável finalizado. */
function FormularioMetadadosEntregavel({item,ocupado,onSalvar,onCancelar}:{item:Entregavel;ocupado:boolean;
  onSalvar:(campos:Partial<Pick<Entregavel,'nome'|'codigo'|'descricao'|'observacoes'|'criterioConclusao'|'versaoPlanejamento'>>)=>Promise<void>;onCancelar:()=>void}){
  const [base]=useState(()=>item);
  const [nome,setNome]=useState(base.nome);
  const [codigo,setCodigo]=useState(item.codigo??'');
  const [descricao,setDescricao]=useState(item.descricao??'');
  const [observacoes,setObservacoes]=useState(item.observacoes??'');
  const [erro,setErro]=useState('');
  const entradas=[
    {id:'nome',rotulo:'Nome',valor:nome,alterar:setNome,original:base.nome,limite:42,obrigatorio:true},
    {id:'codigo',rotulo:'Código',valor:codigo,alterar:setCodigo,original:base.codigo??'',limite:50},
    {id:'descricao',rotulo:'Descrição',valor:descricao,alterar:setDescricao,original:base.descricao??'',limite:3000,textarea:true},
    {id:'observacoes',rotulo:'Observações',valor:observacoes,alterar:setObservacoes,original:base.observacoes??'',limite:3000,textarea:true},
  ];
  async function enviar(evento:FormEvent){
    evento.preventDefault();if(ocupado)return;
    const alteracoes:Partial<Pick<Entregavel,'nome'|'codigo'|'descricao'|'observacoes'|'criterioConclusao'|'versaoPlanejamento'>>={};
    for(const entrada of entradas){
      if(entrada.valor===entrada.original)continue;
      const texto=entrada.valor.trim();
      if((entrada.obrigatorio&&!texto)||[...entrada.valor].length>entrada.limite){setErro(`Revise ${entrada.rotulo.toLowerCase()} (até ${entrada.limite} caracteres).`);return;}
      (alteracoes as Record<string,string|null>)[entrada.id]=entrada.obrigatorio?texto:(texto||null);
    }
    if(!Object.keys(alteracoes).length){onCancelar();return;}
    if(base.versaoPlanejamento) alteracoes.versaoPlanejamento=base.versaoPlanejamento;
    setErro('');try{await onSalvar(alteracoes);}catch(e){setErro(e instanceof Error?e.message:'Falha ao salvar os metadados.');}
  }
  return <form data-pi-edicao-metadados className="pi-edicao-metadados space-y-3" onSubmit={e=>void enviar(e)}>
    <p className="text-sm text-foreground/70">Somente dados descritivos: o avanço físico, o estado e o histórico permanecem intactos.</p>
    {entradas.map(entrada=><label key={entrada.id} className="block text-sm font-semibold">{entrada.rotulo}
      {entrada.textarea?<textarea rows={2} maxLength={Math.max(entrada.limite*2,entrada.original.length)} value={entrada.valor} onChange={e=>entrada.alterar(e.target.value)}
        className="mt-1 w-full min-w-0 rounded-lg border border-current/25 bg-background p-2 text-sm"/>:
        <input maxLength={Math.max(entrada.limite*2,entrada.original.length)} value={entrada.valor} onChange={e=>entrada.alterar(e.target.value)}
          className="mt-1 w-full min-w-0 rounded-lg border border-current/25 bg-background p-2 text-sm"/>}
      <span className="block text-right text-xs font-normal text-foreground/60">{[...entrada.valor].length}/{entrada.limite}</span>
    </label>)}
    {erro&&<p role="alert" className="text-sm text-error-text">{erro}</p>}
    <div className="flex justify-end gap-2"><button type="button" disabled={ocupado} onClick={onCancelar} className="rounded-lg border border-current/30 px-3 py-2 text-sm">Cancelar</button>
    <button type="submit" disabled={ocupado} className="rounded-lg bg-brand-green px-3 py-2 text-sm font-semibold text-on-brand-green">{ocupado?'Salvando…':'Salvar alterações'}</button></div>
  </form>;
}
