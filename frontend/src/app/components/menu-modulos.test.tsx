import { act, render, screen } from "@testing-library/react";
import { MenuLateral, MenuMobile } from "./menu-modulos";
import { consultarMeuPerfil } from "@/lib/admin-usuarios";

jest.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
jest.mock("@/lib/admin-usuarios", () => ({ consultarMeuPerfil: jest.fn() }));
const perfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;

beforeEach(() => jest.clearAllMocks());

test("B2 libera link para a prévia de contratos e classifica Atividades como Sprint 04", async () => {
  perfil.mockResolvedValue({ id: "u", nome: "Colaborador de Teste", email: "teste@example.com", perfil: "COLABORADOR", ativo: true });
  // Verifica a ausência do link administrativo após a consulta do perfil terminar.
  await act(async () => {
    render(<MenuMobile />);
  });
  expect(screen.getByRole("link", { name: /Contratos/ })).toHaveAttribute("href", "/contratos");
  expect(screen.getByText(/Sprint 04 · em desenvolvimento/)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Administração" })).not.toBeInTheDocument();
});

test("B2 mantém navegação de Contratos e administração restrita ao ADMIN", async () => {
  perfil.mockResolvedValue({ id: "u", nome: "Administrador de Teste", email: "admin@example.com", perfil: "ADMINISTRADOR", ativo: true });
  render(<MenuLateral />);
  expect(screen.getByRole("link", { name: /Contratos/ })).toHaveAttribute("href", "/contratos");
  expect(await screen.findByRole("link", { name: "Administração" })).toHaveAttribute("href", "/admin/usuarios");
});
