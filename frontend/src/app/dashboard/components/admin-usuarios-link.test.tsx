import { render, screen } from "@testing-library/react";
import { AdminUsuariosLink } from "./admin-usuarios-link";
import { consultarMeuPerfil } from "@/lib/admin-usuarios";

jest.mock("@/lib/admin-usuarios", () => ({ consultarMeuPerfil: jest.fn() }));
const meuPerfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;

beforeEach(() => { jest.clearAllMocks(); });

test("link não aparece para Gestor", async () => {
  meuPerfil.mockResolvedValue({ id: "1", nome: null, email: "a@exemplo.com", perfil: "GESTOR", ativo: true });
  render(<AdminUsuariosLink />);
  expect(screen.queryByRole("link", { name: /Usuários/ })).not.toBeInTheDocument();
  // A Promise é processada na microtask seguinte; checa que link não aparece.
  await Promise.resolve();
  expect(screen.queryByRole("link", { name: /Usuários/ })).not.toBeInTheDocument();
});

test("link aparece apenas após confirmação do perfil de Administrador ativo", async () => {
  meuPerfil.mockResolvedValue({ id: "1", nome: null, email: "rinaldi@gmail.com", perfil: "ADMINISTRADOR", ativo: true });
  render(<AdminUsuariosLink />);
  const link = await screen.findByRole("link", { name: /Usuários/ });
  expect(link).toHaveAttribute("href", "/admin/usuarios");
});
