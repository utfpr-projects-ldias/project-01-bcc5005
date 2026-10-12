import Link from "next/link";

export default function Home() {
  const categories = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Contratos", href: "/contratos" },
    { name: "Atividades", href: "/atividades" },
    { name: "Evidências", href: "/evidencias" },
    { name: "Relatórios", href: "/relatorios" },
    { name: "Usuários/Administração", href: "/admin/usuarios" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      <header className="w-full border-b border-brand-green/20 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-4">
          
          <Link href="/" className="flex items-center gap-3 group">
            <img 
              src="/favicon.ico" 
              alt="Ícone PRD" 
              className="h-8 w-8 object-contain rounded-md"
            />
            <span className="font-bold text-xl tracking-wide text-brand-neon group-hover:opacity-90 transition-opacity">
              PRD
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-6">
            {categories.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="text-sm font-medium text-foreground/80 hover:text-brand-green transition-colors"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium px-4 py-2 rounded-lg text-foreground hover:text-brand-green transition-colors"
            >
              Login
            </Link>
            <Link
              href="/cadastro"
              className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-green text-background hover:opacity-90 transition-opacity shadow-sm"
            >
              Cadastrar-se
            </Link>
          </div>
        </div>

        <div className="lg:hidden flex overflow-x-auto px-4 py-2.5 gap-4 border-t border-brand-green/10 bg-brand-darkgreen/40">
          {categories.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-xs whitespace-nowrap text-foreground hover:text-brand-green"
            >
              {item.name}
            </Link>
          ))}
        </div>
      </header>

      {/* Conteúdo Principal (Hero Section Centralizada) */}
      <main className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center gap-8">
          
          {/* Título Principal de Destaque */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tighter text-foreground leading-tight">
            PRD — Sistema de  {" "}
            <span className="text-brand-green">Gestão de Execução Contratual</span>.
          </h1>

          {/* Texto de Apoio */}
          <p className="text-xl md:text-2xl text-foreground/70 max-w-2xl mx-auto">
            Centralize a execução física, operacional, documental e comprobatória de contratos públicos. Acompanhe o planejado, o realizado e o comprovado em um dossiê digital único.
          </p>

          {/* Botão Grande Centralizado */}
          <div className="mt-6">
            <Link
              href="/cadastro"
              className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-brand-green px-12 py-4 text-lg font-semibold text-background transition-all duration-300 ease-out hover:scale-105 hover:shadow-lg hover:shadow-brand-green/20"
            >
              <span className="absolute inset-0 h-full w-full bg-gradient-to-r from-brand-green to-[#4bc137] opacity-0 transition-opacity duration-300 group-hover:opacity-100"></span>
              <span className="relative z-10 flex items-center gap-2">
                Cadastre-se agora
                <svg 
                  className="w-5 h-5 transition-transform group-hover:translate-x-1" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            </Link>
          </div>
          
        </div>
      </main>

      {/* Footer simples */}
      <footer className="w-full py-6 border-t border-brand-green/10 bg-background text-center">
        <p className="text-sm text-foreground/50">&copy; 2026 Project-01. Todos os direitos reservados.</p>
      </footer>

    </div>
  );
}