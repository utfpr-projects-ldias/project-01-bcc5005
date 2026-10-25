import Link from "next/link";
import Image from "next/image";

export default function CadastroInativoPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      {/* Header Simples */}
      <header className="w-full border-b border-brand-green/20 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-center">
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/favicon.ico"
              alt="Ícone PRD"
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 object-contain rounded-md"
            />
            <span className="font-bold text-xl tracking-wide text-brand-neon">
              PRD
            </span>
          </Link>
        </div>
      </header>

      {/* Conteúdo Informativo (Sem formulário de cadastro) */}
      <main className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="max-w-lg mx-auto text-center flex flex-col items-center gap-6 p-8 rounded-2xl border border-brand-green/20 bg-background/50 shadow-sm">
          
          <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center text-brand-green">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Acesso Restrito
          </h1>

          <p className="text-foreground/70 text-sm leading-relaxed">
            O autocadastro público de contas foi desativado. O acesso ao sistema é realizado exclusivamente mediante provisionamento de conta efetuado por um Administrador institucional.
          </p>

          <div className="pt-4 w-full">
            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center rounded-lg bg-brand-green px-6 py-3 text-sm font-semibold text-background hover:opacity-90 transition-opacity shadow-sm"
            >
              Ir para a Página de Login
            </Link>
          </div>
          
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 border-t border-brand-green/10 bg-background text-center">
        <p className="text-sm text-foreground/50">&copy; 2026 Project-01. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}