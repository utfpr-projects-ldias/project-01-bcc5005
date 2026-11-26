'use client';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';
import { rotuloEstadoEntregavel } from '@/lib/identidade-operacional';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { LinkVoltar } from '@/app/components/link-voltar';
import { AreaContratos, Aviso } from '@/app/contratos/components/area-contratos';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useAcessoContrato, useContrato } from '@/hooks/use-contratos';
import { FormularioEntregavel } from '@/app/contratos/components/formulario-entregavel';
import { editarEntregavel, ErroEntregavel, type Entregavel } from '@/lib/entregaveis';
import { prepararEdicaoEntregavel, type DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
import { useEtapas } from '@/hooks/use-etapas';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { sincronizarContrato } from '@/lib/sincronizar-contrato';
import { useDetalheEntregavel, useEntregaveis } from '@/hooks/use-entregaveis';
import { useProgresso } from '@/hooks/use-progresso';
import { ConteudoEntregavel } from '@/app/contratos/components/conteudo-entregavel';
import { toastSucesso } from '@/app/components/toast-notificacoes';


export default function DetalheEntregavelPage() {
  const { id: contratoId, entregavelId } = useParams<{ id: string; entregavelId: string }>();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const perfil = useMeuPerfil();
  const habilitado = Boolean(perfil.dados?.ativo && !perfil.erro);
  const consulta = useDetalheEntregavel(contratoId, entregavelId, habilitado);
  const pesos = useEntregaveis(contratoId, habilitado);
  const execucao = useProgresso(contratoId);
  const acesso = useAcessoContrato(contratoId, habilitado);
  // Ações de evidência usam permissões granulares, independentes da edição de entregáveis.
  const acessoValido = habilitado && !acesso.erro && !acesso.carregando;
  const permissoes = acessoValido ? acesso.dados?.permissoes : undefined;
  const contrato = useContrato(contratoId, habilitado);
  const etapas = useEtapas(contratoId, habilitado);
  const cache = useRepositorioConsultasOpcional();
  const pai = etapas.dados?.find(e => e.id === consulta.dados?.etapaId);
  const raiz = contrato.dados;
  const atual = consulta.dados;
  const contextoAtivo = Boolean(acessoValido && raiz?.id === contratoId && pai?.contratoId === contratoId && !contrato.erro && !etapas.erro && !raiz.arquivadoEm && !raiz.conclusaoSolicitadaEm && !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADO','SUSPENSO','CANCELADO'].includes(raiz.status) && !pai.arquivadoEm && !pai.conclusaoSolicitadaEm && !pai.encerramentoSolicitadoEm && !['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(pai.status));
  const bloqueado = !contextoAtivo || Boolean(atual?.arquivadoEm || atual?.regularizacaoDocumentalSolicitada || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(atual?.statusExecucao ?? '') || (!atual?.reabertoEm && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(atual?.statusExecucao ?? '')));
  const podeEditar = !bloqueado && Boolean(permissoes?.editarEntregaveis);
  const regularizacao = Boolean(acessoValido && raiz?.id === contratoId && pai?.contratoId === contratoId && !contrato.erro && !etapas.erro && !raiz.arquivadoEm && !raiz.conclusaoSolicitadaEm && !['CONCLUIDO','FINALIZADO','ENCERRADO','SUSPENSO','CANCELADO'].includes(raiz.status) && !pai.arquivadoEm && !pai.conclusaoSolicitadaEm && !pai.encerramentoSolicitadoEm && !['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(pai.status) && atual?.statusExecucao === 'CONCLUIDO_PARCIALMENTE' && !atual.arquivadoEm);
  async function salvar(dados: DadosPlanejamentoEntregavel, base?: Entregavel) {
    if (!podeEditar || !base || base.id !== entregavelId || base.contratoId !== contratoId)
      throw new ErroEntregavel(409, 'O entregável não permite edição no estado atual.');
    const alteracoes = prepararEdicaoEntregavel(base, dados);
    if (Object.keys(alteracoes).length) await editarEntregavel(contratoId, entregavelId, alteracoes);
    if (cache) sincronizarContrato(cache, contratoId);
    setEditando(false); toastSucesso('Planejamento atualizado.');
    void consulta.atualizar().catch(() => {});
  }
  // Nao exibir dados de cache se a identidade perdeu acesso ou se a API negou a consulta.
  const erro = perfil.erro || consulta.erro || acesso.erro || contrato.erro || etapas.erro;
  const item = !erro && habilitado && consulta.dados?.contratoId === contratoId &&
    consulta.dados?.id === entregavelId ? consulta.dados : undefined;
  return <AreaContratos titulo="Detalhe do entregável">
    <LinkVoltar href={`/contratos/${encodeURIComponent(contratoId)}`}>Voltar ao contrato</LinkVoltar>
    {(perfil.carregando || (habilitado && consulta.carregando && !item)) && <Aviso>Carregando entregável...</Aviso>}
    {Boolean(erro) && <Aviso erro>{erro instanceof Error ? erro.message : 'Falha na consulta do entregável.'}</Aviso>}
    {!perfil.carregando && !erro && !habilitado && <Aviso erro>Conta sem autorização para consultar entregáveis.</Aviso>}
    {!perfil.carregando && habilitado && !consulta.carregando && !erro && !item && <Aviso erro>Entregável não encontrado neste contrato.</Aviso>}
    {item && <div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-lg font-semibold text-brand-neon">{item.nome}</h2><span className="text-xs font-semibold text-foreground/70">{rotuloEstadoEntregavel(item.statusExecucao,Boolean(item.arquivadoEm),Boolean(item.reabertoEm),Boolean(item.regularizacaoDocumentalSolicitada),false,item.tipo==='CONTINUO'&&Boolean(item.finalizadoComAtraso))}</span><EtiquetaAtraso atrasado={item.atrasado} finalizadoComAtraso={item.tipo!=='CONTINUO'&&item.finalizadoComAtraso}/></div>}

    {item && podeEditar && <div className="flex justify-end"><button type="button" disabled={salvando} aria-expanded={editando}
      aria-controls="edicao-entregavel" onClick={() => { setEditando((anterior) => !anterior); }}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
      {editando ? 'Fechar edição' : 'Editar entregável'}

    </button></div>}
    {item && podeEditar && editando && <div id="edicao-entregavel" className="etapa-form-expandido">
      <FormularioEntregavel vigencia={raiz?{...raiz,inicioEtapa:pai?.inicioPrevisto,terminoEtapa:pai?.terminoPrevisto}:undefined} key={item.id} contratoId={contratoId} etapaId={item.etapaId} inicial={item} onSalvar={salvar}
        pesosContrato={pesos.dados} modoCalculo={execucao.progresso?.modoCalculo ?? 'SIMPLES'}
        onCancelar={() => setEditando(false)} onSalvandoMudou={setSalvando}
        podeConfigurarPesos={Boolean(permissoes?.configurarPesos)}
        podeReplanejarOcorrencias={Boolean(permissoes?.configurarAgendaOcorrencias)} />
    </div>}
    {item && (!editando || !podeEditar) && <ConteudoEntregavel item={item} bloqueadoPorPai={bloqueado} somenteLeituraExecucao={bloqueado} regularizacaoDocumental={regularizacao} permissoesExecucao={bloqueado && !regularizacao ? undefined : permissoes}
      podeEditarEsperada={(!bloqueado || regularizacao) && Boolean(permissoes?.editarEvidencias)}
      podeCriarEvidencia={(!bloqueado || regularizacao) && Boolean(permissoes?.criarEvidencias)}
      podeArquivarEvidencia={!bloqueado && Boolean(permissoes?.arquivarEvidencias)}
      podeReativarEvidencia={!bloqueado && Boolean(permissoes?.reativarEvidencias)}
      podeReabrirEvidencia={(!bloqueado || regularizacao && !atual?.regularizacaoDocumentalSolicitada) && Boolean(permissoes?.reabrirEvidencias)}
      podeExcluirEvidenciaArquivada={!bloqueado && Boolean(permissoes?.excluirEvidenciasArquivadas)}
      podeAlterarObrigatoriedade={(!bloqueado || regularizacao) && Boolean(permissoes?.alterarObrigatoriedade)}
      podeEnviarComprovantes={(!bloqueado || regularizacao) && Boolean(permissoes?.enviarComprovantes)} podeVerHistorico
      aoAtualizarEsperada={() => { if (cache) sincronizarContrato(cache, contratoId); void consulta.atualizar().catch(() => {}); }} />}
  </AreaContratos>;
}
