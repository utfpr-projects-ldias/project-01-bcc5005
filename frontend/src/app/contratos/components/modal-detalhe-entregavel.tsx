'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
import { editarEntregavel, type Entregavel } from '@/lib/entregaveis';
import { FormularioEntregavel } from './formulario-entregavel';
import { ConteudoEntregavel } from './conteudo-entregavel';
import { ModalEtapa } from './modal-etapa';
import type { DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
import type { PermissoesContrato } from '@/lib/contratos';
import { toastSucesso } from '@/app/components/toast-notificacoes';

/** Consulta o detalhe real no backend, sem confiar só na listagem em cache. */
export function ModalDetalheEntregavel({ contratoId, etapaId, entregavelId, itemInicial, podeEditar, focoRetorno, onFechar, atualizar, permissoes, dentroModal = false, iniciarEditando = false, paiArquivado = false, verificado = false }: {
  contratoId: string; etapaId: string; entregavelId: string; itemInicial?: Entregavel; podeEditar: boolean;
  focoRetorno: HTMLElement | null; onFechar: () => void;
  atualizar: () => Promise<unknown>;
  permissoes?: PermissoesContrato; dentroModal?: boolean; iniciarEditando?: boolean; paiArquivado?: boolean; verificado?: boolean;
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
  const voltarEvidencia = useRef<(() => void) | null>(null);
  const voltarEdicaoEvidencia = useRef<(() => void) | null>(null);
  const [nivel, setNivel] = useState<'entregavel' | 'evidencia' | 'editar-evidencia'>('entregavel');
  function fecharNivel() {
    if (voltarEdicaoEvidencia.current) { voltarEdicaoEvidencia.current(); return; }
    if (voltarEvidencia.current) { voltarEvidencia.current(); return; }
    if (editando) { voltarDaEdicaoEntregavel(); return; }
    onFechar();
  }
  function registrarEvidencia(voltar: (() => void) | null) {
    voltarEvidencia.current = voltar;
    setNivel(voltar ? 'evidencia' : 'entregavel');
    if (!voltar) voltarEdicaoEvidencia.current = null;
  }
  function registrarEdicaoEvidencia(voltar: (() => void) | null) {
    voltarEdicaoEvidencia.current = voltar;
    setNivel(voltar ? 'editar-evidencia' : 'evidencia');
  }
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
  async function salvar(dados: DadosPlanejamentoEntregavel) {
    if (paiArquivado || verificado || item?.statusExecucao === 'CONCLUIDO') return;
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
  return createPortal(<ModalEtapa camada={dentroModal ? "aninhada" : "principal"} contexto="Entregável do contrato" titulo={item?.nome ?? 'Detalhes do entregável'} codigoPublico={item?.codigoPublico}
    retornoEsquerda={!editando} alturaEstavel formularioLongo={editando}
    concluido={!editando && verificado}

    ocultarFechar={editando}
    rotuloFechar={nivel !== 'entregavel' || editando ? 'Voltar ao nível anterior' : 'Voltar à etapa'}
    textoFechar='← Etapa'
    bloqueadoPorSubmodal={nivel !== 'entregavel'}
    acoes={undefined}
    ocupado={salvando} focoRetorno={focoRetorno} onFechar={fecharNivel}>
    <div className="min-w-0 space-y-4" data-testid="modal-detalhe-entregavel">
      {consulta.carregando && !item && <p role="status">Carregando dados do entregável...</p>}
      {Boolean(erro) && <p role="alert" className="text-error-text">{erro instanceof Error ? erro.message : 'Não foi possível consultar o entregável.'}</p>}
      {!consulta.carregando && !erro && !item && <p role="alert">Entregável não encontrado ou sem acesso neste contrato.</p>}
      {item && <>
        {!editando && (item.reabertoEm || verificado) && <div className="flex flex-wrap gap-2">
          {item.reabertoEm && <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">Reaberto</span>}
          {verificado && <span className="rounded-full border border-violet-400/50 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-100">Verificado</span>}
        </div>}
        {editando && !verificado && item.statusExecucao !== 'CONCLUIDO' ? <FormularioEntregavel key={item.id} contratoId={contratoId} etapaId={etapaId} inicial={item}
          onSalvar={salvar} onCancelar={voltarDaEdicaoEntregavel}
          onSalvandoMudou={setSalvando}
          podeAlterarObrigatoriedade={permissoes?.alterarObrigatoriedade ?? false} />
          : <ConteudoEntregavel item={item} podeEditarEsperada={!paiArquivado && (permissoes?.editarEvidencias ?? podeEditar) && !item.arquivadoEm}
              podeCriarEvidencia={!paiArquivado && (permissoes?.criarEvidencias ?? podeEditar) && !item.arquivadoEm}
              podeArquivarEvidencia={(permissoes?.arquivarEvidencias ?? podeEditar) && !item.arquivadoEm}
              podeReativarEvidencia={Boolean(permissoes?.reativarEvidencias)}
              podeReabrirEvidencia={Boolean(permissoes?.reabrirEvidencias)}
              podeExcluirEvidenciaArquivada={!paiArquivado && (permissoes?.excluirEvidenciasArquivadas ?? false)}
              podeAlterarObrigatoriedade={!paiArquivado && (permissoes?.alterarObrigatoriedade ?? false)}
              podeEnviarComprovantes={!paiArquivado && (permissoes?.enviarComprovantes ?? true)} podeVerHistorico={podeEditar}
              bloqueadoPorPai={paiArquivado || verificado || item.statusExecucao === 'CONCLUIDO'}
              registrarVoltaEvidencia={registrarEvidencia} registrarVoltaEdicao={registrarEdicaoEvidencia}
              aoAtualizarEsperada={() => { void consulta.atualizar().catch(() => {}); void atualizar().catch(() => {}); }} />}
      </>}
    </div>
  </ModalEtapa>, document.body);
}
