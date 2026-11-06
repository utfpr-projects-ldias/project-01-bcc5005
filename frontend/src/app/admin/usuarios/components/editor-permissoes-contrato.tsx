"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { toastSucesso } from '@/app/components/toast-notificacoes';
import { OPERACOES_CONTRATO, obterPermissoesIniciais, type OperacaoPermissao,
  type PermissaoFuncionario, type PerfilFuncionario } from '@/lib/admin-usuarios';

/** Painel modal de concessões específicas. O servidor valida cada operação ao salvar. */
export function EditorPermissoesContrato({ vinculo, perfil, salvando, onSalvar }: {
  vinculo: PermissaoFuncionario; perfil: PerfilFuncionario; salvando: boolean;
  onSalvar: (permissoes: Record<OperacaoPermissao, boolean>) => Promise<void>;
}) {
  const [selecionadas, setSelecionadas] = useState(() => obterPermissoesIniciais(perfil, vinculo));
  const [aberto, setAberto] = useState(false);
  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState('');
  const [gatilhoFoco, setGatilhoFoco] = useState<HTMLButtonElement | null>(null);
  const marcador = useRef<string | null>(null);
  const sequencia = useRef(0);
  const abrir = (origem: HTMLButtonElement) => {
    setGatilhoFoco(origem);
    setSelecionadas(obterPermissoesIniciais(perfil, vinculo));
    setErro('');
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
      camada="principal" textoFechar="Fechar ×" rotuloFechar="Fechar permissões" ocupado={salvando || submetendo} focoRetorno={gatilhoFoco} onFechar={fechar}>
      <section aria-label="Permissões detalhadas" className="space-y-4" data-testid="permissoes-detalhadas">
        <p className="text-xs leading-relaxed text-foreground/65">Selecione apenas as operações autorizadas para este contrato.</p>
        {([
          { titulo: 'Contrato e documentos', descricao: 'Cadastro, anexos e documento principal.', chaves: ['editarContrato', 'reabrirContrato', 'anexarDocumentos', 'editarDocumentos', 'arquivarDocumentos', 'reativarDocumentos', 'excluirDocumentosArquivados', 'administrarDocumentoPrincipal'] },
          { titulo: 'Etapas', descricao: 'Planejamento, alterações e ordem das etapas.', chaves: ['criarEtapas', 'editarEtapas', 'reordenarEtapas', 'bloquearOrdemEtapas', 'arquivarEtapas', 'reativarEtapas', 'reabrirEtapas', 'excluirEtapasArquivadas'] },
          { titulo: 'Entregáveis', descricao: 'Cadastro, edição e arquivamento dos entregáveis.', chaves: ['criarEntregaveis', 'editarEntregaveis', 'arquivarEntregaveis', 'reativarEntregaveis', 'reabrirEntregaveis', 'excluirEntregaveisArquivados'] },
          { titulo: 'Evidências e comprovantes', descricao: 'Checklist documental, anexos e verificações.', chaves: ['criarEvidencias', 'editarEvidencias', 'arquivarEvidencias', 'reativarEvidencias', 'reabrirEvidencias', 'excluirEvidenciasArquivadas', 'alterarObrigatoriedade', 'enviarComprovantes', 'verificarComprovantes'] },
        ] as const).map((grupo) => <section key={grupo.titulo} aria-label={`Permissões: ${grupo.titulo}`}
          className="space-y-2 rounded-xl border border-brand-green/15 bg-brand-darkgreen/[0.04] p-3 sm:p-4">
          <header><h3 className="text-sm font-semibold text-brand-neon">{grupo.titulo}</h3>
            <p className="mt-0.5 text-xs text-foreground/55">{grupo.descricao}</p></header>
          <div className="grid gap-2 sm:grid-cols-2">
            {OPERACOES_CONTRATO.filter(operacao => (grupo.chaves as readonly string[]).includes(operacao.chave))
              .map(({ chave, rotulo }) => <label key={chave}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-brand-green/15 bg-background/40 px-3 py-2 text-xs transition-colors hover:border-brand-green/45 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-neon">
                <input type="checkbox" checked={perfil === "COLABORADOR" && chave === "editarContrato" ? false : selecionadas[chave]} disabled={salvando || submetendo || (perfil === "COLABORADOR" && chave === "editarContrato")}
                  onChange={e => { setSelecionadas(v => ({ ...v, [chave]: e.target.checked })); }}
                  className="h-4 w-4 shrink-0 accent-brand-green" />
                <span className="min-w-0">{rotulo}</span>
              </label>)}
          </div>
        </section>)}
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
