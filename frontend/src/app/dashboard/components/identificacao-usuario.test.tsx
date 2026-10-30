import { fireEvent } from '@testing-library/react';
import { useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { renderComConsultas } from '@/test-utils';
import { screen } from "@testing-library/react";
import { IdentificacaoUsuario } from "./identificacao-usuario";
import { consultarMeuPerfil } from "@/lib/admin-usuarios";

jest.mock("@/lib/admin-usuarios", () => ({ consultarMeuPerfil: jest.fn() }));
const consultar = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
beforeEach(() => jest.clearAllMocks());

test("mostra nome, e-mail e perfil reais", async () => {
  consultar.mockResolvedValue({ id: "u", nome: "Pessoa de Teste", email: "pessoa@example.com", ativo: true, perfil: "GESTOR" });
  renderComConsultas(<IdentificacaoUsuario />);
  expect(await screen.findByText("Pessoa de Teste")).toBeInTheDocument();
  expect(screen.getByText("pessoa@example.com")).toBeInTheDocument();
  expect(screen.getByText("Gestor")).toBeInTheDocument();
});

test("conta legada mostra Nome não informado, e-mail e perfil separados", async () => {
  consultar.mockResolvedValue({ id: "u", nome: null, email: "legado@example.com", ativo: true, perfil: "ADMINISTRADOR" });
  renderComConsultas(<IdentificacaoUsuario />);
  expect(await screen.findByText("Nome não informado")).toBeInTheDocument();
  expect(screen.getByText("legado@example.com")).toBeInTheDocument();
  expect(screen.getByText("Administrador")).toBeInTheDocument();
});

test("usa fallback quando nome só possui espaços", async () => {
  consultar.mockResolvedValue({ id: "u", nome: "   ", email: "semnome@example.com", ativo: true, perfil: "COLABORADOR" });
  renderComConsultas(<IdentificacaoUsuario />);
  expect(await screen.findByText("Nome não informado")).toBeInTheDocument();
  expect(screen.getByText("semnome@example.com")).toBeInTheDocument();
});

test("atualiza identificação pela invalidação compartilhada de perfil", async () => {
  consultar.mockResolvedValueOnce({ id: "u", nome: null, email: "pessoa@example.com", ativo: true, perfil: "GESTOR" })
    .mockResolvedValueOnce({ id: "u", nome: "Nome Atualizado", email: "pessoa@example.com", ativo: true, perfil: "GESTOR" });
  function Atualizar() {
    const repo = useRepositorioConsultas();
    return <button type="button" onClick={() => repo.invalidar(['identidade', 'me'])}>Atualizar perfil</button>;
  }
  renderComConsultas(<><IdentificacaoUsuario /><Atualizar /></>);
  expect(await screen.findByText("Nome não informado")).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar perfil' }));
  expect(await screen.findByText("Nome Atualizado")).toBeInTheDocument();
});
