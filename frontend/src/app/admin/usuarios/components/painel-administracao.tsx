"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { MenuLateral, MenuMobile } from "@/app/components/menu-modulos";
import { IndicadorCarregamento } from "@/app/components/indicador-carregamento";
import { ConfirmacaoSimples } from "@/app/components/confirmacao-simples";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  atualizarFuncionario, cadastrarFuncionario, consultarMeuPerfil, consultarUsuariosPaginados, buscarFuncionarioPorId,
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

export function PainelAdministracao({ vista, idEdicao }: { vista: 'lista' | 'cadastro' | 'edicao'; idEdicao?: string }) {
  const router = useRouter();
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
  const [atualizandoVinculo, setAtualizandoVinculo] = useState("");
  const [confirmacao, setConfirmacao] = useState<
    { tipo: "conta"; usuario: UsuarioPublico } | { tipo: "permissao"; contratoId: string; email: string } | null
  >(null);

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
        if (vista === "lista") {
          await carregarLista("ativos", 1, "");
        } else if (vista === "edicao") {
          if (!idEdicao) { setErroAcesso("Funcionário não informado."); return; }
          const alvo = await buscarFuncionarioPorId(idEdicao);
          if (!vivo) return;
          setEditando(alvo);
          setEdicao({ nome: alvo.nome ?? "", perfil: alvo.perfil === "ADMINISTRADOR" ? "GESTOR" : alvo.perfil, ativo: alvo.ativo });
          setEmailNovo(alvo.email);
          if (alvo.perfil !== "ADMINISTRADOR") {
            const [acessos, disponiveis] = await Promise.all([
              listarPermissoesFuncionario(alvo.id), listarContratosAdministracao(),
            ]);
            if (!vivo) return;
            setPermissoes(acessos); setContratos(disponiveis); setContratoId(disponiveis[0]?.id ?? "");
          }
        }
        if (vivo) setAutorizado(true);
      } catch (erro) {
        if (vivo) { if (!cuidarSessao(erro)) setErroAcesso(erroLegivel(erro)); }
      } finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [carregarLista, cuidarSessao, vista, idEdicao]);

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
      router.replace("/admin/usuarios");
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
    if (!Object.keys(dados).length) { setErroFormulario(""); setMensagem("Nenhuma alteração pendente."); return; }
    setEnviando(true); setErroFormulario("");
    try {
      const atualizado = await atualizarFuncionario(editando.id, dados);
      if (atualizado.id === minhaConta?.id) {
        setMinhaConta((u) => u ? { ...u, nome: atualizado.nome } : u);
        window.dispatchEvent(new Event("perfil-atualizado"));
      }
      setMensagem(`Dados de ${atualizado.email} atualizados.`);
      setEditando(atualizado);
      setEdicao({ nome: atualizado.nome ?? "", perfil: atualizado.perfil === "ADMINISTRADOR" ? "GESTOR" : atualizado.perfil, ativo: atualizado.ativo });
    } catch (e) { if (!cuidarSessao(e)) setErroFormulario(erroLegivel(e)); }
    finally { setEnviando(false); }
  }

  async function trocarEstado(u: UsuarioPublico) {
    if (u.perfil === "ADMINISTRADOR") return;
    setAtualizando(true); setErroLista("");
    try {
      await atualizarFuncionario(u.id, { ativo: !u.ativo });
      setMensagem(`Conta ${u.email} ${u.ativo ? "arquivada" : "reativada"}.`);

      await carregarLista(aba, 1, filtro); setPagina(1);
      setConfirmacao(null);
    } catch (e) { setConfirmacao(null); if (!cuidarSessao(e)) setErroLista(erroLegivel(e)); }
    finally { setAtualizando(false); }
  }

  async function salvarEmail(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); if (!editando || enviando || editando.perfil === "ADMINISTRADOR") return;
    setEnviando(true); setErroFormulario("");
    try {
      const atualizado = await alterarEmailFuncionario(editando.id, emailNovo.trim().toLowerCase());
      setEditando(atualizado); setMensagem("E-mail atualizado no sistema e no SuperTokens.");
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

  const contratosLivres = contratos.filter((c) => !permissoes.some((p) => p.contratoId === c.id));
  const contratoSelecionado = contratosLivres.some((c) => c.id === contratoId)
    ? contratoId : (contratosLivres[0]?.id ?? "");

  async function salvarPermissao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); if (!editando || !contratoSelecionado || enviando) return;
    setEnviando(true); setErroPermissoes("");
    try {
      await concederPermissaoFuncionario(editando.id, {
        contratoId: contratoSelecionado, podeEditar: editando.perfil === "GESTOR" && podeEditar,
      });
      setPermissoes(await listarPermissoesFuncionario(editando.id));
      setContratoId(""); setPodeEditar(false);
      setMensagem("Contrato vinculado ao funcionário.");
    } catch (e) { if (!cuidarSessao(e)) setErroPermissoes(erroLegivel(e)); }
    finally { setEnviando(false); }
  }
  async function alternarPermissao(vinculo: PermissaoFuncionario) {
    if (!editando || enviando || atualizandoVinculo || editando.perfil !== "GESTOR") return;
    setAtualizandoVinculo(vinculo.contratoId); setErroPermissoes("");
    try {
      await concederPermissaoFuncionario(editando.id, { contratoId: vinculo.contratoId, podeEditar: !vinculo.podeEditar });
      setPermissoes(await listarPermissoesFuncionario(editando.id));
      setMensagem("Nível de acesso atualizado.");
    } catch (erro) { if (!cuidarSessao(erro)) setErroPermissoes(erroLegivel(erro)); }
    finally { setAtualizandoVinculo(""); }
  }
  async function revogar(contrato: string) {
    if (!editando || enviando) return;
    setEnviando(true); setErroPermissoes("");
    try {
      await revogarPermissaoFuncionario(editando.id, contrato);
      setPermissoes((atual) => atual.filter((p) => p.contratoId !== contrato));
      setMensagem("Permissão revogada.");
      setConfirmacao(null);
    } catch (e) { setConfirmacao(null); if (!cuidarSessao(e)) setErroPermissoes(erroLegivel(e)); }
    finally { setEnviando(false); }
  }

  if (carregando) return <main role="status" className="min-h-screen flex items-center justify-center p-6"><IndicadorCarregamento texto="Verificando acesso à administração..." /></main>;
  if (!autorizado) return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{vista === "edicao" && erroAcesso.includes("não encontrado") ? "Funcionário não encontrado" : "Acesso restrito"}</h1>
      <p role="alert">{erroAcesso || "Não foi possível verificar sua autorização."}</p>
      <Link href={vista === "lista" ? "/dashboard" : "/admin/usuarios"} className="underline">{vista === "lista" ? "Voltar ao painel" : "Voltar à lista de funcionários"}</Link>
    </main>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <MenuLateral />
      <div className="flex min-w-0 flex-1 flex-col">
        <MenuMobile />
        <main className="flex-1 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href={vista === "lista" ? "/dashboard" : "/admin/usuarios"} className="text-sm text-brand-neon underline">← {vista === "lista" ? "Voltar ao painel" : "Voltar aos funcionários"}</Link>
            <h1 className="mt-3 text-2xl font-bold">{vista === "lista" ? "Administração de funcionários" : vista === "cadastro" ? "Cadastrar funcionário" : "Editar funcionário"}</h1>
            <p className="text-sm text-foreground/70">{vista === "lista" ? "Encontre funcionários, consulte seus perfis e administre contas arquivadas." : vista === "cadastro" ? "Crie uma conta interna com dados e senha inicial. O acesso a contratos é atribuído após o cadastro." : "Altere os dados principais. Credenciais e contratos possuem controles separados, abaixo."}</p>
          </div>
          {minhaConta && <div className="min-w-0 text-left text-sm md:text-right" aria-label="Administrador autenticado">
            <p className="font-semibold break-words">{minhaConta.nome?.trim() || "Nome não informado"}</p>
            <p className="text-foreground/70 break-all">{minhaConta.email}</p>
            <p className="text-brand-neon">Administrador</p>
          </div>}
        </header>
        {mensagem && <p role="status" className="rounded-lg border border-brand-green/30 px-4 py-2 text-brand-neon">{mensagem}</p>}
        <div className="flex flex-col gap-5">
          {vista === "lista" && <section className="min-w-0 rounded-2xl border border-brand-green/20 p-4 md:p-6" aria-labelledby="titulo-lista">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="titulo-lista" className="text-lg font-semibold">Funcionários</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={botao} onClick={() => void recarregar()} disabled={atualizando}>{atualizando ? "Atualizando..." : "Atualizar lista"}</button>
                <Link href="/admin/usuarios/novo" className={acao}>Cadastrar funcionário</Link>
              </div>
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
                        {(u.perfil !== "ADMINISTRADOR" || u.id === minhaConta?.id) && <Link className={botao} href={`/admin/usuarios/${encodeURIComponent(u.id)}/editar`} aria-label={`Editar ${u.email}`}>Editar</Link>}
                        {u.perfil !== "ADMINISTRADOR" && <button type="button" className={botao} onClick={() => setConfirmacao({ tipo: "conta", usuario: u })}>{u.ativo ? "Arquivar" : "Reativar"}</button>}
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
          </section>}

          {vista !== "lista" && <section className="mx-auto w-full max-w-3xl min-w-0 space-y-5 rounded-2xl border border-brand-green/20 p-4 md:p-6" aria-labelledby="titulo-formulario">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="titulo-formulario" className="text-lg font-semibold">{editando ? `Editar funcionário — ${editando.nome || "Nome não informado"}` : "Cadastrar funcionário"}</h2>
              {vista === "edicao" && <span className="rounded-full bg-brand-green/10 px-3 py-1 text-xs text-foreground/70">Edição administrativa</span>}
            </div>
            {erroFormulario && <p role="alert" className="text-sm text-red-400">{erroFormulario}</p>}
            {vista === "edicao" && editando ? (
              <>
                <p className="break-all text-sm text-foreground/70">Conta: {editando.email}</p>
                <div className="rounded-xl border border-brand-green/15 bg-brand-darkgreen/10 p-4">
                <h3 className="mb-1 font-semibold">Dados e situação da conta</h3>
                <p className="mb-4 text-xs text-foreground/65">Use Salvar dados somente para nome, perfil e situação. As demais operações são independentes.</p>
                <form className="space-y-4" noValidate onSubmit={(e) => void salvarEdicao(e)}>
                  <div>
                    <label htmlFor="edicao-nome" className="mb-1 block text-sm">Nome completo</label>
                    <input id="edicao-nome" className={campo} value={edicao.nome} onChange={(e) => setEdicao((s) => ({ ...s, nome: e.target.value }))} maxLength={160} aria-describedby="aviso-nome-legado" />
                    {!editando.nome && <p id="aviso-nome-legado" className="text-xs text-foreground/60">Nome legado opcional nesta edição. Ao preencher, informe nome e sobrenome.</p>}
                  </div>
                  {editando.perfil !== "ADMINISTRADOR" && <>
                    <div>
                      <label htmlFor="edicao-perfil" className="mb-1 block text-sm">Perfil de acesso</label>
                      <select id="edicao-perfil" className={campo} value={edicao.perfil} onChange={(e) => setEdicao((s) => ({ ...s, perfil: e.target.value as PerfilFuncionario }))}><option value="GESTOR">Gestor</option><option value="COLABORADOR">Colaborador</option></select>
                    </div>
                    <p className="text-xs text-foreground/65">Situação: {editando.ativo ? "Ativo" : "Arquivado"}. Para arquivar ou reativar, utilize a ação na lista de funcionários, que solicita confirmação.</p>
                  </>}
                  <button type="submit" disabled={enviando} className={acao}>{enviando ? "Salvando..." : "Salvar dados da conta"}</button>
                </form>
                </div>
                {editando.perfil !== "ADMINISTRADOR" && <>
                  <div className="space-y-3" aria-label="Configurações administrativas adicionais">
                    <h3 className="text-base font-semibold">Outras configurações</h3>
                    <p className="text-sm text-foreground/65">Abra apenas a seção que deseja modificar. As alterações são independentes.</p>
                    <details className="group rounded-xl border border-brand-green/20 p-4">
                      <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-brand-green">Alterar e-mail <span className="ml-2 text-xs font-normal text-foreground/60">Credencial de acesso</span></summary>
                      <form onSubmit={(e) => void salvarEmail(e)} className="mt-4 space-y-3">
                        <p className="text-xs text-foreground/65">E-mail atual: {editando.email}</p>
                        <label htmlFor="edicao-email" className="block text-sm">Novo e-mail</label>
                        <input id="edicao-email" type="email" className={campo} value={emailNovo} maxLength={320} required onChange={(e) => setEmailNovo(e.target.value)} />
                        <button className={acao} type="submit" disabled={enviando || emailNovo.trim().toLowerCase() === editando.email}>{enviando ? "Atualizando..." : "Confirmar mudança de e-mail"}</button>
                      </form>
                    </details>
                    <details className="group rounded-xl border border-brand-green/20 p-4">
                      <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-brand-green">Redefinir senha <span className="ml-2 text-xs font-normal text-foreground/60">Operação sensível</span></summary>
                      <form onSubmit={(e) => void salvarSenha(e)} className="mt-4 space-y-3">
                        <p className="text-xs text-foreground/65">A senha anterior nunca é exibida. Use 12–128 caracteres com maiúscula, minúscula, número e símbolo.</p>
                        <label htmlFor="nova-senha" className="block text-sm">Nova senha</label>
                        <input id="nova-senha" type="password" autoComplete="new-password" className={campo} value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} />
                        <label htmlFor="confirmar-nova-senha" className="block text-sm">Confirmar nova senha</label>
                        <input id="confirmar-nova-senha" type="password" autoComplete="new-password" className={campo} value={senhaConfirmada} onChange={(e) => setSenhaConfirmada(e.target.value)} />
                        <button className={acao} type="submit" disabled={enviando}>{enviando ? "Redefinindo..." : "Confirmar redefinição de senha"}</button>
                      </form>
                    </details>
                    <details className="group rounded-xl border border-brand-green/20 p-4" data-testid="acessos-contratuais">
                      <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-brand-green">Acesso aos contratos <span className="ml-2 text-xs font-normal text-foreground/60">{permissoes.length} vínculo(s)</span></summary>
                      <div className="mt-4 space-y-4">
                        <p className="text-sm text-foreground/70">Cada funcionário pode ter acesso a vários contratos. Gestores podem receber edição; colaboradores, apenas leitura. Estes vínculos não alteram o responsável interno do contrato.</p>
                        {erroPermissoes && <p role="alert" className="text-sm text-red-400">{erroPermissoes}</p>}
                        <section aria-label="Contratos vinculados">
                          <h4 className="text-sm font-semibold">Contratos com acesso ({permissoes.length})</h4>
                          <ul className="mt-2 space-y-2 text-sm">
                            {permissoes.map((v) => {
                              const contrato = contratos.find((c) => c.id === v.contratoId);
                              return <li key={v.contratoId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-green/20 p-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium break-words">{contrato ? `${contrato.numeroContrato} — ${contrato.orgaoContratante}` : `Contrato ${v.contratoId}`}</p>
                                  <p className="text-xs text-foreground/65">{v.podeEditar && editando.perfil === "GESTOR" ? "Leitura e edição" : "Somente leitura"}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {editando.perfil === "GESTOR" && <button type="button" className={botao} disabled={enviando || !!atualizandoVinculo || !editando.ativo} onClick={() => void alternarPermissao(v)}>{atualizandoVinculo === v.contratoId ? "Atualizando..." : v.podeEditar ? "Remover edição" : "Permitir edição"}</button>}
                                  <button type="button" className={botao} disabled={enviando || !!atualizandoVinculo} onClick={() => setConfirmacao({ tipo: "permissao", contratoId: v.contratoId, email: editando.email })}>Revogar acesso</button>
                                </div>
                              </li>;
                            })}
                            {!permissoes.length && <li className="rounded-lg border border-dashed border-brand-green/20 p-3 text-foreground/60">Nenhum contrato vinculado.</li>}
                          </ul>
                        </section>
                        <section className="border-t border-brand-green/20 pt-4" aria-label="Conceder novo acesso">
                          <h4 className="text-sm font-semibold">Adicionar acesso</h4>
                          {contratosLivres.length === 0 ? <p className="mt-2 text-sm text-foreground/60">Não há outros contratos disponíveis para vincular. Crie um contrato ou revise os vínculos acima.</p> :
                            <form onSubmit={(e) => void salvarPermissao(e)} className="mt-3 space-y-3">
                              <label htmlFor="contrato-permissao" className="block text-sm">Selecionar contrato ainda não vinculado</label>
                              <select id="contrato-permissao" className={campo} value={contratoSelecionado} onChange={(e) => setContratoId(e.target.value)}>
                                {contratosLivres.map((c) => <option value={c.id} key={c.id}>{c.numeroContrato} — {c.orgaoContratante}</option>)}
                              </select>
                              {editando.perfil === "GESTOR" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={podeEditar} onChange={(e) => setPodeEditar(e.target.checked)} />Permitir também edição</label>}
                              <button type="submit" disabled={enviando || !contratoSelecionado || !editando.ativo} className={acao}>{enviando ? "Vinculando..." : "Adicionar vínculo"}</button>
                            </form>}
                        </section>
                      </div>
                    </details>
                  </div>
                </>}
              </>
            ) : vista === "cadastro" ? (
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
            ) : null}
          </section>}
        </div>
      </div>
      </main>
      </div>
      {confirmacao && <ConfirmacaoSimples
        titulo={confirmacao.tipo === "conta" ? (confirmacao.usuario.ativo ? "Arquivar funcionário?" : "Reativar funcionário?") : "Revogar permissão?"}
        descricao={confirmacao.tipo === "conta"
          ? `A conta ${confirmacao.usuario.email} será ${confirmacao.usuario.ativo ? "inativada e movida para Arquivados" : "reativada"}. O histórico será preservado.`
          : `Remover o acesso de ${confirmacao.email} ao contrato selecionado? O histórico será preservado.`}
        confirmar={confirmacao.tipo === "conta" ? (confirmacao.usuario.ativo ? "Arquivar" : "Reativar") : "Revogar"}
        perigoso={confirmacao.tipo === "permissao" || (confirmacao.tipo === "conta" && confirmacao.usuario.ativo)}
        ocupado={enviando || atualizando}
        onCancelar={() => setConfirmacao(null)}
        onConfirmar={() => {
          if (confirmacao.tipo === "conta") void trocarEstado(confirmacao.usuario);
          else void revogar(confirmacao.contratoId);
        }}
      />}
    </div>
  );
}