"use client";

import Link from "next/link";
import { useMeuPerfil } from '@/hooks/use-meu-perfil';

/** Menu é apenas UX: o NestJS continua responsável pela autorização real. */
export function AdminUsuariosLink() {
  const { dados: perfil } = useMeuPerfil();
  const administrador = !!perfil?.ativo && perfil.perfil === 'ADMINISTRADOR';
  if (!administrador) return null;
  return (
    <Link href="/admin/usuarios"
      className="rounded-lg border border-brand-green/30 px-3 py-2 text-xs font-medium text-brand-neon transition-colors hover:bg-brand-green/10 sm:text-sm">
      Usuários / Administração
    </Link>
  );
}
