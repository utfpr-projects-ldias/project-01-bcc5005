'use client';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';
import { rotuloEstadoEntregavel } from '@/lib/identidade-operacional';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { LinkVoltar } from '@/app/components/link-voltar';
import { AreaContratos, Aviso } from '@/app/contratos/components/area-contratos';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { FormularioEntregavel } from '@/app/contratos/components/formulario-entregavel';
import { editarEntregavel } from '@/lib/entregaveis';
import type { DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
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
  const podeEditar = Boolean(permissoes?.editarEntregaveis);
  async function salvar(dados: DadosPlanejamentoEntregavel) {
    if (!podeEditar || !consulta.dados || consulta.dados.id !== entregavelId || consulta.dados.contratoId !== contratoId) return;
    // A edição do planejamento nunca pode reenviar o checklist: cada evidência
    // é alterada por sua própria API, com autorização e concorrência isoladas.
    const planejamento: Partial<DadosPlanejamentoEntregavel> = { ...dados };
    delete planejamento.evidenciasEsperadas;
    const campos = ['etapaId', 'nome', 'tipo', 'codigo', 'descricao', 'responsavelId',
      'inicioPrevisto', 'terminoPrevisto', 'quantidadePrevista', 'unidadeMedida',
      'periodicidade', 'configuracaoPeriodicidade', 'peso', 'criterioConclusao', 'observacoes'] as const;
    const alteracoes: Partial<DadosPlanejamentoEntregavel> = {};
    for (const campo of campos) {
      const novo = planejamento[campo];
      const atual = consulta.dados[campo];
      const igual = campo === 'configuracaoPeriodicidade'
        ? JSON.stringify(novo ?? null) === JSON.stringify(atual ?? null)
        : (campo === 'peso' || campo === 'quantidadePrevista') && novo != null && atual != null
          ? Number(novo) === Number(atual)
          : (novo ?? null) === (atual ?? null);
      if (!igual) (alteracoes as Record<string, unknown>)[campo] = novo;
    }
    if (Object.keys(alteracoes).length) await editarEntregavel(contratoId, entregavelId, alteracoes);
    setEditando(false); toastSucesso('Planejamento atualizado.');
    void consulta.atualizar().catch(() => {});
  }
  // Nao exibir dados de cache se a identidade perdeu acesso ou se a API negou a consulta.
  const erro = perfil.erro || consulta.erro || acesso.erro;
  const item = !erro && habilitado && consulta.dados?.contratoId === contratoId &&
    consulta.dados?.id === entregavelId ? consulta.dados : undefined;
  return <AreaContratos titulo="Detalhe do entregável">
    <LinkVoltar href={`/contratos/${encodeURIComponent(contratoId)}`}>Voltar ao contrato</LinkVoltar>
    {(perfil.carregando || (habilitado && consulta.carregando && !item)) && <Aviso>Carregando entregável...</Aviso>}
    {Boolean(erro) && <Aviso erro>{erro instanceof Error ? erro.message : 'Falha na consulta do entregável.'}</Aviso>}
    {!perfil.carregando && !erro && !habilitado && <Aviso erro>Conta sem autorização para consultar entregáveis.</Aviso>}
    {!perfil.carregando && habilitado && !consulta.carregando && !erro && !item && <Aviso erro>Entregável não encontrado neste contrato.</Aviso>}
    {item && <div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-lg font-semibold text-brand-neon">{item.nome}</h2><span className="text-xs font-semibold text-foreground/70">{rotuloEstadoEntregavel(item.statusExecucao,Boolean(item.arquivadoEm),Boolean(item.reabertoEm),Boolean(item.regularizacaoDocumentalSolicitada))}</span><EtiquetaAtraso atrasado={item.atrasado} finalizadoComAtraso={item.finalizadoComAtraso}/></div>}

    {item && podeEditar && <div className="flex justify-end"><button type="button" disabled={salvando} aria-expanded={editando}
      aria-controls="edicao-entregavel" onClick={() => { setEditando((anterior) => !anterior); }}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
      {editando ? 'Fechar edição' : 'Editar entregável'}

    </button></div>}
    {item && podeEditar && editando && <div id="edicao-entregavel" className="etapa-form-expandido">
      <FormularioEntregavel key={item.id} contratoId={contratoId} etapaId={item.etapaId} inicial={item} onSalvar={salvar}
        pesosContrato={pesos.dados} modoCalculo={execucao.progresso?.modoCalculo ?? 'SIMPLES'}
        onCancelar={() => setEditando(false)} onSalvandoMudou={setSalvando}
        podeConfigurarPesos={Boolean(permissoes?.configurarPesos)}
        podeReplanejarOcorrencias={Boolean(permissoes?.configurarAgendaOcorrencias)} />
    </div>}
    {item && !editando && <ConteudoEntregavel item={item}
      podeEditarEsperada={Boolean(permissoes?.editarEvidencias)}
      podeCriarEvidencia={Boolean(permissoes?.criarEvidencias)}
      podeArquivarEvidencia={Boolean(permissoes?.arquivarEvidencias)}
      podeReativarEvidencia={Boolean(permissoes?.reativarEvidencias)}
      podeReabrirEvidencia={Boolean(permissoes?.reabrirEvidencias)}
      podeExcluirEvidenciaArquivada={Boolean(permissoes?.excluirEvidenciasArquivadas)}
      podeAlterarObrigatoriedade={Boolean(permissoes?.alterarObrigatoriedade)}
      podeEnviarComprovantes={Boolean(permissoes?.enviarComprovantes)} podeVerHistorico
      aoAtualizarEsperada={() => { void consulta.atualizar().catch(() => {}); }} />}
  </AreaContratos>;
}
