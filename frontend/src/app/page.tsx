"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { doesSessionExist } from "supertokens-web-js/recipe/session";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    async function verifySession() {
      try {
        const sessionActive = await doesSessionExist();
        setIsLoggedIn(sessionActive);
      } catch {
        setIsLoggedIn(false);
      }
    }
    verifySession();
  }, []);

  // Define dinamicamente o destino e o texto com base no estado da sessão
  const buttonHref = isLoggedIn ? "/dashboard" : "/login";
  // Durante o carregamento (null) ou sem sessão, mantém o rótulo seguro
  const buttonLabel = isLoggedIn ? "Acessar painel" : "Acessar o Sistema";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      {/* Header Público com Logo Centralizada */}
      <header className="w-full border-b border-brand-green/20 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-center">
          
          {/* Marca / Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/favicon.ico"
              alt="Ícone PRD"
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 object-contain rounded-md"
            />
            <span className="font-bold text-xl tracking-wide text-brand-neon group-hover:opacity-90 transition-opacity">
              PRD
            </span>
          </Link>

        </div>
      </header>

      {/* Conteúdo Principal (Hero Section Centralizada) */}
      <main className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-8">
          
          {/* Título Principal de Destaque */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter text-foreground leading-tight">
            PRD — Sistema de {" "}
            <span className="text-brand-green">Gestão de Execução Contratual</span>.
          </h1>

          {/* Texto de Apoio */}
          <p className="text-xl md:text-2xl text-foreground/70 max-w-2xl mx-auto">
            Centralize a execução física, operacional, documental e comprobatória de contratos públicos. Acompanhe o planejado, o realizado e o comprovado em um dossiê digital único.
          </p>

          {/* Botão de Acesso Dinâmico baseado na Sessão */}
          <div className="mt-6">
            <Link
              href={buttonHref}
              className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-brand-green px-12 py-4 text-lg font-semibold text-background transition-all duration-300 ease-out hover:scale-105 hover:shadow-lg hover:shadow-brand-green/20"
            >
              <span className="absolute inset-0 h-full w-full bg-gradient-to-r from-brand-green to-[#4bc137] opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>
              <span className="relative z-10 flex items-center gap-2">
                {buttonLabel}
                <svg 
                  className="w-5 h-5 transition-transform group-hover:translate-x-1" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </Link>
          </div>
          
        </div>
      </main>

      {/* Footer simples */}
      <footer className="w-full py-6 border-t border-brand-green/10 bg-background text-center">
        <p className="text-sm text-foreground/50">&copy; 2026 Project-01. Todos os direitos reservados.</p>
      </footer>

    </div>
  );
}