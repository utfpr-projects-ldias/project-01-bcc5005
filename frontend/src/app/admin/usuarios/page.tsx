"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  cadastrarFuncionario,
  consultarMeuPerfil,
  ErroApi,
  listarUsuarios,
  type PerfilFuncionario,
  type UsuarioPublico,
} from "@/lib/admin-usuarios";

const schema = z.object({
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

type Campo = "email" | "perfil" | "senhaInicial" | "confirmarSenha";
type Erros = Partial<Record<Campo, string>>;

const inicialmente = { email: "", perfil: "COLABORADOR" as PerfilFuncionario, senhaInicial: "", confirmarSenha: "" };

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
            <p className="mt-1 text-sm text-foreground/70">Cadastre Gestores e Colaboradores e consulte as contas existentes.</p>
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
                <table className="w-full min-w-[490px] text-left text-sm">
                  <thead className="border-b border-brand-green/20 text-foreground/60">
                    <tr><th scope="col" className="pb-3 pr-3 font-medium">E-mail</th><th scope="col" className="pb-3 pr-3 font-medium">Perfil</th><th scope="col" className="pb-3 pr-3 font-medium">Situação</th><th scope="col" className="pb-3 font-medium">Criado em</th></tr>
                  </thead>
                  <tbody>
                    {usuarios.map((usuario) => (
                      <tr key={usuario.id} className="border-b border-brand-green/10 last:border-0">
                        <td className="py-3 pr-3 font-medium break-all">{usuario.email}</td>
                        <td className="py-3 pr-3">{usuario.perfil === "ADMINISTRADOR" ? "Administrador" : usuario.perfil === "GESTOR" ? "Gestor" : "Colaborador"}</td>
                        <td className="py-3 pr-3">{usuario.ativo ? "Ativo" : "Inativo"}</td>
                        <td className="py-3">{dataDeCriacao(usuario.criadoEm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-5 text-xs text-foreground/60">Edição de perfis e ativação/inativação dependerão de endpoints administrativos futuros.</p>
          </section>

          <section className="rounded-2xl border border-brand-green/20 bg-brand-darkgreen/20 p-5 md:p-6" aria-labelledby="titulo-formulario">
            <h2 id="titulo-formulario" className="text-lg font-semibold">Cadastrar funcionário</h2>
            <p className="mt-1 text-sm text-foreground/70">O novo usuário entrará pela mesma tela de login.</p>
            <form onSubmit={(e) => void cadastrar(e)} noValidate className="mt-5 space-y-4">
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
      </div>
    </main>
  );
}
