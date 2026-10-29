/** Contrato REST de usuários. Sem armazenar tokens ou credenciais no frontend. */
export type PerfilFuncionario = "GESTOR" | "COLABORADOR";
export type PerfilUsuario = "ADMINISTRADOR" | PerfilFuncionario;

export type UsuarioPublico = {
  id: string;
  nome: string | null;
  email: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  criadoEm: string;
};

export type MeuPerfil = Pick<UsuarioPublico, "id" | "nome" | "email" | "perfil" | "ativo">;
export type NovoFuncionario = {
  nome: string;
  email: string;
  perfil: PerfilFuncionario;
  senhaInicial: string;
};
export type AtualizarFuncionario = {
  nome?: string;
  perfil?: PerfilFuncionario;
  ativo?: boolean;
};

export type PaginaUsuarios = { itens: UsuarioPublico[]; pagina: number; limite: number; total: number; totalPaginas: number };
export type PermissaoFuncionario = { contratoId: string; podeEditar: boolean };
export type ContratoResumo = { id: string; numeroContrato: string; orgaoContratante: string; status: string };

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export class ErroApi extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ErroApi";
  }
}

async function requisitar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${API_URL}${caminho}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!resposta.ok) {
    if (resposta.status === 401) throw new ErroApi(401, "Sua sessão expirou. Entre novamente.");
    if (resposta.status === 403) throw new ErroApi(403, "Você não tem permissão para esta operação.");
    if (resposta.status === 404) throw new ErroApi(404, "Usuário não encontrado. Atualize a lista.");
    if (resposta.status === 409) throw new ErroApi(409, init?.method === "POST" ? "Este e-mail já está cadastrado." : "Conflito de dados. Atualize a lista.");
    if (resposta.status === 400) throw new ErroApi(400, "Dados inválidos. Confira os campos e as permissões informadas.");
    throw new ErroApi(resposta.status, "Não foi possível concluir a operação. Tente novamente.");
  }
  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

export function consultarMeuPerfil(): Promise<MeuPerfil> {
  return requisitar<MeuPerfil>("/usuarios/me");
}
export function listarUsuarios(): Promise<UsuarioPublico[]> {
  return requisitar<UsuarioPublico[]>("/admin/usuarios");
}
export function consultarUsuariosPaginados(opcoes: { ativo: boolean; pagina?: number; limite?: number; busca?: string }): Promise<PaginaUsuarios> {
  const busca = new URLSearchParams({
    ativo: String(opcoes.ativo), pagina: String(opcoes.pagina ?? 1),
    limite: String(opcoes.limite ?? 20), busca: opcoes.busca ?? '',
  });
  return requisitar<PaginaUsuarios>(`/admin/usuarios/consulta?${busca.toString()}`);
}
export function buscarFuncionarioPorId(id: string): Promise<UsuarioPublico> {
  return requisitar<UsuarioPublico>(`/admin/usuarios/${encodeURIComponent(id)}`);
}
export function alterarEmailFuncionario(id: string, email: string): Promise<UsuarioPublico> {
  return requisitar<UsuarioPublico>(`/admin/usuarios/${encodeURIComponent(id)}/email`, {
    method: 'PATCH', body: JSON.stringify({ email }),
  });
}
export function redefinirSenhaFuncionario(id: string, novaSenha: string): Promise<void> {
  return requisitar<void>(`/admin/usuarios/${encodeURIComponent(id)}/senha`, {
    method: 'PUT', body: JSON.stringify({ novaSenha }),
  });
}
export function listarPermissoesFuncionario(id: string): Promise<PermissaoFuncionario[]> {
  return requisitar<PermissaoFuncionario[]>(`/admin/usuarios/${encodeURIComponent(id)}/permissoes`);
}
export function concederPermissaoFuncionario(id: string, dados: PermissaoFuncionario): Promise<PermissaoFuncionario> {
  return requisitar<PermissaoFuncionario>(`/admin/usuarios/${encodeURIComponent(id)}/permissoes`, {
    method: 'PUT', body: JSON.stringify(dados),
  });
}
export function revogarPermissaoFuncionario(id: string, contratoId: string): Promise<void> {
  return requisitar<void>(`/admin/usuarios/${encodeURIComponent(id)}/permissoes/${encodeURIComponent(contratoId)}`, { method: 'DELETE' });
}
export function listarContratosAdministracao(): Promise<ContratoResumo[]> {
  return requisitar<ContratoResumo[]>('/contratos');
}
export function cadastrarFuncionario(dados: NovoFuncionario): Promise<UsuarioPublico> {
  return requisitar<UsuarioPublico>("/admin/usuarios", { method: "POST", body: JSON.stringify(dados) });
}
export function atualizarFuncionario(id: string, dados: AtualizarFuncionario): Promise<UsuarioPublico> {
  return requisitar<UsuarioPublico>(`/admin/usuarios/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(dados),
  });
}
