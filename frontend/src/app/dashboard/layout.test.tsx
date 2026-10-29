import { render, screen, waitFor } from "@testing-library/react";
import DashboardLayout from "./layout";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { consultarMeuPerfil, ErroApi } from "@/lib/admin-usuarios";

const mockReplace = jest.fn();
const mockRouter = { replace: mockReplace, refresh: jest.fn() };
jest.mock("supertokens-web-js/recipe/session", () => ({ doesSessionExist: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/lib/admin-usuarios", () => ({
  ...jest.requireActual("@/lib/admin-usuarios"), consultarMeuPerfil: jest.fn(),
}));
const sessao = doesSessionExist as jest.MockedFunction<typeof doesSessionExist>;
const perfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;

beforeEach(() => {
  jest.clearAllMocks();
  perfil.mockResolvedValue({ id: "a", nome: null, email: "admin@example.com", perfil: "ADMINISTRADOR", ativo: true });
});

test("não mostra conteúdo quando sessão não existe", async () => {
  sessao.mockResolvedValue(false);
  render(<DashboardLayout><div data-testid="protegido">Conteúdo protegido</div></DashboardLayout>);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  expect(perfil).not.toHaveBeenCalled();
  expect(screen.queryByTestId("protegido")).not.toBeInTheDocument();
});

test("mostra conteúdo apenas após backend confirmar usuário ativo", async () => {
  sessao.mockResolvedValue(true);
  render(<DashboardLayout><div data-testid="protegido">Conteúdo protegido</div></DashboardLayout>);
  expect(await screen.findByTestId("protegido")).toBeInTheDocument();
  expect(perfil).toHaveBeenCalledTimes(1);
});

test("usuário inativado com cookie válido não entra no dashboard", async () => {
  sessao.mockResolvedValue(true);
  perfil.mockRejectedValue(new ErroApi(403, "Inativo"));
  render(<DashboardLayout><div data-testid="protegido">Conteúdo protegido</div></DashboardLayout>);
  expect(await screen.findByRole("alert")).toHaveTextContent(/conta inativa/i);
  expect(screen.queryByTestId("protegido")).not.toBeInTheDocument();
});
