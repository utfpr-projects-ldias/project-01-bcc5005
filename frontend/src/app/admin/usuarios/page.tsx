"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  atualizarFuncionario,
  cadastrarFuncionario,
  consultarMeuPerfil,
  ErroApi,
  listarUsuarios,
  type PerfilFuncionario,
  type AtualizarFuncionario,
  type MeuPerfil,
  type UsuarioPublico,
} from "@/lib/admin-usuarios";

const nomeCompleto = z.string().min(3, "Informe nome e sobrenome.").max(160, "Nome muito longo.")
  .regex(/^\p{L}[\p{L}\p{M}'’.-]*(?:[ \t]+\p{L}[\p{L}\p{M}'’.-]*)+$/u,
    "Informe nome e sobrenome válidos.");

const schema = z.object({
  nome: nomeCompleto,
  email: z.string().email("Informe um e-mail válido.").max(320, "E-mail muito longo."),
  perfil: z.enum(["GESTOR", "COLABORADOR"]),
  senhaInicial: z.string().min(12, "A senha precisa ter ao menos 12 caracteres.")
    .max(128, "A senha deve ter no máximo 128 caracteres.")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$/,
      "Use maiúscula, minúscula, número e símbolo."),
  confirmarSenha: z.string(),
}).refine((dados) => dados.senhaInicial === dados.confirmarSenha, {
  message: "As senhas não coincidem.", path: ["confirmarSenha"],
});

type Campo = "nome" | "email" | "perfil" | "senhaInicial" | "confirmarSenha";
type Erros = Partial<Record<Campo, string>>;

const inicialmente = { nome: "", email: "", perfil: "COLABORADOR" as PerfilFuncionario, senhaInicial: "", confirmarSenha: "" };

function dataDeCriacao(data: string): string {
  const valor = new Date(data);
  return Number.isNaN(valor.getTime()) ? "—" : valor.toLocaleDateString("pt-BR");
}

export default function AdministracaoUsuariosPage() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [erroAcesso, setErroAcesso] = useState("");
  const [erroLista, setErroLista] = useState("");
  const [usuarios, setUsuarios] = useState<UsuarioPublico[]>([]);
  const [minhaConta, setMinhaConta] = useState<MeuPerfil | null>(null);
  const [editando, setEditando] = useState<UsuarioPublico | null>(null);
  const [edicao, setEdicao] = useState({ nome: "", perfil: "GESTOR" as PerfilFuncionario, ativo: true });
  const [erroEdicao, setErroEdicao] = useState("");
  const [mensagemEdicao, setMensagemEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [formulario, setFormulario] = useState({ ...inicialmente });
  const [erros, setErros] = useState<Erros>({});
  const [erroCadastro, setErroCadastro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const tratarErro = useCallback((erro: unknown, aoCarregar = false) => {
    if (erro instanceof ErroApi && erro.status === 401) {
      router.replace("/login");
      return;
    }
    if (erro instanceof ErroApi && erro.status === 403) {
      setAutorizado(false);
      setErroAcesso("Você não tem permissão para acessar a administração de usuários.");
      return;
    }
    const mensagemErro = erro instanceof ErroApi ? erro.message : "Falha de conexão com o servidor. Tente novamente.";
    if (aoCarregar) setErroLista(mensagemErro);
    else setErroCadastro(mensagemErro);
  }, [router]);

  useEffect(() => {
    let ativo = true;
    async function iniciar() {
      try {
        const perfil = await consultarMeuPerfil();
        if (!ativo) return;
        if (!perfil.ativo || perfil.perfil !== "ADMINISTRADOR") {
          setErroAcesso("Você não tem permissão para acessar a administração de usuários.");
          return;
        }
        setAutorizado(true);
        setMinhaConta(perfil);
        const lista = await listarUsuarios();
        if (!ativo) return;
        setUsuarios(lista);
        setAutorizado(true);
      } catch (erro) {
        if (ativo) tratarErro(erro, true);
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void iniciar();
    return () => { ativo = false; };
  }, [tratarErro]);

  async function atualizarLista() {
    if (atualizando || !autorizado) return;
    setAtualizando(true);
    setErroLista("");
    try {
      setUsuarios(await listarUsuarios());
    } catch (erro) {
      tratarErro(erro, true);
    } finally {
      setAtualizando(false);
    }
  }

  async function cadastrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando || !autorizado) return;
    setErroCadastro("");
    setMensagem("");
    const validacao = schema.safeParse({
      ...formulario,
      nome: formulario.nome.trim().replace(/\s+/g, " "),
      email: formulario.email.trim().toLowerCase(),
    });
    if (!validacao.success) {
      const novosErros: Erros = {};
      for (const issue of validacao.error.issues) {
        const campo = issue.path[0] as Campo;
        if (campo && !novosErros[campo]) novosErros[campo] = issue.message;
      }
      setErros(novosErros);
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      const criado = await cadastrarFuncionario({
        nome: validacao.data.nome,
        email: validacao.data.email,
        perfil: validacao.data.perfil,
        senhaInicial: validacao.data.senhaInicial,
      });
      // Somente dados públicos retornados pela API. Não armazenar senhas.
      setUsuarios((atual) => [criado, ...atual.filter((pessoa) => pessoa.id !== criado.id)]);
      setFormulario({ ...inicialmente });
      setMensagem(`Funcionário ${criado.email} cadastrado com sucesso.`);
    } catch (erro) {
      tratarErro(erro);
    } finally {
      setEnviando(false);
    }
  }

  function iniciarEdicao(usuario: UsuarioPublico) {
    setEditando(usuario);
    setEdicao({ nome: usuario.nome ?? "", perfil: usuario.perfil === "ADMINISTRADOR" ? "GESTOR" : usuario.perfil, ativo: usuario.ativo });
    setErroEdicao("");
    setMensagemEdicao("");
    setMensagem("");
  }

  async function salvarEdicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!editando || !autorizado || salvandoEdicao) return;
    setErroEdicao("");
    const nome = edicao.nome.trim().replace(/\s+/g, " ");
    const valido = nomeCompleto.safeParse(nome);
    if (!valido.success) {
      setErroEdicao(valido.error.issues[0]?.message ?? "Nome inválido.");
      return;
    }
    const dados: AtualizarFuncionario = editando.perfil === "ADMINISTRADOR"
      ? { nome: valido.data }
      : { nome: valido.data, perfil: edicao.perfil, ativo: edicao.ativo };
    setSalvandoEdicao(true);
    try {
      const atualizado = await atualizarFuncionario(editando.id, dados);
      setUsuarios((atual) => atual.map((item) => item.id === atualizado.id ? atualizado : item));
      if (atualizado.id === minhaConta?.id) setMinhaConta((atual) => atual ? { ...atual, nome: atualizado.nome } : atual);
      setMensagemEdicao(`Dados de ${atualizado.email} atualizados.`);
      setEditando(null);
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 401) { router.replace("/login"); }
      else if (erro instanceof ErroApi && erro.status === 403) {
        setErroEdicao("Operação negada. Atualize a página para verificar suas permissões.");
      } else setErroEdicao(erro instanceof ErroApi ? erro.message : "Falha de conexão. Tente novamente.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  if (carregando) return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6" role="status">
      Verificando permissões e carregando funcionários...
    </main>
  );

  if (!autorizado) return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Acesso restrito</h1>
      <p role="alert" className="text-center text-foreground/70">{erroAcesso || erroLista || "Não foi possível verificar sua autorização."}</p>
      <Link href="/dashboard" className="text-brand-neon underline">Voltar ao painel</Link>
    </main>
  );

  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-8 md:px-8 font-sans">
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-sm text-brand-neon hover:underline">← Voltar ao dashboard</Link>
            <h1 className="mt-3 text-2xl font-bold">Administração de funcionários</h1>
            <p className="mt-1 text-sm text-foreground/70">Cadastre e gerencie Gestores e Colaboradores; edite o próprio nome como Administrador.</p>
          </div>
          <span className="rounded-full border border-brand-green/30 px-3 py-1 text-xs font-medium text-brand-neon">Acesso do Administrador</span>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <section className="rounded-2xl border border-brand-green/20 bg-brand-darkgreen/20 p-5 md:p-6" aria-labelledby="titulo-lista">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="titulo-lista" className="text-lg font-semibold">Usuários cadastrados</h2>
                <p className="text-sm text-foreground/60">{usuarios.length} exibidos (até 100 mais recentes)</p>
              </div>
              <button type="button" onClick={() => void atualizarLista()} disabled={atualizando}
                className="rounded-lg border border-brand-green/40 px-4 py-2 text-sm hover:bg-brand-green/10 disabled:opacity-50">
                {atualizando ? "Atualizando..." : "Atualizar lista"}
              </button>
            </div>
            {erroLista && <p role="alert" className="mt-4 text-sm text-red-500">{erroLista}</p>}
            {usuarios.length === 0 ? (
              <p className="mt-6 rounded-lg border border-brand-green/20 p-5 text-sm text-foreground/70">Nenhum usuário encontrado.</p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="border-b border-brand-green/20 text-foreground/60">
                    <tr><th scope="col" className="pb-3 pr-3 font-medium">Nome</th><th scope="col" className="pb-3 pr-3 font-medium">E-mail</th><th scope="col" className="pb-3 pr-3 font-medium">Perfil</th><th scope="col" className="pb-3 pr-3 font-medium">Situação</th><th scope="col" className="pb-3 pr-3 font-medium">Criado em</th><th scope="col" className="pb-3 font-medium">Ações</th></tr>
                  </thead>
                  <tbody>
                    {usuarios.map((usuario) => (
                      <tr key={usuario.id} className="border-b border-brand-green/10 last:border-0">
                        <td className="py-3 pr-3 break-words">{usuario.nome || <span className="text-foreground/60">Nome não informado</span>}</td>
                        <td className="py-3 pr-3 font-medium break-all">{usuario.email}</td>
                        <td className="py-3 pr-3">{usuario.perfil === "ADMINISTRADOR" ? "Administrador" : usuario.perfil === "GESTOR" ? "Gestor" : "Colaborador"}</td>
                        <td className="py-3 pr-3">{usuario.ativo ? "Ativo" : "Inativo"}</td>
                        <td className="py-3 pr-3">{dataDeCriacao(usuario.criadoEm)}</td>
                        <td className="py-3">
                          {(usuario.perfil !== "ADMINISTRADOR" || usuario.id === minhaConta?.id) && (
                            <button type="button" onClick={() => iniciarEdicao(usuario)}
                              aria-label={`Editar ${usuario.email}`}
                              className="rounded-lg border border-brand-green/40 px-3 py-1.5 text-sm hover:bg-brand-green/10">
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-5 text-xs text-foreground/60">Inativar bloqueia o acesso sem apagar o histórico. E-mail e senha não são alterados aqui.</p>
          </section>

          <section className="rounded-2xl border border-brand-green/20 bg-brand-darkgreen/20 p-5 md:p-6" aria-labelledby="titulo-formulario">
            <h2 id="titulo-formulario" className="text-lg font-semibold">Cadastrar funcionário</h2>
            <p className="mt-1 text-sm text-foreground/70">O novo usuário entrará pela mesma tela de login.</p>
            <form onSubmit={(e) => void cadastrar(e)} noValidate className="mt-5 space-y-4">
              <div>
                <label htmlFor="usuario-nome" className="mb-1 block text-sm font-medium">Nome completo</label>
                <input id="usuario-nome" type="text" autoComplete="name" maxLength={160} value={formulario.nome}
                  onChange={(e) => { setFormulario((f) => ({ ...f, nome: e.target.value })); setErros((f) => ({ ...f, nome: undefined })); }}
                  aria-invalid={Boolean(erros.nome)} className="w-full rounded-lg border border-brand-green/30 bg-background px-3 py-2 text-foreground" />
                {erros.nome && <p role="alert" className="mt-1 text-xs text-red-500">{erros.nome}</p>}
              </div>
              <div>
                <label htmlFor="usuario-email" className="mb-1 block text-sm font-medium">E-mail</label>
                <input id="usuario-email" name="email" type="email" autoComplete="off" maxLength={320} value={formulario.email}
                  onChange={(e) => { setFormulario((f) => ({ ...f, email: e.target.value })); setErros((f) => ({ ...f, email: undefined })); }}
                  aria-invalid={Boolean(erros.email)} aria-describedby={erros.email ? "erro-email" : undefined}
                  className="w-full rounded-lg border border-brand-green/30 bg-background px-3 py-2 text-foreground focus:border-brand-green focus:outline-none" />
                {erros.email && <p id="erro-email" role="alert" className="mt-1 text-xs text-red-500">{erros.email}</p>}
              </div>
              <div>
                <label htmlFor="usuario-perfil" className="mb-1 block text-sm font-medium">Perfil</label>
                <select id="usuario-perfil" value={formulario.perfil}
                  onChange={(e) => setFormulario((f) => ({ ...f, perfil: e.target.value as PerfilFuncionario }))}
                  className="w-full rounded-lg border border-brand-green/30 bg-background px-3 py-2 text-foreground focus:border-brand-green focus:outline-none">
                  <option value="GESTOR">Gestor</option>
                  <option value="COLABORADOR">Colaborador</option>
                </select>
              </div>
              <div>
                <label htmlFor="usuario-senha" className="mb-1 block text-sm font-medium">Senha inicial</label>
                <input id="usuario-senha" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={formulario.senhaInicial}
                  onChange={(e) => { setFormulario((f) => ({ ...f, senhaInicial: e.target.value })); setErros((f) => ({ ...f, senhaInicial: undefined })); }}
                  aria-invalid={Boolean(erros.senhaInicial)} aria-describedby={erros.senhaInicial ? "erro-senha" : "ajuda-senha"}
                  className="w-full rounded-lg border border-brand-green/30 bg-background px-3 py-2 text-foreground focus:border-brand-green focus:outline-none" />
                <p id="ajuda-senha" className="mt-1 text-xs text-foreground/60">12 a 128 caracteres; maiúscula, minúscula, número e símbolo.</p>
                {erros.senhaInicial && <p id="erro-senha" role="alert" className="mt-1 text-xs text-red-500">{erros.senhaInicial}</p>}
              </div>
              <div>
                <label htmlFor="usuario-confirmacao" className="mb-1 block text-sm font-medium">Confirmar senha</label>
                <input id="usuario-confirmacao" type="password" autoComplete="new-password" value={formulario.confirmarSenha}
                  onChange={(e) => { setFormulario((f) => ({ ...f, confirmarSenha: e.target.value })); setErros((f) => ({ ...f, confirmarSenha: undefined })); }}
                  aria-invalid={Boolean(erros.confirmarSenha)} aria-describedby={erros.confirmarSenha ? "erro-confirmacao" : undefined}
                  className="w-full rounded-lg border border-brand-green/30 bg-background px-3 py-2 text-foreground focus:border-brand-green focus:outline-none" />
                {erros.confirmarSenha && <p id="erro-confirmacao" role="alert" className="mt-1 text-xs text-red-500">{erros.confirmarSenha}</p>}
              </div>
              {erroCadastro && <p role="alert" className="text-sm text-red-500">{erroCadastro}</p>}
              {mensagem && <p role="status" className="text-sm text-brand-neon">{mensagem}</p>}
              <button type="submit" disabled={enviando} className="w-full rounded-lg bg-brand-green px-4 py-3 font-semibold text-background hover:opacity-90 disabled:opacity-50">
                {enviando ? "Cadastrando..." : "Cadastrar funcionário"}
              </button>
            </form>
          </section>
        </div>
        {mensagemEdicao && <p role="status" className="text-brand-neon">{mensagemEdicao}</p>}
        {editando && (
          <section className="rounded-2xl border border-brand-green/30 bg-brand-darkgreen/20 p-5" aria-labelledby="titulo-edicao">
            <h2 id="titulo-edicao" className="text-lg font-semibold">Editar funcionário: {editando.email}</h2>
            <p className="mt-1 text-xs text-foreground/60">Para Administrador, somente o próprio nome pode ser modificado. As demais contas podem ter perfil e situação alterados.</p>
            <form onSubmit={(evento) => void salvarEdicao(evento)} noValidate className="mt-4 grid max-w-xl gap-4">
              <div>
                <label htmlFor="edicao-nome" className="mb-1 block text-sm font-medium">Nome completo (edição)</label>
                <input id="edicao-nome" value={edicao.nome} maxLength={160} onChange={(e) => setEdicao((anterior) => ({ ...anterior, nome: e.target.value }))}
                  className="w-full rounded-lg border border-brand-green/30 bg-background px-3 py-2" />
              </div>
              {editando.perfil !== "ADMINISTRADOR" && (
                <>
                  <div>
                    <label htmlFor="edicao-perfil" className="mb-1 block text-sm font-medium">Perfil (edição)</label>
                    <select id="edicao-perfil" value={edicao.perfil} onChange={(e) => setEdicao((anterior) => ({ ...anterior, perfil: e.target.value as PerfilFuncionario }))}
                      className="w-full rounded-lg border border-brand-green/30 bg-background px-3 py-2">
                      <option value="GESTOR">Gestor</option>
                      <option value="COLABORADOR">Colaborador</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={edicao.ativo} onChange={(e) => setEdicao((anterior) => ({ ...anterior, ativo: e.target.checked }))} />
                    Conta ativa (desmarque para inativar)
                  </label>
                </>
              )}
              {erroEdicao && <p role="alert" className="text-sm text-red-500">{erroEdicao}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={salvandoEdicao} className="rounded-lg bg-brand-green px-4 py-2 font-semibold text-background disabled:opacity-50">
                  {salvandoEdicao ? "Salvando..." : "Salvar alterações"}
                </button>
                <button type="button" onClick={() => { setEditando(null); setErroEdicao(""); }} className="rounded-lg border border-brand-green/30 px-4 py-2">Cancelar</button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
