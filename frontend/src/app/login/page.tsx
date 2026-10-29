"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LinkVoltar } from "@/app/components/link-voltar";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signIn } from "supertokens-web-js/recipe/emailpassword";
import { doesSessionExist } from "supertokens-web-js/recipe/session";
import { consultarMeuPerfil, ErroApi } from "@/lib/admin-usuarios";
import { initSuperTokens } from "@/config/supertokens";
import { IndicadorCarregamento } from "@/app/components/indicador-carregamento";
import { z } from "zod";

// 1. Schema de validação do Login com Zod
const loginSchema = z.object({
  email: z.string().email("Digite um e-mail válido"),
  password: z.string().min(1, "A senha é obrigatória"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<LoginFormValues>({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormValues, string>>>({});
  const [fase, setFase] = useState<"verificando" | "pronto" | "redirecionando">("verificando");
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let montado = true;
    async function verificarSessao() {
      try {
        initSuperTokens();
        if (await doesSessionExist()) {
          const perfil = await consultarMeuPerfil();
          if (!montado) return;
          if (perfil.ativo) {
            setFase("redirecionando");
            router.replace("/dashboard");
            return;
          }
          setServerError("Conta inativa. Procure um Administrador.");
        }
      } catch (erro) {
        if (!montado) return;
        if (erro instanceof ErroApi && erro.status === 403) {
          setServerError("Conta inativa ou sem autorização. Procure um Administrador.");
        } else if (!(erro instanceof ErroApi && erro.status === 401)) {
          setServerError("Não foi possível verificar a sessão. Confira a conexão e tente entrar.");
        }
      } finally {
        if (montado) setFase((estado) => estado === "redirecionando" ? estado : "pronto");
      }
    }
    void verificarSessao();
    return () => { montado = false; };
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Limpa o erro do campo conforme o usuário digita
    if (errors[e.target.name as keyof LoginFormValues]) {
      setErrors({ ...errors, [e.target.name]: undefined });
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || fase !== "pronto") return;
    setServerError("");

    // O preenchimento automático do navegador pode não disparar onChange no React.
    // Leia os valores realmente presentes no formulário ao confirmar o login.
    const campos = new FormData(e.currentTarget);
    const result = loginSchema.safeParse({
      email: String(campos.get("email") ?? ""),
      password: String(campos.get("password") ?? ""),
    });
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LoginFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof LoginFormValues;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      initSuperTokens();
      const response = await signIn({
        formFields: [
          { id: "email", value: result.data.email.trim().toLowerCase() },
          { id: "password", value: result.data.password },
        ],
      });
      if (response.status !== "OK") {
        setServerError("E-mail ou senha inválidos, ou login não permitido.");
        return;
      }
      setFase("redirecionando");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setServerError("Erro de conexão ao entrar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (fase !== "pronto") return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
      <IndicadorCarregamento texto={fase === "verificando" ? "Verificando sessão..." : "Abrindo painel..."} />
    </main>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground font-sans">
      <div className="w-full max-w-md p-8 rounded-2xl bg-brand-darkgreen/40 border border-brand-green/30 shadow-lg backdrop-blur-md">
        
        {/* Título */}
        <div className="text-center mb-8">
          <Link href="/" className="flex items-center justify-center gap-3 group">
            <Image
              src="/favicon.ico"
              alt="Ícone PRD"
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 object-contain rounded-md"
            />
            <span className="font-bold text-2xl tracking-wide text-brand-neon group-hover:opacity-90 transition-opacity">
              PRD
            </span>
          </Link>
          <h1 className="text-xl font-semibold mt-4 text-foreground">Acesse sua conta</h1>
          <p className="text-sm text-foreground/60 mt-1">Acesse com a conta criada pelo Administrador da instituição.</p>
        </div>

        {serverError && (
          <p role="alert" className="mb-4 text-sm text-red-400">{serverError}</p>
        )}

        {/* Formulário com Zod */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email-login" className="block text-sm font-medium text-foreground/80 mb-1">E-mail</label>
            <input 
              type="email" 
              id="email-login"
              name="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "erro-login-email" : undefined}
              value={formData.email}
              onChange={handleChange}
              placeholder="seu@email.com"
              className={`w-full px-4 py-2.5 rounded-lg bg-background border text-foreground focus:outline-none transition-colors text-sm ${
                errors.email ? "border-red-500 focus:border-red-500" : "border-brand-green/30 focus:border-brand-neon"
              }`}
            />
            {errors.email && <p id="erro-login-email" role="alert" className="mt-1 text-xs text-red-400">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="senha-login" className="block text-sm font-medium text-foreground/80 mb-1">Senha</label>
            <input 
              type="password" 
              id="senha-login"
              name="password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "erro-login-senha" : undefined}
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              className={`w-full px-4 py-2.5 rounded-lg bg-background border text-foreground focus:outline-none transition-colors text-sm ${
                errors.password ? "border-red-500 focus:border-red-500" : "border-brand-green/30 focus:border-brand-neon"
              }`}
            />
            {errors.password && <p id="erro-login-senha" role="alert" className="mt-1 text-xs text-red-400">{errors.password}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting || fase !== "pronto"}
            className="w-full py-3 rounded-lg bg-brand-green text-background font-semibold hover:opacity-90 transition-opacity mt-2"
          >
            {submitting ? <IndicadorCarregamento texto="Verificando acesso..." compacto /> : "Entrar"}
          </button>
        </form>

      </div>

      <div className="mt-8">
        <LinkVoltar href="/">Voltar para a página inicial</LinkVoltar>
      </div>
    </div>
  );
}