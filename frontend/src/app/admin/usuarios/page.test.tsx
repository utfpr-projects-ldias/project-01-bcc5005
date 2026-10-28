import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdministracaoUsuariosPage from "./page";
import {
  atualizarFuncionario,
  cadastrarFuncionario,
  consultarMeuPerfil,
  ErroApi,
  listarUsuarios,
} from "@/lib/admin-usuarios";

const mockSubstituir = jest.fn();
// O roteador deve manter a mesma referência entre renders, como no Next.js.
// Caso contrário o efeito de carregamento reexecuta e altera a lista durante os testes.
const mockRouter = { replace: mockSubstituir };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/lib/admin-usuarios", () => ({
  ...jest.requireActual("@/lib/admin-usuarios"),
  consultarMeuPerfil: jest.fn(),
  listarUsuarios: jest.fn(),
  cadastrarFuncionario: jest.fn(),
  atualizarFuncionario: jest.fn(),
}));

const meuPerfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
const obterLista = listarUsuarios as jest.MockedFunction<typeof listarUsuarios>;
const criar = cadastrarFuncionario as jest.MockedFunction<typeof cadastrarFuncionario>;
const atualizar = atualizarFuncionario as jest.MockedFunction<typeof atualizarFuncionario>;

const admin = { id: "a", nome: null, email: "rinaldi@gmail.com", perfil: "ADMINISTRADOR" as const, ativo: true, criadoEm: "2026-10-25T19:40:20Z" };

beforeEach(() => {
  jest.clearAllMocks();
  meuPerfil.mockResolvedValue(admin);
  obterLista.mockResolvedValue([admin]);
});

test("carrega lista real da API apenas para Administrador ativo", async () => {
  render(<AdministracaoUsuariosPage />);
  expect(screen.getByRole("status")).toHaveTextContent("Verificando permissões");
  expect(await screen.findByText("rinaldi@gmail.com")).toBeInTheDocument();
  expect(obterLista).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Cadastrar funcionário" })).toBeInTheDocument();
});

test("Gestor não vê lista nem formulário, mesmo pela URL direta", async () => {
  meuPerfil.mockResolvedValue({ ...admin, perfil: "GESTOR" });
  render(<AdministracaoUsuariosPage />);
  expect(await screen.findByRole("heading", { name: "Acesso restrito" })).toBeInTheDocument();
  expect(obterLista).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Cadastrar funcionário" })).not.toBeInTheDocument();
});

test("sessão expirada redireciona para login", async () => {
  meuPerfil.mockRejectedValue(new ErroApi(401, "Sessão expirada"));
  render(<AdministracaoUsuariosPage />);
  await waitFor(() => expect(mockSubstituir).toHaveBeenCalledWith("/login"));
  expect(obterLista).not.toHaveBeenCalled();
});

test("valida senha antes de chamar o backend", async () => {
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("rinaldi@gmail.com");
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "gestor@exemplo.com" } });
  fireEvent.change(screen.getByLabelText("Senha inicial"), { target: { value: "fraca" } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "fraca" } });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar funcionário" }));
  expect(screen.getByText("A senha precisa ter ao menos 12 caracteres.")).toBeInTheDocument();
  expect(criar).not.toHaveBeenCalled();
});

test("cria funcionário com perfil permitido, atualiza lista e limpa senha", async () => {
  const gestor = { id: "b", nome: "Gestor de Teste", email: "gestor@exemplo.com", perfil: "GESTOR" as const, ativo: true, criadoEm: "2026-10-26T10:00:00Z" };
  criar.mockResolvedValue(gestor);
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("rinaldi@gmail.com");
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Gestor de Teste" } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "GESTOR@EXEMPLO.COM" } });
  fireEvent.change(screen.getByLabelText("Perfil"), { target: { value: "GESTOR" } });
  fireEvent.change(screen.getByLabelText("Senha inicial"), { target: { value: "ForteSenha!123" } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "ForteSenha!123" } });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar funcionário" }));
  await waitFor(() => expect(criar).toHaveBeenCalledWith({
    nome: "Gestor de Teste", email: "gestor@exemplo.com", perfil: "GESTOR", senhaInicial: "ForteSenha!123",
  }));
  expect(await screen.findByText("gestor@exemplo.com")).toBeInTheDocument();
  expect(screen.getByLabelText("Senha inicial")).toHaveValue("");
  expect(screen.getByText(/cadastrado com sucesso/)).toBeInTheDocument();
});

test("erro 409 informa duplicidade sem limpar dados do formulário", async () => {
  criar.mockRejectedValue(new ErroApi(409, "Este e-mail já está cadastrado."));
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("rinaldi@gmail.com");
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Pessoa Existente" } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "rinaldi@gmail.com" } });
  fireEvent.change(screen.getByLabelText("Senha inicial"), { target: { value: "ForteSenha!123" } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "ForteSenha!123" } });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar funcionário" }));
  expect(await screen.findByText("Este e-mail já está cadastrado.")).toBeInTheDocument();
  expect(screen.getByLabelText("E-mail")).toHaveValue("rinaldi@gmail.com");
});


test("edita funcionário com nome, perfil e situação pela API", async () => {
  const gestor = { ...admin, id: "b", nome: "Gestor de Teste", email: "gestor@exemplo.com", perfil: "GESTOR" as const };
  obterLista.mockResolvedValue([admin, gestor]);
  atualizar.mockResolvedValue({ ...gestor, nome: "Gestor Atualizado", perfil: "COLABORADOR", ativo: false });
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: "Editar gestor@exemplo.com" }));
  fireEvent.change(screen.getByLabelText("Nome completo (edição)"), { target: { value: "Gestor Atualizado" } });
  fireEvent.change(screen.getByLabelText("Perfil (edição)"), { target: { value: "COLABORADOR" } });
  fireEvent.click(screen.getByLabelText("Conta ativa (desmarque para inativar)"));
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
  await waitFor(() => expect(atualizar).toHaveBeenCalledWith("b", {
    nome: "Gestor Atualizado", perfil: "COLABORADOR", ativo: false,
  }));
  expect(await screen.findByText("Gestor Atualizado")).toBeInTheDocument();
});

test("Administrador só consegue editar o próprio nome", async () => {
  render(<AdministracaoUsuariosPage />);
  await screen.findByText("rinaldi@gmail.com");
  fireEvent.click(screen.getByRole("button", { name: "Editar rinaldi@gmail.com" }));
  expect(screen.getByLabelText("Nome completo (edição)")).toBeInTheDocument();
  expect(screen.queryByLabelText("Perfil (edição)")).not.toBeInTheDocument();
  expect(screen.queryByText(/Conta ativa/)).not.toBeInTheDocument();
});
