"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { ErroApi, consultarMeuPerfil } from "@/lib/admin-usuarios";
import { CHAVE_PERFIL } from "@/hooks/use-meu-perfil";
import { chaveTexto } from "@/lib/repositorio-consultas";
import { useMeuPerfil } from "@/hooks/use-meu-perfil";
import { useRepositorioConsultas } from "@/app/components/provedor-consultas";
import { IndicadorCarregamento } from "@/app/components/indicador-carregamento";

/** Exige sessão SuperTokens E usuário ativo no domínio, mesmo com cookie antigo. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const cache = useRepositorioConsultas();
  const [temSessao, setTemSessao] = useState(false);
  const perfilConsulta = useMeuPerfil(temSessao);
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
        // A sessao e verificada pelo SuperTokens; o perfil e compartilhado pelo provider.
        if (ativo) setTemSessao(true);
        const perfil = await cache.buscar(chaveTexto(CHAVE_PERFIL), () => consultarMeuPerfil(), { validadeMs: 10_000 });
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
  }, [router, cache]);

  if (carregando || (autorizado && perfilConsulta.carregando)) return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <IndicadorCarregamento texto="Validando sessão e permissões..." />
    </div>
  );
  if (!autorizado || !perfilConsulta.dados?.ativo) return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <p role="alert" className="text-sm">{erro || "Sessão encerrada. Entre novamente."}</p>
    </div>
  );
  return <>{children}</>;
}
