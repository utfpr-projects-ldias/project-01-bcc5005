"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";

// 1. Schema de validação do Login com Zod
const loginSchema = z.object({
  email: z.string().email("Digite um e-mail válido"),
  password: z.string().min(1, "A senha é obrigatória"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [formData, setFormData] = useState<LoginFormValues>({
    email: "",
    password: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormValues, string>>>({});
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Limpa o erro do campo conforme o usuário digita
    if (errors[e.target.name as keyof LoginFormValues]) {
      setErrors({ ...errors, [e.target.name]: undefined });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage("");

    // Validando com Zod
    const result = loginSchema.safeParse(formData);

    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LoginFormValues, string>> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as keyof LoginFormValues;
        fieldErrors[path] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSuccessMessage("Login validado com sucesso! (Integre com sua API aqui)");
    console.log("Dados de login válidos:", result.data);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground font-sans">
      <div className="w-full max-w-md p-8 rounded-2xl bg-brand-darkgreen/40 border border-brand-green/30 shadow-lg backdrop-blur-md">
        
        {/* Título */}
        <div className="text-center mb-8">
          <Link href="/" className="flex items-center justify-center gap-3 group">
            <img 
              src="/favicon.ico" 
              alt="Ícone PRD" 
              className="h-8 w-8 object-contain rounded-md"
            />
            <span className="font-bold text-2xl tracking-wide text-brand-neon group-hover:opacity-90 transition-opacity">
              PRD
            </span>
          </Link>
          <h1 className="text-xl font-semibold mt-4 text-foreground">Acesse sua conta</h1>
          <p className="text-sm text-foreground/60 mt-1">Entre com seus dados para continuar</p>
        </div>

        {/* Mensagem de Sucesso */}
        {successMessage && (
          <div className="mb-4 p-3 rounded-lg bg-brand-green/20 border border-brand-green text-brand-neon text-sm text-center">
            {successMessage}
          </div>
        )}

        {/* Formulário com Zod */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

          <button 
            type="submit"
            className="w-full py-3 rounded-lg bg-brand-green text-background font-semibold hover:opacity-90 transition-opacity mt-2"
          >
            Entrar
          </button>
        </form>

        {/* Rodapé do card */}
        <div className="text-center mt-6 text-sm text-foreground/60">
          Não tem uma conta?{" "}
          <Link href="/cadastro" className="text-brand-neon hover:underline font-medium">
            Cadastre-se
          </Link>
        </div>

      </div>

      <div className="mt-8">
        <Link href="/" className="text-sm text-foreground/50 hover:text-brand-green transition-colors">
          &larr; Voltar para a página inicial
        </Link>
      </div>
    </div>
  );
}