import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { ModalIdentificacaoContrato } from "./modal-identificacao-contrato";
import type { ContratoResumo } from "@/lib/admin-usuarios";

const numero = "9".repeat(140);
const orgao = "Órgão contratante muito longo ".repeat(10);
const contrato: ContratoResumo = {
  id: "contrato-de-teste",
  codigoPublico: "84354",
  numeroContrato: numero,
  orgaoContratante: orgao,
  status: "PLANEJAMENTO",
};

function Exemplo() {
  const [aberto, setAberto] = useState(false);
  const [gatilho, setGatilho] = useState<HTMLButtonElement | null>(null);
  return <>
    <button type="button" onClick={(e) => { setGatilho(e.currentTarget); setAberto(true); }}>Ver identificação completa</button>
    {aberto && <ModalIdentificacaoContrato contrato={contrato} focoRetorno={gatilho} onFechar={() => setAberto(false)} />}
  </>;
}

let voltar: jest.SpyInstance;
beforeEach(() => {
  window.history.replaceState({ __NA: true, preservado: "next" }, "", window.location.href);
  voltar = jest.spyOn(window.history, "back").mockImplementation(() => {
    const estado = window.history.state as Record<string, unknown>;
    const anterior = { ...estado };
    delete anterior.__modalIdentificacaoContrato;
    window.history.replaceState(anterior, "", window.location.href);
    window.dispatchEvent(new PopStateEvent("popstate", { state: anterior }));
  });
});
afterEach(() => {
  voltar.mockRestore();
  window.history.replaceState(null, "", window.location.href);
});

function abrir() {
  render(<Exemplo />);
  const botao = screen.getByRole("button", { name: "Ver identificação completa" });
  const url = window.location.href;
  fireEvent.click(botao);
  const modal = screen.getByRole("dialog", { name: "Identificação completa do contrato" });
  return { botao, modal, url };
}

test("abre consulta completa, isolada, responsiva e sem mudar URL nem estado Next", () => {
  const { botao, modal, url } = abrir();
  expect(modal).toHaveAttribute("aria-modal", "true");
  expect(within(modal).getByText(numero)).toBeInTheDocument();
  expect(within(modal).getByText(orgao.trim()).textContent).toBe(orgao);
  expect(within(modal).getByText("Código #84354")).toBeInTheDocument();
  expect(modal).toHaveClass("max-w-xl");
  expect(within(modal).getByText(numero)).toHaveClass("[overflow-wrap:anywhere]");
  expect(botao).toBeInTheDocument();
  expect(window.location.href).toBe(url);
  expect(window.history.state).toEqual(expect.objectContaining({ __NA: true, preservado: "next", __modalIdentificacaoContrato: expect.any(String) }));
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(within(modal).getByRole("button", { name: "Fechar identificação do contrato" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(botao).toHaveFocus();
  expect(window.history.state.__modalIdentificacaoContrato).toBeUndefined();
  expect(document.body.style.overflow).not.toBe("hidden");
  expect(window.location.href).toBe(url);
});

test("Escape fecha só o modal e devolve foco ao botão que abriu", () => {
  const { botao, modal, url } = abrir();
  fireEvent.keyDown(modal, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(botao).toHaveFocus();
  expect(window.location.href).toBe(url);
  expect(voltar).toHaveBeenCalledTimes(1);
});

test("clique no fundo fecha apenas a sobreposição, mas clique no painel não fecha", () => {
  const { modal } = abrir();
  fireEvent.mouseDown(modal, { button: 0 });
  expect(modal).toBeInTheDocument();
  fireEvent.mouseDown(modal.parentElement!, { button: 0 });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("Voltar do navegador/mouse fecha o modal sem sair da página", () => {
  const { botao, url } = abrir();
  const anterior = { ...(window.history.state as Record<string, unknown>) };
  delete anterior.__modalIdentificacaoContrato;
  window.history.replaceState(anterior, "", window.location.href);
  fireEvent(window, new PopStateEvent("popstate", { state: anterior }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(botao).toHaveFocus();
  expect(window.location.href).toBe(url);
  expect(voltar).not.toHaveBeenCalled();
});

test("botão Voltar fecha apenas o modal e preserva URL e foco", () => {
  const { botao, modal, url } = abrir();
  fireEvent.click(within(modal).getByRole("button", { name: "Voltar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(botao).toHaveFocus();
  expect(window.location.href).toBe(url);
  expect(voltar).toHaveBeenCalledTimes(1);
});
