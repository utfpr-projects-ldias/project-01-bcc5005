import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SuperTokensInit } from "./components/supertokens-init";
import { ProvedorConsultas } from "./components/provedor-consultas";
import { EstruturaInterna } from "./components/estrutura-interna";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sistema de Gestão de Execução Contratual",
  description: "Gestão operacional e comprobatória da execução de contratos públicos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SuperTokensInit><ProvedorConsultas><EstruturaInterna>{children}</EstruturaInterna></ProvedorConsultas></SuperTokensInit>
      </body>
    </html>
  );
}
