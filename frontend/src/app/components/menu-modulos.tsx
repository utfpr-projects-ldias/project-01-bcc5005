"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { consultarMeuPerfil, type MeuPerfil } from "@/lib/admin-usuarios";

type Item = { nome: string; href?: string; aviso?: string };

function useItens(): Item[] {
  const [perfil, setPerfil] = useState<MeuPerfil | null>(null);
  useEffect(() => {
    let valido = true;
    void consultarMeuPerfil().then((p) => { if (valido) setPerfil(p); }).catch(() => { if (valido) setPerfil(null); });
    return () => { valido = false; };
  }, []);
  return [
    { nome: 'Dashboard', href: '/dashboard' },
    // HU05, Sprint 03: CRUD real integrado à API na continuidade TEC07.
    { nome: 'Contratos', href: '/contratos' },
    // HU08 ainda pertence à Sprint 04, não ao débito histórico de HU05.
    { nome: 'Atividades', aviso: 'Sprint 04 · em desenvolvimento' },
    { nome: 'Evidências', aviso: 'Sprint 05' },
    { nome: 'Relatórios', aviso: 'Sprint 06' },
    ...(perfil?.ativo && perfil.perfil === 'ADMINISTRADOR' ? [{ nome: 'Administração', href: '/admin/usuarios' }] : []),
  ];
}

function Itens({ compactos = false }: { compactos?: boolean }) {
  const itens = useItens();
  const path = usePathname();
  const ativo = (href: string) => path === href ||
    ((href === '/contratos' || href === '/admin/usuarios') && path.startsWith(`${href}/`));
  return <>
    {itens.map((item) => item.href ? (
      <Link key={item.nome} href={item.href} aria-current={ativo(item.href) ? 'page' : undefined}
        className={`${compactos ? 'px-3 py-2' : 'block px-4 py-2.5'} rounded-lg text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-green ${ativo(item.href) ? 'bg-brand-green text-background' : 'hover:bg-brand-darkgreen/40'}`}>
        {item.nome}{item.aviso && <span className="ml-1 text-xs font-normal opacity-70"> · {item.aviso}</span>}
      </Link>
    ) : (
      <span key={item.nome} className={`${compactos ? 'px-3 py-2' : 'block px-4 py-2.5'} rounded-lg text-xs text-foreground/50`} title={item.aviso}>
        {item.nome} · {item.aviso}
      </span>
    ))}
  </>;
}

/** Uma definição de links/permissões para desktop e celular; API continua autoridade. */
export function MenuLateral() {
  return <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-brand-green/20 bg-background/50 p-6 md:flex" aria-label="Navegação principal">
    <Link href="/dashboard" className="mb-8 block text-xl font-bold text-brand-neon">Gestão Contratual</Link>
    <nav className="space-y-1"><Itens /></nav>
  </aside>;
}

export function MenuMobile() {
  return <nav aria-label="Navegação móvel" className="flex flex-wrap gap-1 border-b border-brand-green/20 p-2 md:hidden">
    <Itens compactos />
  </nav>;
}
