"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { doesEmailExist, signUp } from "supertokens-web-js/recipe/emailpassword";
import { z } from "zod";

// 1. Definindo o Schema de Validação com Zod
const registerSchema = z.object({
  name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres"),
  email: z.string().email("Digite um e-mail válido"),
  password: z.string()
    .min(8, "A senha deve ter pelo menos 8 caracteres")
    .regex(/[a-z]/, "A senha precisa de uma letra minúscula")
    .regex(/[0-9]/, "A senha precisa de um número"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function CadastroPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<RegisterFormValues>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof RegisterFormValues, string>>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Limpa o erro do campo conforme o usuário digita
    if (errors[e.target.name as keyof RegisterFormValues]) {
      setErrors({ ...errors, [e.target.name]: undefined });
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSuccessMessage("");
    setServerError("");

    const result = registerSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof RegisterFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof RegisterFormValues;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const email = result.data.email.trim().toLowerCase();
      const existing = await doesEmailExist({ email });
      if (existing.doesExist) {
        setErrors({ email: "E-mail já cadastrado. Faça login." });
        return;
      }
      const response = await signUp({
        formFields: [
          { id: "email", value: email },
          { id: "password", value: result.data.password },
        ],
      });
      if (response.status !== "OK") {
        setServerError("Não foi possível criar a conta. Confira os dados e tente novamente.");
        return;
      }
      setSuccessMessage("Conta criada com sucesso!");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setServerError("Erro de conexão ao cadastrar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground font-sans">
      <div className="w-full max-w-md p-8 rounded-2xl bg-brand-darkgreen/40 border border-brand-green/30 shadow-lg backdrop-blur-md">
        
{/* Título / Logo */}
        <div className="text-center mb-8 flex flex-col items-center">
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
          <h1 className="text-xl font-semibold mt-4 text-foreground">Crie sua conta</h1>
          <p className="text-sm text-foreground/60 mt-1">Preencha os dados abaixo para começar</p>
        </div>

        {serverError && (
          <p role="alert" className="mb-4 text-sm text-red-400">{serverError}</p>
        )}
        {/* Mensagem de Sucesso */}
        {successMessage && (
          <div className="mb-4 p-3 rounded-lg bg-brand-green/20 border border-brand-green text-brand-neon text-sm text-center">
            {successMessage}
          </div>
        )}

        {/* Formulário de Cadastro */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Nome Completo</label>
            <input 
              type="text" 
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Seu nome"
              className={`w-full px-4 py-2.5 rounded-lg bg-background border text-foreground focus:outline-none transition-colors text-sm ${
                errors.name ? "border-red-500 focus:border-red-500" : "border-brand-green/30 focus:border-brand-neon"
              }`}
            />
            {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">E-mail</label>
            <input 
              type="email" 
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="seu@email.com"
              className={`w-full px-4 py-2.5 rounded-lg bg-background border text-foreground focus:outline-none transition-colors text-sm ${
                errors.email ? "border-red-500 focus:border-red-500" : "border-brand-green/30 focus:border-brand-neon"
              }`}
            />
            {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Senha</label>
            <input 
              type="password" 
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              className={`w-full px-4 py-2.5 rounded-lg bg-background border text-foreground focus:outline-none transition-colors text-sm ${
                errors.password ? "border-red-500 focus:border-red-500" : "border-brand-green/30 focus:border-brand-neon"
              }`}
            />
            {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">Confirmar Senha</label>
            <input 
              type="password" 
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="••••••••"
              className={`w-full px-4 py-2.5 rounded-lg bg-background border text-foreground focus:outline-none transition-colors text-sm ${
                errors.confirmPassword ? "border-red-500 focus:border-red-500" : "border-brand-green/30 focus:border-brand-neon"
              }`}
            />
            {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-brand-green text-background font-semibold hover:opacity-90 transition-opacity mt-2 shadow-sm"
          >
            {submitting ? "Cadastrando..." : "Cadastrar"}
          </button>
        </form>

        {/* Rodapé do card (Link para ir para o Login) */}
        <div className="text-center mt-6 text-sm text-foreground/60">
          Já tem uma conta?{" "}
          <Link href="/login" className="text-brand-neon hover:underline font-medium">
            Faça login
          </Link>
        </div>

      </div>

      {/* Voltar para Home */}
      <div className="mt-8">
        <Link href="/" className="text-sm text-foreground/50 hover:text-brand-green transition-colors">
          &larr; Voltar para a página inicial
        </Link>
      </div>
    </div>
  );
}