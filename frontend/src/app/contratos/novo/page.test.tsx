import { render, screen } from "@testing-library/react";
import NovoContratoPage from "./page";
import { consultarMeuPerfil } from "@/lib/admin-usuarios";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace, refresh: jest.fn() }) }));
jest.mock("@/app/components/menu-modulos", () => ({ MenuLateral: () => <div>Menu desktop</div>, MenuMobile: () => <div>Menu móvel</div> }));
jest.mock("supertokens-web-js/recipe/session", () => ({ __esModule: true, default: { signOut: jest.fn() } }));
jest.mock("@/lib/admin-usuarios", () => ({ consultarMeuPerfil: jest.fn() }));
const perfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;

beforeEach(() => jest.clearAllMocks());

test("B2 apresenta formulário de Sprint 03 sem nenhum salvamento fictício", async () => {
  perfil.mockResolvedValue({ id: "a", nome: "Admin de Teste", email: "admin@example.com", perfil: "ADMINISTRADOR", ativo: true });
  render(<NovoContratoPage />);
  expect(await screen.findByText("Formulário demonstrativo — nenhum dado será salvo")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Salvar contrato \(indisponível\)/ })).toBeDisabled();
  expect(screen.getByRole("group", { name: /Campos indisponíveis até a HU05-06/ })).toBeDisabled();
  expect(screen.getByText(/Upload indisponível nesta prévia/)).toBeInTheDocument();
});

test("B2 impede colaborador de visualizar o formulário administrativo", async () => {
  perfil.mockResolvedValue({ id: "b", nome: "Colaborador de Teste", email: "teste@example.com", perfil: "COLABORADOR", ativo: true });
  render(<NovoContratoPage />);
  expect(await screen.findByRole("heading", { name: "Acesso restrito" })).toBeInTheDocument();
  expect(screen.queryByText("Formulário demonstrativo — nenhum dado será salvo")).not.toBeInTheDocument();
});
