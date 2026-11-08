import { renderComConsultas } from '@/test-utils';
import { act, screen } from "@testing-library/react";
import { MenuLateral, MenuMobile } from "./menu-modulos";
import { consultarMeuPerfil } from "@/lib/admin-usuarios";

jest.mock("next/navigation", () => ({ usePathname: () => "/admin/usuarios/novo" }));
jest.mock("@/lib/admin-usuarios", () => ({ consultarMeuPerfil: jest.fn() }));
const perfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;

beforeEach(() => jest.clearAllMocks());

test("B3 libera contratos e mostra módulos indisponíveis sem linguagem interna", async () => {
  perfil.mockResolvedValue({ id: "u", nome: "Colaborador de Teste", email: "teste@example.com", perfil: "COLABORADOR", ativo: true });
  // Verifica a ausência do link administrativo após a consulta do perfil terminar.
  await act(async () => {
    renderComConsultas(<MenuMobile />);
  });
  expect(screen.getByRole("link", { name: /Contratos/ })).toHaveAttribute("href", "/contratos");
  expect(screen.getByLabelText('Atividades · Indisponível')).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Navegação móvel' })).toHaveClass('flex-nowrap');
  expect(screen.queryByRole("link", { name: "Funcionários" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Minha conta" })).not.toBeInTheDocument();
});

test("B3 mantém navegação de Contratos e administração restrita ao ADMIN", async () => {
  perfil.mockResolvedValue({ id: "u", nome: "Administrador de Teste", email: "admin@example.com", perfil: "ADMINISTRADOR", ativo: true });
  renderComConsultas(<MenuLateral />);
  expect(screen.getByRole("link", { name: /Contratos/ })).toHaveAttribute("href", "/contratos");
  const entrada = await screen.findByRole("link", { name: "Funcionários" });
  expect(entrada).toHaveAttribute("href", "/admin/usuarios");
  expect(entrada).toHaveAttribute("aria-current", "page");
  expect(entrada).toHaveClass("bg-brand-green/20", "text-brand-neon");
  expect(screen.getByRole("link", { name: "Minha conta" })).toHaveAttribute("href", "/usuario");
});


test('menu lateral mantém nomes acessíveis quando visualmente compacto', async () => {
  perfil.mockResolvedValue({ id: 'u', nome: 'Administrador', email: 'admin@example.com', perfil: 'ADMINISTRADOR', ativo: true });
  renderComConsultas(<MenuLateral />);
  expect(screen.getByRole('complementary', { name: 'Navegação principal' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Contratos' })).toHaveAttribute('title', 'Contratos');
});
