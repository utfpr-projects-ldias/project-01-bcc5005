import { renderComConsultas } from '@/test-utils';
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import LoginPage from "./page";
import { signIn } from "supertokens-web-js/recipe/emailpassword";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { consultarMeuPerfil } from "@/lib/admin-usuarios";

const substituir = jest.fn();
const atualizar = jest.fn();
const mockRouter = { replace: substituir, refresh: atualizar };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/config/supertokens", () => ({ initSuperTokens: jest.fn() }));
jest.mock("supertokens-web-js/recipe/emailpassword", () => ({ signIn: jest.fn() }));
jest.mock("supertokens-web-js/recipe/session", () => ({ doesSessionExist: jest.fn() }));
jest.mock("@/lib/admin-usuarios", () => ({ ...jest.requireActual("@/lib/admin-usuarios"), consultarMeuPerfil: jest.fn() }));
const entrar = signIn as jest.MockedFunction<typeof signIn>;
const sessao = doesSessionExist as jest.MockedFunction<typeof doesSessionExist>;
const perfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
beforeEach(() => { jest.clearAllMocks(); sessao.mockResolvedValue(false); });

test("login espera a verificação inicial sem mostrar formulário", async () => {
  let resolver!: (value: boolean) => void;
  sessao.mockReturnValue(new Promise<boolean>((res) => { resolver = res; }));
  renderComConsultas(<LoginPage />);
  expect(screen.getByRole("status")).toHaveTextContent("Verificando sessão");
  expect(screen.queryByRole("button", { name: "Entrar" })).not.toBeInTheDocument();
  await act(async () => { resolver(false); });
  expect(await screen.findByRole("button", { name: "Entrar" })).toBeInTheDocument();
});

test("se já tem sessão ativa e domínio ativo, vai direto ao dashboard", async () => {
  sessao.mockResolvedValue(true);
  perfil.mockResolvedValue({ id: "a", nome: "Admin Teste", email: "admin@exemplo.com", perfil: "ADMINISTRADOR", ativo: true });
  renderComConsultas(<LoginPage />);
  await waitFor(() => expect(substituir).toHaveBeenCalledWith("/dashboard"));
  expect(entrar).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Entrar" })).not.toBeInTheDocument();
});

test("login usa valores preenchidos no DOM, mesmo sem disparar onChange (autofill)", async () => {
  entrar.mockResolvedValue({ status: "OK" } as Awaited<ReturnType<typeof signIn>>);
  renderComConsultas(<LoginPage />);
  await screen.findByRole("button", { name: "Entrar" });
  const email = screen.getByLabelText("E-mail") as HTMLInputElement;
  const senha = screen.getByLabelText("Senha") as HTMLInputElement;
  email.value = "ADMIN@EXEMPLO.COM"; senha.value = "SenhaDeTeste!123";
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  await waitFor(() => expect(entrar).toHaveBeenCalledWith(expect.objectContaining({
    formFields: [{ id: "email", value: "admin@exemplo.com" }, { id: "password", value: "SenhaDeTeste!123" }],
  })));
  expect(substituir).toHaveBeenCalledWith("/dashboard");
  expect(screen.queryByText("Login efetuado!")).not.toBeInTheDocument();
});

test("credenciais inválidas mostram erro, não falso sucesso", async () => {
  entrar.mockResolvedValue({ status: "WRONG_CREDENTIALS_ERROR" } as Awaited<ReturnType<typeof signIn>>);
  renderComConsultas(<LoginPage />);
  await screen.findByRole("button", { name: "Entrar" });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "admin@exemplo.com" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "errada" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/E-mail ou senha inválidos/);
  expect(substituir).not.toHaveBeenCalled();
});
