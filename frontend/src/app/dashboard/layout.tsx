"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { consultarMeuPerfil, ErroApi } from "@/lib/admin-usuarios";

/** Exige sessão SuperTokens E usuário ativo no domínio, mesmo com cookie antigo. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    async function verificar() {
      try {
        if (!await doesSessionExist()) {
          router.replace("/login");
          return;
        }
        const perfil = await consultarMeuPerfil();
        if (ativo && perfil.ativo) setAutorizado(true);
        else if (ativo) setErro("Conta inativa. Contate um Administrador.");
      } catch (e) {
        if (!ativo) return;
        if (e instanceof ErroApi && e.status === 401) router.replace("/login");
        else setErro(e instanceof ErroApi && e.status === 403
          ? "Conta inativa ou não autorizada. Contate um Administrador."
          : "Não foi possível validar sua conta. Tente novamente.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void verificar();
    return () => { ativo = false; };
  }, [router]);

  if (carregando) return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-sm text-foreground/60 animate-pulse">Carregando ambiente seguro...</div>
    </div>
  );
  if (!autorizado) return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <p role="alert" className="text-sm">{erro || "Sessão encerrada. Entre novamente."}</p>
    </div>
  );
  return <>{children}</>;
}
