import Link from "next/link";

export default function DashboardPage() {
  const categories = [
    { name: "Dashboard", href: "/dashboard" },
    { name: "Contratos", href: "/contratos" },
    { name: "Atividades", href: "/atividades" },
    { name: "Evidências", href: "/evidencias" },
    { name: "Relatórios", href: "/relatorios" },
    { name: "Usuários/Administração", href: "/admin/usuarios" },
  ];

  return (
    <div className="min-h-screen flex bg-background text-foreground font-sans">
      
      {/* Sidebar à Esquerda */}
      <aside className="w-64 border-r border-brand-green/20 bg-background/50 backdrop-blur-md hidden md:flex flex-col justify-between p-6 sticky top-0 h-screen">
        <div>
          {/* Logo / Título */}
          <Link href="/" className="flex items-center gap-2 mb-10 group">
            <img 
              src="/favicon.ico" 
              alt="Ícone PRD" 
              className="h-8 w-8 object-contain rounded-md"
            />
            <span className="font-bold text-2xl tracking-wide text-brand-neon group-hover:opacity-90 transition-opacity">
              PRD
            </span>
          </Link>

          {/* Menu de Categorias */}
          <nav className="space-y-2">
            {categories.map((item) => {
              const isActive = item.href === "/dashboard";
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-green text-background font-semibold"
                      : "text-foreground/80 hover:bg-brand-darkgreen/40 hover:text-brand-green"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

      </aside>

      {/* Conteúdo Principal à Direita */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Topbar com Botão de Logout */}
        <header className="h-20 border-b border-brand-green/20 bg-background/80 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-40">
          <h1 className="text-xl font-bold text-foreground">Dashboard Geral</h1>

          <div className="flex items-center gap-4">
            {/* Botão de Logout */}
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Sair
            </Link>
          </div>
        </header>

        {/* Corpo da Página */}
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-5xl mx-auto space-y-6">
            
            <div className="p-6 rounded-2xl bg-brand-darkgreen/40 border border-brand-green/30 backdrop-blur-md">
              <h2 className="text-lg font-semibold text-brand-neon mb-2">Bem-vindo ao Painel</h2>
              <p className="text-sm text-foreground/70">
                Aqui você acompanhará a gestão de execução contratual, indicadores e relatórios da Etapa 1.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Contratos Ativos</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">0</p>
              </div>
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Entregáveis Pendentes</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">0</p>
              </div>
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Avanço Médio</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">0%</p>
              </div>
            </div>

          </div>
        </main>

      </div>
    </div>
  );
}