"use client";
import { useEffect, useState } from 'react';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { PainelAdministracao } from './usuarios/components/painel-administracao';
import MinhaContaPage from '../usuario/page';

/** Administração reúne o gerenciamento de pessoas e a conta pessoal.
 * Minha conta é acessível também a gestores e colaboradores. */
export default function AdministracaoPage() {
  const { dados: perfil, carregando } = useMeuPerfil();
  const podeGerenciar = Boolean(perfil?.ativo && perfil.perfil === 'ADMINISTRADOR');
  const [aba, setAba] = useState<'funcionarios'|'conta'>('funcionarios');
  useEffect(() => { if (new URLSearchParams(window.location.search).get('aba') === 'conta') setAba('conta'); }, []);
  const selecionada = podeGerenciar && aba === 'funcionarios' ? 'funcionarios' : 'conta';
  return <section className="min-w-0 space-y-5" aria-label="Administração">
    <header className="space-y-1"><h2 className="text-xl font-semibold">Administração</h2>
      <p className="text-sm text-foreground/65">Pessoas, permissões e dados da sua conta.</p></header>
    <nav role="tablist" aria-label="Seções da administração" className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-brand-green/30 bg-background p-1">
      {podeGerenciar && <button role="tab" aria-selected={selecionada === 'funcionarios'} type="button" onClick={()=>setAba('funcionarios')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${selecionada==='funcionarios'?'bg-brand-green/25 text-brand-neon':'text-foreground/70 hover:bg-brand-green/10'}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 4 5"/></svg> Funcionários</button>}
      <button role="tab" aria-selected={selecionada==='conta'} type="button" onClick={()=>setAba('conta')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${selecionada==='conta'?'bg-brand-green/25 text-brand-neon':'text-foreground/70 hover:bg-brand-green/10'}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg> Minha conta</button>
    </nav>
    {carregando && !perfil ? <p role="status">Consultando acesso...</p> : <div role="tabpanel" aria-label={selecionada === 'funcionarios' ? 'Funcionários' : 'Minha conta'} className="min-w-0">
      {selecionada === 'funcionarios' ? <PainelAdministracao vista="lista" /> : <MinhaContaPage />}
    </div>}
  </section>;
}
