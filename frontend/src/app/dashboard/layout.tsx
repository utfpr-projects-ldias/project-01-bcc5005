"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doesSessionExist } from "supertokens-web-js/recipe/session";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const sessionExists = await doesSessionExist();

        if (!sessionExists) {
          router.replace("/login");
          return;
        }

        setAuthorized(true);
      } catch (err) {
        console.error("Erro ao verificar sessão:", err);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [router]);

  // Durante a validação da sessão, exibe um estado vazio/neutro para evitar flash de conteúdo protegido
  if (loading || !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-sm text-foreground/60 animate-pulse">
          Carregando ambiente seguro...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}