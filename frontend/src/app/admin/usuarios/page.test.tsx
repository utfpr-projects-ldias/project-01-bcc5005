import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdministracaoUsuariosPage from "./page";
import {
  atualizarFuncionario, cadastrarFuncionario, consultarMeuPerfil,
  consultarUsuariosPaginados, alterarEmailFuncionario,
  redefinirSenhaFuncionario, ErroApi,
} from "@/lib/admin-usuarios";

const substituir = jest.fn();
const mockRouter = { replace: substituir };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/lib/admin-usuarios", () => ({
  ...jest.requireActual("@/lib/admin-usuarios"),
  consultarMeuPerfil: jest.fn(), consultarUsuariosPaginados: jest.fn(),
  cadastrarFuncionario: jest.fn(), atualizarFuncionario: jest.fn(),
  alterarEmailFuncionario: jest.fn(), redefinirSenhaFuncionario: jest.fn(),
  listarPermissoesFuncionario: jest.fn(() => Promise.resolve([])),
  listarContratosAdministracao: jest.fn(() => Promise.resolve([])),
  concederPermissaoFuncionario: jest.fn(), revogarPermissaoFuncionario: jest.fn(),
}));
const eu = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
const paginados = consultarUsuariosPaginados as jest.MockedFunction<typeof consultarUsuariosPaginados>;
const criar = cadastrarFuncionario as jest.MockedFunction<typeof cadastrarFuncionario>;
const atualizar = atualizarFuncionario as jest.MockedFunction<typeof atualizarFuncionario>;
const atualizarEmail = alterarEmailFuncionario as jest.MockedFunction<typeof alterarEmailFuncionario>;
const redefinirSenha = redefinirSenhaFuncionario as jest.MockedFunction<typeof redefinirSenhaFuncionario>;
const admin = { id: "a", nome: null, email: "admin@exemplo.com", perfil: "ADMINISTRADOR" as const, ativo: true, criadoEm: "2026-10-25T19:40:20Z" };
const gestor = { id: "b", nome: "Gestor de Teste", email: "gestor@exemplo.com", perfil: "GESTOR" as const, ativo: true, criadoEm: "2026-10-26T10:00:00Z" };

beforeEach(() => {
  jest.clearAllMocks();
  eu.mockResolvedValue(admin);
  paginados.mockImplementation(async (opts) => ({
    itens: opts.limite === 1 ? [admin] : opts.ativo ? [admin, gestor] : [],
    pagina: opts.pagina ?? 1, limite: opts.limite ?? 20,
    total: opts.ativo ? 2 : 0, totalPaginas: 1,
  }));
});

test("Administrador carrega listagem paginada pela API", async () => {
  render(<AdministracaoUsuariosPage />);
  expect(screen.getByRole("status")).toHaveTextContent("Verificando permissões");
  expect(await screen.findByText("admin@exemplo.com")).toBeInTheDocument();
  expect(paginados).toHaveBeenCalledWith(expect.objectContaining({ ativo: true, pagina: 1 }));
  expect(screen.getByRole("button", { name: "Cadastrar funcionário" })).toBeInTheDocument();
});

test("Gestor não tem acesso à área pela URL", async () => {
  eu.mockResolvedValue({ ...admin, perfil: "GESTOR" });
  render(<AdministracaoUsuariosPage />);
  expect(await screen.findByRole("heading", { name: "Acesso restrito" })).toBeInTheDocument();
  expect(paginados).not.toHaveBeenCalled();
});

test("Sessão 401 redireciona", async () => {
  eu.mockRejectedValue(new ErroApi(401, "Sessão expirada"));
  render(<AdministracaoUsuariosPage />);
  await waitFor(() => expect(substituir).toHaveBeenCalledWith("/login"));
});

test("Alterna arquivados com filtro server-side", async () => {
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: /Arquivados \(/ }));
  await waitFor(() => expect(paginados).toHaveBeenCalledWith(expect.objectContaining({ ativo: false, pagina: 1 })));
});

test("Valida senha de cadastro antes da API", async () => {
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "gestor@exemplo.com" } });
  fireEvent.change(screen.getByLabelText("Senha inicial"), { target: { value: "fraca" } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "fraca" } });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar funcionário" }));
  expect(screen.getByText("A senha precisa ter ao menos 12 caracteres.")).toBeInTheDocument();
  expect(criar).not.toHaveBeenCalled();
});

test("Cadastra e limpa senha após resposta real simulada", async () => {
  criar.mockResolvedValue(gestor);
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: gestor.nome } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "GESTOR@EXEMPLO.COM" } });
  fireEvent.change(screen.getByLabelText("Senha inicial"), { target: { value: "ForteSenha!123" } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "ForteSenha!123" } });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar funcionário" }));
  await waitFor(() => expect(criar).toHaveBeenCalledWith(expect.objectContaining({ email: "gestor@exemplo.com", nome: gestor.nome })));
  await waitFor(() => expect(screen.getByLabelText("Senha inicial")).toHaveValue(""));
});

test("Erro de duplicidade mantém campos", async () => {
  criar.mockRejectedValue(new ErroApi(409, "Este e-mail já está cadastrado."));
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: gestor.nome } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: gestor.email } });
  fireEvent.change(screen.getByLabelText("Senha inicial"), { target: { value: "ForteSenha!123" } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "ForteSenha!123" } });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar funcionário" }));
  expect(await screen.findByText("Este e-mail já está cadastrado.")).toBeInTheDocument();
  expect(screen.getByLabelText("E-mail")).toHaveValue(gestor.email);
});

test("Editar usa mesmo painel e cancela", async () => {
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: "Editar gestor@exemplo.com" }));
  expect(screen.getByRole("heading", { name: /Editar funcionário/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cadastrar funcionário" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar edição" }));
  expect(screen.getByRole("button", { name: "Cadastrar funcionário" })).toBeInTheDocument();
});

test("PATCH de perfil e situação funciona", async () => {
  atualizar.mockResolvedValue({ ...gestor, perfil: "COLABORADOR", ativo: false });
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: "Editar gestor@exemplo.com" }));
  fireEvent.change(screen.getByLabelText("Perfil (edição)"), { target: { value: "COLABORADOR" } });
  fireEvent.click(screen.getByLabelText("Conta ativa (desmarque para inativar)"));
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
  await waitFor(() => expect(atualizar).toHaveBeenCalledWith("b", { perfil: "COLABORADOR", ativo: false }));
});

test("Administrador só altera seu próprio nome", async () => {
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("admin@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: "Editar admin@exemplo.com" }));
  expect(screen.getByLabelText("Nome completo (edição)")).toBeInTheDocument();
  expect(screen.queryByLabelText("Perfil (edição)")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Novo e-mail")).not.toBeInTheDocument();
});

test("Atualização de e-mail separada do PATCH de perfil", async () => {
  atualizarEmail.mockResolvedValue({ ...gestor, email: "novo@exemplo.com" });
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: "Editar gestor@exemplo.com" }));
  fireEvent.change(screen.getByLabelText("Novo e-mail"), { target: { value: "novo@exemplo.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Atualizar e-mail" }));
  await waitFor(() => expect(atualizarEmail).toHaveBeenCalledWith("b", "novo@exemplo.com"));
});

test("Senha nunca é enviada no PATCH de domínio", async () => {
  redefinirSenha.mockResolvedValue(undefined);
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: "Editar gestor@exemplo.com" }));
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "NovaSenha!1234" } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "NovaSenha!1234" } });
  fireEvent.click(screen.getByRole("button", { name: "Definir nova senha" }));
  await waitFor(() => expect(redefinirSenha).toHaveBeenCalledWith("b", "NovaSenha!1234"));
  expect(atualizar).not.toHaveBeenCalled();
});
