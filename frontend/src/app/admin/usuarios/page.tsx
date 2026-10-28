"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  atualizarFuncionario, cadastrarFuncionario, consultarMeuPerfil, consultarUsuariosPaginados,
  alterarEmailFuncionario, redefinirSenhaFuncionario, listarContratosAdministracao,
  listarPermissoesFuncionario, concederPermissaoFuncionario, revogarPermissaoFuncionario,
  ErroApi, type PerfilFuncionario, type AtualizarFuncionario,
  type MeuPerfil, type UsuarioPublico, type PaginaUsuarios,
  type ContratoResumo, type PermissaoFuncionario,
} from "@/lib/admin-usuarios";

const nomeCompleto = z.string().min(3, "Informe nome e sobrenome.").max(160, "Nome muito longo.")
  .regex(/^\p{L}[\p{L}\p{M}'’.-]*(?:[ \t]+\p{L}[\p{L}\p{M}'’.-]*)+$/u,
    "Informe nome e sobrenome válidos.");
const regraSenha = z.string().min(12, "A senha precisa ter ao menos 12 caracteres.")
  .max(128, "A senha deve ter no máximo 128 caracteres.")
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$/,
    "Use maiúscula, minúscula, número e símbolo.");
const cadastroSchema = z.object({
  nome: nomeCompleto,
  email: z.email("Informe um e-mail válido.").max(320, "E-mail muito longo."),
  perfil: z.enum(["GESTOR", "COLABORADOR"]),
  senhaInicial: regraSenha,
  confirmarSenha: z.string(),
}).refine((data) => data.senhaInicial === data.confirmarSenha, {
  message: "As senhas não coincidem.", path: ["confirmarSenha"],
});
const inicial = { nome: "", email: "", perfil: "COLABORADOR" as PerfilFuncionario, senhaInicial: "", confirmarSenha: "" };

type Campo = "nome" | "email" | "perfil" | "senhaInicial" | "confirmarSenha";
type Erros = Partial<Record<Campo, string>>;
const botao = "rounded-lg border border-brand-green/40 px-3 py-2 text-sm hover:bg-brand-green/10 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand-green";
const campo = "w-full min-w-0 rounded-lg border border-brand-green/30 bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-brand-green";
const acao = "rounded-lg bg-brand-green px-4 py-2.5 font-semibold text-background disabled:opacity-50";

function erroLegivel(erro: unknown): string {
  return erro instanceof ErroApi ? erro.message : "Não foi possível comunicar com o servidor. Tente novamente.";
}
function dataBR(data: string): string {
  const d = new Date(data); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}
function nomePerfil(p: UsuarioPublico["perfil"]): string {
  return p === "ADMINISTRADOR" ? "Administrador" : p === "GESTOR" ? "Gestor" : "Colaborador";
}

export default function AdministracaoUsuariosPage() {
  const router = useRouter();
  const painelRef = useRef<HTMLElement>(null);
  const usuarioSelecionado = useRef<string | null>(null);
  const nomeRef = useRef<HTMLInputElement>(null);
  const [carregando, setCarregando] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [erroAcesso, setErroAcesso] = useState("");
  const [minhaConta, setMinhaConta] = useState<MeuPerfil | null>(null);
  const [aba, setAba] = useState<"ativos" | "arquivados">("ativos");
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [lista, setLista] = useState<PaginaUsuarios>({ itens: [], pagina: 1, limite: 20, total: 0, totalPaginas: 1 });
  const [quantidades, setQuantidades] = useState({ ativos: 0, arquivados: 0 });
  const [erroLista, setErroLista] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [editando, setEditando] = useState<UsuarioPublico | null>(null);
  const [form, setForm] = useState({ ...inicial });
  const [edicao, setEdicao] = useState({ nome: "", perfil: "GESTOR" as PerfilFuncionario, ativo: true });
  const [erros, setErros] = useState<Erros>({});
  const [mensagem, setMensagem] = useState("");
  const [erroFormulario, setErroFormulario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [emailNovo, setEmailNovo] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [senhaConfirmada, setSenhaConfirmada] = useState("");
  const [contratos, setContratos] = useState<ContratoResumo[]>([]);
  const [permissoes, setPermissoes] = useState<PermissaoFuncionario[]>([]);
  const [contratoId, setContratoId] = useState("");
  const [podeEditar, setPodeEditar] = useState(false);
  const [erroPermissoes, setErroPermissoes] = useState("");

  const cuidarSessao = useCallback((erro: unknown) => {
    if (erro instanceof ErroApi && erro.status === 401) { router.replace("/login"); return true; }
    if (erro instanceof ErroApi && erro.status === 403) {
      setAutorizado(false); setErroAcesso("Acesso administrativo negado."); return true;
    }
    return false;
  }, [router]);

  const carregarLista = useCallback(async (a: "ativos" | "arquivados", p: number, termo: string) => {
    const ativa = a === "ativos";
    const [paginaDados, ativos, arquivados] = await Promise.all([
      consultarUsuariosPaginados({ ativo: ativa, pagina: p, busca: termo }),
      consultarUsuariosPaginados({ ativo: true, pagina: 1, limite: 1 }),
      consultarUsuariosPaginados({ ativo: false, pagina: 1, limite: 1 }),
    ]);
    setLista(paginaDados);
    setQuantidades({ ativos: ativos.total, arquivados: arquivados.total });
  }, []);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const perfil = await consultarMeuPerfil();
        if (!vivo) return;
        if (!perfil.ativo || perfil.perfil !== "ADMINISTRADOR") {
          setErroAcesso("Você não tem permissão para acessar a administração de usuários."); return;
        }
        setMinhaConta(perfil);
        await carregarLista("ativos", 1, "");
        if (vivo) setAutorizado(true);
      } catch (erro) {
        if (vivo) { if (!cuidarSessao(erro)) setErroAcesso(erroLegivel(erro)); }
      } finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [carregarLista, cuidarSessao]);

  async function recarregar(a = aba, p = pagina, q = filtro) {
    setAtualizando(true); setErroLista("");
    try { await carregarLista(a, p, q); }
    catch (e) { if (!cuidarSessao(e)) setErroLista(`${erroLegivel(e)} A lista pode estar desatualizada.`); }
    finally { setAtualizando(false); }
  }

  function trocarAba(nova: "ativos" | "arquivados") {
    setAba(nova); setPagina(1); void recarregar(nova, 1, filtro);
  }
  function pesquisar(evento: FormEvent) {
    evento.preventDefault(); setFiltro(busca.trim()); setPagina(1); void recarregar(aba, 1, busca.trim());
  }
  function mudarPagina(nova: number) {
    setPagina(nova); void recarregar(aba, nova, filtro);
  }

  function cancelar() {
    usuarioSelecionado.current = null;
    setEditando(null); setForm({ ...inicial }); setErroFormulario(""); setErros({});
    setEmailNovo(""); setSenhaNova(""); setSenhaConfirmada(""); setMensagem("");
    setPermissoes([]); setErroPermissoes("");
  }
  function iniciarEdicao(u: UsuarioPublico) {
    usuarioSelecionado.current = u.id;
    setEditando(u);
    setEdicao({ nome: u.nome ?? "", perfil: u.perfil === "ADMINISTRADOR" ? "GESTOR" : u.perfil, ativo: u.ativo });
    setEmailNovo(u.email); setSenhaNova(""); setSenhaConfirmada("");
    setErroFormulario(""); setMensagem(""); setErros({}); setErroPermissoes("");
    if (u.perfil !== "ADMINISTRADOR") {
      void Promise.all([listarPermissoesFuncionario(u.id), listarContratosAdministracao()])
        .then(([p, c]) => { if (usuarioSelecionado.current === u.id) { setPermissoes(p); setContratos(c); setContratoId(c[0]?.id ?? ""); } })
        .catch((e) => { if (usuarioSelecionado.current === u.id && !cuidarSessao(e)) setErroPermissoes(erroLegivel(e)); });
    }
  }
  useEffect(() => {
    if (!editando) return;
    if (typeof painelRef.current?.scrollIntoView === "function") {
      const reduzido = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
      painelRef.current.scrollIntoView({ block: "start", behavior: reduzido ? "auto" : "smooth" });
    }
    nomeRef.current?.focus();
  }, [editando]);

  async function cadastrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); if (enviando) return;
    setErroFormulario(""); setMensagem("");
    const valido = cadastroSchema.safeParse({
      ...form, nome: form.nome.trim().replace(/\s+/g, " "), email: form.email.trim().toLowerCase(),
    });
    if (!valido.success) {
      const novos: Erros = {};
      for (const e of valido.error.issues) { const k = e.path[0] as Campo; if (k && !novos[k]) novos[k] = e.message; }
      setErros(novos); return;
    }
    setErros({}); setEnviando(true);
    try {
      const criado = await cadastrarFuncionario({
        nome: valido.data.nome, email: valido.data.email, perfil: valido.data.perfil,
        senhaInicial: valido.data.senhaInicial,
      });
      setForm({ ...inicial }); setMensagem(`Funcionário ${criado.email} cadastrado com sucesso.`);
      setAba("ativos"); setPagina(1); await recarregar("ativos", 1, filtro);
    } catch (e) { if (!cuidarSessao(e)) setErroFormulario(erroLegivel(e)); }
    finally { setEnviando(false); }
  }

  async function salvarEdicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); if (!editando || enviando) return;
    const nome = edicao.nome.trim().replace(/\s+/g, " ");
    const dados: AtualizarFuncionario = {};
    if (nome !== (editando.nome ?? "")) {
      const validacao = nomeCompleto.safeParse(nome);
      if (!validacao.success) { setErroFormulario(validacao.error.issues[0]?.message ?? "Nome inválido."); return; }
      dados.nome = validacao.data;
    }
    if (editando.perfil !== "ADMINISTRADOR") {
      if (editando.perfil !== edicao.perfil) dados.perfil = edicao.perfil;
      if (editando.ativo !== edicao.ativo) dados.ativo = edicao.ativo;
    }
    if (!Object.keys(dados).length) { setErroFormulario("Nenhuma alteração informada."); return; }
    setEnviando(true); setErroFormulario("");
    try {
      const atualizado = await atualizarFuncionario(editando.id, dados);
      if (atualizado.id === minhaConta?.id) {
        setMinhaConta((u) => u ? { ...u, nome: atualizado.nome } : u);
        window.dispatchEvent(new Event("perfil-atualizado"));
      }
      setMensagem(`Dados de ${atualizado.email} atualizados.`); usuarioSelecionado.current = null; setEditando(null);
      await recarregar(aba, 1, filtro); setPagina(1);
    } catch (e) { if (!cuidarSessao(e)) setErroFormulario(erroLegivel(e)); }
    finally { setEnviando(false); }
  }

  async function trocarEstado(u: UsuarioPublico) {
    if (u.perfil === "ADMINISTRADOR") return;
    if (!window.confirm(`Deseja ${u.ativo ? "arquivar" : "reativar"} ${u.email}?`)) return;
    setAtualizando(true); setErroLista("");
    try {
      await atualizarFuncionario(u.id, { ativo: !u.ativo });
      setMensagem(`Conta ${u.email} ${u.ativo ? "arquivada" : "reativada"}.`);
      if (editando?.id === u.id) cancelar();
      await carregarLista(aba, 1, filtro); setPagina(1);
    } catch (e) { if (!cuidarSessao(e)) setErroLista(erroLegivel(e)); }
    finally { setAtualizando(false); }
  }

  async function salvarEmail(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); if (!editando || enviando || editando.perfil === "ADMINISTRADOR") return;
    setEnviando(true); setErroFormulario("");
    try {
      const atualizado = await alterarEmailFuncionario(editando.id, emailNovo.trim().toLowerCase());
      setEditando(atualizado); setMensagem("E-mail atualizado no sistema e no SuperTokens.");
      await recarregar();
    } catch (e) { if (!cuidarSessao(e)) setErroFormulario(erroLegivel(e)); }
    finally { setEnviando(false); }
  }

  async function salvarSenha(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); if (!editando || enviando || editando.perfil === "ADMINISTRADOR") return;
    const validacao = regraSenha.safeParse(senhaNova);
    if (!validacao.success) { setErroFormulario(validacao.error.issues[0]?.message ?? "Senha inválida."); return; }
    if (senhaNova !== senhaConfirmada) { setErroFormulario("As senhas não coincidem."); return; }
    setEnviando(true); setErroFormulario("");
    try {
      await redefinirSenhaFuncionario(editando.id, validacao.data);
      setSenhaNova(""); setSenhaConfirmada("");
      setMensagem("Nova senha definida. Informe-a ao funcionário por canal seguro.");
    } catch (e) { if (!cuidarSessao(e)) setErroFormulario(erroLegivel(e)); }
    finally { setEnviando(false); }
  }

  async function salvarPermissao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); if (!editando || !contratoId || enviando) return;
    setEnviando(true); setErroPermissoes("");
    try {
      await concederPermissaoFuncionario(editando.id, {
        contratoId, podeEditar: editando.perfil === "GESTOR" && podeEditar,
      });
      setPermissoes(await listarPermissoesFuncionario(editando.id));
      setMensagem("Permissão de contrato salva.");
    } catch (e) { if (!cuidarSessao(e)) setErroPermissoes(erroLegivel(e)); }
    finally { setEnviando(false); }
  }
  async function revogar(contrato: string) {
    if (!editando || enviando) return;
    if (!window.confirm("Revogar acesso a este contrato?")) return;
    setEnviando(true); setErroPermissoes("");
    try {
      await revogarPermissaoFuncionario(editando.id, contrato);
      setPermissoes((atual) => atual.filter((p) => p.contratoId !== contrato));
      setMensagem("Permissão revogada.");
    } catch (e) { if (!cuidarSessao(e)) setErroPermissoes(erroLegivel(e)); }
    finally { setEnviando(false); }
  }

  if (carregando) return <main role="status" className="min-h-screen flex items-center justify-center p-6">Verificando permissões e carregando funcionários...</main>;
  if (!autorizado) return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Acesso restrito</h1>
      <p role="alert">{erroAcesso || "Não foi possível verificar sua autorização."}</p>
      <Link href="/dashboard" className="underline">Voltar ao painel</Link>
    </main>
  );

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-sm text-brand-neon underline">← Voltar ao painel</Link>
            <h1 className="mt-3 text-2xl font-bold">Administração de funcionários</h1>
            <p className="text-sm text-foreground/70">Cadastre, edite e gerencie acessos. Contas arquivadas mantêm seus registros.</p>
          </div>
          {minhaConta && <div className="min-w-0 text-left text-sm md:text-right" aria-label="Administrador autenticado">
            <p className="font-semibold break-words">{minhaConta.nome?.trim() || "Nome não informado"}</p>
            <p className="text-foreground/70 break-all">{minhaConta.email}</p>
            <p className="text-brand-neon">Administrador</p>
          </div>}
        </header>
        {mensagem && <p role="status" className="rounded-lg border border-brand-green/30 px-4 py-2 text-brand-neon">{mensagem}</p>}
        {/* B2: lista acima e painel único de cadastro/edição abaixo em todas as larguras. */}
        <div className="flex flex-col gap-5">
          <section className="min-w-0 rounded-2xl border border-brand-green/20 p-4 md:p-6" aria-labelledby="titulo-lista">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="titulo-lista" className="text-lg font-semibold">Funcionários</h2>
              <button type="button" className={botao} onClick={() => void recarregar()} disabled={atualizando}>{atualizando ? "Atualizando..." : "Atualizar lista"}</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Situação dos funcionários">
              <button type="button" onClick={() => trocarAba("ativos")} aria-pressed={aba === "ativos"} className={botao + (aba === "ativos" ? " border-brand-green bg-brand-green/10" : "")}>Ativos ({quantidades.ativos})</button>
              <button type="button" onClick={() => trocarAba("arquivados")} aria-pressed={aba === "arquivados"} className={botao + (aba === "arquivados" ? " border-brand-green bg-brand-green/10" : "")}>Arquivados ({quantidades.arquivados})</button>
            </div>
            <form className="mt-4 flex flex-wrap gap-2" onSubmit={pesquisar} role="search">
              <label htmlFor="buscar-funcionario" className="sr-only">Buscar funcionário por nome ou e-mail</label>
              <input id="buscar-funcionario" className={campo + " min-w-[12rem] flex-1"} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou e-mail" maxLength={160} />
              <button type="submit" className={botao}>Buscar</button>
              <button type="button" className={botao} onClick={() => { setBusca(""); setFiltro(""); setPagina(1); void recarregar(aba, 1, ""); }}>Limpar</button>
            </form>
            {erroLista && <p role="alert" className="mt-3 text-sm text-red-400">{erroLista}</p>}
            <p className="mt-3 text-xs text-foreground/65">{lista.total} resultados · Página {lista.pagina} de {lista.totalPaginas}</p>
            {lista.itens.length === 0 ? <p className="mt-5 text-sm text-foreground/70">Nenhum funcionário nesta consulta.</p> : (
              <ul className="mt-3 space-y-3">
                {lista.itens.map((u) => (
                  <li key={u.id} className="min-w-0 rounded-xl border border-brand-green/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold break-words">{u.nome || "Nome não informado"}</p>
                        <p className="text-sm text-foreground/70 break-all">{u.email}</p>
                        <p className="mt-1 text-xs text-foreground/65">{nomePerfil(u.perfil)} · {u.ativo ? "Ativo" : "Arquivado"} · {dataBR(u.criadoEm)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(u.perfil !== "ADMINISTRADOR" || u.id === minhaConta?.id) && <button type="button" className={botao} onClick={() => iniciarEdicao(u)} aria-label={`Editar ${u.email}`}>Editar</button>}
                        {u.perfil !== "ADMINISTRADOR" && <button type="button" className={botao} onClick={() => void trocarEstado(u)}>{u.ativo ? "Arquivar" : "Reativar"}</button>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex items-center gap-3">
              <button type="button" className={botao} disabled={atualizando || pagina <= 1} onClick={() => mudarPagina(pagina - 1)}>Anterior</button>
              <span className="text-sm" aria-live="polite">{pagina}/{lista.totalPaginas}</span>
              <button type="button" className={botao} disabled={atualizando || pagina >= lista.totalPaginas} onClick={() => mudarPagina(pagina + 1)}>Próxima</button>
            </div>
          </section>

          <section ref={painelRef} className="min-w-0 space-y-5 rounded-2xl border border-brand-green/20 p-4 md:p-6" aria-labelledby="titulo-formulario">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="titulo-formulario" className="text-lg font-semibold">{editando ? `Editar funcionário — ${editando.nome || "Nome não informado"}` : "Cadastrar funcionário"}</h2>
              {editando && <button type="button" className={botao} onClick={cancelar}>Cancelar edição</button>}
            </div>
            {erroFormulario && <p role="alert" className="text-sm text-red-400">{erroFormulario}</p>}
            {editando ? (
              <>
                <p className="break-all text-sm text-foreground/70">Conta: {editando.email}</p>
                <form className="space-y-4" noValidate onSubmit={(e) => void salvarEdicao(e)}>
                  <div>
                    <label htmlFor="edicao-nome" className="mb-1 block text-sm">Nome completo (edição)</label>
                    <input ref={nomeRef} id="edicao-nome" className={campo} value={edicao.nome} onChange={(e) => setEdicao((s) => ({ ...s, nome: e.target.value }))} maxLength={160} aria-describedby="aviso-nome-legado" />
                    {!editando.nome && <p id="aviso-nome-legado" className="text-xs text-foreground/60">Nome legado opcional nesta edição. Ao preencher, informe nome e sobrenome.</p>}
                  </div>
                  {editando.perfil !== "ADMINISTRADOR" && <>
                    <div>
                      <label htmlFor="edicao-perfil" className="mb-1 block text-sm">Perfil (edição)</label>
                      <select id="edicao-perfil" className={campo} value={edicao.perfil} onChange={(e) => setEdicao((s) => ({ ...s, perfil: e.target.value as PerfilFuncionario }))}><option value="GESTOR">Gestor</option><option value="COLABORADOR">Colaborador</option></select>
                    </div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edicao.ativo} onChange={(e) => setEdicao((s) => ({ ...s, ativo: e.target.checked }))} />Conta ativa (desmarque para inativar)</label>
                  </>}
                  <button type="submit" disabled={enviando} className={acao}>{enviando ? "Salvando..." : "Salvar alterações"}</button>
                </form>
                {editando.perfil !== "ADMINISTRADOR" && <>
                  <div className="border-t border-brand-green/20 pt-4">
                    <h3 className="font-semibold">Alterar e-mail da conta</h3>
                    <form onSubmit={(e) => void salvarEmail(e)} className="mt-3 space-y-3">
                      <label htmlFor="edicao-email" className="block text-sm">Novo e-mail</label>
                      <input id="edicao-email" type="email" className={campo} value={emailNovo} maxLength={320} required onChange={(e) => setEmailNovo(e.target.value)} />
                      <button className={botao} type="submit" disabled={enviando || emailNovo.trim().toLowerCase() === editando.email}>Atualizar e-mail</button>
                    </form>
                  </div>
                  <div className="border-t border-brand-green/20 pt-4">
                    <h3 className="font-semibold">Definir nova senha</h3>
                    <p className="text-xs text-foreground/65">A senha atual nunca é exibida. 12 a 128 caracteres, com maiúscula, minúscula, número e símbolo.</p>
                    <form onSubmit={(e) => void salvarSenha(e)} className="mt-3 space-y-3">
                      <label htmlFor="nova-senha" className="block text-sm">Nova senha</label>
                      <input id="nova-senha" type="password" autoComplete="new-password" className={campo} value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} />
                      <label htmlFor="confirmar-nova-senha" className="block text-sm">Confirmar nova senha</label>
                      <input id="confirmar-nova-senha" type="password" autoComplete="new-password" className={campo} value={senhaConfirmada} onChange={(e) => setSenhaConfirmada(e.target.value)} />
                      <button className={botao} type="submit" disabled={enviando}>Definir nova senha</button>
                    </form>
                  </div>
                  <div className="border-t border-brand-green/20 pt-4">
                    <h3 className="font-semibold">Permissões por contrato</h3>
                    {erroPermissoes && <p role="alert" className="text-sm text-red-400">{erroPermissoes}</p>}
                    <ul className="mt-2 space-y-2 text-sm">
                      {permissoes.map((v) => <li key={v.contratoId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-green/20 p-2">
                        <span className="min-w-0 flex-1 break-words">{contratos.find((c) => c.id === v.contratoId)?.numeroContrato ?? v.contratoId} — {v.podeEditar ? "Pode editar" : "Somente leitura"}</span>
                        <button type="button" className={botao} disabled={enviando} onClick={() => void revogar(v.contratoId)}>Revogar</button>
                      </li>)}
                      {!permissoes.length && <li className="text-foreground/60">Sem vínculos cadastrados.</li>}
                    </ul>
                    <form onSubmit={(e) => void salvarPermissao(e)} className="mt-3 space-y-3">
                      <label htmlFor="contrato-permissao" className="block text-sm">Contrato existente</label>
                      <select id="contrato-permissao" className={campo} value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
                        {contratos.map((c) => <option value={c.id} key={c.id}>{c.numeroContrato} — {c.orgaoContratante}</option>)}
                      </select>
                      {editando.perfil === "GESTOR" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={podeEditar} onChange={(e) => setPodeEditar(e.target.checked)} />Pode editar contrato</label>}
                      <button type="submit" disabled={enviando || !contratoId || !editando.ativo} className={botao}>Conceder / atualizar vínculo</button>
                    </form>
                  </div>
                </>}
              </>
            ) : (
              <form onSubmit={(e) => void cadastrar(e)} noValidate className="space-y-4">
                <div><label htmlFor="usuario-nome" className="mb-1 block text-sm">Nome completo</label>
                  <input id="usuario-nome" className={campo} value={form.nome} onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))} aria-invalid={!!erros.nome} maxLength={160} />
                  {erros.nome && <p role="alert" className="text-xs text-red-400">{erros.nome}</p>}
                </div>
                <div><label htmlFor="usuario-email" className="mb-1 block text-sm">E-mail</label>
                  <input id="usuario-email" type="email" className={campo} value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} aria-invalid={!!erros.email} maxLength={320} />
                  {erros.email && <p role="alert" className="text-xs text-red-400">{erros.email}</p>}
                </div>
                <div><label htmlFor="usuario-perfil" className="mb-1 block text-sm">Perfil</label>
                  <select id="usuario-perfil" className={campo} value={form.perfil} onChange={(e) => setForm((s) => ({ ...s, perfil: e.target.value as PerfilFuncionario }))}><option value="GESTOR">Gestor</option><option value="COLABORADOR">Colaborador</option></select>
                </div>
                <div><label htmlFor="usuario-senha" className="mb-1 block text-sm">Senha inicial</label>
                  <input id="usuario-senha" type="password" autoComplete="new-password" className={campo} value={form.senhaInicial} onChange={(e) => setForm((s) => ({ ...s, senhaInicial: e.target.value }))} aria-invalid={!!erros.senhaInicial} />
                  {erros.senhaInicial && <p role="alert" className="text-xs text-red-400">{erros.senhaInicial}</p>}
                </div>
                <div><label htmlFor="usuario-confirmacao" className="mb-1 block text-sm">Confirmar senha</label>
                  <input id="usuario-confirmacao" type="password" autoComplete="new-password" className={campo} value={form.confirmarSenha} onChange={(e) => setForm((s) => ({ ...s, confirmarSenha: e.target.value }))} aria-invalid={!!erros.confirmarSenha} />
                  {erros.confirmarSenha && <p role="alert" className="text-xs text-red-400">{erros.confirmarSenha}</p>}
                </div>
                <button className={acao + " w-full"} type="submit" disabled={enviando}>{enviando ? "Cadastrando..." : "Cadastrar funcionário"}</button>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
