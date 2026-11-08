"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMeuPerfil } from '@/hooks/use-meu-perfil';

type Item = { nome: string; href?: string; aviso?: string; icone: string };
function useItens(): Item[] {
  const { dados: perfil } = useMeuPerfil();
  return [
    { nome: 'Dashboard', href: '/dashboard', icone: 'inicio' },
    { nome: 'Contratos', href: '/contratos', icone: 'arquivo' },
    { nome: 'Atividades', aviso: 'Indisponível', icone: 'lista' },
    { nome: 'Evidências', aviso: 'Indisponível', icone: 'evidencia' },
    { nome: 'Relatórios', aviso: 'Indisponível', icone: 'relatorio' },
    ...(perfil?.ativo && perfil.perfil === 'ADMINISTRADOR'
      ? [{ nome: 'Funcionários', href: '/admin/usuarios', icone: 'usuarios' }, { nome: 'Minha conta', href: '/usuario', icone: 'conta' }] : []),
  ];
}
function IconeMenu({ tipo }: { tipo: string }) {
  return <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {tipo === 'inicio' ? <><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></> :
      tipo === 'arquivo' ? <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M7 10h10M7 14h7"/></> :
      tipo === 'usuarios' ? <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5"/></> :
      tipo === 'conta' ? <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></> :
      tipo === 'evidencia' ? <><rect x="4" y="5" width="16" height="15" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 18 5-5 3 3 3-2 3 4"/></> :
      tipo === 'relatorio' ? <><path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></> :
      <><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>}
  </svg>;
}
function Itens({ compactos = false, soIcones = false }: { compactos?: boolean; soIcones?: boolean }) {
  const itens = useItens();
  const path = usePathname();
  const ativo = (href: string) => path === href ||
    ((href === '/contratos' || href === '/admin/usuarios') && path.startsWith(`${href}/`));
  return <>{itens.map(item => {
    const selecionado = item.href ? ativo(item.href) : false;
    const classes = `${soIcones ? 'h-11 w-11 shrink-0 justify-center p-2' : compactos ? 'gap-2 px-3 py-2' : 'gap-3 px-3 py-3'} flex min-h-10 items-center rounded-xl transition-all duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-brand-green ${selecionado
      ? 'bg-brand-green/20 text-brand-neon shadow-[inset_3px_0_0_var(--accent-green),0_0_14px_rgba(95,211,74,.14)]'
      : 'text-foreground/80 hover:bg-brand-green/10 hover:text-brand-neon'}`;
    const conteudo = <><IconeMenu tipo={item.icone}/><span className={soIcones ? 'sr-only' : compactos ? 'text-xs font-medium' : 'max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-200 group-hover/nav:max-w-[135px] group-hover/nav:opacity-100 motion-reduce:transition-none'}>{item.nome}{item.aviso && compactos ? ` · ${item.aviso}` : ''}</span></>;
    return item.href ? <Link key={item.nome} href={item.href} title={item.nome} aria-label={item.nome} aria-current={selecionado ? 'page' : undefined} className={classes}>{conteudo}</Link>
      : <span key={item.nome} title={`${item.nome} · ${item.aviso}`} aria-label={`${item.nome} · ${item.aviso}`} className={`${classes} cursor-not-allowed opacity-50`}>{conteudo}</span>;
  })}</>;
}
export function MenuLateral() {
  return <aside className="group/nav sticky top-0 z-40 hidden h-screen w-[72px] shrink-0 flex-col overflow-hidden border-r border-brand-green/20 bg-background/95 px-2 py-4 transition-[width] duration-200 hover:w-56 motion-reduce:transition-none md:flex" aria-label="Navegação principal">
    <Link href="/dashboard" title="Gestão Contratual" aria-label="Gestão Contratual" className="mb-7 flex items-center gap-3 overflow-hidden px-3 text-brand-neon">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-green/30 bg-brand-green/10 text-lg font-black">G</span>
      <span className="max-w-0 whitespace-nowrap text-sm font-bold opacity-0 transition-all group-hover/nav:max-w-[150px] group-hover/nav:opacity-100">Gestão Contratual</span>
    </Link>
    <nav className="space-y-1"><Itens /></nav>
  </aside>;
}
export function MenuMobile() {
  return <nav aria-label="Navegação móvel" className="flex w-full flex-nowrap items-center justify-between gap-1 overflow-x-auto border-b border-brand-green/20 px-2 py-2 md:hidden"><Itens compactos soIcones /></nav>;
}
