'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMeuPerfil, CHAVE_PERFIL } from '@/hooks/use-meu-perfil';
import { alterarMeuEmail, alterarMinhaSenha, ErroApi } from '@/lib/admin-usuarios';
import { useRepositorioConsultas } from '@/app/components/provedor-consultas';

const campo = 'w-full rounded-lg border border-brand-green/40 bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-brand-green';
const botao = 'rounded-lg bg-brand-green px-4 py-2 font-semibold text-background transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50';
function mensagemErro(e: unknown): string {
  if (e instanceof ErroApi) return e.status === 401 ? 'Senha atual incorreta ou sessão expirada.' : e.status === 409 ? 'E-mail indisponível ou senha repetida.' : e.message;
  return 'Não foi possível completar a operação.';
}

export default function MinhaContaPage() {
  const { dados: perfil, erro, carregando } = useMeuPerfil();
  const cache = useRepositorioConsultas();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senhaEmail, setSenhaEmail] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [falha, setFalha] = useState('');
  const admin = perfil?.ativo && perfil.perfil === 'ADMINISTRADOR';

  async function enviarEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!admin || enviando) return;
    setEnviando(true); setAviso(''); setFalha('');
    try {
      const atualizado = await alterarMeuEmail(email.trim(), senhaEmail);
      cache.invalidar(CHAVE_PERFIL);
      setEmail(''); setSenhaEmail('');
      setAviso(`E-mail atualizado para ${atualizado.email}. Use este endereço no próximo login.`);
    } catch (err) { setFalha(mensagemErro(err)); }
    finally { setEnviando(false); }
  }
  async function enviarSenha(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!admin || enviando) return;
    if (novaSenha !== confirmar) { setFalha('As senhas novas não coincidem.'); return; }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).{12,128}$/.test(novaSenha)) {
      setFalha('A senha deve ter de 12 a 128 caracteres, com maiúscula, minúscula, número e símbolo.'); return;
    }
    setEnviando(true); setAviso(''); setFalha('');
    try {
      await alterarMinhaSenha(senhaAtual, novaSenha);
      setSenhaAtual(''); setNovaSenha(''); setConfirmar('');
      setAviso('Senha alterada. Todas as sessões foram revogadas; entre novamente com a nova senha.');
      // Após revogação, deixe explícito o novo login sem continuar com sessão antiga.
      cache.limpar();
      router.replace('/login');
    } catch (err) { setFalha(mensagemErro(err)); }
    finally { setEnviando(false); }
  }
  return <section className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-foreground sm:px-8">
    <div><h1 className="text-2xl font-bold">Minha conta</h1><p className="text-sm text-foreground/70">Atualize as suas credenciais de Administrador com a senha atual.</p></div>
    {carregando && !perfil && <p role="status">Consultando conta...</p>}
    {Boolean(erro) && <p role="alert">Não foi possível consultar a conta.</p>}
    {perfil && !admin && <p role="alert">Esta página de credenciais está disponível somente ao Administrador.</p>}
    {admin && <>
      <p className="rounded-xl border border-brand-green/30 p-4 text-sm">Conta: <strong>{perfil.nome || 'Administrador'}</strong> · {perfil.email}</p>
      {aviso && <p role="status" className="rounded-lg border border-brand-green p-3 text-sm">{aviso}</p>}
      {falha && <p role="alert" className="rounded-lg border border-red-500/50 p-3 text-sm text-red-400">{falha}</p>}
      <form onSubmit={enviarEmail} aria-label="Alterar meu e-mail" className="space-y-4 rounded-xl border border-brand-green/30 p-5">
        <h2 className="font-semibold">Alterar meu e-mail</h2>
        <label className="block text-sm" htmlFor="conta-email">Novo e-mail</label>
        <input className={campo} id="conta-email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="block text-sm" htmlFor="conta-senha-email">Senha atual</label>
        <input className={campo} id="conta-senha-email" type="password" autoComplete="current-password" required value={senhaEmail} onChange={(e) => setSenhaEmail(e.target.value)} />
        <button className={botao} type="submit" disabled={enviando}> {enviando ? 'Salvando...' : 'Atualizar e-mail'} </button>
      </form>
      <form onSubmit={enviarSenha} aria-label="Alterar minha senha" className="space-y-4 rounded-xl border border-brand-green/30 p-5">
        <h2 className="font-semibold">Alterar minha senha</h2>
        <p className="text-xs text-foreground/70">Mínimo de 12 caracteres, incluindo maiúscula, minúscula, número e símbolo. Você precisará fazer login novamente.</p>
        <label className="block text-sm" htmlFor="conta-senha-atual">Senha atual</label>
        <input className={campo} id="conta-senha-atual" type="password" autoComplete="current-password" required value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
        <label className="block text-sm" htmlFor="conta-senha-nova">Nova senha</label>
        <input className={campo} id="conta-senha-nova" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
        <label className="block text-sm" htmlFor="conta-senha-confirmar">Confirme a nova senha</label>
        <input className={campo} id="conta-senha-confirmar" type="password" autoComplete="new-password" required value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
        <button className={botao} type="submit" disabled={enviando}> {enviando ? 'Salvando...' : 'Alterar minha senha'} </button>
      </form>
    </>}
  </section>;
}
