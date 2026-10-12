"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";

// 1. Definindo o Schema de Validação com Zod
const registerSchema = z.object({
  name: z.string().min(3, "O nome deve ter pelo menos 3 caracteres"),
  email: z.string().email("Digite um e-mail válido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function CadastroPage() {
  const [formData, setFormData] = useState<RegisterFormValues>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof RegisterFormValues, string>>>({});
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Limpa o erro do campo conforme o usuário digita
    if (errors[e.target.name as keyof RegisterFormValues]) {
      setErrors({ ...errors, [e.target.name]: undefined });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage("");

    // Validação usando o Zod
    const result = registerSchema.safeParse(formData);

    if (!result.success) {
      // Mapeia os erros do Zod para o objeto de erros do estado
      const fieldErrors: Partial<Record<keyof RegisterFormValues, string>> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as keyof RegisterFormValues;
        fieldErrors[path] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Se passou na validação do Zod
    setErrors({});
    setSuccessMessage("Cadastro validado com sucesso! (Integre com sua API aqui)");
    console.log("Dados válidos:", result.data);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground font-sans">
      <div className="w-full max-w-md p-8 rounded-2xl bg-brand-darkgreen/40 border border-brand-green/30 shadow-lg backdrop-blur-md">
        
{/* Título / Logo */}
        <div className="text-center mb-8 flex flex-col items-center">
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
          <h1 className="text-xl font-semibold mt-4 text-foreground">Crie sua conta</h1>
          <p className="text-sm text-foreground/60 mt-1">Preencha os dados abaixo para começar</p>
        </div>

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
            className="w-full py-3 rounded-lg bg-brand-green text-background font-semibold hover:opacity-90 transition-opacity mt-2 shadow-sm"
          >
            Cadastrar
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