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
export type OperacaoPermissao =
  'criarEtapas' | 'editarEtapas' | 'reordenarEtapas' | 'bloquearOrdemEtapas' | 'arquivarEtapas' | 'reativarEtapas' | 'reabrirEtapas' | 'excluirEtapasArquivadas' |
  'criarEntregaveis' | 'editarEntregaveis' | 'arquivarEntregaveis' | 'reativarEntregaveis' | 'reabrirEntregaveis' | 'excluirEntregaveisArquivados' |
  'criarEvidencias' | 'editarEvidencias' | 'arquivarEvidencias' | 'reativarEvidencias' | 'reabrirEvidencias' | 'excluirEvidenciasArquivadas' |
  'alterarObrigatoriedade' | 'enviarComprovantes' | 'verificarComprovantes' |
  'editarContrato' | 'reabrirContrato' | 'anexarDocumentos' | 'editarDocumentos' | 'arquivarDocumentos' | 'reativarDocumentos' | 'excluirDocumentosArquivados' | 'administrarDocumentoPrincipal';
export type PermissaoFuncionario = { contratoId: string; podeEditar: boolean;
  permissoesDetalhadas?: Partial<Record<OperacaoPermissao, boolean>> | null };
export const OPERACOES_CONTRATO: ReadonlyArray<{ chave: OperacaoPermissao; rotulo: string }> = [
  { chave: 'criarEtapas', rotulo: 'Criar etapas' },
  { chave: 'editarEtapas', rotulo: 'Editar etapas' },
  { chave: 'reordenarEtapas', rotulo: 'Reordenar etapas' },
  { chave: 'bloquearOrdemEtapas', rotulo: 'Bloquear ou liberar a reordenação das etapas' },
  { chave: 'arquivarEtapas', rotulo: 'Arquivar etapas' },
  { chave: 'reativarEtapas', rotulo: 'Reativar etapas arquivadas (especial)' },
  { chave: 'reabrirEtapas', rotulo: 'Reabrir etapas concluídas (especial)' },
  { chave: 'excluirEtapasArquivadas', rotulo: 'Excluir definitivamente etapas arquivadas' },
  { chave: 'criarEntregaveis', rotulo: 'Criar entregáveis' },
  { chave: 'editarEntregaveis', rotulo: 'Editar entregáveis' },
  { chave: 'arquivarEntregaveis', rotulo: 'Arquivar entregáveis' },
  { chave: 'reativarEntregaveis', rotulo: 'Reativar entregáveis arquivados (especial)' },
  { chave: 'reabrirEntregaveis', rotulo: 'Reabrir entregáveis concluídos (especial)' },
  { chave: 'excluirEntregaveisArquivados', rotulo: 'Excluir definitivamente entregáveis arquivados' },
  { chave: 'criarEvidencias', rotulo: 'Cadastrar evidências esperadas' },
  { chave: 'editarEvidencias', rotulo: 'Editar evidências esperadas' },
  { chave: 'arquivarEvidencias', rotulo: 'Arquivar evidências esperadas' },
  { chave: 'reativarEvidencias', rotulo: 'Reativar evidências esperadas (especial)' },
  { chave: 'reabrirEvidencias', rotulo: 'Reabrir evidências verificadas (especial)' },
  { chave: 'excluirEvidenciasArquivadas', rotulo: 'Excluir definitivamente evidências arquivadas' },
  { chave: 'alterarObrigatoriedade', rotulo: 'Alterar obrigatoriedade de evidências' },
  { chave: 'enviarComprovantes', rotulo: 'Enviar comprovantes' },
  { chave: 'verificarComprovantes', rotulo: 'Verificar comprovantes' },
  { chave: 'reabrirContrato', rotulo: 'Reabrir contrato concluído (especial)' },
  { chave: 'editarContrato', rotulo: 'Editar cadastro do contrato' },
  { chave: 'anexarDocumentos', rotulo: 'Anexar documentos administrativos' },
  { chave: 'editarDocumentos', rotulo: 'Editar categoria e descrição dos anexos' },
  { chave: 'arquivarDocumentos', rotulo: 'Arquivar documentos administrativos' },
  { chave: 'reativarDocumentos', rotulo: 'Reativar documentos arquivados (especial)' },
  { chave: 'excluirDocumentosArquivados', rotulo: 'Excluir definitivamente documentos arquivados' },
  { chave: 'administrarDocumentoPrincipal', rotulo: 'Arquivar ou anexar documento principal (especial)' },
];
export function obterPermissoesIniciais(perfil: PerfilFuncionario, vinculo: PermissaoFuncionario): Record<OperacaoPermissao, boolean> {
  const resultado = {} as Record<OperacaoPermissao, boolean>;
  for (const { chave } of OPERACOES_CONTRATO) {
    resultado[chave] = vinculo.permissoesDetalhadas?.[chave] ?? (
      (chave === 'alterarObrigatoriedade' || chave === 'administrarDocumentoPrincipal' || chave === 'bloquearOrdemEtapas' || chave === 'arquivarEtapas' || chave.startsWith('reativar') || chave.startsWith('reabrir') || chave.startsWith('excluir')) ? false :
      chave === 'enviarComprovantes' || chave === 'verificarComprovantes' ? true :
      perfil === 'GESTOR' && vinculo.podeEditar);
  }
  return resultado;
}
/**
 * Perfis de vínculo de um único contrato.
 * Não substitui a ACL do backend: sempre envia um mapa completo de permissões,
 * inclusive as negações, evitando herança operacional inesperada em vínculo de leitura.
 */
export type NivelAcessoVinculo = 'leitura' | 'edicao';

export function permissoesPadraoVinculo(
  perfil: PerfilFuncionario, nivel: NivelAcessoVinculo,
): Record<OperacaoPermissao, boolean> {
  const resultado = {} as Record<OperacaoPermissao, boolean>;
  for (const { chave } of OPERACOES_CONTRATO) resultado[chave] = false;
  if (nivel === 'leitura') return resultado;

  // Acesso de edição padrão: planejar, ordenar e arquivar. Reativação, exclusão,
  // bloqueio da ordem e gestão do documento principal requerem delegação especial.
  const operacoesBasicas: OperacaoPermissao[] = [
    'criarEtapas', 'editarEtapas', 'reordenarEtapas', 'arquivarEtapas',
    'criarEntregaveis', 'editarEntregaveis', 'arquivarEntregaveis',
    'criarEvidencias', 'editarEvidencias', 'arquivarEvidencias',
    'enviarComprovantes', 'anexarDocumentos', 'editarDocumentos', 'arquivarDocumentos',
    ...(perfil === 'GESTOR' ? ['editarContrato', 'verificarComprovantes'] as OperacaoPermissao[] : []),
  ];
  for (const chave of operacoesBasicas) resultado[chave] = true;
  return resultado;
}

export function vinculoTemEdicao(perfil: PerfilFuncionario, vinculo: PermissaoFuncionario): boolean {
  // Vínculos anteriores à ACL detalhada só usam a flag de edição geral.
  if (!vinculo.permissoesDetalhadas) return perfil === 'GESTOR' && vinculo.podeEditar;
  const ef = obterPermissoesIniciais(perfil, vinculo);
  // Arquivamento/reativação/exclusão personalizados não ligam, por si só,
  // o modo de edição; continuam indicados no resumo como concessões específicas.
  return OPERACOES_CONTRATO.some(({ chave }) => ef[chave] &&
    (chave.startsWith('criar') || chave.startsWith('editar') || chave === 'reordenarEtapas' ||
      chave === 'enviarComprovantes' || chave === 'anexarDocumentos' ||
      chave === 'verificarComprovantes'));
}

/** Texto honesto sobre o acesso efetivo, sem confundir edição básica com ajustes individuais.
 * Vínculos legados não possuem matriz para distinguir uma edição intencional.
 */
export function resumirAcessoVinculo(perfil: PerfilFuncionario, vinculo: PermissaoFuncionario): string {
  if (!vinculo.permissoesDetalhadas) return 'Vínculo anterior · revise as permissões';
  const atuais = obterPermissoesIniciais(perfil, vinculo);
  const leitura = permissoesPadraoVinculo(perfil, 'leitura');
  const edicao = permissoesPadraoVinculo(perfil, 'edicao');
  const coincide = (padrao: Record<OperacaoPermissao, boolean>) =>
    OPERACOES_CONTRATO.every(({ chave }) => atuais[chave] === padrao[chave]);
  if (coincide(leitura)) return 'Somente leitura';
  if (coincide(edicao)) return 'Pode editar';
  return vinculoTemEdicao(perfil, vinculo)
    ? 'Pode editar · permissões personalizadas ativas'
    : 'Leitura · permissões personalizadas ativas';
}

export type ContratoResumo = { id: string; codigoPublico: string; numeroContrato: string; orgaoContratante: string; status: string };

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

/** Autosserviço: nenhum ID de outro usuário pode ser informado pelo cliente. */
export function alterarMeuNome(nome: string): Promise<MeuPerfil> {
  return requisitar<MeuPerfil>('/usuarios/me/nome', { method: 'PATCH', body: JSON.stringify({ nome }) });
}
export function alterarMeuEmail(email: string, senhaAtual: string): Promise<MeuPerfil> {
  return requisitar<MeuPerfil>('/usuarios/me/email', { method: 'PATCH', body: JSON.stringify({ email, senhaAtual }) });
}
export function alterarMinhaSenha(senhaAtual: string, novaSenha: string): Promise<void> {
  return requisitar<void>('/usuarios/me/senha', { method: 'PUT', body: JSON.stringify({ senhaAtual, novaSenha }) });
}
