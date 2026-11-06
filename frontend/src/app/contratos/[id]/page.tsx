'use client';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';

import { useConsulta } from '@/app/components/provedor-consultas';
import { buscarFuncionarioPorId } from '@/lib/admin-usuarios';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { arquivarContrato, reabrirContrato } from '@/lib/contratos';
import { useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { useParams } from 'next/navigation';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useContrato, useAcessoContrato, useResponsaveis, useMutacoesContrato } from '@/hooks/use-contratos';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import { contratoDocumentalmenteConcluido } from '@/lib/situacao-documental-etapa';
import { dataCivil, MODOS, STATUS, rotuloCodigoPublico, type DadosContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from '../components/area-contratos';
import { PainelEtapas } from '../components/painel-etapas';
import { PainelDocumentos } from '../components/painel-documentos';
import { ResumoPlanejamentoContrato } from '../components/resumo-planejamento-contrato';
import { FormularioContrato } from '../components/formulario-contrato';
import { ModalEtapa } from '../components/modal-etapa';

type Par = [titulo: string, valor: string | null | undefined];
function dataBR(valor: string | null | undefined): string {
  const data = dataCivil(valor);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.split('-').reverse().join('/') : 'Não informado';
}
export default function DetalheContratoPage() {
  const { id } = useParams<{ id: string }>();
  const cache = useRepositorioConsultas();
  const [abaContrato, setAbaContrato] = useState<'visao' | 'etapas' | 'documentos'>('visao');
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  const [confirmarReabertura, setConfirmarReabertura] = useState(false);
  const [editarAberto, setEditarAberto] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState('');
  const identificadorEdicao = useId();
  const marcadorEdicao = useRef<string | null>(null);
  const [alterandoArquivo, setAlterandoArquivo] = useState(false);
  const [erroArquivo, setErroArquivo] = useState('');
  const { dados: perfil, carregando: verificando, erro: erroPerfil } = useMeuPerfil();
  const contratoQuery = useContrato(id, !!perfil?.ativo);
  const acessoQuery = useAcessoContrato(id, !!perfil?.ativo);
  const erroConsulta = erroPerfil || contratoQuery.erro || acessoQuery.erro;
  const erro = erroConsulta instanceof Error ? erroConsulta.message : erroConsulta ? 'Não foi possível consultar o contrato.' : '';
  const carregando = verificando || (!!perfil?.ativo && (contratoQuery.carregando || acessoQuery.carregando));
  const contrato = !erroConsulta && perfil?.ativo ? contratoQuery.dados : undefined;
  // O status operacional é independente da comprovação documental.
  const etapasDocumentais = useEtapas(id, Boolean(contrato));
  const entregaveisDocumentais = useEntregaveis(id, Boolean(contrato));
  const resumoDocumental = useResumoDocumentalContrato(id, Boolean(contrato));
  const documentalmenteConcluido = Boolean(contrato && contratoDocumentalmenteConcluido(
    contrato, etapasDocumentais.dados, entregaveisDocumentais.dados, resumoDocumental.dados));
  const concluido = Boolean(contrato && !contrato.reabertoEm &&
    (contrato.status === 'CONCLUIDO' || documentalmenteConcluido));
  const podeEditar = !erroConsulta && !contrato?.arquivadoEm && !concluido &&
    !!(acessoQuery.dados?.permissoes?.editarContrato ?? acessoQuery.dados?.podeEditar) &&
    (perfil?.perfil === 'ADMINISTRADOR' || perfil?.perfil === 'GESTOR');
  const administrador = perfil?.perfil === 'ADMINISTRADOR';
  const responsaveisQuery = useResponsaveis(Boolean(editarAberto && administrador && podeEditar));
  // A lista administrativa de funcionários deliberadamente omite a conta ADMIN.
  // A própria conta pode, contudo, constar como responsável cadastral.
  const responsaveisPossiveis = [
    ...(perfil?.ativo && perfil.perfil === 'ADMINISTRADOR' ? [{
      id: perfil.id, nome: perfil.nome, email: perfil.email, perfil: perfil.perfil,
      ativo: perfil.ativo, criadoEm: '',
    }] : []),
    ...(responsaveisQuery.dados?.usuarios ?? []),
  ];
  // Evita options com a mesma key quando a consulta retorna a conta ADMIN.
  const responsaveis = responsaveisPossiveis.filter((u, indice, todos) => todos.findIndex(v => v.id === u.id) === indice);
  const mutacoes = useMutacoesContrato();
  function abrirEdicao() {
    if (!podeEditar || !contrato || editarAberto) return;
    const estado = window.history.state;
    const marcador = `${identificadorEdicao}:${contrato.id}`;
    window.history.pushState({ ...(estado && typeof estado === 'object' ? estado : {}), __editarContrato: marcador }, '', window.location.href);
    marcadorEdicao.current = marcador;
    setErroEdicao(''); setEditarAberto(true);
  }
  function fecharEdicao() {
    if (salvandoEdicao || alterandoArquivo) return;
    if (confirmarArquivo) { setConfirmarArquivo(false); return; }
    const marcador = marcadorEdicao.current;
    marcadorEdicao.current = null;
    setEditarAberto(false);
    if (marcador && window.history.state?.__editarContrato === marcador) window.history.back();
  }
  useEffect(() => {
    const voltar = () => {
      if (!marcadorEdicao.current || window.history.state?.__editarContrato === marcadorEdicao.current) return;
      marcadorEdicao.current = null;
      setConfirmarArquivo(false);
      setEditarAberto(false);
    };
    window.addEventListener('popstate', voltar);
    return () => window.removeEventListener('popstate', voltar);
  }, []);
  async function salvarEdicao(dados: DadosContrato) {
    if (!contrato || !podeEditar || salvandoEdicao) return;
    setSalvandoEdicao(true); setErroEdicao('');
    try {
      await mutacoes.editar(contrato.id, dados);
      // Navegação permanece no contrato; a consulta é invalidada pela mutação.
      const marcador = marcadorEdicao.current;
      marcadorEdicao.current = null;
      setEditarAberto(false);
      if (marcador && window.history.state?.__editarContrato === marcador) window.history.back();
      toastSucesso('Contrato atualizado.');
    } catch (e) { setErroEdicao(e instanceof Error ? e.message : 'Falha ao salvar as alterações.'); }
    finally { setSalvandoEdicao(false); }
  }
  async function executarReabertura() {
    if (!contrato || !perfil?.ativo || alterandoArquivo || !(administrador || acessoQuery.dados?.permissoes?.reabrirContrato)) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      await reabrirContrato(contrato.id);
      setConfirmarReabertura(false);
      cache.invalidar(['contratos', 'detalhe', contrato.id]); cache.invalidar(['contratos', 'lista']);
      await contratoQuery.atualizar();
      toastSucesso('Contrato reaberto para edição.');
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível reabrir o contrato.'); }
    finally { setAlterandoArquivo(false); }
  }
  async function alterarArquivo() {
    if (!administrador || !contrato || contrato.arquivadoEm || concluido || alterandoArquivo) return;
    setAlterandoArquivo(true); setErroArquivo('');
    try {
      await arquivarContrato(contrato.id);
      cache.invalidar(['contratos', 'lista']);
      cache.invalidar(['contratos', 'detalhe', contrato.id]);
      cache.invalidar(['contratos', 'acesso', contrato.id]);
      setConfirmarArquivo(false);
      {
        const marcador = marcadorEdicao.current;
        marcadorEdicao.current = null;
        setEditarAberto(false);
        if (marcador && window.history.state?.__editarContrato === marcador) window.history.back();
      }
      await contratoQuery.atualizar();
      toastAviso('Contrato arquivado.');
    } catch (erro) {
      setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível atualizar o arquivamento.');
    } finally { setAlterandoArquivo(false); }
  }
  const responsavelId = contrato?.responsavelInternoId ?? null;
  // Administradores podem consultar o nome na API ja existente; outros perfis
  // nao tentam acessar /admin/usuarios nem recebem dados que lhes sao negados.
  const responsavelQuery = useConsulta(
    ['contratos', 'responsavel', responsavelId ?? 'nenhum'],
    () => buscarFuncionarioPorId(responsavelId!),
    { habilitada: Boolean(responsavelId && perfil?.ativo && perfil.perfil === 'ADMINISTRADOR'), validadeMs: 30_000 },
  );
  const responsavelVisivel = responsavelQuery.dados
    ? `${responsavelQuery.dados.nome?.trim() || 'Nome não informado'} — ${responsavelQuery.dados.email}`
    : responsavelId ? 'Responsável interno cadastrado' : null;
  return <div className="contrato-detalhe-documental" data-arquivado={Boolean(contrato?.arquivadoEm)}><AreaContratos titulo="Detalhes do contrato">
    {erroArquivo && <Aviso erro>{erroArquivo}</Aviso>}
    {carregando ? <Aviso>Carregando contrato...</Aviso> : erro ? <Aviso erro>{erro}</Aviso> : contrato ? <>
      <header className="flex min-w-0 items-center gap-3 py-1">
        <Link href="/contratos" aria-label="Voltar aos contratos" title="Voltar aos contratos"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green/10 text-brand-neon transition-colors hover:bg-brand-green/20 focus-visible:outline-2 focus-visible:outline-brand-neon">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div className="min-w-0 flex-1"><h2 title={contrato.numeroContrato} className="contrato-detalhe-titulo break-words text-lg font-bold text-brand-neon">{contrato.numeroContrato}</h2>
          <p className="mt-0.5 text-xs text-foreground/65">Código {rotuloCodigoPublico(contrato.codigoPublico)} · {STATUS[contrato.status]}{contrato.reabertoEm ? ' · Reaberto' : ''}</p></div>
        <span className="hidden rounded-full bg-brand-green/10 px-3 py-1 text-xs font-medium sm:inline-flex">{MODOS[contrato.modoCalculo]}</span>
      </header>
      <div className="sticky top-2 z-30 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-green/25 bg-background/95 p-1 shadow-sm backdrop-blur-sm">
        <div role="tablist" aria-label="Seções do contrato" className="flex max-w-full gap-1">
          <button role="tab" type="button" id="tab-visao" aria-controls="painel-visao" aria-selected={abaContrato === 'visao'} onClick={() => setAbaContrato('visao')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${abaContrato === 'visao' ? 'bg-brand-green text-on-brand-green' : 'text-foreground/70 hover:bg-brand-green/10'}`}>Visão geral</button>
          <button role="tab" type="button" id="tab-etapas" aria-controls="painel-etapas" aria-selected={abaContrato === 'etapas'} onClick={() => setAbaContrato('etapas')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${abaContrato === 'etapas' ? 'bg-brand-green text-on-brand-green' : 'text-foreground/70 hover:bg-brand-green/10'}`}>Etapas</button>
          <button role="tab" type="button" id="tab-documentos" aria-controls="painel-documentos" aria-selected={abaContrato === 'documentos'} onClick={() => setAbaContrato('documentos')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${abaContrato === 'documentos' ? 'bg-brand-green text-on-brand-green' : 'text-foreground/70 hover:bg-brand-green/10'}`}>Documentos</button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(administrador || acessoQuery.dados?.permissoes?.reabrirContrato) && concluido && !contrato.arquivadoEm && <button type="button"
            onClick={() => setConfirmarReabertura(true)} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20" aria-label="Reabrir contrato concluído"><span className="text-base" aria-hidden="true">⟳</span> Reabrir contrato</button>}
          {administrador && !concluido && <button type="button" onClick={() => setConfirmarArquivo(true)}
            disabled={Boolean(contrato.arquivadoEm)}
            aria-label="Arquivar contrato"
            title={contrato.arquivadoEm ? 'Contrato arquivado: reative-o na aba Arquivados' : 'Arquivar contrato'}
            className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-amber-300 ${contrato.arquivadoEm
              ? 'cursor-not-allowed border-slate-500/35 bg-slate-500/10 text-slate-400 opacity-65'
              : 'cursor-pointer border-amber-500/45 bg-amber-500/10 text-foreground hover:border-amber-400 hover:bg-amber-500/20 active:scale-[.98]'}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6" /></svg>
            Arquivar contrato
          </button>}
          {(podeEditar || (administrador && (!!contrato.arquivadoEm || concluido))) && <button type="button" onClick={abrirEdicao}
            disabled={!podeEditar} title={!podeEditar ? 'Reative ou reabra o contrato antes de editar' : 'Editar contrato'} aria-haspopup="dialog"
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-brand-green/45 bg-brand-green/10 px-3 text-xs font-semibold text-foreground transition-colors hover:border-brand-neon hover:bg-brand-green/20 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-45">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-brand-neon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5 4 4M4 20l4.5-1 11-11a2 2 0 0 0-3-3l-11 11L4 20Z" /></svg>
            Editar contrato
          </button>}
        </div>
      </div>
      <div className="min-w-0">
        <div className="min-w-0 space-y-4">
          <section role="tabpanel" id="painel-visao" aria-labelledby="tab-visao" hidden={abaContrato !== 'visao'} className={abaContrato !== 'visao' ? 'hidden' : 'space-y-4'}>
            <section className="space-y-3" aria-label="Planejamento do contrato">
              <h3 className="text-sm font-semibold text-violet-200">Planejamento do contrato</h3>
              <ResumoPlanejamentoContrato contratoId={contrato.id} variante="detalhe" contratoReabertoEm={contrato.reabertoEm} />
            </section>
            <section aria-label="Informações do contrato" className="rounded-xl border border-brand-green/20 bg-brand-darkgreen/5 px-4 py-2">
              <h3 className="py-2 text-sm font-semibold text-brand-neon">Informações do contrato</h3>
              <details role="region" aria-label="Identificação do contrato" className="group border-t border-brand-green/15 py-2" open>
                <summary className="cursor-pointer py-1 text-sm font-semibold transition-colors hover:text-brand-neon">Identificação</summary>
                <dl className="mt-3 grid min-w-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {([['Objeto contratual', contrato.objeto], ['Número', contrato.numeroContrato], ['Código', rotuloCodigoPublico(contrato.codigoPublico)], ['Órgão contratante', contrato.orgaoContratante],
                    ['Processo administrativo', contrato.processoAdministrativo], ['Unidade responsável', contrato.unidadeResponsavel]] as Par[])
                    .map(([rotulo, valor]) => <div key={rotulo} className={`min-w-0 ${rotulo === 'Órgão contratante' || rotulo === 'Objeto contratual' ? 'sm:col-span-2 lg:col-span-2' : ''}`}>
                      <dt className="text-xs text-foreground/55">{rotulo}</dt>
                      <dd className="mt-0.5 max-h-28 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{valor || 'Não informado'}</dd>
                    </div>)}
                </dl>
              </details>
              <details className="border-t border-brand-green/15 py-2" open>
                <summary className="cursor-pointer py-1 text-sm font-semibold transition-colors hover:text-brand-neon">Vigência e execução</summary>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{([['Início', dataBR(contrato.inicioVigencia)], ['Término', dataBR(contrato.terminoVigencia)], ['Assinatura', dataBR(contrato.dataAssinatura)], ['Status', STATUS[contrato.status]], ['Cálculo', MODOS[contrato.modoCalculo]]] as Par[]).map(([rotulo, valor]) => <div key={rotulo}><dt className="text-xs text-foreground/55">{rotulo}</dt><dd className="mt-0.5 break-words">{valor || 'Não informado'}</dd></div>)}</dl>
              </details>
              <details className="border-t border-brand-green/15 py-2" open>
                <summary className="cursor-pointer py-1 text-sm font-semibold transition-colors hover:text-brand-neon">Responsáveis</summary>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{([['Responsável interno', responsavelVisivel], ['Fiscal/gestor público', contrato.fiscalGestor]] as Par[]).map(([rotulo, valor]) => <div key={rotulo}><dt className="text-xs text-foreground/55">{rotulo}</dt><dd className="mt-0.5 break-words">{valor || 'Não informado'}</dd></div>)}</dl>
              </details>
            </section>

            <section aria-label="Descrição e observações" className="space-y-2 rounded-xl border border-brand-green/15 bg-brand-darkgreen/5 p-3 text-sm">
              <details className="group/descricao" open={!contrato.descricao || contrato.descricao.length < 240}>
                <summary className="cursor-pointer py-1 text-sm font-semibold text-brand-neon">Descrição</summary>
                <p className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground/85">{contrato.descricao || 'Não informada'}</p>
              </details>
              <details className="group/observacoes" open={!contrato.observacoes || contrato.observacoes.length < 180}>
                <summary className="cursor-pointer border-t border-brand-green/10 pt-3 text-sm font-semibold text-brand-neon">Observações</summary>
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground/70">{contrato.observacoes || 'Nenhuma observação'}</p>
              </details>
            </section>

          </section>
          <section role="tabpanel" id="painel-etapas" aria-labelledby="tab-etapas" hidden={abaContrato !== 'etapas'} className={abaContrato !== 'etapas' ? 'hidden' : 'space-y-4'}>
            <PainelEtapas key={`etapas:${contrato.id}`} contratoId={contrato.id} habilitado={!!perfil?.ativo}
              podeGerenciar={podeEditar} permissoes={!contrato.arquivadoEm && !concluido ? acessoQuery.dados?.permissoes : undefined}
              ordemEtapasBloqueada={Boolean(contrato.ordemEtapasBloqueada)}
              onOrdemAlterada={() => contratoQuery.atualizar()} />
          </section>
          <section role="tabpanel" id="painel-documentos" aria-labelledby="tab-documentos" hidden={abaContrato !== 'documentos'} className={abaContrato !== 'documentos' ? 'hidden' : 'space-y-4'}>
            <PainelDocumentos key={`documentos:${contrato.id}`} contratoId={contrato.id} habilitado={!!perfil?.ativo}
              podeAnexar={Boolean(!concluido && (administrador || acessoQuery.dados?.permissoes?.anexarDocumentos))}
              podeEditarMetadados={Boolean(!concluido && (administrador || acessoQuery.dados?.permissoes?.editarDocumentos))}
              podeArquivarDocumentos={Boolean(!concluido && (administrador || acessoQuery.dados?.permissoes?.arquivarDocumentos))}
              podeReativarDocumentos={Boolean(administrador || acessoQuery.dados?.permissoes?.reativarDocumentos)}
              podeExcluirDocumentosArquivados={Boolean(administrador || acessoQuery.dados?.permissoes?.excluirDocumentosArquivados)}
              podeAdministrarPrincipal={Boolean(!concluido && (administrador || acessoQuery.dados?.permissoes?.administrarDocumentoPrincipal))} />
          </section>
        </div>

      </div>
    </> : <Aviso erro>Contrato não encontrado.</Aviso>}
    {editarAberto && contrato && podeEditar && <ModalEtapa titulo={`Editar contrato · ${contrato.numeroContrato}`}
      contexto="Dados administrativos do contrato" textoFechar="Fechar ×" rotuloFechar="Fechar edição do contrato"
      bloqueadoPorSubmodal={confirmarArquivo} ocupado={salvandoEdicao || alterandoArquivo} onFechar={fecharEdicao}>
      <div className="space-y-4" data-testid="modal-edicao-contrato">
        {erroEdicao && <Aviso erro>{erroEdicao}</Aviso>}
        {administrador && responsaveisQuery.carregando && <p role="status" className="text-sm text-foreground/70">Carregando responsáveis...</p>}
        {Boolean(responsaveisQuery.erro) && <Aviso erro>Não foi possível consultar os responsáveis. Nenhuma atribuição será alterada automaticamente.</Aviso>}
        <FormularioContrato key={contrato.id} inicial={contrato} responsaveis={responsaveis}
          onSalvar={salvarEdicao} onCancelar={fecharEdicao} salvando={salvandoEdicao}
          podeDefinirResponsavel={administrador && !responsaveisQuery.erro} />
      </div>
    </ModalEtapa>}
    {confirmarReabertura && contrato && <ConfirmacaoSimples
      titulo="Reabrir contrato concluído?" descricao="O contrato será marcado como Reaberto. Etapas, entregáveis e evidências continuarão no estado atual e precisarão de reabertura específica. O histórico será preservado."
      confirmar="Reabrir contrato" ocupado={alterandoArquivo} onCancelar={() => setConfirmarReabertura(false)}
      onConfirmar={() => void executarReabertura()} />}
    {confirmarArquivo && contrato && <ConfirmacaoSimples
      titulo='Arquivar contrato?'
      descricao='O contrato ficará em Arquivados. Os documentos e o histórico serão preservados. Para reativá-lo, utilize a aba Arquivados.'
      confirmar='Arquivar contrato'
      ocupado={alterandoArquivo}
      onCancelar={() => { if (!alterandoArquivo) setConfirmarArquivo(false); }}
      onConfirmar={() => void alterarArquivo()}
    />}
  </AreaContratos></div>;
}
