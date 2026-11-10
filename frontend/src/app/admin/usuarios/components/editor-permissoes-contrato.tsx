"use client";
import { AbasRolaveis } from '@/app/components/abas-rolaveis';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { toastSucesso } from '@/app/components/toast-notificacoes';
import { OPERACOES_CONTRATO, obterPermissoesIniciais, type OperacaoPermissao,
  type PermissaoFuncionario, type PerfilFuncionario } from '@/lib/admin-usuarios';

/** Navegação em dois níveis: escopo da hierarquia e operação relacionada.
 * Não altera o catálogo de permissões nem os direitos efetivos do servidor. */
type GrupoPermissoes = { titulo: string; secoes: ReadonlyArray<{
  icone: string; nome: string; chaves: readonly OperacaoPermissao[];
}> };
const ESCOPOS_PERMISSOES: readonly GrupoPermissoes[] = [
  { titulo: 'Contrato', secoes: [
    { icone: '✓', nome: 'Conclusão e reabertura', chaves: ['concluirContrato', 'encerrarContrato', 'reabrirContrato'] },
    { icone: '⏸', nome: 'Suspensão e retomada', chaves: ['suspenderContrato', 'retomarContrato'] },
    { icone: '✕', nome: 'Cancelamento e reversão', chaves: ['cancelarContrato', 'reverterCancelamentoContrato'] },
    { icone: '✎', nome: 'Cadastro e anexação', chaves: ['editarContrato', 'anexarDocumentos', 'editarDocumentos'] },
    { icone: '✓', nome: 'Verificação de anexos', chaves: ['verificarDocumentos', 'reabrirDocumentos'] },
    { icone: '▣', nome: 'Arquivamento de anexos', chaves: ['arquivarDocumentos', 'reativarDocumentos'] },
    { icone: '▤', nome: 'Documento principal', chaves: ['verificarDocumentoPrincipal', 'reabrirDocumentoPrincipal', 'arquivarDocumentoPrincipal', 'reativarDocumentoPrincipal'] },
  ] },
  { titulo: 'Etapas', secoes: [
    { icone: '✎', nome: 'Planejamento', chaves: ['criarEtapas', 'editarEtapas', 'reordenarEtapas', 'bloquearOrdemEtapas'] },
    { icone: '✓', nome: 'Conclusão e revisão', chaves: ['concluirEtapas', 'reabrirEtapas', 'encerrarEtapas', 'reabrirEtapasEncerradas'] },
    { icone: '▣', nome: 'Arquivamento e exclusão', chaves: ['arquivarEtapas', 'reativarEtapas', 'excluirEtapasArquivadas'] },
  ] },
  { titulo: 'Entregáveis', secoes: [
    { icone: '✎', nome: 'Cadastro', chaves: ['criarEntregaveis', 'editarEntregaveis'] },
    { icone: '✓', nome: 'Conclusão e revisão', chaves: ['concluirEntregaveis', 'reabrirEntregaveis'] },
    { icone: '▣', nome: 'Arquivamento e exclusão', chaves: ['arquivarEntregaveis', 'reativarEntregaveis', 'excluirEntregaveisArquivados'] },
  ] },
  { titulo: 'Atividades', secoes: [
    { icone: '✎', nome: 'Registro e edição', chaves: ['registrarAtividades', 'editarAtividades'] },
    { icone: '✓', nome: 'Conferência e reabertura', chaves: ['verificarAtividades', 'reabrirAtividades'] },
    { icone: '▣', nome: 'Arquivamento, reativação e exclusão', chaves: ['arquivarAtividades', 'reativarAtividades', 'excluirAtividadesArquivadas'] },
  ] },
  { titulo: 'Evidências', secoes: [
    { icone: '✎', nome: 'Cadastro e critérios', chaves: ['criarEvidencias', 'editarEvidencias', 'alterarObrigatoriedade'] },
    { icone: '✓', nome: 'Comprovação e revisão', chaves: ['enviarComprovantes', 'verificarComprovantes', 'reabrirEvidencias'] },
    { icone: '▣', nome: 'Arquivamento e exclusão', chaves: ['arquivarEvidencias', 'reativarEvidencias', 'excluirEvidenciasArquivadas'] },
  ] },
];

/** Painel modal de concessões específicas. O servidor valida cada operação ao salvar. */
export function EditorPermissoesContrato({ vinculo, perfil, salvando, onSalvar }: {
  vinculo: PermissaoFuncionario; perfil: PerfilFuncionario; salvando: boolean;
  onSalvar: (permissoes: Record<OperacaoPermissao, boolean>) => Promise<void>;
}) {
  const [selecionadas, setSelecionadas] = useState(() => obterPermissoesIniciais(perfil, vinculo));
  const [aberto, setAberto] = useState(false);
  const [escopo, setEscopo] = useState(0);
  const [subsecao, setSubsecao] = useState(0);
  const grupoAtual = ESCOPOS_PERMISSOES[escopo];
  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState('');
  const [gatilhoFoco, setGatilhoFoco] = useState<HTMLButtonElement | null>(null);
  const marcador = useRef<string | null>(null);
  const sequencia = useRef(0);
  const abrir = (origem: HTMLButtonElement) => {
    setGatilhoFoco(origem);
    setSelecionadas(obterPermissoesIniciais(perfil, vinculo));
    setErro('');
    setEscopo(0); setSubsecao(0);
    const id = `permissoes:${vinculo.contratoId}:${++sequencia.current}`;
    const estado = window.history.state;
    window.history.pushState({ ...(estado && typeof estado === 'object' ? estado : {}), __editorPermissoes: id }, '', window.location.href);
    marcador.current = id;
    setAberto(true);
  };
  const fechar = useCallback(() => {
    if (salvando || submetendo) return;
    setAberto(false);
    const id = marcador.current;
    marcador.current = null;
    if (id && window.history.state?.__editorPermissoes === id) window.history.back();
  }, [salvando, submetendo]);
  useEffect(() => {
    function aoVoltar() {
      const id = marcador.current;
      if (!id || window.history.state?.__editorPermissoes === id) return;
      marcador.current = null;
      setAberto(false);
    }
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);
  const salvar = async () => {
    if (salvando || submetendo) return;
    setErro(''); setSubmetendo(true);
    try { await onSalvar(selecionadas); toastSucesso('Permissões atualizadas.'); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar permissões.'); }
    finally { setSubmetendo(false); }
  };
  return <>
    <button type="button" onClick={(evento) => abrir(evento.currentTarget)} aria-haspopup="dialog" aria-expanded={aberto}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-brand-green/35 px-3 py-1.5 text-xs font-semibold text-brand-neon transition-colors hover:bg-brand-green/15 focus-visible:outline-2 focus-visible:outline-brand-neon">
      <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 3 4 7v5c0 5 3 8 8 10 5-2 8-5 8-10V7l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg>
      Ver permissões completas
    </button>
    {aberto && createPortal(<ModalEtapa titulo="Permissões do contrato" contexto="Controle de acesso" compacto
      camada="principal" alturaEstavel textoFechar="Fechar ×" rotuloFechar="Fechar permissões" ocupado={salvando || submetendo} focoRetorno={gatilhoFoco} onFechar={fechar}>
      <section aria-label="Permissões detalhadas" className="space-y-4" data-testid="permissoes-detalhadas">
        <p className="text-xs leading-relaxed text-foreground/65">Marque cada operação separadamente. Criar, editar, concluir, reabrir, arquivar, reativar e excluir são poderes distintos; a concessão de um não autoriza os outros.</p>
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-semibold text-foreground/65">1. Selecione o nível</p>
            <AbasRolaveis><div role="tablist" aria-label="Níveis de permissões" className="flex flex-wrap gap-1 rounded-xl border border-foreground/15 bg-background p-1">
              {ESCOPOS_PERMISSOES.map((grupo, indice) => <button key={grupo.titulo} type="button" role="tab"
                aria-selected={escopo === indice} onClick={() => { setEscopo(indice); setSubsecao(0); }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-neon ${escopo === indice ? 'bg-brand-green text-on-brand-green' : 'text-foreground/75 hover:bg-white/10'}`}>
                {grupo.titulo}
              </button>)}
            </div></AbasRolaveis>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-foreground/65">2. Selecione a operação</p>
            <AbasRolaveis><div role="tablist" aria-label="Grupos de permissões" className="flex flex-wrap gap-1 rounded-xl border border-foreground/15 bg-background p-1">
              {grupoAtual.secoes.map((secao, indice) => <button key={secao.nome} type="button" role="tab"
                aria-selected={subsecao === indice} onClick={() => setSubsecao(indice)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-neon ${subsecao === indice ? 'bg-brand-green text-on-brand-green' : 'text-foreground/75 hover:bg-white/10'}`}>
                <span aria-hidden="true" className="mr-1">{secao.icone}</span>{secao.nome}
              </button>)}
            </div></AbasRolaveis>
          </div>
          <section aria-label={`Permissões: ${grupoAtual.titulo}`} className="space-y-3 rounded-xl border border-foreground/15 bg-background p-3 sm:p-4">
            <h3 className="text-sm font-semibold text-foreground">{grupoAtual.titulo} · {grupoAtual.secoes[subsecao].nome}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {grupoAtual.secoes[subsecao].chaves.map(chave => {
                const operacao = OPERACOES_CONTRATO.find(op => op.chave === chave);
                if (!operacao) return null;
                return <label key={chave}
                  className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-xs hover:border-brand-green/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-violet-300">
                  <input type="checkbox" checked={selecionadas[chave]} disabled={salvando || submetendo}
                    onChange={e => setSelecionadas(v => ({ ...v, [chave]: e.target.checked }))}
                    className="h-4 w-4 shrink-0 accent-brand-green" />
                  <span className="min-w-0 break-words">{operacao.rotulo}</span>
                </label>;
              })}
            </div>
          </section>
          <p className="text-xs text-foreground/55">As alterações feitas nas outras abas são preservadas até salvar. Cada permissão é independente.</p>
        </div>
        {erro && <p role="alert" className="text-sm text-error-text">{erro}</p>}
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-brand-green/20 pt-3">
          <button type="button" disabled={salvando || submetendo} onClick={fechar}
            className="rounded-lg border border-brand-green/35 px-4 py-2 text-sm hover:bg-brand-green/10 disabled:opacity-50">Cancelar</button>
          <button type="button" disabled={salvando || submetendo} onClick={() => void salvar()}
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green hover:brightness-110 disabled:opacity-50">{salvando || submetendo ? 'Salvando...' : 'Salvar permissões'}</button>
        </footer>
      </section>
    </ModalEtapa>, document.body)}
  </>;
}
