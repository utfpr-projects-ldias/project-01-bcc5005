"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { consultarMeuPerfil } from "@/lib/admin-usuarios";

/** Menu é apenas UX: o NestJS continua responsável pela autorização real. */
export function AdminUsuariosLink() {
  const [administrador, setAdministrador] = useState(false);

  useEffect(() => {
    let ativo = true;
    void consultarMeuPerfil().then((perfil) => {
      if (ativo) setAdministrador(perfil.ativo && perfil.perfil === "ADMINISTRADOR");
    }).catch(() => { if (ativo) setAdministrador(false); });
    return () => { ativo = false; };
  }, []);

  if (!administrador) return null;
  return (
    <Link href="/admin/usuarios"
      className="rounded-lg border border-brand-green/30 px-3 py-2 text-xs font-medium text-brand-neon transition-colors hover:bg-brand-green/10 sm:text-sm">
      Usuários / Administração
    </Link>
  );
}
