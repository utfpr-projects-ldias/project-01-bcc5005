"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { consultarMeuPerfil, ErroApi } from "@/lib/admin-usuarios";
import { useRepositorioConsultas } from "./provedor-consultas";
import { IndicadorCarregamento } from "./indicador-carregamento";

type Estado = "verificando" | "autorizado" | "restrito" | "erro" | "redirecionando";

/**
 * Limite visual das rotas internas. Valida sessão E usuário ativo na API real.
 * Revalida ao regressar à aba (inclusive após revogação/inativação); não substitui
 * o guard NestJS, que segue validando TODA requisição no servidor.
 */
export function ProtecaoSessaoInterna({ children }: { children: ReactNode }) {
  const router = useRouter();
  const cache = useRepositorioConsultas();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [versaoIdentidade, setVersaoIdentidade] = useState(0);
  const ultimoUsuario = useRef<string | null>(null);
  const [jaAutorizado, setJaAutorizado] = useState(false);
  const abaFicouOcultaEm = useRef<number | null>(null);
  const ultimoRetorno = useRef<number | null>(null);

  useEffect(() => {
    let montado = true;
    let verificando = false;
    async function verificar() {
      if (verificando || !montado) return;
      verificando = true;
      setEstado("verificando"); // Evita exibir dados privados antigos durante revalidação.
      try {
        if (!await doesSessionExist()) {
          if (!montado) return;
          cache.limpar(); ultimoUsuario.current = null;
          setEstado("redirecionando");
          router.replace("/login");
          return;
        }
        const perfil = await consultarMeuPerfil(); // Bypassa TTL do cache, consulta API de domínio.
        if (!montado) return;
        if (!perfil.ativo) {
          cache.limpar(); ultimoUsuario.current = null;
          setEstado("restrito");
          return;
        }
        // Se a identidade mudou com o mesmo layout Next montado, nunca reutilizar
        // dados privados da conta anterior.
        if (ultimoUsuario.current && ultimoUsuario.current !== perfil.id) {
          cache.limpar();
          // Formulários locais pertencentes à identidade anterior não são reutilizados.
          setVersaoIdentidade(versao => versao + 1);
        }
        ultimoUsuario.current = perfil.id;
        setJaAutorizado(true);
        setEstado("autorizado");
      } catch (erro) {
        if (!montado) return;
        cache.limpar(); ultimoUsuario.current = null;
        if (erro instanceof ErroApi && erro.status === 401) {
          setEstado("redirecionando");
          router.replace("/login");
        } else if (erro instanceof ErroApi && erro.status === 403) {
          setEstado("restrito");
        } else {
          setEstado("erro"); // Não expor conteúdo protegido na falha de rede.
        }
      } finally {
        verificando = false;
      }
    }
    void verificar();
    // Um menu nativo <select>, seletor de arquivo ou popup do navegador pode
    // provocar blur/focus no Firefox sem mudança de aba. Não revalidar nesses
    // eventos: isso faria a tela inteira piscar enquanto o usuário edita.
    // Uma aba REALMENTE oculta sempre passa por visibilitychange.
    const aoVoltar = () => {
      if (document.hidden) {
        abaFicouOcultaEm.current ??= Date.now();
        return;
      }
      const inicio = abaFicouOcultaEm.current;
      abaFicouOcultaEm.current = null;
      if (inicio === null) return; // foco de seletor nativo, sem troca de aba
      const agora = Date.now();
      if (ultimoRetorno.current !== null && agora - ultimoRetorno.current < 1000) return;
      ultimoRetorno.current = agora;
      // Trocas breves não precisam ocultar a página. Após ausência mais longa,
      // revalidar sessão e perfil de domínio, preservando o layout.
      if (agora - inicio >= 4000) void verificar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      montado = false;
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router, cache]);

  if (estado === "autorizado" || (estado === "verificando" && jaAutorizado)) return <>
    {/* Mesmo durante a revalidação, o formulário e seus estados continuam montados.
        Ocultar o conteúdo enquanto se verificam permissões evita expor dados antigos. */}
    {/* Manter a geometria de TODAS as páginas enquanto a sessão é revalidada:
        display:none colapsava a página e deslocava a rolagem para cima.
        A visibilidade é ocultada e o conteúdo fica fora da árvore acessível até o aceite. */}
    <div key={versaoIdentidade} className="contents"
      style={{ visibility: estado === "autorizado" ? "visible" : "hidden" }}
      aria-hidden={estado !== "autorizado"}>{children}</div>
    {estado === "verificando" && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-background/95 p-6 text-foreground" role="status">
      <IndicadorCarregamento texto="Verificando sessão e permissões..." />
    </div>}
  </>;
  if (estado === "verificando" || estado === "redirecionando") return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground" role="status">
      <IndicadorCarregamento texto="Verificando sessão e permissões..." />
    </div>
  );
  if (estado === "restrito") return <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
    <p role="alert">Conta inativa ou sem autorização. Contate um Administrador.</p>
  </div>;
  return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
    <p role="alert">Não foi possível validar a sessão. Confira a conexão e tente novamente.</p>
    <button type="button" className="rounded-lg border border-brand-green/40 px-4 py-2" onClick={() => window.location.reload()}>
      Tentar novamente
    </button>
  </div>;
}
