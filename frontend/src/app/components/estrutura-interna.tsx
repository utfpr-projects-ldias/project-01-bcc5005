"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import Session from "supertokens-web-js/recipe/session";
import { MenuLateral, MenuMobile } from "./menu-modulos";
import { ProtecaoSessaoInterna } from "./protecao-sessao-interna";
import { useRepositorioConsultas } from "./provedor-consultas";
import { useMeuPerfil } from "@/hooks/use-meu-perfil";
import Link from "next/link";
import { toastErro } from "./toast-notificacoes";
import { ConfirmacaoSimples } from "./confirmacao-simples";

/** O layout raiz permanece montado mesmo ao navegar entre login e dashboard. */
export function EstruturaInterna({ children }: { children: ReactNode }) {
  const rota = usePathname();
  const interna = rota === "/dashboard" || rota === "/usuario" || rota === "/contratos" || rota.startsWith("/contratos/") ||
    rota === "/admin/usuarios" || rota.startsWith("/admin/usuarios/");

  if (!interna) return <>{children}</>;

  // Este componente interno é DESMONTADO ao sair para /login.
  // Assim, o estado `saindo` nunca atravessa duas sessões diferentes.
  return <ProtecaoSessaoInterna><CabecalhoInterno rota={rota}>{children}</CabecalhoInterno></ProtecaoSessaoInterna>;
}

function CabecalhoInterno({ rota, children }: { rota: string; children: ReactNode }) {
  const router = useRouter();
  const cache = useRepositorioConsultas();
  const { dados: perfil } = useMeuPerfil();
  const [saindo, setSaindo] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);

  let titulo = "Dashboard";
  if (rota === "/usuario") titulo = "Minha conta";
  else if (rota.startsWith("/admin/usuarios")) {
    titulo = rota === "/admin/usuarios" ? "Funcionários" :
      rota === "/admin/usuarios/novo" ? "Cadastrar funcionário" : "Editar funcionário";
  } else if (rota.startsWith("/contratos")) {
    titulo = rota === "/contratos" ? "Gestão de Contratos" :
      rota === "/contratos/novo" ? "Cadastrar contrato" :
      rota.endsWith("/editar") ? "Editar contrato" : "Detalhes do contrato";
  }

  async function sair() {
    if (saindo || !confirmarSaida) return;
    setSaindo(true);
    try {
      await Session.signOut();
      setConfirmarSaida(false);
      cache.limpar(); // Apenas apos logout CONFIRMADO; aborta requests da sessao anterior.
      // Ao entrar em /login, CabecalhoInterno será desmontado e limpará o estado.
      router.replace("/login");
    } catch {
      toastErro("Não foi possível sair. Tente novamente.");
      setSaindo(false);
    }
  }

  return <div className="flex min-h-screen min-w-0 bg-background font-sans text-foreground">
    <MenuLateral />
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex min-h-11 items-center justify-between gap-2 border-b border-brand-green/20 bg-background px-4 py-1 md:px-6">
        <h1 className="min-w-0 text-base font-semibold">{titulo}</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {perfil?.ativo && <Link href="/usuario" aria-label="Abrir minha conta" title="Minha conta"
            className="hidden min-w-0 max-w-64 flex-col items-end rounded-lg px-2 py-0.5 leading-tight transition-colors hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon sm:flex">
            <span className="max-w-full truncate text-xs font-semibold text-foreground">{perfil.nome?.trim() || 'Minha conta'}</span>
            <span className="text-[11px] text-brand-neon">{perfil.perfil === 'ADMINISTRADOR' ? 'Administrador' : perfil.perfil === 'GESTOR' ? 'Gestor' : 'Colaborador'}</span>
          </Link>}
          <button type="button" onClick={() => setConfirmarSaida(true)} disabled={saindo} aria-label="Sair" title="Encerrar sessão"
            className="inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent text-foreground/80 cursor-pointer transition-colors hover:text-error-text hover:opacity-100 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-70">
            {saindo ? <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3a9 9 0 1 1-9 9" /></svg> :
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>
              </svg>}
          </button>
        </div>
      </header>
      {confirmarSaida && <ConfirmacaoSimples titulo="Sair da conta?"
        descricao="Deseja realmente encerrar sua sessão neste dispositivo?"
        confirmar="Sair da conta" perigoso ocupado={saindo}
        onCancelar={() => setConfirmarSaida(false)} onConfirmar={() => void sair()} />}
      <MenuMobile />
      <main id="conteudo-principal" className="min-w-0 flex-1 px-4 py-5 md:px-6">
        <div className="mx-auto w-full min-w-0 max-w-7xl">{children}</div>
      </main>
    </div>
  </div>;
}
