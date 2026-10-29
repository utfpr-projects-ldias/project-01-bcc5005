'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import Session from 'supertokens-web-js/recipe/session';
import { MenuLateral, MenuMobile } from '@/app/components/menu-modulos';
import { IndicadorCarregamento } from '@/app/components/indicador-carregamento';

export function AreaContratos({ titulo, children }: { titulo: string; children: ReactNode }) {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState('');
  async function sair() {
    if (saindo) return;
    setSaindo(true);
    try { await Session.signOut(); router.replace('/login'); router.refresh(); }
    catch { setErro('Não foi possível sair. Tente novamente.'); setSaindo(false); }
  }
  return <div className="min-h-screen flex bg-background text-foreground font-sans">
    <MenuLateral />
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-40 flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-brand-green/20 bg-background/90 px-4 py-3 backdrop-blur-md md:px-8">
        <div><h1 className="text-xl font-bold">{titulo}</h1><Link href="/dashboard" className="text-xs text-brand-neon underline">Voltar ao painel</Link></div>
        <div className="flex flex-wrap items-center gap-3">{erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}
          <button type="button" onClick={() => void sair()} disabled={saindo} className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 disabled:opacity-50">{saindo ? <IndicadorCarregamento texto="Saindo..." compacto /> : 'Sair'}</button></div>
      </header>
      <MenuMobile />
      <main className="flex-1 p-4 md:p-8"><div className="mx-auto max-w-5xl space-y-6">{children}</div></main>
    </div>
  </div>;
}
export function Aviso({ children, erro = false }: { children: ReactNode; erro?: boolean }) {
  return <p role={erro ? 'alert' : 'status'} className={`rounded-xl border p-4 text-sm ${erro ? 'border-red-500/40 text-red-400' : 'border-brand-green/30 text-foreground/75'}`}>{children}</p>;
}
