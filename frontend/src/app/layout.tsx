import type { Metadata } from "next";
import "./globals.css";
import { SuperTokensInit } from "./components/supertokens-init";
import { ProvedorConsultas } from "./components/provedor-consultas";
import { EstruturaInterna } from "./components/estrutura-interna";
import { ToastNotificacoes } from "./components/toast-notificacoes";

export const metadata: Metadata = {
  title: "Sistema de Gestão de Execução Contratual",
  description: "Gestão operacional e comprobatória da execução de contratos públicos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <SuperTokensInit><ProvedorConsultas><EstruturaInterna>{children}</EstruturaInterna><ToastNotificacoes /></ProvedorConsultas></SuperTokensInit>
      </body>
    </html>
  );
}
