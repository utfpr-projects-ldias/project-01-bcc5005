import { render, screen } from "@testing-library/react";
import ContratosListPage from "./page";
import { consultarMeuPerfil } from "@/lib/admin-usuarios";

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace, refresh: jest.fn() }) }));
jest.mock("@/app/components/menu-modulos", () => ({ MenuLateral: () => <div>Menu desktop</div>, MenuMobile: () => <div>Menu móvel</div> }));
jest.mock("supertokens-web-js/recipe/session", () => ({ __esModule: true, default: { signOut: jest.fn() } }));
jest.mock("@/lib/admin-usuarios", () => ({ consultarMeuPerfil: jest.fn() }));
const perfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;

beforeEach(() => jest.clearAllMocks());

test("B2 lista contratos como exemplos fictícios e não oferece detalhe quebrado", async () => {
  perfil.mockResolvedValue({ id: "a", nome: "Admin de Teste", email: "admin@example.com", perfil: "ADMINISTRADOR", ativo: true });
  render(<ContratosListPage />);
  expect(await screen.findByText("Protótipo visual da Sprint 03 — HU05")).toBeInTheDocument();
  expect(screen.getByText("CT-001/2026")).toBeInTheDocument();
  expect(screen.getByText(/Detalhes indisponíveis na prévia/)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Detalhes" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Visualizar formulário/ })).toHaveAttribute("href", "/contratos/novo");
});

test("B2 não revela nem mesmo a prévia a uma conta de domínio inativa", async () => {
  perfil.mockResolvedValue({ id: "b", nome: null, email: "teste@example.com", perfil: "COLABORADOR", ativo: false });
  render(<ContratosListPage />);
  expect(await screen.findByText(/Esta conta está inativa/)).toBeInTheDocument();
  expect(screen.queryByText("CT-001/2026")).not.toBeInTheDocument();
});
