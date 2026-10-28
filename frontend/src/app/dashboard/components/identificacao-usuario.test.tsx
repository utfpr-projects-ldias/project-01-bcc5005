import { render, screen } from "@testing-library/react";
import { IdentificacaoUsuario } from "./identificacao-usuario";
import { consultarMeuPerfil } from "@/lib/admin-usuarios";

jest.mock("@/lib/admin-usuarios", () => ({ consultarMeuPerfil: jest.fn() }));
const consultar = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
beforeEach(() => jest.clearAllMocks());

test("mostra nome, e-mail e perfil reais", async () => {
  consultar.mockResolvedValue({ id: "u", nome: "Pessoa de Teste", email: "pessoa@example.com", ativo: true, perfil: "GESTOR" });
  render(<IdentificacaoUsuario />);
  expect(await screen.findByText("Pessoa de Teste")).toBeInTheDocument();
  expect(screen.getByText("pessoa@example.com")).toBeInTheDocument();
  expect(screen.getByText("Gestor")).toBeInTheDocument();
});

test("conta legada mostra e-mail no lugar do nome", async () => {
  consultar.mockResolvedValue({ id: "u", nome: null, email: "legado@example.com", ativo: true, perfil: "ADMINISTRADOR" });
  render(<IdentificacaoUsuario />);
  expect(await screen.findByText("legado@example.com")).toBeInTheDocument();
  expect(screen.getByText("Administrador")).toBeInTheDocument();
});
