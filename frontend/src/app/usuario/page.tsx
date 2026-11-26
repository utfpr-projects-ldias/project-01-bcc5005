'use client';
import { useState, type FormEvent } from 'react';
import { LIMITES_CONTA, nomeContaSchema, emailContaSchema, senhaContaSchema } from '@/lib/validacao-conta';
import { useRouter } from 'next/navigation';
import { useMeuPerfil, CHAVE_PERFIL } from '@/hooks/use-meu-perfil';
import { alterarMeuEmail, alterarMeuNome, alterarMinhaSenha, ErroApi } from '@/lib/admin-usuarios';
import { useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { toastSucesso } from '@/app/components/toast-notificacoes';

const campo = 'w-full rounded-lg border border-[color:var(--pi-admin-borda)] bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-[#7bafc3]';
const botao = 'rounded-lg bg-[#35616f] px-4 py-2 font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50';
function mensagemErro(e: unknown): string {
  if (e instanceof ErroApi) return e.status === 401 ? 'Senha atual incorreta ou sessão expirada.' : e.status === 409 ? 'E-mail indisponível ou senha repetida.' : e.message;
  return 'Não foi possível completar a operação.';
}

export default function MinhaContaPage() {
  const { dados: perfil, erro, carregando } = useMeuPerfil();
  const cache = useRepositorioConsultas();
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senhaEmail, setSenhaEmail] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState('');
  const admin = perfil?.ativo && perfil.perfil === 'ADMINISTRADOR';

  async function enviarNome(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!perfil?.ativo || enviando) return;
    const validacao = nomeContaSchema.safeParse(nome);
    if (!validacao.success) { setFalha(validacao.error.issues[0]?.message ?? 'Nome inválido.'); return; }
    setEnviando(true); setFalha('');
    try {
      await alterarMeuNome(validacao.data);
      cache.invalidar(CHAVE_PERFIL);
      setNome('');
      toastSucesso('Nome atualizado.');
    } catch (err) { setFalha(mensagemErro(err)); }
    finally { setEnviando(false); }
  }
  async function enviarEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!admin || enviando) return;
    const validacao = emailContaSchema.safeParse(email);
    if (!validacao.success) { setFalha(validacao.error.issues[0]?.message ?? 'E-mail inválido.'); return; }
    setEnviando(true); setFalha('');
    try {
      const atualizado = await alterarMeuEmail(validacao.data, senhaEmail);
      cache.invalidar(CHAVE_PERFIL);
      setEmail(''); setSenhaEmail('');
      toastSucesso(`E-mail atualizado para ${atualizado.email}. Use este endereço no próximo login.`);
    } catch (err) { setFalha(mensagemErro(err)); }
    finally { setEnviando(false); }
  }
  async function enviarSenha(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!admin || enviando) return;
    if (novaSenha !== confirmar) { setFalha('As senhas novas não coincidem.'); return; }
    const validacao = senhaContaSchema.safeParse(novaSenha);
    if (!validacao.success) { setFalha(validacao.error.issues[0]?.message ?? 'Senha inválida.'); return; }
    setEnviando(true); setFalha('');
    try {
      await alterarMinhaSenha(senhaAtual, validacao.data);
      setSenhaAtual(''); setNovaSenha(''); setConfirmar('');
      toastSucesso('Senha alterada. Faça login novamente.');
      // Após revogação, deixe explícito o novo login sem continuar com sessão antiga.
      cache.limpar();
      router.replace('/login');
    } catch (err) { setFalha(mensagemErro(err)); }
    finally { setEnviando(false); }
  }
  return <section className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-foreground sm:px-8">
    <div><h1 className="text-2xl font-bold">Minha conta</h1><p className="text-sm text-foreground/70">Consulte sua identificação e atualize seus dados pessoais.</p></div>
    {carregando && !perfil && <p role="status">Consultando conta...</p>}
    {Boolean(erro) && <p role="alert">Não foi possível consultar a conta.</p>}
    {perfil && <section aria-label="Dados da conta" className="rounded-xl border border-[color:var(--pi-admin-borda)] bg-[var(--pi-admin-superficie)] p-4 text-sm">
      <p className="font-semibold break-words">{perfil.nome?.trim() || 'Nome não informado'}</p>
      <p className="mt-1 break-all text-foreground/70">{perfil.email}</p>
      <p className="mt-1 text-foreground">{perfil.perfil === 'ADMINISTRADOR' ? 'Administrador' : perfil.perfil === 'GESTOR' ? 'Gestor' : 'Colaborador'}</p>
    </section>}
    {perfil?.ativo && <>
      {falha && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{falha}</p>}
      <form onSubmit={enviarNome} aria-label="Alterar meu nome" className="space-y-3 rounded-xl border border-[color:var(--pi-admin-borda)] p-4 sm:p-5">
        <div><h2 className="font-semibold">Alterar meu nome</h2><p className="mt-1 text-xs text-foreground/60">Identificação exibida em seu perfil e no cabeçalho.</p></div>
        <label className="block text-sm" htmlFor="conta-nome">Nome</label>
        <input className={campo} id="conta-nome" type="text" name="nome" autoComplete="name" value={nome} onChange={e => setNome(e.target.value)}
          placeholder={perfil.nome ?? 'Seu nome'} minLength={3} maxLength={LIMITES_CONTA.nome} required />
        <p className="text-right text-xs text-foreground/65">{nome.length}/{LIMITES_CONTA.nome} · mínimo 3</p>
        <button type="submit" className={botao} disabled={enviando}>{enviando ? 'Salvando...' : 'Atualizar nome'}</button>
      </form>
    </>}
    {perfil && !admin && <p className="text-xs text-foreground/60">Alterações de e-mail e senha nesta tela são exclusivas do Administrador.</p>}
    {admin && <>
      <form onSubmit={enviarEmail} aria-label="Alterar meu e-mail" className="space-y-4 rounded-xl border border-[color:var(--pi-admin-borda)] p-5">
        <h2 className="font-semibold">Alterar meu e-mail</h2>
        <label className="block text-sm" htmlFor="conta-email">Novo e-mail</label>
        <input className={campo} id="conta-email" type="email" autoComplete="email" required maxLength={LIMITES_CONTA.email} value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="text-right text-xs text-foreground/65">{email.length}/{LIMITES_CONTA.email}</p>
        <label className="block text-sm" htmlFor="conta-senha-email">Senha atual</label>
        <input className={campo} id="conta-senha-email" type="password" maxLength={256} autoComplete="current-password" required value={senhaEmail} onChange={(e) => setSenhaEmail(e.target.value)} />
        <button className={botao} type="submit" disabled={enviando}> {enviando ? 'Salvando...' : 'Atualizar e-mail'} </button>
      </form>
      <form onSubmit={enviarSenha} aria-label="Alterar minha senha" className="space-y-4 rounded-xl border border-[color:var(--pi-admin-borda)] p-5">
        <h2 className="font-semibold">Alterar minha senha</h2>
        <p className="text-xs text-foreground/70">De 12 a 30 caracteres, incluindo maiúscula, minúscula, número e símbolo. Você precisará fazer login novamente.</p>
        <label className="block text-sm" htmlFor="conta-senha-atual">Senha atual</label>
        <input className={campo} id="conta-senha-atual" type="password" maxLength={256} autoComplete="current-password" required value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} />
        <label className="block text-sm" htmlFor="conta-senha-nova">Nova senha</label>
        <input className={campo} id="conta-senha-nova" type="password" autoComplete="new-password" required minLength={12} maxLength={LIMITES_CONTA.senha} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
        <p className="text-right text-xs text-foreground/65">{novaSenha.length}/{LIMITES_CONTA.senha} · mínimo 12</p>
        <label className="block text-sm" htmlFor="conta-senha-confirmar">Confirme a nova senha</label>
        <input className={campo} id="conta-senha-confirmar" type="password" maxLength={LIMITES_CONTA.senha} autoComplete="new-password" required value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
        <p className="text-right text-xs text-foreground/65">{confirmar.length}/{LIMITES_CONTA.senha} · mínimo 12</p>
        <button className={botao} type="submit" disabled={enviando}> {enviando ? 'Salvando...' : 'Alterar minha senha'} </button>
      </form>
    </>}
  </section>;
}
