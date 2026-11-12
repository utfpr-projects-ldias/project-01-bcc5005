import { render, screen } from "@testing-library/react";
import { LinkVoltar } from "./link-voltar";

test("retorno usa navegação interna com nome e destino acessíveis", () => {
  render(<LinkVoltar href="/contratos">Voltar aos contratos</LinkVoltar>);
  const link = screen.getByRole("link", { name: "Voltar aos contratos" });
  expect(link).toHaveAttribute("href", "/contratos");
  expect(link).toHaveClass("rounded-lg");
  expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});
