"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import Session from "supertokens-web-js/recipe/session";
import { MenuLateral, MenuMobile } from "./menu-modulos";
import { IndicadorCarregamento } from "./indicador-carregamento";
import { useRepositorioConsultas } from "./provedor-consultas";
import { IdentificacaoUsuario } from "../dashboard/components/identificacao-usuario";

/** O layout raiz permanece montado mesmo ao navegar entre login e dashboard. */
export function EstruturaInterna({ children }: { children: ReactNode }) {
  const rota = usePathname();
  const interna = rota === "/dashboard" || rota === "/contratos" || rota.startsWith("/contratos/") ||
    rota === "/admin/usuarios" || rota.startsWith("/admin/usuarios/");

  if (!interna) return <>{children}</>;

  // Este componente interno é DESMONTADO ao sair para /login.
  // Assim, o estado `saindo` nunca atravessa duas sessões diferentes.
  return <CabecalhoInterno rota={rota}>{children}</CabecalhoInterno>;
}

function CabecalhoInterno({ rota, children }: { rota: string; children: ReactNode }) {
  const router = useRouter();
  const cache = useRepositorioConsultas();
  const [saindo, setSaindo] = useState(false);
  const [erroSaida, setErroSaida] = useState("");

  let titulo = "Dashboard";
  if (rota.startsWith("/admin/usuarios")) {
    titulo = rota === "/admin/usuarios" ? "Administração de funcionários" :
      rota === "/admin/usuarios/novo" ? "Cadastrar funcionário" : "Editar funcionário";
  } else if (rota.startsWith("/contratos")) {
    titulo = rota === "/contratos" ? "Gestão de Contratos" :
      rota === "/contratos/novo" ? "Cadastrar contrato" :
      rota.endsWith("/editar") ? "Editar contrato" : "Detalhes do contrato";
  }

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    setErroSaida("");
    try {
      await Session.signOut();
      cache.limpar(); // Apenas apos logout CONFIRMADO; aborta requests da sessao anterior.
      // Ao entrar em /login, CabecalhoInterno será desmontado e limpará o estado.
      router.replace("/login");
    } catch {
      setErroSaida("Não foi possível sair. Tente novamente.");
      setSaindo(false);
    }
  }

  return <div className="flex min-h-screen min-w-0 bg-background font-sans text-foreground">
    <MenuLateral />
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-40 flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-brand-green/20 bg-background px-4 py-3 md:px-8">
        <h1 className="min-w-0 text-xl font-bold">{titulo}</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <IdentificacaoUsuario />
          {erroSaida && <p role="alert" className="text-sm text-red-400">{erroSaida}</p>}
          <button type="button" onClick={() => void sair()} disabled={saindo}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-60">
            {saindo ? <IndicadorCarregamento texto="Saindo..." compacto /> : "Sair"}
          </button>
        </div>
      </header>
      <MenuMobile />
      <main id="conteudo-principal" className="min-w-0 flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto w-full min-w-0 max-w-5xl">{children}</div>
      </main>
    </div>
  </div>;
}
