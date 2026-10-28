"use client";

import { useEffect, useState } from "react";
import { consultarMeuPerfil, type MeuPerfil } from "@/lib/admin-usuarios";

const nomes: Record<MeuPerfil["perfil"], string> = {
  ADMINISTRADOR: "Administrador", GESTOR: "Gestor", COLABORADOR: "Colaborador",
};

/** Identidade vem do servidor, não de e-mail, localStorage ou mock. */
export function IdentificacaoUsuario() {
  const [perfil, setPerfil] = useState<MeuPerfil | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let ativo = true;
    const atualizar = () => {
      void consultarMeuPerfil().then((dados) => {
        if (ativo) { setPerfil(dados); setErro(false); }
      }).catch(() => { if (ativo) setErro(true); });
    };
    atualizar();
    window.addEventListener("perfil-atualizado", atualizar);
    return () => { ativo = false; window.removeEventListener("perfil-atualizado", atualizar); };
  }, []);
  if (!perfil) return <span role="status" className="text-xs text-foreground/60">{erro ? "Perfil indisponível" : "Consultando conta..."}</span>;
  return (
    <div className="min-w-0 text-right text-xs sm:text-sm" aria-label="Conta autenticada">
      <p className="font-semibold truncate max-w-40 sm:max-w-64">{perfil.nome?.trim() || "Nome não informado"}</p>
      <p className="text-foreground/70 truncate max-w-40 sm:max-w-64">{perfil.email}</p>
      <p className="text-brand-neon">{nomes[perfil.perfil]}</p>
    </div>
  );
}
