"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Session from "supertokens-web-js/recipe/session";
import { useRouter } from "next/navigation";
import { MenuLateral, MenuMobile } from "@/app/components/menu-modulos";
import { consultarMeuPerfil } from "@/lib/admin-usuarios";

export type Contrato = {
  id: string;
  numero_contrato: string;
  orgao_contratante: string;
  objeto: string;
  inicio_vigencia: string;
  termino_vigencia: string;
  status: "Planejamento" | "Em execução" | "Em encerramento" | "Concluído" | "Suspenso" | "Cancelado";
  modo_calculo: "Simples" | "Ponderado";
};

export default function ContratosListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contratos, setContratos] = useState<Contrato[]>([]);
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



  useEffect(() => {
    async function loadData() {
      try {
        // Área de prévia interna: não basta uma sessão técnica SuperTokens;
        // o usuário de domínio também precisa existir e estar ativo.
        const perfil = await consultarMeuPerfil();
        if (!perfil.ativo) {
          setError("Esta conta está inativa. Acesso à prévia não autorizado.");
          return;
        }

        const mockContratos: Contrato[] = [
          {
            id: "exemplo-nao-persistido",
            numero_contrato: "CT-001/2026",
            orgao_contratante: "Secretaria de Tecnologia da Informação",
            objeto: "Prestação de serviços de desenvolvimento de software e sustentação de sistemas.",
            inicio_vigencia: "2026-01-01",
            termino_vigencia: "2026-12-31",
            status: "Em execução",
            modo_calculo: "Ponderado",
          },
        ];

        setContratos(mockContratos);
      } catch (err) {
        console.error(err);
        if (err instanceof Error && "status" in err && err.status === 401) {
          setError("Sessão expirada. Entre novamente.");
          router.replace("/login");
          return;
        }
        setError("Não foi possível validar o acesso à prévia de contratos.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-sm text-foreground/60 animate-pulse">Carregando contratos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-brand-green text-background font-semibold text-sm"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground font-sans">
      
      <MenuLateral />

      {/* Conteúdo Principal à Direita */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Topbar com Título e Logout */}
        <header className="min-h-20 border-b border-brand-green/20 bg-background/80 backdrop-blur-md px-4 py-3 md:px-8 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40">
          <h1 className="text-xl font-bold text-foreground">Gestão de Contratos</h1>

          <div className="flex items-center gap-4">
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

        {/* Corpo da Página de Contratos */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-5xl mx-auto space-y-6">
            <section role="note" aria-label="Prévia sem persistência" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
              <p className="font-semibold">Protótipo visual da Sprint 03 — HU05</p>
              <p className="mt-1">Os contratos mostrados abaixo são exemplos fictícios, não registros do PostgreSQL. O formulário também é apenas uma prévia: nenhum contrato ou PDF será salvo. A integração real está prevista na HU05-06.</p>
            </section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-brand-neon">Exemplo de listagem de contratos</h2>
                <p className="text-sm text-foreground/70">Visualização de referência, sem conexão à API de listagem.</p>
              </div>
              <Link
                href="/contratos/novo"
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-green text-background hover:opacity-90 transition-opacity"
              >
                Visualizar formulário de contrato
              </Link>
            </div>

            {contratos.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-brand-darkgreen/20 border border-brand-green/20">
                <p className="text-foreground/60 text-sm mb-4">Nenhum contrato cadastrado no sistema.</p>
                <Link
                  href="/contratos/novo"
                  className="inline-block px-4 py-2 rounded-lg text-sm font-semibold bg-brand-green text-background"
                >
                  Cadastrar Primeiro Contrato
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {contratos.map((c) => (
                  <div
                    key={c.id}
                    className="p-5 rounded-xl bg-brand-darkgreen/20 border border-brand-green/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-brand-neon">{c.numero_contrato}</span>
                        <span className="text-xs text-amber-600 dark:text-amber-300">Exemplo fictício</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-green/20 text-brand-neon border border-brand-green/30">
                          {c.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{c.orgao_contratante}</p>
                      <p className="text-xs text-foreground/70 line-clamp-1">{c.objeto}</p>
                      <p className="text-xs text-foreground/50">
                        Vigência: {c.inicio_vigencia} até {c.termino_vigencia} | Modo: {c.modo_calculo}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-end md:self-center">
                      <span className="rounded-lg border border-brand-green/20 px-3 py-1.5 text-xs text-foreground/60" title="A tela de detalhes será criada na HU05-06">
                        Detalhes indisponíveis na prévia
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </main>

      </div>
    </div>
  );
}