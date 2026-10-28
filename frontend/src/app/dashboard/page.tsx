"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MenuLateral, MenuMobile } from "@/app/components/menu-modulos";
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


  return (
    <div className="min-h-screen flex bg-background text-foreground font-sans">
      
      <MenuLateral />

      {/* Conteúdo Principal à Direita */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Topbar com Botão de Logout */}
        <header className="min-h-20 border-b border-brand-green/20 bg-background/80 backdrop-blur-md px-4 py-3 md:px-8 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40">
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
        <MenuMobile />

        {/* Corpo da Página */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
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
                <p className="text-3xl font-bold text-brand-neon mt-2">—</p>
              </div>
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Entregáveis Pendentes</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">—</p>
              </div>
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Avanço Médio</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">—</p>
              </div>
            </div>
            <p className="text-sm text-foreground/60">Indicadores operacionais ainda não disponíveis. Os valores reais serão integrados na HU11.</p>
          </div>
        </main>

      </div>
    </div>
  );
}