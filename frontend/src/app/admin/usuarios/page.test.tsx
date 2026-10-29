import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdministracaoUsuariosPage from "./page";
import CadastrarFuncionarioPage from "./novo/page";
import { PainelAdministracao } from "./components/painel-administracao";
import {
  atualizarFuncionario, cadastrarFuncionario, consultarMeuPerfil, consultarUsuariosPaginados,
  buscarFuncionarioPorId, alterarEmailFuncionario, redefinirSenhaFuncionario,
  listarPermissoesFuncionario, listarContratosAdministracao, concederPermissaoFuncionario, ErroApi,
} from "@/lib/admin-usuarios";

const substituir = jest.fn();
const navegar = jest.fn();
const mockRouter = { replace: substituir, push: navegar, refresh: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, usePathname: () => "/admin/usuarios" }));
jest.mock("@/lib/admin-usuarios", () => ({
  ...jest.requireActual("@/lib/admin-usuarios"),
  consultarMeuPerfil: jest.fn(), consultarUsuariosPaginados: jest.fn(),
  buscarFuncionarioPorId: jest.fn(),
  cadastrarFuncionario: jest.fn(), atualizarFuncionario: jest.fn(),
  alterarEmailFuncionario: jest.fn(), redefinirSenhaFuncionario: jest.fn(),
  listarPermissoesFuncionario: jest.fn(() => Promise.resolve([])),
  listarContratosAdministracao: jest.fn(() => Promise.resolve([])),
  concederPermissaoFuncionario: jest.fn(), revogarPermissaoFuncionario: jest.fn(),
}));
const eu = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
const paginados = consultarUsuariosPaginados as jest.MockedFunction<typeof consultarUsuariosPaginados>;
const porId = buscarFuncionarioPorId as jest.MockedFunction<typeof buscarFuncionarioPorId>;
const criar = cadastrarFuncionario as jest.MockedFunction<typeof cadastrarFuncionario>;
const atualizar = atualizarFuncionario as jest.MockedFunction<typeof atualizarFuncionario>;
const atualizarEmail = alterarEmailFuncionario as jest.MockedFunction<typeof alterarEmailFuncionario>;
const acessos = listarPermissoesFuncionario as jest.MockedFunction<typeof listarPermissoesFuncionario>;
const contratos = listarContratosAdministracao as jest.MockedFunction<typeof listarContratosAdministracao>;
const conceder = concederPermissaoFuncionario as jest.MockedFunction<typeof concederPermissaoFuncionario>;
const redefinirSenha = redefinirSenhaFuncionario as jest.MockedFunction<typeof redefinirSenhaFuncionario>;
const admin = { id: "a", nome: null, email: "admin@exemplo.com", perfil: "ADMINISTRADOR" as const, ativo: true, criadoEm: "2026-10-25T19:40:20Z" };
const gestor = { id: "b", nome: "Gestor de Teste", email: "gestor@exemplo.com", perfil: "GESTOR" as const, ativo: true, criadoEm: "2026-10-26T10:00:00Z" };

beforeEach(() => {
  jest.clearAllMocks();
  eu.mockResolvedValue(admin);
  porId.mockResolvedValue(gestor);
  acessos.mockResolvedValue([]); contratos.mockResolvedValue([]);
  paginados.mockImplementation(async (opts) => ({
    itens: opts.limite === 1 ? [admin] : opts.ativo ? [admin, gestor] : [],
    pagina: opts.pagina ?? 1, limite: opts.limite ?? 20,
    total: opts.ativo ? 2 : 0, totalPaginas: 1,
  }));
});

test("listagem exibe ação de cadastro ao lado de atualizar, sem formulário", async () => {
  render(<AdministracaoUsuariosPage />);
  const lista = await screen.findByRole("region", { name: "Funcionários" });
  expect(within(lista).getByText("gestor@exemplo.com")).toBeInTheDocument();
  expect(paginados).toHaveBeenCalled();
  const cadastrar = within(lista).getByRole("link", { name: "Cadastrar funcionário" });
  expect(cadastrar).toHaveAttribute("href", "/admin/usuarios/novo");
  expect(cadastrar.parentElement).toContainElement(within(lista).getByRole("button", { name: "Atualizar lista" }));
  expect(screen.queryByLabelText("Senha inicial")).not.toBeInTheDocument();
});

test("editar é link para página própria", async () => {
  render(<AdministracaoUsuariosPage />);
  const lista = await screen.findByRole("region", { name: "Funcionários" });
  expect(within(lista).getByRole("link", { name: "Editar gestor@exemplo.com" }))
    .toHaveAttribute("href", "/admin/usuarios/b/editar");
  expect(screen.queryByRole("region", { name: /Editar funcionário/ })).not.toBeInTheDocument();
});

test("Gestor não acessa listagem", async () => {
  eu.mockResolvedValue({ ...admin, perfil: "GESTOR" });
  render(<AdministracaoUsuariosPage />);
  expect(await screen.findByRole("heading", { name: "Acesso restrito" })).toBeInTheDocument();
  expect(paginados).not.toHaveBeenCalled();
});

test("sessão expirada redireciona sem mostrar dados", async () => {
  eu.mockRejectedValue(new ErroApi(401, "Sessão expirada"));
  render(<AdministracaoUsuariosPage />);
  await waitFor(() => expect(substituir).toHaveBeenCalledWith("/login"));
  expect(screen.queryByText("gestor@exemplo.com")).not.toBeInTheDocument();
});

test("abas ativos e arquivados usam filtro servidor", async () => {
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: /Arquivados \(/ }));
  await waitFor(() => expect(paginados).toHaveBeenCalledWith(expect.objectContaining({ ativo: false, pagina: 1 })));
});

test("cadastrar possui formulário isolado e valida senha antes da API", async () => {
  render(<CadastrarFuncionarioPage />);
  await screen.findByRole("heading", { name: "Cadastrar funcionário", level: 1 });
  expect(screen.queryByRole("region", { name: "Funcionários" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: gestor.nome } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: gestor.email } });
  fireEvent.change(screen.getByLabelText("Senha inicial"), { target: { value: "fraca" } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "fraca" } });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar funcionário" }));
  expect(await screen.findByText("A senha precisa ter ao menos 12 caracteres.")).toBeInTheDocument();
  expect(criar).not.toHaveBeenCalled();
});

test("cadastro válido grava via API e retorna à listagem", async () => {
  criar.mockResolvedValue(gestor);
  render(<CadastrarFuncionarioPage />);
  await screen.findByRole("heading", { name: "Cadastrar funcionário", level: 1 });
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: gestor.nome } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "GESTOR@EXEMPLO.COM" } });
  fireEvent.change(screen.getByLabelText("Senha inicial"), { target: { value: "ForteSenha!123" } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "ForteSenha!123" } });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar funcionário" }));
  await waitFor(() => expect(criar).toHaveBeenCalledWith(expect.objectContaining({ email: gestor.email })));
  expect(substituir).toHaveBeenCalledWith("/admin/usuarios");
});

test("edição abre por UUID consultando API individual, mesmo fora das 100 primeiras contas", async () => {
  render(<PainelAdministracao vista="edicao" idEdicao="b" />);
  expect(await screen.findByRole("heading", { name: /Editar funcionário — Gestor de Teste/ })).toBeInTheDocument();
  expect(porId).toHaveBeenCalledWith("b");
  expect(paginados).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Perfil de acesso")).toHaveValue("GESTOR");
  expect(screen.queryByRole("region", { name: "Funcionários" })).not.toBeInTheDocument();
});

test("edição salva o PATCH e permanece na página para gerenciar credenciais", async () => {
  atualizar.mockResolvedValue({ ...gestor, perfil: "COLABORADOR", ativo: false });
  render(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByLabelText("Perfil de acesso");
  fireEvent.change(screen.getByLabelText("Perfil de acesso"), { target: { value: "COLABORADOR" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar dados da conta" }));
  await waitFor(() => expect(atualizar).toHaveBeenCalledWith("b", { perfil: "COLABORADOR" }));
  expect(screen.getByText(/Dados de gestor@exemplo.com atualizados/)).toBeInTheDocument();
});

test("editar Administrador permite somente o próprio nome", async () => {
  porId.mockResolvedValue(admin);
  render(<PainelAdministracao vista="edicao" idEdicao="a" />);
  await screen.findByLabelText("Nome completo");
  expect(screen.queryByLabelText("Perfil de acesso")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Novo e-mail")).not.toBeInTheDocument();
});

test("edição de credenciais não usa o PATCH de domínio", async () => {
  atualizarEmail.mockResolvedValue({ ...gestor, email: "novo@exemplo.com" });
  redefinirSenha.mockResolvedValue(undefined);
  render(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole("heading", { name: /Editar funcionário — Gestor de Teste/ });
  fireEvent.click(screen.getByText("Alterar e-mail", { exact: false, selector: "summary" }));
  fireEvent.change(screen.getByLabelText("Novo e-mail"), { target: { value: "novo@exemplo.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar mudança de e-mail" }));
  await waitFor(() => expect(atualizarEmail).toHaveBeenCalledWith("b", "novo@exemplo.com"));
  fireEvent.click(screen.getByText("Redefinir senha", { exact: false, selector: "summary" }));
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "NovaSenha!1234" } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "NovaSenha!1234" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar redefinição de senha" }));
  await waitFor(() => expect(redefinirSenha).toHaveBeenCalledWith("b", "NovaSenha!1234"));
  expect(atualizar).not.toHaveBeenCalled();
});

test("edição mantém retorno para lista e ações próprias sem recriar a navegação", async () => {
  render(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole("heading", { name: /Editar funcionário — Gestor de Teste/ });
  expect(screen.queryByRole("complementary", { name: "Navegação principal" })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Navegação móvel" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Voltar aos funcionários/ })).toHaveAttribute("href", "/admin/usuarios");
  expect(screen.getByRole("button", { name: "Salvar dados da conta" })).toBeInTheDocument();
});

test("arquivamento ainda exige confirmação visual simples", async () => {
  atualizar.mockResolvedValue({ ...gestor, ativo: false });
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: "Arquivar" }));
  const dialogo = screen.getByRole("dialog", { name: "Arquivar funcionário?" });
  expect(atualizar).not.toHaveBeenCalled();
  fireEvent.click(within(dialogo).getByRole("button", { name: "Arquivar" }));
  await waitFor(() => expect(atualizar).toHaveBeenCalledWith("b", { ativo: false }));
});


test("cadastro e listagem não remontam navegação global", async () => {
  const { unmount } = render(<CadastrarFuncionarioPage />);
  await screen.findByRole("heading", { name: "Cadastrar funcionário", level: 1 });
  expect(screen.queryByRole("complementary", { name: "Navegação principal" })).not.toBeInTheDocument();
  unmount();
  render(<AdministracaoUsuariosPage />);
  await screen.findByRole("region", { name: "Funcionários" });
  expect(screen.queryByRole("complementary", { name: "Navegação principal" })).not.toBeInTheDocument();
});

test("vários vínculos existentes aparecem e não podem ser adicionados duas vezes", async () => {
  contratos.mockResolvedValue([
    { id: "ct1", numeroContrato: "001/26", orgaoContratante: "UTFPR", status: "PLANEJAMENTO" },
    { id: "ct2", numeroContrato: "002/26", orgaoContratante: "Prefeitura", status: "PLANEJAMENTO" },
    { id: "ct3", numeroContrato: "003/26", orgaoContratante: "Universidade", status: "PLANEJAMENTO" },
  ]);
  acessos.mockResolvedValue([{ contratoId: "ct1", podeEditar: true }, { contratoId: "ct2", podeEditar: false }]);
  render(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole("heading", { name: /Editar funcionário — Gestor de Teste/ });
  fireEvent.click(screen.getByText("Acesso aos contratos", { exact: false, selector: "summary" }));
  const lista = screen.getByRole("region", { name: "Contratos vinculados" });
  expect(within(lista).getByText(/001\/26/)).toBeInTheDocument();
  expect(within(lista).getByText(/002\/26/)).toBeInTheDocument();
  const seletor = screen.getByLabelText("Selecionar contrato ainda não vinculado");
  expect(within(seletor).getAllByRole("option")).toHaveLength(1);
  expect(within(seletor).getByRole("option", { name: /003\/26/ })).toBeInTheDocument();
  conceder.mockResolvedValue({ contratoId: "ct3", podeEditar: false });
  acessos.mockResolvedValueOnce([{ contratoId: "ct1", podeEditar: true }, { contratoId: "ct2", podeEditar: false }])
    .mockResolvedValueOnce([{ contratoId: "ct1", podeEditar: true }, { contratoId: "ct2", podeEditar: false }, { contratoId: "ct3", podeEditar: false }]);
  fireEvent.click(screen.getByRole("button", { name: "Adicionar vínculo" }));
  await waitFor(() => expect(conceder).toHaveBeenCalledWith("b", { contratoId: "ct3", podeEditar: false }));
});
