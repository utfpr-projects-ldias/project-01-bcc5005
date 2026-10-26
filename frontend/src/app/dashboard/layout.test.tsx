import { render, screen, waitFor } from "@testing-library/react";
import DashboardLayout from "./layout";
import { doesSessionExist } from "supertokens-web-js/recipe/session";

// Mocks do SuperTokens e Next.js Navigation
jest.mock("supertokens-web-js/recipe/session", () => ({
  doesSessionExist: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
}));

describe("DashboardLayout Guard (HU04-02 / HU04-04)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("deve exibir estado de carregamento inicial e redirecionar para /login se a sessão não existir", async () => {
    (doesSessionExist as jest.Mock).mockResolvedValue(false);

    render(
      <DashboardLayout>
        <div data-testid="protected-content">Conteúdo Secreto</div>
      </DashboardLayout>
    );

    // Verifica estado inicial de loading
    expect(screen.getByText(/carregando ambiente seguro/i)).toBeInTheDocument();

    // Aguarda a resolução da checagem de sessão
    await waitFor(() => {
      expect(doesSessionExist).toHaveBeenCalledTimes(1);
    });

    // Garante que o conteúdo protegido NÃO é exibido
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("deve renderizar o conteúdo protegido quando a sessão for válida", async () => {
    (doesSessionExist as jest.Mock).mockResolvedValue(true);

    render(
      <DashboardLayout>
        <div data-testid="protected-content">Conteúdo Secreto</div>
      </DashboardLayout>
    );

    // Aguarda o carregamento e valida que o conteúdo é renderizado
    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });

    expect(screen.getByText("Conteúdo Secreto")).toBeInTheDocument();
  });
});