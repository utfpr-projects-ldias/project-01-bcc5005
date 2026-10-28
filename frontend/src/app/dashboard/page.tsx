"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Session from "supertokens-web-js/recipe/session";
import { AdminUsuariosLink } from "./components/admin-usuarios-link";
import { IdentificacaoUsuario } from "./components/identificacao-usuario";

export default function DashboardPage() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      await Session.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Não foi possível encerrar a sessão. Tente novamente.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  // Links do menu categorizados com indicação de disponibilidade conforme HU04-03
  const navigationItems = [
    { name: "Dashboard", href: "/dashboard", available: true },
    { name: "Contratos", href: "#", available: false },
    { name: "Atividades", href: "#", available: false },
    { name: "Evidências", href: "#", available: false },
    { name: "Relatórios", href: "#", available: false },
  ];

  return (
    <div className="min-h-screen flex bg-background text-foreground font-sans">
      
      {/* Sidebar à Esquerda */}
      <aside className="w-64 border-r border-brand-green/20 bg-background/50 backdrop-blur-md hidden md:flex flex-col justify-between p-6 sticky top-0 h-screen">
        <div>
          {/* Logo / Título */}
          <Link href="/dashboard" className="flex items-center gap-2 mb-10 group">
            <Image
              src="/favicon.ico"
              alt="Ícone PRD"
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 object-contain rounded-md"
            />
            <span className="font-bold text-2xl tracking-wide text-brand-neon group-hover:opacity-90 transition-opacity">
              PRD
            </span>
          </Link>

          {/* Menu de Categorias */}
          <nav className="space-y-2">
            {navigationItems.map((item) => {
              const isActive = item.href === "/dashboard";
              return item.available ? (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-green text-background font-semibold"
                      : "text-foreground/80 hover:bg-brand-darkgreen/40 hover:text-brand-green"
                  }`}
                >
                  {item.name}
                </Link>
              ) : (
                <div
                  key={item.name}
                  className="block px-4 py-2.5 rounded-lg text-sm font-medium text-foreground/40 cursor-not-allowed select-none"
                  title="Módulo em desenvolvimento"
                >
                  {item.name} <span className="text-xs opacity-60">(Em breve)</span>
                </div>
              );
            })}
          </nav>
        </div>

      </aside>

      {/* Conteúdo Principal à Direita */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Topbar com Botão de Logout */}
        <header className="h-20 border-b border-brand-green/20 bg-background/80 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-40">
          <h1 className="text-xl font-bold text-foreground">Dashboard</h1>

          <div className="flex items-center gap-4">
            <IdentificacaoUsuario />
            <AdminUsuariosLink />
            {/* Botão de Logout */}
            {logoutError && (
              <p role="alert" className="text-sm text-red-400">{logoutError}</p>
            )}
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-60"
            >
              {isLoggingOut ? "Saindo..." : "Sair"}
            </button>
          </div>
        </header>

        {/* Corpo da Página */}
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-5xl mx-auto space-y-6">
            
            <div className="p-6 rounded-2xl bg-brand-darkgreen/40 border border-brand-green/30 backdrop-blur-md">
              <h2 className="text-lg font-semibold text-brand-neon mb-2">Bem-vindo ao Painel</h2>
              <p className="text-sm text-foreground/70">
                Aqui você acompanhará a gestão de execução contratual, indicadores e relatórios da Etapa 1.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Contratos Ativos</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">0</p>
              </div>
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Entregáveis Pendentes</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">0</p>
              </div>
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Avanço Médio</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">0%</p>
              </div>
            </div>

          </div>
        </main>

      </div>
    </div>
  );
}